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

describe('W2c position and session reducer registration', () => {
  it('adds durable spawn spaces without rewriting legacy topside rows', () => {
    const table = between("const player_spawn = table(", "const inventory_slot = table(");
    expect(table).toContain('spaceId: t.u16().default(0)');
    expect(source).toContain('spawn: spawn === null ? null : { spaceId: String(spawn.spaceId)');
  });

  it('routes every operation through one receipt, authority, audit, and notice path', () => {
    for (const name of [
      'adminSetSpawn', 'adminRespawn', 'adminUnstick', 'adminTeleportPlayer',
      'adminSetDisplayName', 'adminKick', 'adminNotify',
    ]) {
      const registration = between(`export const ${name} = spacetimedb.reducer(`, '\n);');
      expect(registration).toContain('executeAdminPositionMutation(ctx,');
    }
    const execution = between('function executeAdminPositionMutation(', 'function adminPositionMutationBase(');
    expect(execution).toContain('resolveAdminEffectiveRole(');
    expect(execution).toContain('requireAdminPositionAuthority(role, mutation, caps');
    expect(execution).toContain('planAdminPositionMutation(loaded, {');
    expect(execution).toContain('existingPreview.fingerprint !== previewFingerprint');
    expect(execution).toContain('writeAdminPositionPlan(ctx, target, plan)');
    expect(execution).toContain('payload: serializeAdminAuditPayload(plan.audit)');
    expect(execution).toContain('ctx.db.admin_mutation_preview.id.delete(previewId)');
  });

  it('settles movement and session state while respawn releases mount and carry custody', () => {
    const writer = between('function writeAdminPositionPlan(', 'function executeAdminPositionMutation(');
    expect(writer).toContain('cancelPlayerTrade(ctx, trade)');
    expect(writer).toContain('dropAdminCarriedEntities(ctx, target, beforePosition)');
    expect(writer).toContain('teleportPlayer(');
    expect(writer).toContain('ctx.db.connection_presence_v2.connectionId.delete(presence.connectionId)');
    const teleport = between('function teleportPlayer(', 'function usePortalRow(');
    expect(teleport).toContain('ctx.db.world_placeable.by_carrier.filter(position.identity)');
    expect(teleport).toContain("settleDirection: 'idle'");
    expect(teleport).toContain('pendingSequence: 0n');
  });

  it('keeps kick non-revoking and notification delivery private per connection', () => {
    const writer = between('function writeAdminPositionPlan(', 'function executeAdminPositionMutation(');
    expect(writer).not.toContain('ctx.db.membership');
    expect(writer).toContain("insertSessionChatNotice(\n      ctx, recipient, presence.connectionId, 'admin', notice.body");
    const execution = between('function executeAdminPositionMutation(', 'function adminPositionMutationBase(');
    expect(execution).toContain('ctx.db.connection_presence_v2.by_identity.filter(target)');
    expect(execution).toContain("insertSessionChatNotice(ctx, target, presence.connectionId, 'admin', plan.notice)");
  });
});
