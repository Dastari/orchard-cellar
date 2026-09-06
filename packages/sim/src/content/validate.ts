import {
  type ItemContentDefinition,
  type ItemDefinitionId,
  type ProcessContentDefinition,
  type RecipeContentDefinition,
  type SupportedContentDefinition,
} from './definitions.js';
import { CURRENT_BEHAVIOUR_ENGINE_VERSION, type Condition, type Effect, effectKind } from '../behaviour/effects.js';
import { validateDataGraphInteraction } from '../behaviour/data-graph.js';
import { validateTilesetDefinition } from '../terrain/tileset-registry.js';
import type { ObjectContentDefinition, ObjectStateDefinition } from './object-definition.js';
import type { FrameContentDefinition } from './frame-definition.js';
import type { LootCondition, LootContentDefinition } from './loot-definition.js';

export const MAX_CONTENT_DEFINITION_BYTES = 64 * 1024;
export const MAX_CONTENT_PACK_BYTES = 8 * 1024 * 1024;
export const MAX_CONTENT_DEFINITION_COUNT = 10_000;

/** Stable codes are part of the Studio/CLI/publish contract. Later phases can
 * add validation logic without making editor diagnostics depend on prose. */
export const CONTENT_VALIDATION_ERROR_CODES = [
  'invalid_schema_version',
  'invalid_id',
  'kind_slug_mismatch',
  'duplicate_id',
  'unsupported_definition_kind',
  'parse_error',
  'unresolved_reference',
  'retired_reference',
  'missing_retirement_replacement',
  'invalid_component_set',
  'ambiguous_interaction',
  'unsupported_opcode',
  'invalid_frame',
  'missing_sell_price',
  'invalid_economy_price',
  'recipe_value_loss',
  'invalid_dialogue_graph',
  'cyclic_quest_prerequisite',
  'invalid_loot_weight',
  'definition_too_large',
  'definition_count_exceeded',
  'pack_too_large',
  'nondeterministic_hash',
  'invalid_tileset',
  'missing_tileset_variant',
  'invalid_tileset_transition',
  'invalid_asset_reference',
  'invalid_terrain_reference',
  'invalid_world_definition',
] as const;

export type ContentValidationCode = typeof CONTENT_VALIDATION_ERROR_CODES[number];

export interface ContentValidationIssue {
  readonly severity: 'error' | 'warning';
  readonly code: ContentValidationCode;
  readonly definitionId?: string;
  readonly path?: string;
  readonly message: string;
}

export interface ContentValidationReport {
  readonly valid: boolean;
  readonly errors: readonly ContentValidationIssue[];
  readonly warnings: readonly ContentValidationIssue[];
}

function issue(
  severity: ContentValidationIssue['severity'],
  code: ContentValidationCode,
  message: string,
  definitionId?: string,
  path?: string,
): ContentValidationIssue {
  return {
    severity,
    code,
    ...(definitionId === undefined ? {} : { definitionId }),
    ...(path === undefined ? {} : { path }),
    message,
  };
}

function itemReferences(definition: SupportedContentDefinition): readonly ItemDefinitionId[] {
  switch (definition.kind) {
    case 'item': return [
      ...(definition.replacement === undefined ? [] : [definition.replacement]),
      ...(definition.durability === undefined ? [] : [definition.durability.repairMaterial]),
      ...(definition.food?.cookedFrom === undefined ? [] : [definition.food.cookedFrom]),
      ...(definition.ranged === undefined ? [] : [definition.ranged.ammunition]),
    ];
    case 'recipe': return [
      definition.output.item,
      ...(definition.recipeKind === 'shaped'
        ? definition.pattern.flatMap((row) => row.filter((entry): entry is ItemDefinitionId => entry !== null))
        : definition.inputs.map(({ item }) => item)),
      ...(definition.unlockHint === undefined ? [] : [definition.unlockHint.book]),
    ];
    case 'process': return [
      definition.input.item,
      ...definition.outputs.map(({ item }) => item),
      ...(definition.fuelPolicy?.acceptedItems ?? []),
    ];
    case 'shop': return definition.offers.map(({ item }) => item);
    case 'tileset': return [];
    case 'frame': return definition.panes.flatMap((pane) => pane.restriction?.acceptedItems ?? []);
    case 'loot': return definition.groups.flatMap(({ entries }) => entries.flatMap(({ target }) => (
      'item' in target ? [target.item] : []
    )));
    case 'crop': return [definition.seedItem, definition.harvestItem];
    case 'npc': case 'dialogue': case 'balance': case 'creature': case 'spawn':
    case 'space': case 'skill_tree': case 'effect': case 'statistic': case 'upgrade':
    case 'balance_group': return [];
    case 'quest': return [
      ...(definition.acceptItems ?? []).map(({ item }) => item),
      ...definition.objectives.flatMap((objective) => objective.kind === 'collect'
        ? objective.items.map(({ item }) => item) : []),
      ...definition.rewards.items.map(({ item }) => item),
      ...(definition.abandonRemovesItems ?? []).map(({ item }) => item),
      ...(definition.world?.surfaceItemsOnAccept ?? []).map(({ item }) => item),
      ...(definition.world?.personalResource === undefined
        ? [] : [definition.world.personalResource.item]),
    ];
    case 'object': return [
      ...(definition.components.placement === undefined ? [] : [definition.components.placement.item]),
      ...(definition.components.container?.restrictions?.flatMap(({ acceptedItems }) => acceptedItems ?? []) ?? []),
      ...(definition.components.interactions?.flatMap(({ effects }) => effects.flatMap((effect) => {
        if ('pickupAsItem' in effect) return [effect.pickupAsItem as ItemDefinitionId];
        if ('giveItem' in effect && effect.giveItem.kind?.startsWith('item:')) {
          return [effect.giveItem.kind as ItemDefinitionId];
        }
        if ('consumeItem' in effect && effect.consumeItem.kind?.startsWith('item:')) {
          return [effect.consumeItem.kind as ItemDefinitionId];
        }
        if ('spawnWorldItem' in effect && effect.spawnWorldItem.kind?.startsWith('item:')) {
          return [effect.spawnWorldItem.kind as ItemDefinitionId];
        }
        return [];
      })) ?? []),
    ];
  }
}

