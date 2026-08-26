import { describe, expect, it } from 'vitest';
import {
  FIXED_UNITS_PER_PIXEL,
  SURVIVAL_BIOMES,
  SURVIVAL_CLIFF_ROLES,
  SURVIVAL_DIRT_CLIFF_ROLES,
  TOPSIDE_SPACE_ID,
} from '@orchard/sim';
import {
  LIGHT_CLIFF_FACE_BLOCKER,
  LIGHT_OPEN,
  LIGHT_SOFT_ATTENUATOR,
  LIGHT_SPRITE_BLOCKER,
  LIGHT_TRUNK_BLOCKER,
} from './light-flood.js';
import {
  buildLightOcclusionPrefix,
  createLightOcclusionMap,
  rasterizeLightOcclusion,
} from './light-occlusion.js';
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
    elevations: new Uint8Array(length),
    plateaus: new Uint8Array(length),
    dirtCliffRoles: new Uint8Array(length),
    dirtTerraces: new Uint8Array(length),
  };
}

describe('27§3 light occlusion classification', () => {
  it('makes raised cliff faces hard while ramps, inset edges, and water remain transparent', () => {
    const source = terrain();
    source.cliffRoles[0] = SURVIVAL_CLIFF_ROLES.indexOf('wall');
    source.cliffRoles[1] = SURVIVAL_CLIFF_ROLES.indexOf('ramp_top_left');
    source.dirtCliffRoles[2] = SURVIVAL_DIRT_CLIFF_ROLES.indexOf('edge');
    source.biomes[3] = SURVIVAL_BIOMES.indexOf('water');
    const map = createLightOcclusionMap(source);
    expect([...map.hardBlocked.slice(0, 4)]).toEqual([1, 0, 0, 0]);
    expect([...map.frontFaces.slice(0, 4)]).toEqual([1, 0, 0, 0]);
  });

  it('uses fixed-space border collision as underground walls', () => {
    const source = terrain(1);
    (source.blocked as boolean[])[0] = true;
    expect(createLightOcclusionMap(source).hardBlocked[0]).toBe(1);
  });

  it('27§5 derives nested cliff blockers from elevation contours', () => {
    const source = terrain();
    source.elevations[1] = 2;
    const map = createLightOcclusionMap(source);
    expect(map.hardBlocked[4]).toBe(1);
    expect(map.frontFaces[4]).toBe(1);
    expect(map.hardBlocked[7]).toBe(1);
    expect(map.terrainOccluders?.length).toBeGreaterThan(0);
    expect(new Set(map.terrainOccluders?.map((occluder) => occluder.elevationLayer))).toEqual(
      new Set([0, 1]),
    );
  });

  it('rasterizes only occluders on the light source elevation plane', () => {
    const unit = FIXED_UNITS_PER_PIXEL;
    const obstacle = { left: 4 * unit, top: 8 * unit, right: 11 * unit, bottom: 15 * unit };
    const map = createLightOcclusionMap(terrain(), [], [], [
      { obstacle, receiver: null, footY: 16, elevationLayer: 0 },
      { obstacle, receiver: null, footY: 16, elevationLayer: 1 },
    ]);
    const mask = new Uint8Array(12 * 12);
    const owners = new Uint16Array(mask.length);
    rasterizeLightOcclusion(mask, 12, 12, 0, 0, 4, map, owners, null, null, null, 0);
    expect(owners[2 * 12 + 1]).toBe(1);
    rasterizeLightOcclusion(mask, 12, 12, 0, 0, 4, map, owners, null, null, null, 1);
    expect(owners[2 * 12 + 1]).toBe(2);
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
    expect(mask[0]).toBe(LIGHT_CLIFF_FACE_BLOCKER);
    expect(mask[3 * width + 3]).toBe(LIGHT_CLIFF_FACE_BLOCKER);
    expect(mask[4 * width + 4]).toBe(LIGHT_SOFT_ATTENUATOR);
    expect(mask[7 * width + 7]).toBe(LIGHT_SOFT_ATTENUATOR);
    expect(mask[8 * width + 8]).toBe(LIGHT_OPEN);
    const prefix = new Uint32Array((width + 1) * 13);
    buildLightOcclusionPrefix(prefix, width, 12, mask);
    expect(prefix[4 * (width + 1) + 4]).toBe(16);
  });

  it('rasterizes authored opacity without darkening transparent sprite pixels', () => {
    const source = terrain();
    const opaque = new Uint8Array(8 * 8);
    for (let y = 4; y < 8; y += 1) for (let x = 4; x < 8; x += 1) opaque[y * 8 + x] = 1;
    const map = createLightOcclusionMap(source, [], [{
      left: 0, top: 0, width: 8, height: 8, opaque,
    }]);
    const mask = new Uint8Array(12 * 12);
    rasterizeLightOcclusion(mask, 12, 12, 0, 0, 4, map);
    expect(mask[0]).toBe(LIGHT_OPEN);
    expect(mask[1]).toBe(LIGHT_OPEN);
    expect(mask[12]).toBe(LIGHT_OPEN);
    expect(mask[12 + 1]).toBe(LIGHT_SPRITE_BLOCKER);
  });

  it('separates a narrow trunk footprint from its elevated receiver ownership', () => {
    const unit = FIXED_UNITS_PER_PIXEL;
    const receiverOpaque = new Uint8Array(16 * 16).fill(1);
    const map = createLightOcclusionMap(terrain(), [], [], [{
      obstacle: { left: 4 * unit, top: 8 * unit, right: 11 * unit, bottom: 15 * unit },
      receiver: { left: 0, top: 0, width: 16, height: 16, opaque: receiverOpaque },
      footY: 16,
    }]);
    const mask = new Uint8Array(12 * 12);
    const trunkOwners = new Uint16Array(mask.length);
    const receiverOwners = new Uint16Array(mask.length);
    rasterizeLightOcclusion(mask, 12, 12, 0, 0, 4, map, trunkOwners, receiverOwners);
    expect(mask[2 * 12 + 1]).toBe(LIGHT_TRUNK_BLOCKER);
    expect(trunkOwners[2 * 12 + 1]).toBe(1);
    expect(receiverOwners[0]).toBe(1);
  });

  it('27§3 gives overlapping elevated receivers to the lower painter-depth foot', () => {
    const unit = FIXED_UNITS_PER_PIXEL;
    const receiverOpaque = new Uint8Array(16 * 16).fill(1);
    const receiver = { left: 0, top: 0, width: 16, height: 16, opaque: receiverOpaque };
    const map = createLightOcclusionMap(terrain(), [], [], [
      {
        obstacle: { left: 4 * unit, top: 8 * unit, right: 11 * unit, bottom: 15 * unit },
        receiver,
        footY: 12,
      },
      {
        obstacle: { left: 4 * unit, top: 8 * unit, right: 11 * unit, bottom: 15 * unit },
        receiver,
        footY: 20,
      },
    ]);
    const mask = new Uint8Array(12 * 12);
    const trunkOwners = new Uint16Array(mask.length);
    const receiverOwners = new Uint16Array(mask.length);
    rasterizeLightOcclusion(mask, 12, 12, 0, 0, 4, map, trunkOwners, receiverOwners);
    expect(receiverOwners[0]).toBe(2);
  });

  it('27§3 rasterizes a depth-owned silhouette caster without a collision rectangle', () => {
    const unit = FIXED_UNITS_PER_PIXEL;
    const opaque = new Uint8Array(8 * 8);
    for (let y = 0; y < 8; y += 1) opaque[y * 8 + 4] = 1;
    const map = createLightOcclusionMap(terrain(), [], [], [{
      obstacle: { left: 0, top: 0, right: 7 * unit, bottom: 7 * unit },
      receiver: { left: 0, top: 0, width: 8, height: 8, opaque },
      footY: 8,
      shadowMode: 'silhouette',
    }]);
    const mask = new Uint8Array(12 * 12);
    const casterOwners = new Uint16Array(mask.length);
    const receiverOwners = new Uint16Array(mask.length);
    const casterCells = new Uint32Array(mask.length);
    const casterCount = rasterizeLightOcclusion(
      mask, 12, 12, 0, 0, 4, map, casterOwners, receiverOwners, casterCells,
    );
    expect(casterCount).toBe(2);
    expect(mask[0]).toBe(LIGHT_OPEN);
    expect(mask[1]).toBe(LIGHT_SPRITE_BLOCKER);
    expect(casterOwners[1]).toBe(1);
    expect(receiverOwners[1]).toBe(1);
  });

  it('27§3 relights only fully opaque receiver texels while retaining broad self-ownership', () => {
    const unit = FIXED_UNITS_PER_PIXEL;
    const opaque = new Uint8Array(8 * 8);
    for (let y = 0; y < 8; y += 1) opaque[y * 8 + 4] = 1;
    const map = createLightOcclusionMap(terrain(), [], [], [{
      obstacle: { left: 0, top: 0, right: 7 * unit, bottom: 7 * unit },
      receiver: { left: 0, top: 0, width: 8, height: 8, opaque },
      footY: 8,
      shadowMode: 'silhouette',
    }]);
    const mask = new Uint8Array(12 * 12);
    const casterOwners = new Uint16Array(mask.length);
    const receiverOwners = new Uint16Array(mask.length);
    const relitReceiverOwners = new Uint16Array(mask.length);
    rasterizeLightOcclusion(
      mask, 12, 12, 0, 0, 4, map,
      casterOwners, receiverOwners, null, relitReceiverOwners,
    );
    expect(receiverOwners[1]).toBe(1);
    expect(relitReceiverOwners[1]).toBe(0);
  });

  it('27§3 rasterizes a tree column from its collision mesh, not its canopy', () => {
    const unit = FIXED_UNITS_PER_PIXEL;
    const canopy = new Uint8Array(16 * 16).fill(1);
    const map = createLightOcclusionMap(terrain(), [], [], [{
      obstacle: { left: 6 * unit, top: 12 * unit, right: 9 * unit, bottom: 15 * unit },
      receiver: { left: 0, top: 0, width: 16, height: 16, opaque: canopy },
      footX: 8,
      footY: 16,
      receiverFacing: 'south',
      shadowMode: 'column',
    }]);
    const mask = new Uint8Array(12 * 12);
    const casterOwners = new Uint16Array(mask.length);
    const receiverOwners = new Uint16Array(mask.length);
    const casterCells = new Uint32Array(mask.length);
    const relitReceiverOwners = new Uint16Array(mask.length);
    rasterizeLightOcclusion(
      mask, 12, 12, 0, 0, 4, map, casterOwners, receiverOwners, casterCells,
      relitReceiverOwners,
    );
    expect(mask[0]).toBe(LIGHT_OPEN);
    expect(mask[3 * 12 + 1]).toBe(LIGHT_SPRITE_BLOCKER);
    expect(receiverOwners[0]).toBe(1);
    expect(relitReceiverOwners[0]).toBe(1);
  });
});
