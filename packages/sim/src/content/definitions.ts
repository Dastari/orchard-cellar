import { CONTENT_DEFINITION_ID_PATTERN as ID_PATTERN } from './definition-id.js';
export { definitionSlug } from './definition-id.js';
import type { Modifier } from '../modifiers.js';
import {
  parseInteractionDefinition,
  parseObjectDefinition,
  type ObjectContentDefinition,
  type ObjectDefinitionId,
} from './object-definition.js';
import {
  parseFrameDefinition,
  type FrameContentDefinition,
  type FrameDefinitionId,
} from './frame-definition.js';
import type {
  LootCondition,
  LootContentDefinition,
  LootDefinitionId,
  LootEntryDefinition,
  LootScalar,
} from './loot-definition.js';
import {
  parseDialogueDefinition,
  parseNpcDefinition,
  parseQuestDefinition,
  type DialogueContentDefinition,
  type DialogueDefinitionId,
  type NpcContentDefinition,
  type NpcDefinitionId,
  type QuestContentDefinition,
  type QuestDefinitionId,
} from './npc-definition.js';
import type {
  BalanceContentDefinition,
  BalanceDefinitionId,
  BalanceUnit,
  CharacterCombatBalanceTuple,
  ResidenceConstructionBalanceTuple,
  SupportCapCapability,
  WorldPolicyBalanceTuple,
} from './balance-definition.js';
import {
  parseBalanceGroupDefinition,
  parseCreatureDefinition,
  parseCropDefinition,
  parseEffectContentDefinition,
  parseSkillTreeDefinition,
  parseSpaceContentDefinition,
  parseSpawnDefinition,
  parseStatisticDefinition,
  parseUpgradeDefinition,
  type BalanceGroupContentDefinition,
  type BalanceGroupDefinitionId,
  type CreatureContentDefinition,
  type CreatureDefinitionId,
  type CropContentDefinition,
  type CropDefinitionId,
  type EffectContentDefinition,
  type EffectContentDefinitionId,
  type SkillTreeContentDefinition,
  type SkillTreeDefinitionId,
  type SpaceContentDefinition,
  type SpaceContentDefinitionId,
  type SpawnContentDefinition,
  type SpawnDefinitionId,
  type StatisticContentDefinition,
  type StatisticDefinitionId,
  type UpgradeContentDefinition,
  type UpgradeDefinitionId,
} from './world-definition.js';
import type { InteractionDefinition } from '../behaviour/handler.js';
import {
  parseResourceDefinition,
  type ResourceContentDefinition,
  type ResourceDefinitionId,
} from './resource-definition.js';
import {
  parseLoadoutDefinition,
  type LoadoutContentDefinition,
  type LoadoutDefinitionId,
} from './loadout-definition.js';
import {
  parseEncounterDefinition,
  parseEnemyDefinition,
  type EncounterContentDefinition,
  type EncounterDefinitionId,
  type EnemyContentDefinition,
  type EnemyDefinitionId,
} from './outdoor-encounter-definition.js';

import { CONTENT_SCHEMA_VERSION, ContentParseError, type ContentParseErrorCode } from './parse-contract.js';
export { CONTENT_SCHEMA_VERSION, ContentParseError, type ContentParseErrorCode } from './parse-contract.js';

export const SUPPORTED_CONTENT_KINDS = [
  'item', 'recipe', 'process', 'shop', 'tileset', 'object', 'frame', 'loot',
  'npc', 'dialogue', 'quest', 'balance',
  'crop', 'creature', 'spawn', 'space', 'skill_tree', 'effect', 'statistic',
  'upgrade', 'balance_group', 'resource',
  'loadout', 'enemy', 'encounter',
] as const;
export type SupportedContentKind = typeof SUPPORTED_CONTENT_KINDS[number];

export type ItemDefinitionId = `item:${string}`;
export type RecipeDefinitionId = `recipe:${string}`;
export type ProcessDefinitionId = `process:${string}`;
export type ShopDefinitionId = `shop:${string}`;
export type TilesetDefinitionId = `tileset:${string}`;
export type ContentDefinitionId =
  | ItemDefinitionId
  | RecipeDefinitionId
  | ProcessDefinitionId
  | ShopDefinitionId
  | TilesetDefinitionId
  | ObjectDefinitionId
  | FrameDefinitionId
  | LootDefinitionId
  | NpcDefinitionId
  | DialogueDefinitionId
  | QuestDefinitionId
  | BalanceDefinitionId
  | CropDefinitionId
  | CreatureDefinitionId
  | SpawnDefinitionId
  | SpaceContentDefinitionId
  | SkillTreeDefinitionId
  | EffectContentDefinitionId
  | StatisticDefinitionId
  | UpgradeDefinitionId
  | BalanceGroupDefinitionId
  | ResourceDefinitionId
  | LoadoutDefinitionId
  | EnemyDefinitionId
  | EncounterDefinitionId;

export interface ContentDefinitionRow {
  readonly id: string;
  readonly kind: string;
  readonly slug?: string;
  /** SpaceTimeDB stores the payload as JSON text. Tests and editor drafts may
   * pass an already-decoded value through the same parser. */
  readonly json: string | unknown;
}

interface DefinitionBase<K extends SupportedContentKind, I extends ContentDefinitionId> {
  readonly id: I;
  readonly kind: K;
  readonly schemaVersion: typeof CONTENT_SCHEMA_VERSION;
  readonly retired?: boolean;
  readonly replacement?: I;
}

export type ContentItemQuality = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
export type ContentToolSpecialization = 'farming' | 'mining' | 'fishing' | 'woodcutting';
export type ItemPurchaseGrant = 'homestead_claim';
export type ItemSalePremium = 'estate_vintage';

export interface ItemContentDefinition extends DefinitionBase<'item', ItemDefinitionId> {
  readonly displayName: string;
  readonly icon: {
    readonly asset: string;
    readonly animation?: string;
  };
  readonly quality: ContentItemQuality;
  readonly maxStack: number;
  readonly tags: readonly string[];
  readonly modifiers?: readonly Modifier[];
  readonly combat?: { readonly attackKind: 'melee' | 'ranged'; readonly baseDamageCenti: number };
  readonly economy: {
    readonly buy: number | null;
    readonly sell: number;
    /** Optional purchase eligibility remains an authority-side preflight. */
    readonly purchaseRequirement?: {
      readonly skillNode: string;
      readonly minimumRank: number;
    };
    /** Selects a bounded engine-owned durable grant; it does not write rows by itself. */
    readonly purchaseGrant?: ItemPurchaseGrant;
    /** Selects a bounded engine-owned sale calculation; base valuation remains generic. */
    readonly salePremium?: ItemSalePremium;
  };
  /** Omitted means ordinary world dropping is allowed. */
  readonly droppable?: boolean;
  readonly durability?: {
    readonly max: number;
    readonly repairMaterial: ItemDefinitionId;
    readonly repairCost: number;
  };
  readonly vigour?: {
    readonly costCenti: number;
    readonly minimumSwingTicks: number;
  };
  readonly food?: {
    readonly restoreCenti: number;
    readonly cookedFrom?: ItemDefinitionId;
  };
  readonly fuel?: {
    readonly smelts: number;
  };
  readonly tool?: {
    readonly specialization?: ContentToolSpecialization;
    readonly tier: number;
    readonly reachTiles?: number;
    readonly swingTicks?: number;
    /** Reviewed resource adapters this tool may mine; absence grants none. */
    readonly mineableResources?: readonly string[];
  };
  /** Parameters for the trusted ranged-projectile engine. Presence never
   * grants use; an authored lifecycle must emit a bowAction first. */
  readonly ranged?: {
    readonly ammunition: ItemDefinitionId;
    readonly projectile: 'arrow';
  };
  readonly light?: {
    readonly color: readonly [number, number, number];
    readonly radiusTiles: number;
    readonly profile: 'steady' | 'flicker';
    readonly offsetY?: number;
  };
  readonly equip?: {
    readonly slot: string;
    /** One fixed +1 node rank; rarity supplies bounded over-cap permission. */
    readonly skillNode?: string;
    readonly avatarAction?: string;
    /** Presentation-only sprite asset for the generic action animation. */
    readonly avatarActionAsset?: string;
    /** Accessible carried slots while this definition is equipped in `slot`. */
    readonly inventoryCapacity?: number;
  };
  /** Universal selected-item lifecycle surface. An empty list means the item
   * has no direct use action; non-empty actions are compiled into the same
   * handler ABI as object interactions. */
  readonly onUse: readonly InteractionDefinition[];
}

