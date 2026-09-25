import {
  CombatRegionPolicy, resolvedMapBiomeAt,
  type CollisionMap, type CollisionObstacle, type CombatRegion, type ContentRegistry, type MapBiomeId,
  type MapDocumentV3, type MediumCollisionChannels, type TerrainTransition,
} from '@orchard/sim';
import { authorityObstacleKey, validateRuntimeManifest, verifyRuntimeChunk } from '@orchard/sim/chunk-runtime';
import {
  canonicalChunkJson, WORLD_CHUNK_AUTHORITY_SCHEMA, WORLD_CHUNK_SIZE, WORLD_CHUNK_STRIDE, WORLD_CHUNK_VOID,
  type ChunkArray, type ChunkJson, type WorldChunkAuthorityObstacle, type WorldChunkAuthoritySuppressedObstacle,
  type WorldChunkManifest, type WorldChunkRecord,
} from '@orchard/sim/world-chunk';

/**
 * Static-world S1b: a pure chunk -> live-island runtime assembler.
 *
 * Nothing in the live module calls this yet (S2b adds the dispatcher). It rebuilds,
 * from a published chunk manifest and its authority blobs alone, the parts of the
 * server's `compiledLiveIslandRuntime` that collision, combat, suppression and the
 * static document consumers read:
 *
 * - `ground` / `water`: the live-map overlay exactly as `compiledLiveIslandRuntime`
 *   builds it (same fields, authored obstacles only). `liveMapCollisionForSpace`
 *   composes it over the precomputed base unchanged, so the runtime is a drop-in
 *   for the collision call sites.
 * - `generatedSuppressions`, `suppressedDecorationObstacleKeys`, `combatPolicy`.
 * - `baseObstacles`: the ordered static base group (precomputed decorations), so a
 *   caller can compose without the precomputed module (`composeChunkIslandCollision`).
 * - `staticView`: objects, landmarks and resource placements from chunk records,
 *   prefabs, combat regions and generated suppressions from the manifest, and
 *   `biomeAt` from the biomes channel (S3b consumers; `documentStaticView` gives the
 *   same shape for a compiled document).
 *
 * Whole-island arrays start void and solid. Each blob is decoded once, copied, and
 * dropped. A missing head, blob or invalid blob leaves its cells void and solid and
 * is reported in `issues`; it is never silently walkable. The result is
 * deterministic for (manifest, blobs, registry, options); the caller caches it by
 * `key` (shadow revision, map source and content hash).
 */

export type ChunkAuthorityMedium = 'ground' | 'water';
const MEDIA: readonly ChunkAuthorityMedium[] = ['ground', 'water'];
const CELL_COUNT = WORLD_CHUNK_STRIDE ** 2;
const NO_BIOME = 255;

export type ChunkRuntimeIssueKind =
  | 'head_missing' | 'blob_missing' | 'blob_invalid' | 'authority_missing' | 'record_order';
export interface ChunkRuntimeIssue {
  readonly kind: ChunkRuntimeIssueKind;
  readonly cx?: number;
  readonly cy?: number;
  readonly detail?: string;
}

/** The document fields S3b consumers read, narrowed; `biomeAt` replaces `resolvedMapBiomeAt(document, ...)`. */
export interface LiveIslandStaticView {
  readonly id: string;
  readonly objects: MapDocumentV3['objects'];
  readonly landmarks: MapDocumentV3['landmarks'];
  readonly prefabs: MapDocumentV3['prefabs'];
  readonly resourcePlacements: NonNullable<MapDocumentV3['resourcePlacements']>;
  readonly combatRegions: readonly CombatRegion[];
  readonly generatedSuppressions: readonly string[];
  /** Undefined outside the map or in a missing chunk. */
  biomeAt(tileX: number, tileY: number): MapBiomeId | undefined;
}

/** The collision/combat/suppression subset of the server's `LiveIslandRuntime`. */
export interface LiveIslandCollisionRuntime {
  readonly combatPolicy: CombatRegionPolicy;
  readonly key: string;
  readonly ground: CollisionMap;
  readonly water: CollisionMap;
  readonly generatedSuppressions: ReadonlySet<string>;
  readonly suppressedDecorationObstacleKeys: Readonly<Record<ChunkAuthorityMedium, ReadonlySet<string>>>;
}

