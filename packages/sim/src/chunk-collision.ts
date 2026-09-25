import { authorityObstacleKey } from './chunk-runtime.js';
import type { CombatRegion } from './combat-regions.js';
import type { CollisionMap, CollisionObstacle } from './state.js';
import type { TerrainTransition } from './terrain-elevation.js';
import type { MediumCollisionChannels } from './traversal.js';
import {
  WORLD_CHUNK_AUTHORITY_SCHEMA, WORLD_CHUNK_SIZE, WORLD_CHUNK_STRIDE, WORLD_CHUNK_VOID,
  type ChunkArray, type ChunkJson, type WorldChunk, type WorldChunkAuthorityObstacle,
  type WorldChunkAuthoritySuppressedObstacle, type WorldChunkManifest, type WorldChunkRecord,
} from './world-chunk.js';

/**
 * Static world S4d: the client's topside collision in chunk mode `on`, built
 * from the resident chunk window alone (no generator, no map document).
 *
 * It is the window form of the server's chunk runtime (world
 * `assembleChunkLiveIslandRuntime` + `composeChunkIslandCollision`, S1b), with
 * the same inputs and the same rules:
 *
 * - cell channels: `authority.ground.blocked`, `.elevations`,
 *   `.terrainPlaneBlocked` (planes from the manifest, indexed from the map-wide
 *   `terrainMinimumElevation`), `.horseJumpableTerrain`, `authority.water.blocked`,
 *   and the traversal `medium` / `solidBlocked` channels when the manifest says the
 *   server carries them;
 * - records: the ground/water obstacle groups (`base`, then `authored`), the
 *   suppressed decoration keys and the ground transitions, each in stream order;
 * - manifest: combat regions and generated suppressions (complete, map-wide);
 * - composition (`composeChunkWindowCollision`): the base group and the caller's
 *   live base boxes (resources, chests, placeables) are ALL filtered by the
 *   suppressed keys (finding B: a live box equal to a suppressed decoration box is
 *   dropped too), then the authored group is appended.
 *
 * The maps are windowed: `originX` / `originY` give the top-left world tile and
 * every sampler reads them through `collisionCellIndex`, so tiles outside the
 * window are blocked. Inside the window, a chunk that is not resident, lacks the
 * authority extension or has a malformed channel stays void and solid (blocked
 * everywhere) and is reported in `issues`; it is never walkable.
 *
 * Records are anchored at the chunk owning their top-left tile, so the window
 * holds exactly the server's records anchored inside it, in server order. A box
 * anchored in a chunk outside the window that overhangs into it is absent; the
 * window keeps a camera margin (CHUNK_WINDOW_MARGIN_TILES) between the player
 * and any window edge, far more than any obstacle's overhang.
 */

export type ChunkCollisionMedium = 'ground' | 'water';

/** The source a window is built from: a BoundedChunkTerrainStore (structurally). */
export interface ChunkCollisionSource {
  readonly manifest: WorldChunkManifest;
  peekChunk(cx: number, cy: number): WorldChunk | undefined;
}

/** A window of terrain chunks: top-left chunk (cx, cy) and its size in chunks. */
export interface ChunkCollisionRect { readonly cx: number; readonly cy: number; readonly columns: number; readonly rows: number }

export type ChunkCollisionIssueKind = 'head_missing' | 'chunk_missing' | 'authority_missing' | 'channel_invalid';
export interface ChunkCollisionIssue {
  readonly kind: ChunkCollisionIssueKind;
  readonly cx: number;
  readonly cy: number;
  readonly detail?: string;
}

/** Map-wide authority metadata published in the manifest (`metadata.authority`). */
export interface ChunkAuthorityManifestMetadata {
  readonly combatRegions: readonly CombatRegion[];
  readonly generatedSuppressions: readonly string[];
  readonly collisions: Readonly<Record<ChunkCollisionMedium, Readonly<Record<string, ChunkJson>>>>;
}

