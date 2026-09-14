import {
  conditionKind,
  effectKind,
  type Condition,
  type Effect,
  type ItemAmount,
  type ItemMatch,
  type StateValue,
  type TilePosition,
  type ValueThreshold,
} from '../behaviour/effects.js';
import type { InteractionDefinition } from '../behaviour/handler.js';
import { ContentParseError, CONTENT_SCHEMA_VERSION } from './parse-contract.js';
import type {
  ContentToolSpecialization,
  ItemDefinitionId,
  RecipeDefinitionId,
} from './definitions.js';
import type { LootDefinitionId } from './loot-definition.js';

export type ObjectDefinitionId = `object:${string}`;
export type FrameDefinitionId = `frame:${string}`;

export interface ObjectIdentityComponent {
  readonly tags: readonly string[];
}

export interface ObjectSpriteComponent {
  readonly asset: string;
  readonly animationByState?: Readonly<Record<string, string>>;
  readonly scale?: number;
  readonly variants?: readonly string[];
  readonly fenceJoin?: boolean;
}

export interface ObjectCollisionComponent {
  /** Each cell is the same 4-bit horizontal mask already used by map prefabs. */
  readonly footprint: readonly (readonly number[])[];
  readonly blocksMovement: boolean;
  /** A lid opening is visual unless collision explicitly depends on its state. */
  readonly when?: { readonly state: string; readonly equals: StateValue };
  readonly occludesLight?: boolean;
}

/** Compact native furniture geometry. Placement already owns the grid footprint
 * and layer for ordinary floor/standing pieces. The short tuple stores only
 * semantics not represented there: a physical pixel base, optional tabletop
 * surface or seated-pose offset, or the two special overlay layers. */
export type ObjectFurnitureComponent =
  | readonly ['t' | 'w']
  | readonly [
    baseHalfWidth: number,
    baseDepth: number,
    surfaceOrSeat?: number | readonly [
      insetLeft: number,
      insetTop: number,
      width: number,
      height: number,
      liftPixels: number,
    ],
  ];

export interface ObjectPlacementComponent {
  readonly item: ItemDefinitionId;
  readonly layer: 'ground' | 'object' | 'overlay';
  readonly spaces: readonly string[];
  readonly facing: boolean;
  readonly footprint?: readonly (readonly number[])[];
  readonly requiresRole?: string;
  readonly connectsTo?: readonly string[];
}

export type ObjectStateDefinition =
  | { readonly type: 'bool'; readonly default: boolean }
  | { readonly type: 'enum'; readonly default: string; readonly values: readonly string[] }
  | { readonly type: 'counter'; readonly default: number; readonly min?: number; readonly max?: number };

export interface ObjectLightComponent {
  readonly when?: { readonly state: string; readonly equals: StateValue };
  readonly color: readonly [number, number, number];
  readonly radiusTiles: number;
  readonly profile: 'steady' | 'flicker';
  readonly offsetY?: number;
}

export interface ObjectSlotRestriction {
  readonly slots: readonly number[];
  readonly requiredTags?: readonly string[];
  readonly acceptedItems?: readonly ItemDefinitionId[];
  readonly readOnly?: boolean;
}

export interface ObjectContainerComponent {
  readonly slotCount: number;
  readonly access: 'public' | 'private';
  readonly sortAllowed: boolean;
  readonly restrictions?: readonly ObjectSlotRestriction[];
}

export type ProcessorRewardQuantity = 'input' | 'output' | 'units' | 'batch';
export type ProcessorRewardSubject = 'input' | 'output';

export interface ProcessorStatisticProjection {
  readonly statistic: `statistic:${string}`;
  readonly quantity: ProcessorRewardQuantity;
  readonly subject?: ProcessorRewardSubject;
  /** Restricts an output projection to active items carrying this tag. */
  readonly outputTag?: string;
}

export interface ProcessorCompletionRewards {
  /** Used only when the selected process has no process-level experience. */
  readonly experience?: {
    readonly skill: string;
    readonly amount: number;
    readonly batchAmount?: number;
  };
  readonly statistics: readonly ProcessorStatisticProjection[];
}

export interface ObjectProcessorComponent {
  readonly processTag: string;
  readonly slotRoles: Readonly<Record<string, readonly number[]>>;
  readonly ticksPerUnit: number;
  readonly catchUpCap: number;
  readonly autoStart: boolean;
  /** Optional explicit batch bounds for manually started processors. */
  readonly minimumBatch?: number;
  readonly maximumBatch?: number;
  readonly completionRewards?: ProcessorCompletionRewards;
}

export interface ObjectFrameComponent {
  readonly ref: FrameDefinitionId;
}

export interface ObjectFarmingComponent {
  /** Chebyshev coverage around this placed object's anchor, bounded by the engine. */
  readonly irrigation?: { readonly radiusTiles: number };
  /** Seasonal protection applies to the containing homestead, not solid building tiles. */
  readonly seasonProtection?: 'homestead';
}

interface ObjectDamageableRewards {
  /** Recipe inputs returned when this object is destroyed. */
  readonly salvageRecipe?: RecipeDefinitionId;
  /** Optional additional bounded loot table rolled after destruction. */
  readonly onBreakLoot?: LootDefinitionId;
}

export type ObjectDamageableComponent = ObjectDamageableRewards & (
  | {
    /** Discrete tool strikes stored in the existing placeable-damage row. */
    readonly model: 'hits';
    readonly maximumHits: number;
    readonly toolSpecialization: ContentToolSpecialization;
  }
  | {
    /** Centi-health stored by an authoritative combat-target row. */
    readonly model: 'health';
    readonly maximumHealthCenti: number;
    readonly minimumHealthCenti: number;
    readonly regeneration?: {
      readonly amountCenti: number;
      readonly everyTicks: number;
    };
    /** Stable entity placements for durable combat targets. Space identity is
     * authored so runtime materialization does not depend on a map fixture key. */
    readonly fixedTargets?: readonly (readonly [
      runtimeId: string,
      space: `space:${string}`,
      tileX: number,
      tileY: number,
    ])[];
  }
);

export type ObjectCarryComponent =
  | {
    /** Carrying moves the same durable entity; it never enters inventory. */
    readonly mode: 'preserve_entity';
  }
  | {
    /** Non-empty containers remain entities; empty ones may become this item. */
    readonly mode: 'preserve_entity_or_item_when_empty';
    readonly item: ItemDefinitionId;
  };

export interface ObjectContentComponents {
  readonly identity?: ObjectIdentityComponent;
  readonly sprite?: ObjectSpriteComponent;
  readonly collision?: ObjectCollisionComponent;
  readonly placement?: ObjectPlacementComponent;
  readonly states?: Readonly<Record<string, ObjectStateDefinition>>;
  readonly light?: ObjectLightComponent;
  readonly container?: ObjectContainerComponent;
  readonly processor?: ObjectProcessorComponent;
  readonly interactions?: readonly InteractionDefinition[];
  readonly frame?: ObjectFrameComponent;
  readonly farming?: ObjectFarmingComponent;
  readonly damageable?: ObjectDamageableComponent;
  readonly carry?: ObjectCarryComponent;
  readonly furniture?: ObjectFurnitureComponent;
}

