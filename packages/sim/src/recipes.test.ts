import { describe, expect, it } from 'vitest';
import { recipeMatches, RECIPES, normalizeShapedRecipe } from './recipes.js';
import { consumeCraftingRecipe, matchingRecipeId } from './item-containers.js';
import type { ItemStack } from './item-containers.js';

function grid(entries: Readonly<Record<number, string>>): readonly (ItemStack | null)[] {
  return Array.from({ length: 9 }, (_, index) => entries[index]
    ? { itemKind: entries[index]!, quantity: 1 }
    : null);
}

describe('28§1 shift-invariant shaped recipes', () => {
  it('normalizes empty outer rows and columns to the occupied bounding box', () => {
    expect(normalizeShapedRecipe({
      id: 'offset', kind: 'shaped', output: { itemKind: 'plank', quantity: 1 },
      pattern: [[null, null, null], [null, 'wood', null], [null, 'stone', null]],
    })).toEqual({ width: 1, height: 2, pattern: ['wood', 'stone'] });
  });

  it('matches the 2x2 workbench at every 3x3 offset', () => {
    for (const cells of [[0, 1, 3, 4], [1, 2, 4, 5], [3, 4, 6, 7], [4, 5, 7, 8]]) {
      expect(recipeMatches(RECIPES.workbench, grid(Object.fromEntries(cells.map((cell) => [cell, 'plank']))))).toBe(true);
    }
  });

  it('does not mirror handed patterns', () => {
    expect(recipeMatches(RECIPES.sign, grid({ 0: 'plank', 1: 'plank', 2: 'plank', 3: 'plank', 4: 'plank', 5: 'plank', 7: 'stick' }))).toBe(true);
    expect(recipeMatches(RECIPES.sign, grid({ 0: 'plank', 1: 'plank', 2: 'plank', 3: 'plank', 4: 'plank', 5: 'plank', 6: 'stick' }))).toBe(false);
  });

  it('keeps null cells strict inside and outside the bounding box', () => {
    const chest = grid({ 0: 'plank', 1: 'plank', 2: 'plank', 3: 'plank', 5: 'plank', 6: 'plank', 7: 'plank', 8: 'plank' });
    expect(recipeMatches(RECIPES.chest, chest)).toBe(true);
    expect(recipeMatches(RECIPES.chest, chest.map((slot, index) => index === 4 ? { itemKind: 'stick', quantity: 1 } : slot))).toBe(false);
  });
});

describe('06§12 phases 1–3 crafting recipe goldens', () => {
  it('pins hand recipe inputs and outputs', () => {
    expect(RECIPES.planks).toMatchObject({ inputs: { wood: 1 }, output: { itemKind: 'plank', quantity: 4 } });
    expect(RECIPES.sticks).toMatchObject({ pattern: [['plank'], ['plank']], output: { itemKind: 'stick', quantity: 4 } });
    expect(RECIPES.torch).toMatchObject({ inputs: { wood: 1, fiber: 1 }, output: { itemKind: 'torch', quantity: 2 } });
    expect(RECIPES.campfire).toMatchObject({ inputs: { wood: 3, stick: 3 }, output: { itemKind: 'campfire', quantity: 1 } });
    expect(RECIPES.workbench).toMatchObject({ output: { itemKind: 'workbench', quantity: 1 } });
  });

  it('pins workbench recipe outputs and station gates', () => {
    for (const recipe of [RECIPES.chest, RECIPES.barrel, RECIPES.fence, RECIPES.fence_gate, RECIPES.sign, RECIPES.standing_torch, RECIPES.arrows]) {
      expect(recipe.station).toBe('workbench');
    }
    expect(RECIPES.fence.output).toEqual({ itemKind: 'fence', quantity: 3 });
    expect(RECIPES.fence_gate.output).toEqual({ itemKind: 'fence_gate', quantity: 1 });
    expect(RECIPES.standing_torch.output).toEqual({ itemKind: 'standing_torch', quantity: 1 });
  });

  it('28§14 closes the wood + fiber → torch → workbench → fence chain', () => {
    const craft = (recipeId: keyof typeof RECIPES, slots: readonly (ItemStack | null)[]) => {
      const grid = { id: 'crafting', capacity: 9, slots };
      expect(matchingRecipeId(grid)).toBe(recipeId);
      const result = consumeCraftingRecipe(grid, recipeId);
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.code);
      return result.crafted;
    };

    expect(craft('planks', grid({ 4: 'wood' }))).toEqual({ itemKind: 'plank', quantity: 4 });
    expect(craft('sticks', grid({ 1: 'plank', 4: 'plank' }))).toEqual({ itemKind: 'stick', quantity: 4 });
    expect(craft('torch', grid({ 2: 'wood', 6: 'fiber' }))).toEqual({ itemKind: 'torch', quantity: 2 });
    expect(craft('workbench', grid({ 1: 'plank', 2: 'plank', 4: 'plank', 5: 'plank' })))
      .toEqual({ itemKind: 'workbench', quantity: 1 });
    expect(RECIPES.fence.station).toBe('workbench');
    expect(craft('fence', grid({ 0: 'plank', 1: 'stick', 2: 'plank', 3: 'plank', 4: 'stick', 5: 'plank' })))
      .toEqual({ itemKind: 'fence', quantity: 3 });
  });
});