export interface ItemQuantity {
  readonly item: ItemDefinitionId;
  readonly count: number;
}

interface RecipeContentDefinitionBase extends DefinitionBase<'recipe', RecipeDefinitionId> {
  /** Opt-in progression gate; ordinary manual recipes remain knowledge-free. */
  readonly requiresKnowledge?: boolean;
  readonly output: ItemQuantity;
  readonly skillRequirement?: { readonly skillNode: string; readonly minimumRank: number };
  readonly stationRequirement?: {
    readonly objectTag: string;
  };
  readonly unlockHint?: {
    readonly book: ItemDefinitionId;
  };
}

export interface ShapedRecipeContentDefinition extends RecipeContentDefinitionBase {
  readonly recipeKind: 'shaped';
  readonly pattern: ReadonlyArray<ReadonlyArray<ItemDefinitionId | null>>;
}

export interface ShapelessRecipeContentDefinition extends RecipeContentDefinitionBase {
  readonly recipeKind: 'shapeless';
  readonly inputs: readonly ItemQuantity[];
}

export type RecipeContentDefinition =
  | ShapedRecipeContentDefinition
  | ShapelessRecipeContentDefinition;

export interface ProcessContentDefinition extends DefinitionBase<'process', ProcessDefinitionId> {
  /** Historical player job progression; independent of current process outputs and timing. */
  readonly legacyJob?: { readonly recipeId: string; readonly farmingExperiencePerItem: number };
  readonly stationTag: string;
  readonly input: ItemQuantity;
  readonly outputs: readonly ItemQuantity[];
  readonly ticksPerUnit: number;
  readonly fuelPolicy?: {
    readonly acceptedItems: readonly ItemDefinitionId[];
    readonly unitsPerItem: number;
  };
  readonly experience?: {
    readonly skill: string;
    readonly amount: number;
  };
  readonly qualityHook?: string;
  readonly presentation?: {
    /** Optional transparent contents layer drawn over the processor body. */
    readonly contentsAnimation: string;
  };
  /** Identifies a temporary adapter while Phase 1 still projects definitions
   * back into the compiled processor tables. */
  readonly adapter?: 'smelting' | 'campfire_cooking' | 'press' | 'fermentation' | 'barrel';
}

export interface ShopOfferDefinition {
  readonly item: ItemDefinitionId;
  readonly stock?: number;
  readonly markupBasisPoints?: number;
}

export interface ShopContentDefinition extends DefinitionBase<'shop', ShopDefinitionId> {
  readonly offers: readonly ShopOfferDefinition[];
  readonly currency: {
    readonly kind: 'bronze';
  };
}

export const TILESET_ROLE_GROUPS = ['edge', 'inset', 'ledge_edge', 'ledge_inset'] as const;
export type TilesetRoleGroup = typeof TILESET_ROLE_GROUPS[number];
export const TILESET_TRANSITION_KINDS = ['ramp', 'stair', 'ladder'] as const;
export type TilesetTransitionKind = typeof TILESET_TRANSITION_KINDS[number];

export interface TilesetRoleFrameDefinition {
  readonly group: TilesetRoleGroup;
  readonly role: string;
  readonly assetId: string;
  readonly frame: number;
}

export interface TilesetUnavailableRoleGroup {
  readonly group: Exclude<TilesetRoleGroup, 'edge'>;
  readonly reason: string;
}

export interface TilesetFaceRowDefinition {
  readonly id: string;
  readonly assetId: string;
  readonly frames: readonly [left: number, middle: number, right: number];
  readonly blocksMovement: boolean;
  readonly blocksLight: boolean;
  readonly contributesHeight?: boolean;
  readonly middleVariants?: readonly number[];
}

export interface TilesetFaceProfileDefinition {
  readonly id: string;
  readonly rows: readonly TilesetFaceRowDefinition[];
  readonly repeatRows: readonly TilesetFaceRowDefinition[];
}

export interface AvailableTilesetTransitionDefinition {
  readonly available: true;
  readonly assetId: string;
  /** Variant ids are semantic (`crest`, `tread.0`, `base`, `top`, ...);
   * frame order is left-to-right and is therefore significant. */
  readonly variants: readonly {
    readonly id: string;
    readonly frames: readonly number[];
  }[];
}

export interface UnavailableTilesetTransitionDefinition {
  readonly available: false;
  readonly reason: string;
}

export type TilesetTransitionDefinition =
  | AvailableTilesetTransitionDefinition
  | UnavailableTilesetTransitionDefinition;

export interface TilesetContentDefinition extends DefinitionBase<'tileset', TilesetDefinitionId> {
  readonly engineVersion: number;
  /** Stable runtime terrain-family reference; v1 requires it to equal the id slug. */
  readonly familyId: string;
  readonly projectionStyle: 'raised' | 'interior';
  readonly baseDatum: number;
  readonly fixedPlane?: number;
  readonly projectionRowsPerLevel?: number;
  readonly faceClearanceRows: number;
  readonly surfaceFamily?: string;
  readonly roleFrames: readonly TilesetRoleFrameDefinition[];
  readonly unavailableRoleGroups: readonly TilesetUnavailableRoleGroup[];
  readonly faceProfiles: readonly TilesetFaceProfileDefinition[];
  readonly transitions: Readonly<Record<TilesetTransitionKind, TilesetTransitionDefinition>>;
  /** Complete stable asset manifest. Every role/face/transition asset must be listed. */
  readonly assetIds: readonly string[];
}

