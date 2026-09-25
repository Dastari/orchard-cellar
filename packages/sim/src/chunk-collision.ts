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
 * Static world: the ONE composition of server-authoritative collision from
 * chunk authority data, generator-free. Both runtimes use it:
 *
 * - the server's chunk runtime (world `assembleChunkLiveIslandRuntime`, S1b/S2b)
 *   composes the whole island: bounds = the map, exact record-order checks;
 * - the client in chunk mode `on` (S4d, `buildChunkWindowCollision`) composes the
 *   resident render window: bounds = the window, an origin on every map.
 *
 * Inputs and rules:
 * - cell channels: `authority.ground.blocked`, `.elevations`,
 *   `.terrainPlaneBlocked` (planes from the manifest, indexed from the map-wide
 *   `terrainMinimumElevation`), `.horseJumpableTerrain`, `authority.water.blocked`,
 *   and the traversal `medium` / `solidBlocked` channels when the manifest says the
 *   server carries them. Cells start void and solid; only a verified chunk
 *   overwrites them, so a missing chunk is never walkable;
 * - records: the ground/water obstacle groups (`base`, then `authored`), the
 *   suppressed decoration keys and the ground transitions, each in stream order;
 * - composition (`composeAuthorityCollision`): the base group and the caller's
 *   live base boxes (resources, chests, placeables) are ALL filtered by the
 *   suppressed keys (finding B: a live box equal to a suppressed decoration box is
 *   dropped too), then the authored group is appended.
 *
 * Records are anchored at the chunk owning their top-left tile (transitions at
 * their lower tile), so a window holds exactly the server's records anchored
 * inside it, in server order. A box anchored in a chunk outside the window that
 * overhangs into it is absent; the render window keeps a camera margin
 * (CHUNK_WINDOW_MARGIN_TILES) between the player and any window edge, far more
 * than any obstacle's overhang.
 */

export type ChunkCollisionMedium = 'ground' | 'water';
const CELL_COUNT = WORLD_CHUNK_STRIDE ** 2;

