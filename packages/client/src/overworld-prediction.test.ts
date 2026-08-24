import { TILE_SIZE_FIXED, type PlayerState } from '@orchard/sim';
import { describe, expect, it } from 'vitest';
import { interpolateFixedPosition, reconcilePredictedPlayer } from './overworld-prediction.js';

const player = (x: number, y: number): PlayerState => ({
  position: { x, y },
  facing: 'down',
  moving: true,
  location: 'estate',
});

describe('overworld client prediction', () => {
  it('does not chase a stale authority row during diagonal travel', () => {
    const predicted = player(1_000, 1_000);
    const authoritative = player(950, 950);
    expect(reconcilePredictedPlayer(predicted, authoritative, 'upLeft', true)).toBe(predicted);
  });

  it('settles small acknowledged differences only while idle', () => {
    const predicted = player(1_000, 1_000);
    const authoritative = player(970, 1_015);
    expect(reconcilePredictedPlayer(predicted, authoritative, null, false)).toBe(predicted);
    expect(reconcilePredictedPlayer(predicted, authoritative, null, true).position).toEqual({ x: 990, y: 1_005 });
  });

  it('snaps genuine teleports regardless of movement input', () => {
    const authoritative = player(4 * TILE_SIZE_FIXED, 4 * TILE_SIZE_FIXED);
    expect(reconcilePredictedPlayer(player(0, 0), authoritative, 'downRight', false)).toBe(authoritative);
  });

  it('interpolates fixed-point diagonal movement at render time', () => {
    expect(interpolateFixedPosition({ x: 100, y: 200 }, { x: 111, y: 211 }, 0.5))
      .toEqual({ x: 105.5, y: 205.5 });
    expect(interpolateFixedPosition({ x: 100, y: 200 }, { x: 111, y: 211 }, 2))
      .toEqual({ x: 111, y: 211 });
  });
});
