import { bootstrapDefinitionsOfKind } from './content/bootstrap-pack-loader.js';
import { BOOTSTRAP_COMPILED_CONTENT } from './content/bootstrap-projection.js';
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

export const FOOD_ITEM_DEFINITIONS = Object.fromEntries(
  bootstrapDefinitionsOfKind('item')
    .filter(({ tags }) => tags.includes('food.raw') || tags.includes('food.cooked'))
    .map((definition) => [
      definition.id.slice('item:'.length),
      BOOTSTRAP_COMPILED_CONTENT.itemDefinitions[definition.id.slice('item:'.length)]!,
    ]),
);

export type RawFoodKind = 'raw_chicken' | 'raw_pork' | 'raw_beef' | 'raw_mutton' | 'raw_fish';
export type CookedFoodKind = 'cooked_chicken' | 'cooked_pork' | 'cooked_beef' | 'cooked_mutton' | 'cooked_fish';

export interface CookingRecipe {
  readonly id: string;
  readonly inputKind: RawFoodKind;
  readonly outputKind: CookedFoodKind;
  readonly secondsPerItem: number;
  readonly farmingExperiencePerItem: number;
}

export const CAMPFIRE_COOKING_RECIPES: Readonly<Record<string, CookingRecipe>> =
  BOOTSTRAP_COMPILED_CONTENT.campfireCookingRecipes as Readonly<Record<string, CookingRecipe>>;

export type CookingRecipeId = keyof typeof CAMPFIRE_COOKING_RECIPES;

export function cookingRecipe(id: string): CookingRecipe | null {
  return Object.prototype.hasOwnProperty.call(CAMPFIRE_COOKING_RECIPES, id)
    ? CAMPFIRE_COOKING_RECIPES[id as CookingRecipeId] ?? null
    : null;
}

export function cookingDurationTicks(recipe: CookingRecipe, quantity: number): bigint {
  const count = Number.isSafeInteger(quantity) ? Math.max(1, Math.min(8, quantity)) : 1;
  return BigInt(recipe.secondsPerItem * count * AUTHORITY_HZ);
}

export function foodHungerRestoreCenti(itemKind: string): number | null {
  return bootstrapDefinitionsOfKind('item').find(({ id }) => id === `item:${itemKind}`)?.food?.restoreCenti ?? null;
}

export const FOOD_ECONOMY = Object.fromEntries(
  Object.keys(FOOD_ITEM_DEFINITIONS).map((kind) => [kind, BOOTSTRAP_COMPILED_CONTENT.itemEconomy[kind]!]),
);

export const HUNTABLE_WILDLIFE = bootstrapDefinitionsOfKind('creature')
  .filter(({ combat }) => combat.huntable)
  .map(({ species }) => species as WildlifeSpecies);

export function wildlifeIsHuntable(species: WildlifeSpecies): boolean {
  return (HUNTABLE_WILDLIFE as readonly WildlifeSpecies[]).includes(species);
}
