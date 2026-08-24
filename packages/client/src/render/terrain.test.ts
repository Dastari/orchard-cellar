import { SURVIVAL_WORLD_SIZE } from '@orchard/sim';
import { describe, expect, it } from 'vitest';
import { terrainBiomeAt, terrainForWorld } from './terrain.js';

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
  });
});