function validateWorldDefinition(
  definition: Extract<SupportedContentDefinition, {
    readonly kind: 'crop' | 'creature' | 'spawn' | 'space' | 'skill_tree' | 'effect' | 'statistic' | 'upgrade' | 'balance_group';
  }>,
  byId: ReadonlyMap<string, SupportedContentDefinition>,
): readonly ContentValidationIssue[] {
  const errors: ContentValidationIssue[] = [];
  const invalid = (message: string, path?: string) => errors.push(issue(
    'error', 'invalid_world_definition', message, definition.id, path,
  ));
  const unresolved = (reference: string, expected: SupportedContentDefinition['kind'], path: string) => {
    const target = byId.get(reference);
    if (target?.kind !== expected) errors.push(issue(
      'error', 'unresolved_reference', `${expected} reference does not resolve: ${reference}`,
      definition.id, path,
    ));
    else if (definition.retired !== true && target.retired === true) errors.push(issue(
      'error', 'retired_reference', `live definition references retired ${expected} ${reference}`,
      definition.id, path,
    ));
  };
  if (definition.retired === true && definition.replacement === undefined) invalid('retired world definitions require a replacement', 'replacement');
  if (definition.replacement !== undefined) unresolved(definition.replacement, definition.kind, 'replacement');
  if (definition.kind === 'crop') {
    if (BigInt(definition.growthTicks) <= 0n) invalid('crop growthTicks must be positive', 'growthTicks');
  } else if (definition.kind === 'creature') {
    if (definition.loot !== undefined) unresolved(definition.loot, 'loot', 'loot');
  } else if (definition.kind === 'spawn') {
    const targetKind = definition.target.slice(0, definition.target.indexOf(':')) as SupportedContentDefinition['kind'];
    unresolved(definition.target, targetKind, 'target');
    unresolved(definition.space, 'space', 'space');
    if (definition.strategy === 'packs' && (definition.packCount === undefined || definition.packSize === undefined)) {
      invalid('pack spawn rules require packCount and packSize', 'strategy');
    }
    if (definition.strategy === 'fixed' && (definition.positions?.length ?? 0) === 0) invalid('fixed spawn rules require positions', 'positions');
    if (definition.protectedBy !== undefined) unresolved(definition.protectedBy, 'npc', 'protectedBy');
    const runtimeIds = new Set<string>();
    definition.positions?.forEach((position, index) => {
      if (position.runtimeId === undefined) return;
      if (!/^\d+$/u.test(position.runtimeId) || BigInt(position.runtimeId) <= 0n) {
        invalid('fixed spawn runtimeId must be positive unsigned integer text', `positions[${index}].runtimeId`);
      }
      if (runtimeIds.has(position.runtimeId)) invalid(`duplicate fixed spawn runtimeId ${position.runtimeId}`, `positions[${index}].runtimeId`);
      runtimeIds.add(position.runtimeId);
    });
  } else if (definition.kind === 'space') {
    if (definition.spaceId > 0xffff) invalid('spaceId must fit unsigned 16-bit storage', 'spaceId');
    if (typeof definition.ambient !== 'string'
      && [definition.ambient.r, definition.ambient.g, definition.ambient.b].some((channel) => channel > 255)) {
      invalid('ambient RGB channels must be between 0 and 255', 'ambient');
    }
    const surfaceIds = new Set<string>();
    definition.surfaces?.forEach((surface, index) => {
      const path = `surfaces[${index}]`;
      if (!/^\d+$/u.test(surface.id) || BigInt(surface.id) <= 0n) invalid('surface id must be positive unsigned integer text', `${path}.id`);
      if (surfaceIds.has(surface.id)) invalid(`duplicate surface id ${surface.id}`, `${path}.id`);
      surfaceIds.add(surface.id);
      if (surface.tileX < 0 || surface.tileX >= definition.sizeTiles
        || surface.tileY < 0 || surface.tileY >= definition.sizeTiles) {
        invalid('surface tile must be inside the authored space', path);
      }
    });
    const rectangleIsValid = (bounds: { minimumTileX: number; maximumTileX: number; minimumTileY: number; maximumTileY: number }) => (
      bounds.minimumTileX <= bounds.maximumTileX && bounds.minimumTileY <= bounds.maximumTileY
      && bounds.minimumTileX >= 0 && bounds.minimumTileY >= 0
      && bounds.maximumTileX < definition.sizeTiles && bounds.maximumTileY < definition.sizeTiles
    );
    const landmarkIds = new Set<string>();
    const runtimeDecorationIds = new Set<bigint>();
    definition.landmarks?.forEach((landmark, landmarkIndex) => {
      const path = `landmarks[${landmarkIndex}]`;
      if (landmarkIds.has(landmark.id)) invalid(`duplicate landmark id ${landmark.id}`, `${path}.id`);
      landmarkIds.add(landmark.id);
      if (!/^\d+$/u.test(landmark.runtimeIdBase)) invalid('landmark runtimeIdBase must be unsigned integer text', `${path}.runtimeIdBase`);
      if (!rectangleIsValid(landmark.bounds)) invalid('landmark bounds must be ordered and inside the authored space', `${path}.bounds`);
      landmark.pathAreas?.forEach((area, index) => {
        if (!rectangleIsValid(area)) invalid('path area must be ordered and inside the authored space', `${path}.pathAreas[${index}]`);
      });
      landmark.groundWalkableAreas?.forEach((area, index) => {
        if (!rectangleIsValid(area)) invalid('walkable area must be ordered and inside the authored space', `${path}.groundWalkableAreas[${index}]`);
      });
      landmark.decorations.forEach((rule, ruleIndex) => {
        const rulePath = `${path}.decorations[${ruleIndex}]`;
        if (rule.kind === 'fence_rectangle' && (!rectangleIsValid(rule.bounds)
          || rule.gateTileX < rule.bounds.minimumTileX || rule.gateTileX > rule.bounds.maximumTileX
          || rule.gateTileY < rule.bounds.minimumTileY || rule.gateTileY > rule.bounds.maximumTileY)) {
          invalid('fence rectangle and gate must be inside the authored space', rulePath);
        }
        if (rule.kind === 'point') {
          if (rule.tileX < 0 || rule.tileX >= definition.sizeTiles || rule.tileY < 0 || rule.tileY >= definition.sizeTiles) {
            invalid('landmark point must be inside the authored space', rulePath);
          }
          if (rule.placeable !== undefined) {
            unresolved(rule.placeable.object, 'object', `${rulePath}.placeable.object`);
            if (!/^\d+$/u.test(rule.placeable.runtimeId) || BigInt(rule.placeable.runtimeId) <= 0n) {
              invalid('placeable runtimeId must be positive unsigned integer text', `${rulePath}.placeable.runtimeId`);
            }
            if (rule.placeable.automation !== undefined) {
              unresolved(rule.placeable.automation.actor, 'npc', `${rulePath}.placeable.automation.actor`);
              if (!/^\d+$/u.test(rule.placeable.automation.lightSalt)
                || !/^\d+$/u.test(rule.placeable.automation.extinguishSalt)) {
                invalid('automation salts must be unsigned integer text', `${rulePath}.placeable.automation`);
              }
              if (rule.placeable.automation.lightMinute >= 1440
                || rule.placeable.automation.extinguishMinute >= 1440) {
                invalid('automation minutes must be within a game day', `${rulePath}.placeable.automation`);
              }
            }
          }
        }
      });
      // Expansion also verifies deterministic id allocation without requiring
      // the simulation generator in the validation dependency graph.
      let nextOffset = 0n;
      for (const rule of landmark.decorations) {
        if (rule.kind === 'point') nextOffset = BigInt(rule.idOffset ?? Number(nextOffset)) + 1n;
        else if (rule.kind === 'fill_rectangle') nextOffset += BigInt(rule.width * rule.height);
        else {
          const width = rule.bounds.maximumTileX - rule.bounds.minimumTileX + 1;
          const height = rule.bounds.maximumTileY - rule.bounds.minimumTileY + 1;
          nextOffset += BigInt(width * 2 + Math.max(0, height - 2) * 2);
        }
        const runtimeId = BigInt(landmark.runtimeIdBase) + nextOffset - 1n;
        if (runtimeDecorationIds.has(runtimeId)) invalid(`duplicate landmark runtime id ${runtimeId}`, path);
        runtimeDecorationIds.add(runtimeId);
      }
    });
    const portalIds = new Set<string>();
    definition.portals?.forEach((portal, index) => {
      const path = `portals[${index}]`;
      if (!/^\d+$/u.test(portal.runtimeId) || BigInt(portal.runtimeId) <= 0n) invalid('portal runtimeId must be positive unsigned integer text', `${path}.runtimeId`);
      if (portalIds.has(portal.runtimeId)) invalid(`duplicate portal runtimeId ${portal.runtimeId}`, `${path}.runtimeId`);
      portalIds.add(portal.runtimeId);
      unresolved(portal.fromSpace, 'space', `${path}.fromSpace`);
      unresolved(portal.toSpace, 'space', `${path}.toSpace`);
    });
  } else if (definition.kind === 'skill_tree') {
    const nodeIds = new Set(definition.nodes.map(({ id }) => id));
    if (definition.nodes.some(({ track }) => track !== definition.track)) invalid('skill nodes must match their tree track', 'nodes');
    if (nodeIds.size !== definition.nodes.length) invalid('skill node IDs must be unique', 'nodes');
    for (const [index, node] of definition.nodes.entries()) {
      node.connects.forEach((target) => { if (!nodeIds.has(target)) invalid(`skill connection does not resolve: ${target}`, `nodes[${index}].connects`); });
      const prerequisites = node.prerequisites ?? [];
      if (new Set(prerequisites).size !== prerequisites.length) invalid('skill prerequisites must be unique', `nodes[${index}].prerequisites`);
      prerequisites.forEach((target) => {
        if (!nodeIds.has(target)) invalid(`skill prerequisite does not resolve: ${target}`, `nodes[${index}].prerequisites`);
      });
    }
    const nodeById = new Map(definition.nodes.map((node) => [node.id, node]));
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const visit = (id: string): void => {
      if (visiting.has(id)) { invalid(`skill prerequisite cycle reaches ${id}`, 'nodes.prerequisites'); return; }
      if (visited.has(id)) return;
      visiting.add(id);
      for (const prerequisite of nodeById.get(id)?.prerequisites ?? []) visit(prerequisite);
      visiting.delete(id);
      visited.add(id);
    };
    for (const node of definition.nodes) visit(node.id);
    if (definition.nodes.filter(({ root }) => root === true).length !== 1) invalid('skill tree requires exactly one root', 'nodes');
  } else if (definition.kind === 'effect') {
    const ids = new Set<string>();
    definition.modifiers.forEach((modifier, index) => {
      if (ids.has(modifier.id)) invalid(`duplicate effect modifier ${modifier.id}`, `modifiers[${index}].id`);
      ids.add(modifier.id);
    });
  } else if (definition.kind === 'statistic') {
    const milestones = definition.milestones.map(BigInt);
    if (milestones.some((value, index) => value <= 0n || (index > 0 && value <= milestones[index - 1]!))) invalid('statistic milestones must be positive and strictly increasing', 'milestones');
  } else if (definition.kind === 'balance_group') {
    if (new Set(definition.entries).size !== definition.entries.length) invalid('balance group entries must be unique', 'entries');
    definition.entries.forEach((entry, index) => unresolved(entry, 'balance', `entries[${index}]`));
  }
  return errors;
}

