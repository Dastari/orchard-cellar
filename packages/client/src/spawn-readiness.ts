import { TOPSIDE_SPACE_ID } from '@orchard/sim';
import type { ChunkRuntimeMode } from '@orchard/sim/chunk-runtime';
import { WORLD_CHUNK_SIZE, type WorldChunkManifest } from '@orchard/sim/world-chunk';

/**
 * Static world S4f: whether the local player may move, as far as terrain goes.
 *
 * Only chunk mode `on` ever waits, and only on topside: movement, rendering and
 * collision there come from the chunk window, whose missing chunks are solid void.
 * The player's chunk and its ring of eight must be resident first. Modes `off`
 * and `shadow` (and every other space) are always ready, so they behave exactly
 * as before S4f.
 *
 * It never locks a player out (plan decision 7): whenever the chunk runtime is not
 * going to serve (nothing published, a failed load, a subscription error) the
 * legacy source serves as before and this is ready; a ring chunk whose load
 * failed counts as resolved (it reads as solid void, like any failed chunk); and
 * a wait that outlasts SPAWN_READINESS_TIMEOUT_MS gives up (reason `timeout`, in
 * the diagnostics). The chunks given up on stay resolved for that publication, so
 * approaching them again never re-arms the wait.
 */
export type SpawnReadinessReason =
  | 'not_on' | 'other_space' | 'no_position' | 'legacy' | 'resident' | 'timeout'
  | 'awaiting_store' | 'awaiting_pin' | 'awaiting_chunks' | 'awaiting_window';

export interface SpawnReadiness {
  readonly ready: boolean;
  readonly reason: SpawnReadinessReason;
  /** Published ring chunks still missing (awaiting_chunks). */
  readonly missing: number;
  /** Their `cx:cy` keys. */
  readonly missingKeys?: readonly string[];
}

/** What the chunk runtime serves: BoundedChunkTerrainStore, structurally. */
export interface SpawnReadinessStore {
  readonly manifest: WorldChunkManifest;
  readonly pinnedKeys: readonly string[];
  peekChunk(cx: number, cy: number): unknown;
}

export interface SpawnReadinessInput {
  /** The chunk runtime's effective mode (after the server's chunkAuthority), undefined without a runtime. */
  readonly mode: ChunkRuntimeMode | undefined;
  /** The runtime's state (ChunkRuntimeStatus.state). */
  readonly state: string | undefined;
  /** The serving store (`on` only). */
  readonly store: SpawnReadinessStore | undefined;
  /** `cx:cy` of the serving store's chunks whose load failed, or that were given up on. */
  readonly resolved?: ReadonlySet<string>;
  /** The render window served now (WorldSource.servedWindow): collision and drawing come
   * from it, so a ring chunk resident in the store but not yet in this window is waited for. */
  readonly window?: { readonly rect: { readonly cx: number; readonly cy: number; readonly columns: number; readonly rows: number };
    readonly present: ReadonlySet<string> };
  /** The local player's space and tile, if known. */
  readonly spaceId: number | undefined;
  readonly tileX: number | undefined;
  readonly tileY: number | undefined;
}

/** Runtime states in which a first serving store is still on its way. */
const LOADING_STATES: ReadonlySet<string> = new Set(['idle', 'subscribing', 'loading', 'awaiting_heads']);

