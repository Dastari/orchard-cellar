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

describe('W5 world validation and repair registration', () => {
  it('registers additive runtime flags and caller-private immutable reports', () => {
    const tables = between('const space_admin_flag = table(', '// --- end docs/55 lane 55-C tables ---');
    expect(tables).toContain("name: 'space_admin_flag', public: true");
    expect(tables).toContain("name: 'admin_world_validation_report'");
    expect(tables).toContain("columns: ['actor']");
    expect(tables).toContain('fingerprint: t.string()');
    expect(source).toContain('space_admin_flag,');
    expect(source).toContain('admin_world_validation_report,');
    expect(source).toContain('ctx.db.admin_world_validation_report.by_actor.filter(ctx.sender)');
  });

  it('validates a bounded snapshot and persists a server-owned repair receipt', () => {
    const procedure = between('export const adminValidateWorld = spacetimedb.procedure(', '// requestLastConnections');
    expect(procedure).toContain('requireAdminProcedure(tx)');
    expect(procedure).toContain('planAdminValidateWorld(');
    expect(procedure).toContain('tx.db.admin_world_validation_report.insert(row)');
    expect(procedure).toContain('adminValidateWorldRowsScanned=');
  });

  it('routes all mutations through exact preview, authority, audit and notice checks', () => {
    for (const name of ['adminSetSpaceFlags', 'adminRepairPortalPair', 'adminRunWorldRepair']) {
      const registration = between(`export const ${name} = spacetimedb.reducer(`, '\n);');
      expect(registration).toContain('executeAdminWorldMutation(ctx, {');
    }
    const execution = between('function executeAdminWorldMutation(', 'function adminWorldMutationBase(');
    expect(execution).toContain('requireAdminWorldAuthority(role, mutation)');
    expect(execution).toContain('boundedAdminWorldState(loadAdminWorldState(ctx))');
    expect(execution).toContain('existing.fingerprint !== previewFingerprint');
    expect(execution).toContain('payload: serializeAdminAuditPayload(plan.audit)');
    expect(execution).toContain("insertSessionChatNotice(ctx, presence.identity, presence.connectionId, 'admin', plan.notice)");
  });

  it('applies only additive or custody-safe repairs and never deletes legacy world rows', () => {
    const writer = between('function writeAdminWorldRepairAction(', 'function executeAdminWorldMutation(');
    expect(writer).toContain("action.kind === 'insert_portal'");
    expect(writer).toContain("action.kind === 'clear_custody'");
    expect(writer).toContain("action.kind === 'set_space_flags'");
    expect(writer).not.toContain('.delete(');
    expect(writer).toContain("throw new SenderError('admin_invalid_patch')");
  });

  it('enforces runtime build and owner-only overrides', () => {
    expect(source).toContain("effectiveSpaceAdminBoolean(ctx, position.spaceId, 'buildAllowed') === false");
    expect(source).toContain("effectiveSpaceAdminBoolean(ctx, portal.toSpace, 'ownerOnly')");
  });
});