function stateValueMatches(definition: ObjectStateDefinition, value: unknown): boolean {
  if (definition.type === 'bool') return typeof value === 'boolean';
  if (definition.type === 'enum') return typeof value === 'string' && definition.values.includes(value);
  return typeof value === 'number' && Number.isSafeInteger(value)
    && (definition.min === undefined || value >= definition.min)
    && (definition.max === undefined || value <= definition.max);
}

function stateReference(condition: Condition): string | null {
  return 'state' in condition ? condition.state : null;
}

function objectEffectReferences(definition: ObjectContentDefinition): readonly string[] {
  return definition.components.interactions?.flatMap(({ effects }) => effects.flatMap((effect) => (
    'spawnObject' in effect ? [effect.spawnObject.definitionId] : []
  ))) ?? [];
}

function validateObjectDefinition(
  definition: ObjectContentDefinition,
  byId: ReadonlyMap<string, SupportedContentDefinition>,
  items: ReadonlyMap<string, ItemContentDefinition>,
): readonly ContentValidationIssue[] {
  const errors: ContentValidationIssue[] = [];
  const componentIssue = (message: string, path: string) => {
    errors.push(issue('error', 'invalid_component_set', message, definition.id, path));
  };
  const components = definition.components;
  const states = components.states ?? {};

  if (definition.retired === true && definition.replacement === undefined) {
    errors.push(issue(
      'error', 'missing_retirement_replacement', 'retired objects require a replacement', definition.id, 'replacement',
    ));
  }
  if (definition.replacement !== undefined) {
    const replacement = byId.get(definition.replacement);
    if (replacement?.kind !== 'object') {
      errors.push(issue('error', 'unresolved_reference', `object replacement does not resolve: ${definition.replacement}`, definition.id, 'replacement'));
    } else if (replacement.retired === true) {
      errors.push(issue('error', 'retired_reference', `object replacement is retired: ${definition.replacement}`, definition.id, 'replacement'));
    }
  }

  for (const [name, state] of Object.entries(states)) {
    if (state.type === 'enum' && (state.values.length === 0 || new Set(state.values).size !== state.values.length
      || !state.values.includes(state.default))) {
      componentIssue(`enum state ${name} needs unique values containing its default`, `components.states.${name}`);
    }
    if (state.type === 'counter' && ((state.min !== undefined && state.max !== undefined && state.min > state.max)
      || !stateValueMatches(state, state.default))) {
      componentIssue(`counter state ${name} has an invalid range or default`, `components.states.${name}`);
    }
  }

  for (const state of Object.keys(components.sprite?.animationByState ?? {})) {
    if (state !== 'default' && states[state] === undefined) {
      componentIssue(`sprite animation references unknown state ${state}`, `components.sprite.animationByState.${state}`);
    }
  }
  if (components.collision?.when !== undefined) {
    const state = states[components.collision.when.state];
    if (state === undefined || !stateValueMatches(state, components.collision.when.equals)) {
      componentIssue('conditional collision needs a compatible declared state', 'components.collision.when');
    }
  }
  if (components.light?.when !== undefined) {
    const state = states[components.light.when.state];
    if (state === undefined || !stateValueMatches(state, components.light.when.equals)) {
      componentIssue('conditional light needs a compatible declared state', 'components.light.when');
    }
  }
  if (components.placement !== undefined) {
    const source = items.get(components.placement.item);
    if (source !== undefined && !source.tags.includes('item.placeable')) {
      componentIssue('placement source item requires the item.placeable tag', 'components.placement.item');
    }
    const collisionFootprint = components.collision?.footprint;
    const placementFootprint = components.placement.footprint;
    if (collisionFootprint !== undefined && placementFootprint !== undefined
      && (collisionFootprint.length !== placementFootprint.length
        || collisionFootprint.some((row, index) => row.length !== placementFootprint[index]?.length))) {
      componentIssue('placement and collision footprints must have the same dimensions', 'components.placement.footprint');
    }
  }
  if (components.processor !== undefined) {
    const matchingProcesses = [...byId.values()].filter((candidate): candidate is ProcessContentDefinition => (
      candidate.kind === 'process' && candidate.stationTag === components.processor?.processTag
    ));
    const processAdapters = new Set(matchingProcesses.map(({ adapter }) => adapter));
    if (components.processor.minimumBatch !== undefined
      && components.processor.maximumBatch !== undefined
      && components.processor.minimumBatch > components.processor.maximumBatch) {
      componentIssue('processor minimum batch exceeds maximum batch', 'components.processor.minimumBatch');
    }
    if (components.container === undefined) {
      componentIssue('processor requires a container component', 'components.processor');
    } else {
      const slotOwners = new Map<number, string[]>();
      Object.entries(components.processor.slotRoles).forEach(([role, indexes]) => {
        if (indexes.length === 0) componentIssue(`processor role ${role} must contain a slot`, `components.processor.slotRoles.${role}`);
        indexes.forEach((slot) => slotOwners.set(slot, [...slotOwners.get(slot) ?? [], role]));
      });
      const slots = [...slotOwners.keys()];
      if (slots.some((slot) => slot >= components.container!.slotCount)) {
        componentIssue('processor role references a slot outside the container', 'components.processor.slotRoles');
      }
      const barrelInputReplacement = processAdapters.size === 1 && processAdapters.has('barrel');
      if ([...slotOwners.values()].some((roles) => roles.length > 1
        && !(barrelInputReplacement && roles.length === 2
          && roles.includes('input') && roles.includes('output')))) {
        componentIssue('processor slot roles must not overlap except barrel input replacement', 'components.processor.slotRoles');
      }
      const inputSlots = components.processor.slotRoles.input ?? [];
      const outputSlots = components.processor.slotRoles.output ?? [];
      if (inputSlots.length === 0) componentIssue('processor requires an input role', 'components.processor.slotRoles.input');
      if (outputSlots.length < Math.max(0, ...matchingProcesses.map(({ outputs }) => outputs.length))) {
        componentIssue('processor output role has fewer slots than its process outputs', 'components.processor.slotRoles.output');
      }
      if (matchingProcesses.some(({ fuelPolicy }) => fuelPolicy !== undefined)
        && (components.processor.slotRoles.fuel?.length ?? 0) === 0) {
        componentIssue('fuelled processor requires a fuel role', 'components.processor.slotRoles.fuel');
      }
    }
    if (processAdapters.size === 0) {
      errors.push(issue(
        'error', 'unresolved_reference', `processor tag does not resolve: ${components.processor.processTag}`,
        definition.id, 'components.processor.processTag',
      ));
    } else if (processAdapters.size > 1 || processAdapters.has(undefined)) {
      componentIssue('processor tag must resolve to exactly one runtime adapter', 'components.processor.processTag');
    }
  }
  if (components.frame !== undefined) {
    const frame = byId.get(components.frame.ref);
    if (frame?.kind !== 'frame') {
      errors.push(issue(
        'error', 'unresolved_reference', `object frame does not resolve: ${components.frame.ref}`,
        definition.id, 'components.frame.ref',
      ));
    } else {
      const slots = frame.panes.flatMap((pane) => ('entitySlots' in pane.bind ? pane.bind.entitySlots : []));
      if (slots.length > 0 && components.container === undefined) {
        componentIssue('a frame with entity slots requires a container component', 'components.frame.ref');
      } else if (components.container !== undefined
        && slots.some((slot) => slot >= components.container!.slotCount)) {
        componentIssue('frame references a slot outside the object container', 'components.frame.ref');
      }
    }
  }
  components.container?.restrictions?.forEach((restriction, index) => {
    if (new Set(restriction.slots).size !== restriction.slots.length
      || restriction.slots.some((slot) => slot >= components.container!.slotCount)) {
      componentIssue('container restriction has a duplicate or out-of-range slot', `components.container.restrictions[${index}].slots`);
    }
  });

  const interactionIds = new Set<string>();
  const resolverKeys = new Set<string>();
  components.interactions?.forEach((interaction, interactionIndex) => {
    const path = `components.interactions[${interactionIndex}]`;
    if (interactionIds.has(interaction.id)) {
      errors.push(issue('error', 'ambiguous_interaction', `duplicate interaction id ${interaction.id}`, definition.id, `${path}.id`));
    }
    interactionIds.add(interaction.id);
    const resolverKey = `${interaction.verb}:${interaction.priority ?? 0}:${JSON.stringify(interaction.with ?? null)}`;
    if (resolverKeys.has(resolverKey)) {
      errors.push(issue('error', 'ambiguous_interaction', 'interactions with the same verb/match need distinct priorities', definition.id, path));
    }
    resolverKeys.add(resolverKey);
    if (interaction.with !== undefined && interaction.verb !== 'use_with') {
      componentIssue('with match is only valid for use_with interactions', `${path}.with`);
    }
    if (interaction.effects.length === 0) componentIssue('interaction needs at least one effect', `${path}.effects`);
    for (const graphIssue of validateDataGraphInteraction(interaction, CURRENT_BEHAVIOUR_ENGINE_VERSION)) {
      errors.push(issue(
        'error', graphIssue.code === 'unsupported_condition' || graphIssue.code === 'unsupported_effect'
          || graphIssue.code === 'cooldown_state_unavailable' ? 'unsupported_opcode' : 'invalid_component_set',
        graphIssue.message, definition.id, `${path}.${graphIssue.path}`,
      ));
    }
    interaction.conditions.forEach((condition, conditionIndex) => {
      const reference = stateReference(condition);
      if (reference !== null && 'state' in condition) {
        const state = states[reference];
        if (state === undefined || !stateValueMatches(state, condition.equals)) {
          componentIssue('state condition references an unknown or incompatible state', `${path}.conditions[${conditionIndex}]`);
        }
      }
    });
    interaction.effects.forEach((effect: Effect, effectIndex) => {
      const effectPath = `${path}.effects[${effectIndex}]`;
      const stateNames = 'setState' in effect ? Object.keys(effect.setState)
        : 'toggleState' in effect ? [effect.toggleState]
          : 'incrementState' in effect ? [effect.incrementState.state] : [];
      for (const name of stateNames) {
        const state = states[name];
        if (state === undefined) componentIssue(`effect references unknown state ${name}`, effectPath);
        else if ('setState' in effect && !stateValueMatches(state, effect.setState[name])) {
          componentIssue(`effect assigns an incompatible value to state ${name}`, effectPath);
        } else if ('toggleState' in effect && state.type !== 'bool') {
          componentIssue(`toggleState requires bool state ${name}`, effectPath);
        } else if ('incrementState' in effect && state.type !== 'counter') {
          componentIssue(`incrementState requires counter state ${name}`, effectPath);
        }
      }
      if (effectKind(effect) === null) {
        errors.push(issue('error', 'unsupported_opcode', 'effect opcode is unsupported', definition.id, effectPath));
      }
    });
  });

  for (const reference of objectEffectReferences(definition)) {
    const target = byId.get(reference);
    if (target?.kind !== 'object') {
      errors.push(issue('error', 'unresolved_reference', `object reference does not resolve: ${reference}`, definition.id));
    } else if (definition.retired !== true && target.retired === true) {
      errors.push(issue('error', 'retired_reference', `live object references retired object ${reference}`, definition.id));
    }
  }
  return errors;
}

