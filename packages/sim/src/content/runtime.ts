import { BRONZE_PER_GOLD, type ItemEconomyDefinition } from '../commerce.js';
import type { CropDefinition } from '../crops.js';
import type { EffectDefinition } from '../effects.js';
import {
  TOOL_QUALITY_REQUIRED_SPECIALIZATION_RANKS,
  type ItemDefinition,
  type ToolSpecialization,
} from '../item-containers.js';
import { recipeMatches, type RecipeDefinition } from '../recipes.js';
import { recoverableArrowDirection } from '../ranged.js';
import { consumeCraftingRecipeDefinition, type ContainerSnapshot, type ConsumeRecipeResult, type ItemStack } from '../item-containers.js';
import type { PlayerStatisticDefinition } from '../player-statistics.js';
import { runtimeSpecializationRankTotal, type SkillNodeDefinition, type SkillTrack } from '../skill-trees.js';
import { FIXED_UNITS_PER_PIXEL, TILE_SIZE_FIXED } from '../state.js';
import { playerInteractionOrigin } from '../movement.js';
import { instanceSpaceDefinitionFor, type InstanceSpaceRow, type SpaceDefinition } from '../spaces.js';
import type { WildlifeSpawnPlan } from '../wildlife.js';
import { generateSurvivalLandmarkDecorations } from '../survival-world.js';
import type { ContentRegistry } from './registry.js';
import type { ResourceContentDefinition, ResourceDefinitionId } from './resource-definition.js';
import type { ItemContentDefinition, ItemPurchaseGrant, ItemSalePremium } from './definitions.js';
import type { ObjectContentDefinition } from './object-definition.js';
import type {
  LandmarkAutomationDefinition,
  CreatureContentDefinition,
  RuntimeCreaturePresentation,
  SpaceLandmarkDefinition,
  SpacePortalContentDefinition,
  SpaceSurfaceContentDefinition,
  SpawnContentDefinition,
  HomesteadUpgradeContentDefinition,
  HomesteadUpgradeMechanic,
} from './world-definition.js';
import {isHomesteadUpgradeContentDefinition} from './world-definition.js';

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
  readonly swing?: { readonly rangeFixed: number; readonly arcDegrees: number; readonly baseDamageCenti?: number };
  readonly avatarAction?: string;
}

export interface RuntimeRangedWeaponDefinition extends RuntimeToolDefinition {
  readonly ammunitionItemKind: string;
  readonly projectileKind: 'arrow';
  readonly avatarAction: string;
}

export interface RuntimeResourceReference {
  readonly kind: string;
  readonly definitionId?: string;
}

function activeItemContentDefinition(
  registry: Pick<ContentRegistry, 'items'>,
  itemKind: string,
): ItemContentDefinition | null {
  const definition = registry.items.get(`item:${itemKind}`);
  return definition === undefined || definition.retired === true ? null : definition;
}

const RESOURCE_BY_RUNTIME_KIND = new WeakMap<ContentRegistry, ReadonlyMap<string, ResourceContentDefinition>>();

function resourcesByRuntimeKind(registry: ContentRegistry): ReadonlyMap<string, ResourceContentDefinition> {
  const cached = RESOURCE_BY_RUNTIME_KIND.get(registry);
  if (cached !== undefined) return cached;
  const definitions = new Map<string, ResourceContentDefinition>();
  for (const definition of registry.resources.values()) {
    if (definition.retired !== true) definitions.set(definition.runtimeKind, definition);
  }
  RESOURCE_BY_RUNTIME_KIND.set(registry, definitions);
  return definitions;
}

/** Resolves new rows by stable definition identity and old rows by the
 * migration-safe `resource:${kind}` convention. A renamed definition may keep
 * its persisted runtimeKind without changing behavior or existing rows. */
export function runtimeResourceDefinition(
  registry: ContentRegistry,
  reference: RuntimeResourceReference | string,
): ResourceContentDefinition | null {
  const row = typeof reference === 'string' ? { kind: reference } : reference;
  const explicit = row.definitionId?.startsWith('resource:')
    ? registry.resources.get(row.definitionId)
    : undefined;
  const fallback = registry.resources.get(`resource:${row.kind}`)
    ?? resourcesByRuntimeKind(registry).get(row.kind);
  const definition = explicit ?? fallback;
  return definition?.retired === true ? null : definition ?? null;
}

