import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { brotliCompressSync, constants as zlibConstants, gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import {
  MAP_FEATURE_KINDS, MAP_SURFACE_KINDS, LIVE_ISLAND_MAP_ID, TILE_SIZE_FIXED, TOPSIDE_SPACE_ID,
  activeSpaceGroundWalkableTiles, activeSurvivalLandmarks, bootstrapContentRegistry, buildContentRegistry, compileMapDocument,
  createLiveIslandMapDocument, generateSurvivalDecorations, generateSurvivalLandmarkDecorations,
  generateSurvivalProceduralDecorations, generateSurvivalResources, mapLandmarkDecoration,
  parseMapDocumentV3, runtimeTilesetResolver, serializeMapDocumentV3, terrainDocumentForMapV3,
  TERRAIN_CLIFF_FAMILIES, TERRAIN_SURFACE_FAMILIES, TERRAIN_SURFACE_FAMILY_IDS, SURVIVAL_BIOMES,
  CombatRegionPolicy, MAP_PREFAB_COLLISION_RESOLUTION, SURVIVAL_WORLD_SEED, mapLandmarkCollisionObstacle, mapObjectCollisionCells,
  survivalDecorationObstacle,
  type CollisionMap, type CollisionObstacle, type CombatRegion, type ContentRegistry, type ContentDefinitionRow, type MapDocumentV3,
} from '@orchard/sim';
import { liveIslandTerrain, liveMapObjectCollisionObstacles, type LiveMapDocumentRow } from '@orchard/engine/live-map-runtime';
import { createClientCollisionMap } from '@orchard/engine/collision';
import type { TerrainArray } from '@orchard/engine/terrain';
import { ChunkTerrainStore } from '@orchard/engine/chunk-terrain-store';
import { canonicalChunkJson, decodeWorldChunk, encodeWorldChunk, sliceWorldChunkChannel, worldChunkHash, WORLD_CHUNK_SIZE, WORLD_CHUNK_MEDIA, WORLD_CHUNK_MEDIUM_SCHEMA, WORLD_CHUNK_VOID,
  WORLD_CHUNK_AUTHORITY_SCHEMA, type WorldChunkAuthorityObstacle, type WorldChunkAuthorityResource, type WorldChunkAuthorityResourcePlacement, type WorldChunkAuthoritySuppressedObstacle,
  type WorldChunkMedium, type ChunkArray, type ChunkJson, type WorldChunkManifest, type WorldChunkRecord } from '@orchard/sim/world-chunk';
import { authorityObstacleKey, composeAuthorityObstacles } from '@orchard/sim/chunk-runtime';
import { chunkTerrainAssetIds, chunkDecorationAssetIds, chunkResourceAssetIds } from './world-chunk-assets.js';
import { worldChunkCellMedium } from './world-chunk-medium.js';
import { serverLiveIslandReference, type ServerLiveIslandReference } from './world-chunk-server-reference.js';

type AuthorityMedium = 'ground' | 'water';
const AUTHORITY_MEDIA = ['ground', 'water'] as const;
/** The server's static truth that published authority.* data must reproduce. */
export interface WorldChunkAuthorityReference {
  readonly composed: Readonly<Record<AuthorityMedium, CollisionMap>>;
  readonly suppressedObstacleKeys: Readonly<Record<AuthorityMedium, readonly string[]>>;
  readonly combatPolicy: CombatRegionPolicy;
  readonly combatRegions: readonly CombatRegion[];
  readonly generatedSuppressions: readonly string[];
  readonly walkable: readonly { readonly tileX: number; readonly tileY: number }[];
  readonly resources: readonly WorldChunkAuthorityResource[];
  readonly resourcePlacements: readonly WorldChunkAuthorityResourcePlacement[];
}
export interface WorldChunkSnapshot {
  readonly terrain: TerrainArray;
  readonly document: MapDocumentV3;
  readonly channels: Readonly<Record<string, ChunkArray>>;
  readonly records: readonly WorldChunkRecord[];
  readonly metadata: Readonly<Record<string, ChunkJson>>;
  readonly collisions: Readonly<Record<'clientGround' | 'clientWater' | 'serverGround' | 'serverWater', CollisionMap>>;
  readonly authority: WorldChunkAuthorityReference;
}
function json(value: unknown): ChunkJson { return JSON.parse(JSON.stringify(value)) as ChunkJson; }
function assetStrings(value: unknown, result: Set<string>): void {
  if (value === null || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value)) {
    if (['asset', 'assetId', 'assetName', 'sheetAssetId', 'insetAssetId', 'rampAssetId', 'waterfallAssetId', 'stairAssetId', 'ladderAssetId'].includes(key) && typeof item === 'string') result.add(item);
    else assetStrings(item, result);
  }
}
function collisionMetadata(collision: CollisionMap): ChunkJson {
  return json({
    ...(collision.traversalChannels === undefined ? {} : { hasTraversalChannels: true }),
    ...(collision.terrainMinimumElevation === undefined ? {} : { terrainMinimumElevation: collision.terrainMinimumElevation }),
    ...(collision.fixedTerrainPlane === undefined ? {} : { fixedTerrainPlane: collision.fixedTerrainPlane }),
    ...(collision.terrainTransitions === undefined ? {} : { terrainTransitions: [] }),
  });
}
const OBSTACLE_KEYS = ['bottom', 'left', 'right', 'top'];
function plainObstacle(obstacle: CollisionObstacle): CollisionObstacle {
  // Records are lossless only for the plain fixed-point box the server composes.
  if (canonicalChunkJson(Object.keys(obstacle).sort()) !== canonicalChunkJson(OBSTACLE_KEYS)) throw new Error('Server obstacle is not a plain fixed-point box');
  return { left: obstacle.left, top: obstacle.top, right: obstacle.right, bottom: obstacle.bottom };
}
/** Stable provenance for the precomputed base: its golden is the fixed-seed
 * decoration generator (precomputed-survival-collision.test.ts). Fails closed. */