function recipeInputValue(
  definition: RecipeContentDefinition,
  items: ReadonlyMap<string, ItemContentDefinition>,
): number | null {
  const quantities = new Map<ItemDefinitionId, number>();
  if (definition.recipeKind === 'shapeless') {
    for (const input of definition.inputs) {
      quantities.set(input.item, (quantities.get(input.item) ?? 0) + input.count);
    }
  } else {
    for (const row of definition.pattern) {
      for (const item of row) {
        if (item !== null) quantities.set(item, (quantities.get(item) ?? 0) + 1);
      }
    }
  }
  let value = 0;
  for (const [item, count] of quantities) {
    const definitionItem = items.get(item);
    if (definitionItem === undefined) return null;
    value += definitionItem.economy.sell * count;
  }
  return value;
}

function validateFrameDefinition(
  definition: FrameContentDefinition,
  byId: ReadonlyMap<string, SupportedContentDefinition>,
): readonly ContentValidationIssue[] {
  const errors: ContentValidationIssue[] = [];
  const invalid = (message: string, path: string) => errors.push(issue(
    'error', 'invalid_frame', message, definition.id, path,
  ));
  if (definition.retired === true && definition.replacement === undefined) {
    errors.push(issue('error', 'missing_retirement_replacement', 'retired frames require a replacement', definition.id, 'replacement'));
  }
  if (definition.replacement !== undefined) {
    const replacement = byId.get(definition.replacement);
    if (replacement?.kind !== 'frame') {
      errors.push(issue('error', 'unresolved_reference', `frame replacement does not resolve: ${definition.replacement}`, definition.id, 'replacement'));
    } else if (replacement.retired === true) {
      errors.push(issue('error', 'retired_reference', `frame replacement is retired: ${definition.replacement}`, definition.id, 'replacement'));
    }
  }
  const entitySlots = new Set<number>();
  for (const [index, pane] of definition.panes.entries()) {
    const path = `panes[${index}]`;
    if ('entitySlots' in pane.bind) {
      const capacity = (pane.columns ?? 0) * (pane.rows ?? 0);
      if (pane.bind.entitySlots.length > capacity) invalid('entity slot binding exceeds the pane grid', `${path}.bind.entitySlots`);
      for (const slot of pane.bind.entitySlots) {
        if (entitySlots.has(slot)) invalid(`entity slot ${slot} is bound more than once`, `${path}.bind.entitySlots`);
        entitySlots.add(slot);
      }
    }
    if ((pane.kind === 'bar' && !('process' in pane.bind) && !('state' in pane.bind))
      || ('process' in pane.bind && pane.kind !== 'bar')) {
      invalid('bar panes require process.progress or state; process.progress requires a bar pane', `${path}.bind`);
    }
    if (pane.restriction !== undefined && pane.kind !== 'slots' && pane.kind !== 'paper_doll') {
      invalid('restrictions are valid only on slot panes', `${path}.restriction`);
    }
    const processReferences = [
      ...('recipeFilter' in pane.bind && pane.bind.recipeFilter.process !== undefined ? [pane.bind.recipeFilter.process] : []),
      ...(pane.restriction?.acceptedFrom?.process === undefined ? [] : [pane.restriction.acceptedFrom.process]),
    ];
    for (const processId of processReferences) {
      if (byId.get(processId)?.kind !== 'process') {
        errors.push(issue('error', 'unresolved_reference', `frame process does not resolve: ${processId}`, definition.id, path));
      }
    }
    const stationTags = [
      ...('recipeFilter' in pane.bind && pane.bind.recipeFilter.stationTag !== undefined ? [pane.bind.recipeFilter.stationTag] : []),
      ...(pane.restriction?.acceptedFrom?.stationTag === undefined ? [] : [pane.restriction.acceptedFrom.stationTag]),
    ];
    for (const stationTag of stationTags) {
      if (stationTag !== 'station.crafting' && ![...byId.values()].some((candidate) => (
        candidate.kind === 'process' && candidate.stationTag === stationTag
      ) || (
        candidate.kind === 'recipe' && candidate.stationRequirement?.objectTag === stationTag
      ))) {
        errors.push(issue('error', 'unresolved_reference', `frame station tag does not resolve: ${stationTag}`, definition.id, path));
      }
    }
  }
  const interactionIds = definition.buttons?.map(({ interaction }) => interaction) ?? [];
  if (new Set(interactionIds).size !== interactionIds.length) invalid('button interactions must be unique', 'buttons');
  return errors;
}

