import { parseSkillGearMetadata, type SkillGearMetadata } from '../skill-gear-metadata.js';
import type { SpaceRunEntrance } from '../spaces.js';
import type { Modifier } from '../modifiers.js';
import type { BalanceDefinitionId } from './balance-definition.js';
import type { ObjectDefinitionId } from './object-definition.js';
import { CONTENT_SCHEMA_VERSION, ContentParseError } from './parse-contract.js';

type WildlifeHabitat = 'pasture' | 'farmyard' | 'freshwater' | 'lakeshore' | 'wetland'
  | 'woodland' | 'meadow_air' | 'hive_air' | 'desert';
type WildlifeLocomotion = 'walk' | 'swim' | 'hop' | 'flutter';
type WildlifeSpecies = 'horse' | 'cow' | 'sheep' | 'pig' | 'chicken' | 'rooster'
  | 'duck' | 'goose' | 'swan' | 'frog' | 'mouse' | 'butterfly' | 'bee'
  | 'capybara' | 'camel' | 'scarab' | 'vulture' | 'snail';
type SkillTrack = 'combat' | 'explorer' | 'farming';
type SkillSpecialization = 'farming' | 'mining' | 'fishing' | 'woodcutting'
  | 'animal_husbandry' | 'exploration';

export interface SkillNodePassives {
  readonly buriedOreDetectionRadiusTiles?: number;
  readonly identifyBuriedOre?: boolean;
  readonly minimapResources?: readonly ('ore' | 'fish_pool')[];
  readonly minimapRadiusTiles?: number;
}

export const SKILL_NODE_CAPABILITIES = [
  'foot_gap_jump',
  'foot_cliff_climb',
  'minimap_player_tracking',
  'mining_efficient_strikes',
  'mining_yield_inspection',
  'mining_ore_dressing',
  'mining_rockhound',
  'mining_mother_lode',
  'farming_green_thumb',
  'farming_seed_saver',
  'farming_bountiful_harvest',
  'farming_tender_hand',
  'farming_master_grower',
  'farming_barreling',
  'farming_harvest_festival',
  'farming_soil_whisperer',
] as const;
export type SkillNodeCapability = (typeof SKILL_NODE_CAPABILITIES)[number];

interface SkillNodeDefinition extends SkillGearMetadata {
  readonly id: string;
  /** Stable generated-atlas identity. It is intentionally independent from
   * the node id so an authored rename can retain the reviewed artwork. */
  readonly iconAsset: string;
  readonly track: SkillTrack;
  readonly name: string;
  readonly description: string;
  readonly position: readonly [x: number, y: number];
  readonly connects: readonly string[];
  readonly prerequisites?: readonly string[];
  readonly passive?: SkillNodePassives;
  /** Stable semantic effects consumed by engine algorithms. IDs remain freely
   * authorable and can be renamed without changing the capability decision. */
  readonly capabilities?: readonly SkillNodeCapability[];
  readonly maxRank: number;
  readonly pointCost: number;
  readonly requiresLevel?: number;
  readonly root?: boolean;
  readonly specialization?: SkillSpecialization;
  readonly implemented?: true;
}

type SpaceGenerator = 'island' | 'mine' | 'homestead' | 'residence' | 'marlow_tent'
  | 'cellar' | 'delve_lobby' | 'village_interior' | 'roguelike' | 'debug_flat';
type SpaceEnvironment = 'outdoor' | 'indoor' | 'underground';
type SpaceAmbient = 'clock' | { readonly r: number; readonly g: number; readonly b: number };
type SpaceAudioBed = 'estate' | 'cave' | 'homestead' | 'debug';

type StatisticCategory = 'account' | 'social' | 'exploration' | 'items' | 'crafting'
  | 'commerce' | 'farming' | 'world' | 'tools' | 'creatures' | 'combat'
  | 'progression' | 'future';
type StatisticUnit = 'count' | 'authority_ticks' | 'fixed_distance' | 'bronze'
  | 'durability' | 'damage';
type StatisticAggregation = 'counter' | 'maximum';
type StatisticSubject = 'none' | 'chat_kind' | 'movement_mode' | 'item_kind'
  | 'resource_kind' | 'tool_kind' | 'npc_kind' | 'hit_kind' | 'transaction_kind'
  | 'crop_kind' | 'fish_kind' | 'creature_kind' | 'combat_target_kind'
  | 'damage_kind' | 'quest_kind' | 'npc_id' | 'quest_objective' | 'quest_action'
  | 'upgrade_kind' | 'skill_track';
type HomesteadUpgradeKind = 'rich_soil' | 'selective_seeds' | 'barrel_cellar' | 'estate_vintage';
export type HomesteadUpgradeMechanic = 'soil' | 'seed' | 'barrel' | 'vintage';
export type HomesteadUpgradeMechanicBinding = readonly [HomesteadUpgradeMechanic, string];
export type DelveBoonModifierCode = 's' | 'b' | 'a' | 'm' | 'c' | 'x' | 'h' | 'k';
export type DelveBoonTuple = readonly [
  durableId: string,
  modifier: DelveBoonModifierCode,
  baseMagnitudePermille: number,
];

export type CropDefinitionId = `crop:${string}`;
export type CreatureDefinitionId = `creature:${string}`;
export type SpawnDefinitionId = `spawn:${string}`;
export type SpaceContentDefinitionId = `space:${string}`;
export type SkillTreeDefinitionId = `skill_tree:${string}`;
export type EffectContentDefinitionId = `effect:${string}`;
export type StatisticDefinitionId = `statistic:${string}`;
export type UpgradeDefinitionId = `upgrade:${string}`;
export type BalanceGroupDefinitionId = `balance_group:${string}`;

interface WorldDefinitionBase<K extends string, I extends string> {
  readonly id: I;
  readonly kind: K;
  readonly schemaVersion: typeof CONTENT_SCHEMA_VERSION;
  readonly retired?: boolean;
  readonly replacement?: I;
}

export interface CropContentDefinition extends WorldDefinitionBase<'crop', CropDefinitionId> {
  /** Licensed crop-sheet group order. Duplicate visuals may share an order. */
  readonly sourceSheetOrder?: number;
  readonly displayName: string;
  readonly seedItem: `item:${string}`;
  readonly harvestItem: `item:${string}`;
  readonly asset: string;
  readonly signAsset: string;
  readonly growthTicks: string;
  readonly harvestQuantity: number;
  readonly seedBuyPriceBronze: number;
  readonly harvestSellPriceBronze: number;
  readonly seasonless?: boolean;
  readonly tags?: readonly string[];
}

export interface CreatureContentDefinition extends WorldDefinitionBase<'creature', CreatureDefinitionId> {
  /** Parser-only marker for exact pre-authority production packs. Validation
   * rejects this shape unless the raw Stage-A payload fingerprint matches. */
  readonly legacyCompatibility?: true;
  readonly species: string;
  readonly habitat: WildlifeHabitat;
  readonly variants: number;
  readonly speedFixed: number;
  readonly wanderRadiusTiles: number;
  readonly locomotion: WildlifeLocomotion;
  readonly sleepsAtNight: boolean;
  readonly canGraze: boolean;
  readonly ignoresObstacles: boolean;
  /** Optional simulation semantics. These capabilities are resolved through
   * authored creature references rather than inferred from ids or species. */
  readonly behavior?: {
    /** Colonies are generated around hives and return inside at night/rest. */
    readonly hiveReturn?: true;
    /** The final member of each authored pack uses this creature definition. */
    readonly trailingPackMember?: CreatureDefinitionId;
  };
  /** Presentation is authored separately from the durable species key. The
   * engine interprets these finite adapters; it never infers art from species. */
  readonly presentation: CreaturePresentationDefinition;
  readonly loot?: `loot:${string}`;
  readonly combat: {
    readonly name: string;
    readonly level: number;
    readonly attributes: {
      readonly str: number;
      readonly dex: number;
      readonly con: number;
      readonly int: number;
      readonly wis: number;
      readonly cha: number;
    };
    readonly innateModifiers: readonly Modifier[];
    readonly hostile: boolean;
    readonly huntable: boolean;
    readonly experience: number;
    readonly respawnTicks: number;
  };
  readonly panic: {
    readonly group: string;
    readonly durationTicks: number;
    readonly radiusFixed: number;
    readonly speedMultiplierPermille: number;
    readonly knockbackFixed: number;
  };
  readonly hayFeeding?: {
    readonly reachFixed: number;
    readonly journeyTicks: number;
    readonly snackTicks: number;
    readonly decisionOneIn: number;
  };
}

export interface CreaturePresentationDefinition {
  readonly asset: string;
  readonly renderer?: 'wildlife' | 'horse';
  readonly animation?:
    | 'quadruped' | 'waterfowl' | 'goose' | 'frog' | 'flutter' | 'bee'
    | 'vulture' | 'scarab' | 'fowl' | 'mouse' | 'camel' | 'snail' | 'base';
  readonly facing?: 'left' | 'right';
  readonly shadow?: 'grounded' | 'airborne' | 'airborne_while_moving';
  readonly target?: readonly [number, number];
  readonly hidden?: readonly string[];
  readonly static?: readonly string[];
  readonly cycle?: 'capybara_water';
}

export interface RuntimeCreaturePresentation {
  readonly renderer: NonNullable<CreaturePresentationDefinition['renderer']>;
  readonly assetFamily: string;
  readonly animationProfile: NonNullable<CreaturePresentationDefinition['animation']>;
  readonly authoredSideFacing: NonNullable<CreaturePresentationDefinition['facing']>;
  readonly shadow: NonNullable<CreaturePresentationDefinition['shadow']>;
  readonly targetBounds: { readonly halfWidth: number; readonly height: number };
  readonly hiddenActivities: readonly string[];
  readonly staticActivities: readonly string[];
  readonly visualCycle?: NonNullable<CreaturePresentationDefinition['cycle']>;
}