export function runtimeResourceDefinitionId(
  registry: ContentRegistry,
  reference: RuntimeResourceReference,
): ResourceDefinitionId | null {
  return runtimeResourceDefinition(registry, reference)?.id ?? null;
}

export function runtimeResourceHasTag(
  registry: ContentRegistry,
  reference: RuntimeResourceReference | string,
  tag: string,
): boolean {
  return runtimeResourceDefinition(registry, reference)?.tags.includes(tag) === true;
}

export function runtimeResourceInteractionMode(
  registry: ContentRegistry,
  reference: RuntimeResourceReference | string,
): ResourceContentDefinition['interaction']['mode'] | null {
  return runtimeResourceDefinition(registry, reference)?.interaction.mode ?? null;
}

export interface RuntimeResourcePickupPresentation {
  readonly promptLabel: string;
  readonly feedbackLabel: string;
  readonly itemId: `item:${string}`;
}

/** Resolves gatherable UI language from the active resource -> loot -> item
 * graph. Conditional, nested, mixed, missing, or retired loot cannot safely
 * promise a particular pickup and therefore fails closed. */
export function runtimeResourcePickupPresentation(
  registry: ContentRegistry,
  reference: RuntimeResourceReference | string,
): RuntimeResourcePickupPresentation | null {
  const resource = runtimeResourceDefinition(registry, reference);
  if (resource?.interaction.mode !== 'gather') return null;
  const loot = registry.loots.get(resource.loot);
  if (loot === undefined || loot.retired === true || loot.groups.length === 0) return null;

  const itemIds = new Set<`item:${string}`>();
  for (const group of loot.groups) {
    if ((group.conditions?.length ?? 0) > 0 || group.entries.length === 0) return null;
    for (const entry of group.entries) {
      if ((entry.conditions?.length ?? 0) > 0 || !('item' in entry.target)) return null;
      itemIds.add(entry.target.item);
    }
  }
  if (itemIds.size !== 1) return null;
  const itemId = [...itemIds][0]!;
  const item = registry.items.get(itemId);
  if (item === undefined || item.retired === true) return null;
  return Object.freeze({
    promptLabel: resource.interaction.pickupLabel ?? resource.displayName,
    feedbackLabel: resource.interaction.pickupFeedbackLabel ?? item.displayName,
    itemId,
  });
}

export function runtimeResourceDiscoveryKinds(
  registry: ContentRegistry,
  discovery: Exclude<ResourceContentDefinition['discovery']['kind'], 'none'>,
): readonly string[] {
  return Object.freeze([...registry.resources.values()]
    .filter((definition) => definition.retired !== true && definition.discovery.kind === discovery)
    .map(({ runtimeKind }) => runtimeKind)
    .sort());
}

export function runtimeResourceToolAllowed(
  registry: ContentRegistry,
  reference: RuntimeResourceReference | string,
  tool: RuntimeToolDefinition | null | undefined,
): boolean {
  const requirement = runtimeResourceDefinition(registry, reference)?.interaction.tool;
  return requirement !== undefined && tool?.specialization === requirement.specialization
    && tool.tier >= requirement.minimumTier;
}

export function runtimeResourceInitialHealth(
  registry: ContentRegistry,
  reference: RuntimeResourceReference | string,
): number | null {
  return runtimeResourceDefinition(registry, reference)?.health.initial ?? null;
}

