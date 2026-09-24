import { describe, expect, it } from 'vitest';
import { planTerrain, type TerrainPlanAtlasAsset, type TerrainPlanInput } from './terrain-plan.js';

// Every asset: a 16x16 tile anchored like the terrain atlas, with enough frames
// for any role. Frame numbers therefore come straight from the resolvers.
const tile: TerrainPlanAtlasAsset = { anchor: [8, 15], variants: { base: Array.from({ length: 256 }, () => ({ width: 16, height: 16 })) } };
const atlas = new Proxy({} as Record<string, TerrainPlanAtlasAsset>, { get: () => tile });

// Level 1 plateau (x1-8, y2-8) with a level 2 plateau (x3-6, y3-5) on top, and
// two-lane stairs 0->1 at the south edge and 1->2 up to the upper plateau.
function twoLevels(cliffFamily = 'stone_1'): TerrainPlanInput {
  const heights = Array.from({ length: 11 }, (_, y) => Array.from({ length: 10 }, (_, x) => {
    if (x >= 3 && x <= 6 && y >= 3 && y <= 5) return 2;
    if (x >= 1 && x <= 8 && y >= 2 && y <= 8) return 1;
    return 0;
  }));
  return {
    width: 10, height: 11, heights, cliffFamily, surfaceFamily: 'grass_1', atlas,
    stairRuns: [
      { x: 4, y: 9, direction: 'up', fromLevel: 0, toLevel: 1, width: 2 },
      { x: 4, y: 6, direction: 'up', fromLevel: 1, toLevel: 2, width: 2 },
    ],
  };
}

describe('planTerrain', () => {
  it('records the game draws for stacked plateaus with stairs, without a DOM', () => {
    expect((globalThis as { document?: unknown }).document).toBeUndefined();
    const draws = planTerrain(twoLevels());
    const ties = new Set(draws.map((d) => d.tie?.replace(/:\d+:\d+$/, '')));
    for (const part of ['0-terrain:1:cap', '0-terrain:1:face', '0-terrain:2:cap', '0-terrain:2:face']) expect(ties).toContain(part);
    expect(draws.some((d) => d.pass === 'ground')).toBe(true);
    for (const d of draws) {
      expect(Number.isInteger(d.frame) && d.frame >= 0).toBe(true);
      expect(typeof d.assetId).toBe('string');
    }
  });

  it('draws both stair runs from the family stone ramp bank: crest and base courses', () => {
    const stairs = planTerrain(twoLevels()).filter((d) => d.assetId === 'tile_cf_grass_1_ramp_bank_stone');
    const frames = new Set(stairs.map((d) => d.frame));
    for (const f of [0, 2, 12, 14]) expect(frames).toContain(f);
  });

  it('projects each contour level upward by one row per level', () => {
    const caps = planTerrain(twoLevels()).filter((d) => /^0-terrain:[12]:cap:/.test(d.tie ?? '') && d.assetId === 'tile_cf_stone_cliff_variants');
    expect(caps.length).toBeGreaterThan(0);
    for (const d of caps) {
      const [, level, row] = /^0-terrain:(\d+):cap:(\d+):/.exec(d.tie!)!.map(Number);
      expect(d.y).toBe((row! - level!) * 16);
    }
  });

  it('is deterministic and leaves no draw without an asset', () => {
    expect(planTerrain(twoLevels())).toEqual(planTerrain(twoLevels()));
    expect(planTerrain(twoLevels('dungeon_1')).every((d) => d.assetId.length > 0)).toBe(true);
  });
});
