import { describe, expect, it } from 'vitest';
import {
  CAMPFIRE_COOKING_RECIPES,
  HUNGER_MAX_CENTI,
  cookingDurationTicks,
  foodHungerRestoreCenti,
  hungerCostForSprintVigour,
  modifiersForHunger,
  restoreHunger,
  spendHunger,
  wildlifeFoodDrops,
  wildlifeIsHuntable,
} from './food.js';
import { AUTHORITY_HZ } from './net-timing.js';
import { resolveStats } from './stats.js';

describe('repeatable food and hunger loop', () => {
  it('charges hunger only for explicit exertion', () => {
    const idle = { hungerCenti: HUNGER_MAX_CENTI, hungerUpdatedTick: 10n };
    expect(idle).toEqual({ hungerCenti: HUNGER_MAX_CENTI, hungerUpdatedTick: 10n });
    expect(hungerCostForSprintVigour(0)).toBe(0);
    expect(hungerCostForSprintVigour(1_000)).toBe(20);
    expect(hungerCostForSprintVigour(1)).toBe(1);
  });

  it('clamps exertion and food restoration', () => {
    expect(spendHunger({ hungerCenti: 10, hungerUpdatedTick: 0n }, 20).hungerCenti).toBe(0);
    expect(restoreHunger({ hungerCenti: 9_900, hungerUpdatedTick: 0n }, 500).hungerCenti).toBe(HUNGER_MAX_CENTI);
    expect(foodHungerRestoreCenti('cooked_beef')).toBe(4_000);
    expect(foodHungerRestoreCenti('raw_beef')).toBeNull();
  });

  it('keeps a slow Vigour recovery floor at empty hunger', () => {
    expect(resolveStats(undefined, modifiersForHunger(HUNGER_MAX_CENTI)).vigourRegenCentiPerSecond)
      .toBe(1_200);
    expect(resolveStats(undefined, modifiersForHunger(2_500)).vigourRegenCentiPerSecond)
      .toBe(600);
    expect(resolveStats(undefined, modifiersForHunger(0)).vigourRegenCentiPerSecond)
      .toBe(120);
    expect(resolveStats(undefined, [
      ...modifiersForHunger(0),
      { id: 'test.winded', target: 'vigourRegen', layer: 'pctAdd', value: -5_000, source: 'effect' },
    ]).vigourRegenCentiPerSecond).toBe(60);
  });

  it('queues bounded cooking time per item', () => {
    expect(cookingDurationTicks(CAMPFIRE_COOKING_RECIPES.roast_chicken, 3))
      .toBe(BigInt(45 * 3 * AUTHORITY_HZ));
    expect(cookingDurationTicks(CAMPFIRE_COOKING_RECIPES.roast_chicken, 99))
      .toBe(BigInt(45 * 8 * AUTHORITY_HZ));
  });

  it('protects decorative wildlife while assigning food drops to farm animals', () => {
    expect(wildlifeIsHuntable('pig')).toBe(true);
    expect(wildlifeIsHuntable('horse')).toBe(false);
    expect(wildlifeIsHuntable('swan')).toBe(false);
    expect(wildlifeFoodDrops('pig')).toEqual([{ itemKind: 'raw_pork', quantity: 3 }]);
    expect(wildlifeFoodDrops('butterfly')).toEqual([]);
  });
});