export interface SpawnContentDefinition extends WorldDefinitionBase<'spawn', SpawnDefinitionId> {
  readonly target: CreatureDefinitionId | `npc:${string}` | `object:${string}`;
  readonly space: SpaceContentDefinitionId;
  readonly strategy: 'packs' | 'fixed' | 'population';
  readonly habitat?: string;
  readonly packCount?: number;
  readonly packSize?: number;
  readonly minimumPackSpacing?: number;
  readonly protectedBy?: `npc:${string}`;
  readonly positions?: readonly {
    readonly runtimeId?: string;
    readonly tileX: number;
    readonly tileY: number;
    readonly variant?: number;
  }[];
}

export interface SpaceTileRectangle {
  readonly minimumTileX: number;
  readonly maximumTileX: number;
  readonly minimumTileY: number;
  readonly maximumTileY: number;
}

export interface LandmarkAutomationDefinition {
  readonly actor: `npc:${string}`;
  readonly lightMinute: number;
  readonly extinguishMinute: number;
  readonly jitterMinutes: number;
  readonly lightSalt: string;
  readonly extinguishSalt: string;
}

export type LandmarkDecorationLayer = 'ground' | 'objects' | 'gameplay' | 'canopy';
export type LandmarkDecorationRole = 'soil.watered';

export type LandmarkDecorationRule = ({
  readonly kind: 'point';
  readonly decorationKind: string;
  readonly tileX: number;
  readonly tileY: number;
  readonly variant?: number;
  readonly animationOffset?: number;
  readonly idOffset?: number;
  readonly roles?: readonly string[];
  readonly placeable?: {
    readonly runtimeId: string;
    readonly object: `object:${string}`;
    readonly automation?: LandmarkAutomationDefinition;
  };
} | {
  readonly kind: 'fence_rectangle';
  readonly decorationKind: string;
  readonly gateKind: string;
  readonly bounds: SpaceTileRectangle;
  readonly gateTileX: number;
  readonly gateTileY: number;
} | {
  readonly kind: 'fill_rectangle';
  readonly decorationKind: string;
  readonly startTileX: number;
  readonly startTileY: number;
  readonly width: number;
  readonly height: number;
  readonly variant?: number;
  readonly animationOffsetX?: number;
  readonly animationOffsetY?: number;
}) & {
  readonly layer?: LandmarkDecorationLayer;
  readonly role?: LandmarkDecorationRole;
};

export interface SpaceLandmarkDefinition {
  readonly id: string;
  readonly label: string;
  readonly runtimeIdBase: string;
  readonly bounds: SpaceTileRectangle;
  readonly decorations: readonly LandmarkDecorationRule[];
  readonly pathAreas?: readonly SpaceTileRectangle[];
  readonly groundWalkableAreas?: readonly SpaceTileRectangle[];
}

export interface SpacePortalContentDefinition {
  readonly runtimeId: string;
  readonly portalKind: string;
  readonly fromSpace: SpaceContentDefinitionId;
  readonly fromTileX: number;
  readonly fromTileY: number;
  readonly toSpace: SpaceContentDefinitionId;
  readonly toTileX: number;
  readonly toTileY: number;
}

export interface HearthLobbyContentDefinition {
  readonly points: Readonly<Record<
    'arrival' | 'exit' | 'stash' | 'descent' | 'counter' | 'practice',
    readonly [tileX: number, tileY: number]
  >>;
  readonly stashCapacity: number;
  readonly floorThresholdY: number;
  readonly carves: readonly (readonly [left: number, top: number, right: number, bottom: number])[];
  readonly practiceTarget: readonly [runtimeId: string, object: ObjectDefinitionId,
    presentationKind: string, tileX: number, tileY: number];
  readonly torches: readonly (readonly [runtimeId: string, object: ObjectDefinitionId,
    presentationKind: string, tileX: number, tileY: number])[];
  readonly fixtures: readonly (readonly [id: string, object: ObjectDefinitionId,
    presentationKind: string, tileX: number, tileY: number, halfWidth: number,
    depth: number, rendererRole?: string])[];
}

/** Inclusive tile offsets from the surface anchor: [left, top, right, bottom]. */
export type SpaceSurfaceFootprint = readonly [number, number, number, number];

export interface SpaceSurfaceContentDefinition {
  readonly id: string;
  readonly kind: string;
  readonly tileX: number;
  readonly tileY: number;
  readonly capacity: number;
  readonly footprint: SpaceSurfaceFootprint;
}

/** Compact authored landmark/decor collision profile. Medium bits are
 * ground=1 and water=2; offsets are inclusive tiles from the sprite anchor. */
export type SpaceDecorationCollisionProfile = readonly [
  mediumMask: 1 | 2 | 3,
  left: number,
  top: number,
  right: number,
  bottom: number,
  ...decorationKinds: string[],
];

export type SpaceDecorationPaletteEntry = readonly [kind: string, value: number];
/** Procedural decoration content choices. RNG, placement and biome density
 * remain compiled engine algorithms; tuple order is stable generator identity. */
export type SpaceDecorationGeneratorDefinition = readonly [
  natureVariants: readonly SpaceDecorationPaletteEntry[],
  poiKinds: readonly string[],
  groveWeights: readonly SpaceDecorationPaletteEntry[],
  mushroomKind: string,
  pondWeights: readonly SpaceDecorationPaletteEntry[],
  ambient: readonly [primaryKind: string, accentKind: string, accentWeight: number],
  desertWeights: readonly SpaceDecorationPaletteEntry[],
];

export type HearthInteriorContentKind = 'i' | 'g' | 'c' | 'f' | 's' | 'u';
/** Compact shared defaults and authored object-art keys. Object ids remain
 * renameable because runtime resolves each key through the active sprite asset. */
export type HearthInteriorCatalogContentDefinition = readonly [
  arrivalX: number, arrivalY: number, exitX: number, exitY: number,
  serviceX: number, serviceY: number, approachX: number, approachY: number,
];
export type HearthInteriorContentDefinition = readonly [
  kind: HearthInteriorContentKind,
  rooms: string,
  furniture: string,
  service?: string,
];

/** Compact ferry destination metadata. The final bit field is home=1,
 * dangerous=2 and outdoor-encounters-required=4. */
export type SpaceFerryDestinationDefinition = readonly [
  id: string, label: string,
  thresholdX: number, thresholdY: number,
  arrivalX: number, arrivalY: number,
  availabilityRegion: string, flags: number,
];

/** Compact authored personal-stash endpoint installed in the live map. */
export type SpaceSupplyCacheDefinition = readonly [
  endpointId: string, objectDefinitionId: `object:${string}`,
  mapObjectId: string, prefabId: string, assetId: number,
  tileX: number, tileY: number, frontageX: number, frontageY: number,
];

export interface SpaceContentDefinition extends WorldDefinitionBase<'space', SpaceContentDefinitionId> {
  readonly spaceId: number;
  readonly name: string;
  readonly sizeTiles: number;
  readonly generator: SpaceGenerator;
  readonly environment: SpaceEnvironment;
  readonly ambient: SpaceAmbient;
  readonly weather: boolean;
  readonly audioBed: SpaceAudioBed;
  readonly ownerOnly?: boolean;
  readonly hearthLobby?: HearthLobbyContentDefinition;
  readonly hearthInteriorCatalog?: HearthInteriorCatalogContentDefinition;
  readonly hearthInterior?: HearthInteriorContentDefinition;
  readonly runEntrances?: readonly SpaceRunEntrance[];
  readonly surfaces?: readonly SpaceSurfaceContentDefinition[];
  readonly decorationCollision?: readonly SpaceDecorationCollisionProfile[];
  readonly decorationGenerator?: SpaceDecorationGeneratorDefinition;
  readonly ferry?: readonly SpaceFerryDestinationDefinition[];
  readonly supplyCache?: SpaceSupplyCacheDefinition;
  readonly landmarks?: readonly SpaceLandmarkDefinition[];
  readonly portals?: readonly SpacePortalContentDefinition[];
}

export interface SkillTreeContentDefinition extends WorldDefinitionBase<'skill_tree', SkillTreeDefinitionId> {
  readonly track: SkillTrack;
  readonly levelCap: number;
  readonly nodes: readonly SkillNodeDefinition[];
}

export interface EffectContentDefinition extends WorldDefinitionBase<'effect', EffectContentDefinitionId> {
  readonly name: string;
  readonly maxStacks: number;
  readonly durationTicks: number;
  readonly modifiers: readonly Modifier[];
  readonly family?: string;
  readonly scaleModifiersWithStacks?: boolean;
}

export interface StatisticContentDefinition extends WorldDefinitionBase<'statistic', StatisticDefinitionId> {
  readonly name: string;
  readonly description: string;
  readonly category: StatisticCategory;
  readonly unit: StatisticUnit;
  readonly aggregation: StatisticAggregation;
  readonly subject: StatisticSubject;
  readonly milestones: readonly string[];
  readonly reserved?: boolean;
}

interface UpgradeContentDefinitionBase extends WorldDefinitionBase<'upgrade', UpgradeDefinitionId> {
  readonly displayName: string;
  readonly description: string;
}

export interface HomesteadUpgradeContentDefinition extends UpgradeContentDefinitionBase {
  /** Stable gameplay role. Definition ids remain durable purchase/storage keys
   * and may be renamed without moving the mechanic back into compiled code. */
  readonly mechanic: HomesteadUpgradeMechanicBinding;
  readonly maximumRank: number;
  readonly baseCostGold: number;
  readonly costGrowth: number;
}

export interface DelveBoonUpgradeContentDefinition extends UpgradeContentDefinitionBase {
  readonly delveBoon: DelveBoonTuple;
}

export interface LegacyUpgradeContentDefinition extends UpgradeContentDefinitionBase {
  readonly legacyCompatibility: true;
  readonly maximumRank: number;
  readonly baseCostGold: number;
  readonly costGrowth: number;
}

