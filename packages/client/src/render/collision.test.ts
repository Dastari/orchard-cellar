import { describe, expect, it } from 'vitest';
import {
  SURVIVAL_BIOMES,
  TILE_SIZE_FIXED,
  generateSurvivalDecorations,
  survivalRaisedTerrainBlocksMovementAt,
  survivalRaisedTerrainStructuralAt,
  survivalResourceObstacle,
  survivalWaterRockObstacle,
} from '@orchard/sim';
import { createClientCollisionMap } from './collision.js';
import { terrainForSpace, terrainForWorld } from './terrain.js';

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
    expect(collision.obstacles).toContainEqual(survivalResourceObstacle('tree_oak', 10, 10));
    expect(collision.obstacles).toContainEqual({
      left: 12 * TILE_SIZE_FIXED, top: 10 * TILE_SIZE_FIXED,
      right: 13 * TILE_SIZE_FIXED - 1, bottom: 11 * TILE_SIZE_FIXED - 1,
    });
  }, 20_000);

  it('shares stone-face blocking and walkable trim with authority prediction', () => {
    const terrain = terrainForWorld(0x4f434852, 16);
    const collision = createClientCollisionMap(terrain, []);
    let projectedTiles = 0;
    let blockedFaceTiles = 0;
    let walkableStructuralTiles = 0;
    for (let tileY = 0; tileY < terrain.height; tileY += 1) {
      for (let tileX = 0; tileX < terrain.width; tileX += 1) {
        if (!survivalRaisedTerrainStructuralAt(terrain.seed, tileX, tileY)) continue;
        projectedTiles += 1;
        const blocked = survivalRaisedTerrainBlocksMovementAt(terrain.seed, tileX, tileY);
        expect(collision.blocked[tileY * terrain.width + tileX]).toBe(blocked);
        if (blocked) blockedFaceTiles += 1;
        else walkableStructuralTiles += 1;
      }
    }
    expect(projectedTiles).toBeGreaterThan(0);
    expect(blockedFaceTiles).toBeGreaterThan(0);
    expect(walkableStructuralTiles).toBeGreaterThan(0);
  }, 20_000);

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

  it('does not project surface decorations into underground spaces', () => {
    const terrain = terrainForSpace({
      spaceId: 1,
      name: 'mine_fixture',
      sizeTiles: 32,
      generator: 'mine',
      ambient: { r: 32, g: 32, b: 48 },
      weather: false,
      audioBed: 'cave',
    }, 0x4f434852, 3);
    expect(createClientCollisionMap(terrain, []).obstacles).toEqual([]);
  });
});