function validateLootCondition(
  condition: LootCondition,
  definition: LootContentDefinition,
  path: string,
): readonly ContentValidationIssue[] {
  if (!('rareRoll' in condition)) return [];
  const { threshold, outOf } = condition.rareRoll;
  return threshold <= outOf ? [] : [issue(
    'error', 'invalid_loot_weight', 'rare-roll threshold cannot exceed its range', definition.id, path,
  )];
}

function validateLootDefinition(
  definition: LootContentDefinition,
  byId: ReadonlyMap<string, SupportedContentDefinition>,
): readonly ContentValidationIssue[] {
  const errors: ContentValidationIssue[] = [];
  const invalid = (message: string, path: string) => errors.push(issue(
    'error', 'invalid_loot_weight', message, definition.id, path,
  ));
  if (definition.retired === true && definition.replacement === undefined) {
    errors.push(issue(
      'error', 'missing_retirement_replacement', 'retired loot definitions require a replacement',
      definition.id, 'replacement',
    ));
  }
  if (definition.replacement !== undefined) {
    const replacement = byId.get(definition.replacement);
    if (replacement?.kind !== 'loot') {
      errors.push(issue(
        'error', 'unresolved_reference', `loot replacement does not resolve: ${definition.replacement}`,
        definition.id, 'replacement',
      ));
    } else if (replacement.retired === true) {
      errors.push(issue(
        'error', 'retired_reference', `loot replacement is retired: ${definition.replacement}`,
        definition.id, 'replacement',
      ));
    }
  }
  const groupIds = new Set<string>();
  for (const [groupIndex, group] of definition.groups.entries()) {
    const groupPath = `groups[${groupIndex}]`;
    if (groupIds.has(group.id)) invalid(`duplicate loot group id ${group.id}`, `${groupPath}.id`);
    groupIds.add(group.id);
    const entryIds = new Set<string>();
    group.conditions?.forEach((condition, conditionIndex) => {
      errors.push(...validateLootCondition(condition, definition, `${groupPath}.conditions[${conditionIndex}]`));
    });
    for (const [entryIndex, entry] of group.entries.entries()) {
      const entryPath = `${groupPath}.entries[${entryIndex}]`;
      if (entryIds.has(entry.id)) invalid(`duplicate loot entry id ${entry.id}`, `${entryPath}.id`);
      entryIds.add(entry.id);
      if (!Number.isSafeInteger(entry.weight) || entry.weight <= 0) {
        invalid('loot entry weight must be a positive safe integer', `${entryPath}.weight`);
      }
      entry.conditions?.forEach((condition, conditionIndex) => {
        errors.push(...validateLootCondition(condition, definition, `${entryPath}.conditions[${conditionIndex}]`));
      });
      if ('item' in entry.target) {
        if (entry.target.min > entry.target.max) invalid('loot quantity min cannot exceed max', `${entryPath}.target`);
        continue;
      }
      const nested = byId.get(entry.target.loot);
      if (nested?.kind !== 'loot') {
        errors.push(issue(
          'error', 'unresolved_reference', `nested loot reference does not resolve: ${entry.target.loot}`,
          definition.id, `${entryPath}.target.loot`,
        ));
      } else if (nested.retired === true) {
        errors.push(issue(
          'error', 'retired_reference', `live loot references retired loot ${entry.target.loot}`,
          definition.id, `${entryPath}.target.loot`,
        ));
      } else if (nested.groups.some((nestedGroup) => (
        nestedGroup.entries.some((nestedEntry) => 'loot' in nestedEntry.target)
      ))) {
        invalid('loot nesting is limited to one table', `${entryPath}.target.loot`);
      }
    }
  }
  return errors;
}

