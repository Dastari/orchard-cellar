import { TILE_INTERACTION_REACH_TILES } from '../tile-targeting.js';
import type { ObjectContentDefinition, ObjectLightComponent } from '../content/object-definition.js';
import type { ItemContentDefinition } from '../content/definitions.js';
import {
  conditionSupportedByEngine,
  effectSupportedByEngine,
  type Condition,
  type ItemMatch,
  type StateValue,
  type ValueThreshold,
} from './effects.js';
import {
  interactionVerbForEventType,
  type LifecycleEvent,
  type LifecycleEventType,
} from './events.js';
import {
  MAX_EFFECTS_PER_HANDLER_RESULT,
  effectsResult,
  type Handler,
  type InteractionDefinition,
} from './handler.js';
import { createHandlerRegistry, type AnyHandlerRegistration, type BehaviourHandlerRegistry } from './registry.js';
import type {
  BehaviourItemSnapshot,
  BehaviourTargetSnapshot,
  BehaviourTileSnapshot,
  ReadOnlySnapshot,
} from './snapshot.js';

export const MAX_DATA_GRAPH_CONDITIONS = 32 as const;
export const MAX_DATA_GRAPH_INSTRUCTIONS = 96 as const;

export type DataGraphValidationCode =
  | 'condition_cap_exceeded'
  | 'effect_cap_exceeded'
  | 'instruction_cap_exceeded'
  | 'unsupported_condition'
  | 'unsupported_effect'
  | 'cooldown_state_unavailable';

export interface DataGraphValidationIssue {
  readonly code: DataGraphValidationCode;
  readonly path: string;
  readonly message: string;
}

const EVENT_TYPE_BY_VERB = {
  use: 'use',
  secondary: 'secondary',
  use_with: 'useWith',
  place: 'place',
  walk_onto: 'walkOnto',
  tick: 'tick',
  break: 'break',
  timer: 'timer',
} as const satisfies Readonly<Record<InteractionDefinition['verb'], LifecycleEventType>>;

function targetTile(target: BehaviourTargetSnapshot | undefined): BehaviourTileSnapshot | undefined {
  if (target === undefined) return undefined;
  return 'entityType' in target ? target.tile : target;
}

function itemMatches(item: BehaviourItemSnapshot | undefined, match: ItemMatch): boolean {
  if (item === undefined) return false;
  if (match.kind !== undefined && item.kind !== match.kind && item.definitionId !== match.kind) return false;
  if (match.tag !== undefined && !item.tags.includes(match.tag)) return false;
  if (match.durabilityAtLeast !== undefined
    && (item.durability === undefined || item.durability < match.durabilityAtLeast)) return false;
  if (match.durabilityAtMost !== undefined
    && (item.durability === undefined || item.durability > match.durabilityAtMost)) return false;
  return true;
}

function thresholdMatches(value: number, threshold: ValueThreshold): boolean {
  return (threshold.atLeast === undefined || value >= threshold.atLeast)
    && (threshold.atMost === undefined || value <= threshold.atMost);
}

function containerMatches(view: ReadOnlySnapshot, id: string | undefined): boolean {
  return view.container !== undefined && (id === undefined || view.container.id === id);
}

function deterministicRoll(view: ReadOnlySnapshot, condition: Extract<Condition, { random: unknown }>['random']): boolean {
  const target = view.target === undefined ? '' : 'entityType' in view.target
    ? view.target.id
    : `${view.target.spaceId}:${view.target.x}:${view.target.y}`;
  const source = [view.tick.toString(), view.actor?.id ?? '', target, view.selectedItem?.instanceId
    ?? view.selectedItem?.definitionId ?? view.selectedItem?.kind ?? '', condition.salt ?? ''].join('|');
  let hash = 0x811c9dc5;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) % condition.denominator < condition.numerator;
}