export type SupportedContentDefinition =
  | ItemContentDefinition
  | RecipeContentDefinition
  | ProcessContentDefinition
  | ShopContentDefinition
  | TilesetContentDefinition
  | ObjectContentDefinition
  | FrameContentDefinition
  | LootContentDefinition
  | NpcContentDefinition
  | DialogueContentDefinition
  | QuestContentDefinition
  | BalanceContentDefinition
  | CropContentDefinition
  | CreatureContentDefinition
  | SpawnContentDefinition
  | SpaceContentDefinition
  | SkillTreeContentDefinition
  | EffectContentDefinition
  | StatisticContentDefinition
  | UpgradeContentDefinition
  | BalanceGroupContentDefinition
  | ResourceContentDefinition
  | LoadoutContentDefinition
  | EnemyContentDefinition
  | EncounterContentDefinition;

/** Canonical durable/wire shape. Parser defaults remain enumerable in the
 * runtime model; only redundant default-equal source bytes are omitted. */
export function contentDefinitionTransportValue(
  definition: SupportedContentDefinition,
): unknown {
  if (definition.kind === 'item' && definition.quality === 'common') {
    const { quality, ...compact } = definition;
    void quality;
    return compact;
  }
  return definition;
}

export function serializeContentDefinitionForTransport(
  definition: SupportedContentDefinition,
): string {
  return JSON.stringify(contentDefinitionTransportValue(definition));
}


const ITEM_QUALITIES = new Set<string>(['common', 'uncommon', 'rare', 'epic', 'legendary']);
const TOOL_SPECIALIZATIONS = new Set<string>(['farming', 'mining', 'fishing', 'woodcutting']);

function fail(code: ContentParseErrorCode, path: string, message: string): never {
  throw new ContentParseError(code, path, message);
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail('invalid_type', path, 'expected an object');
  }
  return value as Record<string, unknown>;
}

function stringValue(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length === 0) fail('invalid_type', path, 'expected a non-empty string');
  return value;
}

function booleanValue(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') fail('invalid_type', path, 'expected a boolean');
  return value;
}

function integer(value: unknown, path: string, minimum = 0, maximum = Number.MAX_SAFE_INTEGER): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    fail('invalid_type', path, `expected a safe integer from ${minimum} to ${maximum}`);
  }
  return value as number;
}

function optionalInteger(value: unknown, path: string, minimum = 0): number | undefined {
  return value === undefined ? undefined : integer(value, path, minimum);
}

function array(value: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(value)) fail('invalid_type', path, 'expected an array');
  return value;
}

function strings(value: unknown, path: string): readonly string[] {
  return array(value, path).map((entry, index) => stringValue(entry, `${path}[${index}]`));
}

function decodedJson(json: string | unknown): unknown {
  if (typeof json !== 'string') return json;
  try {
    return JSON.parse(json) as unknown;
  } catch (error) {
    fail('invalid_json', '$', error instanceof Error ? error.message : 'invalid JSON');
  }
}

function definitionRecord(json: string | unknown, expectedKind: SupportedContentKind): Record<string, unknown> {
  const source = record(decodedJson(json), '$');
  const schemaVersion = integer(source.schemaVersion, '$.schemaVersion', 1);
  switch (schemaVersion) {
    case CONTENT_SCHEMA_VERSION:
      break;
    default:
      fail('unsupported_schema_version', '$.schemaVersion', `unsupported ${expectedKind} schema version ${schemaVersion}`);
  }
  const id = stringValue(source.id, '$.id');
  const match = ID_PATTERN.exec(id);
  if (match === null) fail('invalid_id', '$.id', `invalid definition id ${id}`);
  if (match[1] !== expectedKind) fail('kind_mismatch', '$.id', `expected ${expectedKind}: slug`);
  if (source.kind !== undefined && source.kind !== expectedKind) {
    fail('kind_mismatch', '$.kind', `expected ${expectedKind}`);
  }
  return source;
}

function base<K extends SupportedContentKind>(source: Record<string, unknown>, kind: K): {
  readonly id: `${K}:${string}`;
  readonly kind: K;
  readonly schemaVersion: typeof CONTENT_SCHEMA_VERSION;
  readonly retired?: boolean;
  readonly replacement?: `${K}:${string}`;
} {
  const id = stringValue(source.id, '$.id') as `${K}:${string}`;
  const retired = source.retired === undefined ? undefined : booleanValue(source.retired, '$.retired');
  const replacement = source.replacement === undefined
    ? undefined
    : definitionId(source.replacement, kind, '$.replacement') as `${K}:${string}`;
  return {
    id,
    kind,
    schemaVersion: CONTENT_SCHEMA_VERSION,
    ...(retired === undefined ? {} : { retired }),
    ...(replacement === undefined ? {} : { replacement }),
  };
}

function definitionId(value: unknown, kind: SupportedContentKind, path: string): ContentDefinitionId {
  const id = stringValue(value, path);
  const match = ID_PATTERN.exec(id);
  if (match === null) fail('invalid_id', path, `invalid definition id ${id}`);
  if (match[1] !== kind) fail('kind_mismatch', path, `expected ${kind}: slug`);
  return id as ContentDefinitionId;
}

function itemId(value: unknown, path: string): ItemDefinitionId {
  return definitionId(value, 'item', path) as ItemDefinitionId;
}

function itemQuantity(value: unknown, path: string): ItemQuantity {
  const source = record(value, path);
  return {
    item: itemId(source.item, `${path}.item`),
    count: integer(source.count, `${path}.count`, 1),
  };
}

function parseModifier(value: unknown, path: string): Modifier {
  const source = record(value, path);
  const target = stringValue(source.target, `${path}.target`) as Modifier['target'];
  const layer = stringValue(source.layer, `${path}.layer`) as Modifier['layer'];
  const modifierSource = stringValue(source.source, `${path}.source`) as Modifier['source'];
  return {
    id: stringValue(source.id, `${path}.id`),
    target,
    layer,
    value: integer(source.value, `${path}.value`, Number.MIN_SAFE_INTEGER),
    ...(source.family === undefined ? {} : { family: stringValue(source.family, `${path}.family`) }),
    source: modifierSource,
  };
}