export interface ObjectContentDefinition {
  readonly id: ObjectDefinitionId;
  readonly kind: 'object';
  readonly schemaVersion: typeof CONTENT_SCHEMA_VERSION;
  readonly displayName: string;
  readonly components: ObjectContentComponents;
  readonly retired?: boolean;
  readonly replacement?: ObjectDefinitionId;
}

const OBJECT_ID_PATTERN = /^object:[a-z0-9]+(?:_[a-z0-9]+)*$/u;
const ITEM_ID_PATTERN = /^item:[a-z0-9]+(?:_[a-z0-9]+)*$/u;
const FRAME_ID_PATTERN = /^frame:[a-z0-9]+(?:_[a-z0-9]+)*$/u;
const RECIPE_ID_PATTERN = /^recipe:[a-z0-9]+(?:_[a-z0-9]+)*$/u;
const LOOT_ID_PATTERN = /^loot:[a-z0-9]+(?:_[a-z0-9]+)*$/u;
const SPACE_ID_PATTERN = /^space:[a-z0-9]+(?:_[a-z0-9]+)*$/u;
const U64_TEXT_PATTERN = /^(?:0|[1-9][0-9]*)$/u;
const STABLE_NAME_PATTERN = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/u;

function fail(path: string, message: string): never {
  throw new ContentParseError('invalid_type', path, message);
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) fail(path, 'expected an object');
  return value as Record<string, unknown>;
}

function array(value: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(value)) fail(path, 'expected an array');
  return value;
}

function stringValue(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length === 0) fail(path, 'expected a non-empty string');
  return value;
}

function stableName(value: unknown, path: string): string {
  const name = stringValue(value, path);
  if (!STABLE_NAME_PATTERN.test(name)) fail(path, `invalid stable name ${name}`);
  return name;
}

function booleanValue(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') fail(path, 'expected a boolean');
  return value;
}

function integer(value: unknown, path: string, minimum = 0, maximum = Number.MAX_SAFE_INTEGER): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    fail(path, `expected a safe integer from ${minimum} to ${maximum}`);
  }
  return value as number;
}

function finiteNumber(value: unknown, path: string, minimum = 0): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum) {
    fail(path, `expected a finite number >= ${minimum}`);
  }
  return value;
}

function strings(value: unknown, path: string): readonly string[] {
  return array(value, path).map((entry, index) => stringValue(entry, `${path}[${index}]`));
}

function stateValue(value: unknown, path: string): StateValue {
  if (typeof value === 'boolean' || typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isSafeInteger(value)) return value;
  return fail(path, 'expected a boolean, string, or safe integer state value');
}

function itemId(value: unknown, path: string): ItemDefinitionId {
  const id = stringValue(value, path);
  if (!ITEM_ID_PATTERN.test(id)) fail(path, `invalid item definition id ${id}`);
  return id as ItemDefinitionId;
}

function frameId(value: unknown, path: string): FrameDefinitionId {
  const id = stringValue(value, path);
  if (!FRAME_ID_PATTERN.test(id)) fail(path, `invalid frame definition id ${id}`);
  return id as FrameDefinitionId;
}

function recipeId(value: unknown, path: string): RecipeDefinitionId {
  const id = stringValue(value, path);
  if (!RECIPE_ID_PATTERN.test(id)) fail(path, `invalid recipe definition id ${id}`);
  return id as RecipeDefinitionId;
}

function lootId(value: unknown, path: string): LootDefinitionId {
  const id = stringValue(value, path);
  if (!LOOT_ID_PATTERN.test(id)) fail(path, `invalid loot definition id ${id}`);
  return id as LootDefinitionId;
}

function itemMatch(value: unknown, path: string): ItemMatch {
  const source = record(value, path);
  const result: ItemMatch = {
    ...(source.kind === undefined ? {} : { kind: stringValue(source.kind, `${path}.kind`) }),
    ...(source.tag === undefined ? {} : { tag: stableName(source.tag, `${path}.tag`) }),
    ...(source.durabilityAtLeast === undefined ? {} : {
      durabilityAtLeast: integer(source.durabilityAtLeast, `${path}.durabilityAtLeast`),
    }),
    ...(source.durabilityAtMost === undefined ? {} : {
      durabilityAtMost: integer(source.durabilityAtMost, `${path}.durabilityAtMost`),
    }),
  };
  if (Object.keys(result).length === 0) fail(path, 'item match needs at least one field');
  return result;
}

function itemAmount(value: unknown, path: string): ItemAmount {
  const source = record(value, path);
  return { ...itemMatch(source, path), count: integer(source.count, `${path}.count`, 1) };
}

function threshold(value: unknown, path: string): ValueThreshold {
  const source = record(value, path);
  const result = {
    ...(source.atLeast === undefined ? {} : { atLeast: integer(source.atLeast, `${path}.atLeast`) }),
    ...(source.atMost === undefined ? {} : { atMost: integer(source.atMost, `${path}.atMost`) }),
  };
  if (Object.keys(result).length === 0) fail(path, 'threshold needs atLeast or atMost');
  return result;
}

function tilePosition(value: unknown, path: string): TilePosition {
  const source = record(value, path);
  return {
    ...(source.spaceId === undefined ? {} : { spaceId: stringValue(source.spaceId, `${path}.spaceId`) }),
    x: integer(source.x, `${path}.x`, Number.MIN_SAFE_INTEGER),
    y: integer(source.y, `${path}.y`, Number.MIN_SAFE_INTEGER),
  };
}

function exactlyOneOpcode(
  source: Record<string, unknown>,
  path: string,
  opcode: string | null,
  companionKeys: readonly string[] = [],
): string {
  if (opcode === null) fail(path, 'expected exactly one supported opcode');
  if (Object.keys(source).some((key) => key !== opcode && !companionKeys.includes(key))) {
    fail(path, 'opcode contains unsupported fields');
  }
  return opcode;
}

