import { AUTHORITY_HZ } from '../net-timing.js';
import type { Modifier } from '../modifiers.js';
import type { ItemContentDefinition, ProcessContentDefinition, RecipeContentDefinition, ShopContentDefinition } from './definitions.js';
import {
  compiledCreatureProjection, compiledCropProjection, compiledSpaceProjection,
  compiledSpawnProjection, compiledStatisticProjection, compiledUpgradeProjection,
  isHomesteadUpgradeContentDefinition,
  type CropContentDefinition, type CreatureContentDefinition, type SpawnContentDefinition,
  type SpaceContentDefinition, type SkillTreeContentDefinition, type EffectContentDefinition,
  type StatisticContentDefinition, type UpgradeContentDefinition,
} from './world-definition.js';

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null) return value;
  if (!Object.isFrozen(value)) Object.freeze(value);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return value;
}

export interface CompiledContentProjection {
  readonly itemDefinitions: Readonly<Record<string, CompiledItemDefinition>>;
  readonly itemEconomy: Readonly<Record<string, { readonly buyPriceBronze: number | null; readonly sellPriceBronze: number }>>;
  readonly recipes: Readonly<Record<string, CompiledRecipeDefinition>>;
  readonly smeltingRecipes: Readonly<Record<string, string>>;
  readonly campfireCookingRecipes: Readonly<Record<string, {
    readonly id: string;
    readonly inputKind: string;
    readonly outputKind: string;
    readonly secondsPerItem: number;
    readonly farmingExperiencePerItem: number;
  }>>;
  readonly merchantOffers: Readonly<Record<string, readonly string[]>>;
  readonly crops: readonly ReturnType<typeof compiledCropProjection>[];
  readonly creatures: Readonly<Record<string, ReturnType<typeof compiledCreatureProjection>>>;
  readonly spawns: readonly ReturnType<typeof compiledSpawnProjection>[];
  readonly spaces: readonly ReturnType<typeof compiledSpaceProjection>[];
  readonly skillNodes: SkillTreeContentDefinition['nodes'];
  readonly effects: Readonly<Record<string, CompiledEffectDefinition>>;
  readonly statistics: Readonly<Record<string, ReturnType<typeof compiledStatisticProjection>>>;
  readonly upgrades: Readonly<Record<string, ReturnType<typeof compiledUpgradeProjection>>>;
}

export interface CompiledItemDefinition {
  readonly displayName: string;
  readonly iconKey: string;
  readonly iconAnimation?: string;
  readonly quality: ItemContentDefinition['quality'];
  readonly maxStack: number;
  readonly tags: readonly string[];
  readonly modifiers?: readonly Modifier[];
}

type CraftingStation = 'workbench' | 'furnace' | 'anvil' | 'campfire';

interface CompiledRecipeBase {
  readonly id: string;
  readonly output: {
    readonly itemKind: string;
    readonly quantity: number;
  };
  readonly station?: CraftingStation;
  readonly requiresKnowledge?: boolean;
}

export type CompiledRecipeDefinition = (CompiledRecipeBase & {
  readonly kind: 'shaped';
  readonly pattern: ReadonlyArray<ReadonlyArray<string | null>>;
}) | (CompiledRecipeBase & {
  readonly kind: 'shapeless';
  readonly inputs: Readonly<Record<string, number>>;
});

export interface CompiledEffectDefinition {
  readonly name: string;
  readonly maxStacks: number;
  readonly durationTicks: number;
  readonly modifiers: readonly Modifier[];
  readonly family?: string;
  readonly scaleModifiersWithStacks?: boolean;
}

function slug(id: string): string {
  return id.slice(id.indexOf(':') + 1);
}

function legacyItem(definition: ItemContentDefinition): CompiledItemDefinition {
  return {
    displayName: definition.displayName,
    iconKey: definition.icon.asset,
    ...(definition.icon.animation === undefined ? {} : { iconAnimation: definition.icon.animation }),
    quality: definition.quality,
    maxStack: definition.maxStack,
    tags: [...definition.tags],
    ...(definition.modifiers === undefined ? {} : { modifiers: definition.modifiers.map((modifier) => ({ ...modifier })) }),
  };
}

