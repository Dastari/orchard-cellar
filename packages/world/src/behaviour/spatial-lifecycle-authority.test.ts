import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../index.ts', import.meta.url), 'utf8');

function between(start: string, end: string): string {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  if (from < 0 || to < 0) throw new Error(`missing source boundary: ${start} -> ${end}`);
  return source.slice(from, to);
}

describe('spatial lifecycle production authority', () => {
  it('preflights leave and enter hooks before the engine-owned teleport mutation', () => {
    const teleport = between('function teleportPlayer(', 'function usePortalRow(');
    const leave = teleport.indexOf("type: 'leaveSpace'");
    const enter = teleport.indexOf("type: 'enterSpace'");
    const write = teleport.indexOf('ctx.db.player_position.identity.update(nextPosition)');
    expect(leave).toBeGreaterThanOrEqual(0);
    expect(enter).toBeGreaterThan(leave);
    expect(write).toBeGreaterThan(enter);
  });

  it('reuses one immutable registry and handler set for the movement tick', () => {
    const tick = source.slice(source.indexOf('export const stepWorld = spacetimedb.reducer('));
    expect(tick.match(/const tickLifecycleHandlers = currentWorldBehaviourHandlers\(ctx\)/gu)).toHaveLength(1);
    expect(tick.match(/const tickRegistrySnapshot = behaviourRegistrySnapshot\(ctx\)/gu)).toHaveLength(1);
    expect(tick).toContain('raisePlayerWalkOntoEvent(');
    expect(tick).toContain('tickLifecycleHandlers,');
    expect(tick).toContain('tickRegistrySnapshot,');
  });

  it('raises semantic despawn before admin, expiry, and NPC deletion', () => {
    const admin = between('function writeAdminObjectPlan(', 'function executeAdminObjectMutation(');
    const tick = source.slice(source.indexOf('export const stepWorld = spacetimedb.reducer('));
    const rogue = between('function stepRogueEnemy(', 'type SwordMeleeTarget');
    expect(admin.indexOf('raiseEntityDespawnEvent('))
      .toBeLessThan(admin.indexOf("if (mutation.spillContents)"));
    expect(tick.indexOf('raiseEntityDespawnEvent(ctx, {'))
      .toBeLessThan(tick.indexOf('ctx.db.world_item.id.delete(item.id)'));
    expect(rogue).toContain('raiseEntityDespawnEvent(');
    expect(rogue.indexOf('raiseEntityDespawnEvent('))
      .toBeLessThan(rogue.indexOf('ctx.db.world_npc.id.delete(npc.id)'));
  });
});