export function parseDataGraphCondition(value: unknown, path = '$'): Condition {
  const source = record(value, path);
  const detected = conditionKind(source);
  const kind = exactlyOneOpcode(source, path, detected, detected === 'state' ? ['equals'] : []);
  switch (kind) {
    case 'reach': {
      const reach = stringValue(source.reach, `${path}.reach`);
      if (reach !== 'object' && reach !== 'tile' && reach !== 'npc') fail(`${path}.reach`, 'unknown reach kind');
      return { reach };
    }
    case 'state': {
      return {
        state: stableName(source.state, `${path}.state`),
        equals: stateValue(source.equals, `${path}.equals`),
      };
    }
    case 'selectedItem': return { selectedItem: itemMatch(source.selectedItem, `${path}.selectedItem`) };
    case 'hasItem': return { hasItem: itemAmount(source.hasItem, `${path}.hasItem`) };
    case 'role': {
      const role = record(source.role, `${path}.role`);
      const scope = stringValue(role.scope, `${path}.role.scope`);
      if (scope !== 'world' && scope !== 'homestead') fail(`${path}.role.scope`, 'unknown role scope');
      return { role: { scope, name: stableName(role.name, `${path}.role.name`) } };
    }
    case 'space': {
      const space = record(source.space, `${path}.space`);
      const result = {
        ...(space.kind === undefined ? {} : { kind: stableName(space.kind, `${path}.space.kind`) }),
        ...(space.id === undefined ? {} : { id: stringValue(space.id, `${path}.space.id`) }),
      };
      if (Object.keys(result).length === 0) fail(`${path}.space`, 'space needs kind or id');
      return { space: result };
    }
    case 'questState': {
      const state = record(source.questState, `${path}.questState`);
      return { questState: {
        questId: stringValue(state.questId, `${path}.questState.questId`),
        state: stableName(state.state, `${path}.questState.state`),
      } };
    }
    case 'statisticAtLeast': {
      const statistic = record(source.statisticAtLeast, `${path}.statisticAtLeast`);
      return { statisticAtLeast: {
        kind: stableName(statistic.kind, `${path}.statisticAtLeast.kind`),
        value: integer(statistic.value, `${path}.statisticAtLeast.value`),
      } };
    }
    case 'skillRank': {
      const skill = record(source.skillRank, `${path}.skillRank`);
      return { skillRank: {
        skillId: stringValue(skill.skillId, `${path}.skillRank.skillId`),
        atLeast: integer(skill.atLeast, `${path}.skillRank.atLeast`),
      } };
    }
    case 'timeOfDay': {
      const time = record(source.timeOfDay, `${path}.timeOfDay`);
      return { timeOfDay: {
        fromMinute: integer(time.fromMinute, `${path}.timeOfDay.fromMinute`, 0, 1439),
        toMinute: integer(time.toMinute, `${path}.timeOfDay.toMinute`, 0, 1439),
      } };
    }
    case 'season': return { season: Array.isArray(source.season)
      ? strings(source.season, `${path}.season`)
      : stringValue(source.season, `${path}.season`) };
    case 'mounted': return { mounted: booleanValue(source.mounted, `${path}.mounted`) };
    case 'vitals': {
      const vitals = record(source.vitals, `${path}.vitals`);
      if (vitals.hunger === undefined && vitals.vigour === undefined) fail(`${path}.vitals`, 'vitals needs a threshold');
      return { vitals: {
        ...(vitals.hunger === undefined ? {} : { hunger: threshold(vitals.hunger, `${path}.vitals.hunger`) }),
        ...(vitals.vigour === undefined ? {} : { vigour: threshold(vitals.vigour, `${path}.vitals.vigour`) }),
      } };
    }
    case 'random': {
      const random = record(source.random, `${path}.random`);
      const denominator = integer(random.denominator, `${path}.random.denominator`, 1);
      const numerator = integer(random.numerator, `${path}.random.numerator`, 0, denominator);
      return { random: {
        numerator, denominator,
        ...(random.salt === undefined ? {} : { salt: stableName(random.salt, `${path}.random.salt`) }),
      } };
    }
    case 'slotEmpty': {
      const slot = record(source.slotEmpty, `${path}.slotEmpty`);
      return { slotEmpty: {
        ...(slot.containerId === undefined ? {} : { containerId: stringValue(slot.containerId, `${path}.slotEmpty.containerId`) }),
        slot: integer(slot.slot, `${path}.slotEmpty.slot`),
      } };
    }
    case 'slotHas': {
      const slot = record(source.slotHas, `${path}.slotHas`);
      return { slotHas: {
        ...(slot.containerId === undefined ? {} : { containerId: stringValue(slot.containerId, `${path}.slotHas.containerId`) }),
        slot: integer(slot.slot, `${path}.slotHas.slot`),
        item: itemMatch(slot.item, `${path}.slotHas.item`),
      } };
    }
    case 'containerHasSpace': {
      const container = record(source.containerHasSpace, `${path}.containerHasSpace`);
      return { containerHasSpace: {
        ...(container.containerId === undefined ? {} : {
          containerId: stringValue(container.containerId, `${path}.containerHasSpace.containerId`),
        }),
        ...(container.item === undefined ? {} : { item: itemMatch(container.item, `${path}.containerHasSpace.item`) }),
      } };
    }
    case 'nearbyObject': {
      const nearby = record(source.nearbyObject, `${path}.nearbyObject`);
      return { nearbyObject: {
        tag: stableName(nearby.tag, `${path}.nearbyObject.tag`),
        withinTiles: integer(nearby.withinTiles, `${path}.nearbyObject.withinTiles`, 1),
      } };
    }
    case 'notCarrying':
      if (source.notCarrying !== true) fail(`${path}.notCarrying`, 'expected true');
      return { notCarrying: true };
    default: return fail(path, `unsupported condition opcode ${kind}`);
  }
}