export type UpgradeContentDefinition=HomesteadUpgradeContentDefinition|DelveBoonUpgradeContentDefinition|LegacyUpgradeContentDefinition;
export function isHomesteadUpgradeContentDefinition(
  definition:UpgradeContentDefinition,
):definition is HomesteadUpgradeContentDefinition{return 'mechanic' in definition;}

export interface BalanceGroupContentDefinition extends WorldDefinitionBase<'balance_group', BalanceGroupDefinitionId> {
  readonly title: string;
  readonly description: string;
  readonly entries: readonly BalanceDefinitionId[];
}

export type WorldContentDefinition =
  | CropContentDefinition
  | CreatureContentDefinition
  | SpawnContentDefinition
  | SpaceContentDefinition
  | SkillTreeContentDefinition
  | EffectContentDefinition
  | StatisticContentDefinition
  | UpgradeContentDefinition
  | BalanceGroupContentDefinition;

const ID = /^[a-z_]+:[a-z0-9]+(?:_[a-z0-9]+)*$/u;
const decoded = (value: string | unknown): unknown => {
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value) as unknown; }
  catch { throw new ContentParseError('invalid_json', '$', 'invalid JSON'); }
};
const object = (value: unknown, path: string): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new ContentParseError('invalid_type', path, 'expected object');
  return value as Record<string, unknown>;
};
const string = (value: unknown, path: string): string => {
  if (typeof value !== 'string' || value.length === 0) throw new ContentParseError('invalid_type', path, 'expected non-empty string');
  return value;
};
const integer = (value: unknown, path: string, minimum = 0): number => {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) throw new ContentParseError('invalid_type', path, `expected safe integer >= ${minimum}`);
  return value as number;
};
const number = (value: unknown, path: string, minimum = 0): number => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum) throw new ContentParseError('invalid_type', path, `expected finite number >= ${minimum}`);
  return value;
};
const boolean = (value: unknown, path: string): boolean => {
  if (typeof value !== 'boolean') throw new ContentParseError('invalid_type', path, 'expected boolean');
  return value;
};
const array = (value: unknown, path: string): readonly unknown[] => {
  if (!Array.isArray(value)) throw new ContentParseError('invalid_type', path, 'expected array');
  return value;
};
const reference = <P extends string>(value: unknown, prefix: P, path: string): `${P}:${string}` => {
  const result = string(value, path);
  if (!ID.test(result) || !result.startsWith(`${prefix}:`)) throw new ContentParseError('invalid_id', path, `expected ${prefix}: slug`);
  return result as `${P}:${string}`;
};

function sourceFor<K extends WorldContentDefinition['kind']>(value: string | unknown, kind: K): Record<string, unknown> {
  const source = object(decoded(value), '$');
  if (source.kind !== kind) throw new ContentParseError('kind_mismatch', '$.kind', `expected ${kind}`);
  if (source.schemaVersion !== CONTENT_SCHEMA_VERSION) throw new ContentParseError('unsupported_schema_version', '$.schemaVersion', 'only schema version 1 is supported');
  reference(source.id, kind, '$.id');
  return source;
}

function base<K extends WorldContentDefinition['kind']>(source: Record<string, unknown>, kind: K) {
  return {
    id: reference(source.id, kind, '$.id'), kind, schemaVersion: CONTENT_SCHEMA_VERSION,
    ...(source.retired === undefined ? {} : { retired: boolean(source.retired, '$.retired') }),
    ...(source.replacement === undefined ? {} : { replacement: reference(source.replacement, kind, '$.replacement') }),
  };
}

const item = (value: unknown, path: string) => reference(value, 'item', path);
const modifier = (value: unknown, path: string): Modifier => {
  const entry = object(value, path);
  return {
    id: string(entry.id, `${path}.id`),
    target: string(entry.target, `${path}.target`) as Modifier['target'],
    layer: string(entry.layer, `${path}.layer`) as Modifier['layer'],
    value: integer(entry.value, `${path}.value`, Number.MIN_SAFE_INTEGER),
    ...(entry.family === undefined ? {} : { family: string(entry.family, `${path}.family`) }),
    source: string(entry.source, `${path}.source`) as Modifier['source'],
  };
};

export function parseCropDefinition(value: string | unknown): CropContentDefinition {
  const source = sourceFor(value, 'crop');
  const ticks = string(source.growthTicks, '$.growthTicks');
  if (!/^\d+$/u.test(ticks)) throw new ContentParseError('invalid_type', '$.growthTicks', 'expected unsigned integer text');
  return Object.freeze({ ...base(source, 'crop'), ...(source.sourceSheetOrder === undefined ? {} : { sourceSheetOrder: integer(source.sourceSheetOrder, '$.sourceSheetOrder') }), displayName: string(source.displayName, '$.displayName'), seedItem: item(source.seedItem, '$.seedItem'), harvestItem: item(source.harvestItem, '$.harvestItem'), asset: string(source.asset, '$.asset'), signAsset: string(source.signAsset, '$.signAsset'), growthTicks: ticks, harvestQuantity: integer(source.harvestQuantity, '$.harvestQuantity', 1), seedBuyPriceBronze: integer(source.seedBuyPriceBronze, '$.seedBuyPriceBronze'), harvestSellPriceBronze: integer(source.harvestSellPriceBronze, '$.harvestSellPriceBronze'), ...(source.seasonless === undefined ? {} : { seasonless: boolean(source.seasonless, '$.seasonless') }), ...(source.tags === undefined ? {} : { tags: Object.freeze(array(source.tags, '$.tags').map((tag, index) => string(tag, `$.tags[${index}]`))) }) });
}

function creaturePresentation(
  renderer: NonNullable<CreaturePresentationDefinition['renderer']>, asset: string,
  animation: NonNullable<CreaturePresentationDefinition['animation']>,
  facing: NonNullable<CreaturePresentationDefinition['facing']>,
  shadow: NonNullable<CreaturePresentationDefinition['shadow']>, halfWidth: number, height: number,
  hiddenActivities: readonly string[] = [], staticActivities: readonly string[] = ['rest', 'inside_hive'],
  cycle?: NonNullable<CreaturePresentationDefinition['cycle']>,
): CreaturePresentationDefinition {
  return Object.freeze({
    asset,
    ...(renderer === 'wildlife' ? {} : { renderer }),
    ...(animation === 'quadruped' ? {} : { animation }),
    ...(facing === 'left' ? {} : { facing }),
    ...(shadow === 'grounded' ? {} : { shadow }),
    ...(halfWidth === 10 && height === 18 ? {} : { target: Object.freeze([halfWidth, height] as const) }),
    ...(hiddenActivities.length === 0 ? {} : { hidden: Object.freeze([...hiddenActivities]) }),
    ...(staticActivities.length === 2 && staticActivities[0] === 'rest' && staticActivities[1] === 'inside_hive'
      ? {} : { static: Object.freeze([...staticActivities]) }),
    ...(cycle === undefined ? {} : { cycle }),
  });
}

function parseCreatureCombat(
  value: unknown,
  path: string,
): CreatureContentDefinition['combat'] {
  const source = object(value, path);
  const attributes = object(source.attributes, `${path}.attributes`);
  return {
    name: string(source.name, `${path}.name`),
    level: integer(source.level, `${path}.level`, 1),
    attributes: {
      str: integer(attributes.str, `${path}.attributes.str`),
      dex: integer(attributes.dex, `${path}.attributes.dex`),
      con: integer(attributes.con, `${path}.attributes.con`),
      int: integer(attributes.int, `${path}.attributes.int`),
      wis: integer(attributes.wis, `${path}.attributes.wis`),
      cha: integer(attributes.cha, `${path}.attributes.cha`),
    },
    innateModifiers: array(source.innateModifiers, `${path}.innateModifiers`)
      .map((entry, index) => modifier(entry, `${path}.innateModifiers[${index}]`)),
    hostile: boolean(source.hostile, `${path}.hostile`),
    huntable: boolean(source.huntable, `${path}.huntable`),
    experience: integer(source.experience, `${path}.experience`),
    respawnTicks: integer(source.respawnTicks, `${path}.respawnTicks`, 1),
  };
}

function parseCreaturePanic(value: unknown, path: string): CreatureContentDefinition['panic'] {
  const source = object(value, path);
  return {
    group: string(source.group, `${path}.group`),
    durationTicks: integer(source.durationTicks, `${path}.durationTicks`, 1),
    radiusFixed: integer(source.radiusFixed, `${path}.radiusFixed`, 1),
    speedMultiplierPermille: integer(source.speedMultiplierPermille, `${path}.speedMultiplierPermille`, 1),
    knockbackFixed: integer(source.knockbackFixed, `${path}.knockbackFixed`),
  };
}

function parseCreatureHayFeeding(value: unknown, path: string): NonNullable<CreatureContentDefinition['hayFeeding']> {
  const source = object(value, path);
  return {
    reachFixed: integer(source.reachFixed, `${path}.reachFixed`, 1),
    journeyTicks: integer(source.journeyTicks, `${path}.journeyTicks`, 1),
    snackTicks: integer(source.snackTicks, `${path}.snackTicks`, 1),
    decisionOneIn: integer(source.decisionOneIn, `${path}.decisionOneIn`, 1),
  };
}

function parseCreatureBehavior(value: unknown, path: string): NonNullable<CreatureContentDefinition['behavior']> {
  const source = object(value, path);
  const hiveReturn = source.hiveReturn === undefined ? undefined : boolean(source.hiveReturn, `${path}.hiveReturn`);
  if (hiveReturn === false) throw new ContentParseError('invalid_type', `${path}.hiveReturn`, 'hiveReturn must be true when authored');
  const trailingPackMember = source.trailingPackMember === undefined ? undefined
    : reference(source.trailingPackMember, 'creature', `${path}.trailingPackMember`);
  if (hiveReturn === undefined && trailingPackMember === undefined) {
    throw new ContentParseError('invalid_type', path, 'creature behavior must author at least one capability');
  }
  return {
    ...(hiveReturn === true ? { hiveReturn: true as const } : {}),
    ...(trailingPackMember === undefined ? {} : { trailingPackMember }),
  };
}

