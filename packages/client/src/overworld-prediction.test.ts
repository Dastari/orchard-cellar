import { describe, expect, it } from 'vitest';
import {
  interpolateFixedPosition,
  presentationMoving,
  sampleLocalProjectilePrediction,
} from './overworld-prediction.js';

describe('overworld client prediction', () => {
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
});
