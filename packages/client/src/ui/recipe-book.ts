import {
  BACKPACK_SLOT_COUNT,
  BACKPACK_SLOT_OFFSET,
  BASE_BACKPACK_CAPACITY,
  CRAFTING_SLOT_COUNT,
  CRAFTING_SLOT_OFFSET,
  HOTBAR_SLOT_COUNT,
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

function requiredKinds(recipe: RecipeDefinition): readonly (string | null)[] {
  if (recipe.kind === 'shaped') {
    const normalized = normalizeShapedRecipe(recipe);
    if (normalized === null) return [];
    return Array.from({ length: CRAFTING_SLOT_COUNT }, (_, index) => {
      const x = index % 3;
      const y = Math.floor(index / 3);
      return x < normalized.width && y < normalized.height
        ? normalized.pattern[y * normalized.width + x] ?? null
        : null;
    });
  }
  const kinds = Object.entries(recipe.inputs).flatMap(([kind, quantity]) => Array.from({ length: quantity }, () => kind));
  return Array.from({ length: CRAFTING_SLOT_COUNT }, (_, index) => kinds[index] ?? null);
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
  knownRecipeIds: readonly string[],
): readonly RecipeBookEntry[] {
  const available = new Set(stations);
  const known = new Set(knownRecipeIds);
  const carried: Record<string, number> = {};
  for (const row of inventory) if (row.itemKind !== 'empty' && row.quantity > 0) {
    carried[row.itemKind] = (carried[row.itemKind] ?? 0) + row.quantity;
  }
  return (Object.values(RECIPES) as readonly RecipeDefinition[])
    .filter((recipe) => known.has(recipe.id))
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
  knownRecipeIds: readonly string[],
): readonly MoveItemRequest[] | null {
  if (!knownRecipeIds.includes(recipeId)) return null;
  const recipe = (Object.values(RECIPES) as readonly RecipeDefinition[])
    .find((candidate) => candidate.id === recipeId);
  if (recipe === undefined) return null;
  const desired = requiredKinds(recipe);
  const bySlot = new Map(inventory.map((row) => [row.slot, { ...row }]));
  const sourceEnd = BACKPACK_SLOT_OFFSET + (hasBackpack ? BACKPACK_SLOT_COUNT : BASE_BACKPACK_CAPACITY);
  const moves: MoveItemRequest[] = [];
  for (let targetIndex = 0; targetIndex < CRAFTING_SLOT_COUNT; targetIndex += 1) {
    const kind = desired[targetIndex] ?? null;
    const current = bySlot.get(CRAFTING_SLOT_OFFSET + targetIndex);
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
      fromContainer: sourceSlot < HOTBAR_SLOT_COUNT ? 'hotbar' : 'backpack',
      fromIndex: sourceSlot < HOTBAR_SLOT_COUNT ? sourceSlot : sourceSlot - BACKPACK_SLOT_OFFSET,
      toContainer: 'crafting',
      toIndex: targetIndex,
      quantity: 1,
    });
  }
  return moves;
}
