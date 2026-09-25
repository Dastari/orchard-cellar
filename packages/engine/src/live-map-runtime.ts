import { mapDocumentTraversalChannels, mapTraversalChannels, runtimeTraversalPolicy } from '@orchard/sim';
import type {LightTrunkOccluder} from './light-occlusion.js';
import {terrainElevationAtWorldFoot,terrainProjectedDepthAtFoot,terrainProjectedElevationAtFoot,terrainProjectedSortOffset} from './terrain.js';
import {
  enqueueMapObjects,
  mapObjectLightFrameKey,
  mapObjectLightOccluders,
  mapObjectPointLights,
  mapObjectAssetsReady,
  preloadMapObjectAssets,
  type MapObjectPointLight,
  type MapObjectRenderOptions,
  type MapObjectTerrainSampler,
} from './map-object-presentation.js';
import {
  LIVE_ISLAND_MAP_ID,
  MAP_PREFAB_COLLISION_RESOLUTION,
  SURVIVAL_WORLD_SEED,
  SURVIVAL_WORLD_SIZE,
  SURVIVAL_WORLD_VERSION,
  TILE_SIZE_FIXED,
  TOPSIDE_SPACE_ID,
  activeSurvivalLandmarks,
  mapDocumentUsesSurvivalIslandBase,
  compileMapDocument,
  runtimeTilesetResolver,
  survivalTerrainPlaneCollisionBytes,
  survivalTerrainTransitions,
  mapObjectCollisionCells,
  mapLandmarkCollisionObstacle,
  parseMapDocumentV3,
  terrainDocumentForMapV3,
  type CollisionObstacle,
  type MapDocumentV3,
  type ContentRegistry,
  type MovementMedium,
} from '@orchard/sim';
import { terrainArrayForMapDocument } from './editor-terrain.js';
import { terrainForWorld } from './terrain.js';
import type { TerrainArray } from './terrain.js';

export interface LiveMapDocumentRow {
  readonly mapId: string;
  readonly revision: number;
  readonly contentHash: string;
  readonly documentJson: string;
}

interface CachedLiveIsland {
  readonly key: string;
  readonly document: MapDocumentV3 | null;
}

interface CachedLiveTerrain {
  readonly key: string;
  readonly terrain: TerrainArray | null;
}

let cached: CachedLiveIsland | null = null;
let cachedTerrain: CachedLiveTerrain | null = null;
const warnedRows = new Set<string>();

function validLiveIsland(document: MapDocumentV3): boolean {
  return document.id === LIVE_ISLAND_MAP_ID
    && document.width === SURVIVAL_WORLD_SIZE
    && document.height === SURVIVAL_WORLD_SIZE
    && mapDocumentUsesSurvivalIslandBase(document);
}

function transitionKey(transition: MapDocumentV3['transitions'][number]): string {
  return [
    transition.contourLevel,
    transition.kind,
    transition.direction,
    transition.lowerTileX,
    transition.lowerTileY,
    transition.upperTileX,
    transition.upperTileY,
  ].join(':');
}

/** The production island document is intentionally a sparse overlay. Until an
 * author changes terrain, its generated terrain is byte-for-byte the existing
 * world generator output and must not be recompiled across all 832x832 cells
 * during client startup. Landmarks, prefabs, objects and suppressions do not
 * affect the terrain arrays and therefore remain eligible for this path. */
export function liveIslandUsesGeneratedTerrain(document: MapDocumentV3): boolean {
  if (!mapDocumentUsesSurvivalIslandBase(document)
    || document.baseElevation !== 0
    || document.baseSurface !== 'grass'
    || document.defaultCliffFamily !== 'stone_1'
    || document.defaultSurfaceFamily !== 'grass_1'
    || Object.keys(document.cells).length !== 0
    || (document.stairRuns?.length ?? 0) !== 0) return false;
  const generated = survivalTerrainTransitions(
    document.provenance.generatorSeed ?? SURVIVAL_WORLD_SEED,
  );
  if (generated.length !== document.transitions.length) return false;
  const authoredKeys = new Set(document.transitions.map(transitionKey));
  return generated.every((transition) => authoredKeys.has(transitionKey(transition)));
}

