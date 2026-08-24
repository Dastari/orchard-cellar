import { createPlaceholderCollisionMap, movePlayer, positionCollides, type PlayerState } from '@orchard/sim';
import { describe, expect, it, vi } from 'vitest';
import {
  AvatarAnimationController,
  LatencyInjector,
  LocalPredictionBuffer,
  PresentationCorrection,
  RemoteSnapshotBuffer,
  RenderTickClock,
  inputRefreshDue,
} from './netcode.js';

const collision = createPlaceholderCollisionMap(20, 20);
const start: PlayerState = { position: { x: 1_000, y: 1_000 }, facing: 'down', moving: false, location: 'estate' };

describe('local prediction replay', () => {
  it('wraps its input ring and resets it on reconnect', () => {
    const history = new LocalPredictionBuffer(3);
    for (let index = 1; index <= 5; index += 1) history.recordSend(BigInt(index), 'right');
    expect(history.commandsForTest().map((entry) => entry.sequence)).toEqual([3n, 4n, 5n]);
    history.reset(5n);
    expect(history.pendingCommandCount).toBe(0);
    expect(history.clientTick).toBe(0n);
  });

  it('rebases and replays only movement after the matched authoritative prefix', () => {
    const history = new LocalPredictionBuffer();
    history.recordSend(1n, 'right');
    let predicted = start;
    const timeline: PlayerState[] = [];
    for (let step = 0; step < 8; step += 1) {
      predicted = movePlayer(predicted, 'right', collision);
      timeline.push(predicted);
      history.recordStep('right', predicted);
    }
    history.recordSend(2n, 'right');
    const authoritative = timeline[4];
    if (authoritative === undefined) throw new Error('fixture');
    const result = history.reconcile(predicted, authoritative, 1n, collision);
    expect(result.player.position).toEqual(predicted.position);
    expect(result.replayDepth).toBe(3);
    expect(result.errorFixed).toBe(0);
  });

  it('does not treat a same-direction liveness refresh as an applied movement boundary', () => {
    const history = new LocalPredictionBuffer();
    history.recordSend(1n, 'right', true);
    let predicted = start;
    const timeline: PlayerState[] = [];
    for (let step = 0; step < 4; step += 1) {
      predicted = movePlayer(predicted, 'right', collision);
      timeline.push(predicted);
      history.recordStep('right', predicted);
    }
    history.recordSend(2n, 'right', false);
    for (let step = 0; step < 4; step += 1) {
      predicted = movePlayer(predicted, 'right', collision);
      timeline.push(predicted);
      history.recordStep('right', predicted);
    }
    const authority = timeline[1];
    if (authority === undefined) throw new Error('fixture');
    const result = history.reconcile(predicted, authority, 2n, collision);
    expect(result.player.position).toEqual(predicted.position);
    expect(result.errorFixed).toBe(0);
    expect(result.replayDepth).toBe(6);
  });

  it('keeps correction smoothing presentation-only and finishes within 100 ms', () => {
    const correction = new PresentationCorrection();
    correction.begin({ x: 120, y: 100 }, { x: 100, y: 100 });
    expect(correction.apply({ x: 100, y: 100 }).x).toBe(120);
    correction.advance(0.05);
    expect(correction.apply({ x: 100, y: 100 }).x).toBe(110);
    correction.advance(0.05);
    expect(correction.apply({ x: 100, y: 100 }).x).toBe(100);
  });

  it('replays unacknowledged movement against a newly arrived collision map', () => {
    const history = new LocalPredictionBuffer();
    history.recordSend(1n, 'right');
    let predicted = start;
    for (let step = 0; step < 4; step += 1) {
      predicted = movePlayer(predicted, 'right', collision);
      history.recordStep('right', predicted);
    }
    const changedCollision = {
      ...collision,
      obstacles: [{ left: 1_070, right: 1_100, top: 900, bottom: 1_050 }],
    };
    const result = history.reconcile(predicted, start, 1n, changedCollision);
    expect(result.errorFixed).toBeGreaterThan(0);
    expect(positionCollides(result.player.position, changedCollision)).toBe(false);
    expect(result.player.position).toEqual(start.position);
  });

  it('rebases a rate-rejected run fragment before replaying later steps', () => {
    const history = new LocalPredictionBuffer();
    history.recordSend(1n, 'right');
    let predicted = start;
    for (let step = 0; step < 4; step += 1) {
      predicted = movePlayer(predicted, 'right', collision);
      history.recordStep('right', predicted);
    }
    history.recordSend(2n, 'right');
    for (let step = 0; step < 4; step += 1) {
      predicted = movePlayer(predicted, 'right', collision);
      history.recordStep('right', predicted);
    }
    let authority = start;
    for (let step = 0; step < 2; step += 1) authority = movePlayer(authority, 'right', collision);
    const result = history.reconcile(predicted, authority, 2n, collision);
    expect(result.errorFixed).toBe(2 * 16);
    expect(result.player.position.x).toBe(start.position.x + 6 * 16);
  });
});

