import { describe, expect, it } from 'vitest';
import { BASE_BACKPACK_CAPACITY, bootstrapContentRows, bootstrapContentRegistry, buildContentRegistry } from '@orchard/sim';
import { craftingRecipeBookEntries, craftingRecipePattern, craftingRecipeStacks, ghostFillRecipeMoves, type RecipeBookInventoryRow } from './recipe-book.js';

describe('crafting recipe list', () => {
  it('fills large furniture recipes from split stacks and preserves partial grid contents', () => {
    const registry = bootstrapContentRegistry(), id = 'furniture_rustic_bed';
    // Shaped: one item per cell, fiber row over plank row.
    const fiber = { itemKind: 'fiber', quantity: 1 }, plank = { itemKind: 'plank', quantity: 1 };
    expect(craftingRecipeStacks(id, [id], registry)).toEqual([fiber, fiber, fiber, plank, plank, plank, null, null, null]);
    const inventory = [{ container: 'hotbar' as const, index: 0, itemKind: 'plank', quantity: 1 }, { container: 'hotbar' as const, index: 1, itemKind: 'plank', quantity: 5 },
      { container: 'hotbar' as const, index: 2, itemKind: 'fiber', quantity: 3 }, { container: 'crafting' as const, index: 3, itemKind: 'plank', quantity: 1 }];
    const before = JSON.stringify(inventory);
    expect(ghostFillRecipeMoves(id, inventory, BASE_BACKPACK_CAPACITY, [id], registry)).toEqual([
      { fromContainer: 'hotbar', fromIndex: 2, toContainer: 'crafting', toIndex: 0, quantity: 1 },
      { fromContainer: 'hotbar', fromIndex: 2, toContainer: 'crafting', toIndex: 1, quantity: 1 },
      { fromContainer: 'hotbar', fromIndex: 2, toContainer: 'crafting', toIndex: 2, quantity: 1 },
      { fromContainer: 'hotbar', fromIndex: 0, toContainer: 'crafting', toIndex: 4, quantity: 1 },
      { fromContainer: 'hotbar', fromIndex: 1, toContainer: 'crafting', toIndex: 5, quantity: 1 },
    ]);
    expect(JSON.stringify(inventory)).toBe(before);
    expect(ghostFillRecipeMoves(id, [...inventory, { container: 'crafting' as const, index: 7, itemKind: 'stone', quantity: 1 }], BASE_BACKPACK_CAPACITY, [id], registry)).toBeNull();
  });
  it('projects authored skill requirements independently of recipe identity and station access', () => {
    const rows = bootstrapContentRows().map((row) => row.id !== 'recipe:planks' ? row : {
      ...row, json: JSON.stringify({ ...JSON.parse(String(row.json)),
        skillRequirement: { skillNode: 'greenhouse_charter', minimumRank: 1 } }),
    });
    const built = buildContentRegistry(rows);
    expect(built.report.valid).toBe(true);
    const inventory = [{ container: 'hotbar' as const, index: 0, itemKind: 'wood', quantity: 10 }];
    const entry = (ranks: Readonly<Record<string, number>>) =>
      craftingRecipeBookEntries([], inventory, BASE_BACKPACK_CAPACITY, ['planks'], built.registry, ranks)[0];
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
    expect(craftingRecipeBookEntries([], [{ container: 'hotbar' as const, index: 0, itemKind: 'stone', quantity: 1 }], BASE_BACKPACK_CAPACITY, ['planks'], registry))
      .toContainEqual(expect.objectContaining({ recipeId: 'planks', outputQuantity: 7, missingIngredients: false }));
  });

  it('does not list or ghost-fill a retired recipe retained in the compiled projection', () => {
    const rows = bootstrapContentRows().map((row) => row.id !== 'recipe:planks' ? row : {
      ...row, json: JSON.stringify({ ...JSON.parse(String(row.json)), retired: true }),
    });
    const retired = buildContentRegistry(rows).registry;
    expect(retired.compiled.recipes.planks).toBeDefined();
    expect(craftingRecipeStacks('planks', ['planks'], retired)).toBeNull();
    expect(craftingRecipeBookEntries([], [{ container: 'hotbar' as const, index: 0, itemKind: 'wood', quantity: 99 }], BASE_BACKPACK_CAPACITY,
      ['planks'], retired)).toEqual([]);
    expect(ghostFillRecipeMoves('planks', [{ container: 'hotbar' as const, index: 0, itemKind: 'wood', quantity: 99 }],
      BASE_BACKPACK_CAPACITY, ['planks'], retired)).toBeNull();
  });

  it('keeps station recipes visible, marks their requirement, and unlocks them beside a workbench', () => {
    const inventory = [{ container: 'hotbar' as const, index: 0, itemKind: 'plank', quantity: 8 }];
    const known = ['workbench', 'chest', 'standing_torch'];
    const hand = craftingRecipeBookEntries([], inventory, BASE_BACKPACK_CAPACITY, known);
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
    const workbench = craftingRecipeBookEntries(['workbench'], inventory, BASE_BACKPACK_CAPACITY, known);
    expect(workbench.find((entry) => entry.recipeId === 'chest')).toMatchObject({
      stationAvailable: true,
      missingIngredients: false,
    });
    expect(workbench.find((entry) => entry.recipeId === 'standing_torch')?.missingIngredients).toBe(true);
  });

  it('click-to-ghost-fill plans the shifted recipe without overwriting occupied cells', () => {
    const rows = [{ container: 'hotbar' as const, index: 0, itemKind: 'plank', quantity: 4 }];
    expect(ghostFillRecipeMoves('workbench', rows, BASE_BACKPACK_CAPACITY, ['workbench'])).toEqual([
      { fromContainer: 'hotbar', fromIndex: 0, toContainer: 'crafting', toIndex: 0, quantity: 1 },
      { fromContainer: 'hotbar', fromIndex: 0, toContainer: 'crafting', toIndex: 1, quantity: 1 },
      { fromContainer: 'hotbar', fromIndex: 0, toContainer: 'crafting', toIndex: 3, quantity: 1 },
      { fromContainer: 'hotbar', fromIndex: 0, toContainer: 'crafting', toIndex: 4, quantity: 1 },
    ]);
    expect(ghostFillRecipeMoves('workbench', [...rows, { container: 'crafting' as const, index: 0, itemKind: 'stone', quantity: 1 }], BASE_BACKPACK_CAPACITY, ['workbench'])).toBeNull();
    expect(ghostFillRecipeMoves('workbench', rows, BASE_BACKPACK_CAPACITY, [])).toBeNull();
  });

  it('keeps the complete known pattern available when ingredients are missing', () => {
    expect(craftingRecipePattern('workbench', ['workbench'])).toEqual([
      'plank', 'plank', null,
      'plank', 'plank', null,
      null, null, null,
    ]);
    expect(craftingRecipePattern('workbench', [])).toBeNull();
    expect(ghostFillRecipeMoves(
      'workbench', [{ container: 'hotbar' as const, index: 0, itemKind: 'plank', quantity: 2 }], BASE_BACKPACK_CAPACITY, ['workbench'],
    )).toEqual([
      { fromContainer: 'hotbar', fromIndex: 0, toContainer: 'crafting', toIndex: 0, quantity: 1 },
      { fromContainer: 'hotbar', fromIndex: 0, toContainer: 'crafting', toIndex: 1, quantity: 1 },
    ]);
    expect(ghostFillRecipeMoves('workbench', [], BASE_BACKPACK_CAPACITY, ['workbench'])).toEqual([]);
  });

  it('treats global slot 9 as hotbar key 0 and starts the backpack at slot 10', () => {
    expect(ghostFillRecipeMoves('workbench', [{ container: 'hotbar' as const, index: 9, itemKind: 'plank', quantity: 4 }], BASE_BACKPACK_CAPACITY, ['workbench']))
      .toEqual([0, 1, 3, 4].map((toIndex) => ({
        fromContainer: 'hotbar', fromIndex: 9, toContainer: 'crafting', toIndex, quantity: 1,
      })));
    expect(ghostFillRecipeMoves('workbench', [{ container: 'backpack' as const, index: 0, itemKind: 'plank', quantity: 4 }], BASE_BACKPACK_CAPACITY, ['workbench']))
      .toEqual([0, 1, 3, 4].map((toIndex) => ({
        fromContainer: 'backpack', fromIndex: 0, toContainer: 'crafting', toIndex, quantity: 1,
      })));
  });

  it('counts and fills only the cells the world reads after a swap to a smaller bag (BUG-056)', () => {
    // Twenty planks sat in backpack cells 12-19 of the 20-cell bag; the player then equipped a 12-cell bag.
    const stranded = Array.from({ length: 8 }, (_, index) => ({ container: 'backpack' as const, index: 12 + index, itemKind: 'plank', quantity: 1 }));
    const entry = (rows: readonly RecipeBookInventoryRow[], capacity: number) =>
      craftingRecipeBookEntries([], rows, capacity, ['workbench']).find(candidate => candidate.recipeId === 'workbench');
    expect(entry(stranded, 12)).toMatchObject({ missingIngredients: true, ingredients: [{ itemKind: 'plank', need: 4, have: 0 }] });
    expect(ghostFillRecipeMoves('workbench', stranded, 12, ['workbench'])).toEqual([]);
    // The same cells count once the bag opens them, and cell 11 of the 12-cell bag always counts.
    expect(entry(stranded, 20)).toMatchObject({ missingIngredients: false, ingredients: [{ itemKind: 'plank', need: 4, have: 8 }] });
    const reachable = [...stranded, { container: 'backpack' as const, index: 11, itemKind: 'plank', quantity: 4 }];
    expect(entry(reachable, 12)).toMatchObject({ missingIngredients: false, ingredients: [{ itemKind: 'plank', need: 4, have: 4 }] });
    expect(ghostFillRecipeMoves('workbench', reachable, 12, ['workbench'])?.map(move => move.fromIndex)).toEqual([11, 11, 11, 11]);
    // A bag authored below 8 still opens the base 8, as the world does; equipped gear is never an ingredient.
    expect(entry([{ container: 'backpack' as const, index: 7, itemKind: 'plank', quantity: 4 }], 4)?.missingIngredients).toBe(false);
    expect(entry([{ container: 'equipment' as const, index: 3, itemKind: 'plank', quantity: 4 }], 20)?.missingIngredients).toBe(true);
    // Items already in the crafting grid still count, as the world's fill returns and reuses them.
    expect(entry([{ container: 'crafting' as const, index: 0, itemKind: 'plank', quantity: 4 }], 8)?.missingIngredients).toBe(false);
  });
});
