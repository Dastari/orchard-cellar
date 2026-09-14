import { describe, expect, it } from 'vitest';
import type { AdminReason } from '../../../../world/src/admin/contracts.js';
import { MockAdminWorldApi } from '../../admin/world-api.js';

const reason = 'Valid world administration reason' as AdminReason;

describe('AdminWorldApi sandbox adapter', () => {
  it('rejects stale base versions and altered commit fingerprints', async () => {
    const api = new MockAdminWorldApi(); const snapshot = await api.snapshot();
    const mutation = { draft: { operation: 'set_time' as const, calendarTick: '43000' }, reason,
      clientMutationId: 'mutation-12345678', dryRun: true };
    await expect(api.mutate(mutation, 'world-v0', null, null)).rejects.toThrow('admin_world_revision_conflict');
    await api.mutate(mutation, snapshot.worldVersion, null, null);
    await expect(api.mutate({ ...mutation, dryRun: false }, snapshot.worldVersion, 'preview:altered', null))
      .rejects.toThrow('admin_preview_required');
  });

  it('requires the exact caller-private validation report fingerprint', async () => {
    const api = new MockAdminWorldApi(); const report = await api.validateWorld();
    const mutation = { draft: { operation: 'run_world_repair' as const, reportId: report.reportId }, reason,
      clientMutationId: 'repair-12345678', dryRun: true };
    await expect(api.mutate(mutation, report.worldVersion, null, 'report:wrong')).rejects.toThrow('admin_preview_required');
    const preview = await api.mutate(mutation, report.worldVersion, null, report.fingerprint);
    const result = await api.mutate({ ...mutation, dryRun: false }, report.worldVersion,
      preview.preview.fingerprint, report.fingerprint);
    expect(result.committed).toBe(true);
  });
});
