import type { SpaceRunEntrance } from '../spaces.js';
import type { Modifier } from '../modifiers.js';
import type { BalanceDefinitionId } from './balance-definition.js';
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

interface SkillNodeDefinition {
  readonly id: string;
  readonly track: SkillTrack;
  readonly name: string;
  readonly description: string;
  readonly position: readonly [x: number, y: number];
  readonly connects: readonly string[];
  readonly prerequisites?: readonly string[];
  readonly passive?: SkillNodePassives;
  readonly maxRank: number;
  readonly pointCost: number;
  readonly requiresLevel?: number;
  readonly root?: boolean;
  readonly specialization?: SkillSpecialization;
  readonly implemented?: true;
}

type SpaceGenerator = 'island' | 'mine' | 'homestead' | 'residence' | 'marlow_tent'
  | 'cellar' | 'roguelike' | 'debug_flat';
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
  readonly species: string;
  readonly habitat: WildlifeHabitat;
  readonly variants: number;
  readonly speedFixed: number;
  readonly wanderRadiusTiles: number;
  readonly locomotion: WildlifeLocomotion;
  readonly sleepsAtNight: boolean;
  readonly canGraze: boolean;
  readonly ignoresObstacles: boolean;
  readonly loot?: `loot:${string}`;
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
}) & { readonly layer?: LandmarkDecorationLayer };

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
  readonly runEntrances?: readonly SpaceRunEntrance[];
  readonly surfaces?: readonly {
    readonly id: string;
    readonly kind: string;
    readonly tileX: number;
    readonly tileY: number;
    readonly capacity: number;
  }[];
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

export interface UpgradeContentDefinition extends WorldDefinitionBase<'upgrade', UpgradeDefinitionId> {
  readonly displayName: string;
  readonly description: string;
  readonly maximumRank: number;
  readonly baseCostGold: number;
  readonly costGrowth: number;
}

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
  return Object.freeze({ ...base(source, 'crop'), displayName: string(source.displayName, '$.displayName'), seedItem: item(source.seedItem, '$.seedItem'), harvestItem: item(source.harvestItem, '$.harvestItem'), asset: string(source.asset, '$.asset'), signAsset: string(source.signAsset, '$.signAsset'), growthTicks: ticks, harvestQuantity: integer(source.harvestQuantity, '$.harvestQuantity', 1), seedBuyPriceBronze: integer(source.seedBuyPriceBronze, '$.seedBuyPriceBronze'), harvestSellPriceBronze: integer(source.harvestSellPriceBronze, '$.harvestSellPriceBronze'), ...(source.seasonless === undefined ? {} : { seasonless: boolean(source.seasonless, '$.seasonless') }), ...(source.tags === undefined ? {} : { tags: Object.freeze(array(source.tags, '$.tags').map((tag, index) => string(tag, `$.tags[${index}]`))) }) });
}