export function evaluateDataGraphCondition(condition: Condition, view: ReadOnlySnapshot): boolean {
  if ('reach' in condition) {
    const actor = view.actor;
    const target = targetTile(view.target);
    if (actor === undefined || target === undefined || actor.tile.spaceId !== target.spaceId) return false;
    const distance = Math.max(Math.abs(actor.tile.x - target.x), Math.abs(actor.tile.y - target.y));
    const reach = condition.reach === 'npc' ? 2 : TILE_INTERACTION_REACH_TILES;
    return distance <= reach;
  }
  if ('state' in condition) {
    return view.target !== undefined && 'entityType' in view.target
      && view.target.state[condition.state] === condition.equals;
  }
  if ('selectedItem' in condition) return itemMatches(view.selectedItem, condition.selectedItem);
  if ('hasItem' in condition) {
    const count = view.actor?.inventory.filter((item) => itemMatches(item, condition.hasItem))
      .reduce((sum, item) => sum + item.count, 0) ?? 0;
    return count >= condition.hasItem.count;
  }
  if ('role' in condition) {
    if (condition.role.scope === 'world') return view.actor?.worldRoles.includes(condition.role.name) === true;
    return Object.values(view.actor?.homesteadRoles ?? {}).includes(condition.role.name);
  }
  if ('space' in condition) {
    return (condition.space.kind === undefined || condition.space.kind === view.space.kind)
      && (condition.space.id === undefined || condition.space.id === view.space.id);
  }
  if ('questState' in condition) {
    return view.actor?.questStates[condition.questState.questId] === condition.questState.state;
  }
  if ('statisticAtLeast' in condition) {
    return (view.actor?.statistics[condition.statisticAtLeast.kind] ?? 0n)
      >= BigInt(condition.statisticAtLeast.value);
  }
  if ('skillRank' in condition) {
    return (view.actor?.skillRanks[condition.skillRank.skillId] ?? 0) >= condition.skillRank.atLeast;
  }
  if ('timeOfDay' in condition) {
    const { fromMinute, toMinute } = condition.timeOfDay;
    return fromMinute <= toMinute
      ? view.calendar.minuteOfDay >= fromMinute && view.calendar.minuteOfDay <= toMinute
      : view.calendar.minuteOfDay >= fromMinute || view.calendar.minuteOfDay <= toMinute;
  }
  if ('season' in condition) {
    return typeof condition.season === 'string'
      ? condition.season === view.calendar.season
      : condition.season.includes(view.calendar.season);
  }
  if ('mounted' in condition) return (view.actor?.mountedEntityId !== undefined) === condition.mounted;
  if ('vitals' in condition) {
    const vitals = view.actor?.vitals;
    return vitals !== undefined
      && (condition.vitals.hunger === undefined || thresholdMatches(vitals.hunger, condition.vitals.hunger))
      && (condition.vitals.vigour === undefined || thresholdMatches(vitals.vigour, condition.vitals.vigour));
  }
  if ('random' in condition) return deterministicRoll(view, condition.random);
  if ('slotEmpty' in condition) {
    return containerMatches(view, condition.slotEmpty.containerId)
      && view.container?.slots[condition.slotEmpty.slot] === null;
  }
  if ('slotHas' in condition) {
    return containerMatches(view, condition.slotHas.containerId)
      && itemMatches(view.container?.slots[condition.slotHas.slot] ?? undefined, condition.slotHas.item);
  }
  if ('containerHasSpace' in condition) {
    return containerMatches(view, condition.containerHasSpace.containerId)
      && view.container?.slots.some((item) => item === null) === true;
  }
  if ('nearbyObject' in condition) {
    const origin = targetTile(view.target) ?? view.actor?.tile;
    return origin !== undefined && view.nearbyObjects.some((object) => object.tile.spaceId === origin.spaceId
      && object.tags.includes(condition.nearbyObject.tag)
      && Math.max(Math.abs(object.tile.x - origin.x), Math.abs(object.tile.y - origin.y))
        <= condition.nearbyObject.withinTiles);
  }
  return view.actor?.carriedEntityId === undefined;
}

