import { describe, expect, it } from 'vitest';
import {
  SURVIVAL_BIOMES,
  TILE_SIZE_FIXED,
  FIXED_UNITS_PER_PIXEL,
  cliffFamilyIndex,
  buildContentRegistry,
  bootstrapContentRegistry,
  collisionTileIsBlockedAtPlane,
  caveTerrainPlaneCollisionBytes,
  generateSurvivalDecorations,
  survivalRaisedTerrainStructuralAt,
  survivalTerrainPlaneCollisionBytes,
  runtimeResourceObstacle,
  survivalDecorationObstacle,
  type ContentRegistry,
  type ItemContentDefinition,
  type ObjectContentDefinition,
} from '@orchard/sim';
import { worldChunkHash } from '@orchard/sim/world-chunk';
import { clientLiveRowObstacles, createClientCollisionMap, prepareClientTerrainCollision } from './collision.js';
import { terrainForSpace, terrainForWorld, type TerrainArray } from './terrain.js';
import { cellFlags } from '@orchard/sim/cell-flags';

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
  it('uses native furniture bases and keeps corrupt state solid without blocking rugs or carried furniture', () => {
    const terrain: TerrainArray = { spaceId: 30_000, seed: 1, version: 1, width: 12, height: 12,
      blocked: new Uint8Array(144), elevations: new Int16Array(144), biomes: new Uint8Array(144),
      horseJumpableTerrain: new Uint8Array(144), dirtCliffRoles: new Uint8Array(144), dirtTerraces: new Uint8Array(144),
    };
    const row = { kind: 'furniture_rustic_dining_table', tileX: 5, tileY: 5, open: false, stateJson: 'broken' };
    const collision = createClientCollisionMap(terrain, [], [], 'ground', [row,
      { ...row, kind: 'furniture_rustic_woven_rug' }, { ...row, tileX: 8, carriedBy: 'owner' },
    ]);
    expect(collision.obstacles).toEqual([{ left: (88 - 22) * FIXED_UNITS_PER_PIXEL, right: (88 + 22) * FIXED_UNITS_PER_PIXEL - 1,
      top: (96 - 14) * FIXED_UNITS_PER_PIXEL, bottom: 96 * FIXED_UNITS_PER_PIXEL - 1 }]);
    expect(createClientCollisionMap(terrain, [], [], 'air', [row]).obstacles).toEqual([]);
  });
  it('does not let one interior-family origin cell fix the whole map to plane zero', () => {
    const length = 9;
    const blocked = new Uint8Array(length);
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
      horseJumpableTerrain: new Uint8Array(length),
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
    const registryWithResources = {
      ...registry, resources: bootstrapContentRegistry().resources,
    };
    const collision = createClientCollisionMap(
      terrain, resources, chests, 'ground', placeables, new Set(), undefined, registryWithResources,
    );
    expect(collision.blocked).toBe(terrain.blocked);
    expect(collision.horseJumpableTerrain).toBe(terrain.horseJumpableTerrain);
    expect(collision.obstacles).toContainEqual(runtimeResourceObstacle(
      registryWithResources, { kind: 'tree_oak' }, 10, 10,
    ));
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

  it('uses active authored resource identity for collision and fails neutral when retired', () => {
    const terrain = terrainForWorld(0x4f434852, 3);
    const base = bootstrapContentRegistry();
    const original = base.resources.get('resource:rock_basalt')!;
    const renamed = { ...original, id: 'resource:moon_basalt' as const };
    const resources = new Map(base.resources);
    resources.delete(original.id);
    resources.set(renamed.id, renamed);
    const registry = { ...base, resources };
    const row = {
      id: 8_600_000_001n, kind: 'legacy_basalt', definitionId: renamed.id,
      tileX: 10, tileY: 10, depleted: false,
    };
    const active = createClientCollisionMap(
      terrain, [row], [], 'ground', [], new Set(), undefined, registry,
    );
    expect(active.resourceObstacles.get(row.id)).toEqual(runtimeResourceObstacle(
      registry, row, row.tileX, row.tileY,
    ));

    resources.set(renamed.id, { ...renamed, retired: true });
    const retiredRegistry = { ...base, resources: new Map(resources) };
    expect(createClientCollisionMap(
      terrain, [row], [], 'ground', [], new Set(), undefined, retiredRegistry,
    ).resourceObstacles.has(row.id)).toBe(false);
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
          expect(collision.blocked[tileY * terrain.width + tileX]).toBe(0);
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
    const material = new Uint8Array(length).fill(1);
    const elevations = new Int16Array(length).fill(1);
    for (let tileY = 1; tileY < height - 1; tileY += 1) {
      for (let tileX = 1; tileX <= 2; tileX += 1) {
        material[tileY * width + tileX] = 0;
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
      horseJumpableTerrain: new Uint8Array(length),
      elevations,
      terrainTransitions: [],
      terrainPlaneBlocked: caveTerrainPlaneCollisionBytes(elevations, width, height),
      dirtCliffRoles: new Uint8Array(length),
      dirtTerraces: new Uint8Array(length),
    };
    const collision = createClientCollisionMap(terrain, []);
    const exposedSide = 3 * width + 3;
    expect(collision.blocked[exposedSide]).toBe(0);
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
    expect(collision.blocked[oceanIndex]).toBe(0);
    expect(collision.blocked[beachIndex]).toBe(1);
    const waterRock = generateSurvivalDecorations(terrain.seed).find((decoration) => decoration.kind === 'nature_water_rock');
    expect(waterRock).toBeDefined();
    if (waterRock) expect(collision.obstacles).toContainEqual(
      survivalDecorationObstacle(waterRock, 'water'),
    );
    const dock = generateSurvivalDecorations(terrain.seed).find((decoration) => decoration.kind === 'fisher_dock');
    expect(dock).toBeDefined();
    if (dock) expect(collision.obstacles).toContainEqual(
      survivalDecorationObstacle(dock, 'water'),
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

  // Static world S4d: modes off and shadow keep this exact collision. The digest
  // was taken from the pre-S4d createClientCollisionMap on the same inputs.
  it('keeps the whole-map (off/shadow) collision byte-identical', () => {
    const registry = bootstrapContentRegistry();
    const terrain = terrainForWorld(0x4f434852, 3);
    const resources = [
      { id: 1n, kind: 'tree_oak', tileX: 300, tileY: 300, depleted: false },
      { id: 2n, kind: 'ore_iron', tileX: 301, tileY: 300, depleted: true },
      { id: 3n, kind: 'loose_stone', tileX: 302, tileY: 300, depleted: false },
      { id: 4n, kind: 'tree_oak', tileX: 303, tileY: 300, depleted: false },
    ];
    const chests = [{ tileX: 304, tileY: 300 }, { tileX: 305, tileY: 300, carriedBy: {} }];
    const placeables = [
      { kind: 'furniture_rustic_dining_table', tileX: 306, tileY: 302, open: false },
      { kind: 'workbench', tileX: 309, tileY: 300, open: false },
    ];
    const suppressions = new Set(['resource-4', 'decoration-1']);
    // Canonical JSON with cell arrays hashed (field order, obstacle order and every cell value count).
    // The flag planes (now Uint8Array) keep their recorded `booleans:` label over the same 0/1 bytes.
    const digest = (value: unknown) => worldChunkHash(new TextEncoder().encode(JSON.stringify(value, (key, item: unknown) => {
      if ((key === 'blocked' || key === 'horseJumpableTerrain') && item instanceof Uint8Array && item.length > 64) {
        if (item.some(cell => cell > 1)) throw new Error(`${key} holds a cell other than 0 or 1`);
        return `booleans:${worldChunkHash(item)}`;
      }
      if (ArrayBuffer.isView(item)) return `${item.constructor.name}:${worldChunkHash(new Uint8Array(item.buffer, item.byteOffset, item.byteLength))}`;
      if (Array.isArray(item) && item.length > 64 && item.every(entry => typeof entry === 'boolean')) return `booleans:${worldChunkHash(Uint8Array.from(item, Number))}`;
      return item;
    })));
    const ground = createClientCollisionMap(terrain, resources, chests, 'ground', placeables, suppressions, undefined, registry);
    const water = createClientCollisionMap(terrain, resources, chests, 'water', placeables, suppressions, undefined, registry);
    const docks = prepareClientTerrainCollision(terrain, 'ground', [{ tileX: 5, tileY: 5 }]);
    expect(terrain.originX).toBeUndefined();
    expect([ground, water, docks].some(map => 'originX' in map)).toBe(false);
    expect(digest({ ...ground, resourceObstacles: [...ground.resourceObstacles].map(([id, box]) => [String(id), box]) })).toBe(LEGACY_GROUND_DIGEST);
    expect(digest({ ...water, resourceObstacles: [...water.resourceObstacles].map(([id, box]) => [String(id), box]) })).toBe(LEGACY_WATER_DIGEST);
    expect(digest(docks)).toBe(LEGACY_DOCK_DIGEST);
    // The live-row helper lists exactly createClientCollisionMap's live boxes, furniture tagged.
    const live = clientLiveRowObstacles(resources, chests, placeables, suppressions, registry);
    expect(ground.obstacles!.slice(0, live.entries.length)).toEqual(live.entries.map(({ obstacle }) => obstacle));
    expect(live.entries.filter(({ furniture }) => furniture)).toHaveLength(1);
    // The depleted ore, the non-blocking loose stone and the suppressed oak have no box.
    expect([...live.resourceObstacles.keys()]).toEqual([1n]);
  }, 60_000);

  it('reads a window terrain (non-zero origin) in world tiles and never takes the generator paths', () => {
    const cells = 12;
    const window: TerrainArray = { spaceId: 0, seed: 0x4f434852, version: 3, width: 4, height: 3, originX: 100, originY: 200,
      worldWidth: 832, worldHeight: 832, blocked: new Uint8Array(cells).fill(1), elevations: new Int16Array(cells),
      biomes: new Uint8Array(cells), horseJumpableTerrain: new Uint8Array(cells),
      dirtCliffRoles: new Uint8Array(cells), dirtTerraces: new Uint8Array(cells) };
    // collision.ts:189: dock tiles are world tiles, so (101, 201) is cell 1 + 1 * 4.
    const prepared = prepareClientTerrainCollision(window, 'ground', [{ tileX: 101, tileY: 201 }, { tileX: 1, tileY: 1 }]);
    expect(Array.from(prepared.blocked, (blocked, index) => blocked ? -1 : index).filter(index => index >= 0)).toEqual([5]);
    expect([prepared.originX, prepared.originY]).toEqual([100, 200]);
    // No generator plane bytes (they describe the whole map, not the window).
    expect(prepared.terrainPlaneBlocked).toBeUndefined();
    const collision = createClientCollisionMap(window, [], [], 'ground', [], new Set(), [{ tileX: 101, tileY: 201 }], bootstrapContentRegistry());
    expect(collision.obstacles).toEqual([]);
    expect(collision.traversalChannels).toBeUndefined();
    expect(collisionTileIsBlockedAtPlane(collision, 101, 201, 0)).toBe(false);
    expect(collisionTileIsBlockedAtPlane(collision, 1, 1, 0)).toBe(true);
    // collision.ts:61: the fixed-plane (cellar) boundary is the map's edge, not the window's.
    const cellar = (originX: number, originY: number): TerrainArray => ({ ...window, spaceId: 30_000, width: 3, height: 3, originX, originY,
      worldWidth: 64, worldHeight: 64, fixedTerrainPlane: 0, blocked: new Uint8Array(9) });
    const inner = prepareClientTerrainCollision(cellar(10, 10), 'ground');
    expect(inner.blocked).toEqual(new Uint8Array(9));
    const corner = prepareClientTerrainCollision(cellar(61, 0), 'ground');
    // World column 63 and row 0 are the map edge.
    expect(corner.blocked).toEqual(cellFlags([true, true, true, false, false, true, false, false, true]));
  });
});

const LEGACY_GROUND_DIGEST = '1c0a82f6a93904de4d2c27701f7d9f11e2dd5473653547ebe8ba52f5145b941d';
const LEGACY_WATER_DIGEST = 'b2920501ac98ab7f5305ccc1c1f8a328be6162a6083971acac5cf11cf26cdd9c';
const LEGACY_DOCK_DIGEST = '662b6e3497c3d21d98649edfc80d9d9956abc79f82a006f7ee29e281885f06da';
