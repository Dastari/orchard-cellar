import { describe, expect, it } from 'vitest';
import {
  COOKING_FIRE_INPUT_SLOT,
  COOKING_FIRE_OUTPUT_SLOT,
  cookingFireProgress,
  cookingFireRemainingTicks,
} from './cooking-fire.js';

describe('slot-based cooking fire', () => {
  it('derives progress and countdown without processor-specific settlement', () => {
    const duration = 45n * 20n;
    expect(cookingFireProgress(100n, 'raw_chicken', 100n + duration / 2n))
      .toBeCloseTo(0.5);
    expect(cookingFireRemainingTicks(100n, 'raw_chicken', 100n + duration / 2n)).toBe(duration / 2n);
    expect(cookingFireRemainingTicks(undefined, 'raw_chicken', 100n)).toBeNull();
  });

  it('retains the stable slot topology used by authored frame bindings', () => {
    expect(COOKING_FIRE_INPUT_SLOT).toBe(0);
    expect(COOKING_FIRE_OUTPUT_SLOT).toBe(1);
  });
});