export function parseItemDefinition(json: string | unknown): ItemContentDefinition {
  const source = definitionRecord(json, 'item');
  const icon = record(source.icon, '$.icon');
  const economy = record(source.economy, '$.economy');
  const quality = source.quality === undefined ? 'common' : stringValue(source.quality, '$.quality');
  if (!ITEM_QUALITIES.has(quality)) fail('invalid_type', '$.quality', `unknown item quality ${quality}`);

  const durability = source.durability === undefined ? undefined : record(source.durability, '$.durability');
  const vigour = source.vigour === undefined ? undefined : record(source.vigour, '$.vigour');
  const food = source.food === undefined ? undefined : record(source.food, '$.food');
  const fuel = source.fuel === undefined ? undefined : record(source.fuel, '$.fuel');
  const tool = source.tool === undefined ? undefined : record(source.tool, '$.tool');
  const ranged = source.ranged === undefined ? undefined : record(source.ranged, '$.ranged');
  const light = source.light === undefined ? undefined : record(source.light, '$.light');
  const equip = source.equip === undefined ? undefined : record(source.equip, '$.equip');
  const combat = source.combat === undefined ? undefined : record(source.combat, '$.combat');
  if (combat !== undefined) {
    if (combat.attackKind !== 'melee' && combat.attackKind !== 'ranged') fail('invalid_type', '$.combat.attackKind', 'unsupported weapon family');
    const damage = integer(combat.baseDamageCenti, '$.combat.baseDamageCenti', 1);
    if (damage > 100_000 || source.maxStack !== 1) fail('invalid_type', '$.combat', 'weapons require bounded damage and a single-item stack');
    const requiredTag = combat.attackKind === 'melee' ? 'item.melee_weapon' : 'item.ranged_weapon';
    if (!Array.isArray(source.tags) || !source.tags.includes(requiredTag)) fail('invalid_type', '$.combat', 'weapon tag does not match attack family');
  }
  if (equip?.skillNode !== undefined && (!['rare', 'epic', 'legendary'].includes(quality) || source.maxStack !== 1)) {
    fail('invalid_type', '$.equip.skillNode', 'skill gear must be rare or better and nonstackable');
  }
  const purchaseRequirement = economy.purchaseRequirement === undefined
    ? undefined
    : record(economy.purchaseRequirement, '$.economy.purchaseRequirement');
  const purchaseGrant = economy.purchaseGrant === undefined
    ? undefined
    : stringValue(economy.purchaseGrant, '$.economy.purchaseGrant');
  if (purchaseGrant !== undefined && purchaseGrant !== 'homestead_claim') {
    fail('invalid_type', '$.economy.purchaseGrant', `unknown purchase grant ${purchaseGrant}`);
  }
  const salePremium = economy.salePremium === undefined
    ? undefined
    : stringValue(economy.salePremium, '$.economy.salePremium');
  if (salePremium !== undefined && salePremium !== 'estate_vintage') {
    fail('invalid_type', '$.economy.salePremium', `unknown sale premium ${salePremium}`);
  }
  const inventoryCapacity = equip?.inventoryCapacity === undefined
    ? undefined
    : integer(equip.inventoryCapacity, '$.equip.inventoryCapacity', 1);
  if (inventoryCapacity !== undefined && inventoryCapacity > 20) {
    fail('invalid_type', '$.equip.inventoryCapacity', 'capacity exceeds the 20 allocated carried slots');
  }
  if (inventoryCapacity !== undefined && equip?.slot !== 'back') {
    fail('invalid_type', '$.equip.inventoryCapacity', 'inventory capacity requires the back equipment slot');
  }
  const onUse = source.onUse === undefined ? [] : array(source.onUse, '$.onUse')
    .map((entry, index) => parseInteractionDefinition({
      ...record(entry, `$.onUse[${index}]`),
      // Selected-item use is currently raised by the secondary/F input. The
      // authored lifecycle name remains stable if that key binding changes.
      verb: 'secondary',
    }, `$.onUse[${index}]`));
  const color = light === undefined ? undefined : array(light.color, '$.light.color');
  if (color !== undefined && color.length !== 3) fail('invalid_type', '$.light.color', 'expected exactly three channels');
  const specialization = tool?.specialization === undefined
    ? undefined
    : stringValue(tool.specialization, '$.tool.specialization');
  if (specialization !== undefined && !TOOL_SPECIALIZATIONS.has(specialization)) {
    fail('invalid_type', '$.tool.specialization', `unknown specialization ${specialization}`);
  }
  const projectile = ranged === undefined ? undefined : stringValue(ranged.projectile, '$.ranged.projectile');
  if (projectile !== undefined && projectile !== 'arrow') {
    fail('invalid_type', '$.ranged.projectile', `unknown projectile algorithm ${projectile}`);
  }
  const profile = light === undefined ? undefined : stringValue(light.profile, '$.light.profile');
  if (profile !== undefined && profile !== 'steady' && profile !== 'flicker') {
    fail('invalid_type', '$.light.profile', `unknown light profile ${profile}`);
  }

  const definition = {
    ...base(source, 'item'),
    displayName: stringValue(source.displayName, '$.displayName'),
    icon: {
      asset: stringValue(icon.asset, '$.icon.asset'),
      ...(icon.animation === undefined ? {} : { animation: stringValue(icon.animation, '$.icon.animation') }),
    },
    quality: quality as ContentItemQuality,
    maxStack: integer(source.maxStack, '$.maxStack', 1),
    tags: strings(source.tags, '$.tags'),
    ...(combat === undefined ? {} : { combat: { attackKind: combat.attackKind as 'melee' | 'ranged', baseDamageCenti: combat.baseDamageCenti as number } }),
    ...(source.modifiers === undefined ? {} : {
      modifiers: array(source.modifiers, '$.modifiers')
        .map((entry, index) => parseModifier(entry, `$.modifiers[${index}]`)),
    }),
    economy: {
      buy: economy.buy === null ? null : integer(economy.buy, '$.economy.buy'),
      sell: integer(economy.sell, '$.economy.sell'),
      ...(purchaseRequirement === undefined ? {} : { purchaseRequirement: {
        skillNode: stringValue(purchaseRequirement.skillNode, '$.economy.purchaseRequirement.skillNode'),
        minimumRank: integer(purchaseRequirement.minimumRank, '$.economy.purchaseRequirement.minimumRank', 1),
      } }),
      ...(purchaseGrant === undefined ? {} : { purchaseGrant: purchaseGrant as ItemPurchaseGrant }),
      ...(salePremium === undefined ? {} : { salePremium: salePremium as ItemSalePremium }),
    },
    ...(source.droppable === undefined ? {} : { droppable: booleanValue(source.droppable, '$.droppable') }),
    ...(durability === undefined ? {} : { durability: {
      max: integer(durability.max, '$.durability.max', 1),
      repairMaterial: itemId(durability.repairMaterial, '$.durability.repairMaterial'),
      repairCost: integer(durability.repairCost, '$.durability.repairCost', 1),
    } }),
    ...(vigour === undefined ? {} : { vigour: {
      costCenti: integer(vigour.costCenti, '$.vigour.costCenti'),
      minimumSwingTicks: integer(vigour.minimumSwingTicks, '$.vigour.minimumSwingTicks', 1),
    } }),
    ...(food === undefined ? {} : { food: {
      restoreCenti: integer(food.restoreCenti, '$.food.restoreCenti'),
      ...(food.cookedFrom === undefined ? {} : { cookedFrom: itemId(food.cookedFrom, '$.food.cookedFrom') }),
    } }),
    ...(fuel === undefined ? {} : { fuel: { smelts: integer(fuel.smelts, '$.fuel.smelts', 1) } }),
    ...(tool === undefined ? {} : { tool: {
      ...(specialization === undefined ? {} : { specialization: specialization as ContentToolSpecialization }),
      tier: integer(tool.tier, '$.tool.tier'),
      ...(optionalInteger(tool.reachTiles, '$.tool.reachTiles', 1) === undefined
        ? {} : { reachTiles: integer(tool.reachTiles, '$.tool.reachTiles', 1) }),
      ...(optionalInteger(tool.swingTicks, '$.tool.swingTicks', 1) === undefined
        ? {} : { swingTicks: integer(tool.swingTicks, '$.tool.swingTicks', 1) }),
      ...(tool.mineableResources === undefined ? {} : {
        mineableResources: strings(tool.mineableResources, '$.tool.mineableResources'),
      }),
    } }),
    ...(ranged === undefined ? {} : { ranged: {
      ammunition: itemId(ranged.ammunition, '$.ranged.ammunition'),
      projectile: projectile as 'arrow',
    } }),
    ...(light === undefined || color === undefined ? {} : { light: {
      color: color.map((channel, index) => integer(channel, `$.light.color[${index}]`)) as unknown as readonly [number, number, number],
      radiusTiles: integer(light.radiusTiles, '$.light.radiusTiles', 1),
      profile: profile as 'steady' | 'flicker',
      ...(light.offsetY === undefined ? {} : { offsetY: integer(light.offsetY, '$.light.offsetY', Number.MIN_SAFE_INTEGER) }),
    } }),
    ...(equip === undefined ? {} : { equip: {
      slot: stringValue(equip.slot, '$.equip.slot'),
      ...(equip.skillNode === undefined ? {} : { skillNode: stringValue(equip.skillNode, '$.equip.skillNode') }),
      ...(equip.avatarAction === undefined ? {} : { avatarAction: stringValue(equip.avatarAction, '$.equip.avatarAction') }),
      ...(equip.avatarActionAsset === undefined ? {} : { avatarActionAsset: stringValue(equip.avatarActionAsset, '$.equip.avatarActionAsset') }),
      ...(inventoryCapacity === undefined ? {} : { inventoryCapacity }),
    } }),
    ...(onUse.length === 0 ? {} : { onUse }),
  };
  if (onUse.length === 0) {
    Object.defineProperty(definition, 'onUse', {
      value: Object.freeze([]),
      enumerable: false,
    });
  }
  return Object.freeze(definition) as ItemContentDefinition;
}

