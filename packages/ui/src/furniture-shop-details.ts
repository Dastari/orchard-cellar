import type { ContentRegistry } from '@orchard/sim';
import { hearthFurnitureDefinition } from '@orchard/sim/hearth-furniture-state';

/** Resolve plans by their authored recipe edge, never by a naming convention. */
export function furnitureShopDetails(registry: ContentRegistry | undefined, offeredKind: string) {
  if (!registry) return null;
  const offered = registry.items.get(`item:${offeredKind}`);
  if (!offered || offered.retired) return null;
  const taught = offered.onUse.flatMap(action => action.effects.flatMap(effect => 'learnRecipes' in effect ? effect.learnRecipes : []));
  const planRecipe = taught.map(id => registry.recipes.get(id)).find(recipe => recipe && !recipe.retired
    && hearthFurnitureDefinition(registry, recipe.output.item.slice(5)) !== null);
  const itemKind = planRecipe?.output.item.slice(5) ?? offeredKind;
  const eligible = hearthFurnitureDefinition(registry, itemKind);
  if (!eligible) return null;
  const recipe = planRecipe ?? [...registry.recipes.values()].find(candidate => !candidate.retired && candidate.output.item === eligible.item.id);
  const materials = new Map<string, number>();
  if (recipe?.recipeKind === 'shapeless') for (const input of recipe.inputs) materials.set(input.item, (materials.get(input.item) ?? 0) + input.count);
  else if (recipe?.recipeKind === 'shaped') for (const row of recipe.pattern) for (const id of row) if (id) materials.set(id, (materials.get(id) ?? 0) + 1);
  const layer = { floor: 'FLOOR — WALKABLE', standing: 'FLOOR-STANDING', tabletop: 'REQUIRES A TABLE', wall: 'FRONT-FACING WALL' }[eligible.shape.layer];
  return { itemKind, name: offered.displayName, isPlan: planRecipe !== undefined,
    lines: [planRecipe ? 'RECIPE PLAN' : 'FINISHED FURNITURE', `${eligible.shape.width} X ${eligible.shape.height} TILES`, layer,
      ...(planRecipe ? ['TEACHES A REUSABLE RECIPE'] : []),
      ...(recipe ? [...(recipe.stationRequirement ? [`${recipe.stationRequirement.objectTag.replace('station.', '').toUpperCase()} REQUIRED`] : []),
        'CRAFTING MATERIALS', ...[...materials].map(([id, count]) => `${count} ${registry.items.get(id)?.displayName ?? id.slice(5)}`)] : ['NO CRAFTING RECIPE'])],
  };
}
