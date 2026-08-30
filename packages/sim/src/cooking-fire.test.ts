import { describe, expect, it } from 'vitest';
import {
  COOKING_FIRE_INPUT_SLOT,
  COOKING_FIRE_OUTPUT_SLOT,
  cookingFireMutationIsValid,
  cookingFireProgress,
  cookingFireRemainingTicks,
  settleCookingFire,
} from './cooking-fire.js';

describe('slot-based cooking fire', () => {
  it('starts lazily and converts queued raw food one item at a time', () => {
    const started = settleCookingFire({
      slots: [{ itemKind: 'raw_chicken', quantity: 3 }, null],
      cookStartTick: undefined,
      lit: true,
    }, 100n);
    expect(started.cookStartTick).toBe(100n);
    const duration = 45n * 20n;
    const settled = settleCookingFire({ ...started, lit: true }, 100n + duration * 2n + duration / 2n);
    expect(settled.completed).toBe(2);
    expect(settled.completedInputKind).toBe('raw_chicken');
    expect(settled.slots).toEqual([
      { itemKind: 'raw_chicken', quantity: 1 },
      { itemKind: 'cooked_chicken', quantity: 2 },
    ]);
    expect(cookingFireProgress(settled.cookStartTick, 'raw_chicken', 100n + duration * 2n + duration / 2n))
      .toBeCloseTo(0.5);
    expect(cookingFireRemainingTicks(100n, 'raw_chicken', 100n + duration / 2n)).toBe(duration / 2n);
    expect(cookingFireRemainingTicks(undefined, 'raw_chicken', 100n)).toBeNull();
  });

  it('pauses while unlit or output-blocked and protects the output slot', () => {
    expect(settleCookingFire({
      slots: [{ itemKind: 'raw_pork', quantity: 1 }, null], cookStartTick: 0n, lit: false,
    }, 2_000n).cookStartTick).toBeUndefined();
    expect(cookingFireMutationIsValid([null, null], [null, { itemKind: 'cooked_beef', quantity: 1 }]))
      .toBe(false);
    expect(cookingFireMutationIsValid(
      [null, { itemKind: 'cooked_beef', quantity: 2 }],
      [null, { itemKind: 'cooked_beef', quantity: 1 }],
    )).toBe(true);
    expect(COOKING_FIRE_INPUT_SLOT).toBe(0);
    expect(COOKING_FIRE_OUTPUT_SLOT).toBe(1);
  });
});