export function parseRecipeDefinition(json: string | unknown): RecipeContentDefinition {
  const source = definitionRecord(json, 'recipe');
  const skillRequirement = source.skillRequirement === undefined ? undefined
    : record(source.skillRequirement, '$.skillRequirement');
  const recipeKind = stringValue(source.recipeKind, '$.recipeKind');
  const station = source.stationRequirement === undefined
    ? undefined
    : record(source.stationRequirement, '$.stationRequirement');
  const unlock = source.unlockHint === undefined ? undefined : record(source.unlockHint, '$.unlockHint');
  const shared = {
    ...base(source, 'recipe'),
    ...(source.requiresKnowledge === undefined ? {} : { requiresKnowledge: booleanValue(source.requiresKnowledge, '$.requiresKnowledge') }),
    output: itemQuantity(source.output, '$.output'),
    ...(skillRequirement === undefined ? {} : { skillRequirement: {
      skillNode: stringValue(skillRequirement.skillNode, '$.skillRequirement.skillNode'),
      minimumRank: integer(skillRequirement.minimumRank, '$.skillRequirement.minimumRank', 1),
    } }),
    ...(station === undefined ? {} : { stationRequirement: {
      objectTag: stringValue(station.objectTag, '$.stationRequirement.objectTag'),
    } }),
    ...(unlock === undefined ? {} : { unlockHint: {
      book: itemId(unlock.book, '$.unlockHint.book'),
    } }),
  };
  if (recipeKind === 'shaped') {
    const pattern = array(source.pattern, '$.pattern').map((row, y) => (
      array(row, `$.pattern[${y}]`).map((entry, x) => (
        entry === null ? null : itemId(entry, `$.pattern[${y}][${x}]`)
      ))
    ));
    if (pattern.length === 0 || pattern.every((row) => row.every((entry) => entry === null))) {
      fail('invalid_type', '$.pattern', 'shaped recipe must contain an item');
    }
    return Object.freeze({ ...shared, recipeKind, pattern });
  }
  if (recipeKind === 'shapeless') {
    const inputs = array(source.inputs, '$.inputs')
      .map((entry, index) => itemQuantity(entry, `$.inputs[${index}]`));
    if (inputs.length === 0) fail('invalid_type', '$.inputs', 'shapeless recipe needs at least one input');
    return Object.freeze({ ...shared, recipeKind, inputs });
  }
  return fail('invalid_type', '$.recipeKind', `unknown recipe kind ${recipeKind}`);
}

export function parseProcessDefinition(json: string | unknown): ProcessContentDefinition {
  const source = definitionRecord(json, 'process');
  const legacyJob = source.legacyJob === undefined ? undefined : record(source.legacyJob, '$.legacyJob');
  if (legacyJob !== undefined && (Object.keys(legacyJob).sort().join(',') !== 'farmingExperiencePerItem,recipeId'
    || typeof legacyJob.recipeId !== 'string' || !/^[a-z0-9]+(?:_[a-z0-9]+)*$/u.test(legacyJob.recipeId))) {
    fail('invalid_type', '$.legacyJob', 'expected exact historical recipe id and farming experience');
  }
  const fuel = source.fuelPolicy === undefined ? undefined : record(source.fuelPolicy, '$.fuelPolicy');
  const experience = source.experience === undefined ? undefined : record(source.experience, '$.experience');
  const presentation = source.presentation === undefined
    ? undefined : record(source.presentation, '$.presentation');
  const adapter = source.adapter === undefined ? undefined : stringValue(source.adapter, '$.adapter');
  if (adapter !== undefined && !['smelting', 'campfire_cooking', 'press', 'fermentation', 'barrel'].includes(adapter)) {
    fail('invalid_type', '$.adapter', `unknown process adapter ${adapter}`);
  }
  const outputs = array(source.outputs, '$.outputs')
    .map((entry, index) => itemQuantity(entry, `$.outputs[${index}]`));
  if (outputs.length === 0) fail('invalid_type', '$.outputs', 'process needs at least one output');
  return Object.freeze({
    ...base(source, 'process'),
    ...(legacyJob === undefined ? {} : { legacyJob: {
      recipeId: stringValue(legacyJob.recipeId, '$.legacyJob.recipeId'),
      farmingExperiencePerItem: integer(legacyJob.farmingExperiencePerItem, '$.legacyJob.farmingExperiencePerItem'),
    } }),
    stationTag: stringValue(source.stationTag, '$.stationTag'),
    input: itemQuantity(source.input, '$.input'),
    outputs,
    ticksPerUnit: integer(source.ticksPerUnit, '$.ticksPerUnit', 1),
    ...(fuel === undefined ? {} : { fuelPolicy: {
      acceptedItems: array(fuel.acceptedItems, '$.fuelPolicy.acceptedItems')
        .map((entry, index) => itemId(entry, `$.fuelPolicy.acceptedItems[${index}]`)),
      unitsPerItem: integer(fuel.unitsPerItem, '$.fuelPolicy.unitsPerItem', 1),
    } }),
    ...(experience === undefined ? {} : { experience: {
      skill: stringValue(experience.skill, '$.experience.skill'),
      amount: integer(experience.amount, '$.experience.amount', 1, 1_000_000),
    } }),
    ...(source.qualityHook === undefined ? {} : { qualityHook: stringValue(source.qualityHook, '$.qualityHook') }),
    ...(adapter === undefined ? {} : {
      adapter: adapter as Exclude<ProcessContentDefinition['adapter'], undefined>,
    }),
    ...(presentation === undefined ? {} : { presentation: {
      contentsAnimation: stableReference(
        presentation.contentsAnimation,
        '$.presentation.contentsAnimation',
      ),
    } }),
  });
}

