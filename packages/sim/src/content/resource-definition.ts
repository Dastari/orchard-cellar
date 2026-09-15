import { ContentParseError, CONTENT_SCHEMA_VERSION } from './parse-contract.js';
import type { ContentToolSpecialization } from './definitions.js';
import type { LootDefinitionId } from './loot-definition.js';

export type ResourceDefinitionId = `resource:${string}`;
export type ResourceInteractionMode = 'gather' | 'harvest' | 'mine' | 'fish';
export type ResourceVisualKind = 'tree' | 'ore' | 'rock' | 'gatherable' | 'fish';
export type ResourceDiscoveryKind = 'none' | 'ore' | 'fishing';
export type ResourceNodeClass = 'mixed' | 'pure' | 'pristine' | 'rock';
export type ResourceRespawnProfile = 'surface_ore' | 'fishing_pool' | 'fixed_site';
export type ResourceArtVariant = 'mining' | 'fixed';
export type ResourceLeafProfile = 'oak' | 'birch' | 'spruce';
export type ResourceVisualStage = readonly [asset: string, scalePermille: number];
export type ResourceFixedSiteDefinition = readonly [
  runtimeId: string,
  tileX: number,
  tileY: number,
  elevation: number,
  encounter: `encounter:${string}`,
];

export interface ResourceFootprintDefinition {
  /** Pixel offsets from the authored tile's bottom-centre anchor. */
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

export interface ResourceContentDefinition {
  readonly id: ResourceDefinitionId;
  readonly kind: 'resource';
  readonly schemaVersion: typeof CONTENT_SCHEMA_VERSION;
  readonly displayName: string;
  /** Persisted compatibility discriminator. It may differ from the definition slug. */
  readonly runtimeKind: string;
  readonly tags: readonly string[];
  readonly visual: {
    readonly kind: ResourceVisualKind;
    readonly asset: string;
    readonly anchorOffsetYPixels?: number;
    /** Compact authored presentation states. Renderer algorithms remain
     * selected by visual.kind; asset families and scales do not depend on a
     * persisted runtime kind. */
    readonly variant?: ResourceArtVariant;
    readonly states?: {
      readonly depleted: ResourceVisualStage;
      readonly depletedSmall?: ResourceVisualStage;
      readonly depletedMedium?: ResourceVisualStage;
      readonly small: ResourceVisualStage;
      readonly medium: ResourceVisualStage;
    };
    readonly leaf?: readonly [profile: ResourceLeafProfile, canopyWidth: number];
  };
  readonly collision: {
    readonly blocksMovement: boolean;
    readonly footprint: ResourceFootprintDefinition;
  };
  readonly target: {
    readonly footprint: ResourceFootprintDefinition;
  };
  readonly interaction: {
    readonly mode: ResourceInteractionMode;
    readonly event: 'use' | 'break';
    /** Optional player-facing noun when the visible resource and the item it
     * yields intentionally use different language. */
    readonly pickupLabel?: string;
    /** Optional player-facing noun when pickup feedback should differ from
     * the unique authored loot item's display name. */
    readonly pickupFeedbackLabel?: string;
    readonly tool?: {
      readonly specialization: ContentToolSpecialization;
      readonly minimumTier: number;
      /** Starter-compatible tool that must remain available for this cohort. */
      readonly baselineItem?: `item:${string}`;
    };
  };
  readonly health: {
    readonly initial: number;
    /** Tree/plant stages retain the existing 1/2/3 health progression. */
    readonly followsGrowthStage?: boolean;
  };
  /** Required growth stage before this fixed-site resource can be worked. */
  readonly maturityGrowthStage?: number;
  readonly mining?: {
    readonly nodeClass: ResourceNodeClass;
    readonly richness: number;
  };
  /** Plantable secondary output for mature fruit harvests. */
  readonly seedItem?: `item:${string}`;
  readonly loot: LootDefinitionId;
  /** Engine-owned short custody window for drops that belong to the actor
   * completing an authored resource action. */
  readonly lootDelivery?: 'actor_reserved';
  readonly regrowth?: {
    readonly enabled: true;
    readonly initialProgress: number;
  };
  readonly respawn?: {
    readonly profile: ResourceRespawnProfile;
  };
  /** Compact fixed-site authority: [stable row id, tile x, tile y, plane,
   * encounter definition]. Health/richness/tool/yield remain definition-owned. */
  readonly fixedSites?: readonly ResourceFixedSiteDefinition[];
  readonly discovery: {
    readonly kind: ResourceDiscoveryKind;
  };
  readonly statistics: {
    readonly depletion: 'tree' | 'cactus' | 'rock' | 'ore' | 'fish' | 'gatherable';
  };
  readonly retired?: boolean;
  readonly replacement?: ResourceDefinitionId;
}

const RESOURCE_ID = /^resource:[a-z0-9]+(?:_[a-z0-9]+)*$/u;
const LOOT_ID = /^loot:[a-z0-9]+(?:_[a-z0-9]+)*$/u;
const STABLE_NAME = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/u;
const INTERACTION_MODES = new Set<string>(['gather', 'harvest', 'mine', 'fish']);
const VISUAL_KINDS = new Set<string>(['tree', 'ore', 'rock', 'gatherable', 'fish']);
const DISCOVERY_KINDS = new Set<string>(['none', 'ore', 'fishing']);
const SPECIALIZATIONS = new Set<string>(['farming', 'mining', 'fishing', 'woodcutting']);
const NODE_CLASSES = new Set<string>(['mixed', 'pure', 'pristine', 'rock']);
const RESPAWN_PROFILES = new Set<string>(['surface_ore', 'fishing_pool', 'fixed_site']);
const STATISTICS = new Set<string>(['tree', 'cactus', 'rock', 'ore', 'fish', 'gatherable']);
const ART_VARIANTS = new Set<string>(['mining', 'fixed']);
const LEAF_PROFILES = new Set<string>(['oak', 'birch', 'spruce']);
const LOOT_DELIVERY = new Set<string>(['actor_reserved']);
const ENCOUNTER_ID = /^encounter:[a-z0-9]+(?:_[a-z0-9]+)*$/u;
const U64_MAX = (1n << 64n) - 1n;

function fail(path: string, message: string): never {
  throw new ContentParseError('invalid_type', path, message);
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) fail(path, 'expected an object');
  return value as Record<string, unknown>;
}

