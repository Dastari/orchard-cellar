import type { ContentRegistry, RuntimeTilesetResolver } from '@orchard/sim';
import { mapDocumentUsesSurvivalIslandBase, runtimeTilesetResolver, runtimeTraversalPolicy, SURVIVAL_WORLD_SIZE, TOPSIDE_SPACE_ID,
  type MapDocumentV3 } from '@orchard/sim';
import { WORLD_CHUNK_SIZE, type ChunkJson, type WorldChunkManifest } from '@orchard/sim/world-chunk';
import {
  buildChunkWindowCollision, chunkAuthorityGeneratedSuppressions, chunkAuthorityGroundFieldsMissing, chunkAuthorityMetadata,
  chunkAuthorityTraversalChannels, type ChunkAuthorityManifestMetadata, type ChunkWindowCollision,
} from '@orchard/sim/chunk-collision';
import type { BoundedChunkTerrainStore } from '@orchard/engine/bounded-chunk-terrain-store';
import {
  CHUNK_WINDOW_CHUNKS, CHUNK_WINDOW_MARGIN_TILES, ChunkTerrainWindowTracker, buildChunkTerrainWindow, chunkWindowForView, chunkWindowKey,
  chunkWindowPinBounds, type ChunkTerrainWindow, type ChunkWindowInvalidation, type ChunkWindowRect, type TileBounds,
} from '@orchard/engine/chunk-terrain-window';
import type { TerrainArray } from '@orchard/engine/terrain';

export type ChunkPinBounds = readonly [number, number, number, number];

export interface WorldSourceDependencies {
  /** The chunk runtime's serving store. Defined only when the effective mode is
   * `on` and a fully loaded revision has swapped in (ChunkRuntimeController.store). */
  readonly store: () => BoundedChunkTerrainStore | undefined;
  /** Pins the window's chunks in the chunk runtime (shadow and on). */
  readonly pin: (bounds: ChunkPinBounds) => void;
  /** Why the serving revision may not stand in for the server's authority right
   * now (ChunkRuntimeController.authorityGate: superseded by a newer publication,
   * or stale content or map), or null. The server then serves its compiled map
   * (SW-D2), so client collision and suppression follow it to the legacy source. */
  readonly authorityGate?: () => string | null;
  /** The live island's size (the dispatcher's `guard_size`); SURVIVAL_WORLD_SIZE by default. */
  readonly worldSize?: { readonly width: number; readonly height: number };
  /** Work the client derives from a window before it is served (static world S4f:
   * the light preparation, the traversal projections), one step per frame. The
   * results must be caches the serving frame hits, never state of their own. */
  readonly prewarm?: readonly WorldSourcePrewarmStep[];
  /** Milliseconds, for the staging diagnostics (performance.now by default). */
  readonly now?: () => number;
  /** `cx:cy` of serving-store chunks whose load failed: a window never waits for them. */
  readonly failedChunks?: () => ReadonlySet<string> | undefined;
}

/** A window about to be served, handed to each prewarm step. */
export interface WorldSourcePrewarm {
  readonly window: ChunkTerrainWindow;
  /** Its authority collision, when the chunk collision will serve it. */
  readonly collision: ChunkWindowCollision | undefined;
}
export type WorldSourcePrewarmStep = (prewarm: WorldSourcePrewarm, registry: ContentRegistry) => void;

/**
 * How far ahead of S4c's margin the next window is prepared (static world S4f).
 * The served window must keep the camera view plus CHUNK_WINDOW_MARGIN_TILES
 * inside it; once the view comes within this many further tiles of breaking
 * that, the next window's chunks are pinned and it is built over the following
 * frames, one stage per frame, then served in one assignment. The served window
 * still satisfies the margin at that moment, so every frame draws exactly what a
 * synchronous rebuild would. Outrunning it (or a teleport) falls back to today's
 * synchronous rebuild.
 */
export const CHUNK_WINDOW_LOOKAHEAD_TILES = 16;

/** Staged window diagnostics (static world S4f). */
export interface WorldSourceStagingStatus {
  /** Windows served after being prepared ahead of time. */
  readonly staged: number;
  /** Window moves that had to be built synchronously (a teleport, or a view that
   * outran the lookahead; not the first window, a revision swap or late chunks). */
  readonly synchronous: number;
  /** Staged rebuilds of the served window for chunks that arrived after it was built. */
  readonly arrivals: number;
  /** The pending window's rect key and stage, or null. */
  readonly pending: string | null;
}

