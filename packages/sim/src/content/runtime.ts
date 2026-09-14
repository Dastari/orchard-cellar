import type { ItemEconomyDefinition } from '../commerce.js';
import type { CropDefinition } from '../crops.js';
import type { EffectDefinition } from '../effects.js';
import type { HomesteadUpgradeDefinition } from '../homestead-upgrades.js';
import {
  TOOL_QUALITY_REQUIRED_SPECIALIZATION_RANKS,
  type ItemDefinition,
  type ToolSpecialization,
} from '../item-containers.js';
import { recipeMatches, type RecipeDefinition } from '../recipes.js';
import { recoverableArrowDirection } from '../ranged.js';
import { consumeCraftingRecipeDefinition, type ContainerSnapshot, type ConsumeRecipeResult, type ItemStack } from '../item-containers.js';
import type { PlayerStatisticDefinition } from '../player-statistics.js';
import { specializationRankTotal, type SkillNodeDefinition, type SkillTrack } from '../skill-trees.js';
import { TILE_SIZE_FIXED } from '../state.js';
import { instanceSpaceDefinitionFor, type InstanceSpaceRow, type SpaceDefinition } from '../spaces.js';
import type { WildlifeSpeciesDefinition, WildlifeSpawnPlan } from '../wildlife.js';
import type { ContentRegistry } from './registry.js';
import type { ItemPurchaseGrant, ItemSalePremium } from './definitions.js';
import type {
  LandmarkAutomationDefinition,
  SpaceLandmarkDefinition,
  SpacePortalContentDefinition,
  SpawnContentDefinition,
} from './world-definition.js';

export interface RuntimeDurabilityDefinition {
  readonly maximum: number;
  readonly repairItemKind: string;
  readonly repairCostBronze: number;
}

export interface RuntimeToolWearResult {
  readonly durability: number;
  readonly broken: boolean;
}

export interface RuntimeVigourDefinition {
  readonly costCenti: number;
  readonly minimumSwingTicks: number;
}

export interface RuntimeToolDefinition {
  readonly specialization?: ToolSpecialization;
  readonly tier: number;
  readonly reachTiles?: number;
  readonly swingTicks?: number;
  readonly avatarAction?: string;
}

export interface RuntimeRangedWeaponDefinition extends RuntimeToolDefinition {
  readonly ammunitionItemKind: string;
  readonly projectileKind: 'arrow';
  readonly avatarAction: string;
}

/** Active-revision parameters for trusted tool algorithms. These fields never
 * make an item usable by themselves; an authored lifecycle handler must first
 * emit the corresponding authority effect. */
export function runtimeToolDefinition(
  registry: ContentRegistry,
  itemKind: string,
): RuntimeToolDefinition | null {
  const item = registry.items.get(`item:${itemKind}`);
  if (item?.tool === undefined) return null;
  return Object.freeze({
    ...item.tool,
    ...(item.equip?.avatarAction === undefined ? {} : { avatarAction: item.equip.avatarAction }),
  });
}

/** A lifecycle-emitted mining action still needs an active authored resource
 * permission. Unknown or retired tools cannot inherit a bootstrap capability. */
export function runtimeToolCanMineResource(
  registry: ContentRegistry, itemKind: string, resourceKind: string,
): boolean {
  const item = registry.items.get(`item:${itemKind}`);
  return item !== undefined && item.retired !== true
    && item.tool?.mineableResources?.includes(resourceKind) === true;
}

/** Active-revision parameters for the trusted deterministic projectile engine.
 * The lifecycle registry remains the capability gate that can emit bowAction. */
export function runtimeRangedWeaponDefinition(
  registry: ContentRegistry,
  itemKind: string,
): RuntimeRangedWeaponDefinition | null {
  const item = registry.items.get(`item:${itemKind}`);
  if (item?.ranged === undefined || item.tool === undefined
    || item.equip?.avatarAction === undefined
    || !item.tags.includes('item.ranged_weapon')) return null;
  return Object.freeze({
    ...item.tool,
    ammunitionItemKind: item.ranged.ammunition.slice('item:'.length),
    projectileKind: item.ranged.projectile,
    avatarAction: item.equip.avatarAction,
  });
}

