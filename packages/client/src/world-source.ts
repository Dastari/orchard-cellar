import type { ContentRegistry, RuntimeTilesetResolver } from '@orchard/sim';
import { runtimeTilesetResolver, SURVIVAL_WORLD_SIZE, TOPSIDE_SPACE_ID } from '@orchard/sim';
import { WORLD_CHUNK_SIZE } from '@orchard/sim/world-chunk';
import {
  buildChunkWindowCollision, chunkAuthorityGeneratedSuppressions, chunkAuthorityMetadata,
  type ChunkAuthorityManifestMetadata, type ChunkWindowCollision,
} from '@orchard/sim/chunk-collision';
import type { BoundedChunkTerrainStore } from '@orchard/engine/bounded-chunk-terrain-store';
import {
  CHUNK_WINDOW_CHUNKS, ChunkTerrainWindowTracker, chunkWindowForView, chunkWindowKey, chunkWindowPinBounds,
  type ChunkTerrainWindow, type ChunkWindowInvalidation, type ChunkWindowRect, type TileBounds,
} from '@orchard/engine/chunk-terrain-window';
import type { TerrainArray } from '@orchard/engine/terrain';

export type ChunkPinBounds = readonly [number, number, number, number];

export interface WorldSourceDependencies {
  /** The chunk runtime's serving store. Defined only when the effective mode is
   * `on` and a fully loaded revision has swapped in (ChunkRuntimeController.store). */
  readonly store: () => BoundedChunkTerrainStore | undefined;
  /** Pins the window's chunks in the chunk runtime (shadow and on). */
  readonly pin: (bounds: ChunkPinBounds) => void;
  /** True while the serving revision is stale (content or map moved on). The
   * server then falls back to its compiled document (SW-D2), so client
   * collision and suppression follow it back to the legacy source. */
  readonly stale?: () => boolean;
}

/** Client collision in chunk mode `on` (static world S4d): the window's static
 * authority collision and the render window it was built with. */
export interface WorldSourceCollision {
  readonly collision: ChunkWindowCollision;
  readonly terrain: TerrainArray;
  /** Changes whenever the collision (window, revision or resident chunks) changes. */
  readonly serial: number;
}

const resolvers = new WeakMap<object, RuntimeTilesetResolver>();
/** One resolver per registry: the window rebuilds when its resolver changes. */
function tilesetsFor(registry: ContentRegistry): RuntimeTilesetResolver {
  let resolver = resolvers.get(registry.tilesets);
  if (resolver === undefined) {
    resolver = runtimeTilesetResolver(registry.tilesets);
    resolvers.set(registry.tilesets, resolver);
  }
  return resolver;
}

/**
 * Static world S4c: the one place the client gets its topside terrain from.
 *
 * - Chunk mode `off` or `shadow` (or `on` before a revision is serving): the
 *   legacy whole-map terrain the caller supplies, exactly as before.
 * - Chunk mode `on` with a serving store: a 5 x 5 chunk window around the
 *   camera, rebuilt from the bounded store when the window moves, the serving
 *   revision swaps, or a missing window chunk arrives. Ground chunks whose data
 *   changed are handed to the ground cache through drainGroundInvalidations.
 *
 * The camera's visible tiles (setView) choose the window and, in shadow and on,
 * what the chunk runtime pins, so large and ultrawide screens never ask the
 * bounded store for more than the 25 window chunks.
 */
/** Window build health: a failed build falls back to the legacy terrain. */
export interface WorldSourceStatus {
  /** Window builds that threw (a malformed or mismatched chunk). */
  readonly failures: number;
  /** The last build error, cleared by the next successful build. */
  readonly lastError: string | null;
  /** True while the current store, window and installs keep failing (legacy is drawn). */
  readonly fallback: boolean;
}

export class WorldSource {
  readonly #tracker = new ChunkTerrainWindowTracker();
  readonly #collisions = new WeakMap<ChunkTerrainWindow, WorldSourceCollision | null>();
  #collisionSerial = 0;
  #collisionFailures = 0;
  #lastCollisionError: string | null = null;
  #rect: ChunkWindowRect | undefined;
  #pinKey = '';
  #failures = 0;
  #lastError: string | null = null;
  /** The inputs of the last failed build: not retried until one of them changes. */
  #failed: { readonly store: BoundedChunkTerrainStore; readonly rect: string; readonly installs: number } | undefined;
  constructor(private readonly dependencies: WorldSourceDependencies) {}

