import { describe, expect, it } from 'vitest';
import { AUTHORITY_TICK_MS, FIXED_UNITS_PER_PIXEL, SIM_TICKS_PER_SECOND, bowChargedRangePixels, bowShotForTarget, encodedBowTargetAim } from '@orchard/sim';
import { PresentationCorrection, ProjectileSnapshotBuffer } from './net/netcode.js';
import { FixedStepAccumulator } from './loop.js';
import {
  interpolateFixedPosition,
  rebaseInterpolationPosition,
  presentationMoving,
  sampleLocalProjectilePrediction,
} from './overworld-prediction.js';

describe('overworld client prediction', () => {
  it('keeps walking monotonic through a backward reconciliation without changing movement state', () => {
    const unit = FIXED_UNITS_PER_PIXEL;
    const before = Object.freeze({ x: 100 * unit, y: 50 * unit });
    const authority = Object.freeze({ x: 96 * unit, y: 50 * unit });
    const correction = new PresentationCorrection();
    correction.begin(before, authority);
    let previous = rebaseInterpolationPosition(before, before, authority);
    let predicted = authority;
    const displayed: number[] = [];
    for (let step = 0; step < 6; step += 1) {
      predicted = { x: predicted.x + unit, y: predicted.y };
      correction.advance(1 / SIM_TICKS_PER_SECOND);
      for (const alpha of [0, 0.25, 0.5, 0.75, 1]) {
        displayed.push(correction.apply(interpolateFixedPosition(previous, predicted, alpha), alpha).x / unit);
      }
      previous = predicted;
    }
    expect(displayed.slice(0, 5)).toEqual([100, 100 + 1 / 12, 100 + 1 / 6, 100.25, 100 + 1 / 3]);
    displayed.forEach((value, index) => {
      if (index > 0) expect(value).toBeGreaterThanOrEqual(displayed[index - 1]! - 1e-10);
    });
    expect(displayed.at(-1)).toBeCloseTo(102);
    expect(predicted.x - authority.x).toBe(6 * unit);
    expect(authority).toEqual({ x: 96 * unit, y: 50 * unit });
    expect(before).toEqual({ x: 100 * unit, y: 50 * unit });
  });

  it('retains the unfinished visual correction when a second reconciliation arrives', () => {
    const unit = FIXED_UNITS_PER_PIXEL;
    const correction = new PresentationCorrection();
    correction.begin({ x: 100 * unit, y: 0 }, { x: 96 * unit, y: 0 });
    correction.advance(2 / SIM_TICKS_PER_SECOND);
    const before = { x: 98 * unit, y: 0 };
    const displayedBefore = correction.apply(before);
    const reconciled = { x: 97 * unit, y: 0 };
    correction.begin(before, reconciled);
    const previous = rebaseInterpolationPosition(before, before, reconciled);
    const moved = { x: 98 * unit, y: 0 };
    correction.advance(1 / SIM_TICKS_PER_SECOND);
    expect(correction.apply(interpolateFixedPosition(previous, moved, 0), 0).x)
      .toBeCloseTo(displayedBefore.x);
    expect(correction.apply(interpolateFixedPosition(previous, moved, 1), 1).x)
      .toBeGreaterThan(displayedBefore.x);
    correction.advance(0.1);
    expect(correction.apply(moved)).toEqual(moved);
  });

  it('keeps the same displayed trajectory when one frame performs multiple fixed updates', () => {
    const unit = FIXED_UNITS_PER_PIXEL;
    const correction = new PresentationCorrection();
    const accumulator = new FixedStepAccumulator(1 / SIM_TICKS_PER_SECOND);
    correction.begin({ x: 100 * unit, y: 0 }, { x: 96 * unit, y: 0 });
    let previous = { x: 96 * unit, y: 0 };
    let predicted = previous;
    const update = () => {
      previous = predicted;
      predicted = { x: predicted.x + unit, y: 0 };
      correction.advance(1 / SIM_TICKS_PER_SECOND);
    };
    const firstAlpha = accumulator.advance(3.5 / SIM_TICKS_PER_SECOND, update);
    expect(accumulator.lastUpdateSteps).toBe(3);
    expect(correction.apply(interpolateFixedPosition(previous, predicted, firstAlpha), firstAlpha).x / unit)
      .toBeCloseTo(100 + 2.5 / 3);
    const secondAlpha = accumulator.advance(1 / SIM_TICKS_PER_SECOND, update);
    expect(accumulator.lastUpdateSteps).toBe(1);
    expect(correction.apply(interpolateFixedPosition(previous, predicted, secondAlpha), secondAlpha).x / unit)
      .toBeCloseTo(100 + 3.5 / 3);
    expect(predicted.x / unit).toBe(100);
  });

  it('clears both interpolation offsets on a hard snap without replaying the old position', () => {
    const correction = new PresentationCorrection();
    const before = { x: 100, y: 200 };
    const after = { x: 1_000, y: 2_000 };
    correction.begin({ x: 120, y: 200 }, before);
    correction.advance(0.02);
    const previous = rebaseInterpolationPosition(before, before, after);
    correction.clear();
    correction.advance(1 / SIM_TICKS_PER_SECOND);
    expect(correction.apply(interpolateFixedPosition(previous, after, 0), 0)).toEqual(after);
    expect(correction.apply(after, 1)).toEqual(after);
  });

  it('interpolates fixed-point diagonal movement at render time', () => {
    expect(interpolateFixedPosition({ x: 100, y: 200 }, { x: 111, y: 211 }, 0.5))
      .toEqual({ x: 105.5, y: 205.5 });
    expect(interpolateFixedPosition({ x: 100, y: 200 }, { x: 111, y: 211 }, 2))
      .toEqual({ x: 111, y: 211 });
  });

  it('keeps local locomotion stable when render interpolation resets to zero', () => {
    expect(presentationMoving(true, true, 0, 0, false)).toBe(true);
    expect(presentationMoving(true, false, 40, 0, false)).toBe(false);
    expect(presentationMoving(false, undefined, 40, 0, false)).toBe(true);
    expect(presentationMoving(false, undefined, 0, 0, true)).toBe(true);
  });

  it('presents a local projectile immediately and expires it on its shared tick lifetime', () => {
    const prediction = {
      origin: { x: 1_000, y: 2_000 },
      velocity: { x: 40, y: -10 },
      lifetimeTicks: 8,
      startedAtMs: 100,
    };
    expect(sampleLocalProjectilePrediction(prediction, 100)).toEqual({ x: 1_000, y: 2_000 });
    expect(sampleLocalProjectilePrediction(prediction, 200)).toEqual({ x: 1_080, y: 1_980 });
    expect(sampleLocalProjectilePrediction(prediction, 501)).toBeNull();
  });

  it.each([120, 500, 1_000])('keeps predicted and authoritative arrow speeds equal for a %sms draw', (chargeMs) => {
    const range = bowChargedRangePixels(chargeMs);
    const aim = encodedBowTargetAim(240, -120, range)!;
    const shot = bowShotForTarget(aim.x, aim.y, range)!;
    const origin = { x: 1_000, y: 2_000 };
    const prediction = {
      origin, velocity: { x: shot.velocityX, y: shot.velocityY },
      lifetimeTicks: shot.lifetimeTicks, startedAtMs: 100,
    };
    const buffer = new ProjectileSnapshotBuffer();
    let authoritative = origin;
    for (let tick = 0; tick <= shot.lifetimeTicks; tick += 1) {
      // The server advances each stored velocity exactly once per authority
      // tick. Confirmed rendering and local prediction must use those units.
      if (tick > 0) authoritative = {
        x: authoritative.x + shot.velocityX, y: authoritative.y + shot.velocityY,
      };
      buffer.push({
        authorityTick: 100n + BigInt(tick), spawnedTick: 100n, ...authoritative,
        velocityX: shot.velocityX, velocityY: shot.velocityY, state: 'flying',
      });
      const predicted = sampleLocalProjectilePrediction(prediction, 100 + tick * AUTHORITY_TICK_MS);
      expect(predicted).toEqual(authoritative);
      expect(buffer.sample(100 + tick)).toMatchObject(authoritative);
    }
    expect(sampleLocalProjectilePrediction(prediction, 100 + shot.lifetimeTicks * AUTHORITY_TICK_MS + 1)).toBeNull();
  });
});
