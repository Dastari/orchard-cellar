import { describe, expect, it } from 'vitest';
import { craftingRecipeBookEntries, ghostFillRecipeMoves } from './recipe-book.js';

describe('crafting recipe list', () => {
  it('filters station recipes, greys missing inputs, and unlocks them beside a workbench', () => {
    const inventory = [{ slot: 0, itemKind: 'plank', quantity: 8 }];
    const hand = craftingRecipeBookEntries([], inventory);
    expect(hand.some((entry) => entry.recipeId === 'chest')).toBe(false);
    expect(hand.find((entry) => entry.recipeId === 'workbench')?.missingIngredients).toBe(false);
    const workbench = craftingRecipeBookEntries(['workbench'], inventory);
    expect(workbench.find((entry) => entry.recipeId === 'chest')?.missingIngredients).toBe(false);
    expect(workbench.find((entry) => entry.recipeId === 'standing_torch')?.missingIngredients).toBe(true);
  });

  it('click-to-ghost-fill plans the shifted recipe without overwriting occupied cells', () => {
    const rows = [{ slot: 0, itemKind: 'plank', quantity: 4 }];
    expect(ghostFillRecipeMoves('workbench', rows, false)).toEqual([
      { fromContainer: 'hotbar', fromIndex: 0, toContainer: 'crafting', toIndex: 0, quantity: 1 },
      { fromContainer: 'hotbar', fromIndex: 0, toContainer: 'crafting', toIndex: 1, quantity: 1 },
      { fromContainer: 'hotbar', fromIndex: 0, toContainer: 'crafting', toIndex: 3, quantity: 1 },
      { fromContainer: 'hotbar', fromIndex: 0, toContainer: 'crafting', toIndex: 4, quantity: 1 },
    ]);
    expect(ghostFillRecipeMoves('workbench', [...rows, { slot: 39, itemKind: 'stone', quantity: 1 }], false)).toBeNull();
  });

  it('treats global slot 9 as hotbar key 0 and starts the backpack at slot 10', () => {
    expect(ghostFillRecipeMoves('workbench', [{ slot: 9, itemKind: 'plank', quantity: 4 }], false))
      .toEqual([0, 1, 3, 4].map((toIndex) => ({
        fromContainer: 'hotbar', fromIndex: 9, toContainer: 'crafting', toIndex, quantity: 1,
      })));
    expect(ghostFillRecipeMoves('workbench', [{ slot: 10, itemKind: 'plank', quantity: 4 }], false))
      .toEqual([0, 1, 3, 4].map((toIndex) => ({
        fromContainer: 'backpack', fromIndex: 0, toContainer: 'crafting', toIndex, quantity: 1,
      })));
  });
});