export function parseShopDefinition(json: string | unknown): ShopContentDefinition {
  const source = definitionRecord(json, 'shop');
  const currency = record(source.currency, '$.currency');
  if (currency.kind !== 'bronze') fail('invalid_type', '$.currency.kind', 'only bronze is supported in schema v1');
  return Object.freeze({
    ...base(source, 'shop'),
    offers: array(source.offers, '$.offers').map((offer, index) => {
      const entry = record(offer, `$.offers[${index}]`);
      return {
        item: itemId(entry.item, `$.offers[${index}].item`),
        ...(entry.stock === undefined ? {} : { stock: integer(entry.stock, `$.offers[${index}].stock`) }),
        ...(entry.markupBasisPoints === undefined ? {} : {
          markupBasisPoints: integer(entry.markupBasisPoints, `$.offers[${index}].markupBasisPoints`),
        }),
      };
    }),
    currency: { kind: 'bronze' as const },
  });
}

export function parseBalanceDefinition(json: string | unknown): BalanceContentDefinition {
  const source = definitionRecord(json, 'balance');
  const group = stringValue(source.group, '$.group');
  if (!/^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9_]*)*$/u.test(group)) {
    fail('invalid_type', '$.group', `invalid balance group ${group}`);
  }
  const description = stringValue(source.description, '$.description');
  if (source.profile !== undefined) {
    const profile = stringValue(source.profile, '$.profile');
    if (profile !== 'character_combat' && profile !== 'world_policy' && profile !== 'residence_construction') {
      fail('invalid_type', '$.profile', `unknown balance profile ${profile}`);
    }
    const rawValues = array(source.values, '$.values');
    if (profile === 'residence_construction') {
      if (rawValues.length !== 12) {
        fail('invalid_type', '$.values', 'residence_construction profile requires 12 values');
      }
      const values = [
        integer(rawValues[0], '$.values[0]', 1, 65_535),
        itemId(rawValues[1], '$.values[1]'), itemId(rawValues[2], '$.values[2]'),
        itemId(rawValues[3], '$.values[3]'),
        ...rawValues.slice(4).map((value, index) => integer(value, `$.values[${index + 4}]`, 1, 8_192)),
      ] as unknown as ResidenceConstructionBalanceTuple;
      if (new Set(values.slice(1, 4)).size !== 3) {
        fail('invalid_type', '$.values', 'residence construction material items must be distinct');
      }
      return Object.freeze({
        ...base(source, 'balance'), group, description, profile, values,
      });
    }
    const values = rawValues.map((value, index) => (
      integer(value, `$.values[${index}]`)
    ));
    const expectedLength = profile === 'character_combat' ? 18 : 11;
    if (values.length !== expectedLength || values.some((value) => value <= 0)) {
      fail('invalid_type', '$.values', `${profile} profile requires ${expectedLength} positive integers`);
    }
    if (profile === 'world_policy') {
      const maximums = [100, 64, 10_000_000, 32_000, 1_024, 1_000_000,
        1_024, 1_024, 255, 255, 1_000_000] as const;
      if (values.some((value, index) => value > maximums[index]!)) {
        fail('invalid_type', '$.values', 'world policy value exceeds its supported bound');
      }
      if (values[5]! % values[4]! !== 0 || values[7]! > values[6]!) {
        fail('invalid_type', '$.values', 'world policy extent or generation radii are inconsistent');
      }
    }
    if (profile === 'character_combat' && (values[1]! > values[0]! || values[0]! > values[2]!)) {
      fail('invalid_type', '$.values', 'attribute minimum, base, and maximum are inconsistent');
    }
    return Object.freeze({
      ...base(source, 'balance'), group, description, profile,
      values: values as unknown as CharacterCombatBalanceTuple | WorldPolicyBalanceTuple,
    }) as BalanceContentDefinition;
  }
  const unit = stringValue(source.unit, '$.unit');
  if (unit !== 'count' && unit !== 'bronze' && unit !== 'tiles') {
    fail('invalid_type', '$.unit', `unknown balance unit ${unit}`);
  }
  const supportCap = source.supportCap === undefined
    ? undefined : stringValue(source.supportCap, '$.supportCap');
  if (supportCap !== undefined && ![
    'itemsPerMutation', 'mutationsPerHour', 'teleportDistanceTiles',
    'skillPointsPerMutation', 'statDeltaPerMutation', 'walletDeltaBronzePerMutation',
  ].includes(supportCap)) fail('invalid_type', '$.supportCap', `unknown support cap ${supportCap}`);
  return Object.freeze({
    ...base(source, 'balance'),
    group,
    value: integer(source.value, '$.value'),
    unit: unit as BalanceUnit,
    description,
    ...(supportCap === undefined ? {} : { supportCap: supportCap as SupportCapCapability }),
  });
}

const STABLE_REFERENCE_PATTERN = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;
const STABLE_VARIANT_PATTERN = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;

function stableReference(value: unknown, path: string): string {
  const reference = stringValue(value, path);
  if (!STABLE_REFERENCE_PATTERN.test(reference)) {
    fail('invalid_type', path, `invalid stable reference ${reference}`);
  }
  return reference;
}

function lootScalar(value: unknown, path: string): LootScalar {
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isSafeInteger(value)) return value;
  return fail('invalid_type', path, 'expected a string, boolean, or safe integer');
}

function lootContextKey(value: unknown, path: string): string {
  const key = stringValue(value, path);
  if (!/^[A-Za-z][A-Za-z0-9_.]*$/.test(key)) fail('invalid_type', path, `invalid loot context key ${key}`);
  return key;
}

function parseLootCondition(value: unknown, path: string): LootCondition {
  const source = record(value, path);
  const arms = ['context', 'toolTierAtLeast', 'skillRank', 'rareRoll']
    .filter((key) => source[key] !== undefined);
  if (arms.length !== 1) fail('invalid_type', path, 'expected exactly one loot condition');
  if (source.context !== undefined) {
    const condition = record(source.context, `${path}.context`);
    const operator = stringValue(condition.operator, `${path}.context.operator`);
    if (operator !== 'eq' && operator !== 'gte' && operator !== 'lte') {
      fail('invalid_type', `${path}.context.operator`, `unknown comparison ${operator}`);
    }
    return { context: {
      key: lootContextKey(condition.key, `${path}.context.key`),
      operator,
      value: lootScalar(condition.value, `${path}.context.value`),
    } };
  }
  if (source.toolTierAtLeast !== undefined) {
    return { toolTierAtLeast: integer(source.toolTierAtLeast, `${path}.toolTierAtLeast`) };
  }
  if (source.skillRank !== undefined) {
    const condition = record(source.skillRank, `${path}.skillRank`);
    return { skillRank: {
      skill: stableReference(condition.skill, `${path}.skillRank.skill`),
      minimum: integer(condition.minimum, `${path}.skillRank.minimum`),
    } };
  }
  const condition = record(source.rareRoll, `${path}.rareRoll`);
  const comparison = stringValue(condition.comparison, `${path}.rareRoll.comparison`);
  if (comparison !== 'lt' && comparison !== 'gte') {
    fail('invalid_type', `${path}.rareRoll.comparison`, `unknown comparison ${comparison}`);
  }
  return { rareRoll: {
    seedTag: stringValue(condition.seedTag, `${path}.rareRoll.seedTag`),
    comparison,
    threshold: integer(condition.threshold, `${path}.rareRoll.threshold`),
    outOf: integer(condition.outOf, `${path}.rareRoll.outOf`, 1),
    ...(condition.rankKey === undefined ? {} : {
      rankKey: stableReference(condition.rankKey, `${path}.rareRoll.rankKey`),
    }),
    ...(condition.perRank === undefined ? {} : {
      perRank: integer(condition.perRank, `${path}.rareRoll.perRank`, Number.MIN_SAFE_INTEGER),
    }),
  } };
}

