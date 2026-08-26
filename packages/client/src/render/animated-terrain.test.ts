import { describe, expect, it } from 'vitest';
import { loopingAnimationFrame, oceanSurfaceAllowedAt, windGrassFrame } from './animated-terrain.js';
import type { TerrainArray } from './terrain.js';

function waterTerrain(): TerrainArray {
  const width = 5;
  const height = 5;
  return {
    seed: 1,
    version: 1,
    width,
    height,
    biomes: new Uint8Array(width * height),
    blocked: Array.from({ length: width * height }, () => true),
    horseJumpableTerrain: Array.from({ length: width * height }, () => false),
    cliffRoles: new Uint8Array(width * height),
    plateaus: new Uint8Array(width * height),
    dirtCliffRoles: new Uint8Array(width * height),
    dirtTerraces: new Uint8Array(width * height),
  };
}

describe('animated terrain', () => {
  it('loops authored frames at their declared frame rate', () => {
    expect(loopingAnimationFrame(0, 8, 6)).toBe(0);
    expect(loopingAnimationFrame(125, 8, 6)).toBe(1);
    expect(loopingAnimationFrame(749, 8, 6)).toBe(5);
    expect(loopingAnimationFrame(750, 8, 6)).toBe(0);
  });

  it('handles missing animation data safely', () => {
    expect(loopingAnimationFrame(1_000, 8, 0)).toBe(0);
  });

  it('rests on the base grass frame in calm weather and follows wind direction when active', () => {
    expect(windGrassFrame(500, 8, 8, 0.2, 1, 3)).toBe(0);
    const east = windGrassFrame(500, 8, 8, 1, 1, 3);
    const west = windGrassFrame(500, 8, 8, 1, -1, 3);
    expect(west).toBe(7 - east);
  });

  it('keeps ocean surface animation off every shoreline tile', () => {
    const terrain = waterTerrain();
    expect(oceanSurfaceAllowedAt(terrain, 2, 2)).toBe(true);
    terrain.biomes[2 * terrain.width + 3] = 4;
    expect(oceanSurfaceAllowedAt(terrain, 2, 2)).toBe(false);
  });
});