function parseCreaturePresentation(value: unknown, path: string): CreaturePresentationDefinition {
  const source = object(value, path);
  const renderer = (source.renderer === undefined ? 'wildlife' : string(source.renderer, `${path}.renderer`)) as NonNullable<CreaturePresentationDefinition['renderer']>;
  const animationProfile = (source.animation === undefined ? 'quadruped' : string(source.animation, `${path}.animation`)) as NonNullable<CreaturePresentationDefinition['animation']>;
  const authoredSideFacing = (source.facing === undefined ? 'left' : string(source.facing, `${path}.facing`)) as NonNullable<CreaturePresentationDefinition['facing']>;
  const shadow = (source.shadow === undefined ? 'grounded' : string(source.shadow, `${path}.shadow`)) as NonNullable<CreaturePresentationDefinition['shadow']>;
  if (!(['wildlife', 'horse'] as const).includes(renderer)) throw new ContentParseError('invalid_type', `${path}.renderer`, 'unknown creature renderer');
  if (!(['quadruped', 'waterfowl', 'goose', 'frog', 'flutter', 'bee', 'vulture', 'scarab', 'fowl', 'mouse', 'camel', 'snail', 'base'] as const).includes(animationProfile)) throw new ContentParseError('invalid_type', `${path}.animation`, 'unknown creature animation profile');
  if (!(['left', 'right'] as const).includes(authoredSideFacing)) throw new ContentParseError('invalid_type', `${path}.facing`, 'unknown authored side facing');
  if (!(['grounded', 'airborne', 'airborne_while_moving'] as const).includes(shadow)) throw new ContentParseError('invalid_type', `${path}.shadow`, 'unknown creature shadow mode');
  const target = source.target === undefined ? [10, 18] : array(source.target, `${path}.target`);
  if (target.length !== 2) throw new ContentParseError('invalid_type', `${path}.target`, 'expected [halfWidth, height]');
  const visualCycle = source.cycle === undefined ? undefined : string(source.cycle, `${path}.cycle`);
  if (visualCycle !== undefined && visualCycle !== 'capybara_water') throw new ContentParseError('invalid_type', `${path}.cycle`, 'unknown creature visual cycle');
  return creaturePresentation(
    renderer, string(source.asset, `${path}.asset`), animationProfile,
    authoredSideFacing, shadow,
    integer(target[0], `${path}.target[0]`, 1), integer(target[1], `${path}.target[1]`, 1),
    (source.hidden === undefined ? [] : array(source.hidden, `${path}.hidden`)).map((entry, index) => string(entry, `${path}.hidden[${index}]`)),
    (source.static === undefined ? ['rest', 'inside_hive'] : array(source.static, `${path}.static`)).map((entry, index) => string(entry, `${path}.static[${index}]`)),
    visualCycle as CreaturePresentationDefinition['cycle'],
  );
}

const LEGACY_CREATURE_PRESENTATION:Readonly<Record<string,Record<string,unknown>>>=Object.freeze({
  bee:{asset:'bee',animation:'bee',shadow:'airborne',target:[7,14],hidden:['inside_hive']},
  butterfly:{asset:'butterfly',animation:'flutter',shadow:'airborne',target:[7,14],static:[]},
  camel:{asset:'camel',animation:'camel',target:[16,26]},capybara:{asset:'capybara',animation:'base',static:['rest'],cycle:'capybara_water'},
  chicken:{asset:'chicken',animation:'fowl'},cow:{asset:'cow',target:[16,26]},duck:{asset:'duck',animation:'waterfowl'},
  frog:{asset:'frog',animation:'frog'},goose:{asset:'goose',animation:'goose',target:[12,20]},
  horse:{asset:'horse',renderer:'horse',target:[16,26]},mouse:{asset:'mouse',animation:'mouse'},pig:{asset:'pig',target:[12,20]},
  rooster:{asset:'rooster',animation:'fowl'},scarab:{asset:'scarab',animation:'scarab',target:[7,14]},
  sheep:{asset:'sheep',target:[12,20]},snail:{asset:'snail',animation:'snail'},swan:{asset:'swan',animation:'waterfowl',target:[12,20]},
  vulture:{asset:'vulture',animation:'vulture',facing:'right',shadow:'airborne_while_moving'},
});
const LEGACY_CREATURE_COMBAT:Readonly<Record<string,readonly[number,number,number,number,number,number,number,number]>>=Object.freeze({
  bee:[1,1,15,4,1,10,5,0],butterfly:[1,1,15,3,1,9,8,0],camel:[2,13,8,16,2,11,7,0],capybara:[1,8,8,12,2,11,10,0],
  chicken:[1,3,12,6,2,9,6,14],cow:[1,12,6,14,2,10,6,28],duck:[1,3,11,7,2,10,7,14],frog:[1,2,13,5,2,10,5,0],
  goose:[1,5,10,8,2,10,8,18],horse:[2,14,12,14,2,10,7,0],mouse:[1,1,14,4,3,11,5,0],pig:[1,9,8,12,2,10,7,22],
  rooster:[1,4,12,7,2,9,8,14],scarab:[1,2,10,8,1,8,3,0],sheep:[1,8,8,11,2,10,7,22],snail:[1,2,2,12,1,8,4,0],
  swan:[1,5,10,8,2,11,10,0],vulture:[2,7,13,9,2,12,6,0],
});

function legacyCreatureAuthority(species:string){
  const presentation=LEGACY_CREATURE_PRESENTATION[species],stats=LEGACY_CREATURE_COMBAT[species];
  if(presentation===undefined||stats===undefined)throw new ContentParseError('invalid_type','$','creature authority is required');
  const [level,str,dex,con,int,wis,cha,experience]=stats;
  const huntable=experience>0;
  return {presentation:parseCreaturePresentation(presentation,'$.presentation'),combat:{
    name:species[0]!.toUpperCase()+species.slice(1),level,attributes:{str,dex,con,int,wis,cha},innateModifiers:[],
    hostile:false,huntable,experience,respawnTicks:12_000,
  },panic:{group:species==='rooster'?'chicken':species,durationTicks:160,radiusFixed:1792,
    speedMultiplierPermille:2000,knockbackFixed:64},
  ...(huntable?{loot:`loot:wildlife_${species}` as `loot:${string}`}:{})};
}

export function parseCreatureDefinition(value: string | unknown): CreatureContentDefinition {
  const source = sourceFor(value, 'creature');
  const species = string(source.species, '$.species');
  const hayFeeding = source.hayFeeding === undefined ? undefined
    : parseCreatureHayFeeding(source.hayFeeding, '$.hayFeeding');
  const behavior = source.behavior === undefined ? undefined
    : parseCreatureBehavior(source.behavior, '$.behavior');
  const legacy=source.presentation===undefined&&source.combat===undefined&&source.panic===undefined
    ?legacyCreatureAuthority(species):undefined;
  const presentation = legacy?.presentation??parseCreaturePresentation(source.presentation, '$.presentation');
  return Object.freeze({
    ...base(source, 'creature'),
    species,
    habitat: string(source.habitat, '$.habitat') as CreatureContentDefinition['habitat'],
    variants: integer(source.variants, '$.variants', 1),
    speedFixed: integer(source.speedFixed, '$.speedFixed', 1),
    wanderRadiusTiles: integer(source.wanderRadiusTiles, '$.wanderRadiusTiles'),
    locomotion: string(source.locomotion, '$.locomotion') as CreatureContentDefinition['locomotion'],
    sleepsAtNight: boolean(source.sleepsAtNight, '$.sleepsAtNight'),
    canGraze: boolean(source.canGraze, '$.canGraze'),
    ignoresObstacles: boolean(source.ignoresObstacles, '$.ignoresObstacles'),
    ...(behavior === undefined ? {} : { behavior }),
    ...(legacy===undefined&&source.legacyCompatibility!==true?{}:{legacyCompatibility:true as const}),
    presentation,
    ...(source.loot===undefined?(legacy?.loot===undefined?{}:{loot:legacy.loot}):{loot:reference(source.loot,'loot','$.loot')}),
    combat: legacy?.combat??parseCreatureCombat(source.combat, '$.combat'),
    panic: legacy?.panic??parseCreaturePanic(source.panic, '$.panic'),
    ...(hayFeeding === undefined ? {} : { hayFeeding }),
  });
}

export function parseSpawnDefinition(value: string | unknown): SpawnContentDefinition {
  const source = sourceFor(value, 'spawn');
  const strategy = string(source.strategy, '$.strategy');
  if (strategy !== 'packs' && strategy !== 'fixed' && strategy !== 'population') throw new ContentParseError('invalid_type', '$.strategy', 'unknown spawn strategy');
  const target = string(source.target, '$.target');
  if (!/^(?:creature|npc|object):/u.test(target)) throw new ContentParseError('invalid_id', '$.target', 'invalid spawn target');
  return Object.freeze({ ...base(source, 'spawn'), target: target as SpawnContentDefinition['target'], space: reference(source.space, 'space', '$.space'), strategy, ...(source.habitat === undefined ? {} : { habitat: string(source.habitat, '$.habitat') }), ...(source.packCount === undefined ? {} : { packCount: integer(source.packCount, '$.packCount', 1) }), ...(source.packSize === undefined ? {} : { packSize: integer(source.packSize, '$.packSize', 1) }), ...(source.minimumPackSpacing === undefined ? {} : { minimumPackSpacing: integer(source.minimumPackSpacing, '$.minimumPackSpacing') }), ...(source.protectedBy === undefined ? {} : { protectedBy: reference(source.protectedBy, 'npc', '$.protectedBy') }), ...(source.positions === undefined ? {} : { positions: array(source.positions, '$.positions').map((point, index) => { const position = object(point, `$.positions[${index}]`); return { ...(position.runtimeId === undefined ? {} : { runtimeId: string(position.runtimeId, `$.positions[${index}].runtimeId`) }), tileX: integer(position.tileX, `$.positions[${index}].tileX`, Number.MIN_SAFE_INTEGER), tileY: integer(position.tileY, `$.positions[${index}].tileY`, Number.MIN_SAFE_INTEGER), ...(position.variant === undefined ? {} : { variant: integer(position.variant, `$.positions[${index}].variant`) }) }; }) }) });
}

