import { describe, expect, it } from 'vitest';
import { interpolateFixedPosition } from './overworld-prediction.js';

describe('overworld client prediction', () => {
  it('interpolates fixed-point diagonal movement at render time', () => {
    expect(interpolateFixedPosition({ x: 100, y: 200 }, { x: 111, y: 211 }, 0.5))
      .toEqual({ x: 105.5, y: 205.5 });
    expect(interpolateFixedPosition({ x: 100, y: 200 }, { x: 111, y: 211 }, 2))
      .toEqual({ x: 111, y: 211 });
  });
});