const PROJECTILE_AMMUNITION = new WeakMap<ContentRegistry, ReadonlyMap<string, ReadonlySet<string>>>();

function runtimeProjectileAmmunition(
  registry: ContentRegistry,
): ReadonlyMap<string, ReadonlySet<string>> {
  const cached = PROJECTILE_AMMUNITION.get(registry);
  if (cached !== undefined) return cached;
  const collected = new Map<string, Set<string>>();
  for (const item of registry.items.values()) {
    if (item.ranged === undefined) continue;
    const items = collected.get(item.ranged.projectile) ?? new Set<string>();
    items.add(item.ranged.ammunition.slice('item:'.length));
    collected.set(item.ranged.projectile, items);
  }
  PROJECTILE_AMMUNITION.set(registry, collected);
  return collected;
}

export function runtimeIsRecoverableProjectileItem(
  registry: ContentRegistry,
  itemKind: string,
  durability: number,
): boolean {
  return runtimeProjectileAmmunition(registry).get('arrow')?.has(itemKind) === true
    && recoverableArrowDirection(durability) !== null;
}

export function runtimeToolSpecialization(
  registry: ContentRegistry,
  itemKind: string,
): ToolSpecialization | null {
  return runtimeToolDefinition(registry, itemKind)?.specialization ?? null;
}

export function runtimeToolTier(registry: ContentRegistry, itemKind: string): number {
  return runtimeToolDefinition(registry, itemKind)?.tier ?? 0;
}

export function runtimeToolReachFixed(registry: ContentRegistry, itemKind: string): number | null {
  const tool = runtimeToolDefinition(registry, itemKind);
  return tool === null ? null : (tool.reachTiles ?? 1) * TILE_SIZE_FIXED;
}

export function runtimeItemAvatarAction(registry: ContentRegistry, itemKind: string): string | null {
  return registry.items.get(`item:${itemKind}`)?.equip?.avatarAction ?? null;
}

export function runtimeToolQualityRequiredRanks(registry: ContentRegistry, itemKind: string): number {
  const item = registry.items.get(`item:${itemKind}`);
  return item?.tool?.specialization === undefined
    ? 0
    : TOOL_QUALITY_REQUIRED_SPECIALIZATION_RANKS[item.quality];
}

export function runtimeCanUseToolWithSkillRanks(
  registry: ContentRegistry,
  itemKind: string,
  ranks: Readonly<Record<string, number>>,
): boolean {
  const specialization = runtimeToolSpecialization(registry, itemKind);
  return specialization === null
    || specializationRankTotal(ranks, specialization) >= runtimeToolQualityRequiredRanks(registry, itemKind);
}

export function runtimeItemDefinition(
  registry: ContentRegistry,
  itemKind: string,
): ItemDefinition | null {
  return registry.compiled.itemDefinitions[itemKind] ?? null;
}

export function runtimeMaxStack(registry: ContentRegistry, itemKind: string): number | null {
  return runtimeItemDefinition(registry, itemKind)?.maxStack ?? null;
}

export function runtimeItemEconomy(
  registry: ContentRegistry,
  itemKind: string,
): ItemEconomyDefinition | null {
  return registry.compiled.itemEconomy[itemKind] ?? null;
}

export interface RuntimeItemPurchaseRequirement {
  readonly skillNode: string;
  readonly minimumRank: number;
}

/** Content selects an eligibility rule; the reducer still owns the preflight
 * order and transaction. Missing policy deliberately grants no requirement. */
export function runtimeItemPurchaseRequirement(
  registry: ContentRegistry,
  itemKind: string,
): RuntimeItemPurchaseRequirement | null {
  return registry.items.get(`item:${itemKind}`)?.economy.purchaseRequirement ?? null;
}

export function runtimeItemPurchaseGrant(
  registry: ContentRegistry,
  itemKind: string,
): ItemPurchaseGrant | null {
  return registry.items.get(`item:${itemKind}`)?.economy.purchaseGrant ?? null;
}