const tileRectangle = (value: unknown, path: string): SpaceTileRectangle => {
  const entry = object(value, path);
  return {
    minimumTileX: integer(entry.minimumTileX, `${path}.minimumTileX`, Number.MIN_SAFE_INTEGER),
    maximumTileX: integer(entry.maximumTileX, `${path}.maximumTileX`, Number.MIN_SAFE_INTEGER),
    minimumTileY: integer(entry.minimumTileY, `${path}.minimumTileY`, Number.MIN_SAFE_INTEGER),
    maximumTileY: integer(entry.maximumTileY, `${path}.maximumTileY`, Number.MIN_SAFE_INTEGER),
  };
};

const surfaceFootprint = (value: unknown, path: string): SpaceSurfaceFootprint => {
  const offsets = array(value, path);
  if (offsets.length !== 4) {
    throw new ContentParseError('invalid_type', path, 'expected [left,top,right,bottom] tile offsets');
  }
  const footprint = [
    integer(offsets[0], `${path}[0]`, Number.MIN_SAFE_INTEGER),
    integer(offsets[1], `${path}[1]`, Number.MIN_SAFE_INTEGER),
    integer(offsets[2], `${path}[2]`, Number.MIN_SAFE_INTEGER),
    integer(offsets[3], `${path}[3]`, Number.MIN_SAFE_INTEGER),
  ] as const;
  if (footprint[0] > footprint[2] || footprint[1] > footprint[3]) {
    throw new ContentParseError('invalid_type', path, 'surface footprint offsets must be ordered');
  }
  return footprint;
};

const decorationCollisionProfile = (value: unknown, path: string): SpaceDecorationCollisionProfile => {
  const fields = array(value, path);
  if (fields.length < 6) {
    throw new ContentParseError(
      'invalid_type', path, 'expected [mediumMask,left,top,right,bottom,...decorationKinds]',
    );
  }
  const mediumMask = integer(fields[0], `${path}[0]`, 1);
  if (mediumMask > 3) {
    throw new ContentParseError('invalid_type', `${path}[0]`, 'unknown collision medium bits');
  }
  const footprint = surfaceFootprint(fields.slice(1, 5), path);
  return [
    mediumMask as 1 | 2 | 3,
    ...footprint,
    ...fields.slice(5).map((kind, index) => string(kind, `${path}[${index + 5}]`)),
  ];
};

const decorationPaletteEntries = (value: unknown, path: string): readonly SpaceDecorationPaletteEntry[] => {
  const entries = array(value, path);
  if (entries.length === 0) throw new ContentParseError('invalid_type', path, 'expected palette entries');
  return entries.map((value, index) => {
    const entryPath = `${path}[${index}]`;
    const fields = array(value, entryPath);
    if (fields.length !== 2) throw new ContentParseError('invalid_type', entryPath, 'expected [kind,value]');
    return [string(fields[0], `${entryPath}[0]`), integer(fields[1], `${entryPath}[1]`, 1)] as const;
  });
};

const decorationGenerator = (value: unknown, path: string): SpaceDecorationGeneratorDefinition => {
  const fields = array(value, path);
  if (fields.length !== 7) throw new ContentParseError('invalid_type', path, 'expected seven generator palettes');
  const poiKinds = array(fields[1], `${path}[1]`).map((kind, index) => (
    string(kind, `${path}[1][${index}]`)
  ));
  if (poiKinds.length === 0) throw new ContentParseError('invalid_type', `${path}[1]`, 'expected POI kinds');
  const ambient = array(fields[5], `${path}[5]`);
  if (ambient.length !== 3) {
    throw new ContentParseError('invalid_type', `${path}[5]`, 'expected [primaryKind,accentKind,accentWeight]');
  }
  return [
    decorationPaletteEntries(fields[0], `${path}[0]`),
    poiKinds,
    decorationPaletteEntries(fields[2], `${path}[2]`),
    string(fields[3], `${path}[3]`),
    decorationPaletteEntries(fields[4], `${path}[4]`),
    [
      string(ambient[0], `${path}[5][0]`),
      string(ambient[1], `${path}[5][1]`),
      integer(ambient[2], `${path}[5][2]`, 1),
    ],
    decorationPaletteEntries(fields[6], `${path}[6]`),
  ];
};

const decorationRule = (value: unknown, path: string): LandmarkDecorationRule => {
  const entry = object(value, path);
  const ruleKind = string(entry.kind, `${path}.kind`);
  if (entry.layer !== undefined && entry.layer !== 'ground' && entry.layer !== 'objects'
    && entry.layer !== 'gameplay' && entry.layer !== 'canopy') {
    throw new ContentParseError('invalid_type', `${path}.layer`, 'unknown landmark presentation layer');
  }
  if (entry.role !== undefined && entry.role !== 'soil.watered') {
    throw new ContentParseError('invalid_type', `${path}.role`, 'unknown landmark decoration role');
  }
  const presentation = {
    ...(entry.layer === undefined ? {} : { layer: entry.layer as LandmarkDecorationLayer }),
    ...(entry.role === undefined ? {} : { role: entry.role as LandmarkDecorationRole }),
  };
  if (ruleKind === 'point') {
    let placeable: Extract<LandmarkDecorationRule, { kind: 'point' }>['placeable'];
    if (entry.placeable !== undefined) {
      const source = object(entry.placeable, `${path}.placeable`);
      let automation: LandmarkAutomationDefinition | undefined;
      if (source.automation !== undefined) {
        const schedule = object(source.automation, `${path}.placeable.automation`);
        automation = {
          actor: reference(schedule.actor, 'npc', `${path}.placeable.automation.actor`),
          lightMinute: integer(schedule.lightMinute, `${path}.placeable.automation.lightMinute`),
          extinguishMinute: integer(schedule.extinguishMinute, `${path}.placeable.automation.extinguishMinute`),
          jitterMinutes: integer(schedule.jitterMinutes, `${path}.placeable.automation.jitterMinutes`),
          lightSalt: string(schedule.lightSalt, `${path}.placeable.automation.lightSalt`),
          extinguishSalt: string(schedule.extinguishSalt, `${path}.placeable.automation.extinguishSalt`),
        };
      }
      placeable = {
        runtimeId: string(source.runtimeId, `${path}.placeable.runtimeId`),
        object: reference(source.object, 'object', `${path}.placeable.object`),
        ...(automation === undefined ? {} : { automation }),
      };
    }
    return {
      ...presentation, kind: 'point', decorationKind: string(entry.decorationKind, `${path}.decorationKind`),
      tileX: integer(entry.tileX, `${path}.tileX`, Number.MIN_SAFE_INTEGER),
      tileY: integer(entry.tileY, `${path}.tileY`, Number.MIN_SAFE_INTEGER),
      ...(entry.variant === undefined ? {} : { variant: integer(entry.variant, `${path}.variant`) }),
      ...(entry.animationOffset === undefined ? {} : { animationOffset: integer(entry.animationOffset, `${path}.animationOffset`) }),
      ...(entry.idOffset === undefined ? {} : { idOffset: integer(entry.idOffset, `${path}.idOffset`) }),
      ...(entry.roles === undefined ? {} : { roles: array(entry.roles, `${path}.roles`).map((role, index) => string(role, `${path}.roles[${index}]`)) }),
      ...(placeable === undefined ? {} : { placeable }),
    };
  }
  if (ruleKind === 'fence_rectangle') return {
    ...presentation, kind: 'fence_rectangle', decorationKind: string(entry.decorationKind, `${path}.decorationKind`),
    gateKind: string(entry.gateKind, `${path}.gateKind`), bounds: tileRectangle(entry.bounds, `${path}.bounds`),
    gateTileX: integer(entry.gateTileX, `${path}.gateTileX`, Number.MIN_SAFE_INTEGER),
    gateTileY: integer(entry.gateTileY, `${path}.gateTileY`, Number.MIN_SAFE_INTEGER),
  };
  if (ruleKind === 'fill_rectangle') return {
    ...presentation, kind: 'fill_rectangle', decorationKind: string(entry.decorationKind, `${path}.decorationKind`),
    startTileX: integer(entry.startTileX, `${path}.startTileX`, Number.MIN_SAFE_INTEGER),
    startTileY: integer(entry.startTileY, `${path}.startTileY`, Number.MIN_SAFE_INTEGER),
    width: integer(entry.width, `${path}.width`, 1), height: integer(entry.height, `${path}.height`, 1),
    ...(entry.variant === undefined ? {} : { variant: integer(entry.variant, `${path}.variant`) }),
    ...(entry.animationOffsetX === undefined ? {} : { animationOffsetX: integer(entry.animationOffsetX, `${path}.animationOffsetX`) }),
    ...(entry.animationOffsetY === undefined ? {} : { animationOffsetY: integer(entry.animationOffsetY, `${path}.animationOffsetY`) }),
  };
  throw new ContentParseError('invalid_type', `${path}.kind`, 'unknown landmark decoration rule');
};