function parseLootEntry(value: unknown, path: string): LootEntryDefinition {
  const source = record(value, path);
  const target = record(source.target, `${path}.target`);
  const hasItem = target.item !== undefined;
  const hasLoot = target.loot !== undefined;
  if (hasItem === hasLoot) fail('invalid_type', `${path}.target`, 'expected exactly one item or loot target');
  return {
    id: stableReference(source.id, `${path}.id`),
    weight: integer(source.weight, `${path}.weight`, 1),
    ...(source.priority === undefined ? {} : {
      priority: integer(source.priority, `${path}.priority`, Number.MIN_SAFE_INTEGER),
    }),
    ...(source.conditions === undefined ? {} : {
      conditions: array(source.conditions, `${path}.conditions`)
        .map((condition, index) => parseLootCondition(condition, `${path}.conditions[${index}]`)),
    }),
    ...(source.flags === undefined ? {} : { flags: strings(source.flags, `${path}.flags`) }),
    target: hasItem ? {
      item: itemId(target.item, `${path}.target.item`),
      min: integer(target.min, `${path}.target.min`, 1),
      max: integer(target.max, `${path}.target.max`, 1),
    } : {
      loot: definitionId(target.loot, 'loot', `${path}.target.loot`) as LootDefinitionId,
    },
  };
}

export function parseLootDefinition(json: string | unknown): LootContentDefinition {
  const source = definitionRecord(json, 'loot');
  const groups = array(source.groups, '$.groups').map((value, groupIndex) => {
    const path = `$.groups[${groupIndex}]`;
    const group = record(value, path);
    const entries = array(group.entries, `${path}.entries`)
      .map((entry, entryIndex) => parseLootEntry(entry, `${path}.entries[${entryIndex}]`));
    if (entries.length === 0) fail('invalid_type', `${path}.entries`, 'loot group needs at least one entry');
    return {
      id: stableReference(group.id, `${path}.id`),
      ...(group.rollTag === undefined ? {} : { rollTag: stringValue(group.rollTag, `${path}.rollTag`) }),
      ...(group.conditions === undefined ? {} : {
        conditions: array(group.conditions, `${path}.conditions`)
          .map((condition, index) => parseLootCondition(condition, `${path}.conditions[${index}]`)),
      }),
      entries,
    };
  });
  if (groups.length === 0) fail('invalid_type', '$.groups', 'loot definition needs at least one group');
  return Object.freeze({ ...base(source, 'loot'), groups });
}

function frameTuple(value: unknown, path: string): readonly [number, number, number] {
  const frames = array(value, path);
  if (frames.length !== 3) fail('invalid_type', path, 'expected left, middle, and right frames');
  return frames.map((frame, index) => integer(frame, `${path}[${index}]`)) as unknown as readonly [number, number, number];
}

function parseTilesetFaceRow(value: unknown, path: string): TilesetFaceRowDefinition {
  const source = record(value, path);
  return {
    id: stableReference(source.id, `${path}.id`),
    assetId: stableReference(source.assetId, `${path}.assetId`),
    frames: frameTuple(source.frames, `${path}.frames`),
    blocksMovement: booleanValue(source.blocksMovement, `${path}.blocksMovement`),
    blocksLight: booleanValue(source.blocksLight, `${path}.blocksLight`),
    ...(source.contributesHeight === undefined ? {} : {
      contributesHeight: booleanValue(source.contributesHeight, `${path}.contributesHeight`),
    }),
    ...(source.middleVariants === undefined ? {} : {
      middleVariants: array(source.middleVariants, `${path}.middleVariants`)
        .map((frame, index) => integer(frame, `${path}.middleVariants[${index}]`)),
    }),
  };
}

function parseTilesetTransition(value: unknown, path: string): TilesetTransitionDefinition {
  const source = record(value, path);
  const available = booleanValue(source.available, `${path}.available`);
  if (!available) {
    return { available: false, reason: stringValue(source.reason, `${path}.reason`) };
  }
  return {
    available: true,
    assetId: stableReference(source.assetId, `${path}.assetId`),
    variants: array(source.variants, `${path}.variants`).map((variant, index) => {
      const variantPath = `${path}.variants[${index}]`;
      const variantSource = record(variant, variantPath);
      const id = stringValue(variantSource.id, `${variantPath}.id`);
      if (!STABLE_VARIANT_PATTERN.test(id)) fail('invalid_type', `${variantPath}.id`, `invalid variant id ${id}`);
      return {
        id,
        frames: array(variantSource.frames, `${variantPath}.frames`)
          .map((frame, frameIndex) => integer(frame, `${variantPath}.frames[${frameIndex}]`)),
      };
    }).sort((left, right) => left.id.localeCompare(right.id)),
  };
}

