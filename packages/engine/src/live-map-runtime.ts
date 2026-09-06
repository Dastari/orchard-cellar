import { saveSpriteTransform, restoreSpriteTransform } from './painter-context.js';
import { worldAssetFrameSource } from './world-asset-presentation.js';
import {
  LIVE_ISLAND_MAP_ID,
  MAP_PREFAB_COLLISION_RESOLUTION,
  SURVIVAL_WORLD_SEED,
  SURVIVAL_WORLD_SIZE,
  SURVIVAL_WORLD_VERSION,
  TILE_SIZE_FIXED,
  TOPSIDE_SPACE_ID,
  authoredMapContentPainterTie,
  mapDocumentUsesSurvivalIslandBase,
  compileMapDocument,
  runtimeTilesetResolver,
  survivalTerrainPlaneCollisionBytes,
  survivalTerrainTransitions,
  mapObjectCollisionCells,
  mapLandmarkCollisionObstacle,
  mapObjectPrefab,
  parseMapDocumentV3,
  terrainDocumentForMapV3,
  type CollisionObstacle,
  type MapDocumentV3,
  type MapObjectInstance,
  type MapPoint,
  type ContentRegistry,
  type MovementMedium,
  type MapPrefabDocumentV2,
  type MapStampVisual,
} from '@orchard/sim';
import { terrainArrayForMapDocument } from './editor-terrain.js';
import { terrainForWorld } from './terrain.js';
import { loadGeneratedAsset, type LoadedAsset } from '@orchard/ui';
import type { WorldDepthItem } from './renderer.js';
import { selectAtlasFrame, type AtlasFrame } from '@orchard/ui';
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

