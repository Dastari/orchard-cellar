import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DbConnection } from '@orchard/world-bindings';
import { runtimeChunkFixture } from '@orchard/sim/chunk-runtime-fixture';
import { chunkWindowForView, chunkWindowPinBounds } from '@orchard/engine/chunk-terrain-window';
import { ChunkRuntimeController, type ChunkRuntimeSource } from './chunk-runtime-controller.js';
import type { ChunkBlobCache } from './chunk-shadow-cache.js';
import { chunkSpawnReadiness } from './spawn-readiness.js';

/**
 * Static world S4f budgets: movement ready in at most 1.5 s warm and 3 s cold.
 * The real controller, loader, store and readiness rule run under fake timers
 * with a modelled network, from the moment the player's own row is known (the
 * connection then calls update with the spawn window's pin) until the spawn
 * chunk and its ring are resident in the serving store.
 *
 * Model (deliberately pessimistic): a 150 ms round trip for the manifest and
 * heads subscription and for each HTTP fetch; 10 Mbit/s shared by the loader's
 * two fetches; every chunk the bootstrap island's median encoded size (152 KB,
 * served uncompressed); 5 ms of decode and verify per chunk (measured p95 on the
 * island: 4.2 ms); a warm IndexedDB read of 20 ms. The atlas check (148 KB)
 * runs beside the load. The CPU of building the first window and its collision
 * (measured 7.5-13 ms) is added to the totals.
 */
const RTT = 150, BYTES_PER_MS = 10_000_000 / 8 / 1000, CHUNK_BYTES = 152_228, ATLAS_BYTES = 148_372, DECODE_MS = 5, CACHE_MS = 20, WINDOW_MS = 13;

afterEach(() => { vi.useRealTimers(); });

async function movementReadyMs(warm: boolean): Promise<{ readonly ms: number; readonly fetched: number; readonly wholeWindowMs: number }> {
  vi.useFakeTimers();
  // The spawn window: 5 x 5 chunks around chunk 6:6 of the 13 x 13 island.
  const coords = Array.from({ length: 25 }, (_, index) => [4 + index % 5, 4 + Math.floor(index / 5)] as const);
  const { blobs, manifest } = runtimeChunkFixture(coords);
  const assets = new TextEncoder().encode('{"assetPacks":{}}');
  // The atlas check disagrees with the chunks here: stale, never a stop, and never waited for.
  const published = manifest;
  const bytes = new Map(published.chunks.map((head, index) => [head.contentHash, blobs[index]!]));
  let inFlight = 0, fetched = 0;
  const transfer = async (size: number) => {
    inFlight++;
    await new Promise(resolve => setTimeout(resolve, RTT + size / (BYTES_PER_MS / Math.max(1, inFlight))));
    inFlight--;
  };
  const fetchBlob = async (path: string) => {
    if (path.includes('atlas.packs')) { await transfer(ATLAS_BYTES); return assets; }
    fetched++;
    await transfer(CHUNK_BYTES);
    await new Promise(resolve => setTimeout(resolve, DECODE_MS));
    return bytes.get(path.split('/').pop()!.replace('.bin', ''))!;
  };
  const cache: ChunkBlobCache = { get: async (hash) => {
    await new Promise(resolve => setTimeout(resolve, CACHE_MS + DECODE_MS));
    return warm ? bytes.get(hash) : undefined;
  }, put: async () => undefined, delete: async () => undefined };
  const heads = published.chunks.map(head => ({ ...head, spaceId: 0n, revision: 1 }));
  const shadow = { spaceId: 0n, revision: 1, contentHash: 'content-1', manifestJson: JSON.stringify(published) };
  const events = { onInsert: () => undefined, onUpdate: () => undefined, onDelete: () => undefined };
  // The manifest and heads rows arrive with the subscription, one round trip after it is made.
  let applied = () => undefined as void, subscribed = false;
  const builder = { onApplied: (fn: () => void) => { applied = fn; return builder; }, onError: () => builder,
    subscribe: () => { setTimeout(() => { subscribed = true; applied(); }, RTT); return { unsubscribe: () => undefined }; } };
  const connection = { db: { worldChunkShadow: { ...events, spaceId: { find: (id: bigint) => id === 0n && subscribed ? shadow : undefined } },
    worldChunkHead: { ...events, iter: () => subscribed ? heads : [] } }, subscriptionBuilder: () => builder } as unknown as DbConnection;
  const controller = new ChunkRuntimeController({ buildMode: 'on', authority: () => 'on', fetchBlob, cache });
  const source: ChunkRuntimeSource = { mapRevision: published.sourceRevision, mapHash: published.sourceHash, contentHash: 'content-1' };
  const tile = 6 * 64 + 20;
  try {
    // The own player row arrives: the connection pins the window centred on the player.
    controller.update(connection, 0n, chunkWindowPinBounds(chunkWindowForView({ minX: tile, minY: tile, maxX: tile, maxY: tile }, 832, 832)), source);
    let ready: number | undefined, readyFetched = 0;
    for (let elapsed = 0; elapsed <= 20_000; elapsed += 5) {
      const readiness = chunkSpawnReadiness({ mode: controller.status.mode, state: controller.status.state, store: controller.store,
        spaceId: 0, tileX: tile, tileY: tile });
      if (readiness.ready && ready === undefined) {
        expect(readiness.reason, controller.status.state).toBe('resident');
        ready = elapsed + WINDOW_MS; readyFetched = fetched;
      }
      // The whole 25-chunk window: when the pre-S4f controller first served (after the atlas check).
      if (ready !== undefined && controller.store?.pinnedReady === true) return { ms: ready, fetched: readyFetched, wholeWindowMs: elapsed + WINDOW_MS };
      await vi.advanceTimersByTimeAsync(5);
    }
    throw new Error('movement never became ready');
  } finally { controller.dispose(); }
}

describe('movement-ready budgets (static world S4f)', () => {
  it('is ready within 1.5 s warm and 3 s cold under a pessimistic network model', async () => {
    const warm = await movementReadyMs(true), cold = await movementReadyMs(false);
    console.info(`[S4f] movement ready (modelled): warm ${warm.ms} ms (${warm.fetched} fetches), cold ${cold.ms} ms (${cold.fetched} fetches); `
      + `whole window resident: warm ${warm.wholeWindowMs} ms, cold ${cold.wholeWindowMs} ms`);
    expect(warm.fetched).toBe(0);
    expect(warm.ms).toBeLessThanOrEqual(1_500);
    expect(cold.ms).toBeLessThanOrEqual(3_000);
  });
});
