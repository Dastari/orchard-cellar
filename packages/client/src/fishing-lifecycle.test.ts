import { describe, expect, it } from 'vitest';
import {
  fishingCastLifecycleRequest,
  fishingReelLifecycleRequest,
  FishingReelGate,
} from './fishing-lifecycle.js';

describe('fishing lifecycle client requests', () => {
  it('does not repeat a pending or accepted reel while its cast snapshot is stale', async () => {
    const gate = new FishingReelGate();
    let calls = 0;
    let complete: (() => void) | undefined;
    const send = () => {
      calls += 1;
      return new Promise<void>((resolve) => { complete = resolve; });
    };
    const pending = gate.request('actor:7:100', 0, send);
    await Promise.resolve();
    expect(calls).toBe(1);
    expect(gate.request('actor:7:100', 2_000, send)).toBeNull();
    complete?.();
    await pending;
    expect(gate.request('actor:7:100', 10_000, send)).toBeNull();
    expect(calls).toBe(1);
    await gate.request('actor:7:200', 10_100, async () => { calls += 1; });
    expect(calls).toBe(2);
  });

  it('reports real rejection and allows a bounded retry', async () => {
    const gate = new FishingReelGate();
    const rejection = new Error('fishing_too_soon');
    await expect(gate.request('actor:7:100', 0, async () => { throw rejection; })).rejects.toBe(rejection);
    expect(gate.request('actor:7:100', 1_499, async () => undefined)).toBeNull();
    await gate.request('actor:7:100', 1_500, async () => undefined);
    expect(gate.request('actor:7:100', 3_000, async () => undefined)).toBeNull();
    await gate.request('other-actor:7:100', 3_000, async () => undefined);
    expect(gate.request('other-actor:7:100', 5_000, async () => undefined)).toBeNull();
  });

  it('does not let a late result reopen the newer cast request', async () => {
    const gate = new FishingReelGate();
    let rejectOld: ((reason: Error) => void) | undefined;
    const oldRequest = gate.request('actor:7:100', 0, () => new Promise<void>((_resolve, reject) => {
      rejectOld = reject;
    }));
    await Promise.resolve();
    await gate.request('actor:7:200', 5_000, async () => undefined);
    const failed = expect(oldRequest).rejects.toThrow('not_connected');
    rejectOld?.(new Error('not_connected'));
    await failed;
    expect(gate.request('actor:7:200', 10_000, async () => undefined)).toBeNull();
  });

  it('preserves pool identity and tile for casts, including open-water whiffs', () => {
    expect(fishingCastLifecycleRequest(42n, { tileX: -3, tileY: 9 })).toEqual({
      verb: 'use_at',
      options: { actionId: 'cast', entityId: 42n, tileX: -3, tileY: 9 },
    });
    expect(fishingCastLifecycleRequest(0n, { tileX: 2, tileY: 4 }).options.entityId).toBe(0n);
  });

  it('replays the observed private cast tuple while authority owns reel timing', () => {
    expect(fishingReelLifecycleRequest({
      poolId: 7n, targetTileX: 11, targetTileY: 12,
    })).toEqual({
      verb: 'use_at',
      options: { actionId: 'reel', entityId: 7n, tileX: 11, tileY: 12 },
    });
  });
});
