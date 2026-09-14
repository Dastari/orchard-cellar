import { describe, expect, it } from 'vitest';
import {
  diminishingPowerReward, equipmentMilestoneMultiplier, repeatCost, soften, treeMilestoneMultiplier,
} from './balance.js';
import {
  CRAFTING_STATION_REACH_TILES, FIBER_TILL_DROP_PERCENT, ITEM_DESPAWN_TICKS,
  SURVIVAL_SPAWN_SEARCH_RADIUS_TILES, SURVIVAL_TERRAIN_CONTOUR_INSET_TILES,
  SURVIVAL_TERRAIN_MAX_ELEVATION, SURVIVAL_TERRAIN_MINIMUM_SUMMIT_TILES,
} from './world-policy-balance.js';
import { BOOTSTRAP_CHARACTER_COMBAT_BALANCE } from './character-combat-balance.js';

describe('runtime balance algorithms and vocabulary', () => {
  it('retains generic deterministic curve algorithms', () => {
    expect(repeatCost(120, 1, 1.18)).toBe(142);
    expect([4, 5, 10, 15, 25].map(treeMilestoneMultiplier)).toEqual([1, 2, 4, 8, 24]);
    expect([2, 3, 6, 10].map(equipmentMilestoneMultiplier)).toEqual([1, 2, 4, 12]);
    expect(diminishingPowerReward(2_000, 500, 0.5, 1, 1)).toBe(1);
    expect(soften(10, 2, 0)).toBe(2);
  });

  it('projects canonical bootstrap tuning for deterministic compatibility', () => {
    expect(BOOTSTRAP_CHARACTER_COMBAT_BALANCE.baseAttribute).toBe(10);
    expect(BOOTSTRAP_CHARACTER_COMBAT_BALANCE.regenSweepTicks).toBe(10);
    expect(ITEM_DESPAWN_TICKS).toBe(24_000);
    expect(SURVIVAL_SPAWN_SEARCH_RADIUS_TILES).toBe(60);
    expect(FIBER_TILL_DROP_PERCENT).toBe(30);
    expect(CRAFTING_STATION_REACH_TILES).toBe(2);
    expect(SURVIVAL_TERRAIN_MAX_ELEVATION).toBe(3);
    expect(SURVIVAL_TERRAIN_CONTOUR_INSET_TILES).toBe(4);
    expect(SURVIVAL_TERRAIN_MINIMUM_SUMMIT_TILES).toBe(24);
  });
});
