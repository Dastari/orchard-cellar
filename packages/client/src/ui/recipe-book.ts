import {
  RECIPES,
  normalizeShapedRecipe,
  type CraftingStation,
  type MoveItemRequest,
  type RecipeDefinition,
} from '@orchard/sim';

export interface RecipeBookInventoryRow {
  readonly slot: number;
  readonly itemKind: string;
  readonly quantity: number;
}

export interface RecipeBookEntry {
  readonly recipeId: string;
  readonly outputKind: string;
  readonly outputQuantity: number;
  readonly missingIngredients: boolean;
}

const HOTBAR_CAPACITY = 9;
const BACKPACK_OFFSET = 9;
const BACKPACK_CAPACITY = 20;
const DEFAULT_BACKPACK_CAPACITY = 8;
const CRAFTING_OFFSET = 38;

function requiredKinds(recipe: RecipeDefinition): readonly (string | null)[] {
  if (recipe.kind === 'shaped') {
    const normalized = normalizeShapedRecipe(recipe);
    if (normalized === null) return [];
    return Array.from({ length: 9 }, (_, index) => {
      const x = index % 3;
      const y = Math.floor(index / 3);
      return x < normalized.width && y < normalized.height
        ? normalized.pattern[y * normalized.width + x] ?? null
        : null;
    });
  }
  const kinds = Object.entries(recipe.inputs).flatMap(([kind, quantity]) => Array.from({ length: quantity }, () => kind));
  return Array.from({ length: 9 }, (_, index) => kinds[index] ?? null);
}

function ingredientCounts(recipe: RecipeDefinition): Readonly<Record<string, number>> {
  if (recipe.kind === 'shapeless') return recipe.inputs;
  const counts: Record<string, number> = {};
  for (const kind of requiredKinds(recipe)) if (kind !== null) counts[kind] = (counts[kind] ?? 0) + 1;
  return counts;
}

export function craftingRecipeBookEntries(
  stations: readonly CraftingStation[],
  inventory: readonly RecipeBookInventoryRow[],
): readonly RecipeBookEntry[] {
  const available = new Set(stations);
  const carried: Record<string, number> = {};
  for (const row of inventory) if (row.itemKind !== 'empty' && row.quantity > 0) {
    carried[row.itemKind] = (carried[row.itemKind] ?? 0) + row.quantity;
  }
  return (Object.values(RECIPES) as readonly RecipeDefinition[])
    .filter((recipe) => recipe.station === undefined || available.has(recipe.station))
    .map((recipe) => ({
      recipeId: recipe.id,
      outputKind: recipe.output.itemKind,
      outputQuantity: recipe.output.quantity,
      missingIngredients: Object.entries(ingredientCounts(recipe))
        .some(([kind, quantity]) => (carried[kind] ?? 0) < quantity),
    }));
}

/** Plans serial authority moves. Occupied incompatible grid cells deliberately
 * block the preview so a recipe-book click can never discard player items. */
export function ghostFillRecipeMoves(
  recipeId: string,
  inventory: readonly RecipeBookInventoryRow[],
  hasBackpack: boolean,
): readonly MoveItemRequest[] | null {
  const recipe = (Object.values(RECIPES) as readonly RecipeDefinition[])
    .find((candidate) => candidate.id === recipeId);
  if (recipe === undefined) return null;
  const desired = requiredKinds(recipe);
  const bySlot = new Map(inventory.map((row) => [row.slot, { ...row }]));
  const sourceEnd = BACKPACK_OFFSET + (hasBackpack ? BACKPACK_CAPACITY : DEFAULT_BACKPACK_CAPACITY);
  const moves: MoveItemRequest[] = [];
  for (let targetIndex = 0; targetIndex < 9; targetIndex += 1) {
    const kind = desired[targetIndex] ?? null;
    const current = bySlot.get(CRAFTING_OFFSET + targetIndex);
    if (kind === null) {
      if (current !== undefined && current.itemKind !== 'empty' && current.quantity > 0) return null;
      continue;
    }
    if (current?.itemKind === kind && current.quantity > 0) continue;
    if (current !== undefined && current.itemKind !== 'empty' && current.quantity > 0) return null;
    let sourceSlot = -1;
    for (let slot = 0; slot < sourceEnd; slot += 1) {
      const source = bySlot.get(slot);
      if (source?.itemKind === kind && source.quantity > 0) { sourceSlot = slot; break; }
    }
    if (sourceSlot < 0) return null;
    const source = bySlot.get(sourceSlot)!;
    bySlot.set(sourceSlot, { ...source, quantity: source.quantity - 1 });
    moves.push({
      fromContainer: sourceSlot < HOTBAR_CAPACITY ? 'hotbar' : 'backpack',
      fromIndex: sourceSlot < HOTBAR_CAPACITY ? sourceSlot : sourceSlot - BACKPACK_OFFSET,
      toContainer: 'crafting',
      toIndex: targetIndex,
      quantity: 1,
    });
  }
  return moves;
}
