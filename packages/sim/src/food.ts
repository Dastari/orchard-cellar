import { AUTHORITY_HZ } from './net-timing.js';
import type { Modifier } from './modifiers.js';
import type { WildlifeSpecies } from './wildlife.js';

export const HUNGER_MAX_CENTI = 10_000;
export const HUNGER_LOW_CENTI = 2_500;
export const HUNGER_TOOL_USE_CENTI = 20;
export const HUNGER_WEAPON_USE_CENTI = 35;
/** Sprinting converts two percent of spent Vigour into hunger pressure. */
export const HUNGER_SPRINT_VIGOUR_BASIS_POINTS = 200;

export interface HungerState {
  readonly hungerCenti: number;
  readonly hungerUpdatedTick: bigint;
}

export function spendHunger(state: HungerState, amountCenti: number): HungerState {
  const amount = Number.isSafeInteger(amountCenti) ? Math.max(0, amountCenti) : 0;
  return { ...state, hungerCenti: Math.max(0, state.hungerCenti - amount) };
}

export function restoreHunger(state: HungerState, amountCenti: number): HungerState {
  const amount = Number.isSafeInteger(amountCenti) ? Math.max(0, amountCenti) : 0;
  return { ...state, hungerCenti: Math.min(HUNGER_MAX_CENTI, state.hungerCenti + amount) };
}

/** Hunger is exertion-driven. A stationary or merely connected player never
 * loses hunger; sprinting pays only for Vigour the authority actually spent. */
export function hungerCostForSprintVigour(vigourCostCenti: number): number {
  if (!Number.isSafeInteger(vigourCostCenti) || vigourCostCenti <= 0) return 0;
  return Math.max(1, Math.ceil(
    vigourCostCenti * HUNGER_SPRINT_VIGOUR_BASIS_POINTS / 10_000,
  ));
}

/** Empty hunger is a severe recovery penalty, not a deadlock. Multiplicative
 * penalties are applied after ordinary additive effects, preserving a trickle
 * even while Winded; tool use remains possible but costs fifty percent more. */
export function modifiersForHunger(hungerCenti: number): readonly Modifier[] {
  const hunger = Math.max(0, Math.min(HUNGER_MAX_CENTI, Math.trunc(hungerCenti)));
  if (hunger > HUNGER_LOW_CENTI) return [];
  if (hunger > 0) return [{
    id: 'survival.hungry.regen', target: 'vigourRegen', layer: 'pctMult', value: -5_000,
    source: 'environment',
  }];
  return [
    {
      id: 'survival.starving.regen', target: 'vigourRegen', layer: 'pctMult', value: -9_000,
      source: 'environment',
    },
    {
      id: 'survival.starving.cost', target: 'toolVigourCost', layer: 'pctAdd', value: 5_000,
      source: 'environment',
    },
  ];
}

export const FOOD_ITEM_DEFINITIONS = {
  raw_chicken: { displayName: 'Raw Chicken', iconKey: 'item_cf_raw_chicken', quality: 'common', maxStack: 32, tags: ['item.food', 'food.raw', 'food.meat'] },
  cooked_chicken: { displayName: 'Roast Chicken', iconKey: 'item_cf_cooked_chicken', quality: 'uncommon', maxStack: 32, tags: ['item.food', 'item.consumable', 'food.cooked', 'food.meat'] },
  raw_pork: { displayName: 'Raw Pork', iconKey: 'item_cf_raw_pork', quality: 'common', maxStack: 32, tags: ['item.food', 'food.raw', 'food.meat'] },
  cooked_pork: { displayName: 'Roast Pork', iconKey: 'item_cf_cooked_pork', quality: 'uncommon', maxStack: 32, tags: ['item.food', 'item.consumable', 'food.cooked', 'food.meat'] },
  raw_beef: { displayName: 'Raw Beef', iconKey: 'item_cf_raw_beef', quality: 'common', maxStack: 32, tags: ['item.food', 'food.raw', 'food.meat'] },
  cooked_beef: { displayName: 'Cooked Beef', iconKey: 'item_cf_cooked_beef', quality: 'uncommon', maxStack: 32, tags: ['item.food', 'item.consumable', 'food.cooked', 'food.meat'] },
  raw_mutton: { displayName: 'Raw Mutton', iconKey: 'item_cf_raw_mutton', quality: 'common', maxStack: 32, tags: ['item.food', 'food.raw', 'food.meat'] },
  cooked_mutton: { displayName: 'Roast Mutton', iconKey: 'item_cf_cooked_mutton', quality: 'uncommon', maxStack: 32, tags: ['item.food', 'item.consumable', 'food.cooked', 'food.meat'] },
} as const;

export type RawFoodKind = 'raw_chicken' | 'raw_pork' | 'raw_beef' | 'raw_mutton';
export type CookedFoodKind = 'cooked_chicken' | 'cooked_pork' | 'cooked_beef' | 'cooked_mutton';

