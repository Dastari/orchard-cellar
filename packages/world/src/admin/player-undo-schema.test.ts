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

describe('live audited player undo registration', () => {
  it('registers durable exact-result and single-use undo receipts', () => {
    const tables = between('const admin_player_mutation_commit = table(', '/** Additive operational overrides');
    expect(tables).toContain("name: 'admin_player_mutation_commit'");
    expect(tables).toContain("name: 'admin_player_undo'");
    expect(tables).toContain('sourceAuditId: t.u64().primaryKey()');
    expect(source).toContain('admin_player_mutation_commit,');
    expect(source).toContain('admin_player_undo,');
  });

  it('resolves caller-only commit results by primary key rather than audit scans', () => {
    const procedure = between('export const adminPlayerMutationResult = spacetimedb.procedure(', '\n);');
    expect(procedure).toContain('requirePlayerAdminResultRead(tx)');
    expect(procedure).toContain('tx.db.admin_player_mutation_commit.id.find(');
    expect(procedure).toContain('tx.db.world_admin_audit.id.find(receipt.auditId)');
    expect(procedure).toContain('audit: adminAuditRow(adminAuditStorageRow(audit))');
  });

  it('checks reason, role, target, source audit and idempotency before applying an inverse', () => {
    const reducer = between('export const adminUndoPlayer = spacetimedb.reducer(', '// --- docs/56 lane 56-W4');
    expect(reducer).toContain('validatedAdminMutationReason(input.reason, input.clientMutationId)');
    expect(reducer).toContain('planAdminPlayerUndoGuard({');
    expect(reducer).toContain('ctx.db.admin_player_mutation_commit.id.find(commitId)');
    expect(reducer).toContain('ctx.db.admin_player_undo.sourceAuditId.find(input.auditId)');
    expect(reducer).toContain("targetIdentity: parsed.value.target.kind === 'player' ? parsed.value.target.identity : null");
    expect(reducer).toContain("role === 'support'");
    expect(reducer).toContain('actorIdentity: source.actor.toHexString()');
  });

  it('atomically restores, audits, marks single-use and notifies online sessions', () => {
    const reducer = between('export const adminUndoPlayer = spacetimedb.reducer(', '// --- docs/56 lane 56-W4');
    expect(reducer).toContain('writeAdminInventoryState(ctx, target, loadedInventory, action.state)');
    expect(reducer).toContain('writeAdminProgressionState(ctx, target, action.state');
    expect(reducer).toContain('writeAdminPositionPlan(ctx, target, plan)');
    expect(reducer).toContain("operation: 'undo'");
    expect(reducer).toContain('changes: parsed.value.changes.map(({ path, before, after }) => ({ path, before: after, after: before }))');
    expect(reducer).toContain('inverse: null');
    expect(reducer).toContain('sourceAuditId: input.auditId');
    expect(reducer).toContain('ctx.db.admin_player_undo.insert({');
    expect(reducer).toContain('ctx.db.connection_presence_v2.by_identity.filter(target)');
    expect(reducer).toContain("insertSessionChatNotice(ctx, target, presence.connectionId, 'admin', notice)");
    const progressionWriter = between('function writeAdminProgressionState(', '/** Version 22 centered');
    expect(progressionWriter).toContain('ctx.db.player_skill_node.id.delete(row.id)');
    expect(progressionWriter).toContain('ctx.db.player_skill_node.id.update({ ...row, ...next })');
    expect(progressionWriter).toContain('ctx.db.player_skill_node.insert({');
    expect(progressionWriter).toContain('ctx.db.quest_world_item.id.delete(row.id)');
    expect(progressionWriter).toContain('ctx.db.quest_world_item.id.update({ ...row, ...next })');
    expect(progressionWriter).toContain('ctx.db.quest_world_item.insert({');
  });
});