function baseObstacleSources(obstacles: readonly CollisionObstacle[], medium: AuthorityMedium): readonly string[] {
  const sources: { sourceId: string; obstacle: CollisionObstacle }[] = [];
  for (const decoration of generateSurvivalDecorations(SURVIVAL_WORLD_SEED)) {
    const obstacle = survivalDecorationObstacle(decoration, medium);
    if (obstacle !== null) sources.push({ sourceId: `decoration:${decoration.id}`, obstacle });
  }
  if (canonicalChunkJson(sources.map(({ obstacle }) => obstacle)) !== canonicalChunkJson(obstacles)) throw new Error(`Base ${medium} obstacle provenance diverged from the server`);
  return sources.map(({ sourceId }) => sourceId);
}
/** Mirrors the server's authoredMapCollisionObstacles order to attach source ids. Fails closed. */
function authoredObstacleSources(document: MapDocumentV3, obstacles: readonly CollisionObstacle[], medium: AuthorityMedium, registry: ContentRegistry): readonly string[] {
  const sources: { sourceId: string; obstacle: CollisionObstacle }[] = [];
  const subCellSize = TILE_SIZE_FIXED / MAP_PREFAB_COLLISION_RESOLUTION;
  for (const object of medium === 'ground' ? document.objects : []) for (const cell of mapObjectCollisionCells(document, object)) {
    for (let bit = 0; bit < MAP_PREFAB_COLLISION_RESOLUTION ** 2; bit += 1) {
      if ((cell.collisionMask & (1 << bit)) === 0) continue;
      const left = cell.tileX * TILE_SIZE_FIXED + (bit % MAP_PREFAB_COLLISION_RESOLUTION) * subCellSize;
      const top = cell.tileY * TILE_SIZE_FIXED + Math.floor(bit / MAP_PREFAB_COLLISION_RESOLUTION) * subCellSize;
      sources.push({ sourceId: `object:${object.id}`, obstacle: { left, top, right: left + subCellSize - 1, bottom: top + subCellSize - 1 } });
    }
  }
  for (const landmark of document.landmarks) {
    const obstacle = mapLandmarkCollisionObstacle(landmark, medium, registry);
    if (obstacle !== null) sources.push({ sourceId: `landmark:${landmark.id}`, obstacle });
  }
  if (canonicalChunkJson(sources.map(({ obstacle }) => obstacle)) !== canonicalChunkJson(obstacles)) throw new Error(`Authored ${medium} obstacle provenance diverged from the server`);
  return sources.map(({ sourceId }) => sourceId);
}
function parseObstacleKey(key: string): CollisionObstacle {
  const [left, top, right, bottom] = key.split(':').map(Number);
  const obstacle = { left: left!, top: top!, right: right!, bottom: bottom! };
  if (authorityObstacleKey(obstacle) !== key) throw new Error(`Invalid suppressed obstacle key ${key}`);
  return obstacle;
}
/** Completeness digest for S3c: count plus a hash of every full record value in order. */
function recordDigest(values: readonly unknown[]): ChunkJson {
  return { count: values.length, hash: worldChunkHash(new TextEncoder().encode(canonicalChunkJson(values))) };
}
/** Server-authoritative static channels, records and metadata (static-world S1a). */
function captureAuthority(server: ServerLiveIslandReference, registry: ContentRegistry, width: number, height: number,
  channels: Record<string, ChunkArray>, add: (kind: string, ordinal: number, tileX: number, tileY: number, value: unknown) => void,
): { readonly reference: WorldChunkAuthorityReference; readonly metadata: ChunkJson } {
  const { ground, water } = server.composed;
  if (ground.elevations === undefined || ground.terrainPlaneBlocked === undefined || ground.horseJumpableTerrain === undefined) throw new Error('Server ground authority is missing terrain channels');
  if (water.elevations !== undefined || water.terrainPlaneBlocked !== undefined || water.terrainTransitions !== undefined) throw new Error('Server water authority gained terrain channels');
  // SW-D1: the water horse-jump mask is all false and is not materialized (absent == all false).
  if (water.horseJumpableTerrain?.some(Boolean)) throw new Error('Server water horse-jump mask is no longer all false (SW-D1)');
  channels['authority.ground.blocked'] = Uint8Array.from(ground.blocked, Number);
  channels['authority.ground.elevations'] = Int16Array.from(ground.elevations);
  channels['authority.ground.terrainPlaneBlocked'] = Uint8Array.from(ground.terrainPlaneBlocked);
  channels['authority.ground.horseJumpableTerrain'] = Uint8Array.from(ground.horseJumpableTerrain, Number);
  channels['authority.water.blocked'] = Uint8Array.from(water.blocked, Number);
  const combat = new Uint8Array(width * height);
  if (server.combatRegions.length > 0) for (let tileY = 0; tileY < height; tileY++) for (let tileX = 0; tileX < width; tileX++) {
    const region = server.combatPolicy.regionAt({ spaceId: TOPSIDE_SPACE_ID, tileX, tileY });
    if (region !== null) combat[tileY * width + tileX] = server.combatRegions.findIndex(({ id }) => id === region.id) + 1;
  }
  channels['authority.combatRegion'] = combat;
  const suppressedObstacleKeys = { ground: [...server.suppressedDecorationObstacleKeys.ground], water: [...server.suppressedDecorationObstacleKeys.water] };
  for (const medium of AUTHORITY_MEDIA) {
    const base = (server.base[medium].obstacles ?? []).map(plainObstacle);
    const authored = (medium === 'ground' ? server.ground : server.water).obstacles?.map(plainObstacle) ?? [];
    const baseSources = baseObstacleSources(base, medium);
    const authoredSources = authoredObstacleSources(server.document, authored, medium, registry);
    const rows: WorldChunkAuthorityObstacle[] = [
      ...base.map((obstacle, ordinal) => ({ group: 'base' as const, ordinal, ...obstacle, sourceId: baseSources[ordinal]! })),
      ...authored.map((obstacle, ordinal) => ({ group: 'authored' as const, ordinal, ...obstacle, sourceId: authoredSources[ordinal]! })),
    ];
    rows.forEach((row, index) => add(`authority.${medium}.obstacle`, index, row.left / TILE_SIZE_FIXED, row.top / TILE_SIZE_FIXED, row));
  }
  const suppressedRows: WorldChunkAuthoritySuppressedObstacle[] = AUTHORITY_MEDIA.flatMap(medium => suppressedObstacleKeys[medium].map(key => ({ medium, ...parseObstacleKey(key) })));
  suppressedRows.forEach((row, index) => add('authority.suppressedObstacleKey', index, row.left / TILE_SIZE_FIXED, row.top / TILE_SIZE_FIXED, row));
  ground.terrainTransitions?.forEach((value, index) => add('authority.ground.transition', index, value.lowerTileX, value.lowerTileY, value));
  // Already applied to authority.ground.blocked; retained so consumers can explain the override.
  const walkable = activeSpaceGroundWalkableTiles(registry, TOPSIDE_SPACE_ID, server.document.landmarks)
    .filter(({ tileX, tileY }) => tileX >= 0 && tileY >= 0 && tileX < width && tileY < height)
    .map(({ tileX, tileY }) => ({ tileX, tileY }));
  walkable.forEach((value, index) => add('authority.walkable', index, value.tileX, value.tileY, value));
  // Anchored at the EFFECTIVE tile so a chunk holds the resources that stand in it (a placement
  // may move one across a chunk edge); the generated tile stays in the value.
  server.resources.forEach((value, index) => add('authority.resource', index, value.effectiveTile.tileX, value.effectiveTile.tileY, value));
  server.orphanResourcePlacements.forEach((value, index) => add('authority.resourcePlacement', index, value.tile.tileX, value.tile.tileY, value));
  const generatedSuppressions = [...server.generatedSuppressions];
  return {
    reference: { composed: server.composed, suppressedObstacleKeys, combatPolicy: server.combatPolicy, combatRegions: server.combatRegions,
      generatedSuppressions, walkable, resources: server.resources, resourcePlacements: server.orphanResourcePlacements },
    metadata: json({ schema: WORLD_CHUNK_AUTHORITY_SCHEMA, combatRegions: server.combatRegions, generatedSuppressions,
      resources: recordDigest(server.resources), resourcePlacements: recordDigest(server.orphanResourcePlacements), collisions: { ground: collisionMetadata(ground), water: collisionMetadata(water) } }),
  };
}
/** Calls the same live terrain, decoration and collision functions as the client. */
export function captureWorldChunkSnapshot(row: LiveMapDocumentRow, registry: ContentRegistry,
  resolvedRoleMedium?: (tileX: number, tileY: number) => WorldChunkMedium | undefined,
  /** A reference already computed for this exact row and registry (avoids re-running the oracle). */
  serverReference?: ServerLiveIslandReference): WorldChunkSnapshot {
  const document = parseMapDocumentV3(row.documentJson, activeSurvivalLandmarks(registry, TOPSIDE_SPACE_ID));
  const raw = JSON.parse(row.documentJson) as { cells?: Record<string, { parts?: unknown }> };
  for (const [key, value] of Object.entries(raw.cells ?? {})) {
    if (value.parts !== undefined && !('parts' in (document.cells[key] ?? {}))) {
      throw new Error('Cell parts require the authoring parser from PR #66; refusing lossy materialization');
    }
  }
  const terrain = liveIslandTerrain(row, registry);
  if (terrain === null) throw new Error('Published map is not a compatible live island');
  const compiled = compileMapDocument(terrainDocumentForMapV3(document), runtimeTilesetResolver(registry.tilesets));
  const channels: Record<string, ChunkArray> = {};
  const records: WorldChunkRecord[] = [];
  const add = (kind: string, ordinal: number, tileX: number, tileY: number, value: unknown): void => {
    records.push({ kind, ordinal, tileX: Math.max(0, Math.min(terrain.width - 1, Math.floor(tileX))), tileY: Math.max(0, Math.min(terrain.height - 1, Math.floor(tileY))), value: json(value) });
  };
  for (const field of ['biomes', 'elevations', 'dirtCliffRoles', 'dirtTerraces', 'cliffFamilies', 'surfaceFamilies', 'ledges', 'authoredFarmland', 'terrainPlaneBlocked'] as const) {
    const value = terrain[field];
    if (value !== undefined) channels[field] = value;
  }
  const medium = new Uint8Array(terrain.width * terrain.height);
  const solidBlocked = new Uint8Array(medium.length);
  for (let index = 0; index < medium.length; index++) {
    const x = index % terrain.width, y = Math.floor(index / terrain.width);
    const biome = SURVIVAL_BIOMES[terrain.biomes[index]!];
    if (biome === undefined) throw new TypeError(`Unknown biome at ${x},${y}`);
    const cell = document.cells[`${x},${y}`];
    const source = { biome, surface: compiled.surfaces[index], feature: compiled.features[index] };
    medium[index] = WORLD_CHUNK_MEDIA.indexOf(worldChunkCellMedium({ ...source, ruleMedium: resolvedRoleMedium?.(x, y) }));
    // Never turn the old water/lava walking restriction into an unconditional solid.
    solidBlocked[index] = Number(cell?.collision === 'force_block'
      || (cell?.collision !== 'force_walk' && (cell?.ledge === true
        || (worldChunkCellMedium(source) === 'land' && terrain.blocked[index]))));
  }
  channels['medium'] = medium;
  channels['solidBlocked'] = solidBlocked;
  channels['blocked'] = Uint8Array.from(terrain.blocked, Number);
  channels['horseJumpableTerrain'] = Uint8Array.from(terrain.horseJumpableTerrain, Number);
  channels['features'] = Uint8Array.from(compiled.features, feature => MAP_FEATURE_KINDS.indexOf(feature));
  channels['compiledSurfaces'] = Uint8Array.from(compiled.surfaces, surface => MAP_SURFACE_KINDS.indexOf(surface));
  if (terrain.authoredSurfaces) channels['authoredSurfaces'] = Uint8Array.from(terrain.authoredSurfaces, surface => MAP_SURFACE_KINDS.indexOf(surface));
  terrain.terrainOverrides?.forEach((value, index) => { if (value !== null) add('terrainOverride', index, index % terrain.width, Math.floor(index / terrain.width), value); });
  terrain.terrainTransitions?.forEach((value, index) => add('transition', index, value.lowerTileX, value.lowerTileY, value));
  document.stairRuns?.forEach((value, index) => add('stairRun', index, value.x, value.y, value));
  for (const kind of ['objects', 'landmarks', 'scenery', 'anchors', 'resourcePlacements'] as const) document[kind]?.forEach((value, index) => add(kind, index, value.tileX, value.tileY, value));
  const suppressions = new Set(document.generatedSuppressions);
  const resources = generateSurvivalResources(terrain.seed, registry);
  resources.forEach((value, index) => add('generatedResource', index, value.tileX, value.tileY, value));
  // Preserve raw IDs and suppressed rows; suppression remains explicit data.
  const decorations = [
    ...generateSurvivalProceduralDecorations(terrain.seed, registry),
    ...document.landmarks.filter(landmark => landmark.enabled).map(landmark => ({ ...mapLandmarkDecoration(landmark), landmark })),
  ];
  decorations.forEach((value, index) => add('decoration', index, value.tileX, value.tileY, value));
  const procedural = new Set(generateSurvivalProceduralDecorations(terrain.seed, registry).map(({ id }) => id));
  for (const decoration of generateSurvivalDecorations(terrain.seed, registry)) if (!procedural.has(decoration.id)) suppressions.add(`decoration-${decoration.id}`);
  for (const decoration of generateSurvivalLandmarkDecorations(activeSurvivalLandmarks(registry, TOPSIDE_SPACE_ID))) suppressions.add(`decoration-${decoration.id}`);
  const docks = activeSpaceGroundWalkableTiles(registry, TOPSIDE_SPACE_ID, document.landmarks);
  const clientCollision = (medium: 'ground' | 'water'): CollisionMap => {
    const base = createClientCollisionMap(terrain, [], [], medium, [], suppressions, docks, registry);
    const collision: CollisionMap = { width: base.width, height: base.height, blocked: base.blocked,
      ...(base.elevations === undefined ? {} : { elevations: base.elevations }),
      ...(base.terrainPlaneBlocked === undefined ? {} : { terrainPlaneBlocked: base.terrainPlaneBlocked }),
      ...(base.terrainMinimumElevation === undefined ? {} : { terrainMinimumElevation: base.terrainMinimumElevation }),
      ...(base.horseJumpableTerrain === undefined ? {} : { horseJumpableTerrain: base.horseJumpableTerrain }),
      ...(base.terrainTransitions === undefined ? {} : { terrainTransitions: base.terrainTransitions }),
    };
    return { ...collision, obstacles: [...(base.obstacles ?? []), ...liveMapObjectCollisionObstacles(document, medium, registry)] };
  };
  const server = serverReference ?? serverLiveIslandReference(row, registry);
  const collisions = { clientGround: clientCollision('ground'), clientWater: clientCollision('water'), serverGround: server.ground, serverWater: server.water };
  const collisionsMetadata: Record<string, ChunkJson> = {};
  for (const [name, collision] of Object.entries(collisions)) {
    channels[`${name}.blocked`] = Uint8Array.from(collision.blocked, Number);
    if (collision.elevations) channels[`${name}.elevations`] = Int16Array.from(collision.elevations);
    if (collision.terrainPlaneBlocked) channels[`${name}.terrainPlaneBlocked`] = Uint8Array.from(collision.terrainPlaneBlocked);
    if (collision.horseJumpableTerrain) channels[`${name}.horseJumpableTerrain`] = Uint8Array.from(collision.horseJumpableTerrain, Number);
    collision.obstacles?.forEach((value, index) => add(`${name}.obstacle`, index, value.left / TILE_SIZE_FIXED, value.top / TILE_SIZE_FIXED, value));
    collision.terrainTransitions?.forEach((value, index) => add(`${name}.transition`, index, value.lowerTileX, value.lowerTileY, value));
    collisionsMetadata[name] = collisionMetadata(collision);
  }
  const authority = captureAuthority(server, registry, terrain.width, terrain.height, channels, add);
  const terrainMeta: Record<string, unknown> = {};
  for (const field of ['seed', 'version', 'generator', 'defaultCliffFamily', 'defaultSurfaceFamily', 'cliffFamilyIds', 'projectionStyle', 'baseDatum', 'fixedTerrainPlane', 'raisedTerrainCollisionClassified'] as const) if (terrain[field] !== undefined) terrainMeta[field] = terrain[field];
  terrainMeta['hasTraversalChannels'] = terrain.traversalChannels !== undefined;
  terrainMeta['hasCellParts'] = terrain.cellParts !== undefined;
  terrainMeta['hasTransitions'] = terrain.terrainTransitions !== undefined;
  terrainMeta['hasOverrides'] = terrain.terrainOverrides !== undefined;
  return { terrain, document, channels, records, collisions, authority: authority.reference, metadata: {
    mediumSchema: WORLD_CHUNK_MEDIUM_SCHEMA, mediumPalette: json(WORLD_CHUNK_MEDIA),
    terrain: json(terrainMeta), collisions: collisionsMetadata, authority: authority.metadata,
    channels: json(Object.fromEntries(Object.entries(channels).map(([name, value]) => [name, { type: value instanceof Int16Array ? 'i16' : 'u8', planes: value.length / (terrain.width * terrain.height) }]))),
    surfacePalette: json(MAP_SURFACE_KINDS), featurePalette: json(MAP_FEATURE_KINDS),
    biomePalette: json(SURVIVAL_BIOMES), surfaceFamilyPalette: json(TERRAIN_SURFACE_FAMILY_IDS),
    // Authored global policy and definitions are retained losslessly, separate from terrain.
    document: json({ id: document.id, provenance: document.provenance, layers: document.layers, prefabs: document.prefabs,
      generatedSuppressions: document.generatedSuppressions, entityStates: document.entityStates, combatRegions: document.combatRegions }),
  } };
}
export interface MaterializedWorldChunks { readonly manifest: WorldChunkManifest; readonly blobs: readonly Uint8Array[]; }
export interface MaterializationOptions {
  readonly atlasPackIdsForAssets?: (assetIds: readonly string[]) => readonly string[];
  readonly assetRevision?: string;
  readonly includeServerOracle?: boolean;
}
export function materializeWorldChunks(snapshot: WorldChunkSnapshot, row: LiveMapDocumentRow, registry: ContentRegistry,
  options: MaterializationOptions = {}): MaterializedWorldChunks {
  const atlasPackIdsForAssets = options.atlasPackIdsForAssets ?? (() => []);
  const assetRevision = options.assetRevision ?? registry.contentHash;
  const included = (name: string): boolean => options.includeServerOracle === true || !name.startsWith('server');
  const channels = Object.fromEntries(Object.entries(snapshot.channels).filter(([name]) => included(name)));
  const sourceRecords = snapshot.records.filter(record => included(record.kind));
  const metadata = { ...snapshot.metadata,
    includesServerOracle: options.includeServerOracle === true,
    channels: Object.fromEntries(Object.entries(snapshot.metadata['channels'] as Record<string, ChunkJson>).filter(([name]) => included(name))),
    collisions: Object.fromEntries(Object.entries(snapshot.metadata['collisions'] as Record<string, ChunkJson>).filter(([name]) => included(name))),
  };
  const { width, height, spaceId } = snapshot.terrain;
  const blobs: Uint8Array[] = [];
  const heads: WorldChunkManifest['chunks'][number][] = [];
  const commonAssets = new Set<string>();
  // Conservative terrain closure until per-biome art dependency analysis is integrated.
  assetStrings(TERRAIN_CLIFF_FAMILIES, commonAssets);
  assetStrings(TERRAIN_SURFACE_FAMILIES, commonAssets);
  for (const tileset of registry.tilesets.values()) assetStrings(tileset, commonAssets);
  for (const id of chunkTerrainAssetIds()) commonAssets.add(id);
  const byChunk = new Map<string, WorldChunkRecord[]>();
  for (const record of sourceRecords) {
    const key = `${Math.floor(record.tileX / WORLD_CHUNK_SIZE)}:${Math.floor(record.tileY / WORLD_CHUNK_SIZE)}`;
    const list = byChunk.get(key) ?? []; list.push(record); byChunk.set(key, list);
  }
  for (let cy = 0; cy < Math.ceil(height / WORLD_CHUNK_SIZE); cy++) for (let cx = 0; cx < Math.ceil(width / WORLD_CHUNK_SIZE); cx++) {
    const records = byChunk.get(`${cx}:${cy}`) ?? [];
    const assets = new Set(commonAssets);
    for (const record of records) {
      assetStrings(record.value, assets);
      const value = record.value as Record<string, ChunkJson>;
      if (record.kind === 'objects') {
        const prefab = snapshot.document.prefabs.find(prefab => prefab.id === value['prefabId']);
        if (prefab) assetStrings(prefab, assets);
      }
      if (record.kind === 'generatedResource') {
        const resource = [...registry.resources.values()].find(resource => resource.runtimeKind === value['kind']);
        if (resource) for (const asset of chunkResourceAssetIds(resource.visual)) assets.add(asset);
      }
      if (record.kind === 'decoration' || record.kind === 'landmarks') {
        for (const asset of chunkDecorationAssetIds(String(value['kind']), Number(value['variant']), registry)) assets.add(asset);
      }
    }
    const cellParts: Record<string, ChunkJson> = {};
    for (let y = 0; y < WORLD_CHUNK_SIZE; y++) for (let x = 0; x < WORLD_CHUNK_SIZE; x++) {
      const cell = snapshot.document.cells[`${cx * WORLD_CHUNK_SIZE + x},${cy * WORLD_CHUNK_SIZE + y}`] as unknown as Record<string, unknown> | undefined;
      if (cell?.['parts'] !== undefined) cellParts[String(y * WORLD_CHUNK_SIZE + x)] = json(cell['parts']);
    }
    const assetIds = [...assets].sort();
    const bytes = encodeWorldChunk({ schema: 1, mediumSchema: WORLD_CHUNK_MEDIUM_SCHEMA, authoritySchema: WORLD_CHUNK_AUTHORITY_SCHEMA, spaceId, cx, cy, assetRevision,
      arrays: Object.fromEntries(Object.entries(channels).map(([name, source]) => [name, sliceWorldChunkChannel(source, width, height, cx, cy, name === 'medium' ? WORLD_CHUNK_VOID : /blocked/iu.test(name) ? 1 : 0)])),
      records, assetIds, atlasPackIds: [...new Set(atlasPackIdsForAssets(assetIds))].sort(),
      ...(Object.keys(cellParts).length ? { cellParts } : {}),
    });
    blobs.push(bytes);
    heads.push({ cx, cy, contentHash: decodeWorldChunk(bytes).contentHash, byteLength: bytes.length });
  }
  return { blobs, manifest: { schema: 1, chunkSize: WORLD_CHUNK_SIZE, spaceId, width, height, assetRevision,
    sourceRevision: row.revision, sourceHash: row.contentHash, metadata, chunks: heads } };
}
export function verifyWorldChunkParity(snapshot: WorldChunkSnapshot, materialized: MaterializedWorldChunks): void {
  const store = new ChunkTerrainStore(materialized.manifest, snapshot.terrain.tilesets);
  for (const bytes of [...materialized.blobs].reverse()) store.install(bytes);
  for (const [name, expected] of Object.entries(snapshot.terrain)) {
    if (name === 'tilesets') continue; // same immutable registry resolver supplied above
    const actual = (store as unknown as Record<string, unknown>)[name];
    const canonical = (value: unknown): string => canonicalChunkJson(value instanceof Map ? [...value.entries()].sort(([a], [b]) => a - b) : value);
    if (canonical(actual) !== canonical(expected)) throw new Error(`TerrainArray parity failed: ${name}`);
  }
  const included = (name: string): boolean => materialized.manifest.metadata['includesServerOracle'] === true || !name.startsWith('server');
  for (const [name, expected] of Object.entries(snapshot.channels).filter(([name]) => included(name))) {
    const actual = store.channels[name];
    if (!actual || actual.length !== expected.length || actual.some((value, index) => value !== expected[index])) throw new Error(`Chunk parity failed: ${name}`);
  }
  for (const kind of new Set(snapshot.records.filter(record => included(record.kind)).map(record => record.kind))) if (canonicalChunkJson(store.records(kind)) !== canonicalChunkJson(snapshot.records.filter(record => record.kind === kind))) throw new Error(`Chunk record parity failed: ${kind}`);
  for (const name of ['clientGround', 'clientWater', 'serverGround', 'serverWater'] as const) {
    if (!included(name)) continue;
    if (canonicalChunkJson(store.collision(name)) !== canonicalChunkJson(snapshot.collisions[name])) throw new Error(`Chunk collision parity failed: ${name}`);
  }
  verifyAuthorityParity(store, materialized.manifest, snapshot.authority);
}
function authorityMetadata(manifest: WorldChunkManifest): { readonly combatRegions: readonly CombatRegion[]; readonly generatedSuppressions: readonly string[];
  readonly resources: ChunkJson; readonly resourcePlacements: ChunkJson; readonly collisions: Readonly<Record<AuthorityMedium, Record<string, ChunkJson>>> } {
  const value = manifest.metadata['authority'] as Record<string, unknown> | undefined;
  if (value?.['schema'] !== WORLD_CHUNK_AUTHORITY_SCHEMA) throw new Error('Manifest has no authority metadata');
  return value as unknown as ReturnType<typeof authorityMetadata>;
}
/** Rebuilds the server's static composition for one medium from a complete
 * chunk set: authority channels, ordered obstacle groups and suppressed keys. */
