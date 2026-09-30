import { describe, expect, it, vi } from 'vitest';
import { SenderError } from 'spacetimedb';
import { parseAdminReason } from '../packages/world/src/admin/contracts.js';
import { adminWorldControlVersion, planAdminWorldControlMutation, type AdminWorldControlState } from '../packages/world/src/admin/world-controls.js';
import { historyFailure, type HistoryPhaseEvent } from './static-map-history-diagnostics.js';
import { PipelineError } from './world-chunks-publish.js';
import { HISTORY_RESTORE_ATTEMPTS, restoreHistoryWithPreview, type HistoryRestoreEnvelope, type HistoryRestorePort } from './static-map-history-restore.js';

function fixture(advance: 'once' | 'always' | 'never' | 'clock' = 'once') {
  let state: AdminWorldControlState = { authorityTick: '1000', calendarTick: '1200', cropCalendarOffset: '200',
    weatherMode: 'auto', windDirection: 'auto', motd: 'Welcome.', globalNoticeSequence: '0',
    homesteadSiteAllowed: false, homestead: null,
    mapHead: { revisionId: '13', mapId: 'live-island', revision: 13, contentHash: 'current', documentJson: '{"id":"live-island","revision":13}' },
    restoreRevision: { revisionId: '1', mapId: 'live-island', revision: 1, contentHash: 'older', documentJson: '{"id":"live-island","revision":1}' } };
  let commits = 0;
  let successful: { mutationId: string; inverseRevisionId: string } | undefined;
  const mutation = (input: HistoryRestoreEnvelope, dryRun: boolean) => {
    const reason = parseAdminReason(input.reason);
    if (!reason.ok) throw new SenderError(reason.error);
    return { ...input, revisionId: input.revisionId.toString(), reason: reason.value, dryRun, operation: 'restore_map' as const };
  };
  const port = {
    preview: vi.fn(async (input: HistoryRestoreEnvelope) => {
      const plan = planAdminWorldControlMutation(state, { mutation: mutation(input, true),
        expectedBaseVersion: adminWorldControlVersion(state, 'restore_map'), previewFingerprint: null, nowMicros: 1n });
      return { baseVersion: plan.baseVersion, fingerprint: plan.previewFingerprint };
    }),
    commit: vi.fn(async (input: HistoryRestoreEnvelope, preview: { baseVersion: string; fingerprint: string }) => {
      commits += 1;
      if (advance === 'clock' || advance === 'always' || advance === 'once' && commits === 1) state = { ...state,
        ...(advance === 'clock' ? {} : { motd: `${state.motd}!` }),
        authorityTick: (BigInt(state.authorityTick) + 1n).toString(), calendarTick: (BigInt(state.calendarTick) + 1n).toString() };
      try {
        const plan = planAdminWorldControlMutation(state, { mutation: mutation(input, false), expectedBaseVersion: preview.baseVersion,
          previewFingerprint: preview.fingerprint, nowMicros: 2n });
        successful = { mutationId: input.clientMutationId, inverseRevisionId: plan.audit.inverse!.args['revisionId'] as string };
        state = plan.after;
      } catch (error) { throw new SenderError((error as Error).message); }
    }),
    audit: vi.fn(async (clientMutationId: string) => {
      expect(successful?.mutationId).toBe(clientMutationId);
      return { auditId: '101', inverseRevisionId: successful!.inverseRevisionId };
    }),
  } satisfies HistoryRestorePort;
  return port;
}

