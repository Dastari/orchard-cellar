import { SURVIVAL_WORLD_SIZE, survivalBiomeBlocksMovement } from '@orchard/sim';
import { describe, expect, it } from 'vitest';
import {
  beachFrameIndexAt,
  cliffFrameIndexAt,
  desertCliffFrameIndexAt,
  freshwaterFrameIndexAt,
  terrainBiomeAt,
  terrainForWorld,
  waterfallFrameIndexAt,
  type TerrainArray,
} from './terrain.js';

function terrainFixture(width: number, height: number, fill = 4): TerrainArray {
  return {
    seed: 1,
    version: 1,
    width,
    height,
    biomes: Uint8Array.from({ length: width * height }, () => fill),
    blocked: Array.from({ length: width * height }, () => false),
  };
}

describe('shared client terrain array', () => {
  it('reuses one classification for a seed/version pair', () => {
    const first = terrainForWorld(123, 3);
    expect(terrainForWorld(123, 3)).toBe(first);
    expect(terrainForWorld(123, 4)).not.toBe(first);
    expect(first.biomes).toHaveLength(SURVIVAL_WORLD_SIZE ** 2);
  });

  it('derives render and collision classification from the same byte', () => {
    const terrain = terrainForWorld(0x4f434852, 3);
    expect(terrainBiomeAt(terrain, 0, 0)).toBe('water');
    expect(terrain.blocked[0]).toBe(true);
    for (let index = 0; index < terrain.blocked.length; index += 1) {
      const tileX = index % terrain.width;
      const tileY = Math.floor(index / terrain.width);
      expect(terrain.blocked[index]).toBe(survivalBiomeBlocksMovement(terrainBiomeAt(terrain, tileX, tileY)));
    }
  });

  it('selects authored beach corners, edges, and centers from adjacent water', () => {
    const terrain = terrainFixture(3, 3, 1);
    terrain.biomes[1] = 0;
    expect(beachFrameIndexAt(terrain, 1, 1)).toBe(1);
    terrain.biomes[3] = 0;
    expect(beachFrameIndexAt(terrain, 1, 1)).toBe(0);
    terrain.biomes[1] = 1;
    terrain.biomes[3] = 1;
    expect(beachFrameIndexAt(terrain, 1, 1)).toBe(4);
  });

  it('maps blocked ridge bands onto the authored three-row cliff face', () => {
    const terrain = terrainFixture(7, 6);
    for (let y = 1; y <= 4; y += 1) for (let x = 2; x <= 4; x += 1) terrain.biomes[y * terrain.width + x] = 9;
    expect(cliffFrameIndexAt(terrain, 3, 2)).toBe(2);
    expect(cliffFrameIndexAt(terrain, 3, 3)).toBe(30);
    expect(cliffFrameIndexAt(terrain, 3, 4)).toBe(44);
    expect(cliffFrameIndexAt(terrain, 2, 3)).toBe(29);
    expect(cliffFrameIndexAt(terrain, 1, 3)).toBeNull();
  });

  it('uses the same authored topology for ocean-facing cliff bands', () => {
    const terrain = terrainFixture(7, 6);
    for (let y = 1; y <= 4; y += 1) for (let x = 2; x <= 4; x += 1) terrain.biomes[y * terrain.width + x] = 16;
    expect(cliffFrameIndexAt(terrain, 3, 2)).toBe(2);
    expect(cliffFrameIndexAt(terrain, 3, 3)).toBe(30);
    expect(cliffFrameIndexAt(terrain, 3, 4)).toBe(44);
  });

  it('selects grass-edged freshwater and authored waterfall strips', () => {
    const pond = terrainFixture(3, 3, 2);
    expect(freshwaterFrameIndexAt(pond, 1, 1)).toBe(4);
    pond.biomes[1] = 4;
    expect(freshwaterFrameIndexAt(pond, 1, 1)).toBe(1);
    pond.biomes[3] = 4;
    expect(freshwaterFrameIndexAt(pond, 1, 1)).toBe(0);

    const falls = terrainFixture(3, 5, 3);
    expect(waterfallFrameIndexAt(falls, 1, 0)).toBe(1);
    expect(waterfallFrameIndexAt(falls, 1, 2)).toBe(7);
    expect(waterfallFrameIndexAt(falls, 0, 2)).toBe(6);
    expect(waterfallFrameIndexAt(falls, 1, 4)).toBe(13);
  });

  it('maps desert ridges onto the authored sandstone cliff rows', () => {
    const terrain = terrainFixture(7, 6);
    for (let y = 1; y <= 4; y += 1) for (let x = 2; x <= 4; x += 1) terrain.biomes[y * terrain.width + x] = 12;
    expect(desertCliffFrameIndexAt(terrain, 3, 2)).toBe(41);
    expect(desertCliffFrameIndexAt(terrain, 3, 3)).toBe(54);
    expect(desertCliffFrameIndexAt(terrain, 3, 4)).toBe(67);
    expect(desertCliffFrameIndexAt(terrain, 1, 3)).toBeNull();
  });
});