function parseRunEntrances(value: unknown): readonly SpaceRunEntrance[] {
  const entries = array(value, '$.runEntrances');
  if (entries.length > 32) throw new ContentParseError('invalid_type', '$.runEntrances', 'at most 32 run entrances');
  const ids = new Set<string>();
  return entries.map((entry, index) => {
    const path = `$.runEntrances[${index}]`;
    const source = object(entry, path);
    const id = string(source.id, `${path}.id`);
    if (ids.has(id)) throw new ContentParseError('invalid_type', `${path}.id`, 'duplicate run entrance');
    ids.add(id);
    if (source.kind !== 'roguelike') throw new ContentParseError('invalid_type', `${path}.kind`, 'unknown run kind');
    const reachTiles = number(source.reachTiles, `${path}.reachTiles`, 0.25);
    if (reachTiles > 4) throw new ContentParseError('invalid_type', `${path}.reachTiles`, 'reach must not exceed 4 tiles');
    return { id, kind: 'roguelike', reachTiles,
      tileX: integer(source.tileX, `${path}.tileX`, Number.MIN_SAFE_INTEGER),
      tileY: integer(source.tileY, `${path}.tileY`, Number.MIN_SAFE_INTEGER) };
  });
}

const tilePoint = (value: unknown, path: string): readonly [number, number] => {
  const values = array(value, path);
  if (values.length !== 2) throw new ContentParseError('invalid_type', path, 'expected [tileX,tileY]');
  return [integer(values[0], `${path}[0]`, Number.MIN_SAFE_INTEGER),
    integer(values[1], `${path}[1]`, Number.MIN_SAFE_INTEGER)];
};

function parseHearthLobby(value: unknown): HearthLobbyContentDefinition {
  const source = object(value, '$.hearthLobby');
  const pointSource = object(source.points, '$.hearthLobby.points');
  const pointNames = ['arrival', 'exit', 'stash', 'descent', 'counter', 'practice'] as const;
  const points = Object.fromEntries(pointNames.map((name) => [
    name, tilePoint(pointSource[name], `$.hearthLobby.points.${name}`),
  ])) as unknown as HearthLobbyContentDefinition['points'];
  const tuple = (entry: unknown, path: string, length: number): readonly unknown[] => {
    const values = array(entry, path);
    if (values.length !== length) throw new ContentParseError('invalid_type', path, `expected ${length}-field tuple`);
    return values;
  };
  const runtimeId = (value: unknown, path: string): string => {
    const result = string(value, path);
    if (!/^\d+$/u.test(result) || BigInt(result) <= 0n) {
      throw new ContentParseError('invalid_type', path, 'expected positive unsigned integer text');
    }
    return result;
  };
  const placed = (entry: unknown, path: string) => {
    const values = tuple(entry, path, 5);
    return [runtimeId(values[0], `${path}[0]`), reference(values[1], 'object', `${path}[1]`),
      string(values[2], `${path}[2]`), integer(values[3], `${path}[3]`, Number.MIN_SAFE_INTEGER),
      integer(values[4], `${path}[4]`, Number.MIN_SAFE_INTEGER)] as const;
  };
  return {
    points,
    stashCapacity: integer(source.stashCapacity, '$.hearthLobby.stashCapacity', 1),
    floorThresholdY: integer(source.floorThresholdY, '$.hearthLobby.floorThresholdY'),
    carves: array(source.carves, '$.hearthLobby.carves').map((entry, index) => {
      const path = `$.hearthLobby.carves[${index}]`, values = tuple(entry, path, 4);
      return [integer(values[0], `${path}[0]`, Number.MIN_SAFE_INTEGER),
        integer(values[1], `${path}[1]`, Number.MIN_SAFE_INTEGER),
        integer(values[2], `${path}[2]`, Number.MIN_SAFE_INTEGER),
        integer(values[3], `${path}[3]`, Number.MIN_SAFE_INTEGER)] as const;
    }),
    practiceTarget: placed(source.practiceTarget, '$.hearthLobby.practiceTarget'),
    torches: array(source.torches, '$.hearthLobby.torches').map((entry, index) =>
      placed(entry, `$.hearthLobby.torches[${index}]`)),
    fixtures: array(source.fixtures, '$.hearthLobby.fixtures').map((entry, index) => {
      const path = `$.hearthLobby.fixtures[${index}]`, values = array(entry, path);
      if (values.length !== 7 && values.length !== 8) {
        throw new ContentParseError('invalid_type', path, 'expected 7- or 8-field fixture tuple');
      }
      const fixture = [string(values[0], `${path}[0]`), reference(values[1], 'object', `${path}[1]`),
        string(values[2], `${path}[2]`), integer(values[3], `${path}[3]`, Number.MIN_SAFE_INTEGER),
        integer(values[4], `${path}[4]`, Number.MIN_SAFE_INTEGER), integer(values[5], `${path}[5]`, 1),
        integer(values[6], `${path}[6]`, 1)] as const;
      return values[7] === undefined ? fixture
        : [...fixture, string(values[7], `${path}[7]`)] as const;
    }),
  };
}

const compactTuple = (value: unknown, path: string, lengths: readonly number[]): readonly unknown[] => {
  const values = array(value, path);
  if (!lengths.includes(values.length)) throw new ContentParseError('invalid_type', path, `expected ${lengths.join('- or ')}-field tuple`);
  return values;
};

function parseHearthInteriorCatalog(value: unknown): HearthInteriorCatalogContentDefinition {
  const values = compactTuple(value, '$.hearthInteriorCatalog', [8]);
  const parsed = values.map((entry, index) => integer(entry, `$.hearthInteriorCatalog[${index}]`, Number.MIN_SAFE_INTEGER));
  return parsed as unknown as HearthInteriorCatalogContentDefinition;
}

function parseHearthInterior(value: unknown): HearthInteriorContentDefinition {
  const values = compactTuple(value, '$.hearthInterior', [3, 4]);
  const kind = string(values[0], '$.hearthInterior[0]') as HearthInteriorContentKind;
  if (!['i', 'g', 'c', 'f', 's', 'u'].includes(kind)) {
    throw new ContentParseError('invalid_type', '$.hearthInterior[0]', 'unknown hearth interior kind');
  }
  const rooms = string(values[1], '$.hearthInterior[1]');
  if (rooms.split(';').some(room => !/^[0-9a-z]{4}$/u.test(room))) {
    throw new ContentParseError('invalid_type', '$.hearthInterior[1]', 'invalid compact room list');
  }
  const furniture = string(values[2], '$.hearthInterior[2]');
  if (furniture.split(';').some(item => !/^[0-9a-z]{4}(?:-[0-9a-z]+|[0-9a-z]{2}(?:![a-z0-9_]+)?)?$/u.test(item))) {
    throw new ContentParseError('invalid_type', '$.hearthInterior[2]', 'invalid compact furniture list');
  }
  const service = values[3] === undefined ? undefined : string(values[3], '$.hearthInterior[3]');
  if (service !== undefined && !/^[0-9a-z]{4}$/u.test(service)) {
    throw new ContentParseError('invalid_type', '$.hearthInterior[3]', 'invalid compact service points');
  }
  return service === undefined ? [kind, rooms, furniture] : [kind, rooms, furniture, service];
}

function parseFerryDestinations(value: unknown): readonly SpaceFerryDestinationDefinition[] {
  const ids = new Set<string>();
  let homes = 0;
  const destinations = array(value, '$.ferry').map((entry, index) => {
    const path = `$.ferry[${index}]`, fields = compactTuple(entry, path, [8]);
    const id = string(fields[0], `${path}[0]`);
    if (!/^[a-z0-9]+(?:_[a-z0-9]+)*$/u.test(id) || ids.has(id)) {
      throw new ContentParseError('invalid_type', `${path}[0]`, 'expected unique ferry destination id');
    }
    ids.add(id);
    const flags = integer(fields[7], `${path}[7]`);
    if (flags > 7) throw new ContentParseError('invalid_type', `${path}[7]`, 'unknown ferry destination flags');
    if ((flags & 1) !== 0) homes += 1;
    return [id, string(fields[1], `${path}[1]`),
      integer(fields[2], `${path}[2]`, Number.MIN_SAFE_INTEGER),
      integer(fields[3], `${path}[3]`, Number.MIN_SAFE_INTEGER),
      integer(fields[4], `${path}[4]`, Number.MIN_SAFE_INTEGER),
      integer(fields[5], `${path}[5]`, Number.MIN_SAFE_INTEGER),
      string(fields[6], `${path}[6]`), flags] as const;
  });
  if (destinations.length !== 3 || homes !== 1) {
    throw new ContentParseError('invalid_type', '$.ferry', 'ferry network requires three destinations and one home');
  }
  return Object.freeze(destinations);
}

function parseSupplyCache(value: unknown): SpaceSupplyCacheDefinition {
  const fields = compactTuple(value, '$.supplyCache', [9]);
  const endpointId = string(fields[0], '$.supplyCache[0]');
  if (!/^[a-z0-9]+(?:_[a-z0-9]+)*$/u.test(endpointId)) {
    throw new ContentParseError('invalid_type', '$.supplyCache[0]', 'expected supply-cache endpoint id');
  }
  return [endpointId, reference(fields[1], 'object', '$.supplyCache[1]'),
    string(fields[2], '$.supplyCache[2]'), string(fields[3], '$.supplyCache[3]'),
    integer(fields[4], '$.supplyCache[4]'),
    integer(fields[5], '$.supplyCache[5]', Number.MIN_SAFE_INTEGER),
    integer(fields[6], '$.supplyCache[6]', Number.MIN_SAFE_INTEGER),
    integer(fields[7], '$.supplyCache[7]', Number.MIN_SAFE_INTEGER),
    integer(fields[8], '$.supplyCache[8]', Number.MIN_SAFE_INTEGER)] as const;
}