export interface ChunkLiveIslandRuntime extends LiveIslandCollisionRuntime {
  readonly source: 'chunks';
  /** Static base obstacle group in server order, before the suppressed-key filter. */
  readonly baseObstacles: Readonly<Record<ChunkAuthorityMedium, readonly CollisionObstacle[]>>;
  readonly staticView: LiveIslandStaticView;
  /** True when every expected chunk decoded and every record stream is contiguous. */
  readonly complete: boolean;
  readonly issues: readonly ChunkRuntimeIssue[];
  /** Set only when `options.shadowContentHash` is given and differs from the registry. */
  readonly stale: boolean;
  readonly stats: { readonly expectedChunks: number; readonly decodedChunks: number; readonly decodedBytes: number };
}

export interface AssembleChunkRuntimeOptions {
  /** `world_chunk_shadow.revision` of the pinned heads; part of the cache key. */
  readonly shadowRevision?: number;
  /** `world_chunk_shadow.contentHash` (the registry hash at publication). */
  readonly shadowContentHash?: string;
}

interface AuthorityMetadata {
  readonly combatRegions: readonly CombatRegion[];
  readonly generatedSuppressions: readonly string[];
  readonly collisions: Readonly<Record<ChunkAuthorityMedium, Readonly<Record<string, ChunkJson>>>>;
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function has(value: object, key: string): boolean { return Object.prototype.hasOwnProperty.call(value, key); }

function authorityMetadata(manifest: WorldChunkManifest): AuthorityMetadata {
  const value = manifest.metadata['authority'];
  if (!record(value) || value['schema'] !== WORLD_CHUNK_AUTHORITY_SCHEMA || !Array.isArray(value['combatRegions'])
    || !Array.isArray(value['generatedSuppressions']) || !record(value['collisions'])
    || !record(value['collisions']['ground']) || !record(value['collisions']['water'])) throw new Error('chunk_authority_metadata_missing');
  return value as unknown as AuthorityMetadata;
}

/** Cache key: pinned shadow revision, map source revision/hash and live content hash. */
export function chunkLiveIslandRuntimeKey(manifest: Pick<WorldChunkManifest, 'spaceId' | 'sourceRevision' | 'sourceHash'>,
  registryContentHash: string, shadowRevision?: number): string {
  return `chunks:${manifest.spaceId}:${shadowRevision ?? 'unpinned'}:${manifest.sourceRevision}:${manifest.sourceHash}:${registryContentHash}`;
}

/** Copies the halo-free interior of one chunk channel into a whole-island array. */
function copyInterior(source: ChunkArray, target: Uint8Array | Int16Array, width: number, height: number, cx: number, cy: number): boolean {
  const planes = target.length / (width * height);
  if (source.constructor !== target.constructor || source.length !== planes * CELL_COUNT) return false;
  const count = Math.min(WORLD_CHUNK_SIZE, width - cx * WORLD_CHUNK_SIZE);
  for (let plane = 0; plane < planes; plane++) for (let y = 0; y < WORLD_CHUNK_SIZE; y++) {
    const tileY = cy * WORLD_CHUNK_SIZE + y;
    if (tileY >= height) break;
    const from = plane * CELL_COUNT + (y + 1) * WORLD_CHUNK_STRIDE + 1;
    (target as Uint8Array).set((source as Uint8Array).subarray(from, from + count), plane * width * height + tileY * width + cx * WORLD_CHUNK_SIZE);
  }
  return true;
}

function booleans(values: Uint8Array): boolean[] {
  const result = new Array<boolean>(values.length);
  for (let index = 0; index < values.length; index++) result[index] = values[index] !== 0;
  return result;
}

function plain(value: { left: number; top: number; right: number; bottom: number }): CollisionObstacle {
  return { left: value.left, top: value.top, right: value.right, bottom: value.bottom };
}

export function assembleChunkLiveIslandRuntime(
  manifestInput: WorldChunkManifest,
  readBlob: (contentHash: string) => Uint8Array | undefined,
  registry: Pick<ContentRegistry, 'contentHash'>,
  options: AssembleChunkRuntimeOptions = {},
): ChunkLiveIslandRuntime {
  const manifest = validateRuntimeManifest(manifestInput);
  const meta = authorityMetadata(manifest);
  const { width, height } = manifest;
  const cellCount = width * height;
  const columns = Math.ceil(width / WORLD_CHUNK_SIZE), rows = Math.ceil(height / WORLD_CHUNK_SIZE);
  const channelSpecs = record(manifest.metadata['channels']) ? manifest.metadata['channels'] : {};
  const planeSpec = channelSpecs['authority.ground.terrainPlaneBlocked'];
  const planes = record(planeSpec) && Number.isSafeInteger(planeSpec['planes']) && (planeSpec['planes'] as number) >= 1 ? planeSpec['planes'] as number : 1;
  // Void and solid until a verified chunk overwrites its cells.
  const arrays = {
    'authority.ground.blocked': new Uint8Array(cellCount).fill(1),
    'authority.ground.elevations': new Int16Array(cellCount),
    'authority.ground.terrainPlaneBlocked': new Uint8Array(cellCount * planes).fill(1),
    'authority.ground.horseJumpableTerrain': new Uint8Array(cellCount),
    'authority.water.blocked': new Uint8Array(cellCount).fill(1),
    medium: new Uint8Array(cellCount).fill(WORLD_CHUNK_VOID),
    solidBlocked: new Uint8Array(cellCount).fill(1),
    biomes: new Uint8Array(cellCount).fill(NO_BIOME),
  } as const;
  const wanted = new Set(['authority.ground.obstacle', 'authority.water.obstacle', 'authority.suppressedObstacleKey',
    'authority.ground.transition', 'objects', 'landmarks', 'resourcePlacements']);
  const records = new Map<string, WorldChunkRecord[]>();
  const issues: ChunkRuntimeIssue[] = [];
  const heads = new Map(manifest.chunks.map(head => [`${head.cx}:${head.cy}`, head]));
  let decodedChunks = 0, decodedBytes = 0;
  for (let cy = 0; cy < rows; cy++) for (let cx = 0; cx < columns; cx++) {
    const head = heads.get(`${cx}:${cy}`);
    if (head === undefined) { issues.push({ kind: 'head_missing', cx, cy }); continue; }
    const bytes = readBlob(head.contentHash);
    if (bytes === undefined) { issues.push({ kind: 'blob_missing', cx, cy, detail: head.contentHash }); continue; }
    let chunk;
    try {
      chunk = verifyRuntimeChunk(bytes, manifest, cx, cy);
    } catch (error) {
      issues.push({ kind: 'blob_invalid', cx, cy, detail: error instanceof Error ? error.message : String(error) });
      continue;
    }
    if (chunk.authoritySchema !== WORLD_CHUNK_AUTHORITY_SCHEMA) { issues.push({ kind: 'authority_missing', cx, cy }); continue; }
    // Validate every channel shape before writing any cell of this chunk.
    const names = Object.keys(arrays) as (keyof typeof arrays)[];
    const bad = names.find(name => {
      const source = chunk.arrays[name], target = arrays[name];
      return source === undefined || source.constructor !== target.constructor || source.length !== (target.length / cellCount) * CELL_COUNT;
    });
    if (bad !== undefined) { issues.push({ kind: 'blob_invalid', cx, cy, detail: `channel ${bad}` }); continue; }
    for (const name of names) copyInterior(chunk.arrays[name]!, arrays[name], width, height, cx, cy);
    for (const item of chunk.records) {
      if (!wanted.has(item.kind)) continue;
      const list = records.get(item.kind);
      if (list === undefined) records.set(item.kind, [item]); else list.push(item);
    }
    decodedChunks += 1;
    decodedBytes += bytes.byteLength;
  }
  const complete = issues.length === 0;
  const ordered = <T>(kind: string): T[] => {
    const list = (records.get(kind) ?? []).sort((a, b) => a.ordinal - b.ordinal);
    if (complete && list.some((item, index) => item.ordinal !== index)) issues.push({ kind: 'record_order', detail: kind });
    return list.map(item => item.value as unknown as T);
  };
  const obstacleGroups = (medium: ChunkAuthorityMedium): { base: CollisionObstacle[]; authored: CollisionObstacle[] } => {
    const base: CollisionObstacle[] = [], authored: CollisionObstacle[] = [];
    let misordered = false;
    for (const value of ordered<WorldChunkAuthorityObstacle>(`authority.${medium}.obstacle`)) {
      const group = value.group === 'base' ? base : authored;
      misordered ||= value.ordinal !== group.length || (value.group === 'base' && authored.length > 0);
      group.push(plain(value));
    }
    if (complete && misordered) issues.push({ kind: 'record_order', detail: `authority.${medium}.obstacle groups` });
    return { base, authored };
  };
  const groundObstacles = obstacleGroups('ground'), waterObstacles = obstacleGroups('water');
  const suppressedRows = ordered<WorldChunkAuthoritySuppressedObstacle>('authority.suppressedObstacleKey');
  const suppressedDecorationObstacleKeys = {
    ground: new Set(suppressedRows.filter(row => row.medium === 'ground').map(authorityObstacleKey)),
    water: new Set(suppressedRows.filter(row => row.medium === 'water').map(authorityObstacleKey)),
  };
  const groundMeta = meta.collisions.ground, waterMeta = meta.collisions.water;
  const traversalChannels: MediumCollisionChannels | undefined = groundMeta['hasTraversalChannels'] === true || waterMeta['hasTraversalChannels'] === true
    ? { width, height, medium: arrays.medium, solidBlocked: arrays.solidBlocked } : undefined;
  // Field set and order mirror compiledLiveIslandRuntime (server index.ts).
  const ground: CollisionMap = {
    ...(traversalChannels === undefined || groundMeta['hasTraversalChannels'] !== true ? {} : { traversalChannels }),
    width,
    height,
    blocked: booleans(arrays['authority.ground.blocked']),
    elevations: arrays['authority.ground.elevations'],
    ...(typeof groundMeta['terrainMinimumElevation'] === 'number' ? { terrainMinimumElevation: groundMeta['terrainMinimumElevation'] } : {}),
    ...(has(groundMeta, 'terrainTransitions') ? { terrainTransitions: ordered<TerrainTransition>('authority.ground.transition') } : {}),
    terrainPlaneBlocked: arrays['authority.ground.terrainPlaneBlocked'],
    horseJumpableTerrain: booleans(arrays['authority.ground.horseJumpableTerrain']),
    obstacles: groundObstacles.authored,
  };
  const water: CollisionMap = {
    ...(traversalChannels === undefined || waterMeta['hasTraversalChannels'] !== true ? {} : { traversalChannels }),
    width,
    height,
    blocked: booleans(arrays['authority.water.blocked']),
    // SW-D1: the water horse-jump mask is all false and is not materialized.
    horseJumpableTerrain: new Array<boolean>(cellCount).fill(false),
    obstacles: waterObstacles.authored,
  };
  const documentMeta = record(manifest.metadata['document']) ? manifest.metadata['document'] : {};
  const biomePalette = Array.isArray(manifest.metadata['biomePalette']) ? manifest.metadata['biomePalette'] as readonly MapBiomeId[] : [];
  const biomes = arrays.biomes;
  const staticView: LiveIslandStaticView = {
    id: typeof documentMeta['id'] === 'string' ? documentMeta['id'] : '',
    objects: ordered<MapDocumentV3['objects'][number]>('objects'),
    landmarks: ordered<MapDocumentV3['landmarks'][number]>('landmarks'),
    prefabs: (Array.isArray(documentMeta['prefabs']) ? documentMeta['prefabs'] : []) as unknown as MapDocumentV3['prefabs'],
    resourcePlacements: ordered<NonNullable<MapDocumentV3['resourcePlacements']>[number]>('resourcePlacements'),
    combatRegions: meta.combatRegions,
    generatedSuppressions: meta.generatedSuppressions,
    biomeAt(tileX, tileY) {
      if (!Number.isInteger(tileX) || !Number.isInteger(tileY) || tileX < 0 || tileY < 0 || tileX >= width || tileY >= height) return undefined;
      const value = biomes[tileY * width + tileX]!;
      return value === NO_BIOME ? undefined : biomePalette[value];
    },
  };
  return {
    source: 'chunks',
    key: chunkLiveIslandRuntimeKey(manifest, registry.contentHash, options.shadowRevision),
    combatPolicy: new CombatRegionPolicy(meta.combatRegions),
    ground,
    water,
    generatedSuppressions: new Set(meta.generatedSuppressions),
    suppressedDecorationObstacleKeys,
    baseObstacles: { ground: groundObstacles.base, water: waterObstacles.base },
    staticView,
    complete: issues.length === 0,
    issues,
    stale: options.shadowContentHash !== undefined && options.shadowContentHash !== registry.contentHash,
    stats: { expectedChunks: columns * rows, decodedChunks, decodedBytes },
  };
}

/**
 * Full static composition from chunk data alone, the way the server's
 * `liveMapCollisionForSpace` composes over the precomputed base: the static base
 * group followed by the caller's live base obstacles (resources, chests,
 * placeables in `createAuthoritySpaceCollisionMap` order) are ALL filtered by the
 * suppressed decoration keys (finding B: live boxes equal to a suppressed key are
 * dropped too), then the authored group is appended.
 */
export function composeChunkIslandCollision(runtime: ChunkLiveIslandRuntime, medium: ChunkAuthorityMedium,
  liveBaseObstacles: readonly CollisionObstacle[] = []): CollisionMap {
  const overlay = runtime[medium];
  const keys = runtime.suppressedDecorationObstacleKeys[medium];
  const retained = [...runtime.baseObstacles[medium], ...liveBaseObstacles].filter(obstacle => !keys.has(authorityObstacleKey(obstacle)));
  return { ...overlay, obstacles: [...retained, ...(overlay.obstacles ?? [])] };
}

/** The same static view over a compiled document (the server's current source). */
export function documentStaticView(document: MapDocumentV3): LiveIslandStaticView {
  return {
    id: document.id,
    objects: document.objects,
    landmarks: document.landmarks,
    prefabs: document.prefabs,
    resourcePlacements: document.resourcePlacements ?? [],
    combatRegions: document.combatRegions ?? [],
    generatedSuppressions: document.generatedSuppressions,
    biomeAt: (tileX, tileY) => tileX < 0 || tileY < 0 || tileX >= document.width || tileY >= document.height
      ? undefined : resolvedMapBiomeAt(document, tileX, tileY),
  };
}

/** Either runtime: the compiled one carries `document`, the chunk one `staticView`. */
export type ComparableLiveIslandRuntime = LiveIslandCollisionRuntime
  & ({ readonly document: MapDocumentV3 } | { readonly staticView: LiveIslandStaticView });

export interface LiveIslandRuntimeDisagreement {
  readonly index?: number;
  readonly tileX?: number;
  readonly tileY?: number;
  readonly plane?: number;
  readonly a: unknown;
  readonly b: unknown;
}
export interface LiveIslandRuntimeFieldDiff {
  readonly count: number;
  readonly samples: readonly LiveIslandRuntimeDisagreement[];
}
export interface LiveIslandRuntimeDiff {
  readonly equal: boolean;
  /** Total disagreements across all fields (not bounded). */
  readonly total: number;
  /** Only fields that disagree; each keeps at most `limit` samples. */
  readonly fields: Readonly<Record<string, LiveIslandRuntimeFieldDiff>>;
}

function staticViewOf(runtime: ComparableLiveIslandRuntime): LiveIslandStaticView {
  return 'staticView' in runtime ? runtime.staticView : documentStaticView(runtime.document);
}

/**
 * Bounded structured diff: per field, the count of disagreements and the first
 * `limit` samples. Cell arrays compare numerically (boolean/u8/i16 agnostic);
 * ordered lists compare element-wise by canonical JSON; sets compare in order.
 * `biomeAt` is compared for every cell of `a`'s ground map.
 */
export function compareLiveIslandRuntime(a: ComparableLiveIslandRuntime, b: ComparableLiveIslandRuntime, limit = 32): LiveIslandRuntimeDiff {
  const fields: Record<string, { count: number; samples: LiveIslandRuntimeDisagreement[] }> = {};
  let total = 0;
  const note = (field: string, sample: LiveIslandRuntimeDisagreement): void => {
    const entry = fields[field] ??= { count: 0, samples: [] };
    entry.count += 1;
    total += 1;
    if (entry.samples.length < limit) entry.samples.push(sample);
  };
  const scalar = (field: string, x: unknown, y: unknown): void => { if (x !== y) note(field, { a: x, b: y }); };
  const cells = (field: string, x: ArrayLike<number | boolean> | undefined, y: ArrayLike<number | boolean> | undefined, width: number, height: number): void => {
    if (x === undefined || y === undefined) {
      if (x !== y) note(field, { a: x === undefined ? 'absent' : 'present', b: y === undefined ? 'absent' : 'present' });
      return;
    }
    if (x.length !== y.length) note(`${field}.length`, { a: x.length, b: y.length });
    const length = Math.min(x.length, y.length), size = width * height;
    for (let index = 0; index < length; index++) {
      const left = Number(x[index]), right = Number(y[index]);
      if (left === right) continue;
      const cell = size > 0 ? index % size : index;
      note(field, { index, plane: size > 0 ? Math.floor(index / size) : 0, tileX: width > 0 ? cell % width : 0, tileY: width > 0 ? Math.floor(cell / width) : 0, a: left, b: right });
    }
  };
  const list = (field: string, x: readonly unknown[] | undefined, y: readonly unknown[] | undefined): void => {
    if (x === undefined || y === undefined) {
      if (x !== y) note(field, { a: x === undefined ? 'absent' : 'present', b: y === undefined ? 'absent' : 'present' });
      return;
    }
    if (x.length !== y.length) note(`${field}.length`, { a: x.length, b: y.length });
    for (let index = 0; index < Math.max(x.length, y.length); index++) {
      const left = index < x.length ? canonicalChunkJson(x[index]) : undefined, right = index < y.length ? canonicalChunkJson(y[index]) : undefined;
      if (left !== right) note(field, { index, a: index < x.length ? x[index] : 'absent', b: index < y.length ? y[index] : 'absent' });
    }
  };
  for (const medium of MEDIA) {
    const x = a[medium], y = b[medium], prefix = medium;
    const keys = new Set([...Object.keys(x), ...Object.keys(y)]);
    for (const key of keys) if (has(x, key) !== has(y, key)) note(`${prefix}.fields`, { a: has(x, key) ? key : 'absent', b: has(y, key) ? key : 'absent' });
    scalar(`${prefix}.width`, x.width, y.width);
    scalar(`${prefix}.height`, x.height, y.height);
    scalar(`${prefix}.terrainMinimumElevation`, x.terrainMinimumElevation, y.terrainMinimumElevation);
    scalar(`${prefix}.fixedTerrainPlane`, x.fixedTerrainPlane, y.fixedTerrainPlane);
    const width = x.width, height = x.height;
    cells(`${prefix}.blocked`, x.blocked, y.blocked, width, height);
    cells(`${prefix}.elevations`, x.elevations, y.elevations, width, height);
    cells(`${prefix}.terrainPlaneBlocked`, x.terrainPlaneBlocked, y.terrainPlaneBlocked, width, height);
    cells(`${prefix}.horseJumpableTerrain`, x.horseJumpableTerrain, y.horseJumpableTerrain, width, height);
    const tx = x.traversalChannels, ty = y.traversalChannels;
    if ((tx === undefined) !== (ty === undefined)) note(`${prefix}.traversalChannels`, { a: tx === undefined ? 'absent' : 'present', b: ty === undefined ? 'absent' : 'present' });
    else if (tx !== undefined && ty !== undefined) {
      scalar(`${prefix}.traversalChannels.width`, tx.width, ty.width);
      scalar(`${prefix}.traversalChannels.height`, tx.height, ty.height);
      cells(`${prefix}.traversalChannels.medium`, tx.medium, ty.medium, width, height);
      cells(`${prefix}.traversalChannels.solidBlocked`, tx.solidBlocked, ty.solidBlocked, width, height);
    }
    list(`${prefix}.terrainTransitions`, x.terrainTransitions, y.terrainTransitions);
    list(`${prefix}.obstacles`, x.obstacles, y.obstacles);
    list(`suppressedDecorationObstacleKeys.${medium}`, [...a.suppressedDecorationObstacleKeys[medium]], [...b.suppressedDecorationObstacleKeys[medium]]);
  }
  list('generatedSuppressions', [...a.generatedSuppressions], [...b.generatedSuppressions]);
  const va = staticViewOf(a), vb = staticViewOf(b);
  scalar('staticView.id', va.id, vb.id);
  list('combatRegions', va.combatRegions, vb.combatRegions);
  list('staticView.generatedSuppressions', va.generatedSuppressions, vb.generatedSuppressions);
  list('staticView.objects', va.objects, vb.objects);
  list('staticView.landmarks', va.landmarks, vb.landmarks);
  list('staticView.prefabs', va.prefabs, vb.prefabs);
  list('staticView.resourcePlacements', va.resourcePlacements, vb.resourcePlacements);
  for (let tileY = 0; tileY < a.ground.height; tileY++) for (let tileX = 0; tileX < a.ground.width; tileX++) {
    const left = va.biomeAt(tileX, tileY), right = vb.biomeAt(tileX, tileY);
    if (left !== right) note('staticView.biomeAt', { tileX, tileY, a: left, b: right });
  }
  return { equal: total === 0, total, fields };
}