function legacyRecipe(definition: RecipeContentDefinition): CompiledRecipeDefinition {
  const station = definition.stationRequirement?.objectTag.replace(/^station\./, '');
  const shared = {
    id: slug(definition.id),
    ...(definition.requiresKnowledge === undefined ? {} : { requiresKnowledge: definition.requiresKnowledge }),
    output: { itemKind: slug(definition.output.item), quantity: definition.output.count },
    ...(station === undefined ? {} : { station: station as CraftingStation }),
  };
  return definition.recipeKind === 'shaped'
    ? {
      ...shared,
      kind: 'shaped',
      pattern: definition.pattern.map((row) => row.map((item) => item === null ? null : slug(item))),
    }
    : {
      ...shared,
      kind: 'shapeless',
      inputs: Object.fromEntries(definition.inputs.map(({ item, count }) => [slug(item), count])),
    };
}

export function compiledProjection(
  items: readonly ItemContentDefinition[],
  recipes: readonly RecipeContentDefinition[],
  processes: readonly ProcessContentDefinition[],
  shops: readonly ShopContentDefinition[],
  crops: readonly CropContentDefinition[],
  creatures: readonly CreatureContentDefinition[],
  spawns: readonly SpawnContentDefinition[],
  spaces: readonly SpaceContentDefinition[],
  skillTrees: readonly SkillTreeContentDefinition[],
  effects: readonly EffectContentDefinition[],
  statistics: readonly StatisticContentDefinition[],
  upgrades: readonly UpgradeContentDefinition[],
): CompiledContentProjection {
  const itemDefinitions = Object.fromEntries(items.map((definition) => [slug(definition.id), legacyItem(definition)]));
  const itemEconomy = Object.fromEntries(items.map((definition) => [slug(definition.id), {
    buyPriceBronze: definition.economy.buy,
    sellPriceBronze: definition.economy.sell,
  }]));
  const compiledRecipes = Object.fromEntries(recipes.map((definition) => [slug(definition.id), legacyRecipe(definition)]));
  const smeltingRecipes = Object.fromEntries(processes
    .filter((definition) => definition.adapter === 'smelting')
    .map((definition) => [slug(definition.input.item), slug(definition.outputs[0]!.item)]));
  const campfireCookingRecipes = Object.fromEntries(processes
    .filter((definition) => definition.adapter === 'campfire_cooking')
    .map((definition) => [slug(definition.id), {
      id: slug(definition.id),
      inputKind: slug(definition.input.item),
      outputKind: slug(definition.outputs[0]!.item),
      secondsPerItem: definition.ticksPerUnit / AUTHORITY_HZ,
      farmingExperiencePerItem: definition.experience?.amount ?? 0,
    }]));
  const merchantOffers = Object.fromEntries(shops.map((definition) => [
    slug(definition.id),
    definition.offers.map(({ item }) => slug(item)),
  ]));
  return deepFreeze({
    itemDefinitions,
    itemEconomy,
    recipes: compiledRecipes,
    smeltingRecipes,
    campfireCookingRecipes,
    merchantOffers,
    crops: [...crops].sort((left, right) => (
      (left.sourceSheetOrder ?? Number.MAX_SAFE_INTEGER)
        - (right.sourceSheetOrder ?? Number.MAX_SAFE_INTEGER)
      || left.id.localeCompare(right.id)
    )).map(compiledCropProjection),
    creatures: Object.fromEntries(creatures.filter((definition) => definition.retired !== true)
      .map((definition) => [definition.species, compiledCreatureProjection(definition)])),
    // Fixed and population spawns are consumed by active-registry authority
    // helpers. This compatibility projection is only the procedural wildlife
    // pack input used by the seeded island generator.
    spawns: spawns.filter((definition) => definition.strategy === 'packs').map(compiledSpawnProjection),
    spaces: spaces.map(compiledSpaceProjection),
    skillNodes: skillTrees.filter((tree) => tree.retired !== true).flatMap(({ nodes }) => nodes),
    effects: Object.fromEntries(effects.filter((definition) => definition.retired !== true)
      .map((definition) => [slug(definition.id), {
      name: definition.name, maxStacks: definition.maxStacks, durationTicks: definition.durationTicks,
      modifiers: definition.modifiers, ...(definition.family === undefined ? {} : { family: definition.family }),
      ...(definition.scaleModifiersWithStacks === undefined ? {} : { scaleModifiersWithStacks: definition.scaleModifiersWithStacks }),
    }])),
    statistics: Object.fromEntries(statistics.filter((definition) => definition.retired !== true)
      .map((definition) => [slug(definition.id), compiledStatisticProjection(definition)])),
    upgrades: Object.fromEntries(upgrades.filter((definition) => definition.retired !== true)
      .filter(isHomesteadUpgradeContentDefinition)
      .map((definition) => [definition.mechanic[1], compiledUpgradeProjection(definition)])),
  });
}