export function parseSpaceContentDefinition(value: string | unknown): SpaceContentDefinition {
  const source = sourceFor(value, 'space');
  const ambient = source.ambient === 'clock' ? 'clock' : (() => { const color = object(source.ambient, '$.ambient'); return { r: integer(color.r, '$.ambient.r'), g: integer(color.g, '$.ambient.g'), b: integer(color.b, '$.ambient.b') }; })();
  return Object.freeze({ ...base(source, 'space'), spaceId: integer(source.spaceId, '$.spaceId'), name: string(source.name, '$.name'), sizeTiles: integer(source.sizeTiles, '$.sizeTiles', 1), generator: string(source.generator, '$.generator') as SpaceContentDefinition['generator'], environment: string(source.environment, '$.environment') as SpaceContentDefinition['environment'], ambient, weather: boolean(source.weather, '$.weather'), audioBed: string(source.audioBed, '$.audioBed') as SpaceContentDefinition['audioBed'], ...(source.ownerOnly === undefined ? {} : { ownerOnly: boolean(source.ownerOnly, '$.ownerOnly') }), ...(source.hearthLobby === undefined ? {} : { hearthLobby: parseHearthLobby(source.hearthLobby) }), ...(source.hearthInteriorCatalog === undefined ? {} : { hearthInteriorCatalog: parseHearthInteriorCatalog(source.hearthInteriorCatalog) }), ...(source.hearthInterior === undefined ? {} : { hearthInterior: parseHearthInterior(source.hearthInterior) }), ...(source.runEntrances === undefined ? {} : { runEntrances: parseRunEntrances(source.runEntrances) }), ...(source.surfaces === undefined ? {} : { surfaces: array(source.surfaces, '$.surfaces').map((entry, index) => { const surface = object(entry, `$.surfaces[${index}]`); return { id: string(surface.id, `$.surfaces[${index}].id`), kind: string(surface.kind, `$.surfaces[${index}].kind`), tileX: integer(surface.tileX, `$.surfaces[${index}].tileX`, Number.MIN_SAFE_INTEGER), tileY: integer(surface.tileY, `$.surfaces[${index}].tileY`, Number.MIN_SAFE_INTEGER), capacity: integer(surface.capacity, `$.surfaces[${index}].capacity`, 1), footprint: surfaceFootprint(surface.footprint, `$.surfaces[${index}].footprint`) }; }) }), ...(source.decorationCollision === undefined ? {} : { decorationCollision: array(source.decorationCollision, '$.decorationCollision').map((entry, index) => decorationCollisionProfile(entry, `$.decorationCollision[${index}]`)) }), ...(source.decorationGenerator === undefined ? {} : { decorationGenerator: decorationGenerator(source.decorationGenerator, '$.decorationGenerator') }), ...(source.ferry === undefined ? {} : { ferry: parseFerryDestinations(source.ferry) }), ...(source.supplyCache === undefined ? {} : { supplyCache: parseSupplyCache(source.supplyCache) }), ...(source.landmarks === undefined ? {} : { landmarks: array(source.landmarks, '$.landmarks').map((entry, index) => { const landmark = object(entry, `$.landmarks[${index}]`); return { id: string(landmark.id, `$.landmarks[${index}].id`), label: string(landmark.label, `$.landmarks[${index}].label`), runtimeIdBase: string(landmark.runtimeIdBase, `$.landmarks[${index}].runtimeIdBase`), bounds: tileRectangle(landmark.bounds, `$.landmarks[${index}].bounds`), decorations: array(landmark.decorations, `$.landmarks[${index}].decorations`).map((rule, ruleIndex) => decorationRule(rule, `$.landmarks[${index}].decorations[${ruleIndex}]`)), ...(landmark.pathAreas === undefined ? {} : { pathAreas: array(landmark.pathAreas, `$.landmarks[${index}].pathAreas`).map((area, areaIndex) => tileRectangle(area, `$.landmarks[${index}].pathAreas[${areaIndex}]`)) }), ...(landmark.groundWalkableAreas === undefined ? {} : { groundWalkableAreas: array(landmark.groundWalkableAreas, `$.landmarks[${index}].groundWalkableAreas`).map((area, areaIndex) => tileRectangle(area, `$.landmarks[${index}].groundWalkableAreas[${areaIndex}]`)) }) }; }) }), ...(source.portals === undefined ? {} : { portals: array(source.portals, '$.portals').map((entry, index) => { const portal = object(entry, `$.portals[${index}]`); return { runtimeId: string(portal.runtimeId, `$.portals[${index}].runtimeId`), portalKind: string(portal.portalKind, `$.portals[${index}].portalKind`), fromSpace: reference(portal.fromSpace, 'space', `$.portals[${index}].fromSpace`), fromTileX: integer(portal.fromTileX, `$.portals[${index}].fromTileX`, Number.MIN_SAFE_INTEGER), fromTileY: integer(portal.fromTileY, `$.portals[${index}].fromTileY`, Number.MIN_SAFE_INTEGER), toSpace: reference(portal.toSpace, 'space', `$.portals[${index}].toSpace`), toTileX: integer(portal.toTileX, `$.portals[${index}].toTileX`, Number.MIN_SAFE_INTEGER), toTileY: integer(portal.toTileY, `$.portals[${index}].toTileY`, Number.MIN_SAFE_INTEGER) }; }) }) });
}

function parseSkillPassives(value: unknown, path: string): SkillNodePassives {
  const source = object(value, path);
  for (const key of Object.keys(source)) {
    if (!['buriedOreDetectionRadiusTiles', 'identifyBuriedOre', 'minimapResources', 'minimapRadiusTiles'].includes(key)) {
      throw new ContentParseError('invalid_type', `${path}.${key}`, 'unsupported passive skill effect');
    }
  }
  const radius = source.buriedOreDetectionRadiusTiles === undefined ? undefined
    : integer(source.buriedOreDetectionRadiusTiles, `${path}.buriedOreDetectionRadiusTiles`, 1);
  if (radius !== undefined && radius > 64) throw new ContentParseError('invalid_type', `${path}.buriedOreDetectionRadiusTiles`, 'radius must be at most 64 tiles');
  const minimapResources = source.minimapResources === undefined ? undefined
    : array(source.minimapResources, `${path}.minimapResources`).map((value, index) => {
      if (value !== 'ore' && value !== 'fish_pool') throw new ContentParseError('invalid_type', `${path}.minimapResources[${index}]`, 'expected ore or fish_pool');
      return value;
    });
  if (minimapResources !== undefined && new Set(minimapResources).size !== minimapResources.length) {
    throw new ContentParseError('invalid_type', `${path}.minimapResources`, 'resource categories must be unique');
  }
  const minimapRadiusTiles = source.minimapRadiusTiles === undefined ? undefined
    : integer(source.minimapRadiusTiles, `${path}.minimapRadiusTiles`, 1);
  if (minimapRadiusTiles !== undefined && minimapRadiusTiles > 64) throw new ContentParseError('invalid_type', `${path}.minimapRadiusTiles`, 'radius must be at most 64 tiles');
  if ((minimapResources !== undefined) !== (minimapRadiusTiles !== undefined)
    || minimapResources?.length === 0) {
    throw new ContentParseError('invalid_type', path, 'minimap resources and radius must be authored together with at least one category');
  }
  return {
    ...(minimapRadiusTiles === undefined ? {} : { minimapRadiusTiles }),
    ...(radius === undefined ? {} : { buriedOreDetectionRadiusTiles: radius }),
    ...(source.identifyBuriedOre === undefined ? {} : { identifyBuriedOre: boolean(source.identifyBuriedOre, `${path}.identifyBuriedOre`) }),
    ...(minimapResources === undefined ? {} : { minimapResources }),
  };
}

export function parseSkillTreeDefinition(value: string | unknown): SkillTreeContentDefinition {
  const source = sourceFor(value, 'skill_tree');
  const track = string(source.track, '$.track') as SkillTrack;
  const nodes = array(source.nodes, '$.nodes').map((node, index) => {
    const path = `$.nodes[${index}]`;
    const entry = object(node, path);
    const id = string(entry.id, `${path}.id`);
    const position = array(entry.position, `${path}.position`);
    const capabilities = entry.capabilities === undefined ? undefined
      : array(entry.capabilities, `${path}.capabilities`).map((capability, capabilityIndex) => {
        const parsed = string(capability, `${path}.capabilities[${capabilityIndex}]`);
        if (!(SKILL_NODE_CAPABILITIES as readonly string[]).includes(parsed)) {
          throw new ContentParseError(
            'invalid_type', `${path}.capabilities[${capabilityIndex}]`, 'unsupported skill capability',
          );
        }
        return parsed as SkillNodeCapability;
      });
    if (capabilities !== undefined && (capabilities.length === 0
      || capabilities.length > SKILL_NODE_CAPABILITIES.length
      || new Set(capabilities).size !== capabilities.length
      || entry.implemented !== true || entry.root === true)) {
      throw new ContentParseError(
        'invalid_type', `${path}.capabilities`,
        'capabilities require one or more unique entries on an implemented non-root node',
      );
    }
    return {
      ...parseSkillGearMetadata(entry, path),
      id,
      // Historical schema-v1 rows predate explicit art identity. Canonical
      // source authors this field; the derived value exists only so an older
      // live revision remains readable during migration.
      iconAsset: entry.iconAsset === undefined
        ? `icon_skill_${id}`
        : string(entry.iconAsset, `${path}.iconAsset`),
      track: string(entry.track, `${path}.track`) as SkillTrack,
      name: string(entry.name, `${path}.name`),
      description: string(entry.description, `${path}.description`),
      position: [
        integer(position[0], `${path}.position[0]`, Number.MIN_SAFE_INTEGER),
        integer(position[1], `${path}.position[1]`, Number.MIN_SAFE_INTEGER),
      ] as const,
      connects: array(entry.connects, `${path}.connects`)
        .map((target, link) => string(target, `${path}.connects[${link}]`)),
      maxRank: integer(entry.maxRank, `${path}.maxRank`),
      pointCost: integer(entry.pointCost, `${path}.pointCost`),
      ...(entry.requiresLevel === undefined ? {} : { requiresLevel: integer(entry.requiresLevel, `${path}.requiresLevel`) }),
      ...(entry.root === undefined ? {} : { root: boolean(entry.root, `${path}.root`) }),
      ...(entry.specialization === undefined ? {} : { specialization: string(entry.specialization, `${path}.specialization`) as NonNullable<SkillNodeDefinition['specialization']> }),
      ...(entry.implemented === undefined ? {} : { implemented: boolean(entry.implemented, `${path}.implemented`) as true }),
      ...(entry.prerequisites === undefined ? {} : { prerequisites: array(entry.prerequisites, `${path}.prerequisites`).map((target, link) => string(target, `${path}.prerequisites[${link}]`)) }),
      ...(entry.passive === undefined ? {} : { passive: parseSkillPassives(entry.passive, `${path}.passive`) }),
      ...(capabilities === undefined ? {} : { capabilities }),
    };
  });
  return Object.freeze({ ...base(source, 'skill_tree'), track, levelCap: integer(source.levelCap, '$.levelCap', 1), nodes });
}

