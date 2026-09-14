import { describe, expect, it } from 'vitest';
import {
  SURVIVAL_BIOMES,
  TILE_SIZE_FIXED,
  cliffFamilyIndex,
  buildContentRegistry,
  bootstrapContentRegistry,
  collisionTileIsBlockedAtPlane,
  caveTerrainPlaneCollisionBytes,
  generateSurvivalDecorations,
  survivalRaisedTerrainStructuralAt,
  survivalTerrainPlaneCollisionBytes,
  survivalResourceObstacle,
  survivalWaterRockObstacle,
  survivalFishermanDockWaterObstacle,
  type ContentRegistry,
  type ItemContentDefinition,
  type ObjectContentDefinition,
} from '@orchard/sim';
import { createClientCollisionMap } from './collision.js';
import { terrainForSpace, terrainForWorld, type TerrainArray } from './terrain.js';

function placeableRegistry(
  items: readonly ItemContentDefinition[], objects: readonly ObjectContentDefinition[],
): ContentRegistry {
  const built = buildContentRegistry([...items, ...objects].map((definition) => ({
    id: definition.id, kind: definition.kind, json: definition,
  })));
  expect(built.report.errors).toEqual([]);
  return built.registry;
}

function placeableItem(id: ItemContentDefinition['id']): ItemContentDefinition {
  return {
    id, kind: 'item', schemaVersion: 1, displayName: id,
    icon: { asset: 'item_workbench' }, quality: 'common', maxStack: 32,
    tags: ['item.placeable'], economy: { buy: null, sell: 1 }, onUse: [],
  };
}

