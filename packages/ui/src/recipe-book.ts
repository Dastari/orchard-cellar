import type { ItemStack, CraftingStation, ContentRegistry, MoveItemRequest, RecipeDefinition } from '@orchard/sim';
import { runtimeRecipeSkillSatisfied } from '@orchard/sim/content/farming-runtime';
import { runtimeRecipeDefinition, runtimeMaxStack } from '@orchard/sim/content/runtime';
import { BACKPACK_SLOT_COUNT, BACKPACK_SLOT_OFFSET, CRAFTING_SLOT_COUNT, CRAFTING_SLOT_OFFSET, HOTBAR_SLOT_COUNT } from '@orchard/sim/inventory-layout';
import { BASE_BACKPACK_CAPACITY, maxStackFor } from '@orchard/sim/item-containers';
import { RECIPES, normalizeShapedRecipe, recipeGridStacks } from '@orchard/sim/recipes';

export interface RecipeBookInventoryRow {
  readonly slot: number;
  readonly itemKind: string;
  readonly quantity: number;
}

export interface RecipeBookEntry {
  readonly recipeId: string;
  readonly outputKind: string;
  readonly outputQuantity: number;
  readonly requiredStation: CraftingStation | null;
  readonly stationAvailable: boolean;
  readonly skillAvailable: boolean;
  readonly missingIngredients: boolean;
  /** Per-ingredient need and carried count, for the recipe book's "Needs" page. */
  readonly ingredients: readonly { readonly itemKind: string; readonly need: number; readonly have: number }[];
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

/** Returns the normalized 3x3 pattern used by the crafting UI. Keeping this
 * separate from inventory movement lets a known recipe remain visible as a
 * ghost even when the player does not currently carry every ingredient. */
export function craftingRecipePattern(
  recipeId: string,
  knownRecipeIds: readonly string[],
  registry?: ContentRegistry,
): readonly (string | null)[] | null {
  return craftingRecipeStacks(recipeId, knownRecipeIds, registry)?.map(stack => stack?.itemKind ?? null) ?? null;
}

export function craftingRecipeStacks(recipeId: string, knownRecipeIds: readonly string[], registry?: ContentRegistry): readonly (ItemStack | null)[] | null {
  if (!knownRecipeIds.includes(recipeId)) return null;
  const recipe = registry === undefined
    ? (Object.values(RECIPES) as readonly RecipeDefinition[]).find((candidate) => candidate.id === recipeId) ?? null
    : runtimeRecipeDefinition(registry, recipeId);
  if (recipe === null) return null;
  return recipeGridStacks(recipe, CRAFTING_SLOT_COUNT, kind => registry ? runtimeMaxStack(registry, kind) : maxStackFor(kind));
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
  registry?: ContentRegistry,
  skillRanks: Readonly<Record<string, number>> = {},
): readonly RecipeBookEntry[] {
  const available = new Set(stations);
  const known = new Set(knownRecipeIds);
  const carried: Record<string, number> = {};
  for (const row of inventory) if (row.itemKind !== 'empty' && row.quantity > 0) {
    carried[row.itemKind] = (carried[row.itemKind] ?? 0) + row.quantity;
  }
  return (Object.values(registry?.compiled.recipes ?? RECIPES) as readonly RecipeDefinition[])
    .filter((recipe) => registry === undefined || runtimeRecipeDefinition(registry, recipe.id) !== null)
    .filter((recipe) => known.has(recipe.id))
    .map((recipe) => ({
      recipeId: recipe.id,
      outputKind: recipe.output.itemKind,
      outputQuantity: recipe.output.quantity,
      requiredStation: recipe.station ?? null,
      stationAvailable: recipe.station === undefined || available.has(recipe.station),
      skillAvailable: registry === undefined || runtimeRecipeSkillSatisfied(registry, recipe.id, skillRanks),
      missingIngredients: Object.entries(ingredientCounts(recipe))
        .some(([kind, quantity]) => (carried[kind] ?? 0) < quantity),
      ingredients: Object.entries(ingredientCounts(recipe))
        .map(([itemKind, need]) => ({ itemKind, need, have: carried[itemKind] ?? 0 })),
    }));
}

/** Plans serial authority moves. Occupied incompatible grid cells deliberately
 * block the preview so a recipe-book click can never discard player items. */
export function ghostFillRecipeMoves(
  recipeId: string,
  inventory: readonly RecipeBookInventoryRow[],
  hasBackpack: boolean,
  knownRecipeIds: readonly string[],
  registry?: ContentRegistry,
): readonly MoveItemRequest[] | null {
  const desired = craftingRecipeStacks(recipeId, knownRecipeIds, registry);
  if (desired === null) return null;
  const bySlot = new Map(inventory.map((row) => [row.slot, { ...row }]));
  const sourceEnd = BACKPACK_SLOT_OFFSET + (hasBackpack ? BACKPACK_SLOT_COUNT : BASE_BACKPACK_CAPACITY);
  const moves: MoveItemRequest[] = [];
  for (let targetIndex = 0; targetIndex < CRAFTING_SLOT_COUNT; targetIndex += 1) {
    const target = desired[targetIndex] ?? null;
    const kind = target?.itemKind ?? null;
    const current = bySlot.get(CRAFTING_SLOT_OFFSET + targetIndex);
    if (kind === null) {
      if (current !== undefined && current.itemKind !== 'empty' && current.quantity > 0) return null;
      continue;
    }
    if (current !== undefined && current.itemKind !== kind && current.itemKind !== 'empty' && current.quantity > 0) return null;
    let needed = target!.quantity - (current?.itemKind === kind ? current.quantity : 0);
    for (let sourceSlot = 0; sourceSlot < sourceEnd && needed > 0; sourceSlot += 1) {
      const source = bySlot.get(sourceSlot);
      if (source?.itemKind !== kind || source.quantity <= 0) continue;
      // Missing ingredients no longer invalidate recipe selection. Move the
      // ingredients that are available and let the client retain ghosts for the
      // remaining cells so the player can still learn the complete pattern.
      const quantity = Math.min(needed, source.quantity);
      needed -= quantity;
      bySlot.set(sourceSlot, { ...source, quantity: source.quantity - quantity });
      moves.push({
        fromContainer: sourceSlot < HOTBAR_SLOT_COUNT ? 'hotbar' : 'backpack',
        fromIndex: sourceSlot < HOTBAR_SLOT_COUNT ? sourceSlot : sourceSlot - BACKPACK_SLOT_OFFSET,
        toContainer: 'crafting',
        toIndex: targetIndex,
        quantity,
      });
    }
  }
  return moves;
}
