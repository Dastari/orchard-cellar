import { describe, expect, it } from 'vitest';
import { createMockAdminApi } from '../../admin/api.js';
import { RemedyPlaybookModel, type MissingContainerRemedyApi } from './model.js';

const ids = (() => { let id = 0; return () => `playbook-test-${++id}`; })();

async function finish(model: RemedyPlaybookModel): Promise<void> {
  while (!model.snapshot().complete) await model.advance();
}

describe('RemedyPlaybookModel', () => {
  it('runs player-stuck inspect, preview, commit and verification in strict order', async () => {
    const model = new RemedyPlaybookModel(createMockAdminApi(), null, ids);
    model.start({ playbookId: 'player_stuck', targetIdentity: 'identity-ada' }, 'Player reported blocked movement');
    await finish(model);
    const state = model.snapshot();
    expect(state.steps.map(({ kind, status }) => [kind, status])).toEqual([
      ['inspect', 'complete'], ['preview', 'complete'], ['commit', 'complete'], ['verify', 'complete'],
    ]);
    expect(state.auditId).toMatch(/^mock-audit-/u);
    expect(state.notice).toContain('unstick');
  });

  it('runs a capacity-aware lost-item refund through the same preview token', async () => {
    const model = new RemedyPlaybookModel(createMockAdminApi(), null, ids);
    model.start({ playbookId: 'lost_items_after_crash', targetIdentity: 'identity-bea', stacks: [{ itemKind: 'apple', quantity: 2 }] }, 'Crash recovery ticket 42');
    await finish(model);
    expect(model.snapshot()).toMatchObject({ complete: true, error: null });
    expect(model.snapshot().steps[1]?.detail).toContain('previewed');
  });

  it('restores a missing chest from audited custody and verifies exact reappearance', async () => {
    const calls: string[] = [];
    const containers: MissingContainerRemedyApi = {
      inspectMissingContainer: async ({ entityId, targetIdentity }) => {
        calls.push('inspect'); return { entityId, targetIdentity, recoverable: true, auditId: 'audit-gone', summary: 'Found despawn inverse with two slots.', version: 'world-v7' };
      },
      previewRestoreMissingContainer: async () => {
        calls.push('preview'); return { token: 'container-preview-1', baseVersion: 'world-v7', preview: { changes: [{ path: '/entities/chest-7', before: { present: false }, after: { present: true, value: { restored: true } } }], truncated: false }, warnings: [] };
      },
      commitRestoreMissingContainer: async ({ token, expectedBaseVersion }) => {
        calls.push(`commit:${token}:${expectedBaseVersion}`); return { committed: true, version: 'world-v8', auditId: 'audit-restored', notice: 'Chest restored.' };
      },
      verifyRestoredContainer: async (entityId, expectedVersion) => {
        calls.push(`verify:${entityId}:${expectedVersion}`); return true;
      },
    };
    const model = new RemedyPlaybookModel(createMockAdminApi(), containers, ids);
    model.start({ playbookId: 'chest_disappeared', targetIdentity: 'identity-cy', entityId: 'chest-7' }, 'Restore missing chest from audit');
    await finish(model);
    expect(calls).toEqual(['inspect', 'preview', 'commit:container-preview-1:world-v7', 'verify:chest-7:world-v8']);
    expect(model.snapshot()).toMatchObject({ complete: true, auditId: 'audit-restored', notice: 'Chest restored.' });
  });

  it('rejects an invalid reason before any inspection', () => {
    const model = new RemedyPlaybookModel(createMockAdminApi());
    expect(() => model.start({ playbookId: 'player_stuck', targetIdentity: 'identity-ada' }, 'short')).toThrow('admin_invalid_reason');
    expect(model.snapshot().input).toBeNull();
  });
});
