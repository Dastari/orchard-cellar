import { describe, expect, it } from 'vitest';
import { TOPSIDE_SPACE_ID } from '@orchard/sim';
import type { WorldChunkManifest } from '@orchard/sim/world-chunk';
import { chunkSpawnReadiness, SPAWN_READINESS_TIMEOUT_MS, SpawnReadinessGate, type SpawnReadinessInput, type SpawnReadinessStore } from './spawn-readiness.js';

/** A 13 x 13 chunk topside manifest; `resident` and `pinned` are chunk keys. */
function store(resident: Iterable<string>, pinned: Iterable<string>): SpawnReadinessStore {
  const chunks = Array.from({ length: 169 }, (_, index) => ({ cx: index % 13, cy: Math.floor(index / 13), contentHash: `h${index}`, byteLength: 1 }));
  const present = new Set(resident);
  return { manifest: { chunks } as unknown as WorldChunkManifest, pinnedKeys: [...pinned],
    peekChunk: (cx, cy) => present.has(`${cx}:${cy}`) ? {} : undefined };
}
const window = (cx: number, cy: number) => Array.from({ length: 25 }, (_, index) => `${cx - 2 + index % 5}:${cy - 2 + Math.floor(index / 5)}`);
const ring = (cx: number, cy: number) => Array.from({ length: 9 }, (_, index) => `${cx - 1 + index % 3}:${cy - 1 + Math.floor(index / 3)}`);
const on = (overrides: Partial<SpawnReadinessInput> = {}): SpawnReadinessInput =>
  ({ mode: 'on', state: 'on', store: store(ring(6, 6), window(6, 6)), spaceId: TOPSIDE_SPACE_ID, tileX: 6 * 64 + 10, tileY: 6 * 64 + 10, ...overrides });

describe('spawn readiness (static world S4f)', () => {
  it('never waits in modes off and shadow, in other spaces or without a position', () => {
    for (const mode of ['off', 'shadow', undefined] as const) {
      expect(chunkSpawnReadiness(on({ mode, store: undefined, state: 'loading' }))).toEqual({ ready: true, reason: 'not_on', missing: 0 });
    }
    expect(chunkSpawnReadiness(on({ spaceId: 5, store: undefined }))).toMatchObject({ ready: true, reason: 'other_space' });
    expect(chunkSpawnReadiness(on({ tileX: undefined }))).toMatchObject({ ready: true, reason: 'no_position' });
  });

  it('waits in `on` for a serving store while one is loading, but never when the legacy source serves', () => {
    for (const state of ['idle', 'loading', 'awaiting_heads']) {
      expect(chunkSpawnReadiness(on({ store: undefined, state }))).toMatchObject({ ready: false, reason: 'awaiting_store' });
    }
    for (const state of ['awaiting_publication', 'subscription_error', 'chunk_fetch_404', 'chunk_manifest_space_mismatch']) {
      expect(chunkSpawnReadiness(on({ store: undefined, state }))).toMatchObject({ ready: true, reason: 'legacy' });
    }
  });

  it('waits for the spawn chunk and its ring, not the rest of the window', () => {
    expect(chunkSpawnReadiness(on())).toMatchObject({ ready: true, reason: 'resident' });
    const partial = ring(6, 6).filter(key => key !== '7:7');
    expect(chunkSpawnReadiness(on({ store: store(partial, window(6, 6)) }))).toEqual({ ready: false, reason: 'awaiting_chunks', missing: 1 });
    // The outer window ring may still be loading.
    expect(chunkSpawnReadiness(on({ store: store(ring(6, 6), window(6, 6)) })).ready).toBe(true);
    // At the map corner the ring is clipped to published chunks.
    expect(chunkSpawnReadiness(on({ tileX: 5, tileY: 5, store: store(['0:0', '1:0', '0:1', '1:1'], window(2, 2)) })).ready).toBe(true);
    // A teleport: the pin still covers the old place, so the new ring cannot load yet.
    expect(chunkSpawnReadiness(on({ tileX: 64, tileY: 64 }))).toMatchObject({ ready: false, reason: 'awaiting_pin' });
  });

  it('gives up after the timeout rather than lock a player out, and starts over once ready', () => {
    const gate = new SpawnReadinessGate();
    const waiting = on({ store: undefined, state: 'loading' });
    expect(gate.update(waiting, 1_000).ready).toBe(false);
    expect(gate.update(waiting, 1_000 + SPAWN_READINESS_TIMEOUT_MS - 1).ready).toBe(false);
    expect(gate.update(waiting, 1_000 + SPAWN_READINESS_TIMEOUT_MS)).toMatchObject({ ready: true, reason: 'timeout' });
    expect(gate.status(1_000 + SPAWN_READINESS_TIMEOUT_MS)).toMatchObject({ reason: 'timeout', waits: 1, timeouts: 1, waitedMs: SPAWN_READINESS_TIMEOUT_MS });
    expect(gate.update(on(), 30_000)).toMatchObject({ ready: true, reason: 'resident' });
    expect(gate.update(waiting, 31_000).ready).toBe(false);
    expect(gate.status(31_500)).toMatchObject({ waits: 2, timeouts: 1, waitedMs: 500 });
  });
});