export function parseEffectContentDefinition(value: string | unknown): EffectContentDefinition {
  const source = sourceFor(value, 'effect');
  return Object.freeze({ ...base(source, 'effect'), name: string(source.name, '$.name'), maxStacks: integer(source.maxStacks, '$.maxStacks', 1), durationTicks: integer(source.durationTicks, '$.durationTicks', 1), modifiers: array(source.modifiers, '$.modifiers').map((entry, index) => modifier(entry, `$.modifiers[${index}]`)), ...(source.family === undefined ? {} : { family: string(source.family, '$.family') }), ...(source.scaleModifiersWithStacks === undefined ? {} : { scaleModifiersWithStacks: boolean(source.scaleModifiersWithStacks, '$.scaleModifiersWithStacks') }) });
}

export function parseStatisticDefinition(value: string | unknown): StatisticContentDefinition {
  const source = sourceFor(value, 'statistic');
  const milestones = array(source.milestones, '$.milestones').map((entry, index) => { const result = string(entry, `$.milestones[${index}]`); if (!/^\d+$/u.test(result)) throw new ContentParseError('invalid_type', `$.milestones[${index}]`, 'expected unsigned integer text'); return result; });
  return Object.freeze({ ...base(source, 'statistic'), name: string(source.name, '$.name'), description: string(source.description, '$.description'), category: string(source.category, '$.category') as StatisticContentDefinition['category'], unit: string(source.unit, '$.unit') as StatisticContentDefinition['unit'], aggregation: string(source.aggregation, '$.aggregation') as StatisticContentDefinition['aggregation'], subject: string(source.subject, '$.subject') as StatisticContentDefinition['subject'], milestones, ...(source.reserved === undefined ? {} : { reserved: boolean(source.reserved, '$.reserved') }) });
}

export function parseUpgradeDefinition(value: string | unknown): UpgradeContentDefinition {
  const source = sourceFor(value, 'upgrade');
  let mechanic:HomesteadUpgradeMechanicBinding|undefined;
  if(source.mechanic!==undefined){
    const tuple=array(source.mechanic,'$.mechanic');
    if(tuple.length!==2)throw new ContentParseError('invalid_type','$.mechanic','expected role and durable key');
    const role=string(tuple[0],'$.mechanic[0]');
    if(!(['soil','seed','barrel','vintage'] as const).includes(role as HomesteadUpgradeMechanic)){
      throw new ContentParseError('invalid_type','$.mechanic[0]',`unsupported upgrade mechanic ${role}`);
    }
    const durableKey=string(tuple[1],'$.mechanic[1]');
    if(!/^[a-z0-9]+(?:_[a-z0-9]+)*$/u.test(durableKey)){
      throw new ContentParseError('invalid_type','$.mechanic[1]','invalid durable upgrade key');
    }
    mechanic=Object.freeze([role as HomesteadUpgradeMechanic,durableKey]);
  }
  let delveBoon:DelveBoonTuple|undefined;
  if(source.delveBoon!==undefined){
    const tuple=array(source.delveBoon,'$.delveBoon');
    if(tuple.length!==3)throw new ContentParseError('invalid_type','$.delveBoon','expected three Delve boon fields');
    const durableId=string(tuple[0],'$.delveBoon[0]');
    if(!/^[a-z0-9]+(?:_[a-z0-9]+)*$/u.test(durableId))throw new ContentParseError('invalid_type','$.delveBoon[0]','invalid durable Delve boon id');
    const modifier=string(tuple[1],'$.delveBoon[1]');
    if(!(['s','b','a','m','c','x','h','k'] as const).includes(modifier as DelveBoonModifierCode)){
      throw new ContentParseError('invalid_type','$.delveBoon[1]',`unsupported Delve boon modifier ${modifier}`);
    }
    const magnitude=integer(tuple[2],'$.delveBoon[2]',1);
    if(magnitude>65_535)throw new ContentParseError('invalid_type','$.delveBoon[2]','Delve boon magnitude exceeds supported storage');
    delveBoon=Object.freeze([durableId,modifier as DelveBoonModifierCode,magnitude]);
  }
  if(mechanic===undefined&&delveBoon===undefined){
    return Object.freeze({...base(source,'upgrade'),legacyCompatibility:true,displayName:string(source.displayName,'$.displayName'),
      description:string(source.description,'$.description'),maximumRank:integer(source.maximumRank,'$.maximumRank',1),
      baseCostGold:number(source.baseCostGold,'$.baseCostGold'),costGrowth:number(source.costGrowth,'$.costGrowth',1)});
  }
  if(mechanic!==undefined&&delveBoon!==undefined)throw new ContentParseError('invalid_type','$','upgrade requires exactly one gameplay authority');
  const displayName=string(source.displayName,'$.displayName'),description=string(source.description,'$.description');
  return Object.freeze(delveBoon===undefined?{...base(source,'upgrade'),mechanic:mechanic as HomesteadUpgradeMechanicBinding,
    displayName,description,maximumRank:integer(source.maximumRank,'$.maximumRank',1),
    baseCostGold:number(source.baseCostGold,'$.baseCostGold'),costGrowth:number(source.costGrowth,'$.costGrowth',1)}
    :{...base(source,'upgrade'),displayName,description,delveBoon});
}

export function parseBalanceGroupDefinition(value: string | unknown): BalanceGroupContentDefinition {
  const source = sourceFor(value, 'balance_group');
  return Object.freeze({ ...base(source, 'balance_group'), title: string(source.title, '$.title'), description: string(source.description, '$.description'), entries: array(source.entries, '$.entries').map((entry, index) => reference(entry, 'balance', `$.entries[${index}]`)) });
}

export function compiledCropProjection(definition: CropContentDefinition) {
  return { kind: definition.id.slice('crop:'.length), displayName: definition.displayName, seedItemKind: definition.seedItem.slice('item:'.length), harvestItemKind: definition.harvestItem.slice('item:'.length), assetKey: definition.asset, signAssetKey: definition.signAsset, growthTicks: BigInt(definition.growthTicks), harvestQuantity: definition.harvestQuantity, seedBuyPriceBronze: definition.seedBuyPriceBronze, harvestSellPriceBronze: definition.harvestSellPriceBronze, ...(definition.seasonless === undefined ? {} : { seasonless: definition.seasonless }), ...(definition.tags === undefined ? {} : { tags: definition.tags }) };
}

export function compiledStatisticProjection(definition: StatisticContentDefinition) {
  return { name: definition.name, description: definition.description, category: definition.category,
    unit: definition.unit, aggregation: definition.aggregation, subject: definition.subject,
    milestones: definition.milestones.map(BigInt),
    ...(definition.reserved === undefined ? {} : { reserved: definition.reserved }) };
}

export function compiledCreatureProjection(definition: CreatureContentDefinition) {
  return { id: definition.id, species: definition.species,
    habitat: definition.habitat, variants: definition.variants, speedFixed: definition.speedFixed,
    wanderRadiusTiles: definition.wanderRadiusTiles, locomotion: definition.locomotion,
    sleepsAtNight: definition.sleepsAtNight, canGraze: definition.canGraze,
    ignoresObstacles: definition.ignoresObstacles, combat: definition.combat,
    panic: definition.panic,
    ...(definition.behavior === undefined ? {} : { behavior: definition.behavior }),
    ...(definition.hayFeeding === undefined ? {} : { hayFeeding: definition.hayFeeding }) };
}

export function compiledSpawnProjection(definition: SpawnContentDefinition) {
  if (definition.strategy !== 'packs' || !definition.target.startsWith('creature:')
    || definition.packCount === undefined || definition.packSize === undefined
    || definition.minimumPackSpacing === undefined) throw new Error(`spawn_not_legacy_compatible:${definition.id}`);
  return {
    species: definition.target.slice('creature:'.length) as WildlifeSpecies,
    packCount: definition.packCount,
    packSize: definition.packSize,
    minimumPackSpacing: definition.minimumPackSpacing,
  };
}

export function compiledSpaceProjection(definition: SpaceContentDefinition) {
  return { spaceId: definition.spaceId, name: definition.name, sizeTiles: definition.sizeTiles,
    generator: definition.generator, environment: definition.environment, ambient: definition.ambient,
    weather: definition.weather, audioBed: definition.audioBed,
    ...(definition.ownerOnly === undefined ? {} : { ownerOnly: definition.ownerOnly }),
    // Retiring a space disables new run admission without making characters
    // already there, or saved run return positions, lose their space resolver.
    ...(definition.retired === true || definition.runEntrances === undefined
      ? {} : { runEntrances: definition.runEntrances }) };
}

export function compiledUpgradeProjection(definition: HomesteadUpgradeContentDefinition) {
  return {
    kind: definition.mechanic[1] as HomesteadUpgradeKind,
    displayName: definition.displayName,
    description: definition.description,
    maximumRank: definition.maximumRank,
    baseCostGold: definition.baseCostGold,
    costGrowth: definition.costGrowth,
  };
}
