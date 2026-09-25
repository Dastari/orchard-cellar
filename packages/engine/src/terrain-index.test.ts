import { describe, expect, it } from 'vitest';
import { SURVIVAL_BIOMES } from '@orchard/sim';
import { groundTileInsideTerrain } from './ground-cache.js';
import { createLightOcclusionMap, rasterizeLightOcclusion } from './light-occlusion.js';
import { residenceWallAt } from './residence-wall.js';
import {
  authoredFarmlandRuleLayersAt,
  terrainBiomeAt,
  terrainCliffFamilyAt,
  terrainColorAt,
  type TerrainArray,
} from './terrain.js';
import { terrainContains, terrainIndexAt } from './terrain-index.js';
import { cellFlags } from '@orchard/sim/cell-flags';

describe('terrainIndexAt (static world S4b)', () => {
  it('matches the historical row-major index for a whole map at the default origin', () => {
    const terrain = { width: 7, height: 5 };
    for (let y = 0; y < 5; y += 1) for (let x = 0; x < 7; x += 1) {
      expect(terrainIndexAt(terrain, x, y)).toBe(y * 7 + x);
      expect(terrainContains(terrain, x, y)).toBe(true);
    }
  });

  it('returns -1 for every tile outside the window, including row wrap-around', () => {
    const terrain = { width: 7, height: 5 };
    for (const [x, y] of [[-1, 0], [0, -1], [7, 0], [0, 5], [-1, 3], [7, 3], [6, 5], [-100, -100], [100, 2]] as const) {
      expect(terrainIndexAt(terrain, x, y)).toBe(-1);
      expect(terrainContains(terrain, x, y)).toBe(false);
    }
  });

  it('indexes a window whose origin is not (0, 0) relative to that origin', () => {
    const window = { width: 320, height: 320, originX: 640, originY: 960 };
    expect(terrainIndexAt(window, 640, 960)).toBe(0);
    expect(terrainIndexAt(window, 641, 960)).toBe(1);
    expect(terrainIndexAt(window, 640, 961)).toBe(320);
    expect(terrainIndexAt(window, 959, 1279)).toBe(320 * 320 - 1);
    expect(terrainIndexAt(window, 700, 1000)).toBe(40 * 320 + 60);
    for (const [x, y] of [[639, 960], [640, 959], [960, 960], [640, 1280], [0, 0], [959, 1280]] as const) {
      expect(terrainIndexAt(window, x, y)).toBe(-1);
      expect(terrainContains(window, x, y)).toBe(false);
    }
    expect(terrainContains(window, 959, 1279)).toBe(true);
    // Negative origins work the same way.
    const negative = { width: 4, height: 3, originX: -2, originY: -1 };
    expect(terrainIndexAt(negative, -2, -1)).toBe(0);
    expect(terrainIndexAt(negative, 1, 1)).toBe(2 * 4 + 3);
    expect(terrainIndexAt(negative, 2, 1)).toBe(-1);
    expect(terrainIndexAt(negative, -3, 0)).toBe(-1);
  });

  it('keeps the hand-written checks\' treatment of non-integer and NaN coordinates', () => {
    const terrain = { width: 4, height: 4 };
    // Not rejected: the old code read `array[fraction]`, which is undefined.
    expect(terrainIndexAt(terrain, 1.5, 2)).toBe(9.5);
    expect(terrainIndexAt(terrain, Number.NaN, 1)).toBeNaN();
    // The positive form treats NaN as outside, like `x >= 0 && ...` did.
    expect(terrainContains(terrain, Number.NaN, 1)).toBe(false);
  });
});

/** A small map with distinct per-cell data, and the same map moved to another origin. */
function fixture(originX?: number, originY?: number): TerrainArray {
  const width = 12;
  const height = 9;
  const length = width * height;
  const biomes = new Uint8Array(length);
  for (let index = 0; index < length; index += 1) biomes[index] = (index * 7) % SURVIVAL_BIOMES.length;
  const blocked = cellFlags(Array.from({ length }, (_, index) => index % 5 === 0 || Math.floor(index / width) <= 1));
  const authoredFarmland = Uint8Array.from({ length }, (_, index) => (index % 3 === 0 ? 1 : 0));
  return {
    spaceId: 1,
    seed: 1,
    version: 1,
    width,
    height,
    ...(originX === undefined ? {} : { originX }),
    ...(originY === undefined ? {} : { originY }),
    biomes,
    blocked,
    authoredFarmland,
    cliffFamilies: Uint8Array.from({ length }, (_, index) => index % 4),
    horseJumpableTerrain: new Uint8Array(length),
    elevations: new Int16Array(length),
    dirtCliffRoles: new Uint8Array(length),
    dirtTerraces: new Uint8Array(length),
  };
}

describe('converted terrain readers follow the window origin', () => {
  it('answers identically for a map moved to a non-zero origin', () => {
    const base = fixture();
    const [dx, dy] = [640, 320];
    const moved = fixture(dx, dy);
    for (let y = -2; y < base.height + 2; y += 1) for (let x = -2; x < base.width + 2; x += 1) {
      const at = [x + dx, y + dy] as const;
      expect(groundTileInsideTerrain(moved, ...at)).toBe(groundTileInsideTerrain(base, x, y));
      expect(terrainBiomeAt(moved, ...at)).toBe(terrainBiomeAt(base, x, y));
      expect(terrainColorAt(moved, ...at)).toBe(terrainColorAt(base, x, y));
      expect(terrainCliffFamilyAt(moved, ...at)).toBe(terrainCliffFamilyAt(base, x, y));
      expect(residenceWallAt(moved, ...at)).toBe(residenceWallAt(base, x, y));
      expect(authoredFarmlandRuleLayersAt(moved, ...at)).toEqual(authoredFarmlandRuleLayersAt(base, x, y));
    }
  });

  it('rasterizes interior light blockers at the moved world tiles', () => {
    const interior = { projectionStyle: 'interior', baseDatum: 0, fixedTerrainPlane: 0 } as const;
    const base = { ...fixture(), ...interior };
    const moved = { ...fixture(96, 48), ...interior };
    const baseMap = createLightOcclusionMap(base);
    const movedMap = createLightOcclusionMap(moved);
    expect(movedMap.originX).toBe(96);
    expect(movedMap.originY).toBe(48);
    expect(baseMap.originX).toBeUndefined();
    const raster = (map: typeof baseMap, minTileX: number, minTileY: number) => {
      const target = new Uint8Array(16 * 12);
      rasterizeLightOcclusion(target, 16, 12, minTileX, minTileY, 1, map);
      return target;
    };
    expect(raster(movedMap, 96 - 2, 48 - 1)).toEqual(raster(baseMap, -2, -1));
    expect(raster(movedMap, 96 + 3, 48 + 2)).toEqual(raster(baseMap, 3, 2));
  });
});