export interface ChunkWindowCollision {
  readonly originX: number;
  readonly originY: number;
  readonly width: number;
  readonly height: number;
  /** The authored overlay for each medium (authored obstacles only), like the
   * server runtime's `ground` / `water`; compose with composeChunkWindowCollision. */
  readonly ground: CollisionMap;
  readonly water: CollisionMap;
  /** Static base obstacle group in server order, before the suppressed-key filter. */
  readonly baseObstacles: Readonly<Record<ChunkCollisionMedium, readonly CollisionObstacle[]>>;
  readonly suppressedObstacleKeys: Readonly<Record<ChunkCollisionMedium, ReadonlySet<string>>>;
  readonly generatedSuppressions: ReadonlySet<string>;
  readonly combatRegions: readonly CombatRegion[];
  /** `cx:cy` of the window chunks whose authority data was used. */
  readonly present: ReadonlySet<string>;
  readonly issues: readonly ChunkCollisionIssue[];
}

const CELL_COUNT = WORLD_CHUNK_STRIDE ** 2;

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function has(value: object, key: string): boolean { return Object.prototype.hasOwnProperty.call(value, key); }

const metadataCache = new WeakMap<WorldChunkManifest, ChunkAuthorityManifestMetadata | null>();
/** The manifest's authority metadata, or undefined when it was published without
 * the authority extension (the caller then keeps its legacy source). */
export function chunkAuthorityMetadata(manifest: WorldChunkManifest): ChunkAuthorityManifestMetadata | undefined {
  let cached = metadataCache.get(manifest);
  if (cached === undefined) {
    const value = manifest.metadata['authority'];
    cached = record(value) && value['schema'] === WORLD_CHUNK_AUTHORITY_SCHEMA && Array.isArray(value['combatRegions'])
      && Array.isArray(value['generatedSuppressions']) && record(value['collisions'])
      && record(value['collisions']['ground']) && record(value['collisions']['water'])
      ? value as unknown as ChunkAuthorityManifestMetadata : null;
    metadataCache.set(manifest, cached);
  }
  return cached ?? undefined;
}

const suppressionCache = new WeakMap<ChunkAuthorityManifestMetadata, ReadonlySet<string>>();
/** The manifest's generated suppressions as a set (cached per manifest). */
export function chunkAuthorityGeneratedSuppressions(metadata: ChunkAuthorityManifestMetadata): ReadonlySet<string> {
  let set = suppressionCache.get(metadata);
  if (set === undefined) { set = new Set(metadata.generatedSuppressions); suppressionCache.set(metadata, set); }
  return set;
}

/** World tile bounds of a window rect, clamped to the map (as the render window). */
export function chunkCollisionWindowBounds(rect: ChunkCollisionRect, mapWidth: number, mapHeight: number): {
  readonly originX: number; readonly originY: number; readonly width: number; readonly height: number;
} {
  const originX = rect.cx * WORLD_CHUNK_SIZE, originY = rect.cy * WORLD_CHUNK_SIZE;
  return { originX, originY,
    width: Math.min(mapWidth, (rect.cx + rect.columns) * WORLD_CHUNK_SIZE) - originX,
    height: Math.min(mapHeight, (rect.cy + rect.rows) * WORLD_CHUNK_SIZE) - originY };
}

function booleans(values: Uint8Array): boolean[] {
  const result = new Array<boolean>(values.length);
  for (let index = 0; index < values.length; index++) result[index] = values[index] !== 0;
  return result;
}

const WANTED_RECORDS = new Set(['authority.ground.obstacle', 'authority.water.obstacle', 'authority.suppressedObstacleKey', 'authority.ground.transition']);

/**
 * Builds the window's static collision from the resident chunks of `rect`.
 * Throws only when the manifest carries no authority metadata (check
 * chunkAuthorityMetadata first) or the rect is empty.
 */