function validateNpcDialogueQuestDefinition(
  definition: Extract<SupportedContentDefinition, { readonly kind: 'npc' | 'dialogue' | 'quest' }>,
  byId: ReadonlyMap<string, SupportedContentDefinition>,
): readonly ContentValidationIssue[] {
  const errors: ContentValidationIssue[] = [];
  const unresolved = (reference: string, expected: SupportedContentDefinition['kind'], path: string) => {
    if (byId.get(reference)?.kind !== expected) errors.push(issue(
      'error', 'unresolved_reference', `${expected} reference does not resolve: ${reference}`,
      definition.id, path,
    ));
  };
  if (definition.retired === true && definition.replacement === undefined) errors.push(issue(
    'error', 'missing_retirement_replacement', `retired ${definition.kind} definitions require a replacement`,
    definition.id, 'replacement',
  ));
  if (definition.replacement !== undefined) unresolved(definition.replacement, definition.kind, 'replacement');
  if (definition.kind === 'npc') {
    if (definition.dialogue !== undefined) unresolved(definition.dialogue, 'dialogue', 'dialogue');
    if (definition.mount !== undefined) {
      for (const skill of [definition.mount.requiredSkill, definition.mount.jumpSkill]) {
        if (skill !== undefined && ![...byId.values()].some((entry) => entry.kind === 'skill_tree'
          && entry.nodes.some((node) => node.id === skill))) errors.push(issue(
          'error', 'unresolved_reference', `mount skill node does not resolve: ${skill}`, definition.id, 'mount',
        ));
      }
    }
    if (definition.shop !== undefined) unresolved(definition.shop, 'shop', 'shop');
    definition.questGiver.forEach((reference, index) => unresolved(reference, 'quest', `questGiver[${index}]`));
    if (definition.protectedPack !== undefined
      && (!/^\d+$/u.test(definition.protectedPack.packId)
        || BigInt(definition.protectedPack.packId) <= 0n)) {
      errors.push(issue(
        'error', 'invalid_world_definition', 'protected pack id must be positive unsigned integer text',
        definition.id, 'protectedPack.packId',
      ));
    }
  } else if (definition.kind === 'dialogue') {
    const nodeIds = new Set(definition.nodes.map(({ id }) => id));
    if (!nodeIds.has(definition.initialNodeId)) errors.push(issue(
      'error', 'invalid_dialogue_graph', 'initial dialogue node does not resolve', definition.id, 'initialNodeId',
    ));
    for (const [nodeIndex, node] of definition.nodes.entries()) {
      const choiceIds = new Set<string>();
      const questActions = new Set<string>();
      for (const [choiceIndex, choice] of node.choices.entries()) {
        const path = `nodes[${nodeIndex}].choices[${choiceIndex}]`;
        if (choiceIds.has(choice.id)) errors.push(issue('error', 'invalid_dialogue_graph', `duplicate choice ${choice.id}`, definition.id, `${path}.id`));
        choiceIds.add(choice.id);
        if (choice.nextNodeId !== null && !nodeIds.has(choice.nextNodeId)) errors.push(issue('error', 'invalid_dialogue_graph', `next node does not resolve: ${choice.nextNodeId}`, definition.id, `${path}.nextNodeId`));
        if (choice.quest !== undefined) {
          unresolved(choice.quest.quest, 'quest', `${path}.quest.quest`);
          if (choice.quest.action !== undefined) {
            const actionKey = `${choice.quest.quest}:${choice.quest.action}`;
            if (questActions.has(actionKey)) errors.push(issue(
              'error', 'invalid_dialogue_graph', `duplicate ${actionKey} action in dialogue node`,
              definition.id, path,
            ));
            questActions.add(actionKey);
          }
        }
      }
      if (node.frameId !== undefined) {
        unresolved(node.frameId, 'frame', `nodes[${nodeIndex}].frameId`);
        const frame = byId.get(node.frameId);
        if (node.mode !== 'shop' || frame?.kind !== 'frame' || frame.retired === true
          || frame.presentation?.surface !== 'merchant') {
          errors.push(issue('error', 'invalid_dialogue_graph', 'dialogue frame requires a merchant surface on a shop node', definition.id, `nodes[${nodeIndex}].frameId`));
        }
      }
      if (node.mode === 'shop' && definition.shop === undefined) errors.push(issue('error', 'unresolved_reference', 'shop dialogue node requires a shop reference', definition.id, `nodes[${nodeIndex}].mode`));
    }
    if (definition.shop !== undefined) unresolved(definition.shop, 'shop', 'shop');
  } else {
    unresolved(definition.giver, 'npc', 'giver');
    definition.prerequisites?.forEach((reference, index) => unresolved(reference, 'quest', `prerequisites[${index}]`));
    const objectiveIds = new Set<string>();
    for (const [index, objective] of definition.objectives.entries()) {
      if (objectiveIds.has(objective.id)) errors.push(issue(
        'error', 'unresolved_reference', `duplicate quest objective id: ${objective.id}`,
        definition.id, `objectives[${index}].id`,
      ));
      objectiveIds.add(objective.id);
      if (objective.kind === 'talk') objective.npcs.forEach((reference, npcIndex) => unresolved(reference, 'npc', `objectives[${index}].npcs[${npcIndex}]`));
    }
    definition.world?.surfaceItemsOnAccept?.forEach((item, index) => {
      const path = `world.surfaceItemsOnAccept[${index}]`;
      const objective = definition.objectives.find(({ id }) => id === item.objectiveId);
      if (objective?.kind !== 'collect' || !objective.items.some((entry) => entry.item === item.item)) {
        errors.push(issue(
          'error', 'invalid_world_definition', 'surface item must resolve to a matching collect objective',
          definition.id, path,
        ));
      }
      const surface = [...byId.values()].flatMap((candidate) => (
        candidate.kind === 'space' ? candidate.surfaces ?? [] : []
      )).find(({ id }) => id === item.surfaceId);
      if (surface === undefined) {
        errors.push(issue('error', 'unresolved_reference', `surface does not resolve: ${item.surfaceId}`, definition.id, `${path}.surfaceId`));
      } else if (item.slot >= surface.capacity) {
        errors.push(issue('error', 'invalid_world_definition', 'surface item slot exceeds surface capacity', definition.id, `${path}.slot`));
      }
    });
    const resource = definition.world?.personalResource;
    if (resource !== undefined) {
      const objective = definition.objectives.find(({ id }) => id === resource.objectiveId);
      if (objective?.kind !== 'statistic'
        || objective.subjectKind !== resource.item.slice('item:'.length)) {
        errors.push(issue(
          'error', 'invalid_world_definition', 'personal resource must resolve to a statistic objective for its item',
          definition.id, 'world.personalResource',
        ));
      }
      if (!/^\d+$/u.test(resource.resourceId) || BigInt(resource.resourceId) <= 0n) {
        errors.push(issue(
          'error', 'invalid_world_definition', 'personal resource id must be positive unsigned integer text',
          definition.id, 'world.personalResource.resourceId',
        ));
      }
      const space = [...byId.values()].find((candidate) => (
        candidate.kind === 'space' && candidate.spaceId === resource.spaceId
      ));
      if (space?.kind !== 'space') {
        errors.push(issue(
          'error', 'unresolved_reference', `space id does not resolve: ${resource.spaceId}`,
          definition.id, 'world.personalResource.spaceId',
        ));
      } else if (resource.tileX < 0 || resource.tileX >= space.sizeTiles
        || resource.tileY < 0 || resource.tileY >= space.sizeTiles) {
        errors.push(issue(
          'error', 'invalid_world_definition', 'personal resource tile must be inside its authored space',
          definition.id, 'world.personalResource',
        ));
      }
    }
    const triggerIds = new Set<string>();
    definition.world?.narrativeTriggers?.forEach((trigger, index) => {
      const path = `world.narrativeTriggers[${index}]`;
      if (triggerIds.has(trigger.id)) errors.push(issue(
        'error', 'invalid_world_definition', `duplicate narrative trigger ${trigger.id}`,
        definition.id, `${path}.id`,
      ));
      triggerIds.add(trigger.id);
      if (trigger.event === 'water_crop' && byId.get(`crop:${trigger.subjectKind}`)?.kind !== 'crop') {
        errors.push(issue(
          'error', 'unresolved_reference', `crop trigger subject does not resolve: ${trigger.subjectKind}`,
          definition.id, `${path}.subjectKind`,
        ));
      }
    });
  }
  return errors;
}