export function parseCreatureDefinition(value: string | unknown): CreatureContentDefinition {
  const source = sourceFor(value, 'creature');
  return Object.freeze({ ...base(source, 'creature'), species: string(source.species, '$.species'), habitat: string(source.habitat, '$.habitat') as CreatureContentDefinition['habitat'], variants: integer(source.variants, '$.variants', 1), speedFixed: integer(source.speedFixed, '$.speedFixed', 1), wanderRadiusTiles: integer(source.wanderRadiusTiles, '$.wanderRadiusTiles'), locomotion: string(source.locomotion, '$.locomotion') as CreatureContentDefinition['locomotion'], sleepsAtNight: boolean(source.sleepsAtNight, '$.sleepsAtNight'), canGraze: boolean(source.canGraze, '$.canGraze'), ignoresObstacles: boolean(source.ignoresObstacles, '$.ignoresObstacles'), ...(source.loot === undefined ? {} : { loot: reference(source.loot, 'loot', '$.loot') }) });
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

const decorationRule = (value: unknown, path: string): LandmarkDecorationRule => {
  const entry = object(value, path);
  const ruleKind = string(entry.kind, `${path}.kind`);
  if (entry.layer !== undefined && entry.layer !== 'ground' && entry.layer !== 'objects'
    && entry.layer !== 'gameplay' && entry.layer !== 'canopy') {
    throw new ContentParseError('invalid_type', `${path}.layer`, 'unknown landmark presentation layer');
  }
  const presentation = entry.layer === undefined ? {} : { layer: entry.layer as LandmarkDecorationLayer };
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

export function parseSpaceContentDefinition(value: string | unknown): SpaceContentDefinition {
  const source = sourceFor(value, 'space');
  const ambient = source.ambient === 'clock' ? 'clock' : (() => { const color = object(source.ambient, '$.ambient'); return { r: integer(color.r, '$.ambient.r'), g: integer(color.g, '$.ambient.g'), b: integer(color.b, '$.ambient.b') }; })();
  return Object.freeze({ ...base(source, 'space'), spaceId: integer(source.spaceId, '$.spaceId'), name: string(source.name, '$.name'), sizeTiles: integer(source.sizeTiles, '$.sizeTiles', 1), generator: string(source.generator, '$.generator') as SpaceContentDefinition['generator'], environment: string(source.environment, '$.environment') as SpaceContentDefinition['environment'], ambient, weather: boolean(source.weather, '$.weather'), audioBed: string(source.audioBed, '$.audioBed') as SpaceContentDefinition['audioBed'], ...(source.ownerOnly === undefined ? {} : { ownerOnly: boolean(source.ownerOnly, '$.ownerOnly') }), ...(source.runEntrances === undefined ? {} : { runEntrances: parseRunEntrances(source.runEntrances) }), ...(source.surfaces === undefined ? {} : { surfaces: array(source.surfaces, '$.surfaces').map((entry, index) => { const surface = object(entry, `$.surfaces[${index}]`); return { id: string(surface.id, `$.surfaces[${index}].id`), kind: string(surface.kind, `$.surfaces[${index}].kind`), tileX: integer(surface.tileX, `$.surfaces[${index}].tileX`, Number.MIN_SAFE_INTEGER), tileY: integer(surface.tileY, `$.surfaces[${index}].tileY`, Number.MIN_SAFE_INTEGER), capacity: integer(surface.capacity, `$.surfaces[${index}].capacity`, 1) }; }) }), ...(source.landmarks === undefined ? {} : { landmarks: array(source.landmarks, '$.landmarks').map((entry, index) => { const landmark = object(entry, `$.landmarks[${index}]`); return { id: string(landmark.id, `$.landmarks[${index}].id`), label: string(landmark.label, `$.landmarks[${index}].label`), runtimeIdBase: string(landmark.runtimeIdBase, `$.landmarks[${index}].runtimeIdBase`), bounds: tileRectangle(landmark.bounds, `$.landmarks[${index}].bounds`), decorations: array(landmark.decorations, `$.landmarks[${index}].decorations`).map((rule, ruleIndex) => decorationRule(rule, `$.landmarks[${index}].decorations[${ruleIndex}]`)), ...(landmark.pathAreas === undefined ? {} : { pathAreas: array(landmark.pathAreas, `$.landmarks[${index}].pathAreas`).map((area, areaIndex) => tileRectangle(area, `$.landmarks[${index}].pathAreas[${areaIndex}]`)) }), ...(landmark.groundWalkableAreas === undefined ? {} : { groundWalkableAreas: array(landmark.groundWalkableAreas, `$.landmarks[${index}].groundWalkableAreas`).map((area, areaIndex) => tileRectangle(area, `$.landmarks[${index}].groundWalkableAreas[${areaIndex}]`)) }) }; }) }), ...(source.portals === undefined ? {} : { portals: array(source.portals, '$.portals').map((entry, index) => { const portal = object(entry, `$.portals[${index}]`); return { runtimeId: string(portal.runtimeId, `$.portals[${index}].runtimeId`), portalKind: string(portal.portalKind, `$.portals[${index}].portalKind`), fromSpace: reference(portal.fromSpace, 'space', `$.portals[${index}].fromSpace`), fromTileX: integer(portal.fromTileX, `$.portals[${index}].fromTileX`, Number.MIN_SAFE_INTEGER), fromTileY: integer(portal.fromTileY, `$.portals[${index}].fromTileY`, Number.MIN_SAFE_INTEGER), toSpace: reference(portal.toSpace, 'space', `$.portals[${index}].toSpace`), toTileX: integer(portal.toTileX, `$.portals[${index}].toTileX`, Number.MIN_SAFE_INTEGER), toTileY: integer(portal.toTileY, `$.portals[${index}].toTileY`, Number.MIN_SAFE_INTEGER) }; }) }) });
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
    const entry = object(node, `$.nodes[${index}]`); const position = array(entry.position, `$.nodes[${index}].position`);
    return { id: string(entry.id, `$.nodes[${index}].id`), track: string(entry.track, `$.nodes[${index}].track`) as SkillTrack, name: string(entry.name, `$.nodes[${index}].name`), description: string(entry.description, `$.nodes[${index}].description`), position: [integer(position[0], `$.nodes[${index}].position[0]`, Number.MIN_SAFE_INTEGER), integer(position[1], `$.nodes[${index}].position[1]`, Number.MIN_SAFE_INTEGER)] as const, connects: array(entry.connects, `$.nodes[${index}].connects`).map((id, link) => string(id, `$.nodes[${index}].connects[${link}]`)), maxRank: integer(entry.maxRank, `$.nodes[${index}].maxRank`), pointCost: integer(entry.pointCost, `$.nodes[${index}].pointCost`), ...(entry.requiresLevel === undefined ? {} : { requiresLevel: integer(entry.requiresLevel, `$.nodes[${index}].requiresLevel`) }), ...(entry.root === undefined ? {} : { root: boolean(entry.root, `$.nodes[${index}].root`) }), ...(entry.specialization === undefined ? {} : { specialization: string(entry.specialization, `$.nodes[${index}].specialization`) as NonNullable<SkillNodeDefinition['specialization']> }), ...(entry.implemented === undefined ? {} : { implemented: boolean(entry.implemented, `$.nodes[${index}].implemented`) as true }), ...(entry.prerequisites === undefined ? {} : { prerequisites: array(entry.prerequisites, `$.nodes[${index}].prerequisites`).map((id, link) => string(id, `$.nodes[${index}].prerequisites[${link}]`)) }), ...(entry.passive === undefined ? {} : { passive: parseSkillPassives(entry.passive, `$.nodes[${index}].passive`) }) };
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
  return Object.freeze({ ...base(source, 'upgrade'), displayName: string(source.displayName, '$.displayName'), description: string(source.description, '$.description'), maximumRank: integer(source.maximumRank, '$.maximumRank', 1), baseCostGold: number(source.baseCostGold, '$.baseCostGold'), costGrowth: number(source.costGrowth, '$.costGrowth', 1) });
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
  return { habitat: definition.habitat, variants: definition.variants, speedFixed: definition.speedFixed,
    wanderRadiusTiles: definition.wanderRadiusTiles, locomotion: definition.locomotion,
    sleepsAtNight: definition.sleepsAtNight, canGraze: definition.canGraze,
    ignoresObstacles: definition.ignoresObstacles };
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

export function compiledUpgradeProjection(definition: UpgradeContentDefinition) {
  return {
    kind: definition.id.slice('upgrade:'.length) as HomesteadUpgradeKind,
    displayName: definition.displayName,
    description: definition.description,
    maximumRank: definition.maximumRank,
    baseCostGold: definition.baseCostGold,
    costGrowth: definition.costGrowth,
  };
}