/** Why topside collision currently uses the legacy source in chunk mode `on`
 * (null while the chunk collision serves or no store is serving at all). */
export interface WorldSourceCollisionStatus {
  /** Collision builds that threw. */
  readonly failures: number;
  readonly lastError: string | null;
  /** The server-mirroring reason the legacy collision is in use, e.g. `superseded`,
   * `stale_map`, `incomplete: head_missing@3,4`, `traversal_policy_mismatch`. */
  readonly fallbackReason: string | null;
  /** The serving publication is incomplete or malformed (the server's `incomplete`). */
  readonly authorityIncomplete: boolean;
  /** Window chunks not resident yet: solid until they arrive (spawn readiness, S4f). */
  readonly missingChunks: number;
}

/** Client collision in chunk mode `on` (static world S4d): the window's static
 * authority collision and the render window it was built with. */
export interface WorldSourceCollision {
  readonly collision: ChunkWindowCollision;
  readonly terrain: TerrainArray;
  /** The render window the collision was built from. (Never the window before it:
   * cached per window, that would chain every served window into memory.) */
  readonly window: ChunkTerrainWindow;
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

interface PendingWindow {
  readonly store: BoundedChunkTerrainStore;
  readonly tilesets: RuntimeTilesetResolver;
  readonly rect: ChunkWindowRect;
  readonly key: string;
  window?: ChunkTerrainWindow;
  /** store.installs when the window was built (a later arrival rebuilds it). */
  installs: number;
  buildMs: number;
  collisionDone: boolean;
  collision?: ChunkWindowCollision;
  step: number;
  ready: boolean;
  /** A rebuild of the served rect for chunks that arrived after it was built. */
  readonly arrival: boolean;
  /** advance() frame it was created in (arrivals coalesce for a few frames). */
  readonly since: number;
}

/** Frames a staged rebuild for late chunks waits for more of them to arrive. */
export const CHUNK_ARRIVAL_COALESCE_FRAMES = 6;
/** Frames a window prepared ahead of the view waits for its chunks before building with
 * what is resident (the rest then arrive as late chunks). */
export const CHUNK_LOOKAHEAD_WAIT_FRAMES = 120;

export class WorldSource {
  readonly #tracker = new ChunkTerrainWindowTracker();
  readonly #collisions = new WeakMap<ChunkTerrainWindow, WorldSourceCollision | null>();
  #collisionSerial = 0;
  #collisionFailures = 0;
  #lastCollisionError: string | null = null;
  #collisionFallback: string | null = null;
  #authorityIncomplete = false;
  #missingChunks = 0;
  readonly #manifestReasons = new WeakMap<WorldChunkManifest, WeakMap<ContentRegistry, string | null>>();
  #rect: ChunkWindowRect | undefined;
  #pinKey = '';
  #failures = 0;
  #lastError: string | null = null;
  /** The inputs of the last failed build: not retried until one of them changes. */
  #failed: { readonly store: BoundedChunkTerrainStore; readonly rect: string; readonly installs: number } | undefined;
  /** The next window, prepared ahead of the view (S4f). Only the pending and the
   * served window are ever held here, never the ones before them. */
  #pending: PendingWindow | undefined;
  #staged = 0;
  #synchronous = 0;
  #arrivals = 0;
  /** advance() calls so far; once the client advances, late chunks are staged too. */
  #frame = 0;
  constructor(private readonly dependencies: WorldSourceDependencies) {}