export function runtimeItemSalePremium(
  registry: ContentRegistry,
  itemKind: string,
): ItemSalePremium | null {
  return registry.items.get(`item:${itemKind}`)?.economy.salePremium ?? null;
}

export function runtimeItemIsDroppable(registry: ContentRegistry, itemKind: string): boolean {
  const item = registry.items.get(`item:${itemKind}`);
  return item !== undefined && item.droppable !== false;
}

/** Missing capacity metadata is intentionally the base-capacity path even if
 * an item happens to use the back slot or carries a backpack-looking tag. */
export function runtimeItemInventoryCapacity(registry: ContentRegistry, itemKind: string): number | null {
  return registry.items.get(`item:${itemKind}`)?.equip?.inventoryCapacity ?? null;
}

export function runtimeFoodRestoreCenti(registry: ContentRegistry, itemKind: string): number | null {
  return registry.items.get(`item:${itemKind}`)?.food?.restoreCenti ?? null;
}

export function runtimeItemHasTag(registry: ContentRegistry, itemKind: string, tag: string): boolean {
  return registry.items.get(`item:${itemKind}`)?.tags.includes(tag) === true;
}

export function runtimeFuelSmelts(registry: ContentRegistry, itemKind: string): number {
  return registry.items.get(`item:${itemKind}`)?.fuel?.smelts ?? 0;
}

export function runtimeDurabilityDefinition(
  registry: ContentRegistry,
  itemKind: string,
): RuntimeDurabilityDefinition | null {
  const definition = registry.items.get(`item:${itemKind}`)?.durability;
  return definition === undefined ? null : Object.freeze({
    maximum: definition.max,
    repairItemKind: definition.repairMaterial.slice('item:'.length),
    repairCostBronze: definition.repairCost,
  });
}

/** Missing durability means newly created; explicit zero remains broken. */
export function runtimeNormalizeDurability(
  registry: ContentRegistry,
  itemKind: string,
  durability?: number,
): number {
  const definition = runtimeDurabilityDefinition(registry, itemKind);
  if (definition === null) return 0;
  if (durability === undefined) return definition.maximum;
  if (!Number.isSafeInteger(durability)) throw new Error('tool durability must be a safe integer');
  return Math.max(0, Math.min(definition.maximum, durability));
}

export function runtimeWearTool(
  registry: ContentRegistry,
  itemKind: string,
  durability: number,
  wear = 1,
): RuntimeToolWearResult {
  if (runtimeDurabilityDefinition(registry, itemKind) === null) {
    throw new Error(`item is not a durable tool: ${itemKind}`);
  }
  if (!Number.isSafeInteger(wear) || wear <= 0) throw new Error('tool wear must be a positive safe integer');
  const next = Math.max(0, runtimeNormalizeDurability(registry, itemKind, durability) - wear);
  return Object.freeze({ durability: next, broken: next === 0 });
}

export function runtimeVigourDefinition(
  registry: ContentRegistry,
  itemKind: string,
): RuntimeVigourDefinition | null {
  return registry.items.get(`item:${itemKind}`)?.vigour ?? null;
}

export function runtimeRecipeDefinition(
  registry: ContentRegistry,
  recipeId: string,
): RecipeDefinition | null {
  return registry.compiled.recipes[recipeId] ?? null;
}

export function runtimeMatchingRecipeId(
  registry: ContentRegistry, grid: ContainerSnapshot, resultIndex = grid.capacity,
): string | null {
  const slots = grid.slots.filter((_stack, index) => index !== resultIndex)
    .map((stack): ItemStack | null => stack ?? null);
  for (const recipe of Object.values(registry.compiled.recipes)) {
    if (recipeMatches(recipe, slots)) return recipe.id;
  }
  return null;
}

export function runtimeCraftingRecipeOutput(registry: ContentRegistry, recipeId: string): ItemStack | null {
  const recipe = runtimeRecipeDefinition(registry, recipeId);
  return recipe === null ? null : { ...recipe.output };
}

