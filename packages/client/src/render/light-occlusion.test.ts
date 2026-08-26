import { describe, expect, it } from 'vitest';
import {
  FIXED_UNITS_PER_PIXEL,
  SURVIVAL_BIOMES,
  SURVIVAL_CLIFF_ROLES,
  SURVIVAL_DIRT_CLIFF_ROLES,
  TOPSIDE_SPACE_ID,
} from '@orchard/sim';
import { LIGHT_HARD_BLOCKER, LIGHT_OPEN, LIGHT_SOFT_ATTENUATOR } from './light-flood.js';
import { buildLightOcclusionPrefix, createLightOcclusionMap, rasterizeLightOcclusion } from './light-occlusion.js';
import type { TerrainArray } from './terrain.js';

function terrain(spaceId = TOPSIDE_SPACE_ID): TerrainArray {
  const length = 9;
  return {
    spaceId,
    seed: 1,
    version: 1,
    width: 3,
    height: 3,
    biomes: new Uint8Array(length).fill(SURVIVAL_BIOMES.indexOf('plains')),
    blocked: Array<boolean>(length).fill(false),
    horseJumpableTerrain: Array<boolean>(length).fill(false),
    cliffRoles: new Uint8Array(length),
    plateaus: new Uint8Array(length),
    dirtCliffRoles: new Uint8Array(length),
    dirtTerraces: new Uint8Array(length),
  };
}

describe('27§3 light occlusion classification', () => {
  it('makes cliff faces hard while ramps and water remain transparent', () => {
    const source = terrain();
    source.cliffRoles[0] = SURVIVAL_CLIFF_ROLES.indexOf('wall');
    source.cliffRoles[1] = SURVIVAL_CLIFF_ROLES.indexOf('ramp_top_left');
    source.dirtCliffRoles[2] = SURVIVAL_DIRT_CLIFF_ROLES.indexOf('edge');
    source.biomes[3] = SURVIVAL_BIOMES.indexOf('water');
    const map = createLightOcclusionMap(source);
    expect([...map.hardBlocked.slice(0, 4)]).toEqual([1, 0, 1, 0]);
  });

  it('uses fixed-space border collision as underground walls', () => {
    const source = terrain(1);
    (source.blocked as boolean[])[0] = true;
    expect(createLightOcclusionMap(source).hardBlocked[0]).toBe(1);
  });

  it('expands hard tiles and rasterizes sub-tile object footprints', () => {
    const source = terrain();
    source.cliffRoles[0] = SURVIVAL_CLIFF_ROLES.indexOf('wall');
    const fixedTile = 16 * FIXED_UNITS_PER_PIXEL;
    const map = createLightOcclusionMap(source, [{
      left: fixedTile,
      top: fixedTile,
      right: fixedTile * 2 - 1,
      bottom: fixedTile * 2 - 1,
    }]);
    const width = 12;
    const mask = new Uint8Array(width * 12);
    rasterizeLightOcclusion(mask, width, 12, 0, 0, 4, map);
    expect(mask[0]).toBe(LIGHT_HARD_BLOCKER);
    expect(mask[3 * width + 3]).toBe(LIGHT_HARD_BLOCKER);
    expect(mask[4 * width + 4]).toBe(LIGHT_SOFT_ATTENUATOR);
    expect(mask[7 * width + 7]).toBe(LIGHT_SOFT_ATTENUATOR);
    expect(mask[8 * width + 8]).toBe(LIGHT_OPEN);
    const prefix = new Uint32Array((width + 1) * 13);
    buildLightOcclusionPrefix(prefix, width, 12, mask);
    expect(prefix[4 * (width + 1) + 4]).toBe(16);
  });
});