function cacheFor(row: LiveMapDocumentRow | null): CachedLiveIsland | null {
  if (row === null || row.mapId !== LIVE_ISLAND_MAP_ID) return null;
  const key = `${row.revision}:${row.contentHash}`;
  if (cached?.key === key) return cached;
  try {
    const document = parseMapDocumentV3(row.documentJson);
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

export function liveIslandDocument(row: LiveMapDocumentRow | null): MapDocumentV3 | null {
  return cacheFor(row)?.document ?? null;
}

export function liveIslandTerrain(
  row: LiveMapDocumentRow | null,
  registry?: ContentRegistry,
): TerrainArray | null {
  const source = cacheFor(row);
  if (source?.document === null || source === null || row === null) return null;
  const key = `${source.key}:${registry?.contentHash ?? 'bootstrap'}`;
  if (cachedTerrain?.key === key) return cachedTerrain.terrain;
  try {
    const resolver = registry === undefined ? undefined : runtimeTilesetResolver(registry.tilesets);
    if (liveIslandUsesGeneratedTerrain(source.document)) {
      const seed = source.document.provenance.generatorSeed ?? SURVIVAL_WORLD_SEED;
      const generatorVersion = source.document.provenance.generatorVersion ?? SURVIVAL_WORLD_VERSION;
      const generated = terrainForWorld(seed, generatorVersion);
      cachedTerrain = {
        key,
        terrain: {
          ...generated,
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
    const terrain = terrainArrayForMapDocument(
      terrainDocument,
      compileMapDocument(terrainDocument, resolver),
      source.document,
    );
    cachedTerrain = {
      key,
      terrain: { ...terrain, spaceId: TOPSIDE_SPACE_ID, version: row.revision },
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
    const obstacle = mapLandmarkCollisionObstacle(landmark, medium);
    if (obstacle !== null) obstacles.push(obstacle);
  }
  return obstacles;
}

const assets = new Map<string, LoadedAsset>();
const pendingAssets = new Map<string, Promise<void>>();

function requestAsset(assetName: string): Promise<void> {
  const existing = pendingAssets.get(assetName);
  if (existing !== undefined) return existing;
  if (assets.has(assetName)) return Promise.resolve();
  const pending = loadGeneratedAsset(assetName, 'summer')
    .then((asset) => { assets.set(assetName, asset); })
    .catch((error: unknown) => { console.warn(`Live map object asset failed: ${assetName}`, error); });
  pendingAssets.set(assetName, pending);
  return pending;
}

function loadedAsset(assetName: string): LoadedAsset | null {
  const existing = assets.get(assetName);
  if (existing !== undefined) return existing;
  void requestAsset(assetName);
  return null;
}

/** Resolves the generated sprite sheets referenced by a map before an
 * invalidation-driven editor render. Gameplay can keep using lazy lookup;
 * Studio awaits this promise and requests one repaint when the assets land. */
export async function preloadLiveMapObjectAssets(document: MapDocumentV3): Promise<void> {
  const assetNames = new Set<string>();
  for (const object of document.objects) {
    const prefab = mapObjectPrefab(document, object);
    if (prefab === null) continue;
    for (const placement of prefab.placements) assetNames.add(placement.assetName);
  }
  await Promise.all([...assetNames].map(requestAsset));
}

export function liveMapObjectAssetsReady(document: MapDocumentV3): boolean {
  for (const object of document.objects) {
    const prefab = mapObjectPrefab(document, object);
    if (prefab === null) continue;
    for (const placement of prefab.placements) {
      if (!assets.has(placement.assetName)) return false;
    }
  }
  return true;
}

function visualFrame(asset: LoadedAsset, visual: MapStampVisual, timeMs: number): AtlasFrame | null {
  if (visual.kind !== 'animation') return selectAtlasFrame(asset.metadata, visual.name, visual.frameIndex);
  const frames = asset.metadata.animations[visual.name] ?? [];
  if (frames.length === 0) return null;
  const fps = asset.metadata.animationMeta?.[visual.name]?.fps ?? 6;
  return frames[Math.floor(timeMs * fps / 1_000) % frames.length] ?? frames[0] ?? null;
}

function transformedDelta(
  tileX: number,
  tileY: number,
  prefab: MapPrefabDocumentV2,
  object: MapObjectInstance,
): MapPoint {
  let deltaX = tileX - prefab.pivot.tileX;
  const deltaY = tileY - prefab.pivot.tileY;
  if (object.flipX) deltaX = -deltaX;
  const transformed = object.quarterTurns === 0 ? { tileX: deltaX, tileY: deltaY }
    : object.quarterTurns === 1 ? { tileX: -deltaY, tileY: deltaX }
      : object.quarterTurns === 2 ? { tileX: -deltaX, tileY: -deltaY }
        : { tileX: deltaY, tileY: -deltaX };
  const objectScale = object.scale ?? 1;
  return { tileX: transformed.tileX * objectScale, tileY: transformed.tileY * objectScale };
}

export interface LiveMapObjectRenderOptions {
  readonly context: CanvasRenderingContext2D;
  readonly cameraX: number;
  readonly cameraY: number;
  readonly scale: number;
  readonly timeMs: number;
  readonly visible: (worldX: number, worldY: number) => boolean;
  readonly enqueue: (worldX: number, worldFootY: number, item: WorldDepthItem) => void;
}

export function enqueueLiveMapObjects(
  document: MapDocumentV3 | null,
  options: LiveMapObjectRenderOptions,
): number {
  if (document === null) return 0;
  let count = 0;
  for (const object of document.objects) {
    if (!object.enabled) continue;
    const prefab = mapObjectPrefab(document, object);
    if (prefab === null) continue;
    for (const placement of prefab.placements) {
      const asset = loadedAsset(placement.assetName);
      if (asset === null) continue;
      const frame = visualFrame(asset, placement.visual, options.timeMs);
      if (frame === null) continue;
      const delta = transformedDelta(placement.tileX, placement.tileY, prefab, object);
      const worldX = (object.tileX + delta.tileX) * 16 + 8;
      const worldFootY = (object.tileY + delta.tileY + 1) * 16;
      if (!options.visible(worldX, worldFootY)) continue;
      options.enqueue(worldX, worldFootY, {
        footY: worldFootY,
        depthPhase: 'entity',
        tie: authoredMapContentPainterTie(
          document, object.layer, 'object', object.id, placement.id,
        ),
        draw: () => {
          const screenX = Math.round((worldX - options.cameraX) * options.scale);
          const screenY = Math.round((worldFootY - options.cameraY) * options.scale);
          const savedTransform = saveSpriteTransform(options.context, true);
          options.context.translate(screenX, screenY);
          options.context.rotate(object.quarterTurns * Math.PI / 2);
          const objectScale = object.scale ?? 1;
          options.context.scale(object.flipX ? -objectScale : objectScale, objectScale);
          options.context.rotate(placement.quarterTurns * Math.PI / 2);
          options.context.scale(placement.flipX ? -1 : 1, 1);
          const source = worldAssetFrameSource(options.context, asset, frame)!;
          options.context.drawImage(
            source.image,
            source.x,
            source.y,
            frame.width,
            frame.height,
            -asset.anchor[0] * options.scale,
            -asset.anchor[1] * options.scale,
            frame.width * options.scale,
            frame.height * options.scale,
          );
          restoreSpriteTransform(options.context, savedTransform);
        },
      });
      count += 1;
    }
  }
  return count;
}