export function validateDataGraphInteraction(
  interaction: InteractionDefinition,
  engineVersion: number,
): readonly DataGraphValidationIssue[] {
  const issues: DataGraphValidationIssue[] = [];
  if (interaction.conditions.length > MAX_DATA_GRAPH_CONDITIONS) issues.push({
    code: 'condition_cap_exceeded', path: 'conditions',
    message: `interaction has ${interaction.conditions.length} conditions; maximum is ${MAX_DATA_GRAPH_CONDITIONS}`,
  });
  if (interaction.effects.length > MAX_EFFECTS_PER_HANDLER_RESULT) issues.push({
    code: 'effect_cap_exceeded', path: 'effects',
    message: `interaction has ${interaction.effects.length} effects; maximum is ${MAX_EFFECTS_PER_HANDLER_RESULT}`,
  });
  if (interaction.conditions.length + interaction.effects.length > MAX_DATA_GRAPH_INSTRUCTIONS) issues.push({
    code: 'instruction_cap_exceeded', path: '$',
    message: `interaction exceeds the ${MAX_DATA_GRAPH_INSTRUCTIONS}-instruction budget`,
  });
  interaction.conditions.forEach((condition, index) => {
    if (!conditionSupportedByEngine(condition, engineVersion)) issues.push({
      code: 'unsupported_condition', path: `conditions[${index}]`,
      message: `condition is unavailable in behaviour engine ${engineVersion}`,
    });
  });
  interaction.effects.forEach((effect, index) => {
    if (!effectSupportedByEngine(effect, engineVersion)) issues.push({
      code: 'unsupported_effect', path: `effects[${index}]`,
      message: `effect is unavailable in behaviour engine ${engineVersion}`,
    });
  });
  if (interaction.cooldownTicks !== undefined) issues.push({
    code: 'cooldown_state_unavailable', path: 'cooldownTicks',
    message: 'cooldowns require the future authority-side interaction cooldown snapshot',
  });
  return Object.freeze(issues);
}

export function compileDataGraphInteraction(
  definitionId: string,
  interaction: InteractionDefinition,
  engineVersion: number,
  source: 'target' | 'selectedItem' = 'target',
): AnyHandlerRegistration {
  const issues = validateDataGraphInteraction(interaction, engineVersion);
  if (issues.length > 0) throw new Error(`invalid_data_graph:${issues[0]!.code}:${issues[0]!.path}`);
  const eventType = EVENT_TYPE_BY_VERB[interaction.verb];
  return Object.freeze({
    id: `${definitionId}.data_graph.${interaction.id}`,
    eventType,
    source,
    match: Object.freeze({ kind: 'definition', definitionId }),
    priority: interaction.priority ?? 0,
    handler: ((_event: LifecycleEvent, view: ReadOnlySnapshot) => {
      if (interaction.with !== undefined && !itemMatches(view.selectedItem, interaction.with)) {
        return effectsResult([], { continue: true });
      }
      if (!interaction.conditions.every((condition) => evaluateDataGraphCondition(condition, view))) {
        return effectsResult([], { continue: true });
      }
      return effectsResult(interaction.effects);
    }) as Handler,
  } as AnyHandlerRegistration);
}

/** Item `onUse` actions share the data-graph ABI, but resolve against the
 * selected item and the current secondary/F lifecycle event. */
export function compileItemDataGraph(
  definition: ItemContentDefinition,
  engineVersion: number,
): readonly AnyHandlerRegistration[] {
  return Object.freeze(definition.onUse.map((interaction) => (
    compileDataGraphInteraction(definition.id, interaction, engineVersion, 'selectedItem')
  )));
}

