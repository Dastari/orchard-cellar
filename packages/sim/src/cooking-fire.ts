import { CAMPFIRE_COOKING_RECIPES, type CookingRecipe } from './food.js';
import { placeableHasInterface } from './item-containers.js';
import { AUTHORITY_HZ } from './net-timing.js';

export const COOKING_FIRE_INPUT_SLOT = 0;
export const COOKING_FIRE_OUTPUT_SLOT = 1;
export const COOKING_FIRE_SLOT_CAPACITY = 2;
/** @deprecated Prefer the capability-oriented placeableHasInterface helper. */
export function isCookingFireKind(kind: string): boolean {
  return placeableHasInterface(kind, 'cooking');
}

const recipesByInput: ReadonlyMap<string, CookingRecipe> = new Map(
  Object.values(CAMPFIRE_COOKING_RECIPES).map((recipe) => [recipe.inputKind, recipe] as const),
);

export function cookingFireRecipeForInput(itemKind: string) {
  return recipesByInput.get(itemKind) ?? null;
}

export function cookingFireSlotAccepts(slot: number, itemKind: string): boolean {
  if (slot === COOKING_FIRE_INPUT_SLOT) return cookingFireRecipeForInput(itemKind) !== null;
  if (slot === COOKING_FIRE_OUTPUT_SLOT) {
    return Object.values(CAMPFIRE_COOKING_RECIPES).some((recipe) => recipe.outputKind === itemKind);
  }
  return false;
}

export function cookingFireProgress(
  cookStartTick: bigint | undefined,
  inputKind: string | undefined,
  authorityTick: bigint,
): number {
  if (cookStartTick === undefined || inputKind === undefined) return 0;
  const recipe = cookingFireRecipeForInput(inputKind);
  if (recipe === null) return 0;
  const duration = BigInt(recipe.secondsPerItem * AUTHORITY_HZ);
  const elapsed = authorityTick > cookStartTick ? authorityTick - cookStartTick : 0n;
  return Math.max(0, Math.min(1, Number(elapsed) / Number(duration)));
}

export function cookingFireDurationTicks(inputKind: string | undefined): bigint | null {
  if (inputKind === undefined) return null;
  const recipe = cookingFireRecipeForInput(inputKind);
  return recipe === null ? null : BigInt(recipe.secondsPerItem * AUTHORITY_HZ);
}

export function cookingFireRemainingTicks(
  cookStartTick: bigint | undefined,
  inputKind: string | undefined,
  authorityTick: bigint,
): bigint | null {
  if (cookStartTick === undefined) return null;
  const duration = cookingFireDurationTicks(inputKind);
  if (duration === null) return null;
  const elapsed = authorityTick > cookStartTick ? authorityTick - cookStartTick : 0n;
  return elapsed >= duration ? 0n : duration - elapsed;
}