export function runtimeConsumeCraftingRecipe(
  registry: ContentRegistry, grid: ContainerSnapshot, recipeId: string, resultIndex = grid.capacity,
): ConsumeRecipeResult {
  const recipe = runtimeRecipeDefinition(registry, recipeId);
  return recipe === null
    ? { ok: false, code: 'recipe_not_found' }
    : consumeCraftingRecipeDefinition(grid, recipe, resultIndex);
}

export function runtimeRecipeIdsUnlockedByBook(registry: ContentRegistry, bookItemKind: string): readonly string[] {
  const definition = registry.items.get(`item:${bookItemKind}`);
  if (definition === undefined) return Object.freeze([]);
  return Object.freeze(definition.onUse.flatMap(({ effects }) => effects.flatMap((effect) => (
    'learnRecipes' in effect ? effect.learnRecipes : []
  )))
    .map((id) => id.slice(id.indexOf(':') + 1))
    .sort((left, right) => left.localeCompare(right)));
}

export function runtimeMerchantOffers(registry: ContentRegistry, shopId: string): readonly string[] {
  return registry.compiled.merchantOffers[shopId] ?? Object.freeze([]);
}

export function runtimeSmeltingOutput(registry: ContentRegistry, itemKind: string): string | null {
  return registry.compiled.smeltingRecipes[itemKind] ?? null;
}

export function runtimeCookingRecipe(registry: ContentRegistry, recipeId: string): {
  readonly id: string;
  readonly inputKind: string;
  readonly outputKind: string;
  readonly secondsPerItem: number;
  readonly farmingExperiencePerItem: number;
} | null {
  return registry.compiled.campfireCookingRecipes[recipeId] ?? null;
}

export function runtimeCropDefinition(registry: ContentRegistry, cropKind: string): CropDefinition | null {
  return registry.compiled.crops.find(({ kind }) => kind === cropKind) ?? null;
}

export function runtimeCropDefinitionForSeed(registry: ContentRegistry, itemKind: string): CropDefinition | null {
  return registry.compiled.crops.find(({ seedItemKind }) => seedItemKind === itemKind) ?? null;
}

export function runtimeCreatureDefinition(registry: ContentRegistry, species: string): WildlifeSpeciesDefinition | null {
  return registry.compiled.creatures[species] ?? null;
}

export function runtimeSpawnPlans(registry: ContentRegistry): readonly WildlifeSpawnPlan[] {
  return registry.compiled.spawns;
}

export interface RuntimeFixedSpawnPlan {
  readonly definitionId: string;
  readonly target: SpawnContentDefinition['target'];
  readonly spaceId: number;
  readonly habitat?: string;
  readonly protectedBy?: string;
  readonly positions: readonly {
    readonly runtimeId: bigint;
    readonly tileX: number;
    readonly tileY: number;
    readonly variant: number;
  }[];
}

/** Fixed landmark inhabitants are selected by authored strategy and references,
 * never by a canonical spawn id. Missing runtime ids fail closed. */
export function runtimeFixedSpawnPlans(registry: ContentRegistry): readonly RuntimeFixedSpawnPlan[] {
  return Object.freeze([...registry.spawns.values()].flatMap((spawn) => {
    if (spawn.retired === true || spawn.strategy !== 'fixed' || spawn.positions === undefined) return [];
    const spaceId = registry.spaces.get(spawn.space)?.spaceId;
    if (spaceId === undefined || spawn.positions.some(({ runtimeId }) => runtimeId === undefined)) return [];
    return [Object.freeze({
      definitionId: spawn.id,
      target: spawn.target,
      spaceId,
      ...(spawn.habitat === undefined ? {} : { habitat: spawn.habitat }),
      ...(spawn.protectedBy === undefined ? {} : { protectedBy: spawn.protectedBy }),
      positions: Object.freeze(spawn.positions.map((position) => Object.freeze({
        runtimeId: BigInt(position.runtimeId!),
        tileX: position.tileX,
        tileY: position.tileY,
        variant: position.variant ?? 0,
      }))),
    })];
  }));
}

