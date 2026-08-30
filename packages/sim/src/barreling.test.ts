import { describe, expect, it } from 'vitest';
import {
  BARREL_CURE_TICKS,
  BARREL_MAX_BATCH,
  barrelBatch,
  barrelCanSeal,
  barrelMutationIsValid,
  barrelProgress,
  settleBarrel,
} from './barreling.js';

describe('crop barreling', () => {
  const batch = [{ itemKind: 'tomato', quantity: 12 }, null, null, null, null, null, null, null] as const;

  it('accepts an accessible single-crop batch and rejects mixed or oversized contents', () => {
    expect(barrelBatch(batch)).toEqual({ cropKind: 'tomato', quantity: 12 });
    expect(barrelCanSeal(batch)).toBe(true);
    expect(barrelCanSeal([{ itemKind: 'tomato', quantity: 3 }])).toBe(false);
    expect(barrelMutationIsValid([], [{ itemKind: 'tomato', quantity: BARREL_MAX_BATCH }], undefined)).toBe(true);
    expect(barrelMutationIsValid([], [{ itemKind: 'tomato', quantity: 12 }, { itemKind: 'carrot', quantity: 1 }], undefined)).toBe(false);
    expect(barrelMutationIsValid([], [{ itemKind: 'tomato', quantity: BARREL_MAX_BATCH + 1 }], undefined)).toBe(false);
  });

  it('freezes sealed contents and converts a completed batch exactly once', () => {
    expect(barrelMutationIsValid(batch, batch, 5n)).toBe(true);
    expect(barrelMutationIsValid(batch, [{ itemKind: 'tomato', quantity: 11 }], 5n)).toBe(false);
    expect(settleBarrel(batch, 5n, 5n + BARREL_CURE_TICKS - 1n).completedQuantity).toBe(0);
    const settled = settleBarrel(batch, 5n, 5n + BARREL_CURE_TICKS);
    expect(settled.completedCropKind).toBe('tomato');
    expect(settled.completedQuantity).toBe(12);
    expect(settled.sealedAtTick).toBeUndefined();
    expect(settled.slots[0]).toEqual({ itemKind: 'preserved_tomato', quantity: 12 });
  });

  it('derives cure progress without writes', () => {
    expect(barrelProgress(undefined, 100n)).toBe(0);
    expect(barrelProgress(10n, 10n + BARREL_CURE_TICKS / 2n)).toBeCloseTo(0.5);
    expect(barrelProgress(10n, 10n + BARREL_CURE_TICKS * 2n)).toBe(1);
  });
});
