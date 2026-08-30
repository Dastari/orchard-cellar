import { itemDefinition, type ItemStack } from './item-containers.js';
import { PLACEABLE_KINDS, placeableDefinition, type PlaceableKind } from './crafting.js';
import { recipeDefinition, recipeIngredientStacks } from './recipes.js';

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

const STATION_KINDS = new Set<PlaceableKind>([
  'workbench', 'anvil', 'campfire', 'cooking_fire', 'camp_cooking_fire',
  'furnace', 'barrel', 'fruit_press', 'fermentation_cask',
]);

const PREFAB_FOOTPRINTS: Partial<Record<PlaceableKind, HomesteadBuildDefinition['footprint']>> = {
  shed: { width: 4, height: 2 },
  greenhouse: { width: 6, height: 3 },
  barn: { width: 8, height: 3 },
  coop: { width: 5, height: 3 },
  silo: { width: 3, height: 2 },
};

/**
 * One shared registry drives the build palette, authority validation,
 * footprints and refunds. A craftable prop cannot silently fall out of build
 * mode when content is added to the ordinary placeable registry.
 */
export const HOMESTEAD_BUILD_DEFINITIONS = Object.fromEntries(
  PLACEABLE_KINDS.map((itemKind) => {
    const item = itemDefinition(itemKind);
    if (item === null || placeableDefinition(itemKind) === null) {
      throw new Error(`invalid_homestead_build_definition:${itemKind}`);
    }
    const recipe = recipeDefinition(itemKind);
    const footprint = PREFAB_FOOTPRINTS[itemKind];
    return [itemKind, {
      itemKind,
      displayName: item.displayName,
      layer: footprint === undefined ? STATION_KINDS.has(itemKind) ? 'station' : 'prop' : 'prefab',
      footprint: footprint ?? { width: 1, height: 1 },
      minimumSizeTier: footprint === undefined ? 0 : 1,
      ...(recipe === null ? {} : { recipeId: recipe.id }),
    } satisfies HomesteadBuildDefinition] as const;
  }),
) as Readonly<Record<PlaceableKind, HomesteadBuildDefinition>>;

export function homesteadBuildDefinition(itemKind: string): HomesteadBuildDefinition | null {
  return Object.prototype.hasOwnProperty.call(HOMESTEAD_BUILD_DEFINITIONS, itemKind)
    ? HOMESTEAD_BUILD_DEFINITIONS[itemKind as PlaceableKind]
    : null;
}

export interface HomesteadBuildTile {
  readonly tileX: number;
  readonly tileY: number;
}

/** Expands a bottom-centre anchor into stable occupied tiles. Even-width
 * footprints bias one tile left, matching the visual anchor convention. */
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
): readonly ItemStack[] {
  if (authorityTick - placedAtTick <= HOMESTEAD_BUILD_UNDO_TICKS) {
    return itemDefinition(itemKind) === null ? [] : [{ itemKind, quantity: 1 }];
  }
  const definition = homesteadBuildDefinition(itemKind);
  const recipe = definition?.recipeId === undefined ? null : recipeDefinition(definition.recipeId);
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
