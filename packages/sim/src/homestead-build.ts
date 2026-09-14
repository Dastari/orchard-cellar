import type { ItemStack } from './item-containers.js';
import { placeableObjectDefinition, type PlaceableContentReference, type PlaceableKind } from './crafting.js';
import { recipeIngredientStacks } from './recipes.js';
import type { ContentRegistry } from './content/registry.js';

export type HomesteadBuildLayer = 'prop' | 'station' | 'prefab';

export interface HomesteadBuildDefinition {
  readonly itemKind: PlaceableKind;
  readonly displayName: string;
  readonly layer: HomesteadBuildLayer;
  /** The placement tile is the bottom-centre anchor. */
  readonly footprint: {
    readonly width: number;
    readonly height: number;
  };
  readonly minimumSizeTier: number;
  readonly recipeId?: string;
}

function footprintSize(footprint: readonly (readonly number[])[] | undefined) {
  return footprint === undefined
    ? { width: 1, height: 1 }
    : {
        width: Math.max(1, ...footprint.map((row) => row.length)),
        height: Math.max(1, footprint.length),
      };
}

export function runtimeHomesteadBuildDefinition(
  registry: ContentRegistry,
  reference: string | PlaceableContentReference,
): HomesteadBuildDefinition | null {
  const object = placeableObjectDefinition(registry, reference);
  const placement = object?.components.placement;
  if (object === null || placement === undefined || !placement.spaces.includes('homestead')) return null;
  const item = registry.items.get(placement.item);
  if (item === undefined || !item.tags.includes('item.placeable')) return null;
  const tags = object.components.identity?.tags ?? [];
  const prefab = tags.includes('build.prefab');
  const station = tags.some((tag) => tag.startsWith('station.'))
    || object.components.processor !== undefined;
  const itemKind = placement.item.slice('item:'.length);
  const recipe = Object.values(registry.compiled.recipes)
    .find((candidate) => candidate.output.itemKind === itemKind);
  return Object.freeze({
    itemKind,
    displayName: item.displayName,
    layer: prefab ? 'prefab' : station ? 'station' : 'prop',
    footprint: footprintSize(placement.footprint ?? object.components.collision?.footprint),
    minimumSizeTier: prefab ? 1 : 0,
    ...(recipe === undefined ? {} : { recipeId: recipe.id }),
  });
}

export function homesteadBuildDefinitions(
  registry: ContentRegistry,
): ReadonlyMap<string, HomesteadBuildDefinition> {
  return new Map([...registry.objects.values()].flatMap((object) => {
    const definition = runtimeHomesteadBuildDefinition(registry, {
      kind: object.components.placement?.item ?? '', definitionId: object.id,
    });
    return definition === null ? [] : [[definition.itemKind, definition] as const];
  }).sort(([left], [right]) => left.localeCompare(right)));
}

export interface HomesteadBuildTile {
  readonly tileX: number;
  readonly tileY: number;
}

/** Expands a bottom-centre anchor into stable occupied tiles. For even widths,
 * the anchor is the left tile of the central pair, preserving deployed layouts. */
export function homesteadBuildFootprintTiles(
  definition: Pick<HomesteadBuildDefinition, 'footprint'>,
  tileX: number,
  tileY: number,
): readonly HomesteadBuildTile[] {
  const startX = tileX - Math.floor((definition.footprint.width - 1) / 2);
  const startY = tileY - definition.footprint.height + 1;
  return Array.from(
    { length: definition.footprint.width * definition.footprint.height },
    (_, index) => ({
      tileX: startX + index % definition.footprint.width,
      tileY: startY + Math.floor(index / definition.footprint.width),
    }),
  );
}

export const HOMESTEAD_BUILD_UNDO_TICKS = 5n * 60n * 20n;

/**
 * Removing during the undo grace returns the intact object. Afterwards it
 * yields half of one crafted unit's material value, rounded down as a whole
 * budget and allocated deterministically. Non-recipe props return nothing.
 */
export function homesteadBuildRemovalRefund(
  itemKind: string,
  placedAtTick: bigint,
  authorityTick: bigint,
  registry: ContentRegistry,
): readonly ItemStack[] {
  if (authorityTick - placedAtTick <= HOMESTEAD_BUILD_UNDO_TICKS) {
    return registry.items.has(`item:${itemKind}`) ? [{ itemKind, quantity: 1 }] : [];
  }
  const definition = runtimeHomesteadBuildDefinition(registry, itemKind);
  const recipe = definition?.recipeId === undefined ? null : registry.compiled.recipes[definition.recipeId] ?? null;
  if (recipe === null) return [];
  const ingredients = recipeIngredientStacks(recipe);
  const outputQuantity = Math.max(1, recipe.output.quantity);
  let remainingBudget = Math.floor(
    ingredients.reduce((sum, stack) => sum + stack.quantity, 0) / outputQuantity / 2,
  );
  const refund: ItemStack[] = [];
  for (const stack of ingredients) {
    if (remainingBudget === 0) break;
    const proportionalQuantity = Math.ceil(stack.quantity / outputQuantity);
    const quantity = Math.min(proportionalQuantity, remainingBudget);
    if (quantity > 0) refund.push({ itemKind: stack.itemKind, quantity });
    remainingBudget -= quantity;
  }
  return refund;
}