export function buildChunkWindowCollision(source: ChunkCollisionSource, rect: ChunkCollisionRect): ChunkWindowCollision {
  const manifest = source.manifest;
  const meta = chunkAuthorityMetadata(manifest);
  if (meta === undefined) throw new Error('chunk_authority_metadata_missing');
  const { originX, originY, width, height } = chunkCollisionWindowBounds(rect, manifest.width, manifest.height);
  if (!(width > 0 && height > 0)) throw new Error('invalid_chunk_collision_window');
  const cells = width * height;
  const channelSpecs = record(manifest.metadata['channels']) ? manifest.metadata['channels'] : {};
  const planeSpec = channelSpecs['authority.ground.terrainPlaneBlocked'];
  const planes = record(planeSpec) && Number.isSafeInteger(planeSpec['planes']) && (planeSpec['planes'] as number) >= 1 ? planeSpec['planes'] as number : 1;
  // Void and solid until a verified window chunk overwrites its cells (as the server assembler).
  const arrays = {
    'authority.ground.blocked': new Uint8Array(cells).fill(1),
    'authority.ground.elevations': new Int16Array(cells),
    'authority.ground.terrainPlaneBlocked': new Uint8Array(cells * planes).fill(1),
    'authority.ground.horseJumpableTerrain': new Uint8Array(cells),
    'authority.water.blocked': new Uint8Array(cells).fill(1),
    medium: new Uint8Array(cells).fill(WORLD_CHUNK_VOID),
    solidBlocked: new Uint8Array(cells).fill(1),
  } as const;
  const names = Object.keys(arrays) as (keyof typeof arrays)[];
  const heads = new Set(manifest.chunks.map(head => `${head.cx}:${head.cy}`));
  const issues: ChunkCollisionIssue[] = [];
  const present = new Set<string>();
  const records: WorldChunkRecord[] = [];
  for (let cy = rect.cy; cy < rect.cy + rect.rows; cy++) for (let cx = rect.cx; cx < rect.cx + rect.columns; cx++) {
    const key = `${cx}:${cy}`;
    if (!heads.has(key)) { issues.push({ kind: 'head_missing', cx, cy }); continue; }
    const chunk = source.peekChunk(cx, cy);
    if (chunk === undefined) { issues.push({ kind: 'chunk_missing', cx, cy }); continue; }
    if (chunk.authoritySchema !== WORLD_CHUNK_AUTHORITY_SCHEMA) { issues.push({ kind: 'authority_missing', cx, cy }); continue; }
    // Validate every channel shape before writing any cell of this chunk.
    const bad = names.find(name => {
      const data: ChunkArray | undefined = chunk.arrays[name], target = arrays[name];
      return data === undefined || data.constructor !== target.constructor || data.length !== (target.length / cells) * CELL_COUNT;
    });
    if (bad !== undefined) { issues.push({ kind: 'channel_invalid', cx, cy, detail: bad }); continue; }
    const firstX = cx * WORLD_CHUNK_SIZE, firstY = cy * WORLD_CHUNK_SIZE;
    const columns = Math.min(WORLD_CHUNK_SIZE, originX + width - firstX), rows = Math.min(WORLD_CHUNK_SIZE, originY + height - firstY);
    for (const name of names) {
      const data = chunk.arrays[name]!, target = arrays[name], channelPlanes = target.length / cells;
      for (let plane = 0; plane < channelPlanes; plane++) for (let y = 0; y < rows; y++) {
        // Skip the one-cell halo: local (x, y) is at (x + 1, y + 1) in the stride.
        const from = plane * CELL_COUNT + (y + 1) * WORLD_CHUNK_STRIDE + 1;
        (target as Uint8Array).set((data as Uint8Array).subarray(from, from + columns), plane * cells + (firstY + y - originY) * width + firstX - originX);
      }
    }
    for (const item of chunk.records) if (WANTED_RECORDS.has(item.kind)) records.push(item);
    present.add(key);
  }
  // Stream order across chunks is the record ordinal (the server's order).
  records.sort((a, b) => a.ordinal - b.ordinal);
  const ofKind = <T>(kind: string): T[] => records.filter(item => item.kind === kind).map(item => item.value as unknown as T);
  const groups = (medium: ChunkCollisionMedium): { base: CollisionObstacle[]; authored: CollisionObstacle[] } => {
    const base: CollisionObstacle[] = [], authored: CollisionObstacle[] = [];
    for (const value of ofKind<WorldChunkAuthorityObstacle>(`authority.${medium}.obstacle`)) {
      (value.group === 'base' ? base : authored).push({ left: value.left, top: value.top, right: value.right, bottom: value.bottom });
    }
    return { base, authored };
  };
  const groundObstacles = groups('ground'), waterObstacles = groups('water');
  const suppressedRows = ofKind<WorldChunkAuthoritySuppressedObstacle>('authority.suppressedObstacleKey');
  const suppressedObstacleKeys = {
    ground: new Set(suppressedRows.filter(row => row.medium === 'ground').map(authorityObstacleKey)),
    water: new Set(suppressedRows.filter(row => row.medium === 'water').map(authorityObstacleKey)),
  };
  const groundMeta = meta.collisions.ground, waterMeta = meta.collisions.water;
  const traversalChannels: MediumCollisionChannels | undefined = groundMeta['hasTraversalChannels'] === true || waterMeta['hasTraversalChannels'] === true
    ? { width, height, medium: arrays.medium, solidBlocked: arrays.solidBlocked } : undefined;
  // Field set and order mirror the server runtime (assembleChunkLiveIslandRuntime), plus the window origin.
  const ground: CollisionMap = {
    ...(traversalChannels === undefined || groundMeta['hasTraversalChannels'] !== true ? {} : { traversalChannels }),
    width,
    height,
    originX,
    originY,
    blocked: booleans(arrays['authority.ground.blocked']),
    elevations: arrays['authority.ground.elevations'],
    ...(typeof groundMeta['terrainMinimumElevation'] === 'number' ? { terrainMinimumElevation: groundMeta['terrainMinimumElevation'] } : {}),
    ...(has(groundMeta, 'terrainTransitions') ? { terrainTransitions: ofKind<TerrainTransition>('authority.ground.transition') } : {}),
    terrainPlaneBlocked: arrays['authority.ground.terrainPlaneBlocked'],
    horseJumpableTerrain: booleans(arrays['authority.ground.horseJumpableTerrain']),
    obstacles: groundObstacles.authored,
  };
  const water: CollisionMap = {
    ...(traversalChannels === undefined || waterMeta['hasTraversalChannels'] !== true ? {} : { traversalChannels }),
    width,
    height,
    originX,
    originY,
    blocked: booleans(arrays['authority.water.blocked']),
    // SW-D1: the water horse-jump mask is all false and is not materialized.
    horseJumpableTerrain: new Array<boolean>(cells).fill(false),
    obstacles: waterObstacles.authored,
  };
  return {
    originX, originY, width, height, ground, water,
    baseObstacles: { ground: groundObstacles.base, water: waterObstacles.base },
    suppressedObstacleKeys,
    generatedSuppressions: chunkAuthorityGeneratedSuppressions(meta),
    combatRegions: meta.combatRegions,
    present,
    issues,
  };
}

/**
 * One medium composed exactly as the server's chunk runtime composes it
 * (`composeChunkIslandCollision` / `liveMapCollisionForSpace`): the static base
 * group followed by the caller's live base obstacles (resources, chests,
 * non-furniture placeables) are ALL filtered by the suppressed decoration keys,
 * then the authored group is appended. Dynamic overlays the server adds after
 * this composition (furniture, combat targets, surfaces, tents) are the caller's.
 */
export function composeChunkWindowCollision(window: ChunkWindowCollision, medium: ChunkCollisionMedium,
  liveBaseObstacles: readonly CollisionObstacle[] = []): CollisionMap {
  const overlay = window[medium];
  const keys = window.suppressedObstacleKeys[medium];
  const retained = [...window.baseObstacles[medium], ...liveBaseObstacles].filter(obstacle => !keys.has(authorityObstacleKey(obstacle)));
  return { ...overlay, obstacles: [...retained, ...(overlay.obstacles ?? [])] };
}