function stringValue(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length === 0) fail(path, 'expected a non-empty string');
  return value;
}

function stableName(value: unknown, path: string): string {
  const result = stringValue(value, path);
  if (!STABLE_NAME.test(result)) fail(path, `invalid stable name ${result}`);
  return result;
}

function integer(value: unknown, path: string, minimum = 0): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) fail(path, `expected a safe integer >= ${minimum}`);
  return value as number;
}

function booleanValue(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') fail(path, 'expected a boolean');
  return value;
}

function oneOf<T extends string>(value: unknown, path: string, values: ReadonlySet<string>): T {
  const result = stringValue(value, path);
  if (!values.has(result)) fail(path, `unsupported value ${result}`);
  return result as T;
}

function footprint(value: unknown, path: string): ResourceFootprintDefinition {
  const source = record(value, path);
  const result = {
    left: integer(source.left, `${path}.left`, Number.MIN_SAFE_INTEGER),
    right: integer(source.right, `${path}.right`, Number.MIN_SAFE_INTEGER),
    top: integer(source.top, `${path}.top`, Number.MIN_SAFE_INTEGER),
    bottom: integer(source.bottom, `${path}.bottom`, Number.MIN_SAFE_INTEGER),
  };
  if (result.left > result.right || result.top > result.bottom) fail(path, 'footprint bounds must be ordered');
  return result;
}

function visualStage(value: unknown, path: string): ResourceVisualStage {
  if (!Array.isArray(value) || value.length !== 2) fail(path, 'expected [asset, scalePermille]');
  return Object.freeze([
    stableName(value[0], `${path}[0]`), integer(value[1], `${path}[1]`, 1),
  ] as const);
}

function fixedSite(value: unknown, path: string): ResourceFixedSiteDefinition {
  if (!Array.isArray(value) || value.length !== 5) {
    fail(path, 'expected [runtimeId, tileX, tileY, elevation, encounter]');
  }
  const runtimeId = stringValue(value[0], `${path}[0]`);
  if (!/^\d+$/u.test(runtimeId) || BigInt(runtimeId) <= 0n || BigInt(runtimeId) > U64_MAX) {
    fail(`${path}[0]`, 'expected positive unsigned 64-bit integer text');
  }
  const encounter = stringValue(value[4], `${path}[4]`);
  if (!ENCOUNTER_ID.test(encounter)) fail(`${path}[4]`, 'expected encounter: slug');
  return Object.freeze([
    runtimeId,
    integer(value[1], `${path}[1]`),
    integer(value[2], `${path}[2]`),
    integer(value[3], `${path}[3]`, Number.MIN_SAFE_INTEGER),
    encounter as `encounter:${string}`,
  ] as const);
}

