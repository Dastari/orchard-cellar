import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../index.ts', import.meta.url), 'utf8');

function between(start: string, end: string): string {
  const from = source.indexOf(start);
  expect(from, start).toBeGreaterThanOrEqual(0);
  const to = source.indexOf(end, from + start.length);
  expect(to, end).toBeGreaterThan(from);
  return source.slice(from, to);
}

describe('U5 exact world-control registration', () => {
  it('routes all seven writes through one planner-backed authority path', () => {
    for (const name of [
      'adminSetTime', 'adminSetWeather', 'adminSetWind', 'adminSetMotd',
      'adminGlobalNotice', 'adminRestoreMap', 'adminMoveHomesteadExact',
    ]) {
      const registration = between(`export const ${name} = spacetimedb.reducer(`, '\n);');
      expect(registration).toContain('executeAdminWorldControlMutation(ctx, {');
    }
    const execution = between('function executeAdminWorldControlMutation(', 'const adminWorldControlEnvelope');
    expect(execution).toContain('requireAdminWorldControlAuthority(role, mutation)');
    expect(execution).toContain("mutation.dryRun && expectedBaseVersion === ''");
    expect(execution).toContain('adminWorldControlVersion(loaded) : expectedBaseVersion');
    expect(execution).toContain('planAdminWorldControlMutation(loaded, {');
  });

  it('requires the caller-private exact receipt for commit and consumes it once', () => {
    const execution = between('function executeAdminWorldControlMutation(', 'const adminWorldControlEnvelope');
    expect(execution).toContain('existing.clientMutationId !== mutation.clientMutationId');
    expect(execution).toContain('existing.baseVersion !== expectedBaseVersion');
    expect(execution).toContain('existing.fingerprint !== previewFingerprint');
    expect(execution).toContain("throw new SenderError('admin_preview_required')");
    expect(execution).toContain("throw new SenderError('admin_preview_stale')");
    expect(execution).toContain('ctx.db.admin_mutation_preview.id.delete(previewId)');
  });

  it('applies every planned action transactionally, audits it, and notifies active clients', () => {
    const writer = between('function writeAdminWorldControlAction(', 'function executeAdminWorldControlMutation(');
    for (const kind of ['set_environment', 'set_wind', 'set_motd', 'global_notice', 'restore_map']) {
      expect(writer).toContain(`action.kind === '${kind}'`);
    }
    expect(writer).toContain('commitLiveMapSnapshot(ctx, document');
    expect(writer).toContain('ctx.db.homestead.spaceId.update');
    expect(writer).toContain('ctx.db.space_portal.id.update');
    const execution = between('function executeAdminWorldControlMutation(', 'const adminWorldControlEnvelope');
    expect(execution).toContain('payload: serializeAdminAuditPayload(plan.audit)');
    expect(execution).toContain("insertSessionChatNotice(ctx, presence.identity, presence.connectionId, 'admin', noticeBody)");
  });

  it('has generated typed bindings for the complete surface', () => {
    for (const file of [
      'admin_set_time_reducer.ts', 'admin_set_weather_reducer.ts', 'admin_set_wind_reducer.ts',
      'admin_set_motd_reducer.ts', 'admin_global_notice_reducer.ts', 'admin_restore_map_reducer.ts',
      'admin_move_homestead_exact_reducer.ts',
    ]) {
      expect(existsSync(new URL(`../../../world-bindings/src/${file}`, import.meta.url)), file).toBe(true);
    }
  });
});