describe('client collision cache', () => {
  it('does not let one interior-family origin cell fix the whole map to plane zero', () => {
    const length = 9;
    const blocked = Array<boolean>(length).fill(false);
    const cliffFamilies = new Uint8Array(length).fill(cliffFamilyIndex('stone_1'));
    cliffFamilies[0] = cliffFamilyIndex('cave');
    const terrain: TerrainArray = {
      spaceId: 30_000,
      seed: 1,
      version: 1,
      width: 3,
      height: 3,
      defaultCliffFamily: 'stone_1',
      projectionStyle: 'raised',
      baseDatum: 0,
      cliffFamilies,
      biomes: new Uint8Array(length),
      blocked,
      horseJumpableTerrain: Array<boolean>(length).fill(false),
      elevations: new Int16Array(length),
      dirtCliffRoles: new Uint8Array(length),
      dirtTerraces: new Uint8Array(length),
    };
    const collision = createClientCollisionMap(terrain, []);
    expect(collision.blocked).toBe(blocked);
    expect(collision.fixedTerrainPlane).toBeUndefined();
  });

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
    const workbenchItem = placeableItem('item:workbench');
    const workbenchObject: ObjectContentDefinition = {
      id: 'object:workbench', kind: 'object', schemaVersion: 1, displayName: 'Workbench',
      components: {
        collision: { footprint: [[15]], blocksMovement: true },
        placement: {
          item: 'item:workbench', layer: 'object', spaces: ['homestead'], facing: false,
          footprint: [[15]],
        },
      },
    };
    const registry = placeableRegistry([workbenchItem], [workbenchObject]);
    const collision = createClientCollisionMap(
      terrain, resources, chests, 'ground', placeables, new Set(), undefined, registry,
    );
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
  }, 30_000);

  it('uses authored collision and prefab footprints for unrelated durable object ids', () => {
    const terrain = terrainForWorld(0x4f434852, 3);
    const blockingItem = placeableItem('item:estate_kit_alpha');
    const passableItem = placeableItem('item:portable_beacon');
    const blockingObject: ObjectContentDefinition = {
      id: 'object:grand_orchard_house', kind: 'object', schemaVersion: 1, displayName: 'Grand Orchard House',
      components: {
        identity: { tags: ['build.prefab'] },
        collision: { footprint: [[15, 15], [15, 15]], blocksMovement: true },
        placement: {
          item: 'item:estate_kit_alpha', layer: 'object', spaces: ['homestead'], facing: false,
          footprint: [[15, 15], [15, 15]],
        },
      },
    };
    const passableObject: ObjectContentDefinition = {
      id: 'object:totally_unrelated_machine', kind: 'object', schemaVersion: 1, displayName: 'Portable Beacon',
      components: {
        collision: { footprint: [[15]], blocksMovement: false },
        placement: {
          item: 'item:portable_beacon', layer: 'object', spaces: ['homestead'], facing: false,
        },
      },
    };
    const registry = placeableRegistry(
      [blockingItem, passableItem], [blockingObject, passableObject],
    );
    const collision = createClientCollisionMap(terrain, [], [], 'ground', [
      {
        kind: 'estate_kit_alpha', definitionId: blockingObject.id,
        tileX: 20, tileY: 20, open: false,
      },
      {
        kind: 'portable_beacon', definitionId: passableObject.id,
        tileX: 30, tileY: 30, open: false,
      },
    ], new Set(), undefined, registry);
    // Preserve the deployed bottom-centre convention: an even-width footprint
    // places its anchor on the left tile of the central pair.
    for (const tileX of [20, 21]) for (const tileY of [19, 20]) {
      expect(collision.obstacles).toContainEqual({
        left: tileX * TILE_SIZE_FIXED, top: tileY * TILE_SIZE_FIXED,
        right: (tileX + 1) * TILE_SIZE_FIXED - 1, bottom: (tileY + 1) * TILE_SIZE_FIXED - 1,
      });
    }
    expect(collision.obstacles).not.toContainEqual({
      left: 30 * TILE_SIZE_FIXED, top: 30 * TILE_SIZE_FIXED,
      right: 31 * TILE_SIZE_FIXED - 1, bottom: 31 * TILE_SIZE_FIXED - 1,
    });
  }, 30_000);

  it('keeps open containers solid and uses authored gate state rather than a generic open shortcut', () => {
    const registry = bootstrapContentRegistry();
    const renamed: ObjectContentDefinition = {
      id: 'object:moon_barrier', kind: 'object', schemaVersion: 1, displayName: 'Moon Barrier',
      components: {
        placement: { item: 'item:moon_kit', layer: 'object', spaces: ['homestead'], facing: false },
        states: { sealed: { type: 'bool', default: true } },
        collision: { footprint: [[15]], blocksMovement: true, when: { state: 'sealed', equals: true } },
      },
    };
    const active = { ...registry, objects: new Map([...registry.objects, [renamed.id, renamed]]) };
    const terrain = terrainForWorld(0x4f434852, 3);
    const collision = createClientCollisionMap(terrain, [], [], 'ground', [
      { kind: 'chest', definitionId: 'object:chest', tileX: 20, tileY: 20, open: true, stateJson: '{}' },
      { kind: 'barrel', definitionId: 'object:barrel', tileX: 22, tileY: 20, open: true, stateJson: '{}' },
      { kind: 'fence_gate', definitionId: 'object:fence_gate', tileX: 24, tileY: 20, open: true, stateJson: '{"open":true}' },
      { kind: 'fence_gate', definitionId: 'object:fence_gate', tileX: 26, tileY: 20, open: false, stateJson: '{"open":false}' },
      { kind: 'moon_kit', definitionId: renamed.id, tileX: 28, tileY: 20, open: true, stateJson: '{"sealed":true}' },
      { kind: 'moon_kit', definitionId: renamed.id, tileX: 30, tileY: 20, open: false, stateJson: '{"sealed":false}' },
      { kind: 'moon_kit', definitionId: renamed.id, tileX: 32, tileY: 20, open: true, stateJson: '{"sealed":"false"}' },
    ], new Set(), undefined, active);
    const tileObstacle = (tileX: number) => ({
      left: tileX * TILE_SIZE_FIXED, top: 20 * TILE_SIZE_FIXED,
      right: (tileX + 1) * TILE_SIZE_FIXED - 1, bottom: 21 * TILE_SIZE_FIXED - 1,
    });
    for (const tileX of [20, 22, 26, 28, 32]) expect(collision.obstacles).toContainEqual(tileObstacle(tileX));
    for (const tileX of [24, 30]) expect(collision.obstacles).not.toContainEqual(tileObstacle(tileX));
  });

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
    const elevations = new Int16Array(length).fill(1);
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
      defaultCliffFamily: 'cave',
      biomes: new Uint8Array(length),
      blocked: material,
      horseJumpableTerrain: Array<boolean>(length).fill(false),
      elevations,
      terrainTransitions: [],
      terrainPlaneBlocked: caveTerrainPlaneCollisionBytes(elevations, width, height),
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
    const dock = generateSurvivalDecorations(terrain.seed).find((decoration) => decoration.kind === 'fisher_dock');
    expect(dock).toBeDefined();
    if (dock) expect(collision.obstacles).toContainEqual(
      survivalFishermanDockWaterObstacle(dock.tileX, dock.tileY),
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