export function parseDataGraphEffect(value: unknown, path = '$'): Effect {
  const source = record(value, path);
  const kind = exactlyOneOpcode(source, path, effectKind(source));
  const stringEffect = (key: string) => stringValue(source[key], `${path}.${key}`);
  switch (kind) {
    case 'setState': {
      const changes = record(source.setState, `${path}.setState`);
      if (Object.keys(changes).length === 0) fail(`${path}.setState`, 'state change must not be empty');
      return { setState: Object.fromEntries(Object.entries(changes).map(([name, entry]) => [
        stableName(name, `${path}.setState.${name}`), stateValue(entry, `${path}.setState.${name}`),
      ])) };
    }
    case 'toggleState': return { toggleState: stringEffect('toggleState') };
    case 'incrementState': {
      const increment = record(source.incrementState, `${path}.incrementState`);
      return { incrementState: {
        state: stableName(increment.state, `${path}.incrementState.state`),
        amount: integer(increment.amount, `${path}.incrementState.amount`, Number.MIN_SAFE_INTEGER),
      } };
    }
    case 'giveItem': return { giveItem: itemAmount(source.giveItem, `${path}.giveItem`) };
    case 'consumeSelected': return { consumeSelected: integer(source.consumeSelected, `${path}.consumeSelected`, 1) };
    case 'consumeItem': return { consumeItem: itemAmount(source.consumeItem, `${path}.consumeItem`) };
    case 'damageSelected': return { damageSelected: integer(source.damageSelected, `${path}.damageSelected`, 1) };
    case 'restoreHunger': return { restoreHunger: integer(source.restoreHunger, `${path}.restoreHunger`, 1) };
    case 'repairSelected':
      if (source.repairSelected !== true) fail(`${path}.repairSelected`, 'expected true');
      return { repairSelected: true };
    case 'spawnWorldItem': {
      const spawn = record(source.spawnWorldItem, `${path}.spawnWorldItem`);
      return { spawnWorldItem: {
        ...itemAmount(spawn, `${path}.spawnWorldItem`),
        ...(spawn.at === undefined ? {} : { at: tilePosition(spawn.at, `${path}.spawnWorldItem.at`) }),
      } };
    }
    case 'pickupAsItem': return { pickupAsItem: itemId(source.pickupAsItem, `${path}.pickupAsItem`) };
    case 'openFrame': return { openFrame: frameId(source.openFrame, `${path}.openFrame`) };
    case 'closeFrame':
      if (source.closeFrame !== true) fail(`${path}.closeFrame`, 'expected true');
      return { closeFrame: true };
    case 'startProcess': return { startProcess: stringEffect('startProcess') };
    case 'settleProcess':
      if (source.settleProcess !== true) fail(`${path}.settleProcess`, 'expected true');
      return { settleProcess: true };
    case 'sealContainer':
      if (source.sealContainer !== true) fail(`${path}.sealContainer`, 'expected true');
      return { sealContainer: true };
    case 'spawnObject': {
      const spawn = record(source.spawnObject, `${path}.spawnObject`);
      const definitionId = stringValue(spawn.definitionId, `${path}.spawnObject.definitionId`);
      if (!OBJECT_ID_PATTERN.test(definitionId)) fail(`${path}.spawnObject.definitionId`, 'invalid object definition id');
      const state = spawn.state === undefined ? undefined : record(spawn.state, `${path}.spawnObject.state`);
      return { spawnObject: {
        definitionId,
        ...(spawn.at === undefined ? {} : { at: tilePosition(spawn.at, `${path}.spawnObject.at`) }),
        ...(state === undefined ? {} : { state: Object.fromEntries(Object.entries(state).map(([name, entry]) => [
          stableName(name, `${path}.spawnObject.state.${name}`), stateValue(entry, `${path}.spawnObject.state.${name}`),
        ])) }),
      } };
    }
    case 'despawnObject': {
      const despawn = record(source.despawnObject, `${path}.despawnObject`);
      return { despawnObject: despawn.objectId === undefined ? {} : {
        objectId: stringValue(despawn.objectId, `${path}.despawnObject.objectId`),
      } };
    }
    case 'spawnNpc': {
      const spawn = record(source.spawnNpc, `${path}.spawnNpc`);
      return { spawnNpc: {
        definitionId: stringValue(spawn.definitionId, `${path}.spawnNpc.definitionId`),
        ...(spawn.at === undefined ? {} : { at: tilePosition(spawn.at, `${path}.spawnNpc.at`) }),
      } };
    }
    case 'teleport': {
      const destination = record(source.teleport, `${path}.teleport`);
      return { teleport: {
        spaceId: stringValue(destination.spaceId, `${path}.teleport.spaceId`),
        ...(destination.x === undefined ? {} : { x: integer(destination.x, `${path}.teleport.x`, Number.MIN_SAFE_INTEGER) }),
        ...(destination.y === undefined ? {} : { y: integer(destination.y, `${path}.teleport.y`, Number.MIN_SAFE_INTEGER) }),
        ...(destination.portalId === undefined ? {} : { portalId: stringValue(destination.portalId, `${path}.teleport.portalId`) }),
      } };
    }
    case 'usePortal': return { usePortal: stringEffect('usePortal') };
    case 'grantBronze': return { grantBronze: integer(source.grantBronze, `${path}.grantBronze`, 1) };
    case 'chargeBronze': return { chargeBronze: integer(source.chargeBronze, `${path}.chargeBronze`, 1) };
    case 'grantExperience': {
      const experience = record(source.grantExperience, `${path}.grantExperience`);
      return { grantExperience: {
        ...(experience.skillId === undefined ? {} : { skillId: stringValue(experience.skillId, `${path}.grantExperience.skillId`) }),
        amount: integer(experience.amount, `${path}.grantExperience.amount`, 1),
      } };
    }
    case 'applyEffect': {
      const effect = record(source.applyEffect, `${path}.applyEffect`);
      return { applyEffect: {
        effectId: stringValue(effect.effectId, `${path}.applyEffect.effectId`),
        ...(effect.stacks === undefined ? {} : { stacks: integer(effect.stacks, `${path}.applyEffect.stacks`, 1) }),
      } };
    }
    case 'learnRecipes': {
      const recipes = array(source.learnRecipes, `${path}.learnRecipes`).map((entry, index) => {
        const id = stringValue(entry, `${path}.learnRecipes[${index}]`);
        if (!/^(?:recipe|process):[a-z0-9]+(?:_[a-z0-9]+)*$/u.test(id)) {
          fail(`${path}.learnRecipes[${index}]`, `invalid recipe or process definition id ${id}`);
        }
        return id;
      });
      if (recipes.length === 0 || new Set(recipes).size !== recipes.length) {
        fail(`${path}.learnRecipes`, 'expected unique recipe or process definition ids');
      }
      return { learnRecipes: recipes };
    }
    case 'statistic': {
      if (typeof source.statistic === 'string') return { statistic: stringEffect('statistic') };
      const statistic = record(source.statistic, `${path}.statistic`);
      return { statistic: {
        kind: stableName(statistic.kind, `${path}.statistic.kind`),
        ...(statistic.subject === undefined ? {} : { subject: stringValue(statistic.subject, `${path}.statistic.subject`) }),
        ...(statistic.delta === undefined ? {} : {
          delta: integer(statistic.delta, `${path}.statistic.delta`, 1),
        }),
      } };
    }
    case 'questAction': {
      const action = record(source.questAction, `${path}.questAction`);
      const kindValue = stringValue(action.action, `${path}.questAction.action`);
      if (kindValue !== 'accept' && kindValue !== 'progress' && kindValue !== 'turn_in') {
        fail(`${path}.questAction.action`, 'unknown quest action');
      }
      return { questAction: {
        questId: stringValue(action.questId, `${path}.questAction.questId`), action: kindValue,
        ...(action.amount === undefined ? {} : { amount: integer(action.amount, `${path}.questAction.amount`, 1) }),
        ...(action.objectiveId === undefined ? {} : { objectiveId: stringValue(action.objectiveId, `${path}.questAction.objectiveId`) }),
      } };
    }
    case 'say': return { say: stringEffect('say') };
    case 'bark': return { bark: stringEffect('bark') };
    case 'sfx': return { sfx: stringEffect('sfx') };
    case 'animation': return { animation: stringEffect('animation') };
    case 'setCollision': return { setCollision: booleanValue(source.setCollision, `${path}.setCollision`) };
    case 'setLight': {
      const light = record(source.setLight, `${path}.setLight`);
      const color = light.color === undefined ? undefined : array(light.color, `${path}.setLight.color`);
      if (color !== undefined && color.length !== 3) fail(`${path}.setLight.color`, 'expected three channels');
      return { setLight: {
        enabled: booleanValue(light.enabled, `${path}.setLight.enabled`),
        ...(color === undefined ? {} : { color: color.map((channel, index) => (
          integer(channel, `${path}.setLight.color[${index}]`, 0, 255)
        )) as unknown as readonly [number, number, number] }),
        ...(light.radiusTiles === undefined ? {} : { radiusTiles: integer(light.radiusTiles, `${path}.setLight.radiusTiles`, 1) }),
      } };
    }
    case 'scheduleTimer': {
      const timer = record(source.scheduleTimer, `${path}.scheduleTimer`);
      return { scheduleTimer: {
        timerId: stableName(timer.timerId, `${path}.scheduleTimer.timerId`),
        afterTicks: integer(timer.afterTicks, `${path}.scheduleTimer.afterTicks`, 1),
      } };
    }
    case 'carry': {
      const carry = record(source.carry, `${path}.carry`);
      return { carry: carry.objectId === undefined ? {} : {
        objectId: stringValue(carry.objectId, `${path}.carry.objectId`),
      } };
    }
    case 'placeCarried': {
      const carried = record(source.placeCarried, `${path}.placeCarried`);
      return { placeCarried: carried.at === undefined ? {} : {
        at: tilePosition(carried.at, `${path}.placeCarried.at`),
      } };
    }
    case 'plantSeed': return { plantSeed: tilePosition(source.plantSeed, `${path}.plantSeed`) };
    case 'farmTool': {
      const farmTool = record(source.farmTool, `${path}.farmTool`);
      const action = stringValue(farmTool.action, `${path}.farmTool.action`);
      if (action !== 'use' && action !== 'restore') {
        fail(`${path}.farmTool.action`, 'expected use or restore');
      }
      return {
        farmTool: {
          action,
          at: tilePosition(farmTool.at, `${path}.farmTool.at`),
        },
      };
    }
    case 'worldTool': {
      const worldTool = record(source.worldTool, `${path}.worldTool`);
      const action = stringValue(worldTool.action, `${path}.worldTool.action`);
      if (action !== 'whiff' && action !== 'target' && action !== 'digCellar') {
        fail(`${path}.worldTool.action`, 'expected whiff, target, or digCellar');
      }
      return { worldTool: {
        action,
        ...(worldTool.at === undefined ? {} : {
          at: tilePosition(worldTool.at, `${path}.worldTool.at`),
        }),
      } };
    }
    case 'meleeAttack': {
      const attack = record(source.meleeAttack, `${path}.meleeAttack`);
      return { meleeAttack: {
        weapon: stableName(attack.weapon, `${path}.meleeAttack.weapon`),
      } };
    }
    case 'fishing': {
      const fishing = record(source.fishing, `${path}.fishing`);
      const action = stringValue(fishing.action, `${path}.fishing.action`);
      if (action === 'reel') return { fishing: { action } };
      if (action !== 'cast') fail(`${path}.fishing.action`, 'expected cast or reel');
      return { fishing: {
        action,
        poolId: stringValue(fishing.poolId, `${path}.fishing.poolId`),
        at: tilePosition(fishing.at, `${path}.fishing.at`),
      } };
    }
    case 'bowAction': {
      const action = record(source.bowAction, `${path}.bowAction`);
      const phase = stringValue(action.phase, `${path}.bowAction.phase`);
      if (phase === 'begin') return { bowAction: { phase } };
      const chargeMs = integer(action.chargeMs, `${path}.bowAction.chargeMs`, 0, 65_535);
      if (phase === 'cancel') return { bowAction: { phase, chargeMs } };
      if (phase !== 'fire') fail(`${path}.bowAction.phase`, 'expected begin, cancel, or fire');
      return { bowAction: {
        phase,
        aimX: integer(action.aimX, `${path}.bowAction.aimX`, -32_768, 32_767),
        aimY: integer(action.aimY, `${path}.bowAction.aimY`, -32_768, 32_767),
        chargeMs,
      } };
    }
    case 'mount': {
      const mount = record(source.mount, `${path}.mount`);
      return { mount: mount.npcId === undefined ? {} : { npcId: stringValue(mount.npcId, `${path}.mount.npcId`) } };
    }
    case 'dismount':
      if (source.dismount !== true) fail(`${path}.dismount`, 'expected true');
      return { dismount: true };
    case 'foundHomestead': {
      const homestead = record(source.foundHomestead, `${path}.foundHomestead`);
      return { foundHomestead: homestead.name === undefined ? {} : {
        name: stringValue(homestead.name, `${path}.foundHomestead.name`),
      } };
    }
    case 'rollLoot': {
      const loot = record(source.rollLoot, `${path}.rollLoot`);
      return { rollLoot: {
        lootId: stringValue(loot.lootId, `${path}.rollLoot.lootId`),
        ...(loot.rolls === undefined ? {} : { rolls: integer(loot.rolls, `${path}.rollLoot.rolls`, 1) }),
      } };
    }
    case 'fail': return { fail: stringEffect('fail') };
    default: return fail(path, `unsupported effect opcode ${kind}`);
  }
}

