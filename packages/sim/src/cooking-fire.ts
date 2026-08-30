import { CAMPFIRE_COOKING_RECIPES, type CookingRecipe } from './food.js';
import { maxStackFor, placeableHasInterface, type ItemStack } from './item-containers.js';
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

export interface CookingFireState {
  readonly slots: readonly (ItemStack | null)[];
  readonly cookStartTick: bigint | undefined;
  readonly lit: boolean;
}

export interface SettledCookingFire {
  readonly slots: readonly (ItemStack | null)[];
  readonly cookStartTick: bigint | undefined;
  readonly completed: number;
  readonly completedInputKind: string | null;
}

function canCook(slots: readonly (ItemStack | null)[], lit: boolean): boolean {
  if (!lit) return false;
  const input = slots[COOKING_FIRE_INPUT_SLOT] ?? null;
  const output = slots[COOKING_FIRE_OUTPUT_SLOT] ?? null;
  if (input === null || input.quantity <= 0) return false;
  const recipe = cookingFireRecipeForInput(input.itemKind);
  if (recipe === null) return false;
  return output === null
    || (output.itemKind === recipe.outputKind && output.quantity < (maxStackFor(recipe.outputKind) ?? 0));
}

function reduced(stack: ItemStack, quantity: number): ItemStack | null {
  const nextQuantity = stack.quantity - quantity;
  return nextQuantity > 0 ? { ...stack, quantity: nextQuantity } : null;
}

/** Cooking settles on interaction/tick observation, avoiding one timer row per
 * station while retaining exact progress across disconnects and reloads. */
export function settleCookingFire(state: CookingFireState, authorityTick: bigint): SettledCookingFire {
  const slots = Array.from({ length: COOKING_FIRE_SLOT_CAPACITY }, (_, slot) => state.slots[slot] ?? null);
  if (!canCook(slots, state.lit)) {
    return { slots, cookStartTick: undefined, completed: 0, completedInputKind: null };
  }
  if (state.cookStartTick === undefined) {
    return { slots, cookStartTick: authorityTick, completed: 0, completedInputKind: null };
  }
  const input = slots[COOKING_FIRE_INPUT_SLOT]!;
  const recipe = cookingFireRecipeForInput(input.itemKind)!;
  const duration = BigInt(recipe.secondsPerItem * AUTHORITY_HZ);
  const elapsed = authorityTick - state.cookStartTick;
  if (elapsed < duration) {
    return { slots, cookStartTick: state.cookStartTick, completed: 0, completedInputKind: null };
  }
  const output = slots[COOKING_FIRE_OUTPUT_SLOT];
  const outputSpace = (maxStackFor(recipe.outputKind) ?? 0) - (output?.quantity ?? 0);
  const completed = Math.min(Number(elapsed / duration), input.quantity, outputSpace);
  if (completed <= 0) {
    return { slots, cookStartTick: undefined, completed: 0, completedInputKind: null };
  }
  slots[COOKING_FIRE_INPUT_SLOT] = reduced(input, completed);
  slots[COOKING_FIRE_OUTPUT_SLOT] = {
    itemKind: recipe.outputKind,
    quantity: (output?.quantity ?? 0) + completed,
  };
  const nextStartTick = state.cookStartTick + BigInt(completed) * duration;
  return {
    slots,
    cookStartTick: canCook(slots, state.lit) ? nextStartTick : undefined,
    completed,
    completedInputKind: input.itemKind,
  };
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

/** Players may remove output, but only authority settlement may create it. */
export function cookingFireMutationIsValid(
  before: readonly (ItemStack | null)[],
  after: readonly (ItemStack | null)[],
): boolean {
  for (let slot = 0; slot < COOKING_FIRE_SLOT_CAPACITY; slot += 1) {
    const stack = after[slot] ?? null;
    if (stack !== null && !cookingFireSlotAccepts(slot, stack.itemKind)) return false;
  }
  const previousOutput = before[COOKING_FIRE_OUTPUT_SLOT] ?? null;
  const nextOutput = after[COOKING_FIRE_OUTPUT_SLOT] ?? null;
  if (nextOutput === null) return true;
  return previousOutput !== null
    && previousOutput.itemKind === nextOutput.itemKind
    && nextOutput.quantity <= previousOutput.quantity;
}