function cacheFor(
  row: LiveMapDocumentRow | null,
  registry?: ContentRegistry,
): CachedLiveIsland | null {
  if (row === null || row.mapId !== LIVE_ISLAND_MAP_ID) return null;
  const key = `${row.revision}:${row.contentHash}:${registry?.contentHash ?? 'bootstrap'}`;
  if (cached?.key === key) return cached;
  try {
    const document = parseMapDocumentV3(
      row.documentJson,
      registry === undefined ? undefined : activeSurvivalLandmarks(registry, TOPSIDE_SPACE_ID),
    );
    if (!validLiveIsland(document)) throw new TypeError('live island dimensions or generated base are incompatible');
    cached = { key, document };
  } catch (error) {
    cached = { key, document: null };
    if (!warnedRows.has(key)) {
      warnedRows.add(key);
      console.warn('Ignoring incompatible live island map document', error);
    }
  }
  return cached;
}

export function liveIslandDocument(
  row: LiveMapDocumentRow | null,
  registry?: ContentRegistry,
): MapDocumentV3 | null {
  return cacheFor(row, registry)?.document ?? null;
}

export function liveIslandTerrain(
  row: LiveMapDocumentRow | null,
  registry?: ContentRegistry,
): TerrainArray | null {
  const source = cacheFor(row, registry);
  if (source?.document === null || source === null || row === null) return null;
  const key = `${source.key}:${registry?.contentHash ?? 'bootstrap'}`;
  if (cachedTerrain?.key === key) return cachedTerrain.terrain;
  try {
    const resolver = registry === undefined ? undefined : runtimeTilesetResolver(registry.tilesets);
    if (liveIslandUsesGeneratedTerrain(source.document)) {
      const seed = source.document.provenance.generatorSeed ?? SURVIVAL_WORLD_SEED;
      const generatorVersion = source.document.provenance.generatorVersion ?? SURVIVAL_WORLD_VERSION;
      const generated = terrainForWorld(seed, generatorVersion);
      const traversalChannels = registry !== undefined && runtimeTraversalPolicy(registry) !== null
        ? mapDocumentTraversalChannels(source.document)
        : undefined;
      cachedTerrain = {
        key,
        terrain: {
          ...generated,
          ...(traversalChannels === undefined ? {} : { traversalChannels }),
          version: row.revision,
          defaultCliffFamily: source.document.defaultCliffFamily,
          defaultSurfaceFamily: source.document.defaultSurfaceFamily,
          terrainTransitions: source.document.transitions,
          terrainPlaneBlocked: survivalTerrainPlaneCollisionBytes(seed),
          ...(resolver === undefined ? {} : { tilesets: resolver }),
        },
      };
      return cachedTerrain.terrain;
    }
    const terrainDocument = terrainDocumentForMapV3(source.document);
    const compiled = compileMapDocument(terrainDocument, resolver);
    const terrain = terrainArrayForMapDocument(
      terrainDocument,
      compiled,
      source.document,
    );
    cachedTerrain = {
      key,
      terrain: { ...terrain, spaceId: TOPSIDE_SPACE_ID, version: row.revision,
        ...(registry !== undefined && runtimeTraversalPolicy(registry) !== null
          ? { traversalChannels: mapTraversalChannels(source.document, compiled) } : {}),
      },
    };
  } catch (error) {
    cachedTerrain = { key, terrain: null };
    if (!warnedRows.has(key)) {
      warnedRows.add(key);
      console.warn('Ignoring incompatible live island terrain content', error);
    }
  }
  return cachedTerrain.terrain;
}

/** Convert every occupied 4x4 prefab sub-cell into the same fixed-point
 * collision rectangles used by prediction and server authority. */