describe('isolated history restore preview retry (BUG-074)', () => {
  it('reproduces a real planner retained-field conflict and obtains the exact successful audited inverse after a fresh preview', async () => {
    const port = fixture(); const events: HistoryPhaseEvent[] = [];
    expect(await restoreHistoryWithPreview(1n, port, entry => events.push(entry), { id: '1', revision: 1 }))
      .toEqual({ auditId: '101', inverseRevisionId: '13' });
    expect(port.preview).toHaveBeenCalledTimes(2); expect(port.commit).toHaveBeenCalledTimes(2); expect(port.audit).toHaveBeenCalledOnce();
    const inputs = port.preview.mock.calls.map(call => call[0]);
    expect(inputs[0]!.clientMutationId).not.toBe(inputs[1]!.clientMutationId);
    expect(port.commit.mock.calls.map(call => call[0])).toEqual(inputs);
    expect(port.audit).toHaveBeenCalledWith(inputs[1]!.clientMutationId);
    expect(events).toContainEqual({ stage: 'phase', phase: 'history-restore-commit', status: 'start', historyId: '1', revision: 1, attempt: 1 });
    expect(events).not.toContainEqual(expect.objectContaining({ phase: 'history-restore-commit', status: 'complete', attempt: 1 }));
    expect(events).toContainEqual(expect.objectContaining({ phase: 'history-restore-audit', status: 'complete', attempt: 2 }));
  });

  it('commits through actual clock advancement without retry after the scoped product guard fix', async () => {
    const port = fixture('clock');
    expect(await restoreHistoryWithPreview(1n, port)).toEqual({ auditId: '101', inverseRevisionId: '13' });
    expect(port.preview).toHaveBeenCalledOnce(); expect(port.commit).toHaveBeenCalledOnce(); expect(port.audit).toHaveBeenCalledOnce();
  });

  it('bounds repeated real retained-field conflicts and reports the final definite rejection without obtaining an inverse', async () => {
    const port = fixture('always');
    const error = await restoreHistoryWithPreview(1n, port, undefined, { id: '1', revision: 1 }).catch(value => value as unknown);
    expect(historyFailure(error)).toEqual({ code: 'admin_world_revision_conflict', errorKind: 'sender-error',
      phase: 'history-restore-commit', historyId: '1', revision: 1, attempt: HISTORY_RESTORE_ATTEMPTS });
    expect(port.preview).toHaveBeenCalledTimes(HISTORY_RESTORE_ATTEMPTS); expect(port.commit).toHaveBeenCalledTimes(HISTORY_RESTORE_ATTEMPTS);
    expect(new Set(port.preview.mock.calls.map(call => call[0].clientMutationId)).size).toBe(HISTORY_RESTORE_ATTEMPTS);
    expect(port.audit).not.toHaveBeenCalled();
  });

  it.each([
    new SenderError('admin_auth_required'), new SenderError('admin_role_forbidden'), new SenderError('admin_preview_required'),
    new SenderError('admin_preview_stale'), new SenderError('unknown_failure'), new PipelineError('static_history_rehearsal_restore_timeout'),
    new Error('admin_world_revision_conflict'), 'admin_world_revision_conflict',
    new SenderError('unknown failure: {"documentJson":"admin_world_revision_conflict private-body-marker"}'),
  ])('never retries a non-definitive conflict or other commit failure', async failure => {
    const port = fixture('never'); port.commit.mockRejectedValueOnce(failure);
    const error = await restoreHistoryWithPreview(1n, port).catch(value => value as unknown);
    expect(historyFailure(error).phase).toBe('history-restore-commit');
    expect(JSON.stringify(historyFailure(error))).not.toContain('private-body-marker');
    expect(port.preview).toHaveBeenCalledOnce(); expect(port.commit).toHaveBeenCalledOnce(); expect(port.audit).not.toHaveBeenCalled();
  });

  it('refuses an altered fingerprint through the actual planner without retry', async () => {
    const port = fixture('never'); const realPreview = port.preview.getMockImplementation()!;
    port.preview.mockImplementationOnce(async input => ({ ...await realPreview(input), fingerprint: 'preview:invalid' }));
    const error = await restoreHistoryWithPreview(1n, port).catch(value => value as unknown);
    expect(historyFailure(error)).toMatchObject({ phase: 'history-restore-commit', code: 'admin_preview_required', attempt: 1 });
    expect(port.preview).toHaveBeenCalledOnce(); expect(port.audit).not.toHaveBeenCalled();
  });

  it('never retries preview or post-commit audit errors even when they mention a definite conflict', async () => {
    const preview = fixture('never'); preview.preview.mockRejectedValueOnce(new SenderError('admin_world_revision_conflict'));
    const previewError = await restoreHistoryWithPreview(1n, preview).catch(value => value as unknown);
    expect(historyFailure(previewError).phase).toBe('history-restore-preview'); expect(preview.preview).toHaveBeenCalledOnce(); expect(preview.commit).not.toHaveBeenCalled();
    const audit = fixture('never'); audit.audit.mockRejectedValueOnce(new SenderError('admin_world_revision_conflict'));
    const auditError = await restoreHistoryWithPreview(1n, audit).catch(value => value as unknown);
    expect(historyFailure(auditError).phase).toBe('history-restore-audit'); expect(audit.commit).toHaveBeenCalledOnce(); expect(audit.audit).toHaveBeenCalledOnce();
  });
});
