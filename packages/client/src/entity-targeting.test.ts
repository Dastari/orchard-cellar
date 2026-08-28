import { describe, expect, it } from 'vitest';
import { entityTargetAtWorldPoint, sameEntityTarget, targetKey, type TargetableWorldEntity } from './entity-targeting.js';

const player: TargetableWorldEntity = {
  target: { kind: 'player', id: 'farmer-1' }, x: 100, y: 120, halfWidth: 8, height: 24,
};
const horse: TargetableWorldEntity = {
  target: { kind: 'npc', id: 7n }, x: 130, y: 120, halfWidth: 16, height: 25,
};
const archeryTarget: TargetableWorldEntity = {
  target: { kind: 'combat_target', id: 19n }, x: 170, y: 120, halfWidth: 16, height: 31,
};

describe('world entity targeting', () => {
  it('selects players and differently sized NPC sprites by their foot-anchored bounds', () => {
    expect(entityTargetAtWorldPoint(100, 105, [player, horse])).toEqual({ kind: 'player', id: 'farmer-1' });
    expect(entityTargetAtWorldPoint(143, 105, [player, horse])).toEqual({ kind: 'npc', id: 7n });
    expect(entityTargetAtWorldPoint(170, 100, [player, horse, archeryTarget])).toEqual({
      kind: 'combat_target', id: 19n,
    });
    expect(entityTargetAtWorldPoint(200, 105, [player, horse, archeryTarget])).toBeNull();
  });

  it('uses visual-centre distance and then front-most depth for overlapping sprites', () => {
    const rear = { ...player, target: { kind: 'player', id: 'rear' } as const, y: 110 };
    const front = { ...player, target: { kind: 'player', id: 'front' } as const, y: 112 };
    expect(entityTargetAtWorldPoint(100, 100, [rear, front])).toEqual({ kind: 'player', id: 'front' });
  });

  it('uses stable kind-prefixed keys for HUD identity', () => {
    expect(targetKey(player.target)).toBe('player:farmer-1');
    expect(targetKey(horse.target)).toBe('npc:7');
    expect(targetKey(archeryTarget.target)).toBe('combat_target:19');
    expect(sameEntityTarget(horse.target, { kind: 'npc', id: 7n })).toBe(true);
    expect(sameEntityTarget(horse.target, player.target)).toBe(false);
  });
});