export function parseTilesetDefinition(json: string | unknown): TilesetContentDefinition {
  const source = definitionRecord(json, 'tileset');
  const projectionStyle = stringValue(source.projectionStyle, '$.projectionStyle');
  if (projectionStyle !== 'raised' && projectionStyle !== 'interior') {
    fail('invalid_type', '$.projectionStyle', `unknown projection style ${projectionStyle}`);
  }
  const transitions = record(source.transitions, '$.transitions');
  const roleFrames = array(source.roleFrames, '$.roleFrames').map((entry, index) => {
    const path = `$.roleFrames[${index}]`;
    const frame = record(entry, path);
    const group = stringValue(frame.group, `${path}.group`);
    if (!(TILESET_ROLE_GROUPS as readonly string[]).includes(group)) {
      fail('invalid_type', `${path}.group`, `unknown tileset role group ${group}`);
    }
    return {
      group: group as TilesetRoleGroup,
      role: stableReference(frame.role, `${path}.role`),
      assetId: stableReference(frame.assetId, `${path}.assetId`),
      frame: integer(frame.frame, `${path}.frame`),
    };
  }).sort((left, right) => `${left.group}:${left.role}`.localeCompare(`${right.group}:${right.role}`));
  const unavailableRoleGroups = array(source.unavailableRoleGroups, '$.unavailableRoleGroups')
    .map((entry, index) => {
      const path = `$.unavailableRoleGroups[${index}]`;
      const unavailable = record(entry, path);
      const group = stringValue(unavailable.group, `${path}.group`);
      if (group !== 'inset' && group !== 'ledge_edge' && group !== 'ledge_inset') {
        fail('invalid_type', `${path}.group`, `role group ${group} cannot be unavailable`);
      }
      return {
        group: group as TilesetUnavailableRoleGroup['group'],
        reason: stringValue(unavailable.reason, `${path}.reason`),
      };
    }).sort((left, right) => left.group.localeCompare(right.group));
  const faceProfiles = array(source.faceProfiles, '$.faceProfiles').map((entry, index) => {
    const path = `$.faceProfiles[${index}]`;
    const profile = record(entry, path);
    return {
      id: stableReference(profile.id, `${path}.id`),
      rows: array(profile.rows, `${path}.rows`)
        .map((row, rowIndex) => parseTilesetFaceRow(row, `${path}.rows[${rowIndex}]`)),
      repeatRows: array(profile.repeatRows, `${path}.repeatRows`)
        .map((row, rowIndex) => parseTilesetFaceRow(row, `${path}.repeatRows[${rowIndex}]`)),
    };
  }).sort((left, right) => left.id.localeCompare(right.id));
  return Object.freeze({
    ...base(source, 'tileset'),
    engineVersion: integer(source.engineVersion, '$.engineVersion', 1),
    familyId: stableReference(source.familyId, '$.familyId'),
    projectionStyle,
    baseDatum: integer(source.baseDatum, '$.baseDatum', Number.MIN_SAFE_INTEGER),
    ...(source.fixedPlane === undefined ? {} : {
      fixedPlane: integer(source.fixedPlane, '$.fixedPlane', Number.MIN_SAFE_INTEGER),
    }),
    ...(source.projectionRowsPerLevel === undefined ? {} : {
      projectionRowsPerLevel: integer(source.projectionRowsPerLevel, '$.projectionRowsPerLevel'),
    }),
    faceClearanceRows: integer(source.faceClearanceRows, '$.faceClearanceRows'),
    ...(source.surfaceFamily === undefined ? {} : {
      surfaceFamily: stableReference(source.surfaceFamily, '$.surfaceFamily'),
    }),
    roleFrames,
    unavailableRoleGroups,
    faceProfiles,
    transitions: {
      ramp: parseTilesetTransition(transitions.ramp, '$.transitions.ramp'),
      stair: parseTilesetTransition(transitions.stair, '$.transitions.stair'),
      ladder: parseTilesetTransition(transitions.ladder, '$.transitions.ladder'),
    },
    assetIds: strings(source.assetIds, '$.assetIds')
      .map((assetId, index) => stableReference(assetId, `$.assetIds[${index}]`))
      .sort((left, right) => left.localeCompare(right)),
  });
}

export function parseContentDefinition(kind: string, json: string | unknown): SupportedContentDefinition {
  switch (kind) {
    case 'item': return parseItemDefinition(json);
    case 'recipe': return parseRecipeDefinition(json);
    case 'process': return parseProcessDefinition(json);
    case 'shop': return parseShopDefinition(json);
    case 'tileset': return parseTilesetDefinition(json);
    case 'object': return parseObjectDefinition(json);
    case 'frame': return parseFrameDefinition(json);
    case 'loot': return parseLootDefinition(json);
    case 'npc': return parseNpcDefinition(json);
    case 'dialogue': return parseDialogueDefinition(json);
    case 'quest': return parseQuestDefinition(json);
    case 'balance': return parseBalanceDefinition(json);
    case 'crop': return parseCropDefinition(json);
    case 'creature': return parseCreatureDefinition(json);
    case 'spawn': return parseSpawnDefinition(json);
    case 'space': return parseSpaceContentDefinition(json);
    case 'skill_tree': return parseSkillTreeDefinition(json);
    case 'effect': return parseEffectContentDefinition(json);
    case 'statistic': return parseStatisticDefinition(json);
    case 'upgrade': return parseUpgradeDefinition(json);
    case 'balance_group': return parseBalanceGroupDefinition(json);
    case 'resource': return parseResourceDefinition(json);
    case 'loadout': return parseLoadoutDefinition(json);
    case 'enemy': return parseEnemyDefinition(json);
    case 'encounter': return parseEncounterDefinition(json);
    default: return fail('kind_mismatch', '$.kind', `unsupported definition kind ${kind}`);
  }
}



export {
  parseObjectDefinition,
  type ObjectContentDefinition,
  type ObjectDefinitionId,
} from './object-definition.js';

export {
  parseLoadoutDefinition,
  type LoadoutContentDefinition,
  type LoadoutDefinitionId,
  type LoadoutEntryDefinition,
  type LoadoutRole,
  type PlayerAppearanceCatalogDefinition,
  type SprintAbilityContentDefinition,
} from './loadout-definition.js';
export {
  parseEncounterDefinition,
  parseEnemyDefinition,
  type EncounterContentDefinition,
  type EncounterDefinitionId,
  type EncounterRewardContentDefinition,
  type EnemyBehaviorEngine,
  type EnemyContentDefinition,
  type EnemyDefinitionId,
} from './outdoor-encounter-definition.js';
export {
  parseFrameDefinition,
  type FrameContentDefinition,
  type FrameDefinitionId,
} from './frame-definition.js';
export type {
  LootCondition,
  LootContentDefinition,
  LootDefinitionId,
  LootDrop,
  LootEntryDefinition,
  LootGroupDefinition,
  LootRollContext,
  LootRollRequest,
  LootRollResult,
} from './loot-definition.js';
export {
  parseResourceDefinition,
  type ResourceContentDefinition,
  type ResourceDefinitionId,
  type ResourceDiscoveryKind,
  type ResourceFootprintDefinition,
  type ResourceInteractionMode,
  type ResourceVisualKind,
} from './resource-definition.js';
export {
  parseDialogueDefinition,
  parseNpcDefinition,
  parseQuestDefinition,
  type DialogueContentDefinition,
  type DialogueDefinitionId,
  type NpcContentDefinition,
  type NpcDefinitionId,
  type QuestContentDefinition,
  type QuestDefinitionId,
} from './npc-definition.js';
export {
  type BalanceContentDefinition,
  type BalanceDefinitionId,
  type BalanceUnit,
  type CharacterCombatBalanceContentDefinition,
  type CharacterCombatBalanceTuple,
  type ScalarBalanceContentDefinition,
  type SupportCapCapability,
  type WorldPolicyBalanceContentDefinition,
  type WorldPolicyBalanceTuple,
} from './balance-definition.js';
export {
  compiledCropProjection,
  compiledStatisticProjection,
  parseBalanceGroupDefinition,
  parseCreatureDefinition,
  parseCropDefinition,
  parseEffectContentDefinition,
  parseSkillTreeDefinition,
  parseSpaceContentDefinition,
  parseSpawnDefinition,
  parseStatisticDefinition,
  parseUpgradeDefinition,
  type BalanceGroupContentDefinition,
  type BalanceGroupDefinitionId,
  type CreatureContentDefinition,
  type CreatureDefinitionId,
  type CropContentDefinition,
  type CropDefinitionId,
  type EffectContentDefinition,
  type EffectContentDefinitionId,
  type SkillTreeContentDefinition,
  type SkillTreeDefinitionId,
  type SpaceContentDefinition,
  type SpaceContentDefinitionId,
  type SpawnContentDefinition,
  type SpawnDefinitionId,
  type StatisticContentDefinition,
  type StatisticDefinitionId,
  type UpgradeContentDefinition,
  type UpgradeDefinitionId,
  type WorldContentDefinition,
} from './world-definition.js';