  get status(): WorldSourceStatus {
    return { failures: this.#failures, lastError: this.#lastError, fallback: this.#failed !== undefined };
  }

  /** Collision builds that fell back to the legacy source (no authority metadata or a build error). */
  get collisionStatus(): { readonly failures: number; readonly lastError: string | null } {
    return { failures: this.#collisionFailures, lastError: this.#lastCollisionError };
  }

  /**
   * Topside client collision in chunk mode `on`: the static authority collision
   * of the render window's resident chunks (chunk-collision), or undefined when
   * the legacy source applies: modes off and shadow, `on` before a revision
   * serves, a stale revision, a window that failed to build, or a manifest
   * published without the authority extension. Built once per window.
   */
  collision(registry: ContentRegistry): WorldSourceCollision | undefined {
    if (this.dependencies.stale?.() === true) return undefined;
    const store = this.dependencies.store();
    if (store === undefined || chunkAuthorityMetadata(store.manifest) === undefined) return undefined;
    const window = this.window(registry);
    if (window === undefined) return undefined;
    const cached = this.#collisions.get(window);
    if (cached !== undefined) return cached ?? undefined;
    let result: WorldSourceCollision | null;
    try {
      // Exactly the chunks the render window used: a chunk that arrived since is
      // picked up when the window rebuilds for it.
      const collision = buildChunkWindowCollision({ manifest: store.manifest,
        peekChunk: (cx, cy) => window.present.has(`${cx}:${cy}`) ? store.peekChunk(cx, cy) : undefined }, window.rect);
      result = { collision, terrain: window.terrain, serial: ++this.#collisionSerial };
    } catch (error) {
      this.#collisionFailures += 1;
      this.#lastCollisionError = error instanceof Error ? error.message : String(error);
      console.warn('Chunk collision failed; using the legacy collision', error);
      result = null;
    }
    this.#collisions.set(window, result);
    return result ?? undefined;
  }

  /** The serving manifest's authority metadata (generated suppressions, combat
   * regions) under the same conditions as collision, without building a window. */
  authority(): ChunkAuthorityManifestMetadata | undefined {
    if (this.dependencies.stale?.() === true) return undefined;
    const store = this.dependencies.store();
    if (store === undefined || store.manifest.spaceId !== TOPSIDE_SPACE_ID) return undefined;
    return chunkAuthorityMetadata(store.manifest);
  }

  /** True when the serving manifest suppresses generated resource `id` (`on`
   * only; undefined means the legacy document decides). */
  suppressesGeneratedResource(id: bigint): boolean | undefined {
    const authority = this.authority();
    return authority === undefined ? undefined : chunkAuthorityGeneratedSuppressions(authority).has(`resource-${id}`);
  }

  /** Topside render terrain: the chunk window when serving, else `legacy()`. */
  topsideTerrain(legacy: () => TerrainArray, registry: ContentRegistry): TerrainArray {
    return this.window(registry)?.terrain ?? legacy();
  }

  /** Minimap terrain and a cache-key part. Off and shadow keep today's source
   * (the raw generator, which ignores authored edits); `on` shows the window,
   * i.e. the authored map (plan finding 7). */
  minimapTerrain(legacy: () => TerrainArray, registry: ContentRegistry): { readonly terrain: TerrainArray; readonly key: string } {
    const window = this.window(registry);
    return window === undefined ? { terrain: legacy(), key: '' } : { terrain: window.terrain, key: `window:${this.#tracker.builds}` };
  }

  /** The serving window, if the chunk runtime is `on` for topside. */
  window(registry: ContentRegistry): ChunkTerrainWindow | undefined {
    const store = this.dependencies.store();
    if (store === undefined || store.manifest.spaceId !== TOPSIDE_SPACE_ID) {
      this.#tracker.reset();
      return undefined;
    }
    const rect = this.#rect ?? pinnedRect(store);
    if (rect === undefined) return undefined;
    const failed = this.#failed;
    if (failed !== undefined && failed.store === store && failed.rect === chunkWindowKey(rect) && failed.installs === store.installs) return undefined;
    try {
      const window = this.#tracker.update(store, rect, tilesetsFor(registry));
      if (this.#failed !== undefined) { this.#failed = undefined; this.#lastError = null; }
      return window;
    } catch (error) {
      // A malformed chunk must never stop topside rendering: draw the legacy map
      // this frame, count it, and retry only once the store, window or chunks change.
      this.#failures += 1;
      this.#lastError = error instanceof Error ? error.message : String(error);
      this.#failed = { store, rect: chunkWindowKey(rect), installs: store.installs };
      this.#tracker.reset();
      console.warn('Chunk terrain window failed; drawing the legacy terrain', error);
      return undefined;
    }
  }

  /** The camera's visible topside tiles, once per rendered frame. */
  setView(view: TileBounds): void {
    const manifest = this.dependencies.store()?.manifest;
    const width = manifest?.spaceId === TOPSIDE_SPACE_ID ? manifest.width : SURVIVAL_WORLD_SIZE;
    const height = manifest?.spaceId === TOPSIDE_SPACE_ID ? manifest.height : SURVIVAL_WORLD_SIZE;
    const rect = chunkWindowForView(view, width, height, this.#rect);
    this.#rect = rect;
    const key = chunkWindowKey(rect);
    if (key === this.#pinKey) return;
    this.#pinKey = key;
    this.dependencies.pin(chunkWindowPinBounds(rect));
  }

  /** Hands the ground cache the tile regions whose window data changed. */
  drainGroundInvalidations(visit: (region: ChunkWindowInvalidation) => void): void {
    this.#tracker.drainInvalidations(visit);
  }

  get lastBuildMs(): number { return this.#tracker.lastBuildMs; }
  get builds(): number { return this.#tracker.builds; }
}

/** Before the first topside frame: the window the runtime already pinned. */
function pinnedRect(store: BoundedChunkTerrainStore): ChunkWindowRect | undefined {
  const keys = store.pinnedKeys.map((key) => key.split(':').map(Number) as [number, number]);
  if (keys.length === 0) return undefined;
  const cx = Math.min(...keys.map(([x]) => x)), cy = Math.min(...keys.map(([, y]) => y));
  const chunksX = Math.ceil(store.manifest.width / WORLD_CHUNK_SIZE), chunksY = Math.ceil(store.manifest.height / WORLD_CHUNK_SIZE);
  return { cx, cy, columns: Math.min(CHUNK_WINDOW_CHUNKS, chunksX - cx, Math.max(...keys.map(([x]) => x)) - cx + 1),
    rows: Math.min(CHUNK_WINDOW_CHUNKS, chunksY - cy, Math.max(...keys.map(([, y]) => y)) - cy + 1) };
}