  get status(): WorldSourceStatus {
    return { failures: this.#failures, lastError: this.#lastError, fallback: this.#failed !== undefined };
  }

  get collisionStatus(): WorldSourceCollisionStatus {
    return { failures: this.#collisionFailures, lastError: this.#lastCollisionError, fallbackReason: this.#collisionFallback,
      authorityIncomplete: this.#authorityIncomplete, missingChunks: this.#missingChunks };
  }

  get stagingStatus(): WorldSourceStagingStatus {
    const pending = this.#pending;
    return { staged: this.#staged, synchronous: this.#synchronous, arrivals: this.#arrivals,
      pending: pending === undefined ? null : `${pending.key}:${pending.window === undefined ? 'resident' : pending.ready ? 'ready'
        : !pending.collisionDone ? 'collision' : `prewarm${pending.step}`}` };
  }

  /**
   * Publication-level reasons the server's dispatcher (S2b) would serve its
   * compiled map instead of chunks: the gate (superseded, stale content or map),
   * no authority extension, missing ground fields, a traversal channel presence
   * that disagrees with the live registry policy, or heads that do not cover the
   * map. Null when the serving manifest may stand in for the server's authority.
   */
  #authorityReason(store: BoundedChunkTerrainStore, registry: ContentRegistry): string | null {
    const gate = this.dependencies.authorityGate?.() ?? null;
    if (gate !== null) return gate;
    const manifest = store.manifest;
    let byRegistry = this.#manifestReasons.get(manifest);
    if (byRegistry === undefined) { byRegistry = new WeakMap(); this.#manifestReasons.set(manifest, byRegistry); }
    let reason = byRegistry.get(registry);
    if (reason === undefined) {
      reason = manifestAuthorityReason(manifest, registry,
        this.dependencies.worldSize ?? { width: SURVIVAL_WORLD_SIZE, height: SURVIVAL_WORLD_SIZE });
      byRegistry.set(registry, reason);
    }
    return reason;
  }

  /**
   * Topside client collision in chunk mode `on`: the static authority collision
   * of the render window's resident chunks (chunk-collision), or undefined when
   * the legacy source applies: modes off and shadow, `on` before a revision
   * serves, a window that failed to build, and every case in which the server
   * would serve its compiled map (#authorityReason, or a malformed resident
   * chunk; blob_missing / blob_invalid of chunks never fetched cannot be seen
   * here, which is unavoidable). A window chunk that is merely not resident yet stays solid instead:
   * the publication is fine, and waiting for it is spawn readiness (S4f).
   * Built once per window (ahead of time for a staged window, S4f).
   */
  collision(registry: ContentRegistry): WorldSourceCollision | undefined {
    const store = this.dependencies.store();
    if (store === undefined || store.manifest.spaceId !== TOPSIDE_SPACE_ID) return this.#fallback(null);
    const reason = this.#authorityReason(store, registry);
    if (reason !== null) return this.#fallback(reason);
    const window = this.window(registry);
    if (window === undefined) return this.#fallback('window_unavailable');
    const cached = this.#collisionFor(store, window);
    if (cached === null) return this.#fallback('collision_build_failed');
    const incomplete = cached.collision.issues.filter(issue => issue.kind !== 'chunk_missing');
    this.#authorityIncomplete = incomplete.length > 0;
    this.#missingChunks = cached.collision.issues.length - incomplete.length;
    if (incomplete.length > 0) {
      const first = incomplete[0]!;
      return this.#fallback(`incomplete: ${first.kind}${first.cx === undefined ? '' : `@${first.cx},${first.cy}`}${first.detail === undefined ? '' : `:${first.detail}`}`, true);
    }
    this.#collisionFallback = null;
    return cached;
  }

  /** The window's collision, built once from exactly the chunks the window used
   * (a chunk that arrived since is picked up when the window rebuilds for it). */
  #collisionFor(store: BoundedChunkTerrainStore, window: ChunkTerrainWindow): WorldSourceCollision | null {
    let cached = this.#collisions.get(window);
    if (cached === undefined) {
      try {
        cached = this.#buildCollision(store, window);
      } catch (error) {
        this.#collisionFailures += 1;
        this.#lastCollisionError = error instanceof Error ? error.message : String(error);
        console.warn('Chunk collision failed; using the legacy collision', error);
        cached = null;
      }
      this.#collisions.set(window, cached);
    }
    return cached;
  }

  #buildCollision(store: BoundedChunkTerrainStore, window: ChunkTerrainWindow): WorldSourceCollision {
    const collision = buildChunkWindowCollision({ manifest: store.manifest,
      peekChunk: (cx, cy) => window.present.has(`${cx}:${cy}`) ? store.peekChunk(cx, cy) : undefined }, window.rect);
    return { collision, terrain: window.terrain, window, serial: ++this.#collisionSerial };
  }

  #fallback(reason: string | null, incomplete = false): undefined {
    this.#collisionFallback = reason;
    this.#authorityIncomplete = incomplete || reason?.startsWith('incomplete') === true;
    if (!incomplete) this.#missingChunks = 0;
    return undefined;
  }