export interface CookingRecipe {
  readonly id: string;
  readonly inputKind: RawFoodKind;
  readonly outputKind: CookedFoodKind;
  readonly secondsPerItem: number;
  readonly farmingExperiencePerItem: number;
}

export const CAMPFIRE_COOKING_RECIPES = {
  roast_chicken: { id: 'roast_chicken', inputKind: 'raw_chicken', outputKind: 'cooked_chicken', secondsPerItem: 45, farmingExperiencePerItem: 5 },
  roast_pork: { id: 'roast_pork', inputKind: 'raw_pork', outputKind: 'cooked_pork', secondsPerItem: 45, farmingExperiencePerItem: 6 },
  cook_beef: { id: 'cook_beef', inputKind: 'raw_beef', outputKind: 'cooked_beef', secondsPerItem: 50, farmingExperiencePerItem: 7 },
  roast_mutton: { id: 'roast_mutton', inputKind: 'raw_mutton', outputKind: 'cooked_mutton', secondsPerItem: 45, farmingExperiencePerItem: 6 },
} as const satisfies Readonly<Record<string, CookingRecipe>>;

export type CookingRecipeId = keyof typeof CAMPFIRE_COOKING_RECIPES;

export function cookingRecipe(id: string): CookingRecipe | null {
  return Object.prototype.hasOwnProperty.call(CAMPFIRE_COOKING_RECIPES, id)
    ? CAMPFIRE_COOKING_RECIPES[id as CookingRecipeId]
    : null;
}

export function cookingDurationTicks(recipe: CookingRecipe, quantity: number): bigint {
  const count = Number.isSafeInteger(quantity) ? Math.max(1, Math.min(8, quantity)) : 1;
  return BigInt(recipe.secondsPerItem * count * AUTHORITY_HZ);
}

const FOOD_RESTORE_CENTI: Readonly<Record<string, number>> = {
  cooked_chicken: 2_800,
  cooked_pork: 3_400,
  cooked_beef: 4_000,
  cooked_mutton: 3_200,
  apple: 700,
  pear: 700,
  peach: 800,
  cherry: 500,
  grape: 500,
  tomato: 500,
  carrot: 600,
  turnip: 600,
  corn: 800,
  pumpkin: 1_200,
  parsley: 200,
  cabbage: 900,
  cucumber: 500,
  hot_pepper: 300,
  red_pepper: 500,
  yellow_pepper: 500,
  green_pepper: 500,
  watermelon: 1_300,
  garlic: 300,
  potato: 700,
  strawberry: 600,
  beetroot: 700,
  onion: 500,
  leek: 600,
};

export function foodHungerRestoreCenti(itemKind: string): number | null {
  return FOOD_RESTORE_CENTI[itemKind] ?? null;
}

export const FOOD_ECONOMY = {
  raw_chicken: { buyPriceBronze: null, sellPriceBronze: 14 },
  cooked_chicken: { buyPriceBronze: null, sellPriceBronze: 28 },
  raw_pork: { buyPriceBronze: null, sellPriceBronze: 18 },
  cooked_pork: { buyPriceBronze: null, sellPriceBronze: 36 },
  raw_beef: { buyPriceBronze: null, sellPriceBronze: 22 },
  cooked_beef: { buyPriceBronze: null, sellPriceBronze: 44 },
  raw_mutton: { buyPriceBronze: null, sellPriceBronze: 18 },
  cooked_mutton: { buyPriceBronze: null, sellPriceBronze: 36 },
} as const;

export const HUNTABLE_WILDLIFE = [
  'cow', 'sheep', 'pig', 'chicken', 'rooster', 'duck', 'goose',
] as const satisfies readonly WildlifeSpecies[];

export function wildlifeIsHuntable(species: WildlifeSpecies): boolean {
  return (HUNTABLE_WILDLIFE as readonly WildlifeSpecies[]).includes(species);
}

export interface WildlifeFoodDrop {
  readonly itemKind: RawFoodKind;
  readonly quantity: number;
}

export function wildlifeFoodDrops(species: WildlifeSpecies): readonly WildlifeFoodDrop[] {
  switch (species) {
    case 'chicken': case 'rooster': case 'duck': return [{ itemKind: 'raw_chicken', quantity: 1 }];
    case 'goose': return [{ itemKind: 'raw_chicken', quantity: 2 }];
    case 'pig': return [{ itemKind: 'raw_pork', quantity: 3 }];
    case 'cow': return [{ itemKind: 'raw_beef', quantity: 4 }];
    case 'sheep': return [{ itemKind: 'raw_mutton', quantity: 3 }];
    default: return [];
  }
}

export function wildlifeCombatExperience(species: WildlifeSpecies): bigint {
  switch (species) {
    case 'cow': return 28n;
    case 'pig': case 'sheep': return 22n;
    case 'goose': return 18n;
    default: return 14n;
  }
}