describe('remote interpolation', () => {
  it('interpolates brackets and clamps extrapolation to two ticks', () => {
    const buffer = new RemoteSnapshotBuffer();
    const base = { facing: 'right', actionKind: 'none', actionStartedTick: 0n, equippedKind: 'axe' };
    buffer.push({ authorityTick: 10n, x: 100, y: 200, ...base });
    buffer.push({ authorityTick: 11n, x: 130, y: 200, ...base });
    expect(buffer.sample(10.5)?.x).toBe(115);
    expect(buffer.sample(20)?.x).toBe(190);
  });

  it('collision-steps the whole extrapolated segment instead of tunnelling', () => {
    const buffer = new RemoteSnapshotBuffer();
    const base = { facing: 'right', actionKind: 'none', actionStartedTick: 0n, equippedKind: 'axe' };
    buffer.push({ authorityTick: 10n, x: 10_000, y: 10_000, ...base });
    buffer.push({ authorityTick: 11n, x: 10_480, y: 10_000, ...base });
    const obstacleCollision = {
      width: 100,
      height: 100,
      blocked: Array.from({ length: 10_000 }, () => false),
      obstacles: [{ left: 10_900, right: 11_000, top: 9_900, bottom: 10_100 }],
    };
    const sampled = buffer.sample(13, obstacleCollision);
    expect(sampled?.x).toBeLessThan(10_900);
    expect(sampled?.x).toBeGreaterThanOrEqual(10_480);
  });

  it('softly advances and resynchronizes render time without jumping', () => {
    const clock = new RenderTickClock();
    expect(clock.advance(0, 100n)).toBe(98.5);
    const next = clock.advance(0.05, 102n);
    expect(next).toBeGreaterThan(99.4);
    expect(next).toBeLessThan(100);
  });

  it('snaps across a background-tab discontinuity so expired actions cannot freeze', () => {
    const clock = new RenderTickClock();
    clock.advance(0, 100n);
    expect(clock.advance(1 / 60, 10_000n)).toBe(9_998.5);
  });
});

describe('avatar animation and latency helpers', () => {
  it('refreshes held input and unacknowledged stops, but not confirmed idle', () => {
    expect(inputRefreshDue('right', false, 20)).toBe(true);
    expect(inputRefreshDue('idle', true, 20)).toBe(true);
    expect(inputRefreshDue('idle', false, 20)).toBe(false);
    expect(inputRefreshDue('right', false, 19)).toBe(false);
  });

  it('retriggers a one-shot and degrades unknown kinds to fallback', () => {
    const controller = new AvatarAnimationController();
    expect(controller.update(0, 0, 'swing_axe', 10n, 10, 4, 8, 4, 10).frame).toBe(0);
    expect(controller.update(0, 0, 'swing_axe', 11n, 11, 4, 8, 4, 10).frame).toBe(0);
    expect(controller.update(0, 0, 'future_spell', 11n, 12, 4, 8, 4, 10)).toMatchObject({ fallback: true, kind: 'fallback_use' });
    expect(controller.update(0, 0, 'swing_axe', 20n, 20, 4, 8, 4, 10, false)).toMatchObject({ fallback: true, kind: 'fallback_use' });
  });

  it('resets locomotion phase when movement starts again', () => {
    const controller = new AvatarAnimationController();
    controller.update(0, 0, 'none', 0n, 0, 4, 8, 4, 10);
    controller.update(1_000, 0, 'none', 0n, 1, 4, 8, 4, 10);
    controller.update(1_000, 0, 'none', 0n, 2, 4, 8, 4, 10);
    const restarted = controller.update(1_016, 0, 'none', 0n, 3, 4, 8, 4, 10);
    expect(restarted).toMatchObject({ channel: 'locomotion', kind: 'walk', frame: 0 });
  });

  it('uses deterministic bounded jitter', () => {
    expect(new LatencyInjector(150, 50, () => 0).delayMs()).toBe(100);
    expect(new LatencyInjector(150, 50, () => 1).delayMs()).toBe(200);
  });

  it('applies every table callback from one transaction in one delayed group', async () => {
    vi.useFakeTimers();
    try {
      let randomCalls = 0;
      const injector = new LatencyInjector(150, 50, () => { randomCalls += 1; return 0; });
      const applied: string[] = [];
      injector.incomingGrouped('transaction:7', () => applied.push('position'));
      injector.incomingGrouped('transaction:7', () => applied.push('resource'));
      await vi.advanceTimersByTimeAsync(99);
      expect(applied).toEqual([]);
      await vi.advanceTimersByTimeAsync(1);
      expect(applied).toEqual(['position', 'resource']);
      expect(randomCalls).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