export function validateContentDefinitions(
  definitions: readonly SupportedContentDefinition[],
): ContentValidationReport {
  const errors: ContentValidationIssue[] = [];
  const warnings: ContentValidationIssue[] = [];
  const byId = new Map<string, SupportedContentDefinition>();
  let packBytes = 0;

  if (definitions.length > MAX_CONTENT_DEFINITION_COUNT) {
    errors.push(issue(
      'error',
      'definition_count_exceeded',
      `pack has ${definitions.length} definitions; maximum is ${MAX_CONTENT_DEFINITION_COUNT}`,
    ));
  }

  for (const definition of definitions) {
    if (byId.has(definition.id)) {
      errors.push(issue('error', 'duplicate_id', `duplicate definition id ${definition.id}`, definition.id));
      continue;
    }
    byId.set(definition.id, definition);
    const bytes = new TextEncoder().encode(JSON.stringify(definition)).byteLength;
    packBytes += bytes;
    if (bytes > MAX_CONTENT_DEFINITION_BYTES) {
      errors.push(issue(
        'error',
        'definition_too_large',
        `definition is ${bytes} bytes; maximum is ${MAX_CONTENT_DEFINITION_BYTES}`,
        definition.id,
      ));
    }
  }
  if (packBytes > MAX_CONTENT_PACK_BYTES) {
    errors.push(issue(
      'error',
      'pack_too_large',
      `pack is ${packBytes} bytes; maximum is ${MAX_CONTENT_PACK_BYTES}`,
    ));
  }

  const items = new Map<string, ItemContentDefinition>();
  for (const definition of definitions) {
    if (definition.kind === 'item') items.set(definition.id, definition);
  }
  const skillNodeIds = new Set(definitions.flatMap((definition) => (
    definition.kind === 'skill_tree' ? definition.nodes.map(({ id }) => id) : []
  )));
  const skillNodeOwners = new Map<string, string>();
  for (const definition of definitions) {
    if (definition.kind !== 'skill_tree') continue;
    for (const node of definition.nodes) {
      const owner = skillNodeOwners.get(node.id);
      if (owner !== undefined && owner !== definition.id) errors.push(issue('error', 'invalid_world_definition',
        `skill node ${node.id} is already owned by ${owner}`, definition.id, 'nodes'));
      else skillNodeOwners.set(node.id, definition.id);
    }
  }


  const legacyJobOwners = new Map<string, string>();
  for (const definition of definitions) {
    if (definition.kind !== 'process' || definition.legacyJob === undefined) continue;
    const recipeId = definition.legacyJob.recipeId;
    const owner = legacyJobOwners.get(recipeId);
    if (owner !== undefined) errors.push(issue('error', 'ambiguous_interaction',
      `legacy job recipe ${recipeId} is already owned by ${owner}`, definition.id, 'legacyJob.recipeId'));
    else legacyJobOwners.set(recipeId, definition.id);
  }

  const npcRuntimeIds = new Map<string, string>();
  const npcRuntimeKinds = new Map<string, string>();
  const surfaceRuntimeIds = new Map<string, string>();
  for (const definition of definitions) {
    if (definition.kind === 'npc') {
      const runtimeKind = definition.runtimeKind ?? definition.id.slice('npc:'.length);
      const kindOwner = npcRuntimeKinds.get(runtimeKind);
      if (kindOwner !== undefined) errors.push(issue('error', 'unresolved_reference',
        `NPC runtime kind ${runtimeKind} is already owned by ${kindOwner}`, definition.id, 'runtimeKind'));
      else npcRuntimeKinds.set(runtimeKind, definition.id);
      const owner = npcRuntimeIds.get(definition.runtimeId);
      if (owner !== undefined) errors.push(issue(
        'error', 'unresolved_reference',
        `NPC runtime id ${definition.runtimeId} is already owned by ${owner}`,
        definition.id, 'runtimeId',
      ));
      else npcRuntimeIds.set(definition.runtimeId, definition.id);
    }
    if (definition.kind === 'space') {
      definition.surfaces?.forEach((surface, index) => {
        const owner = surfaceRuntimeIds.get(surface.id);
        if (owner !== undefined) errors.push(issue(
          'error', 'invalid_world_definition',
          `surface runtime id ${surface.id} is already owned by ${owner}`,
          definition.id, `surfaces[${index}].id`,
        ));
        else surfaceRuntimeIds.set(surface.id, definition.id);
      });
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visitQuest = (questId: string): void => {
    if (visited.has(questId)) return;
    if (visiting.has(questId)) {
      errors.push(issue(
        'error', 'cyclic_quest_prerequisite',
        `quest prerequisite cycle reaches ${questId}`, questId, 'prerequisites',
      ));
      return;
    }
    const definition = byId.get(questId);
    if (definition?.kind !== 'quest') return;
    visiting.add(questId);
    for (const prerequisite of definition.prerequisites ?? []) visitQuest(prerequisite);
    visiting.delete(questId);
    visited.add(questId);
  };
  for (const definition of definitions) {
    if (definition.kind === 'quest') visitQuest(definition.id);
  }

  for (const definition of definitions) {
    if (definition.kind === 'item') {
      if (!Number.isSafeInteger(definition.economy.sell) || definition.economy.sell < 0) {
        errors.push(issue(
          'error', 'missing_sell_price', 'item requires a non-negative sell price', definition.id, 'economy.sell',
        ));
      }
      if (definition.economy.buy !== null && definition.economy.buy < definition.economy.sell) {
        errors.push(issue(
          'error', 'invalid_economy_price', 'buy price must be greater than or equal to sell price', definition.id, 'economy.buy',
        ));
      }
      const purchaseSkill = definition.economy.purchaseRequirement?.skillNode;
      if (purchaseSkill !== undefined && !skillNodeIds.has(purchaseSkill)) {
        errors.push(issue(
          'error', 'unresolved_reference', `purchase skill node does not resolve: ${purchaseSkill}`,
          definition.id, 'economy.purchaseRequirement.skillNode',
        ));
      }
      if (definition.retired === true && definition.replacement === undefined) {
        errors.push(issue(
          'error',
          'missing_retirement_replacement',
          'retired items require a replacement until runtime reference checks land',
          definition.id,
          'replacement',
        ));
      }
    }

    if (definition.kind === 'tileset') {
      for (const tilesetIssue of validateTilesetDefinition(definition)) {
        errors.push(issue(
          'error',
          tilesetIssue.code,
          tilesetIssue.message,
          definition.id,
          tilesetIssue.path,
        ));
      }
      if (definition.retired === true && definition.replacement === undefined) {
        errors.push(issue(
          'error',
          'missing_retirement_replacement',
          'retired tilesets require a replacement',
          definition.id,
          'replacement',
        ));
      }
      if (definition.replacement !== undefined) {
        const target = byId.get(definition.replacement);
        if (target === undefined || target.kind !== 'tileset') {
          errors.push(issue(
            'error',
            'unresolved_reference',
            `tileset replacement does not resolve: ${definition.replacement}`,
            definition.id,
            'replacement',
          ));
        } else if (target.retired === true) {
          errors.push(issue(
            'error',
            'retired_reference',
            `live tileset references retired replacement ${definition.replacement}`,
            definition.id,
            'replacement',
          ));
        }
      }
    }

    if (definition.kind === 'object') {
      errors.push(...validateObjectDefinition(definition, byId, items));
    }
    if (definition.kind === 'item') {
      const ids = new Set<string>();
      definition.onUse.forEach((interaction, interactionIndex) => {
        const path = `onUse[${interactionIndex}]`;
        if (ids.has(interaction.id)) errors.push(issue(
          'error', 'ambiguous_interaction', `duplicate onUse action ${interaction.id}`,
          definition.id, `${path}.id`,
        ));
        ids.add(interaction.id);
        if (interaction.effects.length === 0) errors.push(issue(
          'error', 'invalid_component_set', 'onUse action needs at least one effect',
          definition.id, `${path}.effects`,
        ));
        for (const graphIssue of validateDataGraphInteraction(interaction, CURRENT_BEHAVIOUR_ENGINE_VERSION)) {
          errors.push(issue(
            'error', graphIssue.code === 'unsupported_condition' || graphIssue.code === 'unsupported_effect'
              || graphIssue.code === 'cooldown_state_unavailable' ? 'unsupported_opcode' : 'invalid_component_set',
            graphIssue.message, definition.id, `${path}.${graphIssue.path}`,
          ));
        }
        interaction.effects.forEach((effect, effectIndex) => {
          if (!('learnRecipes' in effect)) return;
          effect.learnRecipes.forEach((reference, referenceIndex) => {
            const expected = reference.startsWith('recipe:') ? 'recipe' : 'process';
            const target = byId.get(reference);
            const referencePath = `${path}.effects[${effectIndex}].learnRecipes[${referenceIndex}]`;
            if (target?.kind !== expected) errors.push(issue(
              'error', 'unresolved_reference', `${expected} reference does not resolve: ${reference}`,
              definition.id, referencePath,
            ));
            else if (definition.retired !== true && target.retired === true) errors.push(issue(
              'error', 'retired_reference', `live definition references retired ${expected} ${reference}`,
              definition.id, referencePath,
            ));
          });
        });
      });
    }
    if (definition.kind === 'frame') {
      errors.push(...validateFrameDefinition(definition, byId));
    }
    if (definition.kind === 'loot') {
      errors.push(...validateLootDefinition(definition, byId));
    }
    if (definition.kind === 'npc' || definition.kind === 'dialogue' || definition.kind === 'quest') {
      errors.push(...validateNpcDialogueQuestDefinition(definition, byId));
    }
    if (definition.kind === 'crop' || definition.kind === 'creature' || definition.kind === 'spawn'
      || definition.kind === 'space' || definition.kind === 'skill_tree' || definition.kind === 'effect'
      || definition.kind === 'statistic' || definition.kind === 'upgrade' || definition.kind === 'balance_group') {
      errors.push(...validateWorldDefinition(definition, byId));
    }

    for (const reference of itemReferences(definition)) {
      const target = items.get(reference);
      if (target === undefined) {
        errors.push(issue(
          'error', 'unresolved_reference', `item reference does not resolve: ${reference}`, definition.id,
        ));
      } else if (definition.retired !== true && target.retired === true) {
        errors.push(issue(
          'error', 'retired_reference', `live definition references retired item ${reference}`, definition.id,
        ));
      }
    }

    if (definition.kind === 'recipe' && definition.retired !== true) {
      const skill = definition.skillRequirement?.skillNode;
      if (skill !== undefined && !skillNodeIds.has(skill)) {
        errors.push(issue('error', 'unresolved_reference', `crafting skill node does not resolve: ${skill}`,
          definition.id, 'skillRequirement.skillNode'));
      }
      const inputValue = recipeInputValue(definition, items);
      const output = items.get(definition.output.item);
      if (inputValue !== null && output !== undefined) {
        const outputValue = output.economy.sell * definition.output.count;
        if (inputValue > outputValue) {
          warnings.push(issue(
            'warning',
            'recipe_value_loss',
            `inputs sell for ${inputValue}, more than output value ${outputValue}`,
            definition.id,
          ));
        }
      }
    }
  }

  return Object.freeze({
    valid: errors.length === 0,
    errors: Object.freeze(errors),
    warnings: Object.freeze(warnings),
  });
}
