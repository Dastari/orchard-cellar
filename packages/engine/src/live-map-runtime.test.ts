import { describe, expect, it } from 'vitest';
import {
  applyMapDocumentV3Edit,
  createEmptyMapDocument,
  createLiveIslandMapDocument,
  createMapPrefabDocument,
  bootstrapContentRows,
  bootstrapContentRegistry,
  bootstrapTilesetDefinitions,
  buildContentRegistry,
  survivalTerrainPlaneCollisionBytes,
  SURVIVAL_WORLD_SEED,
  SURVIVAL_WORLD_VERSION,
  TOPSIDE_SPACE_ID,
  mapLandmarkCollisionObstacle,
  migrateMapDocumentV2,
  serializeMapDocumentV3,
  type MapPrefabDocumentV2,
} from '@orchard/sim';
import {
  liveIslandTerrain,
  liveIslandDocument,
  liveIslandUsesGeneratedTerrain,
  liveMapObjectCollisionObstacles,
} from './live-map-runtime.js';
import { terrainForWorld } from './terrain.js';

describe('live map runtime', () => {
  it('reuses generated world arrays when the sparse live document has no terrain edits', () => {
    const document = createLiveIslandMapDocument();
    const seed = document.provenance.generatorSeed ?? SURVIVAL_WORLD_SEED;
    const generatorVersion = document.provenance.generatorVersion ?? SURVIVAL_WORLD_VERSION;
    const generated = terrainForWorld(seed, generatorVersion);
    const terrain = liveIslandTerrain({
      mapId: document.id,
      revision: 72,
      contentHash: 'generated-terrain-fast-path',
      documentJson: serializeMapDocumentV3(document),
    });

    expect(liveIslandUsesGeneratedTerrain(document)).toBe(true);
    expect(terrain?.elevations).toBe(generated.elevations);
    expect(terrain?.biomes).toBe(generated.biomes);
    expect(terrain?.terrainPlaneBlocked).toBe(survivalTerrainPlaneCollisionBytes(seed));
    expect(terrain?.version).toBe(72);
  });

  it('rejects the generated-terrain fast path after an authored cell edit', () => {
    const document = applyMapDocumentV3Edit(createLiveIslandMapDocument(), {
      kind: 'terrain',
      command: {
        kind: 'paint', points: [{ tileX: 12, tileY: 13 }], patch: { elevation: 12 },
      },
    }).document;
    expect(liveIslandUsesGeneratedTerrain(document)).toBe(false);
  });

  it('materializes authored 4x4 prefab masks as fixed-point authority rectangles', () => {
    const prefab: MapPrefabDocumentV2 = {
      ...createMapPrefabDocument({ id: 'wall', title: 'Wall' }),
      cells: [{ id: 'solid', tileX: 0, tileY: 0, elevation: 0, collisionMask: 0xffff }],
    };
    let document = migrateMapDocumentV2(createEmptyMapDocument({
      id: 'runtime', title: 'Runtime', width: 8, height: 8,
    }));
    document = applyMapDocumentV3Edit(document, { kind: 'embed_prefab', prefab }).document;
    document = applyMapDocumentV3Edit(document, {
      kind: 'place_object',
      object: {
        id: 'wall-1', prefabId: 'wall', prefabRevision: 0,
        tileX: 2, tileY: 3, elevation: 0, layer: 'objects',
        quarterTurns: 0, flipX: false, enabled: true,
      },
    }).document;
    const obstacles = liveMapObjectCollisionObstacles(document);
    expect(obstacles).toHaveLength(16);
    expect(obstacles[0]).toEqual({ left: 512, top: 768, right: 575, bottom: 831 });
    expect(obstacles.at(-1)).toEqual({ left: 704, top: 960, right: 767, bottom: 1023 });
  });

  it('uses edited strict landmark placement for shared collision', () => {
    let document = createLiveIslandMapDocument();
    const farmhouse = document.landmarks.find((landmark) => landmark.kind === 'farm_house')!;
    document = applyMapDocumentV3Edit(document, {
      kind: 'move_landmark', landmarkId: farmhouse.id, tileX: 100, tileY: 120,
    }).document;
    const obstacles = liveMapObjectCollisionObstacles(document);
    const moved = document.landmarks.find((landmark) => landmark.id === farmhouse.id)!;
    expect(obstacles).toContainEqual(mapLandmarkCollisionObstacle(moved, 'ground'));
  });

  it('materializes a newly published tileset family without rebuilding the client', () => {
    const source = structuredClone(bootstrapTilesetDefinitions()
      .find(({ familyId }) => familyId === 'stone_1')!);
    const custom = {
      ...source,
      id: 'tileset:runtime_moss' as const,
      familyId: 'runtime_moss',
      roleFrames: source.roleFrames.map((entry) => entry.group === 'edge' && entry.role === 'top'
        ? { ...entry, frame: 93 }
        : entry),
    };
    const registry = buildContentRegistry([
      ...bootstrapContentRows(),
      { id: custom.id, kind: custom.kind, json: JSON.stringify(custom) },
    ]).registry;
    const document = { ...createLiveIslandMapDocument(), defaultCliffFamily: 'runtime_moss' };
    const terrain = liveIslandTerrain({
      mapId: document.id,
      revision: 71,
      contentHash: 'runtime-family-fixture',
      documentJson: serializeMapDocumentV3(document),
    }, registry);
    expect(terrain?.defaultCliffFamily).toBe('runtime_moss');
    expect(terrain?.tilesets?.tileSetFor('runtime_moss')?.edgeFrames.top).toBe(93);
  });

  it('keys legacy landmark materialization by the active registry and never resurrects retired content', () => {
    const bootstrap = bootstrapContentRegistry();
    const island = [...bootstrap.spaces.values()]
      .find(({ spaceId }) => spaceId === TOPSIDE_SPACE_ID)!;
    const canonical = createLiveIslandMapDocument();
    const source = JSON.parse(serializeMapDocumentV3(canonical)) as Record<string, unknown>;
    delete source['landmarks'];
    const row = {
      mapId: canonical.id,
      revision: 91,
      contentHash: 'legacy-landmark-document',
      documentJson: JSON.stringify(source),
    };

    const baseline = liveIslandDocument(row, bootstrap)!;
    expect(baseline.landmarks.map(({ id }) => id))
      .toEqual(createLiveIslandMapDocument().landmarks.map(({ id }) => id));

    const renamedSpace = {
      ...island,
      id: 'space:orchard_after_dark' as const,
      landmarks: island.landmarks?.map((landmark) => ({
        ...landmark,
        id: `renamed_${landmark.id}`,
        label: `Renamed ${landmark.label}`,
      })),
    };
    const renamedRegistry = {
      ...bootstrap,
      contentHash: 'renamed-landmark-content',
      spaces: new Map([[renamedSpace.id, renamedSpace]]),
    };
    const renamed = liveIslandDocument(row, renamedRegistry)!;
    expect(renamed.landmarks.map(({ groupId }) => groupId))
      .toEqual(baseline.landmarks.map(({ groupId }) => `renamed_${groupId}`));
    expect(renamed.landmarks.map(({ sourceDecorationId, tileX, tileY, kind }) => ({
      sourceDecorationId, tileX, tileY, kind,
    }))).toEqual(baseline.landmarks.map(({ sourceDecorationId, tileX, tileY, kind }) => ({
      sourceDecorationId, tileX, tileY, kind,
    })));

    const retiredSpace = { ...island, retired: true as const };
    const retiredRegistry = {
      ...bootstrap,
      contentHash: 'retired-landmark-content',
      spaces: new Map([[retiredSpace.id, retiredSpace]]),
    };
    expect(liveIslandDocument(row, retiredRegistry)?.landmarks).toEqual([]);
  });
});