export function compileObjectDataGraph(
  definition: ObjectContentDefinition,
  engineVersion: number,
): readonly AnyHandlerRegistration[] {
  const interactions = (definition.components.interactions ?? []).map((interaction) => (
    compileDataGraphInteraction(definition.id, interaction, engineVersion)
  ));
  const carry = definition.components.carry;
  const emptyContainerPickup = carry?.mode === 'preserve_entity_or_item_when_empty'
    ? [{
      id: `${definition.id}.carry.pickup_empty`,
      eventType: 'pickup' as const,
      source: 'target' as const,
      match: Object.freeze({ kind: 'definition' as const, definitionId: definition.id }),
      priority: 1,
      handler: ((_event: LifecycleEvent, view: ReadOnlySnapshot) => {
        const target = view.target;
        return target !== undefined && 'entityType' in target
          && target.entityType === 'object'
          && target.state.hasContents === false
          ? effectsResult([{ pickupAsItem: carry.item }])
          : effectsResult([], { continue: true });
      }) as Handler,
    } satisfies AnyHandlerRegistration]
    : [];
  return Object.freeze([...interactions, ...emptyContainerPickup]);
}

export interface ObjectInteractionMetadata {
  readonly prompt: string;
  readonly feedback?: string;
  readonly reachTiles?: number;
}

/** Shared presentation/physical metadata selection for one authored object
 * interaction. Conditions not representable by subscribed object state remain
 * authority-owned and are checked again by the data graph on invocation. */
export function objectInteractionMetadata(
  definition: ObjectContentDefinition,
  verb: InteractionDefinition['verb'],
  state: Readonly<Record<string, StateValue>>,
): ObjectInteractionMetadata | null {
  const interaction = [...definition.components.interactions ?? []]
    .filter((candidate) => candidate.verb === verb
      && candidate.conditions.every((condition) => !('state' in condition)
        || state[condition.state] === condition.equals))
    .sort((left, right) => (right.priority ?? 0) - (left.priority ?? 0)
      || left.id.localeCompare(right.id))[0];
  if (interaction === undefined) return null;
  let prompt: string | undefined;
  if (typeof interaction.prompt === 'string') prompt = interaction.prompt;
  else if (interaction.prompt !== undefined) {
    for (const [key, value] of Object.entries(state)) {
      if (value === true && interaction.prompt[key] !== undefined) {
        prompt = interaction.prompt[key];
        break;
      }
    }
    prompt ??= interaction.prompt.default;
  }
  return Object.freeze({
    prompt: prompt ?? `USE ${definition.displayName.toUpperCase()}`,
    ...(interaction.feedback === undefined ? {} : { feedback: interaction.feedback }),
    ...(interaction.reachTiles === undefined ? {} : { reachTiles: interaction.reachTiles }),
  });
}

export function registerObjectDataGraphs(
  registry: BehaviourHandlerRegistry,
  definitions: readonly ObjectContentDefinition[],
  engineVersion: number,
): BehaviourHandlerRegistry {
  return createHandlerRegistry([
    ...registry.registrations,
    ...definitions.flatMap((definition) => compileObjectDataGraph(definition, engineVersion)),
  ]);
}

export function interactionPrompt(
  interaction: InteractionDefinition,
  view: ReadOnlySnapshot,
): string | null {
  if (interaction.prompt === undefined) return null;
  if (typeof interaction.prompt === 'string') return interaction.prompt;
  if (view.target !== undefined && 'entityType' in view.target) {
    for (const [state, value] of Object.entries(view.target.state)) {
      if (value === true && interaction.prompt[state] !== undefined) return interaction.prompt[state]!;
    }
  }
  return interaction.prompt.default ?? null;
}

export interface ResolvedObjectLight {
  readonly enabled: boolean;
  readonly color: readonly [number, number, number];
  readonly radiusTiles: number;
  readonly profile: ObjectLightComponent['profile'];
  readonly offsetY?: number;
}

export function resolveObjectLight(
  light: ObjectLightComponent,
  state: Readonly<Record<string, StateValue>>,
): ResolvedObjectLight {
  return Object.freeze({
    enabled: light.when === undefined || state[light.when.state] === light.when.equals,
    color: light.color,
    radiusTiles: light.radiusTiles,
    profile: light.profile,
    ...(light.offsetY === undefined ? {} : { offsetY: light.offsetY }),
  });
}

/** Guards accidental authored/runtime verb drift in future event additions. */
export function dataGraphVerbForEvent(type: LifecycleEventType): InteractionDefinition['verb'] | null {
  return interactionVerbForEventType(type);
}