export function runtimeSpaceLandmarks(
  registry: ContentRegistry,
  spaceId: number,
): readonly SpaceLandmarkDefinition[] {
  for (const space of registry.spaces.values()) {
    if (space.spaceId === spaceId) return space.landmarks ?? Object.freeze([]);
  }
  return Object.freeze([]);
}

export interface RuntimeLandmarkPlaceablePlan {
  readonly landmarkId: string;
  readonly runtimeId: bigint;
  readonly objectDefinitionId: string;
  readonly spaceId: number;
  readonly tileX: number;
  readonly tileY: number;
  readonly automation?: LandmarkAutomationDefinition;
}

export function runtimeLandmarkPlaceablePlans(
  registry: ContentRegistry,
): readonly RuntimeLandmarkPlaceablePlan[] {
  return Object.freeze([...registry.spaces.values()].flatMap((space) => (
    (space.landmarks ?? []).flatMap((landmark) => landmark.decorations.flatMap((rule) => (
      rule.kind !== 'point' || rule.placeable === undefined ? [] : [Object.freeze({
        landmarkId: landmark.id,
        runtimeId: BigInt(rule.placeable.runtimeId),
        objectDefinitionId: rule.placeable.object,
        spaceId: space.spaceId,
        tileX: rule.tileX,
        tileY: rule.tileY,
        ...(rule.placeable.automation === undefined ? {} : { automation: rule.placeable.automation }),
      })]
    )))
  )));
}

export interface RuntimeSpacePortalPlan extends Omit<SpacePortalContentDefinition, 'runtimeId' | 'fromSpace' | 'toSpace'> {
  readonly runtimeId: number;
  readonly fromSpaceId: number;
  readonly toSpaceId: number;
}

export function runtimeSpacePortalPlans(registry: ContentRegistry): readonly RuntimeSpacePortalPlan[] {
  return Object.freeze([...registry.spaces.values()].flatMap((space) => (
    (space.portals ?? []).flatMap((portal) => {
      const fromSpaceId = registry.spaces.get(portal.fromSpace)?.spaceId;
      const toSpaceId = registry.spaces.get(portal.toSpace)?.spaceId;
      if (fromSpaceId === undefined || toSpaceId === undefined) return [];
      return [Object.freeze({
        runtimeId: Number(portal.runtimeId), portalKind: portal.portalKind,
        fromSpaceId, fromTileX: portal.fromTileX, fromTileY: portal.fromTileY,
        toSpaceId, toTileX: portal.toTileX, toTileY: portal.toTileY,
      })];
    })
  )));
}

/** Authored static spaces come only from the supplied live revision. Dynamic
 * instance rows keep their persisted resolver semantics without falling back
 * to a bootstrap-pinned static definition. */
export function runtimeSpaceDefinition(
  registry: ContentRegistry, spaceId: number, instanceRow?: InstanceSpaceRow | null,
): SpaceDefinition | undefined {
  return registry.compiled.spaces.find((definition) => definition.spaceId === spaceId)
    ?? instanceSpaceDefinitionFor(spaceId, instanceRow);
}

export function runtimeSkillNodes(registry: ContentRegistry, track?: SkillTrack): readonly SkillNodeDefinition[] {
  return track === undefined ? registry.compiled.skillNodes
    : registry.compiled.skillNodes.filter((node) => node.track === track);
}

export function runtimeEffectDefinition(registry: ContentRegistry, effectId: string): EffectDefinition | null {
  return registry.compiled.effects[effectId] ?? null;
}

export function runtimeStatisticDefinition(registry: ContentRegistry, statisticKind: string): PlayerStatisticDefinition | null {
  return registry.compiled.statistics[statisticKind] ?? null;
}

export function runtimeUpgradeDefinition(registry: ContentRegistry, upgradeKind: string): HomesteadUpgradeDefinition | null {
  return registry.compiled.upgrades[upgradeKind] ?? null;
}