/** Chunk-level readiness for one instant (no timeout). */
export function chunkSpawnReadiness(input: SpawnReadinessInput): SpawnReadiness {
  const ready = (reason: SpawnReadinessReason): SpawnReadiness => ({ ready: true, reason, missing: 0 });
  if (input.mode !== 'on') return ready('not_on');
  if (input.spaceId !== TOPSIDE_SPACE_ID) return ready('other_space');
  if (input.tileX === undefined || input.tileY === undefined) return ready('no_position');
  const store = input.store;
  if (store === undefined) {
    return LOADING_STATES.has(input.state ?? 'idle') ? { ready: false, reason: 'awaiting_store', missing: 0 } : ready('legacy');
  }
  const cx = Math.floor(input.tileX / WORLD_CHUNK_SIZE), cy = Math.floor(input.tileY / WORLD_CHUNK_SIZE);
  const pinned = new Set(store.pinnedKeys);
  // The pin follows the camera: until it covers the player (a teleport), nothing can load.
  if (!pinned.has(`${cx}:${cy}`) && store.manifest.chunks.some(head => head.cx === cx && head.cy === cy)) {
    return { ready: false, reason: 'awaiting_pin', missing: 0 };
  }
  const missingKeys: string[] = [];
  let unserved = 0;
  const window = input.window, rect = window?.rect;
  for (const head of store.manifest.chunks) {
    const key = `${head.cx}:${head.cy}`;
    if (Math.abs(head.cx - cx) > 1 || Math.abs(head.cy - cy) > 1 || !pinned.has(key) || input.resolved?.has(key) === true) continue;
    if (store.peekChunk(head.cx, head.cy) === undefined) missingKeys.push(key);
    else if (rect !== undefined && head.cx >= rect.cx && head.cy >= rect.cy && head.cx < rect.cx + rect.columns && head.cy < rect.cy + rect.rows
      && !window!.present.has(key)) unserved++;
  }
  if (missingKeys.length > 0) return { ready: false, reason: 'awaiting_chunks', missing: missingKeys.length, missingKeys };
  return unserved === 0 ? ready('resident') : { ready: false, reason: 'awaiting_window', missing: unserved };
}

/** How long movement may wait for terrain before giving up (a chunk fetch times out at 15 s). */
export const SPAWN_READINESS_TIMEOUT_MS = 20_000;

/** chunkSpawnReadiness plus the wait's start time and the no-lock-out timeout. */
export class SpawnReadinessGate {
  #waitingSince: number | undefined;
  #last: SpawnReadiness = { ready: true, reason: 'not_on', missing: 0 };
  #waits = 0;
  #timeouts = 0;
  /** Chunks a timed-out wait gave up on, for the publication they belong to. */
  #givenUp: { manifest: WorldChunkManifest; keys: Set<string> } | undefined;
  constructor(readonly timeoutMs = SPAWN_READINESS_TIMEOUT_MS) {}

  update(input: SpawnReadinessInput, now: number): SpawnReadiness {
    const manifest = input.store?.manifest;
    if (this.#givenUp !== undefined && this.#givenUp.manifest !== manifest) this.#givenUp = undefined;
    const givenUp = this.#givenUp?.keys;
    const resolved = givenUp === undefined || givenUp.size === 0 ? input.resolved
      : new Set([...(input.resolved ?? []), ...givenUp]);
    let result = chunkSpawnReadiness(resolved === input.resolved ? input : { ...input, resolved });
    if (result.ready) this.#waitingSince = undefined;
    else {
      if (this.#waitingSince === undefined) { this.#waitingSince = now; this.#waits++; }
      if (now - this.#waitingSince >= this.timeoutMs) {
        if (this.#last.reason !== 'timeout') this.#timeouts++;
        if (manifest !== undefined && result.missingKeys !== undefined) {
          this.#givenUp ??= { manifest, keys: new Set() };
          for (const key of result.missingKeys) this.#givenUp.keys.add(key);
        }
        result = { ready: true, reason: 'timeout', missing: result.missing };
      }
    }
    this.#last = result;
    return result;
  }

  /** Diagnostics: the latest answer, how long the current wait has lasted, and counts. */
  status(now: number): SpawnReadiness & { readonly waitedMs: number; readonly waits: number; readonly timeouts: number } {
    return { ...this.#last, waitedMs: this.#waitingSince === undefined ? 0 : now - this.#waitingSince, waits: this.#waits, timeouts: this.#timeouts };
  }
}
