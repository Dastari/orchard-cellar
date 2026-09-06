import { describe, expect, it } from 'vitest';
import { bootstrapContentRows, buildContentRegistry } from '@orchard/sim';
import { craftingRecipeBookEntries, craftingRecipePattern, ghostFillRecipeMoves } from './recipe-book.js';

describe('crafting recipe list', () => {
  it('projects authored skill requirements independently of recipe identity and station access', () => {
    const rows = bootstrapContentRows().map((row) => row.id !== 'recipe:planks' ? row : {
      ...row, json: JSON.stringify({ ...JSON.parse(String(row.json)),
        skillRequirement: { skillNode: 'greenhouse_charter', minimumRank: 1 } }),
    });
    const built = buildContentRegistry(rows);
    expect(built.report.valid).toBe(true);
    const inventory = [{ slot: 0, itemKind: 'wood', quantity: 10 }];
    const entry = (ranks: Readonly<Record<string, number>>) =>
      craftingRecipeBookEntries([], inventory, ['planks'], built.registry, ranks)[0];
    expect(entry({})).toMatchObject({ recipeId: 'planks', stationAvailable: true, skillAvailable: false });
    expect(entry({ unrelated: 5 })).toMatchObject({ skillAvailable: false });
    expect(entry({ greenhouse_charter: 1 })).toMatchObject({ skillAvailable: true });
  });

  it('reads patterns and outputs from the active live registry', () => {
    const rows = bootstrapContentRows().map((row) => {
      if (row.id !== 'recipe:planks') return row;
      const recipe = JSON.parse(String(row.json)) as Record<string, unknown>;
      return { ...row, json: JSON.stringify({
        ...recipe,
        output: { item: 'item:plank', count: 7 },
        inputs: [{ item: 'item:stone', count: 1 }],
      }) };
    });
    const registry = buildContentRegistry(rows).registry;
    expect(craftingRecipePattern('planks', ['planks'], registry)).toEqual([
      'stone', null, null, null, null, null, null, null, null,
    ]);
    expect(craftingRecipeBookEntries([], [{ slot: 0, itemKind: 'stone', quantity: 1 }], ['planks'], registry))
      .toContainEqual(expect.objectContaining({ recipeId: 'planks', outputQuantity: 7, missingIngredients: false }));
  });

  it('keeps station recipes visible, marks their requirement, and unlocks them beside a workbench', () => {
    const inventory = [{ slot: 0, itemKind: 'plank', quantity: 8 }];
    const known = ['workbench', 'chest', 'standing_torch'];
    const hand = craftingRecipeBookEntries([], inventory, known);
    expect(hand.find((entry) => entry.recipeId === 'chest')).toMatchObject({
      requiredStation: 'workbench',
      stationAvailable: false,
      missingIngredients: false,
    });
    expect(hand.find((entry) => entry.recipeId === 'workbench')?.missingIngredients).toBe(false);
    expect(hand.find((entry) => entry.recipeId === 'workbench')).toMatchObject({
      requiredStation: null,
      stationAvailable: true,
    });
    const workbench = craftingRecipeBookEntries(['workbench'], inventory, known);
    expect(workbench.find((entry) => entry.recipeId === 'chest')).toMatchObject({
      stationAvailable: true,
      missingIngredients: false,
    });
    expect(workbench.find((entry) => entry.recipeId === 'standing_torch')?.missingIngredients).toBe(true);
  });

  it('click-to-ghost-fill plans the shifted recipe without overwriting occupied cells', () => {
    const rows = [{ slot: 0, itemKind: 'plank', quantity: 4 }];
    expect(ghostFillRecipeMoves('workbench', rows, false, ['workbench'])).toEqual([
      { fromContainer: 'hotbar', fromIndex: 0, toContainer: 'crafting', toIndex: 0, quantity: 1 },
      { fromContainer: 'hotbar', fromIndex: 0, toContainer: 'crafting', toIndex: 1, quantity: 1 },
      { fromContainer: 'hotbar', fromIndex: 0, toContainer: 'crafting', toIndex: 3, quantity: 1 },
      { fromContainer: 'hotbar', fromIndex: 0, toContainer: 'crafting', toIndex: 4, quantity: 1 },
    ]);
    expect(ghostFillRecipeMoves('workbench', [...rows, { slot: 39, itemKind: 'stone', quantity: 1 }], false, ['workbench'])).toBeNull();
    expect(ghostFillRecipeMoves('workbench', rows, false, [])).toBeNull();
  });

  it('keeps the complete known pattern available when ingredients are missing', () => {
    expect(craftingRecipePattern('workbench', ['workbench'])).toEqual([
      'plank', 'plank', null,
      'plank', 'plank', null,
      null, null, null,
    ]);
    expect(craftingRecipePattern('workbench', [])).toBeNull();
    expect(ghostFillRecipeMoves(
      'workbench', [{ slot: 0, itemKind: 'plank', quantity: 2 }], false, ['workbench'],
    )).toEqual([
      { fromContainer: 'hotbar', fromIndex: 0, toContainer: 'crafting', toIndex: 0, quantity: 1 },
      { fromContainer: 'hotbar', fromIndex: 0, toContainer: 'crafting', toIndex: 1, quantity: 1 },
    ]);
    expect(ghostFillRecipeMoves('workbench', [], false, ['workbench'])).toEqual([]);
  });

  it('treats global slot 9 as hotbar key 0 and starts the backpack at slot 10', () => {
    expect(ghostFillRecipeMoves('workbench', [{ slot: 9, itemKind: 'plank', quantity: 4 }], false, ['workbench']))
      .toEqual([0, 1, 3, 4].map((toIndex) => ({
        fromContainer: 'hotbar', fromIndex: 9, toContainer: 'crafting', toIndex, quantity: 1,
      })));
    expect(ghostFillRecipeMoves('workbench', [{ slot: 10, itemKind: 'plank', quantity: 4 }], false, ['workbench']))
      .toEqual([0, 1, 3, 4].map((toIndex) => ({
        fromContainer: 'backpack', fromIndex: 0, toContainer: 'crafting', toIndex, quantity: 1,
      })));
  });
});