/** Map-wide authority metadata published in the manifest (`metadata.authority`). */
export interface ChunkAuthorityManifestMetadata {
  readonly combatRegions: readonly CombatRegion[];
  readonly generatedSuppressions: readonly string[];
  readonly collisions: Readonly<Record<ChunkCollisionMedium, Readonly<Record<string, ChunkJson>>>>;
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function has(value: object, key: string): boolean { return Object.prototype.hasOwnProperty.call(value, key); }

// Keyed by manifest identity: relies on published manifests never being mutated
// (a new publication is a new, validated manifest object).
const metadataCache = new WeakMap<WorldChunkManifest, ChunkAuthorityManifestMetadata | null>();
/** The manifest's authority metadata, or undefined when it was published without
 * the authority extension. */
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

/** Why the server's dispatcher would refuse this manifest's ground fields (its
 * `ground_fields_missing`): the compiled runtime always sets both. */
export function chunkAuthorityGroundFieldsMissing(metadata: ChunkAuthorityManifestMetadata): readonly string[] {
  const ground = metadata.collisions.ground;
  return [...(typeof ground['terrainMinimumElevation'] === 'number' ? [] : ['terrainMinimumElevation']),
    ...(has(ground, 'terrainTransitions') ? [] : ['terrainTransitions'])];
}

/** Traversal channel presence per medium, fixed at publication (the server
 * refuses a mismatch with the live registry policy). */
export function chunkAuthorityTraversalChannels(metadata: ChunkAuthorityManifestMetadata): Readonly<Record<ChunkCollisionMedium, boolean>> {
  return { ground: metadata.collisions.ground['hasTraversalChannels'] === true, water: metadata.collisions.water['hasTraversalChannels'] === true };
}

/** World-tile rectangle a composition covers (the whole map, or a window). */
export interface AuthorityCollisionBounds {
  readonly originX: number;
  readonly originY: number;
  readonly width: number;
  readonly height: number;
}

/** An extra per-cell channel a caller also wants copied (the server's biomes). */
export interface AuthorityExtraChannel { readonly type: 'u8' | 'i16'; readonly fill: number }

export interface AuthorityCollisionOptions {
  /** Record kinds kept besides the collision ones (the server's static view). */
  readonly extraRecordKinds?: readonly string[];
  readonly extraChannels?: Readonly<Record<string, AuthorityExtraChannel>>;
}

/**
 * Record-order check:
 * - `exact`: the complete record set (every chunk decoded): each kind's ordinals
 *   are 0..n-1 and each obstacle group's ordinals follow its stream order with
 *   every base record before any authored one (the server's `record_order`);
 * - `window`: a subset (a render window): ordinals strictly increase and base
 *   records precede authored ones, the part of the rule a subset can check;
 * - `none`: an incomplete set whose order means nothing.
 */
export type AuthorityRecordOrderCheck = 'exact' | 'window' | 'none';

export interface AuthorityCollisionComposition {
  /** The authored overlay for each medium (authored obstacles only), as the
   * server runtime's `ground` / `water`; compose with composeAuthorityCollision. */
  readonly ground: CollisionMap;
  readonly water: CollisionMap;
  /** Static base obstacle group in server order, before the suppressed-key filter. */
  readonly baseObstacles: Readonly<Record<ChunkCollisionMedium, readonly CollisionObstacle[]>>;
  readonly suppressedObstacleKeys: Readonly<Record<ChunkCollisionMedium, ReadonlySet<string>>>;
  /** `record_order` details, in the order the server reports them. */
  readonly orderIssues: readonly string[];
}

const COLLISION_RECORD_KINDS = ['authority.ground.obstacle', 'authority.water.obstacle', 'authority.suppressedObstacleKey', 'authority.ground.transition'];

/** Accumulates chunks into bounds-sized channels and records, then composes. */
export class AuthorityCollisionBuilder {
  readonly bounds: AuthorityCollisionBounds;
  readonly arrays: Readonly<Record<string, Uint8Array | Int16Array>>;
  readonly #manifest: WorldChunkManifest;
  readonly #meta: ChunkAuthorityManifestMetadata;
  readonly #wanted: ReadonlySet<string>;
  readonly #records = new Map<string, WorldChunkRecord[]>();
  readonly #orderIssues: string[] = [];
  #order: AuthorityRecordOrderCheck = 'none';

  constructor(manifest: WorldChunkManifest, bounds: AuthorityCollisionBounds, options: AuthorityCollisionOptions = {}) {
    const meta = chunkAuthorityMetadata(manifest);
    if (meta === undefined) throw new Error('chunk_authority_metadata_missing');
    if (!(bounds.width > 0 && bounds.height > 0)) throw new Error('invalid_chunk_collision_bounds');
    this.#manifest = manifest;
    this.#meta = meta;
    this.bounds = bounds;
    const cells = bounds.width * bounds.height;
    const channelSpecs = record(manifest.metadata['channels']) ? manifest.metadata['channels'] : {};
    const planeSpec = channelSpecs['authority.ground.terrainPlaneBlocked'];
    const planes = record(planeSpec) && Number.isSafeInteger(planeSpec['planes']) && (planeSpec['planes'] as number) >= 1 ? planeSpec['planes'] as number : 1;
    // Void and solid until a verified chunk overwrites its cells.
    const arrays: Record<string, Uint8Array | Int16Array> = {
      'authority.ground.blocked': new Uint8Array(cells).fill(1),
      'authority.ground.elevations': new Int16Array(cells),
      'authority.ground.terrainPlaneBlocked': new Uint8Array(cells * planes).fill(1),
      'authority.ground.horseJumpableTerrain': new Uint8Array(cells),
      'authority.water.blocked': new Uint8Array(cells).fill(1),
      medium: new Uint8Array(cells).fill(WORLD_CHUNK_VOID),
      solidBlocked: new Uint8Array(cells).fill(1),
    };
    for (const [name, spec] of Object.entries(options.extraChannels ?? {})) {
      arrays[name] = (spec.type === 'i16' ? new Int16Array(cells) : new Uint8Array(cells)).fill(spec.fill);
    }
    this.arrays = arrays;
    this.#wanted = new Set([...COLLISION_RECORD_KINDS, ...(options.extraRecordKinds ?? [])]);
  }

