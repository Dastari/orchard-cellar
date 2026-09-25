import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { planTerrain, stairPlacementFindings, type TerrainPlanAtlasAsset, type TerrainPlanInput } from './terrain-plan.js';

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

describe('planTerrain golden draw lists (static world S4b)', () => {
  // Recorded on origin/main c2e85788 before terrain-array indexing moved behind
  // terrainIndexAt(); any drift in these digests is a rendering change.
  const golden = (input: TerrainPlanInput) => {
    const draws = planTerrain(input);
    return `${draws.length}:${createHash('sha256').update(JSON.stringify(draws)).digest('hex').slice(0, 32)}`;
  };

  it('stays byte-identical for stone, dungeon, cave and basic plateaus with stairs', () => {
    expect({
      stone: golden(twoLevels()),
      dungeon: golden(twoLevels('dungeon_1')),
      cave: golden(twoLevels('cave')),
      basic: golden(twoLevels('basic')),
      mixed: golden({
        ...twoLevels(),
        cells: [
          { x: 0, y: 0, surface: 'sand' }, { x: 1, y: 0, surface: 'stone' }, { x: 2, y: 0, surface: 'cave_floor' },
          { x: 3, y: 0, surfaceFamily: 'grass_2' }, { x: 4, y: 3, cliffFamily: 'cave' }, { x: 9, y: 10, surface: 'water' },
        ],
      }),
    }).toMatchInlineSnapshot(`
      {
        "basic": "170:3210ae5902e1d249bbc60b6ee490405f",
        "cave": "346:6ae775435300e36deb4e9e6144bad3c9",
        "dungeon": "399:88c69b7c73d07aedb8cd65e8157b29dd",
        "mixed": "197:7925a59679129e205c10beb89c035eaf",
        "stone": "194:7f2903f81521f5935bd01ffa2c5abfb5",
      }
    `);
  });
});

describe('stairs climb the full cliff height (owner stair rule, 2026-09-24)', () => {
  const plateau = ['00000000', '00000000', '01111110', '01111110', '01111110', '00000000', '00000000'];
  const heights = plateau.map((row) => [...row].map(Number));
  const run = { x: 3, y: 5, direction: 'up' as const, fromLevel: 0, toLevel: 1, width: 2 };
  const rows = (draws: ReturnType<typeof planTerrain>, x: number, asset: string) =>
    draws.filter((d) => d.pass === 'depth' && d.x === x * 16 && d.assetId === asset).map((d) => [d.y / 16, d.frame]).sort((a, b) => a[0]! - b[0]!);

  it('stone: crest on the rim row, treads over every wall row down to the foot, base below', () => {
    const draws = planTerrain({ width: 8, height: 7, heights, cliffFamily: 'stone_1', surfaceFamily: 'grass_1', stairRuns: [run], atlas });
    const wall = rows(draws, 2, 'tile_cf_stone_cliff_variants').map(([y]) => y!);
    const stair = rows(draws, 3, 'tile_cf_grass_1_ramp_bank_stone');
    const rim = Math.min(...wall.filter((y) => y > 1)), foot = Math.max(...wall);
    expect(stair).toEqual([[rim, 0], ...Array.from({ length: foot - rim }, (_, i) => [rim + 1 + i, i % 2 === 0 ? 4 : 8]), [foot + 1, 12]]);
  });

  it('basic: the two-row brown-rim stair block from the grass_1 sheet, top row in the rim', () => {
    const draws = planTerrain({ width: 8, height: 7, heights, cliffFamily: 'basic', surfaceFamily: 'grass_1', stairRuns: [run], atlas });
    expect(rows(draws, 3, 'tile_cf_grass_1_sheet')).toEqual([[4, 6], [5, 22]]);
    expect(rows(draws, 4, 'tile_cf_grass_1_sheet')).toEqual([[4, 7], [5, 23]]);
  });
});

describe('stairPlacementFindings', () => {
  it('reports runs beside a corner and accepts a straight edge', () => {
    const heights = ['00000000', '00000000', '01111110', '01111110', '01111110', '00000000', '00000000'].map((r) => [...r].map(Number));
    const at = (x: number) => stairPlacementFindings({ width: 8, height: 7, heights, stairRuns: [{ x, y: 5, direction: 'up', fromLevel: 0, toLevel: 1, width: 2 }] }).map((f) => f.issue);
    expect(at(3)).toEqual([]);
    expect(at(4)).toEqual(['ramp_beside_corner']);
    expect(at(5)).toEqual(['ramp_beside_cliff_end']);
  });
});
