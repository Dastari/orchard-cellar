import { describe, expect, it } from 'vitest';
import {
  CUTE_FANTASY_ACTOR_CATALOG,
  cuteFantasyActor,
  cuteFantasyActors,
} from './cute-fantasy-actor-library.js';

describe('Cute Fantasy actor library', () => {
  it('exposes unique, game-loadable ids across every actor role', () => {
    const ids = CUTE_FANTASY_ACTOR_CATALOG.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(CUTE_FANTASY_ACTOR_CATALOG.map((entry) => entry.kind))).toEqual(
      new Set(['npc', 'faction', 'enemy', 'effect']),
    );
    expect(cuteFantasyActors('npc').length).toBeGreaterThanOrEqual(18);
    expect(cuteFantasyActors('enemy').length).toBeGreaterThanOrEqual(40);
  });

  it('retains profession, combat, damage, and companion animation contracts', () => {
    expect(cuteFantasyActor('npc_cf_farmer_bob')?.animations).toEqual(expect.arrayContaining([
      'walk_down', 'chop_down', 'water_down',
    ]));
    expect(cuteFantasyActor('enemy_cf_skeleton_swordman')?.animations).toEqual(expect.arrayContaining([
      'attack_down', 'special_down', 'hurt_down', 'defeat',
    ]));
    expect(cuteFantasyActor('enemy_cf_skeleton_mage')?.companions).toContain('projectile_cf_skeleton_mage');
    expect(cuteFantasyActor('npc_cf_witch')?.companions).toEqual(expect.arrayContaining([
      'effect_cf_witch_bat', 'effect_cf_witch_broom', 'effect_cf_witch_cauldron',
    ]));
  });

  it('reuses the canonical full-size snail assets instead of duplicating them', () => {
    const snails = CUTE_FANTASY_ACTOR_CATALOG.filter((entry) => entry.label.startsWith('Snail '));
    expect(snails).toHaveLength(4);
    expect(snails.every((entry) => entry.asset.startsWith('wildlife_cf_snail_'))).toBe(true);
  });
});
