import { describe, expect, it } from 'vitest';
import { caveFloorAutotilePlan } from './cave-floor-autotile.js';

const plan = (...rock: readonly (readonly [number, number])[]) => caveFloorAutotilePlan(
  (x, y) => rock.some(([rockX, rockY]) => x === rockX && y === rockY),
);

describe('cave floor rocky transition autotile', () => {
  it('maps the dense centre and eight surrounding transition cells', () => {
    expect(plan([0, 0])).toEqual({ transitionFrame: 10, insetFrames: [] });
    expect(plan([0, -1]).transitionFrame).toBe(13);
    expect(plan([1, 0]).transitionFrame).toBe(9);
    expect(plan([0, 1]).transitionFrame).toBe(7);
    expect(plan([-1, 0]).transitionFrame).toBe(11);
    expect(plan([0, -1], [-1, 0]).transitionFrame).toBe(14);
    expect(plan([0, -1], [1, 0]).transitionFrame).toBe(12);
    expect(plan([0, 1], [-1, 0]).transitionFrame).toBe(8);
    expect(plan([0, 1], [1, 0]).transitionFrame).toBe(6);
  });

  it('adds the four diagonal inset overlays without replacing plain floor', () => {
    expect(plan([-1, -1])).toEqual({ transitionFrame: null, insetFrames: [4] });
    expect(plan([1, -1])).toEqual({ transitionFrame: null, insetFrames: [3] });
    expect(plan([-1, 1])).toEqual({ transitionFrame: null, insetFrames: [1] });
    expect(plan([1, 1])).toEqual({ transitionFrame: null, insetFrames: [0] });
  });
});
