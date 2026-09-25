import { activeSurvivalLandmarks, createLiveIslandMapDocument, createMapPrefabDocument, generateSurvivalResources, LIVE_ISLAND_MAP_ID,
  serializeMapDocumentV3, SURVIVAL_WORLD_SEED, TOPSIDE_SPACE_ID,
  type CombatRegion, type ContentRegistry, type MapDocumentV3, type MapPrefabDocumentV2 } from '@orchard/sim';
import type { LiveMapDocumentRow } from '@orchard/engine/live-map-runtime';
import { WORLD_CHUNK_SIZE } from '@orchard/sim/world-chunk';

/** Static-world S7a round-trip fixtures: the bootstrap island exactly as the golden
 * parity files build it, and an authored document that exercises every authored
 * cell field and every document list, published as hand-ordered JSON. */
export function bootstrapRoundTripRow(registry: ContentRegistry): LiveMapDocumentRow {
  const document = createLiveIslandMapDocument({ landmarks: activeSurvivalLandmarks(registry, TOPSIDE_SPACE_ID) });
  return { mapId: LIVE_ISLAND_MAP_ID, revision: document.revision, contentHash: 'round-trip-bootstrap', documentJson: serializeMapDocumentV3(document) };
}

/** A generated waterfall cell (world-chunk-parity WATERFALL) authored as plain water
 * without a biome: the only kind of cell whose compile consults a generated value
 * (the biome, for the traversal medium) that the post-overlay chunk channels lose. */
export const AUTHORED_WATER_OVER_WATERFALL = Object.freeze({ tileX: 415, tileY: 358 });

/** Reorders an object's keys: the listed keys first, in that order, then the rest. */
function ordered<T extends object>(value: T, first: readonly string[]): T {
  const source = value as Record<string, unknown>;
  return Object.fromEntries([...first.filter(key => key in source), ...Object.keys(source).filter(key => !first.includes(key))]
    .map(key => [key, source[key]])) as T;
}

