import { describe, expect, it } from 'vitest';
import {
  SURVIVAL_BIOMES,
  TILE_SIZE_FIXED,
  collisionTileIsBlockedAtPlane,
  caveTerrainPlaneCollisionBytes,
  generateSurvivalDecorations,
  survivalRaisedTerrainStructuralAt,
  survivalTerrainPlaneCollisionBytes,
  survivalResourceObstacle,
  survivalWaterRockObstacle,
} from '@orchard/sim';
import { createClientCollisionMap } from './collision.js';
import { terrainForSpace, terrainForWorld, type TerrainArray } from './terrain.js';

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
    const placeables = [
      { kind: 'workbench', tileX: 15, tileY: 10, open: false, carriedBy: undefined },
      { kind: 'anvil', tileX: 16, tileY: 10, open: false, carriedBy: {} },
    ] as never;
    const collision = createClientCollisionMap(terrain, resources, chests, 'ground', placeables);
    expect(collision.blocked).toBe(terrain.blocked);
    expect(collision.horseJumpableTerrain).toBe(terrain.horseJumpableTerrain);
    expect(collision.obstacles).toContainEqual(survivalResourceObstacle('tree_oak', 10, 10));
    expect(collision.obstacles).toContainEqual({
      left: 12 * TILE_SIZE_FIXED, top: 10 * TILE_SIZE_FIXED,
      right: 13 * TILE_SIZE_FIXED - 1, bottom: 11 * TILE_SIZE_FIXED - 1,
    });
    expect(collision.obstacles).toContainEqual({
      left: 15 * TILE_SIZE_FIXED, top: 10 * TILE_SIZE_FIXED,
      right: 16 * TILE_SIZE_FIXED - 1, bottom: 11 * TILE_SIZE_FIXED - 1,
    });
    expect(collision.obstacles).not.toContainEqual({
      left: 16 * TILE_SIZE_FIXED, top: 10 * TILE_SIZE_FIXED,
      right: 17 * TILE_SIZE_FIXED - 1, bottom: 11 * TILE_SIZE_FIXED - 1,
    });
  }, 20_000);

  it('shares projected stone-face and upper-cap masks with authority prediction', () => {
    const terrain = terrainForWorld(0x4f434852, 16);
    const collision = createClientCollisionMap(terrain, []);
    expect(collision.terrainPlaneBlocked).toBe(survivalTerrainPlaneCollisionBytes(terrain.seed));
    let lowerPlaneBlockers = 0;
    let upperPlaneBlockers = 0;
    let structuralTiles = 0;
    for (let tileY = 0; tileY < terrain.height; tileY += 1) {
      for (let tileX = 0; tileX < terrain.width; tileX += 1) {
        if (survivalRaisedTerrainStructuralAt(terrain.seed, tileX, tileY)) {
          structuralTiles += 1;
          expect(collision.blocked[tileY * terrain.width + tileX]).toBe(false);
        }
        if (collisionTileIsBlockedAtPlane(collision, tileX, tileY, 0)) lowerPlaneBlockers += 1;
        if (collisionTileIsBlockedAtPlane(collision, tileX, tileY, 1)) upperPlaneBlockers += 1;
      }
    }
    expect(structuralTiles).toBeGreaterThan(0);
    expect(lowerPlaneBlockers).toBeGreaterThan(0);
    expect(upperPlaneBlockers).toBeGreaterThan(0);
  }, 20_000);

  it('uses the shared cellar plane mask for ordinary solid side walls', () => {
    const width = 7;
    const height = 7;
    const length = width * height;
    const material = Array<boolean>(length).fill(true);
    const elevations = new Uint8Array(length).fill(1);
    for (let tileY = 1; tileY < height - 1; tileY += 1) {
      for (let tileX = 1; tileX <= 2; tileX += 1) {
        material[tileY * width + tileX] = false;
        elevations[tileY * width + tileX] = 0;
      }
    }
    const terrain: TerrainArray = {
      spaceId: 30_001,
      seed: 1,
      version: 1,
      width,
      height,
      generator: 'cellar',
      biomes: new Uint8Array(length),
      blocked: material,
      horseJumpableTerrain: Array<boolean>(length).fill(false),
      cliffRoles: new Uint8Array(length),
      elevations,
      terrainTransitions: [],
      terrainPlaneBlocked: caveTerrainPlaneCollisionBytes(elevations, width, height),
      plateaus: elevations,
      dirtCliffRoles: new Uint8Array(length),
      dirtTerraces: new Uint8Array(length),
    };
    const collision = createClientCollisionMap(terrain, []);
    const exposedSide = 3 * width + 3;
    expect(collision.blocked[exposedSide]).toBe(false);
    expect(collisionTileIsBlockedAtPlane(collision, 3, 3, 0)).toBe(true);
    expect(collisionTileIsBlockedAtPlane(collision, 3, 3, 1)).toBe(true);
    expect(collisionTileIsBlockedAtPlane(collision, 4, 3, 0)).toBe(true);
    expect(collision.fixedTerrainPlane).toBe(0);
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

  it('does not project surface decorations into underground spaces', () => {
    const terrain = terrainForSpace({
      spaceId: 1,
      name: 'mine_fixture',
      sizeTiles: 32,
      generator: 'mine',
      environment: 'underground',
      ambient: { r: 32, g: 32, b: 48 },
      weather: false,
      audioBed: 'cave',
    }, 0x4f434852, 3);
    expect(createClientCollisionMap(terrain, []).obstacles).toEqual([]);
  });
});
