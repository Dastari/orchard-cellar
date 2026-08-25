import { describe, expect, it } from 'vitest';
import {
  SURVIVAL_BIOMES,
  TILE_SIZE_FIXED,
  generateSurvivalDecorations,
  survivalWaterRockObstacle,
} from '@orchard/sim';
import { createClientCollisionMap } from './collision.js';
import { terrainForWorld } from './terrain.js';

describe('client collision cache', () => {
  it('reuses terrain blocking and rebuilds only live subscribed obstacles', () => {
    const terrain = terrainForWorld(0x4f434852, 3);
    const resources = [
      { kind: 'tree_oak', tileX: 10, tileY: 10, depleted: false },
      { kind: 'ore_iron', tileX: 11, tileY: 10, depleted: true },
      { kind: 'loose_stone', tileX: 14, tileY: 10, depleted: false },
    ] as never;
    const chests = [
      { tileX: 12, tileY: 10, carriedBy: undefined },
      { tileX: 13, tileY: 10, carriedBy: {} },
    ] as never;
    const collision = createClientCollisionMap(terrain, resources, chests);
    expect(collision.blocked).toBe(terrain.blocked);
    expect(collision.horseJumpableTerrain).toBe(terrain.horseJumpableTerrain);
    expect(collision.obstacles).toHaveLength(2);
    expect(collision.obstacles?.[1]).toEqual({
      left: 12 * TILE_SIZE_FIXED, top: 10 * TILE_SIZE_FIXED,
      right: 13 * TILE_SIZE_FIXED, bottom: 11 * TILE_SIZE_FIXED,
    });
  });

  it('builds the inverse shoreline layer and water-rock obstacles for watercraft', () => {
    const terrain = terrainForWorld(0x4f434852, 3);
    const collision = createClientCollisionMap(terrain, [], [], 'water');
    const oceanIndex = terrain.biomes.findIndex((biome) => SURVIVAL_BIOMES[biome] === 'water');
    const beachIndex = terrain.biomes.findIndex((biome) => SURVIVAL_BIOMES[biome] === 'beach');
    expect(collision.blocked[oceanIndex]).toBe(false);
    expect(collision.blocked[beachIndex]).toBe(true);
    const waterRock = generateSurvivalDecorations(terrain.seed).find((decoration) => decoration.kind === 'nature_water_rock');
    expect(waterRock).toBeDefined();
    if (waterRock) expect(collision.obstacles).toContainEqual(
      survivalWaterRockObstacle(waterRock.tileX, waterRock.tileY),
    );
  }, 20_000);
});