export function authoredRoundTripRow(registry: ContentRegistry): LiveMapDocumentRow {
  const base = createLiveIslandMapDocument({ landmarks: activeSurvivalLandmarks(registry, TOPSIDE_SPACE_ID) });
  const [first, second] = generateSurvivalResources(SURVIVAL_WORLD_SEED, registry);
  const movedX = (Math.floor(second!.tileX / WORLD_CHUNK_SIZE) + 1) * WORLD_CHUNK_SIZE;
  const regions: readonly CombatRegion[] = [
    { id: 'arena', spaceId: TOPSIDE_SPACE_ID, minX: 300, minY: 300, maxX: 340, maxY: 340, policy: 'hostile' },
    { id: 'arena-camp', spaceId: TOPSIDE_SPACE_ID, minX: 310, minY: 310, maxX: 315, maxY: 315, policy: 'sanctuary', parentId: 'arena' },
  ];
  const crate: MapPrefabDocumentV2 = { ...createMapPrefabDocument({ id: 'crate', title: 'Crate', width: 1, height: 1 }),
    pivot: { tileX: 0, tileY: 0 }, cells: [{ id: 'cell', tileX: 0, tileY: 0, elevation: 0, collisionMask: 0x0660 }] };
  // Production (2026-09-22) has prefab placements with the same keys in two orders.
  const placement = { id: 'visual-1', assetId: 3132196081, assetName: 'tree_apple_fruiting', visual: { kind: 'animation', name: 'base', frameIndex: 0 },
    tileX: 0, tileY: 1, elevation: 0, layer: 'canopy', quarterTurns: 0, flipX: false } as const;
  const orchard: MapPrefabDocumentV2 = { ...createMapPrefabDocument({ id: 'orchard-pair', title: 'Orchard Pair', width: 2, height: 2 }),
    pivot: { tileX: 0, tileY: 1 },
    placements: [placement, ordered({ ...placement, id: 'visual-2', tileX: 1 }, ['id', 'assetId', 'assetName', 'tileX', 'tileY', 'elevation', 'visual'])] as never };
  const parts = [{ slot: 'water' as const, exact: { frame: 4 } }];
  const waterfall = `${AUTHORED_WATER_OVER_WATERFALL.tileX},${AUTHORED_WATER_OVER_WATERFALL.tileY}`;
  const document: MapDocumentV3 = { ...base,
    title: 'Live Island (round trip)',
    cells: { ...base.cells,
      '400,400': { parts },
      '401,400': { elevation: 1, surface: 'stone', cliffFamily: 'stone_1', biome: 'highland' },
      '402,400': { surface: 'grass', feature: 'path', biome: 'plains' },
      '403,400': { collision: 'force_block', collisionReason: 'fence line' },
      '404,400': { collision: 'force_walk', ledge: true },
      '405,400': { surfaceFamily: 'grass_1' },
      '406,400': { biome: 'beach' },
      '407,400': { surface: 'dirt', feature: 'farmland' },
      '408,400': { surface: 'sand' },
      '409,400': { elevation: 1, parts },
      '410,400': { elevation: 1 },
      // Non-canonical nested order: parse keeps terrainOverride keys as authored.
      '411,400': { elevation: 1, terrainOverride: { frameIndex: 4, contourLevel: 1 } as never },
      '412,400': { elevation: 1, terrainOverride: { contourLevel: 1, family: 'stone_1', role: 'top' } },
      '100,700': { surface: 'stone', biome: 'highland' },
      [waterfall]: { surface: 'water' },
    },
    stairRuns: [{ x: 420, y: 380, direction: 'up', fromLevel: 0, toLevel: 1 }],
    scenery: [{ id: 'bench-1', assetId: 'bench_oak', tileX: 402, tileY: 402, elevation: 0, state: 'open' }],
    anchors: [{ id: 'spawn-a', kind: 'spawn', tileX: 410, tileY: 410, elevation: 0 }, { id: 'poi-a', kind: 'poi', tileX: 411, tileY: 411, elevation: 0, label: 'Old Well' }],
    combatRegions: regions,
    prefabs: [...base.prefabs, crate, orchard],
    objects: [...base.objects, { id: 'crate-1', prefabId: 'crate', prefabRevision: crate.revision, tileX: 402, tileY: 404, elevation: 0,
      layer: 'ground', enabled: true, quarterTurns: 0, flipX: false }],
    generatedSuppressions: [...base.generatedSuppressions, `resource-${first!.id}`],
    entityStates: [{ id: `resource:${second!.id}`, entityKind: 'resource', entityId: String(second!.id), baseState: { lit: false, variant: 'a' }, state: { lit: true, variant: 'b' } }],
    resourcePlacements: [{ id: String(second!.id), originTileX: second!.tileX, originTileY: second!.tileY, tileX: movedX, tileY: second!.tileY },
      { id: '999999999999', originTileX: 100, originTileY: 100, tileX: 101, tileY: 100 }] };
  // Published as hand-ordered JSON: the root order of the production document
  // (generatedSuppressions before landmarks), provenance keys reversed, and one
  // transition with its keys in another order.
  const transitions = document.transitions.map((transition, index) => index === 0 ? ordered(transition, ['upperTileY', 'upperTileX', 'lowerTileY', 'lowerTileX']) : transition);
  const source = ordered({ ...document, provenance: ordered(document.provenance, ['generatorVersion', 'generatorSeed', 'generator', 'source', 'kind']), transitions },
    ['schemaVersion', 'id', 'title', 'width', 'height', 'tileSize', 'themeId', 'baseElevation', 'baseSurface', 'defaultCliffFamily', 'defaultSurfaceFamily',
      'revision', 'cells', 'transitions', 'stairRuns', 'scenery', 'anchors', 'provenance', 'baseBiome', 'layers', 'prefabs', 'objects', 'generatedSuppressions', 'landmarks']);
  return { mapId: LIVE_ISLAND_MAP_ID, revision: 7, contentHash: 'round-trip-authored', documentJson: JSON.stringify(source) };
}