export function rebuildAuthorityCollision(store: ChunkTerrainStore, manifest: WorldChunkManifest, medium: AuthorityMedium): CollisionMap {
  if (!store.complete) throw new Error('Authority reconstruction requires every manifest chunk');
  const meta = authorityMetadata(manifest).collisions[medium];
  const { hasTraversalChannels, ...geometry } = meta;
  delete geometry['terrainTransitions']; // rebuilt from ordered transition records below
  const prefix = `authority.${medium}.`;
  const channel = (name: string): ChunkArray | undefined => store.channels[`${prefix}${name}`];
  const blocked = channel('blocked');
  if (!(blocked instanceof Uint8Array)) throw new Error(`Missing ${prefix}blocked`);
  const plane = channel('terrainPlaneBlocked') as Uint8Array | undefined, elevations = channel('elevations') as Int16Array | undefined;
  const horse = channel('horseJumpableTerrain');
  const obstacles = composeAuthorityObstacles(
    store.records(`${prefix}obstacle`).map(record => record.value as unknown as WorldChunkAuthorityObstacle),
    store.records('authority.suppressedObstacleKey').map(record => record.value as unknown as WorldChunkAuthoritySuppressedObstacle),
    medium,
  );
  return { ...(geometry as object), width: store.width, height: store.height,
    ...(hasTraversalChannels === true ? { traversalChannels: store.traversalChannels! } : {}),
    blocked: Array.from(blocked, Boolean),
    ...(elevations === undefined ? {} : { elevations }),
    ...(plane === undefined ? {} : { terrainPlaneBlocked: plane }),
    // SW-D1: no water horse-jump channel; absent is all false, as the server supplies.
    horseJumpableTerrain: horse === undefined ? Array<boolean>(store.width * store.height).fill(false) : Array.from(horse, Boolean),
    ...(Object.hasOwn(meta, 'terrainTransitions') ? { terrainTransitions: store.records(`${prefix}transition`).map(record => record.value as unknown as NonNullable<CollisionMap['terrainTransitions']>[number]) } : {}),
    obstacles };
}
/** Deep, ordered comparison of every authority channel cell and record against the server oracle. */
export function verifyAuthorityParity(store: ChunkTerrainStore, manifest: WorldChunkManifest, reference: WorldChunkAuthorityReference): void {
  for (const medium of AUTHORITY_MEDIA) {
    if (canonicalChunkJson(rebuildAuthorityCollision(store, manifest, medium)) !== canonicalChunkJson(reference.composed[medium])) throw new Error(`Authority collision parity failed: ${medium}`);
  }
  const suppressed = store.records('authority.suppressedObstacleKey').map(record => record.value as unknown as WorldChunkAuthoritySuppressedObstacle);
  for (const medium of AUTHORITY_MEDIA) {
    if (canonicalChunkJson(suppressed.filter(row => row.medium === medium).map(authorityObstacleKey)) !== canonicalChunkJson(reference.suppressedObstacleKeys[medium])) throw new Error(`Authority suppression parity failed: ${medium}`);
  }
  const metadata = authorityMetadata(manifest);
  if (canonicalChunkJson(metadata.combatRegions) !== canonicalChunkJson(reference.combatRegions)
    || canonicalChunkJson(metadata.generatedSuppressions) !== canonicalChunkJson(reference.generatedSuppressions)) throw new Error('Authority metadata parity failed');
  const policy = new CombatRegionPolicy(metadata.combatRegions);
  const combat = store.channels['authority.combatRegion'];
  if (!(combat instanceof Uint8Array)) throw new Error('Missing authority.combatRegion');
  for (let tileY = 0; tileY < store.height; tileY++) for (let tileX = 0; tileX < store.width; tileX++) {
    const point = { spaceId: TOPSIDE_SPACE_ID, tileX, tileY };
    const expected = reference.combatPolicy.regionAt(point)?.id, rebuilt = policy.regionAt(point)?.id;
    const value = combat[tileY * store.width + tileX]!;
    const actual = value === 0 ? undefined : metadata.combatRegions[value - 1]?.id;
    if (actual !== expected || rebuilt !== expected) throw new Error(`Authority combat region parity failed at ${tileX},${tileY}`);
  }
  const resources = store.records('authority.resource').map(record => record.value);
  if (canonicalChunkJson(resources) !== canonicalChunkJson(reference.resources)
    || canonicalChunkJson(metadata.resources) !== canonicalChunkJson(recordDigest(resources))) throw new Error('Authority resource parity failed');
  const placements = store.records('authority.resourcePlacement').map(record => record.value);
  if (canonicalChunkJson(placements) !== canonicalChunkJson(reference.resourcePlacements)
    || canonicalChunkJson(metadata.resourcePlacements) !== canonicalChunkJson(recordDigest(placements))) throw new Error('Authority resource placement parity failed');
  if (canonicalChunkJson(store.records('authority.walkable').map(record => record.value)) !== canonicalChunkJson(reference.walkable)) throw new Error('Authority walkable parity failed');
  for (const { tileX, tileY } of reference.walkable) if (store.channels['authority.ground.blocked']![tileY * store.width + tileX] !== 0) throw new Error(`Authority walkable tile blocked at ${tileX},${tileY}`);
}
/** Everything the S5b publish pipeline needs from one materialisation of live rows. */
export interface MaterializedLiveRows {
  readonly result: MaterializedWorldChunks;
  /** Exactly the published `manifestJson` (canonical JSON plus a newline, as written to manifest.json). */
  readonly manifestJson: string;
  /** The content registry hash the server's publishWorldChunkShadow compares (`contentRegistry(ctx).contentHash`). */
  readonly registryContentHash: string;
  readonly assetRevision: string;
  readonly atlasPacksResolved: boolean;
}
export interface MaterializeLiveRowsInput {
  readonly row: LiveMapDocumentRow;
  /** Null when the world has no content head: the server then uses the bootstrap registry. */
  readonly contentRows: readonly ContentDefinitionRow[] | null;
  /** The served `generated/atlas.packs.json` text; its hash is the client's asset revision. */
  readonly atlasIndexSource?: string | null;
  readonly assetRevision?: string;
  /** Publish the server oracle channels too (`--audit`); never used for a real publication. */
  readonly audit?: boolean;
}
/** Materialise and parity-check (against the server oracle) the chunks for one live map row and content rows. */
export function materializeWorldChunksFromRows(input: MaterializeLiveRowsInput): MaterializedLiveRows {
  const content = input.contentRows === null ? null : buildContentRegistry([...input.contentRows]);
  if (content && !content.report.valid) throw new Error(`Invalid content rows: ${JSON.stringify(content.report.errors)}`);
  const registry = content?.registry ?? bootstrapContentRegistry();
  const atlasIndexSource = input.atlasIndexSource ?? null;
  const atlasIndex = atlasIndexSource ? JSON.parse(atlasIndexSource) as { assetPacks: Record<string, string> } : null;
  const packIds = (assetIds: readonly string[]): readonly string[] => atlasIndex === null ? [] : assetIds.map(id => {
    const pack = atlasIndex.assetPacks?.[id];
    if (typeof pack !== 'string') throw new Error(`Atlas index has no pack for ${id}`);
    return pack;
  });
  const assetRevision = input.assetRevision ?? (atlasIndexSource ? worldChunkHash(new TextEncoder().encode(atlasIndexSource)) : registry.contentHash);
  const snapshot = captureWorldChunkSnapshot(input.row, registry);
  const audit = materializeWorldChunks(snapshot, input.row, registry, { atlasPackIdsForAssets: packIds, assetRevision, includeServerOracle: true });
  verifyWorldChunkParity(snapshot, audit);
  const result = input.audit === true ? audit : materializeWorldChunks(snapshot, input.row, registry, { atlasPackIdsForAssets: packIds, assetRevision });
  if (result !== audit) verifyWorldChunkParity(snapshot, result);
  return { result, manifestJson: canonicalChunkJson(result.manifest) + '\n', registryContentHash: registry.contentHash, assetRevision, atlasPacksResolved: atlasIndex !== null };
}
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const value = (flag: string): string | undefined => { const index = args.indexOf(flag); return index < 0 ? undefined : args[index + 1]; };
  const input = value('--input');
  const output = value('--output');
  if (!output || (!input && !args.includes('--bootstrap'))) throw new Error('Usage: tsx scripts/materialize-world-chunks.ts (--input map.json | --bootstrap) --output directory');
  const contentRowsPath = value('--content-rows');
  const contentRows = contentRowsPath ? JSON.parse(await readFile(contentRowsPath, 'utf8')) as ContentDefinitionRow[] : null;
  const atlasIndexPath = value('--atlas-index');
  const atlasIndexSource = atlasIndexPath ? await readFile(atlasIndexPath, 'utf8') : null;
  const assetRevisionFlag = value('--asset-revision');
  const source: unknown = input ? JSON.parse(await readFile(input, 'utf8')) : null;
  const row = typeof source === 'object' && source !== null && 'documentJson' in source ? source as LiveMapDocumentRow : (() => {
    const registry = contentRows === null ? bootstrapContentRegistry() : buildContentRegistry(contentRows).registry;
    const landmarks = activeSurvivalLandmarks(registry, TOPSIDE_SPACE_ID);
    const document = parseMapDocumentV3(JSON.stringify(source ?? createLiveIslandMapDocument({ landmarks })), landmarks);
    const documentJson = serializeMapDocumentV3(document);
    return { mapId: LIVE_ISLAND_MAP_ID, revision: document.revision, documentJson, contentHash: worldChunkHash(new TextEncoder().encode(documentJson)) };
  })();
  const { result, manifestJson, registryContentHash, assetRevision, atlasPacksResolved } = materializeWorldChunksFromRows({
    row, contentRows, atlasIndexSource, audit: args.includes('--audit'), ...(assetRevisionFlag === undefined ? {} : { assetRevision: assetRevisionFlag }) });
  await mkdir(output, { recursive: true });
  const sizes: { cx: number; cy: number; raw: number; gzip: number; brotli: number }[] = [];
  for (let index = 0; index < result.blobs.length; index++) {
    const head = result.manifest.chunks[index]!;
    const bytes = result.blobs[index]!;
    const gzip = gzipSync(bytes, { level: 9 });
    const brotli = brotliCompressSync(bytes, { params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 5 } });
    await writeFile(resolve(output, `${head.contentHash}.bin`), bytes);
    await writeFile(resolve(output, `${head.contentHash}.bin.gz`), gzip);
    await writeFile(resolve(output, `${head.contentHash}.bin.br`), brotli);
    sizes.push({ cx: head.cx, cy: head.cy, raw: bytes.length, gzip: gzip.length, brotli: brotli.length });
  }
  const manifestBytes = new TextEncoder().encode(manifestJson);
  await writeFile(resolve(output, 'manifest.json'), manifestBytes);
  const totals = sizes.reduce((total, size) => ({ raw: total.raw + size.raw, gzip: total.gzip + size.gzip, brotli: total.brotli + size.brotli }), { raw: 0, gzip: 0, brotli: 0 });
  await writeFile(resolve(output, 'sizes.json'), JSON.stringify({ includesServerOracle: args.includes('--audit'), compression: { gzipLevel: 9, brotliQuality: 5 }, totals, manifestBytes: manifestBytes.length, chunks: sizes }, null, 2) + '\n');
  console.log(JSON.stringify({ chunks: result.blobs.length, totals, manifestBytes: manifestBytes.length, sourceHash: row.contentHash, contentHash: registryContentHash, assetRevision, atlasPacksResolved, parity: 'passed' }));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