  /** Validates every channel shape, then copies the chunk's interior cells inside
   * the bounds and keeps its wanted records. Returns the first malformed channel
   * (nothing is written), or undefined. The caller checks the authority schema. */
  add(chunk: WorldChunk, cx: number, cy: number): string | undefined {
    const { originX, originY, width, height } = this.bounds, cells = width * height;
    const names = Object.keys(this.arrays);
    const bad = names.find(name => {
      const data: ChunkArray | undefined = chunk.arrays[name], target = this.arrays[name]!;
      return data === undefined || data.constructor !== target.constructor || data.length !== (target.length / cells) * CELL_COUNT;
    });
    if (bad !== undefined) return bad;
    const firstX = cx * WORLD_CHUNK_SIZE, firstY = cy * WORLD_CHUNK_SIZE;
    const x0 = Math.max(firstX, originX), y0 = Math.max(firstY, originY);
    const x1 = Math.min(firstX + WORLD_CHUNK_SIZE, originX + width, this.#manifest.width);
    const y1 = Math.min(firstY + WORLD_CHUNK_SIZE, originY + height, this.#manifest.height);
    if (x1 > x0 && y1 > y0) for (const name of names) {
      const data = chunk.arrays[name]!, target = this.arrays[name]!, planes = target.length / cells;
      for (let plane = 0; plane < planes; plane++) for (let tileY = y0; tileY < y1; tileY++) {
        // Skip the one-cell halo: local (x, y) is at (x + 1, y + 1) in the stride.
        const from = plane * CELL_COUNT + (tileY - firstY + 1) * WORLD_CHUNK_STRIDE + (x0 - firstX + 1);
        (target as Uint8Array).set((data as Uint8Array).subarray(from, from + x1 - x0), plane * cells + (tileY - originY) * width + x0 - originX);
      }
    }
    for (const item of chunk.records) {
      if (!this.#wanted.has(item.kind)) continue;
      const list = this.#records.get(item.kind);
      if (list === undefined) this.#records.set(item.kind, [item]); else list.push(item);
    }
    return undefined;
  }

  /** One kind's record values in stream order, checked per `order`. */
  records<T>(kind: string): T[] {
    const list = (this.#records.get(kind) ?? []).sort((a, b) => a.ordinal - b.ordinal);
    if (this.#order === 'exact' ? list.some((item, index) => item.ordinal !== index)
      : this.#order === 'window' && list.some((item, index) => index > 0 && item.ordinal === list[index - 1]!.ordinal)) this.#orderIssues.push(kind);
    return list.map(item => item.value as unknown as T);
  }

  /** `record_order` details found so far (composition and any records() calls). */
  get orderIssues(): readonly string[] { return this.#orderIssues; }

  /** Builds both media. `window` puts the bounds' origin on every map. */
  compose(order: AuthorityRecordOrderCheck, window: boolean): AuthorityCollisionComposition {
    this.#order = order;
    const { originX, originY, width, height } = this.bounds, cells = width * height;
    const groups = (medium: ChunkCollisionMedium): { base: CollisionObstacle[]; authored: CollisionObstacle[] } => {
      const base: CollisionObstacle[] = [], authored: CollisionObstacle[] = [];
      const last = { base: -1, authored: -1 };
      let misordered = false;
      for (const value of this.records<WorldChunkAuthorityObstacle>(`authority.${medium}.obstacle`)) {
        const group = value.group === 'base' ? base : authored;
        misordered ||= (value.group === 'base' && authored.length > 0)
          || (order === 'exact' ? value.ordinal !== group.length : value.ordinal <= last[value.group]);
        last[value.group] = value.ordinal;
        group.push({ left: value.left, top: value.top, right: value.right, bottom: value.bottom });
      }
      if (order !== 'none' && misordered) this.#orderIssues.push(`authority.${medium}.obstacle groups`);
      return { base, authored };
    };
    const groundObstacles = groups('ground'), waterObstacles = groups('water');
    const suppressedRows = this.records<WorldChunkAuthoritySuppressedObstacle>('authority.suppressedObstacleKey');
    const suppressedObstacleKeys = {
      ground: new Set(suppressedRows.filter(row => row.medium === 'ground').map(authorityObstacleKey)),
      water: new Set(suppressedRows.filter(row => row.medium === 'water').map(authorityObstacleKey)),
    };
    const booleans = (name: string): boolean[] => {
      const values = this.arrays[name]!, result = new Array<boolean>(values.length);
      for (let index = 0; index < values.length; index++) result[index] = values[index] !== 0;
      return result;
    };
    const channels = chunkAuthorityTraversalChannels(this.#meta), groundMeta = this.#meta.collisions.ground;
    const traversalChannels: MediumCollisionChannels | undefined = channels.ground || channels.water
      ? { width, height, medium: this.arrays['medium']!, solidBlocked: this.arrays['solidBlocked']! } : undefined;
    const origin = window ? { originX, originY } : {};
    // Field set and order are the compiled server runtime's (compiledLiveIslandRuntime),
    // plus the origin for a window: the server spreads the overlay over its base map.
    const ground: CollisionMap = {
      ...(traversalChannels === undefined || !channels.ground ? {} : { traversalChannels }),
      width,
      height,
      ...origin,
      blocked: booleans('authority.ground.blocked'),
      elevations: this.arrays['authority.ground.elevations'] as Int16Array,
      ...(typeof groundMeta['terrainMinimumElevation'] === 'number' ? { terrainMinimumElevation: groundMeta['terrainMinimumElevation'] } : {}),
      ...(has(groundMeta, 'terrainTransitions') ? { terrainTransitions: this.records<TerrainTransition>('authority.ground.transition') } : {}),
      terrainPlaneBlocked: this.arrays['authority.ground.terrainPlaneBlocked'] as Uint8Array,
      horseJumpableTerrain: booleans('authority.ground.horseJumpableTerrain'),
      obstacles: groundObstacles.authored,
    };
    const water: CollisionMap = {
      ...(traversalChannels === undefined || !channels.water ? {} : { traversalChannels }),
      width,
      height,
      ...origin,
      blocked: booleans('authority.water.blocked'),
      // SW-D1: the water horse-jump mask is all false and is not materialized.
      horseJumpableTerrain: new Array<boolean>(cells).fill(false),
      obstacles: waterObstacles.authored,
    };
    return { ground, water, baseObstacles: { ground: groundObstacles.base, water: waterObstacles.base }, suppressedObstacleKeys,
      orderIssues: this.#orderIssues };
  }
}

/**
 * One medium composed exactly as the server composes it (`liveMapCollisionForSpace`
 * over its base, `composeChunkIslandCollision`): the static base group followed by
 * the caller's live base obstacles (resources, chests, non-furniture placeables)
 * are ALL filtered by the suppressed decoration keys, then the authored group is
 * appended. Dynamic overlays the server adds afterwards (furniture, combat
 * targets, surfaces, tents) are the caller's.
 */
export function composeAuthorityCollision(composition: Pick<AuthorityCollisionComposition, 'ground' | 'water' | 'baseObstacles' | 'suppressedObstacleKeys'>,
  medium: ChunkCollisionMedium, liveBaseObstacles: readonly CollisionObstacle[] = []): CollisionMap {
  const overlay = composition[medium];
  const keys = composition.suppressedObstacleKeys[medium];
  const retained = [...composition.baseObstacles[medium], ...liveBaseObstacles].filter(obstacle => !keys.has(authorityObstacleKey(obstacle)));
  return { ...overlay, obstacles: [...retained, ...(overlay.obstacles ?? [])] };
}

// ---------------------------------------------------------------------------
// Client render window (S4d)
// ---------------------------------------------------------------------------

/** The source a window is built from: a BoundedChunkTerrainStore (structurally). */
export interface ChunkCollisionSource {
  readonly manifest: WorldChunkManifest;
  peekChunk(cx: number, cy: number): WorldChunk | undefined;
}

/** A window of terrain chunks: top-left chunk (cx, cy) and its size in chunks. */
export interface ChunkCollisionRect { readonly cx: number; readonly cy: number; readonly columns: number; readonly rows: number }

/**
 * - `chunk_missing`: a published window chunk is not resident yet. Its cells stay
 *   solid; waiting for it is spawn readiness (S4f), not a reason to leave chunks.
 * - `head_missing`, `authority_missing`, `channel_invalid`, `record_order`: the
 *   published data is incomplete or malformed. The server refuses such a
 *   publication (`incomplete`) and serves its compiled map, so the client
 *   falls back to its legacy collision too (`authorityIncomplete`).
 */
export type ChunkCollisionIssueKind = 'head_missing' | 'chunk_missing' | 'authority_missing' | 'channel_invalid' | 'record_order';
export interface ChunkCollisionIssue {
  readonly kind: ChunkCollisionIssueKind;
  readonly cx?: number;
  readonly cy?: number;
  readonly detail?: string;
}

export interface ChunkWindowCollision extends AuthorityCollisionComposition, AuthorityCollisionBounds {
  readonly generatedSuppressions: ReadonlySet<string>;
  readonly combatRegions: readonly CombatRegion[];
  /** `cx:cy` of the window chunks whose authority data was used. */
  readonly present: ReadonlySet<string>;
  readonly issues: readonly ChunkCollisionIssue[];
  /** True when an issue other than a not-yet-resident chunk means the server
   * would refuse this publication: use the legacy collision instead. */
  readonly authorityIncomplete: boolean;
}

/** World tile bounds of a window rect, clamped to the map (as the render window). */
export function chunkCollisionWindowBounds(rect: ChunkCollisionRect, mapWidth: number, mapHeight: number): AuthorityCollisionBounds {
  const originX = rect.cx * WORLD_CHUNK_SIZE, originY = rect.cy * WORLD_CHUNK_SIZE;
  return { originX, originY,
    width: Math.min(mapWidth, (rect.cx + rect.columns) * WORLD_CHUNK_SIZE) - originX,
    height: Math.min(mapHeight, (rect.cy + rect.rows) * WORLD_CHUNK_SIZE) - originY };
}

/**
 * Builds the window's static collision from the resident chunks of `rect`.
 * Throws only when the manifest carries no authority metadata (check
 * chunkAuthorityMetadata first) or the rect is empty.
 */
export function buildChunkWindowCollision(source: ChunkCollisionSource, rect: ChunkCollisionRect): ChunkWindowCollision {
  const manifest = source.manifest;
  const builder = new AuthorityCollisionBuilder(manifest, chunkCollisionWindowBounds(rect, manifest.width, manifest.height));
  const meta = chunkAuthorityMetadata(manifest)!;
  const heads = new Set(manifest.chunks.map(head => `${head.cx}:${head.cy}`));
  const issues: ChunkCollisionIssue[] = [];
  const present = new Set<string>();
  for (let cy = rect.cy; cy < rect.cy + rect.rows; cy++) for (let cx = rect.cx; cx < rect.cx + rect.columns; cx++) {
    const key = `${cx}:${cy}`;
    if (!heads.has(key)) { issues.push({ kind: 'head_missing', cx, cy }); continue; }
    const chunk = source.peekChunk(cx, cy);
    if (chunk === undefined) { issues.push({ kind: 'chunk_missing', cx, cy }); continue; }
    if (chunk.authoritySchema !== WORLD_CHUNK_AUTHORITY_SCHEMA) { issues.push({ kind: 'authority_missing', cx, cy }); continue; }
    const bad = builder.add(chunk, cx, cy);
    if (bad !== undefined) { issues.push({ kind: 'channel_invalid', cx, cy, detail: bad }); continue; }
    present.add(key);
  }
  const composition = builder.compose('window', true);
  for (const detail of composition.orderIssues) issues.push({ kind: 'record_order', detail });
  return {
    ...builder.bounds, ...composition,
    generatedSuppressions: chunkAuthorityGeneratedSuppressions(meta),
    combatRegions: meta.combatRegions,
    present,
    issues,
    authorityIncomplete: issues.some(issue => issue.kind !== 'chunk_missing'),
  };
}

/** The client window composition of one medium (composeAuthorityCollision). */
export function composeChunkWindowCollision(window: ChunkWindowCollision, medium: ChunkCollisionMedium,
  liveBaseObstacles: readonly CollisionObstacle[] = []): CollisionMap {
  return composeAuthorityCollision(window, medium, liveBaseObstacles);
}