export function parseInteractionDefinition(value: unknown, path: string): InteractionDefinition {
  const source = record(value, path);
  const verb = stringValue(source.verb, `${path}.verb`);
  if (!['use', 'secondary', 'use_with', 'place', 'walk_onto', 'tick', 'break', 'timer'].includes(verb)) {
    fail(`${path}.verb`, `unknown interaction verb ${verb}`);
  }
  const prompt = source.prompt === undefined ? undefined : typeof source.prompt === 'string'
    ? stringValue(source.prompt, `${path}.prompt`)
    : Object.fromEntries(Object.entries(record(source.prompt, `${path}.prompt`)).map(([key, label]) => [
      stableName(key, `${path}.prompt.${key}`), stringValue(label, `${path}.prompt.${key}`),
    ]));
  const reachTiles = source.reachTiles === undefined ? undefined
    : finiteNumber(source.reachTiles, `${path}.reachTiles`, 0.25);
  if (reachTiles !== undefined && reachTiles > 8) fail(`${path}.reachTiles`, 'interaction reach exceeds 8 tiles');
  return {
    id: stableName(source.id, `${path}.id`),
    verb: verb as InteractionDefinition['verb'],
    ...(source.with === undefined ? {} : { with: itemMatch(source.with, `${path}.with`) }),
    ...(prompt === undefined ? {} : { prompt }),
    ...(source.feedback === undefined ? {} : {
      feedback: stringValue(source.feedback, `${path}.feedback`),
    }),
    ...(reachTiles === undefined ? {} : { reachTiles }),
    conditions: array(source.conditions, `${path}.conditions`)
      .map((condition, index) => parseDataGraphCondition(condition, `${path}.conditions[${index}]`)),
    effects: array(source.effects, `${path}.effects`)
      .map((effect, index) => parseDataGraphEffect(effect, `${path}.effects[${index}]`)),
    ...(source.cooldownTicks === undefined ? {} : {
      cooldownTicks: integer(source.cooldownTicks, `${path}.cooldownTicks`, 1),
    }),
    ...(source.priority === undefined ? {} : {
      priority: integer(source.priority, `${path}.priority`, Number.MIN_SAFE_INTEGER),
    }),
  };
}

function footprint(value: unknown, path: string): readonly (readonly number[])[] {
  const rows = array(value, path).map((row, y) => array(row, `${path}[${y}]`)
    .map((mask, x) => integer(mask, `${path}[${y}][${x}]`, 0, 15)));
  if (rows.length === 0 || rows[0]?.length === 0 || rows.some((row) => row.length !== rows[0]?.length)) {
    fail(path, 'footprint must be a non-empty rectangular mask');
  }
  return rows;
}

function states(value: unknown, path: string): Readonly<Record<string, ObjectStateDefinition>> {
  return Object.fromEntries(Object.entries(record(value, path)).map(([name, stateValueSource]) => {
    stableName(name, `${path}.${name}`);
    const source = record(stateValueSource, `${path}.${name}`);
    const type = stringValue(source.type, `${path}.${name}.type`);
    if (type === 'bool') return [name, { type, default: booleanValue(source.default, `${path}.${name}.default`) }];
    if (type === 'enum') return [name, {
      type, default: stringValue(source.default, `${path}.${name}.default`),
      values: strings(source.values, `${path}.${name}.values`),
    }];
    if (type === 'counter') return [name, {
      type, default: integer(source.default, `${path}.${name}.default`, Number.MIN_SAFE_INTEGER),
      ...(source.min === undefined ? {} : { min: integer(source.min, `${path}.${name}.min`, Number.MIN_SAFE_INTEGER) }),
      ...(source.max === undefined ? {} : { max: integer(source.max, `${path}.${name}.max`, Number.MIN_SAFE_INTEGER) }),
    }];
    return fail(`${path}.${name}.type`, `unknown state type ${type}`);
  }));
}

