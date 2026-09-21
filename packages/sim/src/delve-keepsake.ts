import type { ContentRegistry } from './content/registry.js';
import type { RecipeContentDefinition, SupportedContentDefinition } from './content/definitions.js';

export const DELVE_COMPLETION_FLAG = 'delve.completed';
export const DELVE_COMPLETION_REWARD_TAG = 'reward.delve_completion';
export const DELVE_COMPLETION_STATISTIC = 'delves_completed';

/** One private legacy-compatible flag row stores the durable completion total. */
export function delveCompletionTotal(flag: string | undefined): bigint {
  if (flag === undefined || !/^delve\.completed:[0-9]+$/u.test(flag)) return 0n;
  const total = BigInt(flag.slice(DELVE_COMPLETION_FLAG.length + 1));
  return total <= (1n << 64n) - 1n ? total : 0n;
}

export function delveCompletionRewardError(definitions: readonly SupportedContentDefinition[]): string | null {
  const items = definitions.filter(definition => definition.kind === 'item' && definition.retired !== true
    && definition.tags.includes(DELVE_COMPLETION_REWARD_TAG));
  if (items.length === 0) return null; // An intentionally disabled/retired reward must not block exit.
  if (items.length !== 1) return 'Delve completion requires at most one active keepsake item';
  const item = items[0]!;
  if (item.kind !== 'item' || !item.tags.includes('item.placeable') || (item.economy?.sell ?? 0) !== 0) {
    return 'Delve keepsake must be a non-saleable placeable';
  }
  const recipes = definitions.filter(definition => definition.kind === 'recipe' && definition.retired !== true
    && definition.output.item === item.id);
  if (recipes.length !== 1 || recipes[0]!.kind !== 'recipe' || recipes[0]!.requiresKnowledge !== true) {
    return 'Delve keepsake requires one active knowledge-gated recipe';
  }
  return null;
}

export function delveCompletionRecipe(registry: ContentRegistry): RecipeContentDefinition | null {
  const items = [...registry.items.values()].filter(item => item.retired !== true
    && item.tags.includes(DELVE_COMPLETION_REWARD_TAG));
  if (items.length !== 1 || !items[0]!.tags.includes('item.placeable') || (items[0]!.economy?.sell ?? 0) !== 0) return null;
  const recipes = [...registry.recipes.values()].filter(recipe => recipe.retired !== true
    && recipe.output.item === items[0]!.id);
  return recipes.length === 1 && recipes[0]!.requiresKnowledge === true ? recipes[0]! : null;
}
