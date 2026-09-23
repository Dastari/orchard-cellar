import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../index.ts', import.meta.url), 'utf8');

function between(start: string, end: string): string {
  const from = source.indexOf(start);
  expect(from, start).toBeGreaterThanOrEqual(0);
  const to = source.indexOf(end, from + start.length);
  expect(to, end).toBeGreaterThan(from);
  return source.slice(from, to);
}

describe('W4 object/container reducer registration', () => {
  it('routes all nine operations through one receipt and authority path', () => {
    for (const name of [
      'adminSpawnEntity', 'adminDespawnEntity', 'adminMoveEntity', 'adminSetEntityState',
      'adminSetContainerSlot', 'adminRepairEntity', 'adminReplaceEntity',
      'adminRelocateNpc', 'adminRespawnResources',
    ]) {
      const registration = between(`export const ${name} = spacetimedb.reducer(`, '\n);');
      expect(registration).toContain('executeAdminObjectMutation(ctx,');
    }
    const execution = between('function executeAdminObjectMutation(', 'function adminObjectMutationBase(');
    expect(execution).toContain('requireAdminObjectAuthority(role, mutation)');
    expect(execution).toContain("mutation.dryRun && expectedBaseVersion === ''");
    expect(execution).toContain('adminObjectVersion(loaded) : expectedBaseVersion');
    expect(execution).toContain('planAdminObjectMutation(loaded, {');
    expect(execution).toContain('existing.fingerprint !== previewFingerprint');
    expect(execution).toContain('writeAdminObjectPlan(ctx, mutation, plan)');
    expect(execution).toContain('payload: serializeAdminAuditPayload(plan.audit)');
    expect(execution).not.toContain("!mutation.dryRun && expectedBaseVersion === ''");
    const planner = readFileSync(new URL('./objects.ts', import.meta.url), 'utf8');
    expect(planner).toContain('if (request.expectedBaseVersion !== baseVersion) fail(\'admin_preview_stale\')');
  });

  it('restores missing containers only from an authorized audited preview', () => {
    const procedure = between('export const adminMissingContainerRecovery = spacetimedb.procedure(',
      'export const adminEntitiesInArea = spacetimedb.procedure(');
    expect(procedure).toContain("requireAdminProcedure(tx, 'operate.players')");
    expect(procedure).toContain('latestMissingContainerAuditSource(tx, entityId, targetIdentity)');
    const reducer = between('export const adminRestoreMissingContainer = spacetimedb.reducer(',
      '// --- end docs/56 lane 56-W4');
    const execution = between('function executeMissingContainerRecovery(',
      'export const adminRestoreMissingContainer = spacetimedb.reducer(');
    expect(reducer).toContain('executeMissingContainerRecovery(ctx, input)');
    expect(execution).toContain("adminRoleCanMutate(role, 'restore_missing_container')");
    expect(execution).toContain('planMissingContainerRecovery({');
    expect(execution).toContain('existing.fingerprint !== input.previewFingerprint');
    expect(execution).toContain('writeMissingContainerRecovery(ctx, plan)');
    expect(execution).toContain('payload: serializeAdminAuditPayload(plan.audit)');
  });

  it('preserves container and processor custody except on explicit despawn', () => {
    const writer = between('function writeAdminObjectPlan(', 'function executeAdminObjectMutation(');
    expect(writer).toContain('mutation.spillContents');
    expect(writer).toContain('dropWorldItemStack(ctx, {');
    expect(writer).toContain('ctx.db.world_chest_slot.by_chest.filter(id)');
    expect(writer).toContain("mutation.operation === 'replace_entity'");
    expect(writer).not.toContain('ensureChestStorageRows');
  });
});

describe('Phase 5 client-error authority registration', () => {
  it('keeps reports private, immutable, authenticated, idempotent, and retained', () => {
    const table = between('const client_error_report = table(', '// --- docs/55 lane 55-C');
    expect(table).not.toContain('public: true');
    expect(table).toContain("columns: ['occurredAtMicros']");
    expect(source).toContain('client_error_report,');
    const reporter = between('export const reportClientError = spacetimedb.reducer(', 'const adminInventoryMutationEnvelope');
    expect(reporter).toContain('requireAuthorizedSender(');
    expect(reporter).toContain('ctx.db.client_error_report.id.find(id)');
    expect(reporter).toContain('planClientErrorReport(input, recent');
    expect(reporter).toContain('ctx.db.client_error_report.insert(');
    expect(reporter).not.toContain('.update(');
    expect(source).toContain('clientErrorExpired(report.occurredAtMicros, nowMicros)');
  });

  it('exposes only an owner/admin bounded Observe procedure', () => {
    const procedure = between('export const adminClientErrors = spacetimedb.procedure(', 'export const adminTelemetry');
    expect(procedure).toContain('requireAdminProcedure(tx)');
    expect(procedure).toContain('limit > 100');
    expect(procedure).toContain('ADMIN_PROCEDURE_SCAN_LIMIT');
    expect(procedure).toContain('afterMicros');
    expect(procedure).toContain('afterId');
  });
});
