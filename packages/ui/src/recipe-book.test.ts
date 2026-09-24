import { describe, expect, it } from 'vitest';
import { bootstrapContentRows, bootstrapContentRegistry, buildContentRegistry, CRAFTING_SLOT_OFFSET } from '@orchard/sim';
import { craftingRecipeBookEntries, craftingRecipePattern, craftingRecipeStacks, ghostFillRecipeMoves } from './recipe-book.js';

describe('crafting recipe list', () => {
  it('fills large furniture recipes from split stacks and preserves partial grid contents', () => {
    const registry = bootstrapContentRegistry(), id = 'furniture_rustic_bed';
    // Shaped: one item per cell, fiber row over plank row.
    const fiber = { itemKind: 'fiber', quantity: 1 }, plank = { itemKind: 'plank', quantity: 1 };
    expect(craftingRecipeStacks(id, [id], registry)).toEqual([fiber, fiber, fiber, plank, plank, plank, null, null, null]);
    const inventory = [{ slot: 0, itemKind: 'plank', quantity: 1 }, { slot: 1, itemKind: 'plank', quantity: 5 },
      { slot: 2, itemKind: 'fiber', quantity: 3 }, { slot: CRAFTING_SLOT_OFFSET + 3, itemKind: 'plank', quantity: 1 }];
    const before = JSON.stringify(inventory);
    expect(ghostFillRecipeMoves(id, inventory, false, [id], registry)).toEqual([
      { fromContainer: 'hotbar', fromIndex: 2, toContainer: 'crafting', toIndex: 0, quantity: 1 },
      { fromContainer: 'hotbar', fromIndex: 2, toContainer: 'crafting', toIndex: 1, quantity: 1 },
      { fromContainer: 'hotbar', fromIndex: 2, toContainer: 'crafting', toIndex: 2, quantity: 1 },
      { fromContainer: 'hotbar', fromIndex: 0, toContainer: 'crafting', toIndex: 4, quantity: 1 },
      { fromContainer: 'hotbar', fromIndex: 1, toContainer: 'crafting', toIndex: 5, quantity: 1 },
    ]);
    expect(JSON.stringify(inventory)).toBe(before);
    expect(ghostFillRecipeMoves(id, [...inventory, { slot: CRAFTING_SLOT_OFFSET + 7, itemKind: 'stone', quantity: 1 }], false, [id], registry)).toBeNull();
  });
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
    expect(entry({ greenhouse_charter: 1 })).toMatchObject({ skillAvailable: false });
    expect(entry({ farmcraft: 1, barreling: 1, greenhouse_charter: 1 })).toMatchObject({ skillAvailable: true });
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

  it('does not list or ghost-fill a retired recipe retained in the compiled projection', () => {
    const rows = bootstrapContentRows().map((row) => row.id !== 'recipe:planks' ? row : {
      ...row, json: JSON.stringify({ ...JSON.parse(String(row.json)), retired: true }),
    });
    const retired = buildContentRegistry(rows).registry;
    expect(retired.compiled.recipes.planks).toBeDefined();
    expect(craftingRecipeStacks('planks', ['planks'], retired)).toBeNull();
    expect(craftingRecipeBookEntries([], [{ slot: 0, itemKind: 'wood', quantity: 99 }],
      ['planks'], retired)).toEqual([]);
    expect(ghostFillRecipeMoves('planks', [{ slot: 0, itemKind: 'wood', quantity: 99 }],
      false, ['planks'], retired)).toBeNull();
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
    expect(ghostFillRecipeMoves('workbench', [...rows, { slot: CRAFTING_SLOT_OFFSET, itemKind: 'stone', quantity: 1 }], false, ['workbench'])).toBeNull();
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