function decoded(value: string | unknown): unknown {
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value) as unknown; } catch (error) {
    throw new ContentParseError('invalid_json', '$', error instanceof Error ? error.message : 'invalid JSON');
  }
}

export function parseObjectDefinition(value: string | unknown): ObjectContentDefinition {
  const source = record(decoded(value), '$');
  if (source.schemaVersion !== CONTENT_SCHEMA_VERSION) {
    throw new ContentParseError('unsupported_schema_version', '$.schemaVersion', 'unsupported object schema version');
  }
  const id = stringValue(source.id, '$.id');
  if (!OBJECT_ID_PATTERN.test(id)) throw new ContentParseError('invalid_id', '$.id', `invalid definition id ${id}`);
  if (source.kind !== undefined && source.kind !== 'object') {
    throw new ContentParseError('kind_mismatch', '$.kind', 'expected object');
  }
  const components = record(source.components, '$.components');
  const supportedComponents = new Set([
    'identity', 'sprite', 'collision', 'placement', 'states', 'light',
    'container', 'processor', 'interactions', 'frame', 'farming',
    'damageable', 'carry', 'furniture',
  ]);
  const unknownComponent = Object.keys(components).find((key) => !supportedComponents.has(key));
  if (unknownComponent !== undefined) {
    fail(`$.components.${unknownComponent}`, `unsupported object component ${unknownComponent}`);
  }
  const identity = components.identity === undefined ? undefined : record(components.identity, '$.components.identity');
  const sprite = components.sprite === undefined ? undefined : record(components.sprite, '$.components.sprite');
  const collision = components.collision === undefined ? undefined : record(components.collision, '$.components.collision');
  const placement = components.placement === undefined ? undefined : record(components.placement, '$.components.placement');
  const light = components.light === undefined ? undefined : record(components.light, '$.components.light');
  const container = components.container === undefined ? undefined : record(components.container, '$.components.container');
  const processor = components.processor === undefined ? undefined : record(components.processor, '$.components.processor');
  const frame = components.frame === undefined ? undefined : record(components.frame, '$.components.frame');
  const farming = components.farming === undefined ? undefined : record(components.farming, '$.components.farming');
  const damageable = components.damageable === undefined
    ? undefined : record(components.damageable, '$.components.damageable');
  const carry = components.carry === undefined ? undefined : record(components.carry, '$.components.carry');
  const furniture = components.furniture === undefined
    ? undefined : array(components.furniture, '$.components.furniture');
  const irrigation = farming?.irrigation === undefined ? undefined : record(farming.irrigation, '$.components.farming.irrigation');
  if (farming !== undefined) {
    if (Object.keys(farming).some((key) => key !== 'irrigation' && key !== 'seasonProtection')
      || (irrigation === undefined && farming.seasonProtection === undefined)) {
      fail('$.components.farming', 'expected a supported farming capability');
    }
    if (farming.seasonProtection !== undefined && farming.seasonProtection !== 'homestead') {
      fail('$.components.farming.seasonProtection', 'unsupported season protection scope');
    }
    if (irrigation !== undefined && Object.keys(irrigation).some((key) => key !== 'radiusTiles')) {
      fail('$.components.farming.irrigation', 'unsupported irrigation field');
    }
  }
  if (damageable !== undefined) {
    const common = ['model', 'salvageRecipe', 'onBreakLoot'];
    const model = stringValue(damageable.model, '$.components.damageable.model');
    const allowed = model === 'hits'
      ? [...common, 'maximumHits', 'toolSpecialization']
      : model === 'health'
        ? [...common, 'maximumHealthCenti', 'minimumHealthCenti', 'regeneration', 'fixedTargets']
        : fail('$.components.damageable.model', `unknown damage model ${model}`);
    const unknown = Object.keys(damageable).find((key) => !allowed.includes(key));
    if (unknown !== undefined) fail(`$.components.damageable.${unknown}`, 'unsupported damageable field');
  }
  if (carry !== undefined) {
    const mode = stringValue(carry.mode, '$.components.carry.mode');
    if (mode !== 'preserve_entity' && mode !== 'preserve_entity_or_item_when_empty') {
      fail('$.components.carry.mode', `unknown carry mode ${mode}`);
    }
    const allowed = mode === 'preserve_entity' ? ['mode'] : ['mode', 'item'];
    const unknown = Object.keys(carry).find((key) => !allowed.includes(key));
    if (unknown !== undefined) fail(`$.components.carry.${unknown}`, 'unsupported carry field');
  }
  let parsedFurniture: ObjectFurnitureComponent | undefined;
  if (furniture !== undefined) {
    if (furniture.length === 1 && (furniture[0] === 't' || furniture[0] === 'w')) {
      parsedFurniture = [furniture[0]];
    } else if (furniture.length >= 2 && furniture.length <= 3) {
      const halfWidth = integer(furniture[0], '$.components.furniture[0]', 1, 64);
      const depth = integer(furniture[1], '$.components.furniture[1]', 1, 64);
      const third = furniture[2];
      if (third === undefined) parsedFurniture = [halfWidth, depth];
      else if (typeof third === 'number') {
        parsedFurniture = [halfWidth, depth, integer(third, '$.components.furniture[2]', -64, 64)];
      } else {
        const surface = array(third, '$.components.furniture[2]');
        if (surface.length !== 5) fail('$.components.furniture[2]', 'expected five tabletop values');
        parsedFurniture = [halfWidth, depth, [
          integer(surface[0], '$.components.furniture[2][0]', 0, 8),
          integer(surface[1], '$.components.furniture[2][1]', 0, 8),
          integer(surface[2], '$.components.furniture[2][2]', 1, 8),
          integer(surface[3], '$.components.furniture[2][3]', 1, 8),
          integer(surface[4], '$.components.furniture[2][4]', 1, 64),
        ]];
      }
    } else fail('$.components.furniture', 'expected a compact furniture tuple');
  }
  const animationByState = sprite?.animationByState === undefined ? undefined
    : record(sprite.animationByState, '$.components.sprite.animationByState');
  const lightColor = light === undefined ? undefined : array(light.color, '$.components.light.color');
  if (lightColor !== undefined && lightColor.length !== 3) fail('$.components.light.color', 'expected three channels');
  const lightWhen = light?.when === undefined ? undefined : record(light.when, '$.components.light.when');
  const collisionWhen = collision?.when === undefined ? undefined : record(collision.when, '$.components.collision.when');
  const restrictions = container?.restrictions === undefined ? undefined
    : array(container.restrictions, '$.components.container.restrictions');
  const slotRoles = processor?.slotRoles === undefined ? undefined
    : record(processor.slotRoles, '$.components.processor.slotRoles');
  const completionRewards = processor?.completionRewards === undefined
    ? undefined : record(processor.completionRewards, '$.components.processor.completionRewards');
  const completionExperience = completionRewards?.experience === undefined
    ? undefined : record(completionRewards.experience, '$.components.processor.completionRewards.experience');
  const completionStatistics = completionRewards?.statistics === undefined
    ? undefined : array(completionRewards.statistics, '$.components.processor.completionRewards.statistics');
  if (completionRewards !== undefined) {
    const unknown = Object.keys(completionRewards)
      .find((key) => key !== 'experience' && key !== 'statistics');
    if (unknown !== undefined) fail(
      `$.components.processor.completionRewards.${unknown}`,
      'unsupported completion reward field',
    );
    if (completionStatistics === undefined) fail(
      '$.components.processor.completionRewards.statistics',
      'completion rewards require a statistic projection list',
    );
  }
  if (completionExperience !== undefined) {
    const unknown = Object.keys(completionExperience)
      .find((key) => key !== 'skill' && key !== 'amount' && key !== 'batchAmount');
    if (unknown !== undefined) fail(
      `$.components.processor.completionRewards.experience.${unknown}`,
      'unsupported completion experience field',
    );
  }
  const result: ObjectContentDefinition = {
    id: id as ObjectDefinitionId,
    kind: 'object',
    schemaVersion: CONTENT_SCHEMA_VERSION,
    displayName: stringValue(source.displayName, '$.displayName'),
    components: {
      ...(identity === undefined ? {} : { identity: { tags: strings(identity.tags, '$.components.identity.tags') } }),
      ...(sprite === undefined ? {} : { sprite: {
        asset: stableName(sprite.asset, '$.components.sprite.asset'),
        ...(animationByState === undefined ? {} : { animationByState: Object.fromEntries(
          Object.entries(animationByState).map(([state, animation]) => [
            stableName(state, `$.components.sprite.animationByState.${state}`),
            stableName(animation, `$.components.sprite.animationByState.${state}`),
          ]),
        ) }),
        ...(sprite.scale === undefined ? {} : { scale: finiteNumber(sprite.scale, '$.components.sprite.scale', 0.01) }),
        ...(sprite.variants === undefined ? {} : { variants: strings(sprite.variants, '$.components.sprite.variants') }),
        ...(sprite.fenceJoin === undefined ? {} : { fenceJoin: booleanValue(sprite.fenceJoin, '$.components.sprite.fenceJoin') }),
      } }),
      ...(collision === undefined ? {} : { collision: {
        footprint: footprint(collision.footprint, '$.components.collision.footprint'),
        blocksMovement: booleanValue(collision.blocksMovement, '$.components.collision.blocksMovement'),
        ...(collisionWhen === undefined ? {} : { when: {
          state: stableName(collisionWhen.state, '$.components.collision.when.state'),
          equals: stateValue(collisionWhen.equals, '$.components.collision.when.equals'),
        } }),
        ...(collision.occludesLight === undefined ? {} : {
          occludesLight: booleanValue(collision.occludesLight, '$.components.collision.occludesLight'),
        }),
      } }),
      ...(placement === undefined ? {} : { placement: {
        item: itemId(placement.item, '$.components.placement.item'),
        layer: (() => {
          const layer = stringValue(placement.layer, '$.components.placement.layer');
          if (layer !== 'ground' && layer !== 'object' && layer !== 'overlay') fail('$.components.placement.layer', 'unknown placement layer');
          return layer;
        })(),
        spaces: strings(placement.spaces, '$.components.placement.spaces'),
        facing: booleanValue(placement.facing, '$.components.placement.facing'),
        ...(placement.footprint === undefined ? {} : { footprint: footprint(placement.footprint, '$.components.placement.footprint') }),
        ...(placement.requiresRole === undefined ? {} : { requiresRole: stableName(placement.requiresRole, '$.components.placement.requiresRole') }),
        ...(placement.connectsTo === undefined ? {} : { connectsTo: strings(placement.connectsTo, '$.components.placement.connectsTo') }),
      } }),
      ...(components.states === undefined ? {} : { states: states(components.states, '$.components.states') }),
      ...(parsedFurniture === undefined ? {} : { furniture: parsedFurniture }),
      ...(light === undefined || lightColor === undefined ? {} : { light: {
        ...(lightWhen === undefined ? {} : { when: {
          state: stableName(lightWhen.state, '$.components.light.when.state'),
          equals: stateValue(lightWhen.equals, '$.components.light.when.equals'),
        } }),
        color: lightColor.map((channel, index) => integer(channel, `$.components.light.color[${index}]`, 0, 255)) as unknown as readonly [number, number, number],
        radiusTiles: integer(light.radiusTiles, '$.components.light.radiusTiles', 1),
        profile: (() => {
          const profile = stringValue(light.profile, '$.components.light.profile');
          if (profile !== 'steady' && profile !== 'flicker') fail('$.components.light.profile', 'unknown light profile');
          return profile;
        })(),
        ...(light.offsetY === undefined ? {} : { offsetY: integer(light.offsetY, '$.components.light.offsetY', Number.MIN_SAFE_INTEGER) }),
      } }),
      ...(container === undefined ? {} : { container: {
        slotCount: integer(container.slotCount, '$.components.container.slotCount', 1),
        access: (() => {
          const access = stringValue(container.access, '$.components.container.access');
          if (access !== 'public' && access !== 'private') fail('$.components.container.access', 'unknown container access');
          return access;
        })(),
        sortAllowed: booleanValue(container.sortAllowed, '$.components.container.sortAllowed'),
        ...(restrictions === undefined ? {} : { restrictions: restrictions.map((entry, index) => {
          const path = `$.components.container.restrictions[${index}]`;
          const restriction = record(entry, path);
          return {
            slots: array(restriction.slots, `${path}.slots`).map((slot, slotIndex) => integer(slot, `${path}.slots[${slotIndex}]`)),
            ...(restriction.requiredTags === undefined ? {} : { requiredTags: strings(restriction.requiredTags, `${path}.requiredTags`) }),
            ...(restriction.acceptedItems === undefined ? {} : {
              acceptedItems: array(restriction.acceptedItems, `${path}.acceptedItems`)
                .map((item, itemIndex) => itemId(item, `${path}.acceptedItems[${itemIndex}]`)),
            }),
            ...(restriction.readOnly === undefined ? {} : { readOnly: booleanValue(restriction.readOnly, `${path}.readOnly`) }),
          };
        }) }),
      } }),
      ...(processor === undefined || slotRoles === undefined ? {} : { processor: {
        processTag: stableName(processor.processTag, '$.components.processor.processTag'),
        slotRoles: Object.fromEntries(Object.entries(slotRoles).map(([role, slotsValue]) => [
          stableName(role, `$.components.processor.slotRoles.${role}`),
          array(slotsValue, `$.components.processor.slotRoles.${role}`)
            .map((slot, index) => integer(slot, `$.components.processor.slotRoles.${role}[${index}]`)),
        ])),
        ticksPerUnit: integer(processor.ticksPerUnit, '$.components.processor.ticksPerUnit', 1),
        catchUpCap: integer(processor.catchUpCap, '$.components.processor.catchUpCap', 1),
        autoStart: booleanValue(processor.autoStart, '$.components.processor.autoStart'),
        ...(processor.minimumBatch === undefined ? {} : {
          minimumBatch: integer(processor.minimumBatch, '$.components.processor.minimumBatch', 1),
        }),
        ...(processor.maximumBatch === undefined ? {} : {
          maximumBatch: integer(processor.maximumBatch, '$.components.processor.maximumBatch', 1),
        }),
        ...(completionRewards === undefined || completionStatistics === undefined ? {} : {
          completionRewards: {
            ...(completionExperience === undefined ? {} : { experience: {
              skill: stableName(
                completionExperience.skill,
                '$.components.processor.completionRewards.experience.skill',
              ),
              amount: integer(
                completionExperience.amount,
                '$.components.processor.completionRewards.experience.amount',
                1,
                1_000_000,
              ),
              ...(completionExperience.batchAmount === undefined ? {} : {
                batchAmount: integer(
                  completionExperience.batchAmount,
                  '$.components.processor.completionRewards.experience.batchAmount',
                  1,
                  1_000_000,
                ),
              }),
            } }),
            statistics: completionStatistics.map((entry, index) => {
              const path = `$.components.processor.completionRewards.statistics[${index}]`;
              const projection = record(entry, path);
              const statistic = stringValue(projection.statistic, `${path}.statistic`);
              if (!/^statistic:[a-z0-9]+(?:_[a-z0-9]+)*$/u.test(statistic)) {
                fail(`${path}.statistic`, 'expected statistic definition id');
              }
              const quantity = stringValue(projection.quantity, `${path}.quantity`);
              if (!['input', 'output', 'units', 'batch'].includes(quantity)) {
                fail(`${path}.quantity`, 'expected input, output, units, or batch');
              }
              const subject = projection.subject === undefined
                ? undefined : stringValue(projection.subject, `${path}.subject`);
              if (subject !== undefined && subject !== 'input' && subject !== 'output') {
                fail(`${path}.subject`, 'expected input or output');
              }
              return {
                statistic: statistic as `statistic:${string}`,
                quantity: quantity as ProcessorRewardQuantity,
                ...(subject === undefined ? {} : { subject: subject as ProcessorRewardSubject }),
                ...(projection.outputTag === undefined ? {} : {
                  outputTag: stableName(projection.outputTag, `${path}.outputTag`),
                }),
              };
            }),
          },
        }),
      } }),
      ...(components.interactions === undefined ? {} : { interactions: array(
        components.interactions, '$.components.interactions',
      ).map((interaction, index) => parseInteractionDefinition(interaction, `$.components.interactions[${index}]`)) }),
      ...(frame === undefined ? {} : { frame: { ref: frameId(frame.ref, '$.components.frame.ref') } }),
      ...(farming === undefined ? {} : { farming: {
        ...(irrigation === undefined ? {} : { irrigation: {
          radiusTiles: integer(irrigation.radiusTiles, '$.components.farming.irrigation.radiusTiles', 0, 32),
        } }),
        ...(farming.seasonProtection === undefined ? {} : { seasonProtection: 'homestead' as const }),
      } }),
      ...(damageable === undefined ? {} : { damageable: (() => {
        const rewards = {
          ...(damageable.salvageRecipe === undefined ? {} : {
            salvageRecipe: recipeId(damageable.salvageRecipe, '$.components.damageable.salvageRecipe'),
          }),
          ...(damageable.onBreakLoot === undefined ? {} : {
            onBreakLoot: lootId(damageable.onBreakLoot, '$.components.damageable.onBreakLoot'),
          }),
        };
        if (damageable.model === 'hits') {
          const specialization = stringValue(
            damageable.toolSpecialization, '$.components.damageable.toolSpecialization',
          );
          if (!['farming', 'mining', 'fishing', 'woodcutting'].includes(specialization)) {
            fail('$.components.damageable.toolSpecialization', `unknown tool specialization ${specialization}`);
          }
          return {
            model: 'hits' as const,
            maximumHits: integer(damageable.maximumHits, '$.components.damageable.maximumHits', 1, 255),
            toolSpecialization: specialization as ContentToolSpecialization,
            ...rewards,
          };
        }
        const regeneration = damageable.regeneration === undefined ? undefined
          : record(damageable.regeneration, '$.components.damageable.regeneration');
        if (regeneration !== undefined) {
          const unknown = Object.keys(regeneration)
            .find((key) => key !== 'amountCenti' && key !== 'everyTicks');
          if (unknown !== undefined) {
            fail(`$.components.damageable.regeneration.${unknown}`, 'unsupported regeneration field');
          }
        }
        const maximumHealthCenti = integer(
          damageable.maximumHealthCenti, '$.components.damageable.maximumHealthCenti', 1, 0xffff_ffff,
        );
        const minimumHealthCenti = integer(
          damageable.minimumHealthCenti, '$.components.damageable.minimumHealthCenti', 0, maximumHealthCenti,
        );
        const fixedTargets = damageable.fixedTargets === undefined ? undefined
          : array(damageable.fixedTargets, '$.components.damageable.fixedTargets').map((entry, index) => {
            const path = `$.components.damageable.fixedTargets[${index}]`;
            const tuple = array(entry, path);
            if (tuple.length !== 4) fail(path, 'expected runtime id, space, tile x and tile y');
            const runtimeId = stringValue(tuple[0], `${path}[0]`);
            const space = stringValue(tuple[1], `${path}[1]`);
            if (!U64_TEXT_PATTERN.test(runtimeId) || BigInt(runtimeId) > 0xffff_ffff_ffff_ffffn) {
              fail(`${path}[0]`, 'expected an unsigned 64-bit runtime id');
            }
            if (!SPACE_ID_PATTERN.test(space)) fail(`${path}[1]`, 'expected a space definition id');
            return Object.freeze([
              runtimeId,
              space as `space:${string}`,
              integer(tuple[2], `${path}[2]`, 0, 65_535),
              integer(tuple[3], `${path}[3]`, 0, 65_535),
            ] as const);
          });
        if (fixedTargets !== undefined && (fixedTargets.length === 0
          || new Set(fixedTargets.map(([runtimeId]) => runtimeId)).size !== fixedTargets.length)) {
          fail('$.components.damageable.fixedTargets', 'expected one or more unique runtime ids');
        }
        return {
          model: 'health' as const,
          maximumHealthCenti,
          minimumHealthCenti,
          ...(regeneration === undefined ? {} : { regeneration: {
            amountCenti: integer(regeneration.amountCenti, '$.components.damageable.regeneration.amountCenti', 1, 0xffff_ffff),
            everyTicks: integer(regeneration.everyTicks, '$.components.damageable.regeneration.everyTicks', 1, 0xffff_ffff),
          } }),
          ...(fixedTargets === undefined ? {} : { fixedTargets: Object.freeze(fixedTargets) }),
          ...rewards,
        };
      })() }),
      ...(carry === undefined ? {} : { carry: carry.mode === 'preserve_entity'
        ? { mode: 'preserve_entity' as const }
        : {
          mode: 'preserve_entity_or_item_when_empty' as const,
          item: itemId(carry.item, '$.components.carry.item'),
        } }),
    },
    ...(source.retired === undefined ? {} : { retired: booleanValue(source.retired, '$.retired') }),
    ...(source.replacement === undefined ? {} : { replacement: (() => {
      const replacement = stringValue(source.replacement, '$.replacement');
      if (!OBJECT_ID_PATTERN.test(replacement)) fail('$.replacement', 'invalid object definition id');
      return replacement as ObjectDefinitionId;
    })() }),
  };
  return Object.freeze(result);
}
