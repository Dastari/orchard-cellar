import { describe, expect, it } from 'vitest';
import { MockAdminWorldApi } from '../../admin/world-api.js';
import type { AdminWorldApi } from '../../admin/world-api.js';
import { WorldControlModel, worldMutationEnabled } from './model.js';

describe('WorldControlModel', () => {
  it('loads bounded spaces, navigates issues, and requires explicit safe selection', async () => {
    const model = new WorldControlModel(new MockAdminWorldApi(), 'admin', () => 'mutation-12345678');
    await model.load(); await model.validate();
    expect(model.snapshot().world?.spaces).toHaveLength(2);
    expect(model.snapshot().world?.portals).toHaveLength(1);
    expect(model.snapshot().report?.issues).toHaveLength(2);
    model.navigateIssue(99); expect(model.snapshot().activeIssue).toBe(1);
    model.toggleSafeIssue(0);
    model.setReason('Investigating missing portal pair');
    await expect(model.previewSelectedRepair()).rejects.toThrow('admin_safe_selection_incomplete');
  });

  it('binds report, world version and fingerprint from preview through commit', async () => {
    const api = new MockAdminWorldApi();
    const model = new WorldControlModel(api, 'owner', () => 'mutation-12345678');
    await model.load(); const report = await model.validate();
    model.setReason('Repairing validated world state');
    const preview = await model.previewSelectedRepair();
    expect(preview.baseVersion).toBe(report.worldVersion);
    expect(preview.fingerprint).toMatch(/^preview:/u);
    const result = await model.commit();
    expect(result).toMatchObject({ committed: true, auditId: 'world-audit-1' });
    expect(model.snapshot().world?.worldVersion).not.toBe(report.worldVersion);
  });

  it('previews and commits existing environment controls with the same receipt contract', async () => {
    const model = new WorldControlModel(new MockAdminWorldApi(), 'admin', () => 'weather-12345678');
    await model.load(); model.setReason('Pinning rain for event setup');
    const preview = await model.preview({ operation: 'set_weather', weatherMode: 'rain' });
    expect(preview.preview.changes).toHaveLength(1);
    await model.commit();
    expect(model.snapshot().world?.environment.weatherMode).toBe('rain');
  });

  it('commits the authority-discovered world-control base instead of the validation snapshot version', async () => {
    const seed = new MockAdminWorldApi();
    const world = await seed.snapshot();
    const bases: string[] = [];
    const api: AdminWorldApi = {
      source: 'live',
      snapshot: async () => world,
      validateWorld: async () => seed.validateWorld(),
      mutate: async (mutation, expectedWorldVersion) => {
        bases.push(expectedWorldVersion);
        const preview = { operation: mutation.draft.operation, target: { kind: 'world' as const },
          baseVersion: 'world-control:authority-exact', preview: { changes: [], truncated: false }, warnings: [],
          expiresAtMicros: '9999999999999999', fingerprint: 'preview:authority-exact' };
        return { preview, committed: !mutation.dryRun, worldVersion: 'world-control:committed',
          auditId: mutation.dryRun ? null : 'audit-u5', notice: mutation.dryRun ? null : 'World updated.' };
      },
    };
    const model = new WorldControlModel(api, 'owner', () => 'time-authority-12345678');
    await model.load(); model.setReason('Setting exact festival time');
    await model.preview({ operation: 'set_time', calendarTick: '43000' });
    await model.commit();
    expect(bases).toEqual([world.worldVersion, 'world-control:authority-exact']);
    expect(model.snapshot().lastResult).toMatchObject({ committed: true, auditId: 'audit-u5' });
  });

  it('fails closed for non-administrative roles', async () => {
    expect(worldMutationEnabled('support')).toBe(false);
    const model = new WorldControlModel(new MockAdminWorldApi(), 'content_editor');
    await model.load(); model.setReason('Attempting a world write safely');
    await expect(model.preview({ operation: 'set_motd', body: 'No' })).rejects.toThrow('admin_role_forbidden');
  });
});
