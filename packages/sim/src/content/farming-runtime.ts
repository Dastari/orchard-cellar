import { placeableObjectDefinition, type PlaceableContentReference } from '../crafting.js';
import type { ContentRegistry } from './registry.js';

export function runtimeObjectIrrigatesTile(
  registry: Pick<ContentRegistry, 'objects'>,
  object: PlaceableContentReference & { readonly tileX: number; readonly tileY: number },
  tileX: number,
  tileY: number,
): boolean {
  const irrigation = placeableObjectDefinition(registry, object)?.components.farming?.irrigation;
  return irrigation !== undefined
    && Math.max(Math.abs(tileX - object.tileX), Math.abs(tileY - object.tileY)) <= irrigation.radiusTiles;
}

export function runtimeObjectProtectsCropSeasons(
  registry: Pick<ContentRegistry, 'objects'>,
  object: PlaceableContentReference,
): boolean {
  return placeableObjectDefinition(registry, object)?.components.farming?.seasonProtection === 'homestead';
}

export function runtimeRecipeSkillSatisfied(
  registry: Pick<ContentRegistry, 'recipes'>,
  recipeId: string,
  ranks: Readonly<Record<string, number>>,
): boolean {
  const recipe = registry.recipes.get(recipeId.startsWith('recipe:') ? recipeId : `recipe:${recipeId}`);
  if (recipe === undefined || recipe.retired === true) return false;
  const requirement = recipe.skillRequirement;
  return requirement === undefined || (ranks[requirement.skillNode] ?? 0) >= requirement.minimumRank;
}