export interface RuntimeResourceObstacle {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

function resourceFootprintBounds(
  footprint: ResourceContentDefinition['target']['footprint'],
  tileX: number,
  tileY: number,
): RuntimeResourceObstacle {
  const anchorX = tileX * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2;
  const anchorY = (tileY + 1) * TILE_SIZE_FIXED;
  return {
    left: anchorX + footprint.left * FIXED_UNITS_PER_PIXEL,
    right: anchorX + footprint.right * FIXED_UNITS_PER_PIXEL,
    top: anchorY + footprint.top * FIXED_UNITS_PER_PIXEL,
    bottom: anchorY + footprint.bottom * FIXED_UNITS_PER_PIXEL,
  };
}

export function runtimeResourceObstacle(
  registry: ContentRegistry,
  reference: RuntimeResourceReference | string,
  tileX: number,
  tileY: number,
): RuntimeResourceObstacle | null {
  const definition = runtimeResourceDefinition(registry, reference);
  return definition === null ? null : resourceFootprintBounds(definition.collision.footprint, tileX, tileY);
}

export function runtimeResourceTargetVector(
  registry: ContentRegistry,
  reference: RuntimeResourceReference | string,
  playerX: number,
  playerY: number,
  tileX: number,
  tileY: number,
): { readonly x: number; readonly y: number } | null {
  const definition = runtimeResourceDefinition(registry, reference);
  if (definition === null) return null;
  const origin = playerInteractionOrigin({ x: playerX, y: playerY });
  const bounds = resourceFootprintBounds(definition.target.footprint, tileX, tileY);
  const targetX = Math.max(bounds.left, Math.min(bounds.right, origin.x));
  const targetY = Math.max(bounds.top, Math.min(bounds.bottom, origin.y));
  return { x: targetX - origin.x, y: targetY - origin.y };
}

/** Definition-owned weapon power. A missing or mismatched definition never
 * supplies damage; callers retain their normal tool/lifecycle authorization. */
export function runtimeWeaponBaseDamageCenti(
  registry: ContentRegistry,
  itemKind: string,
  attackKind: 'melee' | 'ranged',
): number | null {
  const item = registry.items.get(`item:${itemKind}`);
  return item?.retired !== true && item?.combat?.attackKind === attackKind
    ? item.combat.baseDamageCenti : null;
}

/** Active-revision parameters for trusted tool algorithms. These fields never
 * make an item usable by themselves; an authored lifecycle handler must first
 * emit the corresponding authority effect. */
export function runtimeToolDefinition(
  registry: ContentRegistry,
  itemKind: string,
): RuntimeToolDefinition | null {
  const item = registry.items.get(`item:${itemKind}`);
  if (item?.retired === true || item?.tool === undefined) return null;
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
  if (item?.retired === true || item?.ranged === undefined || item.tool === undefined
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
    if (item.retired === true || item.ranged === undefined) continue;
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
  return activeItemContentDefinition(registry, itemKind)?.equip?.avatarAction ?? null;
}

export function runtimeToolQualityRequiredRanks(registry: ContentRegistry, itemKind: string): number {
  const item = activeItemContentDefinition(registry, itemKind);
  return item?.tool?.specialization === undefined
    ? 0
    : TOOL_QUALITY_REQUIRED_SPECIALIZATION_RANKS[item.quality];
}

export function runtimeCanUseToolWithSkillRanks(
  registry: ContentRegistry,
  itemKind: string,
  ranks: Readonly<Record<string, number>>,
): boolean {
  const tool = runtimeToolDefinition(registry, itemKind);
  if (tool === null) return false;
  const specialization = tool.specialization ?? null;
  return specialization === null
    || runtimeSpecializationRankTotal(registry, ranks, specialization)
      >= runtimeToolQualityRequiredRanks(registry, itemKind);
}

export function runtimeItemDefinition(
  registry: ContentRegistry,
  itemKind: string,
): ItemDefinition | null {
  const definition = activeItemContentDefinition(registry, itemKind);
  return definition === null ? null : Object.freeze({
    displayName: definition.displayName,
    iconKey: definition.icon.asset,
    ...(definition.icon.animation === undefined ? {} : { iconAnimation: definition.icon.animation }),
    quality: definition.quality,
    maxStack: definition.maxStack,
    tags: definition.tags,
    ...(definition.modifiers === undefined ? {} : { modifiers: definition.modifiers }),
  });
}

export function runtimeMaxStack(registry: ContentRegistry, itemKind: string): number | null {
  return runtimeItemDefinition(registry, itemKind)?.maxStack ?? null;
}

export function runtimeItemEconomy(
  registry: ContentRegistry,
  itemKind: string,
): ItemEconomyDefinition | null {
  const definition = activeItemContentDefinition(registry, itemKind);
  return definition === null ? null : {
    buyPriceBronze: definition.economy.buy,
    sellPriceBronze: definition.economy.sell,
  };
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
  return activeItemContentDefinition(registry, itemKind)?.economy.purchaseRequirement ?? null;
}

export function runtimeItemPurchaseGrant(
  registry: ContentRegistry,
  itemKind: string,
): ItemPurchaseGrant | null {
  return activeItemContentDefinition(registry, itemKind)?.economy.purchaseGrant ?? null;
}

export function runtimeItemSalePremium(
  registry: ContentRegistry,
  itemKind: string,
): ItemSalePremium | null {
  return activeItemContentDefinition(registry, itemKind)?.economy.salePremium ?? null;
}

export function runtimeItemIsDroppable(registry: ContentRegistry, itemKind: string): boolean {
  const item = activeItemContentDefinition(registry, itemKind);
  return item !== null && item.droppable !== false;
}

/** Missing capacity metadata is intentionally the base-capacity path even if
 * an item happens to use the back slot or carries a backpack-looking tag. */
export function runtimeItemInventoryCapacity(registry: ContentRegistry, itemKind: string): number | null {
  return activeItemContentDefinition(registry, itemKind)?.equip?.inventoryCapacity ?? null;
}

export function runtimeFoodRestoreCenti(registry: ContentRegistry, itemKind: string): number | null {
  return activeItemContentDefinition(registry, itemKind)?.food?.restoreCenti ?? null;
}

export function runtimeItemHasTag(registry: ContentRegistry, itemKind: string, tag: string): boolean {
  return activeItemContentDefinition(registry, itemKind)?.tags.includes(tag) === true;
}

export const CELLAR_WALL_OUTPUT_ITEM_TAG = 'output.cellar_wall';
export const SOIL_TILL_OUTPUT_ITEM_TAG = 'output.soil_till';

/** Resolves a semantic ambient output without treating a definition ID as
 * gameplay policy. Missing, retired and multiply claimed roles fail closed. */
export function runtimeItemKindForUniqueTag(
  registry: Pick<ContentRegistry, 'items'>,
  tag: string,
): string | null {
  const candidates = [...registry.items.values()].filter(
    definition => definition.retired !== true && definition.tags.includes(tag),
  );
  return candidates.length === 1 ? candidates[0]!.id.slice('item:'.length) : null;
}

export function runtimeFuelSmelts(registry: ContentRegistry, itemKind: string): number {
  return activeItemContentDefinition(registry, itemKind)?.fuel?.smelts ?? 0;
}

export function runtimeDurabilityDefinition(
  registry: ContentRegistry,
  itemKind: string,
): RuntimeDurabilityDefinition | null {
  const definition = activeItemContentDefinition(registry, itemKind)?.durability;
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
  return activeItemContentDefinition(registry, itemKind)?.vigour ?? null;
}

export function runtimeRecipeDefinition(
  registry: ContentRegistry,
  recipeId: string,
): RecipeDefinition | null {
  if (registry.recipes.get(`recipe:${recipeId}`)?.retired === true) return null;
  return registry.compiled.recipes[recipeId] ?? null;
}

export function runtimeMatchingRecipeId(
  registry: ContentRegistry, grid: ContainerSnapshot, resultIndex = grid.capacity, preferredRecipeId?: string | null, knownRecipeIds?:readonly string[], recipeAvailable?:(recipe:RecipeDefinition)=>boolean,
): string | null {
  const slots = grid.slots.filter((_stack, index) => index !== resultIndex)
    .map((stack): ItemStack | null => stack ?? null);
  if (preferredRecipeId !== undefined && preferredRecipeId !== null) {
    const preferred = runtimeRecipeDefinition(registry, preferredRecipeId);
    if (preferred !== null && recipeMatches(preferred, slots)) return preferred.id;
  }
  let lockedMatch:string|null=null;
  for (const recipe of Object.values(registry.compiled.recipes)) {
    if (runtimeRecipeDefinition(registry, recipe.id) === null) continue;
    if (!recipeMatches(recipe, slots)) continue;
    if((knownRecipeIds!==undefined&&recipe.requiresKnowledge===true&&!knownRecipeIds.includes(recipe.id))
      ||recipeAvailable?.(recipe)===false){
      lockedMatch??=recipe.id;continue;
    }
    return recipe.id;
  }
  return lockedMatch;
}

/** Selection disambiguates shared ingredients; actual grid contents remain authoritative. */
export function runtimeRecipeMatchesGrid(registry: ContentRegistry, grid: ContainerSnapshot, recipeId: string): boolean {
  const recipe = runtimeRecipeDefinition(registry, recipeId);
  return recipe !== null && recipeMatches(recipe, grid.slots.slice(0, grid.capacity));
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
  const shop = registry.shops.get(`shop:${shopId}`);
  if (shop === undefined || shop.retired === true) return Object.freeze([]);
  return Object.freeze(shop.offers.flatMap(({ item }) => {
    const itemKind = item.slice('item:'.length);
    return activeItemContentDefinition(registry, itemKind) === null ? [] : [itemKind];
  }));
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

export function runtimeCreatureDefinition(registry: ContentRegistry, species: string): CreatureContentDefinition | null {
  return [...registry.creatures.values()].find((definition) => (
    definition.retired !== true && definition.species === species
  )) ?? null;
}

/** Resolves presentation only through the active creature definition. This is
 * species-keyed because wildlife rows persist that durable runtime key. */
export function runtimeCreaturePresentation(
  registry: ContentRegistry,
  species: string,
): RuntimeCreaturePresentation | null {
  const authored = runtimeCreatureDefinition(registry, species)?.presentation;
  if (authored === undefined) return null;
  const target = authored.target ?? [10, 18];
  return {
    renderer: authored.renderer ?? 'wildlife',
    assetFamily: authored.asset,
    animationProfile: authored.animation ?? 'quadruped',
    authoredSideFacing: authored.facing ?? 'left',
    shadow: authored.shadow ?? 'grounded',
    targetBounds: { halfWidth: target[0], height: target[1] },
    hiddenActivities: authored.hidden ?? [],
    staticActivities: authored.static ?? ['rest', 'inside_hive'],
    ...(authored.cycle === undefined ? {} : { visualCycle: authored.cycle }),
  };
}

export function runtimeSpawnPlans(registry: ContentRegistry): readonly WildlifeSpawnPlan[] {
  return [...registry.spawns.values()].filter((definition) => (
    definition.retired !== true && definition.strategy === 'packs'
    && definition.packCount !== undefined && definition.packSize !== undefined
    && definition.minimumPackSpacing !== undefined
  )).flatMap((definition) => {
    const creature = registry.creatures.get(definition.target);
    if (creature === undefined || creature.retired === true) return [];
    return [{
      species: creature.species as WildlifeSpawnPlan['species'],
      packCount: definition.packCount!, packSize: definition.packSize!,
      minimumPackSpacing: definition.minimumPackSpacing!,
    }];
  });
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
  readonly object: ObjectContentDefinition;
  readonly spaceId: number;
  readonly tileX: number;
  readonly tileY: number;
  readonly automation?: LandmarkAutomationDefinition;
}

export function runtimeLandmarkPlaceablePlans(
  registry: ContentRegistry,
): readonly RuntimeLandmarkPlaceablePlan[] {
  const spaces = [...registry.spaces.values()].filter((space) => space.retired !== true);
  const spaceCounts = new Map<number, number>();
  for (const space of spaces) spaceCounts.set(space.spaceId, (spaceCounts.get(space.spaceId) ?? 0) + 1);
  const candidates: RuntimeLandmarkPlaceablePlan[] = [];
  for (const space of spaces) {
    if (spaceCounts.get(space.spaceId) !== 1) continue;
    const landmarks = space.landmarks ?? [];
    const generated = generateSurvivalLandmarkDecorations(landmarks);
    for (const landmark of landmarks) for (const rule of landmark.decorations) {
      if (rule.kind !== 'point' || rule.placeable === undefined) continue;
      const object = registry.objects.get(rule.placeable.object);
      if (object === undefined || object.retired === true || object.components.sprite === undefined
        || (object.components.interactions?.length ?? 0) === 0) continue;
      let runtimeId: bigint;
      try { runtimeId = BigInt(rule.placeable.runtimeId); } catch { continue; }
      if (!generated.some((row) => BigInt(row.id) === runtimeId && row.groupId === landmark.id
        && row.kind === rule.decorationKind && row.tileX === rule.tileX && row.tileY === rule.tileY)) continue;
      candidates.push(Object.freeze({
        landmarkId: landmark.id,
        runtimeId,
        objectDefinitionId: object.id,
        object,
        spaceId: space.spaceId,
        tileX: rule.tileX,
        tileY: rule.tileY,
        ...(rule.placeable.automation === undefined ? {} : { automation: rule.placeable.automation }),
      }));
    }
  }
  const counts = new Map<bigint, number>();
  for (const plan of candidates) counts.set(plan.runtimeId, (counts.get(plan.runtimeId) ?? 0) + 1);
  return Object.freeze(candidates.filter((plan) => counts.get(plan.runtimeId) === 1));
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

export interface RuntimeSpaceSurfaceReference {
  readonly id: string | number | bigint;
  readonly kind: string;
  readonly tileX: number;
  readonly tileY: number;
  readonly capacity: number;
  readonly spaceId: number;
}

/** Resolves a persisted static surface only when its complete active authored
 * identity still matches. No kind-specific geometry is inferred for stale or
 * partially retired content. */
export function runtimeSpaceSurfaceDefinition(
  registry: ContentRegistry,
  row: RuntimeSpaceSurfaceReference,
): SpaceSurfaceContentDefinition | null {
  const spaces = [...registry.spaces.values()].filter((space) => (
    space.retired !== true && space.spaceId === row.spaceId
  ));
  if (spaces.length !== 1) return null;
  const surfaces = (spaces[0]!.surfaces ?? []).filter((surface) => surface.id === row.id.toString());
  if (surfaces.length !== 1) return null;
  const surface = surfaces[0]!;
  return surface.kind === row.kind
    && surface.tileX === row.tileX
    && surface.tileY === row.tileY
    && surface.capacity === row.capacity
    ? surface : null;
}

export function runtimeSpaceSurfaceObstacle(
  registry: ContentRegistry,
  row: RuntimeSpaceSurfaceReference,
): RuntimeResourceObstacle | null {
  const surface = runtimeSpaceSurfaceDefinition(registry, row);
  if (surface === null) return null;
  const [left, top, right, bottom] = surface.footprint;
  return {
    left: (surface.tileX + left) * TILE_SIZE_FIXED,
    top: (surface.tileY + top) * TILE_SIZE_FIXED,
    right: (surface.tileX + right + 1) * TILE_SIZE_FIXED - 1,
    bottom: (surface.tileY + bottom + 1) * TILE_SIZE_FIXED - 1,
  };
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

export function runtimeUpgradeDefinition(registry: ContentRegistry, upgradeKind: string): HomesteadUpgradeContentDefinition | null {
  const matches=[...registry.upgrades.values()].filter((definition):definition is HomesteadUpgradeContentDefinition=>
    definition.retired!==true&&isHomesteadUpgradeContentDefinition(definition)&&definition.mechanic[1]===upgradeKind);
  return matches.length===1?matches[0]!:null;
}

/** Resolves gameplay through one active semantic owner. Deliberately scanning
 * the active registry keeps manually assembled/in-flight ambiguous revisions
 * fail-closed even when pack validation has already rejected them. */
export function runtimeUpgradeDefinitionForMechanic(
  registry: ContentRegistry,
  mechanic: HomesteadUpgradeMechanic,
): HomesteadUpgradeContentDefinition | null {
  const matches = [...registry.upgrades.values()].filter((definition):definition is HomesteadUpgradeContentDefinition => (
    definition.retired !== true && isHomesteadUpgradeContentDefinition(definition)
      && definition.mechanic[0] === mechanic
  ));
  return matches.length === 1 ? matches[0]! : null;
}

export interface RuntimeHomesteadUpgradeRankRow {
  readonly upgradeKind: string;
  readonly rank: number;
}

/** Reads the durable legacy slug only after content has selected its unique
 * semantic owner. Missing/retired/ambiguous content and malformed or duplicate
 * rows are neutral instead of inheriting a compiled upgrade identity. */
export function runtimeHomesteadUpgradeRank(
  registry: ContentRegistry,
  rows: readonly RuntimeHomesteadUpgradeRankRow[],
  mechanic: HomesteadUpgradeMechanic,
): number {
  const definition = runtimeUpgradeDefinitionForMechanic(registry, mechanic);
  if (definition === null) return 0;
  const kind = definition.mechanic[1];
  const matches = rows.filter((row) => row.upgradeKind === kind);
  return matches.length === 1 && Number.isInteger(matches[0]!.rank)
    && matches[0]!.rank >= 0 && matches[0]!.rank <= definition.maximumRank
    ? matches[0]!.rank
    : 0;
}

export interface RuntimeHomesteadUpgradeQuote {
  readonly definition: HomesteadUpgradeContentDefinition;
  readonly currentRank: number;
  readonly nextRank: number;
  readonly costBronze: bigint;
}

/** Content owns upgrade identity, rank bounds, and price progression. The
 * reducer remains responsible for wallet, custody, and atomic persistence. */
export function runtimeHomesteadUpgradeQuote(
  registry: ContentRegistry,
  upgradeKind: string,
  currentRank: number,
): RuntimeHomesteadUpgradeQuote | null {
  const definition = runtimeUpgradeDefinition(registry, upgradeKind);
  if (definition === null || !Number.isInteger(currentRank)
    || currentRank < 0 || currentRank >= definition.maximumRank) return null;
  return {
    definition,
    currentRank,
    nextRank: currentRank + 1,
    costBronze: BigInt(Math.round(definition.baseCostGold * definition.costGrowth ** currentRank))
      * BRONZE_PER_GOLD,
  };
}