export function parseResourceDefinition(json: string | unknown): ResourceContentDefinition {
  let decoded: unknown;
  try { decoded = typeof json === 'string' ? JSON.parse(json) : json; }
  catch (error) { throw new ContentParseError('invalid_json', '$', error instanceof Error ? error.message : 'invalid JSON'); }
  const source = record(decoded, '$');
  const id = stringValue(source.id, '$.id');
  if (!RESOURCE_ID.test(id)) fail('$.id', `invalid resource definition id ${id}`);
  if (source.kind !== undefined && source.kind !== 'resource') fail('$.kind', 'expected resource');
  if (integer(source.schemaVersion, '$.schemaVersion', 1) !== CONTENT_SCHEMA_VERSION) {
    throw new ContentParseError('unsupported_schema_version', '$.schemaVersion', 'unsupported resource schema version');
  }
  const visual = record(source.visual, '$.visual');
  const visualStates = visual.states === undefined ? undefined : record(visual.states, '$.visual.states');
  const leaf = visual.leaf === undefined ? undefined : visual.leaf;
  if (leaf !== undefined && (!Array.isArray(leaf) || leaf.length !== 2)) fail('$.visual.leaf', 'expected [profile, canopyWidth]');
  const collision = record(source.collision, '$.collision');
  const target = record(source.target, '$.target');
  const interaction = record(source.interaction, '$.interaction');
  const health = record(source.health, '$.health');
  const discovery = record(source.discovery, '$.discovery');
  const statistics = record(source.statistics, '$.statistics');
  const tool = interaction.tool === undefined ? undefined : record(interaction.tool, '$.interaction.tool');
  const mining = source.mining === undefined ? undefined : record(source.mining, '$.mining');
  const regrowth = source.regrowth === undefined ? undefined : record(source.regrowth, '$.regrowth');
  const respawn = source.respawn === undefined ? undefined : record(source.respawn, '$.respawn');
  const fixedSites = source.fixedSites === undefined ? undefined
    : (Array.isArray(source.fixedSites) ? source.fixedSites : fail('$.fixedSites', 'expected an array'));
  const mode = oneOf<ResourceInteractionMode>(interaction.mode, '$.interaction.mode', INTERACTION_MODES);
  const event = stringValue(interaction.event, '$.interaction.event');
  if (event !== 'use' && event !== 'break') fail('$.interaction.event', 'expected use or break');
  if (mode === 'gather' ? tool !== undefined || event !== 'use' : tool === undefined || event !== 'break') {
    fail('$.interaction', 'gather uses no tool; harvest, mine, and fish require a tool and break event');
  }
  const pickupLabel = interaction.pickupLabel === undefined
    ? undefined : stringValue(interaction.pickupLabel, '$.interaction.pickupLabel');
  const pickupFeedbackLabel = interaction.pickupFeedbackLabel === undefined
    ? undefined : stringValue(interaction.pickupFeedbackLabel, '$.interaction.pickupFeedbackLabel');
  if (mode !== 'gather' && (pickupLabel !== undefined || pickupFeedbackLabel !== undefined)) {
    fail('$.interaction', 'pickup labels are only valid for gather interactions');
  }
  const loot = stringValue(source.loot, '$.loot');
  if (!LOOT_ID.test(loot)) fail('$.loot', `invalid loot definition id ${loot}`);
  const replacement = source.replacement === undefined ? undefined : stringValue(source.replacement, '$.replacement');
  if (replacement !== undefined && !RESOURCE_ID.test(replacement)) fail('$.replacement', 'invalid resource replacement id');
  if (regrowth !== undefined && booleanValue(regrowth.enabled, '$.regrowth.enabled') !== true) {
    fail('$.regrowth.enabled', 'expected true when regrowth is configured');
  }
  return Object.freeze({
    id: id as ResourceDefinitionId,
    kind: 'resource',
    schemaVersion: CONTENT_SCHEMA_VERSION,
    displayName: stringValue(source.displayName, '$.displayName'),
    runtimeKind: stableName(source.runtimeKind, '$.runtimeKind'),
    tags: Object.freeze((Array.isArray(source.tags) ? source.tags : fail('$.tags', 'expected an array'))
      .map((tag, index) => stableName(tag, `$.tags[${index}]`))),
    visual: Object.freeze({
      kind: oneOf<ResourceVisualKind>(visual.kind, '$.visual.kind', VISUAL_KINDS),
      asset: stableName(visual.asset, '$.visual.asset'),
      ...(visual.anchorOffsetYPixels === undefined ? {} : {
        anchorOffsetYPixels: integer(visual.anchorOffsetYPixels, '$.visual.anchorOffsetYPixels', Number.MIN_SAFE_INTEGER),
      }),
      ...(visual.variant === undefined ? {} : {
        variant: oneOf<ResourceArtVariant>(visual.variant, '$.visual.variant', ART_VARIANTS),
      }),
      ...(visualStates === undefined ? {} : { states: Object.freeze({
        depleted: visualStage(visualStates.depleted, '$.visual.states.depleted'),
        ...(visualStates.depletedSmall === undefined ? {} : {
          depletedSmall: visualStage(visualStates.depletedSmall, '$.visual.states.depletedSmall'),
        }),
        ...(visualStates.depletedMedium === undefined ? {} : {
          depletedMedium: visualStage(visualStates.depletedMedium, '$.visual.states.depletedMedium'),
        }),
        small: visualStage(visualStates.small, '$.visual.states.small'),
        medium: visualStage(visualStates.medium, '$.visual.states.medium'),
      }) }),
      ...(leaf === undefined ? {} : { leaf: Object.freeze([
        oneOf<ResourceLeafProfile>(leaf[0], '$.visual.leaf[0]', LEAF_PROFILES),
        integer(leaf[1], '$.visual.leaf[1]', 1),
      ] as const) }),
    }),
    collision: Object.freeze({
      blocksMovement: booleanValue(collision.blocksMovement, '$.collision.blocksMovement'),
      footprint: Object.freeze(footprint(collision.footprint, '$.collision.footprint')),
    }),
    target: Object.freeze({ footprint: Object.freeze(footprint(target.footprint, '$.target.footprint')) }),
    interaction: Object.freeze({
      mode,
      event,
      ...(pickupLabel === undefined ? {} : { pickupLabel }),
      ...(pickupFeedbackLabel === undefined ? {} : { pickupFeedbackLabel }),
      ...(tool === undefined ? {} : { tool: Object.freeze({
        specialization: oneOf<ContentToolSpecialization>(tool.specialization, '$.interaction.tool.specialization', SPECIALIZATIONS),
        minimumTier: integer(tool.minimumTier, '$.interaction.tool.minimumTier'),
        ...(tool.baselineItem === undefined ? {} : {
          baselineItem: (() => {
            const id = stringValue(tool.baselineItem, '$.interaction.tool.baselineItem');
            if (!/^item:[a-z0-9]+(?:_[a-z0-9]+)*$/u.test(id)) fail('$.interaction.tool.baselineItem', 'expected item: slug');
            return id as `item:${string}`;
          })(),
        }),
      }) }),
    }),
    health: Object.freeze({
      initial: integer(health.initial, '$.health.initial', 1),
      ...(health.followsGrowthStage === undefined ? {} : {
        followsGrowthStage: booleanValue(health.followsGrowthStage, '$.health.followsGrowthStage'),
      }),
    }),
    ...(source.maturityGrowthStage === undefined ? {} : {
      maturityGrowthStage: integer(source.maturityGrowthStage, '$.maturityGrowthStage', 1),
    }),
    ...(mining === undefined ? {} : { mining: Object.freeze({
      nodeClass: oneOf<ResourceNodeClass>(mining.nodeClass, '$.mining.nodeClass', NODE_CLASSES),
      richness: integer(mining.richness, '$.mining.richness', 1),
    }) }),
    ...(source.seedItem === undefined ? {} : { seedItem: (() => {
      const id = stringValue(source.seedItem, '$.seedItem');
      if (!/^item:[a-z0-9]+(?:_[a-z0-9]+)*$/u.test(id)) fail('$.seedItem', 'expected item: slug');
      return id as `item:${string}`;
    })() }),
    loot: loot as LootDefinitionId,
    ...(source.lootDelivery === undefined ? {} : {
      lootDelivery: oneOf<'actor_reserved'>(source.lootDelivery, '$.lootDelivery', LOOT_DELIVERY),
    }),
    ...(regrowth === undefined ? {} : { regrowth: Object.freeze({
      enabled: true,
      initialProgress: integer(regrowth.initialProgress, '$.regrowth.initialProgress'),
    }) }),
    ...(respawn === undefined ? {} : { respawn: Object.freeze({
      profile: oneOf<ResourceRespawnProfile>(respawn.profile, '$.respawn.profile', RESPAWN_PROFILES),
    }) }),
    ...(fixedSites === undefined ? {} : {
      fixedSites: Object.freeze(fixedSites.map((site, index) => fixedSite(site, `$.fixedSites[${index}]`))),
    }),
    discovery: Object.freeze({
      kind: oneOf<ResourceDiscoveryKind>(discovery.kind, '$.discovery.kind', DISCOVERY_KINDS),
    }),
    statistics: Object.freeze({
      depletion: oneOf<ResourceContentDefinition['statistics']['depletion']>(statistics.depletion, '$.statistics.depletion', STATISTICS),
    }),
    ...(source.retired === undefined ? {} : { retired: booleanValue(source.retired, '$.retired') }),
    ...(replacement === undefined ? {} : { replacement: replacement as ResourceDefinitionId }),
  });
}
