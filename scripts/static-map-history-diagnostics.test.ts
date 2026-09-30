import { describe, expect, it } from 'vitest';
import { ADMIN_ERROR_CODES } from '../packages/world/src/admin/contracts.js';
import { PipelineError } from './world-chunks-publish.js';
import { SHADOW_PUBLICATION_REFUSAL_CODES } from '../packages/world/src/content/chunk-shadow-runtime.js';
import { historyFailure, historyPhase, type HistoryPhaseEvent } from './static-map-history-diagnostics.js';

describe('bounded static history diagnostics (BUG-073)', () => {
  it.each([
    [new Error('chunk_history_not_backfilled'), 'chunk_history_not_backfilled', 'error'],
    ['chunk_history_not_backfilled', 'chunk_history_not_backfilled', 'sdk-string'],
    ['Procedure failed: chunk_history_audit_document_mismatch', 'chunk_history_audit_document_mismatch', 'sdk-string'],
    [new PipelineError('retire_audit_documents_timeout', 1, 'private-body-marker'), 'retire_audit_documents_timeout', 'pipeline-error'],
  ])('recognizes only an exact known code from Error, SDK string or pipeline code', (error, code, errorKind) => {
    expect(historyFailure(error)).toEqual({ code, errorKind, phase: 'unclassified' });
    expect(JSON.stringify(historyFailure(error))).not.toContain('private-body-marker');
  });

  it('redacts unknown text, bodies, credentials and lookalike code suffixes', () => {
    for (const error of [new Error('Bearer private-token-marker {"documentJson":"private-body-marker"}'),
      'chunk_history_not_backfilled_private-token-marker', { message: 'chunk_history_not_backfilled', token: 'private-token-marker' }]) {
      const failure = historyFailure(error);
      expect(failure.code).toBe('static_history_rehearsal_failed');
      expect(JSON.stringify(failure)).not.toMatch(/private-token-marker|private-body-marker|documentJson|Bearer/u);
    }
    expect(historyFailure(new Error('chunk_document_records_incomplete: private-body-marker')).code).toBe('chunk_document_records_incomplete');
  });

  it('bounds message/cause inspection and never serializes a cause', () => {
    expect(historyFailure(new Error(`${'x'.repeat(2048)} chunk_history_not_backfilled`)).code).toBe('static_history_rehearsal_failed');
    expect(historyFailure(new Error('private-body-marker', { cause: 'chunk_history_not_backfilled' })).code).toBe('chunk_history_not_backfilled');
    const cyclic = new Error('private-token-marker'); cyclic.cause = cyclic;
    expect(historyFailure(cyclic).code).toBe('static_history_rehearsal_failed');
    let deep: unknown = 'chunk_history_not_backfilled';
    for (let index = 0; index < 5; index += 1) deep = new Error('private-body-marker', { cause: deep });
    expect(historyFailure(deep).code).toBe('static_history_rehearsal_failed');
  });

  it('recognizes the finite real staging and archive publication refusals', () => {
    for (const code of [...ADMIN_ERROR_CODES, ...SHADOW_PUBLICATION_REFUSAL_CODES, 'chunk_stage_quota_exceeded', 'chunk_asset_revision_changed']) {
      expect(historyFailure(new Error(`${code}: private-body-marker`)).code).toBe(code);
    }
  });

  it('retains the inner failing row/phase and emits no successful completion for it', async () => {
    const progress: HistoryPhaseEvent[] = [];
    const checkpoint = (entry: HistoryPhaseEvent) => progress.push(entry);
    const promise = historyPhase('history-backfill', () => historyPhase('history-verify-server',
      () => { throw 'chunk_history_document_mismatch'; }, checkpoint, { id: '20481', revision: 13 }), checkpoint);
    const error = await promise.catch(value => value as unknown);
    expect(historyFailure(error)).toEqual({ code: 'chunk_history_document_mismatch', errorKind: 'sdk-string',
      phase: 'history-verify-server', historyId: '20481', revision: 13 });
    expect(progress).toEqual([
      { stage: 'phase', phase: 'history-backfill', status: 'start' },
      { stage: 'phase', phase: 'history-verify-server', status: 'start', historyId: '20481', revision: 13 },
    ]);
  });

  it('bounds restore attempt metadata independently from error text', async () => {
    for (const attempt of [0, 6, 1.5, Infinity]) {
      const error = await historyPhase('history-restore-commit', () => { throw new Error('admin_role_forbidden'); }, undefined, undefined, attempt).catch(value => value as unknown);
      expect(historyFailure(error)).not.toHaveProperty('attempt');
    }
  });

  it('bounds row metadata and completes successful phases without changing their values', async () => {
    const progress: HistoryPhaseEvent[] = [];
    expect(await historyPhase('history-archive', () => 42, entry => progress.push(entry), { id: '18446744073709551616', revision: 13 })).toBe(42);
    expect(progress).toEqual([{ stage: 'phase', phase: 'history-archive', status: 'start' },
      { stage: 'phase', phase: 'history-archive', status: 'complete' }]);
    const error = await historyPhase('history-archive', () => { throw new Error('private-body-marker'); }, undefined,
      { id: 'private-token-marker', revision: 13 }).catch(value => value as unknown);
    expect(historyFailure(error)).toEqual({ code: 'static_history_rehearsal_failed', errorKind: 'error', phase: 'history-archive' });
  });
});