export function liveMapObjectCollisionObstacles(
  document: MapDocumentV3 | null,
  medium: MovementMedium = 'ground',
  registry?: ContentRegistry,
): readonly CollisionObstacle[] {
  if (document === null) return [];
  const subCellSize = TILE_SIZE_FIXED / MAP_PREFAB_COLLISION_RESOLUTION;
  const obstacles: CollisionObstacle[] = [];
  for (const object of document.objects) {
    for (const cell of mapObjectCollisionCells(document, object)) {
      for (let bit = 0; bit < MAP_PREFAB_COLLISION_RESOLUTION ** 2; bit += 1) {
        if ((cell.collisionMask & (1 << bit)) === 0) continue;
        const column = bit % MAP_PREFAB_COLLISION_RESOLUTION;
        const row = Math.floor(bit / MAP_PREFAB_COLLISION_RESOLUTION);
        const left = cell.tileX * TILE_SIZE_FIXED + column * subCellSize;
        const top = cell.tileY * TILE_SIZE_FIXED + row * subCellSize;
        obstacles.push({
          left,
          top,
          right: left + subCellSize - 1,
          bottom: top + subCellSize - 1,
        });
      }
    }
  }
  for (const landmark of document.landmarks) {
    const obstacle = mapLandmarkCollisionObstacle(landmark, medium, registry);
    if (obstacle !== null) obstacles.push(obstacle);
  }
  return obstacles;
}

/** Map-object presentation lives in `map-object-presentation.ts`, which reads
 * plain object records. These document-based entry points are thin adapters:
 * a `MapDocumentV3` is passed through as its own record source, so retained
 * caches keep the same identity and every caller behaves as before. */
export {
  mapObjectAssetReadinessRevision as liveMapObjectAssetReadinessRevision,
  clearMapObjectShadowCaches as clearLiveMapShadowCaches,
  type MapObjectPointLight,
  type MapObjectRenderOptions as LiveMapObjectRenderOptions,
} from './map-object-presentation.js';

/** Samples a `TerrainArray` for map-object light occluders. */
export const TERRAIN_ARRAY_MAP_OBJECT_SAMPLER: MapObjectTerrainSampler<TerrainArray> = Object.freeze({
  elevationAtWorldFoot: (terrain: TerrainArray, worldX: number, worldFootY: number) => terrainElevationAtWorldFoot(terrain, worldX, worldFootY),
  projectedDepthAtFoot: (terrain: TerrainArray, worldX: number, worldFootY: number) => terrainProjectedDepthAtFoot(terrain, worldX, worldFootY),
  projectedElevationAtFoot: (terrain: TerrainArray, worldX: number, worldFootY: number) => terrainProjectedElevationAtFoot(terrain, worldX, worldFootY),
  projectedSortOffset: (elevation: number) => terrainProjectedSortOffset(elevation),
});

/** Resolves the generated sprite sheets referenced by a map before an
 * invalidation-driven editor render. Gameplay can keep using lazy lookup;
 * Studio awaits this promise and requests one repaint when the assets land. */
export function preloadLiveMapObjectAssets(document: MapDocumentV3): Promise<void> {
  return preloadMapObjectAssets(document);
}

export function liveMapObjectAssetsReady(document: MapDocumentV3): boolean {
  return mapObjectAssetsReady(document);
}

export function enqueueLiveMapObjects(
  document: MapDocumentV3 | null,
  options: MapObjectRenderOptions,
): number {
  return enqueueMapObjects(document, options);
}

/** Lights follow the same loaded native placements as the map renderer. */
export function liveMapObjectPointLights(document:MapDocumentV3|null,registry:ContentRegistry,authorityTick:bigint,materializedStreetlamps=false):MapObjectPointLight[]{
  return mapObjectPointLights(document,registry,authorityTick,materializedStreetlamps);
}

/** Collects every loaded authored visual, without viewport-anchor culling.
 * `timeMs` must match the visible animation clock when retaining this result. */
export function liveMapObjectLightOccluders(document:MapDocumentV3|null,terrain:TerrainArray,registry:ContentRegistry,timeMs:number):LightTrunkOccluder[]{
  return mapObjectLightOccluders(document,terrain,TERRAIN_ARRAY_MAP_OBJECT_SAMPLER,registry,timeMs);
}

/** Retained masks advance only when image availability or a selected animation
 * frame changes. The owning caller also keys document/terrain revisions. */
export function liveMapObjectLightFrameKey(document:MapDocumentV3|null,registry:ContentRegistry,timeMs:number):string{
  return mapObjectLightFrameKey(document,registry,timeMs);
}
