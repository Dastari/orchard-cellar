import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { vehicleCustodyPlan } from './vehicle.js';

const npc = Object.freeze({ id: 90001n, kind: 'renamed_ferry', x: 4001, y: 8200,
  homeX: 140, homeY: 200, chunkX: 0, chunkY: 2, facing: 'left', moving: true,
  rider: 'original-player' as string | undefined, wanderDirection: 'idle', nextDecisionTick: 400n,
  authorityTick: 200n, health: 2, spaceId: 17, persistentExtra: 'untouched' });
const player = Object.freeze({ identity: 'original-player', x: npc.x, y: npc.y,
  chunkX: 0, chunkY: 2, facing: 'right', moving: true, actionKind: 'walk',
  actionStartedTick: 199n, authorityTick: 200n, spaceId: 17, equipment: 'unchanged' });

describe('vehicle custody continuity', () => {
  it('dismounts a renamed boat without moving the boat or losing emergency shore/state', () => {
    const plan = vehicleCustodyPlan(npc, player, { actor: 'original-player', action: 'dismount',
      adapter: 'boat', tick: 222n, landing: { x: 4300, y: 8500 } });
    expect(plan.npc).toEqual({ ...npc, rider: undefined, moving: false, authorityTick: 222n });
    expect(plan.player).toEqual({ ...player, x: 4300, y: 8500, chunkX: 1, chunkY: 2,
      moving: false, actionKind: 'none', actionStartedTick: 222n, authorityTick: 222n });
    expect(npc.rider).toBe('original-player');
  });

  it('anchors a dismounted horse at its current position to prevent spawn snapback', () => {
    const plan = vehicleCustodyPlan(npc, player, { actor: 'original-player', action: 'dismount',
      adapter: 'horse', tick: 222n, landing: { x: 4300, y: 8500 } });
    expect(plan.npc).toEqual({ ...npc, rider: undefined, homeX: npc.x, homeY: npc.y,
      nextDecisionTick: 242n, moving: false, authorityTick: 222n });
  });

  it('mounts the same persistent row without changing vehicle location, health, or home', () => {
    const plan = vehicleCustodyPlan({ ...npc, rider: undefined }, player,
      { actor: 'new-player', action: 'mount', adapter: 'boat', tick: 222n, landing: npc });
    expect(plan.npc).toEqual({ ...npc, rider: 'new-player', moving: false, authorityTick: 222n });
    expect(plan.player).toMatchObject({ x: npc.x, y: npc.y, facing: npc.facing,
      identity: player.identity, equipment: player.equipment, spaceId: player.spaceId });
  });

  it('routes legacy mount transport through lifecycle dispatch and adapters through active content', () => {
    const source = readFileSync(new URL('../index.ts', import.meta.url), 'utf8');
    const start = source.indexOf('export const interactHorse =');
    const end = source.indexOf('export const jumpHorse =', start);
    expect(source.slice(start, end)).toContain("interactEntityBehaviour(ctx, { targetKind: 'npc', entityId: horseId, verb: 'use' }");
    expect(source).toContain("applyMountLifecycle(ctx, BigInt(effect.mount.npcId), 'mount', false)");
    expect(source).toContain("applyMountLifecycle(ctx, BigInt(target.ref.id), 'dismount', false)");
    expect(source).not.toMatch(/\.kind\s*(?:===|!==)\s*['"](?:boat|horse)['"]/u);
    expect(source).not.toContain("effect.spawnNpc.definitionId !== 'npc:boat'");
    expect(source).toContain('health: definition.health');
  });
});