  /** The serving manifest's authority metadata (generated suppressions, combat
   * regions) under the same publication-level conditions as collision. */
  authority(registry: ContentRegistry): ChunkAuthorityManifestMetadata | undefined {
    const store = this.dependencies.store();
    if (store === undefined || store.manifest.spaceId !== TOPSIDE_SPACE_ID || this.#authorityReason(store, registry) !== null) return undefined;
    return chunkAuthorityMetadata(store.manifest);
  }

  /** True when the serving manifest suppresses generated resource `id` (`on`
   * only; undefined means the legacy document decides). */
  suppressesGeneratedResource(id: bigint, registry: ContentRegistry): boolean | undefined {
    const authority = this.authority(registry);
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
      this.#pending = undefined;
      return undefined;
    }
    const rect = this.#rect ?? pinnedRect(store);
    if (rect === undefined) return undefined;
    const failed = this.#failed;
    if (failed !== undefined && failed.store === store && failed.rect === chunkWindowKey(rect) && failed.installs === store.installs) return undefined;
    try {
      const tilesets = tilesetsFor(registry), key = chunkWindowKey(rect);
      const pending = this.#pending, served = this.#tracker.window;
      let window: ChunkTerrainWindow;
      if (pending !== undefined && pending.key === key && (served === undefined || chunkWindowKey(served.rect) !== key || pending.ready)) {
        // The prepared window (S4f); a view that outran its stages serves what is built.
        this.#pending = undefined;
        if (pending.window !== undefined && pending.store === store && pending.tilesets === tilesets) {
          window = this.#tracker.adopt(store, pending.window, tilesets, pending.installs, pending.buildMs);
          if (!pending.ready) this.#synchronous++;
          else if (pending.arrival) this.#arrivals++;
          else this.#staged++;
        } else window = this.#update(store, rect, tilesets);
      } else window = this.#update(store, rect, tilesets);
      if (this.#failed !== undefined) { this.#failed = undefined; this.#lastError = null; }
      return window;
    } catch (error) {
      // A malformed chunk must never stop topside rendering: draw the legacy map
      // this frame, count it, and retry only once the store, window or chunks change.
      this.#failures += 1;
      this.#lastError = error instanceof Error ? error.message : String(error);
      this.#failed = { store, rect: chunkWindowKey(rect), installs: store.installs };
      this.#tracker.reset();
      this.#pending = undefined;
      console.warn('Chunk terrain window failed; drawing the legacy terrain', error);
      return undefined;
    }
  }

  #update(store: BoundedChunkTerrainStore, rect: ChunkWindowRect, tilesets: RuntimeTilesetResolver): ChunkTerrainWindow {
    const served = this.#tracker.window;
    // A window move within the same revision (not the first window, a revision swap or late chunks).
    const moved = served !== undefined && served.manifest === store.manifest && chunkWindowKey(served.rect) !== chunkWindowKey(rect);
    // Once the client advances every frame, late chunks rebuild through a staged pending
    // window (advance) rather than synchronously here.
    // Deferred only while the pending slot is free or already holds that rebuild: a window
    // prepared ahead of the view may wait on its own chunks, and must never hold back
    // chunks the served window is missing (they then rebuild it at once, as before S4f).
    const pending = this.#pending;
    const window = this.#tracker.update(store, rect, tilesets,
      { deferArrivals: this.#frame > 0 && (pending === undefined || (pending.arrival && pending.key === chunkWindowKey(rect))) });
    if (moved) this.#synchronous++;
    return window;
  }

  /** The camera's visible topside tiles, once per rendered frame. */
  setView(view: TileBounds): void {
    const store = this.dependencies.store();
    const manifest = store?.manifest;
    const topside = manifest?.spaceId === TOPSIDE_SPACE_ID;
    const width = topside ? manifest.width : SURVIVAL_WORLD_SIZE;
    const height = topside ? manifest.height : SURVIVAL_WORLD_SIZE;
    const rect = chunkWindowForView(view, width, height, this.#rect);
    this.#rect = rect;
    const key = chunkWindowKey(rect), served = this.#tracker.window;
    let pin = rect;
    if (!topside || served === undefined) this.#pending = undefined;
    else if (chunkWindowKey(served.rect) !== key) {
      // The view left the served window's margin: window() switches this frame,
      // serving the prepared window if it is this one.
      if (this.#pending?.key !== key) this.#pending = undefined;
    } else {
      // Look ahead (S4f): pin and prepare the window the view is heading for.
      const ahead = chunkWindowForView(view, width, height, rect, CHUNK_WINDOW_MARGIN_TILES + CHUNK_WINDOW_LOOKAHEAD_TILES);
      const aheadKey = chunkWindowKey(ahead);
      // (A staged rebuild of the served rect for late chunks is kept.)
      if (aheadKey === key) { if (this.#pending?.key !== key) this.#pending = undefined; }
      else {
        if (this.#pending?.key !== aheadKey || this.#pending.store !== store) {
          this.#pending = { store: store!, tilesets: served.terrain.tilesets as RuntimeTilesetResolver, rect: ahead, key: aheadKey,
            installs: -1, buildMs: 0, collisionDone: false, step: 0, ready: false, arrival: false, since: this.#frame };
        }
        pin = ahead;
      }
    }
    const pinKey = chunkWindowKey(pin);
    if (pinKey === this.#pinKey) return;
    this.#pinKey = pinKey;
    this.dependencies.pin(chunkWindowPinBounds(pin));
  }

  /**
   * Advances the window prepared ahead of the view by one stage (static world
   * S4f); call once per frame after setView. Stages: wait until its published
   * chunks are resident, build the window, build its collision, run each prewarm
   * step, then serve it. Each frame so does at most one of them, and the frame
   * that serves it finds every derived result cached.
   */
  advance(registry: ContentRegistry): void {
    this.#frame++;
    const store = this.dependencies.store();
    if (this.#pending === undefined && store !== undefined) this.#pending = this.#arrivalPending(store, registry);
    const pending = this.#pending;
    if (pending === undefined || pending.ready) return;
    if (store !== pending.store || tilesetsFor(registry) !== pending.tilesets) { this.#pending = undefined; return; }
    if (pending.window === undefined) {
      // Late chunks coalesce for a few frames; a window ahead of the view waits for all of them.
      // Chunks whose load failed are never waited for; nor is anything for long.
      const waited = this.#frame - pending.since;
      if (!windowResident(store, pending.rect, this.dependencies.failedChunks?.())
        && waited < (pending.arrival ? CHUNK_ARRIVAL_COALESCE_FRAMES : CHUNK_LOOKAHEAD_WAIT_FRAMES)) return;
      const now = this.dependencies.now ?? (() => performance.now());
      const startedAt = now();
      try {
        pending.window = buildChunkTerrainWindow(store, pending.rect, { tilesets: pending.tilesets });
      } catch {
        // Left to the synchronous path and its failure handling when the view needs it.
        this.#pending = undefined; return;
      }
      pending.buildMs = now() - startedAt;
      pending.installs = store.installs;
      return;
    }
    const window = pending.window;
    if (window.missing > 0 && store.installs !== pending.installs
      && [...windowChunkKeys(pending.rect)].some(([cx, cy]) => !window.present.has(`${cx}:${cy}`) && store.peekChunk(cx, cy) !== undefined)) {
      // A chunk arrived after the build: build again, as the tracker would.
      pending.window = undefined; pending.collisionDone = false; pending.collision = undefined; pending.step = 0;
      return;
    }
    if (!pending.collisionDone) {
      pending.collisionDone = true;
      if (this.#authorityReason(store, registry) === null) {
        // Built ahead of time: a failure is left uncached and uncounted, so collision() retries
        // and reports it only if this window is ever served.
        let built = this.#collisions.get(window);
        if (built === undefined) try { built = this.#buildCollision(store, window); this.#collisions.set(window, built); } catch { built = undefined; }
        pending.collision = built?.collision;
      }
      return;
    }
    const steps = this.dependencies.prewarm ?? [];
    if (pending.step < steps.length) {
      const step = steps[pending.step++]!;
      step({ window, collision: pending.collision }, registry);
      return;
    }
    // Prepared: served from this frame on (window() adopts it).
    pending.ready = true;
    this.#rect = pending.rect;
  }

  /** A staged rebuild of the served window once any of its missing chunks is resident. */
  #arrivalPending(store: BoundedChunkTerrainStore, registry: ContentRegistry): PendingWindow | undefined {
    const served = this.#tracker.window;
    if (served === undefined || served.missing === 0 || served.manifest !== store.manifest || this.#rect === undefined
      || chunkWindowKey(served.rect) !== chunkWindowKey(this.#rect) || served.terrain.tilesets !== tilesetsFor(registry)) return undefined;
    if (![...windowChunkKeys(served.rect)].some(([cx, cy]) => !served.present.has(`${cx}:${cy}`) && store.peekChunk(cx, cy) !== undefined)) return undefined;
    return { store, tilesets: tilesetsFor(registry), rect: served.rect, key: chunkWindowKey(served.rect), installs: -1, buildMs: 0,
      collisionDone: false, step: 0, ready: false, arrival: true, since: this.#frame };
  }

  /** Hands the ground cache the tile regions whose window data changed. */
  drainGroundInvalidations(visit: (region: ChunkWindowInvalidation) => void): void {
    this.#tracker.drainInvalidations(visit);
  }

  /** The window served now, without building or updating anything (spawn readiness). */
  get servedWindow(): ChunkTerrainWindow | undefined { return this.#tracker.window; }

  get lastBuildMs(): number { return this.#tracker.lastBuildMs; }
  get builds(): number { return this.#tracker.builds; }
}

/** Every published chunk of `rect` is resident, or failed to load (it reads as solid void). */
function windowResident(store: BoundedChunkTerrainStore, rect: ChunkWindowRect, failed?: ReadonlySet<string>): boolean {
  for (const [cx, cy] of windowChunkKeys(rect)) {
    if (store.peekChunk(cx, cy) === undefined && failed?.has(`${cx}:${cy}`) !== true
      && store.manifest.chunks.some(head => head.cx === cx && head.cy === cy)) return false;
  }
  return true;
}

function* windowChunkKeys(rect: ChunkWindowRect): Generator<readonly [number, number]> {
  for (let cy = rect.cy; cy < rect.cy + rect.rows; cy++) for (let cx = rect.cx; cx < rect.cx + rect.columns; cx++) yield [cx, cy];
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

/** The server dispatcher's publication-level refusals a client can evaluate
 * (#174 chunk-authority-dispatch). It cannot see `blob_missing` / `blob_invalid`
 * for chunks it has not fetched: that is unavoidable, and a resident malformed
 * chunk is still caught per window (`incomplete`). */
function manifestAuthorityReason(manifest: WorldChunkManifest, registry: ContentRegistry,
  worldSize: { readonly width: number; readonly height: number }): string | null {
  // guard_size / guard_base: the chunks describe the survival island at the live size.
  if (manifest.width !== worldSize.width || manifest.height !== worldSize.height) return `guard_size: ${manifest.width}x${manifest.height}`;
  const document = manifest.metadata['document'];
  const provenance = document !== null && typeof document === 'object' && !Array.isArray(document)
    ? (document as { readonly [key: string]: ChunkJson })['provenance'] : undefined;
  if (provenance === null || typeof provenance !== 'object' || Array.isArray(provenance)
    || !mapDocumentUsesSurvivalIslandBase({ provenance } as unknown as Pick<MapDocumentV3, 'provenance'>)) return 'guard_base';
  const meta = chunkAuthorityMetadata(manifest);
  if (meta === undefined) return 'authority_metadata_missing';
  const missing = chunkAuthorityGroundFieldsMissing(meta);
  if (missing.length > 0) return `ground_fields_missing: ${missing.join(',')}`;
  const channels = chunkAuthorityTraversalChannels(meta), active = runtimeTraversalPolicy(registry) !== null;
  if (channels.ground !== active || channels.water !== active) return 'traversal_policy_mismatch';
  const heads = new Set(manifest.chunks.map(head => `${head.cx}:${head.cy}`));
  for (let cy = 0; cy < Math.ceil(manifest.height / WORLD_CHUNK_SIZE); cy++) for (let cx = 0; cx < Math.ceil(manifest.width / WORLD_CHUNK_SIZE); cx++) {
    if (!heads.has(`${cx}:${cy}`)) return `incomplete: head_missing@${cx},${cy}`;
  }
  return null;
}
