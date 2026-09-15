import { equipmentModifierAllowed } from '../equipment-budget.js';
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
import type { ResourceContentDefinition } from './resource-definition.js';
import type { LoadoutContentDefinition } from './loadout-definition.js';
import type { SupportCapCapability } from './balance-definition.js';

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

export interface ContentValidationOptions {
  /** Accept parser projections only for the byte-identical Stage-A production
   * pack. Callers must establish that raw row fingerprint before enabling it. */
  readonly allowLegacyStageA?: boolean;
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

function authoredReferenceId(kind: 'effect' | 'statistic', reference: string): string {
  return reference.startsWith(`${kind}:`) ? reference : `${kind}:${reference}`;
}

function statisticSubjectIsCoherent(
  subjectPolicy: Extract<SupportedContentDefinition, { readonly kind: 'statistic' }>['subject'],
  subject: string,
): boolean {
  switch (subjectPolicy) {
    case 'none': return subject === '';
    case 'chat_kind': return ['channel', 'whisper', 'say', 'shout'].includes(subject);
    case 'movement_mode': return ['foot', 'jump', 'horse', 'boat'].includes(subject);
    case 'transaction_kind': return subject === 'buy' || subject === 'sell';
    case 'skill_track': return ['combat', 'explorer', 'farming'].includes(subject);
    case 'item_kind': case 'resource_kind': case 'tool_kind': case 'npc_kind':
    case 'hit_kind': case 'crop_kind': case 'fish_kind': case 'creature_kind':
    case 'combat_target_kind': case 'damage_kind': case 'quest_kind': case 'npc_id':
    case 'quest_objective': case 'quest_action': case 'upgrade_kind':
      return subject.trim().length > 0;
    default: return false;
  }
}

function validateAuthoredEffectReferences(
  owner: SupportedContentDefinition,
  effect: Effect,
  path: string,
  byId: ReadonlyMap<string, SupportedContentDefinition>,
): readonly ContentValidationIssue[] {
  const errors: ContentValidationIssue[] = [];
  if ('applyEffect' in effect) {
    const reference = authoredReferenceId('effect', effect.applyEffect.effectId);
    const target = byId.get(reference);
    if (target?.kind !== 'effect') errors.push(issue(
      'error', 'unresolved_reference', `effect reference does not resolve: ${reference}`,
      owner.id, `${path}.applyEffect.effectId`,
    ));
    else if (owner.retired !== true && target.retired === true) errors.push(issue(
      'error', 'retired_reference', `live definition references retired effect ${reference}`,
      owner.id, `${path}.applyEffect.effectId`,
    ));
    else if (effect.applyEffect.stacks !== undefined
      && effect.applyEffect.stacks > target.maxStacks) errors.push(issue(
      'error', 'invalid_component_set',
      `effect stacks exceed ${reference} maximum of ${target.maxStacks}`,
      owner.id, `${path}.applyEffect.stacks`,
    ));
  }
  if (!('statistic' in effect)) return errors;
  const authored = typeof effect.statistic === 'string'
    ? { kind: effect.statistic, subject: '', delta: 1 }
    : { kind: effect.statistic.kind, subject: effect.statistic.subject ?? '', delta: effect.statistic.delta ?? 1 };
  const reference = authoredReferenceId('statistic', authored.kind);
  const target = byId.get(reference);
  if (target?.kind !== 'statistic') {
    errors.push(issue(
      'error', 'unresolved_reference', `statistic reference does not resolve: ${reference}`,
      owner.id, `${path}.statistic${typeof effect.statistic === 'string' ? '' : '.kind'}`,
    ));
    return errors;
  }
  if (owner.retired !== true && target.retired === true) errors.push(issue(
    'error', 'retired_reference', `live definition references retired statistic ${reference}`,
    owner.id, `${path}.statistic${typeof effect.statistic === 'string' ? '' : '.kind'}`,
  ));
  if (target.reserved === true) errors.push(issue(
    'error', 'invalid_component_set', `authored callbacks cannot write reserved statistic ${reference}`,
    owner.id, `${path}.statistic${typeof effect.statistic === 'string' ? '' : '.kind'}`,
  ));
  const deltaIsValid = typeof authored.delta === 'bigint'
    ? authored.delta > 0n && authored.delta <= (1n << 64n) - 1n
    : Number.isSafeInteger(authored.delta) && authored.delta > 0;
  if (!deltaIsValid) errors.push(issue(
    'error', 'invalid_component_set', 'statistic delta must be a positive bounded integer',
    owner.id, `${path}.statistic.delta`,
  ));
  if (!statisticSubjectIsCoherent(target.subject, authored.subject)) errors.push(issue(
    'error', 'invalid_component_set', `statistic subject does not match ${target.subject}`,
    owner.id, `${path}.statistic${typeof effect.statistic === 'string' ? '' : '.subject'}`,
  ));
  return errors;
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
    case 'resource': return definition.seedItem === undefined ? [] : [definition.seedItem];
    case 'npc': return [
      ...(definition.commerce?.villageOrders ?? []).map(({ item }) => item),
      ...(definition.commerce?.recipeExchange === undefined ? [] : [definition.commerce.recipeExchange.payment.item]),
    ];
    case 'loadout': return definition.entries.map(({ item }) => item);
    case 'encounter': return definition.reward.drops.map(({ item }) => item);
    case 'balance': return 'profile' in definition && definition.profile === 'residence_construction'
      ? definition.values.slice(1, 4) as readonly ItemDefinitionId[] : [];
    case 'dialogue': case 'creature': case 'spawn':
    case 'space': case 'skill_tree': case 'effect': case 'statistic': case 'upgrade':
    case 'balance_group': case 'enemy': return [];
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
      ...(definition.components.carry?.mode === 'preserve_entity_or_item_when_empty'
        ? [definition.components.carry.item] : []),
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
  return [];
}

function validateOutdoorDefinition(
  definition: Extract<SupportedContentDefinition, { readonly kind: 'enemy' | 'encounter' }>,
  byId: ReadonlyMap<string, SupportedContentDefinition>,
): readonly ContentValidationIssue[] {
  const errors: ContentValidationIssue[] = [];
  const invalid = (message: string, path?: string) => errors.push(issue(
    'error', 'invalid_world_definition', message, definition.id, path,
  ));
  const unresolved = (reference: string, expected: 'enemy' | 'encounter', path: string) => {
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
  if (definition.retired === true && definition.replacement === undefined) invalid(
    'retired outdoor definitions require a replacement', 'replacement',
  );
  if (definition.replacement !== undefined) unresolved(definition.replacement, definition.kind, 'replacement');
  if (definition.kind === 'enemy') {
    const npcKinds = [definition.npcKind, ...(definition.aliases ?? [])];
    if (new Set(npcKinds).size !== npcKinds.length) {
      invalid('enemy NPC kind and aliases must be unique', 'aliases');
    }
    if (definition.speedPermille > 10_000) invalid('enemy speed must not exceed 10000 permille', 'speedPermille');
    if (definition.behavior.engine === 'kite'
      && (definition.behavior.retreatBelowTiles === undefined || definition.behavior.holdWithinTiles === undefined)) {
      invalid('kite behavior requires retreatBelowTiles and holdWithinTiles', 'behavior');
    }
    if (definition.behavior.engine === 'orbit'
      && (definition.behavior.retreatBelowTiles === undefined || definition.behavior.orbitWithinTiles === undefined)) {
      invalid('orbit behavior requires retreatBelowTiles and orbitWithinTiles', 'behavior');
    }
    if ((definition.behavior.retreatBelowTiles ?? 0) > (definition.behavior.holdWithinTiles
      ?? definition.behavior.orbitWithinTiles ?? Number.POSITIVE_INFINITY)) {
      invalid('enemy retreat range cannot exceed its hold/orbit range', 'behavior.retreatBelowTiles');
    }
    return errors;
  }
  if (definition.members.length === 0) invalid('encounters require at least one member', 'members');
  definition.members.forEach((member, index) => unresolved(member.enemy, 'enemy', `members[${index}].enemy`));
  if (new Set(definition.roles).size !== definition.roles.length) invalid('encounter roles must be unique', 'roles');
  definition.reward.drops.forEach((drop, index) => {
    if (drop.chanceBasisPoints > 10_000) invalid('drop chance must not exceed 10000 basis points', `reward.drops[${index}].chanceBasisPoints`);
  });
  definition.completionStatistics?.forEach((statistic, index) => {
    const authored = byId.get(`statistic:${statistic.kind}`);
    if (authored?.kind !== 'statistic') errors.push(issue(
      'error', 'unresolved_reference', `statistic reference does not resolve: ${statistic.kind}`,
      definition.id, `completionStatistics[${index}].kind`,
    ));
    else if (definition.retired !== true && (authored.retired === true || authored.reserved === true)) errors.push(issue(
      'error', 'retired_reference', `live encounter references unavailable statistic ${statistic.kind}`,
      definition.id, `completionStatistics[${index}].kind`,
    ));
  });
  if (definition.summons !== undefined) {
    unresolved(definition.summons.enemy, 'enemy', 'summons.enemy');
    if (definition.summons.offsets.length === 0) invalid('summons require at least one offset', 'summons.offsets');
  }
  return errors;
}

function validateLoadoutDefinition(
  definition: LoadoutContentDefinition,
  byId: ReadonlyMap<string, SupportedContentDefinition>,
  activeRoleOwners: Map<string, string>,
): readonly ContentValidationIssue[] {
  const errors: ContentValidationIssue[] = [];
  if (definition.retired === true && definition.replacement === undefined) errors.push(issue(
    'error', 'missing_retirement_replacement', 'retired loadouts require a replacement',
    definition.id, 'replacement',
  ));
  if (definition.replacement !== undefined) {
    const replacement = byId.get(definition.replacement);
    if (replacement?.kind !== 'loadout') errors.push(issue(
      'error', 'unresolved_reference', `loadout replacement does not resolve: ${definition.replacement}`,
      definition.id, 'replacement',
    ));
    else if (replacement.retired === true) errors.push(issue(
      'error', 'retired_reference', `loadout replacement is retired: ${definition.replacement}`,
      definition.id, 'replacement',
    ));
  }
  if (definition.retired !== true) {
    const owner = activeRoleOwners.get(definition.role);
    if (owner !== undefined && owner !== definition.id) errors.push(issue(
      'error', 'ambiguous_interaction', `loadout role ${definition.role} is already owned by ${owner}`,
      definition.id, 'role',
    ));
    else activeRoleOwners.set(definition.role, definition.id);
    if (definition.abilities.filter(({ adapter }) => adapter === 'sprint').length !== 1) errors.push(issue(
      'error', 'invalid_component_set', 'active new-player loadout requires exactly one sprint adapter',
      definition.id, 'abilities',
    ));
  }
  definition.entries.forEach((entry, index) => {
    const item = byId.get(entry.item);
    if (item?.kind === 'item' && entry.quantity > item.maxStack) errors.push(issue(
      'error', 'invalid_component_set',
      `loadout quantity ${entry.quantity} exceeds ${entry.item} max stack ${item.maxStack}`,
      definition.id, `entries[${index}].quantity`,
    ));
  });
  return errors;
}

function validateResourceDefinition(
  definition: ResourceContentDefinition,
  byId: ReadonlyMap<string, SupportedContentDefinition>,
  runtimeKinds: ReadonlyMap<string, string>,
  fixedSiteIds: Map<string, string>,
): readonly ContentValidationIssue[] {
  const errors: ContentValidationIssue[] = [];
  const invalid = (message: string, path?: string) => errors.push(issue(
    'error', 'invalid_world_definition', message, definition.id, path,
  ));
  if (definition.seedItem !== undefined) {
    const seed = byId.get(definition.seedItem);
    if (seed?.kind !== 'item' || !seed.tags.includes('item.seed')
      || (definition.retired !== true && seed.retired === true)) invalid('seedItem must reference a live seed item', 'seedItem');
    if (!definition.tags.includes('resource.fruit_tree') || definition.regrowth?.enabled !== true
      || definition.health.followsGrowthStage !== true) invalid('seedItem requires a regrowing fruit tree', 'seedItem');
    if (definition.retired !== true && [...byId.values()].some((other) => other.kind === 'resource' && other.id !== definition.id
      && other.retired !== true && other.seedItem === definition.seedItem)) invalid('seedItem must identify one live resource', 'seedItem');
  }
  const loot = byId.get(definition.loot);
  if (loot?.kind !== 'loot') errors.push(issue(
    'error', 'unresolved_reference', `loot reference does not resolve: ${definition.loot}`, definition.id, 'loot',
  ));
  else if (definition.retired !== true && loot.retired === true) errors.push(issue(
    'error', 'retired_reference', `live resource references retired loot ${definition.loot}`, definition.id, 'loot',
  ));
  if (definition.retired === true && definition.replacement === undefined) errors.push(issue(
    'error', 'missing_retirement_replacement', 'retired resources require a replacement', definition.id, 'replacement',
  ));
  if (definition.replacement !== undefined) {
    const replacement = byId.get(definition.replacement);
    if (replacement?.kind !== 'resource') errors.push(issue(
      'error', 'unresolved_reference', `resource replacement does not resolve: ${definition.replacement}`,
      definition.id, 'replacement',
    ));
  }
  const owner = runtimeKinds.get(definition.runtimeKind);
  if (owner !== undefined && owner !== definition.id) invalid(
    `runtime resource kind ${definition.runtimeKind} is already owned by ${owner}`, 'runtimeKind',
  );
  if (definition.interaction.mode === 'mine' && definition.mining === undefined) {
    invalid('mine resources require mining state', 'mining');
  }
  if (definition.interaction.mode === 'fish' && definition.discovery.kind !== 'fishing') {
    invalid('fish resources require fishing discovery', 'discovery.kind');
  }
  if (definition.discovery.kind === 'ore' && definition.interaction.mode !== 'mine') {
    invalid('ore discovery requires mine interaction', 'discovery.kind');
  }
  const baselineItemId = definition.interaction.tool?.baselineItem;
  if (baselineItemId !== undefined) {
    const baselineItem = byId.get(baselineItemId);
    if (baselineItem?.kind !== 'item') errors.push(issue(
      'error', 'unresolved_reference', `baseline tool does not resolve: ${baselineItemId}`,
      definition.id, 'interaction.tool.baselineItem',
    ));
    else if (definition.retired !== true && baselineItem.retired === true) errors.push(issue(
      'error', 'retired_reference', `baseline tool is retired: ${baselineItemId}`,
      definition.id, 'interaction.tool.baselineItem',
    ));
  }
  if (definition.regrowth !== undefined && definition.health.followsGrowthStage !== true) {
    invalid('regrowth requires growth-stage health', 'regrowth');
  }
  if (definition.maturityGrowthStage !== undefined && definition.health.followsGrowthStage !== true) {
    invalid('maturity requires growth-stage health', 'maturityGrowthStage');
  }
  if (definition.fixedSites !== undefined && definition.respawn?.profile !== 'fixed_site') {
    invalid('fixed sites require the fixed_site respawn profile', 'fixedSites');
  }
  if (definition.respawn?.profile === 'fixed_site' && (definition.fixedSites?.length ?? 0) === 0) {
    invalid('fixed_site resources require fixed sites', 'fixedSites');
  }
  if (definition.fixedSites !== undefined && definition.lootDelivery !== 'actor_reserved') {
    invalid('fixed-site resources require actor-reserved loot delivery', 'lootDelivery');
  }
  if (definition.fixedSites !== undefined && definition.interaction.mode !== 'mine'
    && definition.maturityGrowthStage === undefined) {
    invalid('non-mining fixed-site resources require an authored maturity stage', 'maturityGrowthStage');
  }
  if (definition.fixedSites !== undefined && definition.interaction.tool?.baselineItem === undefined) {
    invalid('fixed-site resources require an authored baseline tool', 'interaction.tool.baselineItem');
  }
  if (definition.retired !== true) definition.fixedSites?.forEach((site, index) => {
    const [runtimeId, , , , encounterId] = site;
    const owner = fixedSiteIds.get(runtimeId);
    if (owner !== undefined) invalid(`fixed site ${runtimeId} is already owned by ${owner}`, `fixedSites[${index}][0]`);
    else fixedSiteIds.set(runtimeId, definition.id);
    const encounter = byId.get(encounterId);
    if (encounter?.kind !== 'encounter') errors.push(issue(
      'error', 'unresolved_reference', `fixed-site encounter does not resolve: ${encounterId}`,
      definition.id, `fixedSites[${index}][4]`,
    ));
    else if (encounter.retired === true) errors.push(issue(
      'error', 'retired_reference', `fixed-site encounter is retired: ${encounterId}`,
      definition.id, `fixedSites[${index}][4]`,
    ));
  });
  return errors;
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
    if (definition.behavior?.trailingPackMember !== undefined) {
      unresolved(definition.behavior.trailingPackMember, 'creature', 'behavior.trailingPackMember');
      if (definition.behavior.trailingPackMember === definition.id) {
        invalid('trailing pack member must reference a different creature', 'behavior.trailingPackMember');
      }
    }
    if (definition.combat.huntable) {
      if (definition.loot === undefined) invalid('huntable creatures require authored loot', 'loot');
      if (definition.combat.experience <= 0) invalid('huntable creatures require positive combat experience', 'combat.experience');
    } else {
      if (definition.loot !== undefined) invalid('non-huntable creatures cannot author loot', 'loot');
      if (definition.combat.experience !== 0) invalid('non-huntable creatures must award zero combat experience', 'combat.experience');
    }
    if (definition.panic.speedMultiplierPermille > 10_000) invalid(
      'panic speed multiplier must not exceed 10000 permille', 'panic.speedMultiplierPermille',
    );
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
    definition.ferry?.forEach(([, , thresholdX, thresholdY, arrivalX, arrivalY, , flags], index) => {
      if ([thresholdX, thresholdY, arrivalX, arrivalY]
        .some(coordinate => coordinate < 0 || coordinate >= definition.sizeTiles)) {
        invalid('ferry threshold and arrival must be inside the authored space', `ferry[${index}]`);
      }
      if ((flags & 1) !== 0 && (flags & 4) !== 0) {
        invalid('home ferry destination cannot require outdoor encounter preparation', `ferry[${index}][7]`);
      }
    });
    if (definition.supplyCache !== undefined) {
      const [, objectId, , , assetId, tileX, tileY, frontageX, frontageY] = definition.supplyCache;
      unresolved(objectId, 'object', 'supplyCache[1]');
      if (!Number.isSafeInteger(assetId) || assetId < 0 || assetId > 0xffff_ffff) {
        invalid('supply-cache asset id must fit unsigned 32-bit storage', 'supplyCache[4]');
      }
      if ([tileX, tileY, frontageX, frontageY].some(coordinate => coordinate < 0 || coordinate >= definition.sizeTiles)) {
        invalid('supply-cache placement and frontage must be inside the authored space', 'supplyCache');
      }
    }
    const lobby = definition.hearthLobby;
    if (definition.generator === 'delve_lobby' && lobby === undefined) {
      invalid('delve lobby spaces require authored lobby metadata', 'hearthLobby');
    } else if (definition.generator !== 'delve_lobby' && lobby !== undefined) {
      invalid('hearth lobby metadata requires the delve_lobby generator', 'hearthLobby');
    }
    if (lobby !== undefined) {
      const inside = ([tileX, tileY]: readonly [number, number]) => tileX >= 0 && tileY >= 0
        && tileX < definition.sizeTiles && tileY < definition.sizeTiles;
      for (const [name, point] of Object.entries(lobby.points)) {
        if (!inside(point)) invalid('lobby point must be inside the authored space', `hearthLobby.points.${name}`);
      }
      if (lobby.floorThresholdY >= definition.sizeTiles) {
        invalid('lobby floor threshold must be inside the authored space', 'hearthLobby.floorThresholdY');
      }
      lobby.carves.forEach(([left, top, right, bottom], index) => {
        if (left > right || top > bottom || !inside([left, top]) || !inside([right, bottom])) {
          invalid('lobby carve must be ordered and inside the authored space', `hearthLobby.carves[${index}]`);
        }
      });
      const ids = new Set<string>();
      const validatePlaced = (entry: readonly [string, `object:${string}`, string, number, number], path: string) => {
        const [runtimeId, objectId, , tileX, tileY] = entry;
        if (ids.has(runtimeId)) invalid(`duplicate lobby runtime id ${runtimeId}`, `${path}[0]`);
        ids.add(runtimeId);
        unresolved(objectId, 'object', `${path}[1]`);
        if (!inside([tileX, tileY])) invalid('lobby placement must be inside the authored space', path);
      };
      validatePlaced(lobby.practiceTarget, 'hearthLobby.practiceTarget');
      lobby.torches.forEach((entry, index) => validatePlaced(entry, `hearthLobby.torches[${index}]`));
      const fixtureIds = new Set<string>();
      lobby.fixtures.forEach((entry, index) => {
        const [id, objectId, , tileX, tileY, , , rendererRole] = entry;
        const path = `hearthLobby.fixtures[${index}]`;
        if (fixtureIds.has(id)) invalid(`duplicate lobby fixture id ${id}`, `${path}[0]`);
        fixtureIds.add(id);
        unresolved(objectId, 'object', `${path}[1]`);
        if (!inside([tileX, tileY])) invalid('lobby fixture must be inside the authored space', path);
        const objectDefinition = byId.get(objectId);
        if (rendererRole !== undefined && (objectDefinition?.kind !== 'object'
          || !objectDefinition.components.identity?.tags.includes(rendererRole))) {
          invalid(`lobby fixture object does not author renderer role ${rendererRole}`, `${path}[7]`);
        }
      });
    }
    const interior = definition.hearthInterior;
    if (definition.generator === 'village_interior' && interior === undefined) {
      invalid('village interior spaces require authored interior metadata', 'hearthInterior');
    } else if (definition.generator !== 'village_interior' && interior !== undefined) {
      invalid('hearth interior metadata requires the village_interior generator', 'hearthInterior');
    }
    if (definition.retired !== true && (interior !== undefined || definition.hearthInteriorCatalog !== undefined)) {
      const catalogs = [...byId.values()].filter(candidate => candidate.kind === 'space'
        && candidate.retired !== true && candidate.hearthInteriorCatalog !== undefined);
      if (catalogs.length !== 1) invalid('active Hearth interiors require exactly one active catalog', 'hearthInteriorCatalog');
      const catalog = catalogs[0]?.kind === 'space' ? catalogs[0].hearthInteriorCatalog : undefined;
      if (catalog !== undefined && interior !== undefined) {
        const number36 = (value: string) => Number.parseInt(value, 36);
        const fingerprint = (asset: string) => {
          let hash = 2166136261;
          for (const character of asset) { hash ^= character.charCodeAt(0); hash = Math.imul(hash, 16777619); }
          return ((hash >>> 4) % 1296).toString(36).padStart(2, '0');
        };
        const inside = (x: number, y: number) => x >= 0 && y >= 0
          && x < definition.sizeTiles && y < definition.sizeTiles;
        interior[1].split(';').forEach((encoded, index) => {
          const [left, top, right, bottom] = [...encoded].map(number36) as [number, number, number, number];
          if (left > right || top > bottom || !inside(left, top) || !inside(right, bottom)) {
            invalid('interior room must be ordered and inside the authored space', `hearthInterior[1].${index}`);
          }
        });
        const ids = new Set<string>();
        interior[2].split(';').forEach((encoded, index) => {
          const art = encoded.slice(0, 2), x = number36(encoded[2]!), y = number36(encoded[3]!);
          const suffix = encoded.slice(4), support = suffix.startsWith('-');
          const fixed = suffix.length >= 2 && !support;
          const matches = [...byId.values()].filter(candidate => candidate.kind === 'object'
            && candidate.retired !== true && candidate.components.sprite !== undefined
            && fingerprint(candidate.components.sprite.asset) === art);
          if (matches.length !== 1) invalid('interior furniture art must resolve to exactly one active object', `hearthInterior[2].${index}`);
          if (!inside(x, y)) invalid('interior furniture must be inside the authored space', `hearthInterior[2].${index}`);
          if (support && number36(suffix.slice(1)) > index) {
            invalid('interior support must reference earlier furniture', `hearthInterior[2].${index}`);
          }
          if (fixed && (number36(suffix[0]!) <= 0 || number36(suffix[1]!) <= 0)) {
            invalid('interior fixed obstacle bounds must be positive', `hearthInterior[2].${index}`);
          }
          const presentation = suffix.includes('!') ? suffix.slice(suffix.indexOf('!') + 1) : (matches[0]?.kind === 'object'
            ? matches[0].components.sprite?.asset.slice('prop_cf_'.length) : undefined);
          const id = `${presentation}:${x}:${y}`;
          if (ids.has(id)) invalid(`duplicate interior furniture id ${id}`, `hearthInterior[2].${index}`);
          ids.add(id);
        });
        const points = [...catalog, ...(interior[3] === undefined ? [] : [...interior[3]].map(number36))] as number[];
        for (let index = 0; index < points.length; index += 2) {
          if (!inside(points[index]!, points[index + 1]!)) invalid('interior point must be inside the authored space', 'hearthInterior');
        }
      }
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
      const [left, top, right, bottom] = surface.footprint;
      if (surface.tileX + left < 0 || surface.tileX + right >= definition.sizeTiles
        || surface.tileY + top < 0 || surface.tileY + bottom >= definition.sizeTiles) {
        invalid('surface footprint must be inside the authored space', `${path}.footprint`);
      }
    });
    const decorationCollisionKeys = new Set<string>();
    definition.decorationCollision?.forEach(([mediumMask, , , , , ...kinds], index) => {
      for (const kind of kinds) for (const [bit, medium] of [[1, 'ground'], [2, 'water']] as const) {
        if ((mediumMask & bit) === 0) continue;
        const key = `${medium}:${kind}`;
        if (decorationCollisionKeys.has(key)) {
          invalid(`duplicate ${medium} collision profile for ${kind}`, `decorationCollision[${index}]`);
        }
        decorationCollisionKeys.add(key);
      }
    });
    if (definition.decorationGenerator !== undefined) {
      const [natureVariants, poiKinds, groveWeights, mushroomKind, pondWeights, ambient, desertWeights]
        = definition.decorationGenerator;
      const natureKinds = new Set(natureVariants.map(([kind]) => kind));
      if (natureVariants.length > 16) invalid('nature decoration palette exceeds stable id stride', 'decorationGenerator[0]');
      if (natureKinds.size !== natureVariants.length) invalid('nature decoration palette kinds must be unique', 'decorationGenerator[0]');
      if (new Set(poiKinds).size !== poiKinds.length) invalid('POI decoration palette kinds must be unique', 'decorationGenerator[1]');
      const validateWeights = (
        entries: readonly (readonly [string, number])[],
        path: string,
        maximum: number,
        exact = false,
      ): void => {
        const kinds = new Set<string>();
        let total = 0;
        for (const [kind, weight] of entries) {
          if (!natureKinds.has(kind)) invalid(`unknown nature decoration ${kind}`, path);
          if (kinds.has(kind)) invalid(`duplicate weighted decoration ${kind}`, path);
          kinds.add(kind);
          total += weight;
        }
        if (exact ? total !== maximum : total > maximum) invalid('decoration weights exceed generator roll range', path);
      };
      validateWeights(groveWeights, 'decorationGenerator[2]', 100, true);
      if (!natureKinds.has(mushroomKind)) invalid('unknown mushroom decoration kind', 'decorationGenerator[3]');
      validateWeights(pondWeights, 'decorationGenerator[4]', 10_000);
      if (!natureKinds.has(ambient[0]) || !natureKinds.has(ambient[1]) || ambient[0] === ambient[1]
        || ambient[2] > 10_000) invalid('invalid ambient decoration palette', 'decorationGenerator[5]');
      validateWeights(desertWeights, 'decorationGenerator[6]', 10_000);
    }
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
  if (components.carry?.mode === 'preserve_entity_or_item_when_empty'
    && components.container === undefined) {
    componentIssue(
      'item-when-empty carry requires a container component',
      'components.carry',
    );
  }
  if (components.damageable?.salvageRecipe !== undefined) {
    const salvage = byId.get(components.damageable.salvageRecipe);
    if (salvage?.kind !== 'recipe') {
      errors.push(issue(
        'error', 'unresolved_reference',
        `damageable salvage recipe does not resolve: ${components.damageable.salvageRecipe}`,
        definition.id, 'components.damageable.salvageRecipe',
      ));
    } else if (definition.retired !== true && salvage.retired === true) {
      errors.push(issue(
        'error', 'retired_reference',
        `live damageable references retired recipe ${components.damageable.salvageRecipe}`,
        definition.id, 'components.damageable.salvageRecipe',
      ));
    }
  }
  if (components.damageable?.onBreakLoot !== undefined) {
    const loot = byId.get(components.damageable.onBreakLoot);
    if (loot?.kind !== 'loot') {
      errors.push(issue(
        'error', 'unresolved_reference',
        `damageable break loot does not resolve: ${components.damageable.onBreakLoot}`,
        definition.id, 'components.damageable.onBreakLoot',
      ));
    } else if (definition.retired !== true && loot.retired === true) {
      errors.push(issue(
        'error', 'retired_reference',
        `live damageable references retired loot ${components.damageable.onBreakLoot}`,
        definition.id, 'components.damageable.onBreakLoot',
      ));
    }
  }
  if (components.processor !== undefined) {
    const matchingProcesses = [...byId.values()].filter((candidate): candidate is ProcessContentDefinition => (
      candidate.kind === 'process' && candidate.retired !== true
      && candidate.stationTag === components.processor?.processTag
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
    const rewards = components.processor.completionRewards;
    if (rewards !== undefined) {
      const experience = rewards.experience;
      if (experience !== undefined) {
        const tracks = [...byId.values()].filter((candidate) => candidate.kind === 'skill_tree'
          && candidate.retired !== true && candidate.track === experience.skill);
        if (tracks.length !== 1) errors.push(issue(
          'error', tracks.length === 0 ? 'unresolved_reference' : 'ambiguous_interaction',
          `processor reward skill must resolve to one active track: ${experience.skill}`,
          definition.id, 'components.processor.completionRewards.experience.skill',
        ));
      }
      const projectionKeys = new Set<string>();
      rewards.statistics.forEach((projection, index) => {
        const path = `components.processor.completionRewards.statistics[${index}]`;
        const key = JSON.stringify(projection);
        if (projectionKeys.has(key)) componentIssue('duplicate processor statistic projection', path);
        projectionKeys.add(key);
        const statistic = byId.get(projection.statistic);
        if (statistic?.kind !== 'statistic') {
          errors.push(issue(
            'error', 'unresolved_reference',
            `processor statistic does not resolve: ${projection.statistic}`,
            definition.id, `${path}.statistic`,
          ));
          return;
        }
        if (definition.retired !== true && statistic.retired === true) errors.push(issue(
          'error', 'retired_reference',
          `live processor references retired statistic ${projection.statistic}`,
          definition.id, `${path}.statistic`,
        ));
        if (statistic.reserved === true || statistic.aggregation !== 'counter') componentIssue(
          'processor rewards require a writable counter statistic', `${path}.statistic`,
        );
        const outputReferenced = projection.quantity === 'output' || projection.subject === 'output';
        if (projection.outputTag !== undefined && !outputReferenced) componentIssue(
          'outputTag requires an output quantity or subject', `${path}.outputTag`,
        );
        for (const process of matchingProcesses) {
          const outputs = process.outputs.filter(({ item }) => {
            const output = items.get(item);
            return output !== undefined && output.retired !== true
              && (projection.outputTag === undefined || output.tags.includes(projection.outputTag));
          });
          if (outputReferenced && outputs.length === 0) componentIssue(
            `projection has no output for ${process.id}`, path,
          );
          if (projection.quantity !== 'output' && projection.subject === 'output'
            && outputs.length !== 1) componentIssue(
            `projection output subject is ambiguous for ${process.id}`, `${path}.subject`,
          );
          const subjects = projection.subject === 'input'
            ? [process.input.item.slice('item:'.length)]
            : projection.subject === 'output'
              ? outputs.map(({ item }) => item.slice('item:'.length)) : [''];
          if (subjects.some((subject) => !statisticSubjectIsCoherent(statistic.subject, subject))) {
            componentIssue(`projection subject does not match ${statistic.subject}`, `${path}.subject`);
          }
        }
      });
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
    if (interaction.effects.length === 0 && interaction.feedback === undefined) {
      componentIssue('read-only interaction needs authored feedback', `${path}.effects`);
    }
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
      errors.push(...validateAuthoredEffectReferences(definition, effect, effectPath, byId));
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
    if (definition.wildlifeProfile !== undefined) {
      const profile = definition.wildlifeProfile;
      if (definition.spawnPolicy === 'dynamic') errors.push(issue(
        'error', 'invalid_world_definition', 'authored wildlife profiles require a fixed NPC',
        definition.id, 'wildlifeProfile',
      ));
      const creature = [...byId.values()].find((entry) => entry.kind === 'creature'
        && entry.species === profile.species);
      if (creature?.kind !== 'creature') errors.push(issue(
        'error', 'unresolved_reference',
        `wildlife species does not resolve: ${profile.species}`,
        definition.id, 'wildlifeProfile.species',
      ));
      else if (profile.variant >= creature.variants) errors.push(issue(
        'error', 'invalid_world_definition',
        `wildlife variant ${profile.variant} exceeds ${creature.variants - 1}`,
        definition.id, 'wildlifeProfile.variant',
      ));
    }
    if (definition.shop !== undefined) unresolved(definition.shop, 'shop', 'shop');
    definition.questGiver.forEach((reference, index) => unresolved(reference, 'quest', `questGiver[${index}]`));
    definition.commerce?.recipeExchange?.recipes.forEach((reference, index) => {
      unresolved(reference, 'recipe', `commerce.recipeExchange.recipes[${index}]`);
      const recipe = byId.get(reference);
      if (definition.retired !== true && recipe?.retired === true) errors.push(issue(
        'error', 'retired_reference', `live NPC references retired recipe ${reference}`,
        definition.id, `commerce.recipeExchange.recipes[${index}]`,
      ));
    });
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
  options:ContentValidationOptions={},
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
    if('legacyCompatibility'in definition&&definition.legacyCompatibility===true&&!options.allowLegacyStageA){
      errors.push(issue('error','invalid_world_definition',
        'legacy authority defaults require the exact Stage-A production payload',definition.id,'legacyCompatibility'));
    }
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
  const gearSkillNodes = new Map(definitions.flatMap(definition => definition.kind === 'skill_tree' && definition.retired !== true
    ? definition.nodes.map(node => [node.id, node] as const) : []));
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

  const activeCreatureSpeciesOwners = new Map<string, string>();
  let hiveReturnOwner: string | undefined;
  for (const definition of definitions) {
    if (definition.kind !== 'creature' || definition.retired === true) continue;
    const owner = activeCreatureSpeciesOwners.get(definition.species);
    if (owner !== undefined) errors.push(issue(
      'error', 'invalid_world_definition',
      `active creature species ${definition.species} is already owned by ${owner}`,
      definition.id, 'species',
    ));
    else activeCreatureSpeciesOwners.set(definition.species, definition.id);
    if (definition.behavior?.hiveReturn === true) {
      if (hiveReturnOwner !== undefined) errors.push(issue(
        'error', 'invalid_world_definition',
        `hive return behavior is already owned by ${hiveReturnOwner}`,
        definition.id, 'behavior.hiveReturn',
      ));
      else hiveReturnOwner = definition.id;
    }
  }

  const activeUpgradeMechanicOwners = new Map<string, string>();
  const activeUpgradeDurableKeyOwners = new Map<string, string>();
  for (const definition of definitions) {
    if (definition.kind !== 'upgrade' || definition.retired === true || !('mechanic' in definition)) continue;
    const [mechanic,durableKey]=definition.mechanic;
    const owner = activeUpgradeMechanicOwners.get(mechanic);
    if (owner !== undefined) errors.push(issue(
      'error', 'ambiguous_interaction',
      `upgrade mechanic ${mechanic} is already owned by ${owner}`,
      definition.id, 'mechanic[0]',
    ));
    else activeUpgradeMechanicOwners.set(mechanic, definition.id);
    const durableOwner=activeUpgradeDurableKeyOwners.get(durableKey);
    if(durableOwner!==undefined)errors.push(issue('error','ambiguous_interaction',
      `durable upgrade key ${durableKey} is already owned by ${durableOwner}`,definition.id,'mechanic[1]'));
    else activeUpgradeDurableKeyOwners.set(durableKey,definition.id);
  }

  let activeFerryNetworkOwner: string | undefined;
  let activeSupplyCacheOwner: string | undefined;
  for (const definition of definitions) {
    if (definition.kind !== 'space' || definition.retired === true) continue;
    if (definition.ferry !== undefined) {
      if (activeFerryNetworkOwner !== undefined) errors.push(issue(
        'error', 'ambiguous_interaction',
        `active ferry network is already owned by ${activeFerryNetworkOwner}`,
        definition.id, 'ferry',
      ));
      else activeFerryNetworkOwner = definition.id;
    }
    if (definition.supplyCache !== undefined) {
      if (activeSupplyCacheOwner !== undefined) errors.push(issue(
        'error', 'ambiguous_interaction',
        `active supply cache is already owned by ${activeSupplyCacheOwner}`,
        definition.id, 'supplyCache',
      ));
      else activeSupplyCacheOwner = definition.id;
    }
  }

  const supportCapOwners = new Map<SupportCapCapability, string>();
  let characterCombatProfileOwner: string | undefined;
  let worldPolicyProfileOwner: string | undefined;
  const residenceConstructionProfileOwners = new Map<number, string>();
  for (const definition of definitions) {
    if (definition.kind !== 'balance' || definition.retired === true) continue;
    if ('profile' in definition && definition.profile === 'character_combat') {
      if (characterCombatProfileOwner !== undefined) errors.push(issue(
        'error', 'ambiguous_interaction',
        `character combat profile is already owned by ${characterCombatProfileOwner}`,
        definition.id, 'profile',
      ));
      else characterCombatProfileOwner = definition.id;
    }
    if ('profile' in definition && definition.profile === 'world_policy') {
      if (worldPolicyProfileOwner !== undefined) errors.push(issue(
        'error', 'ambiguous_interaction',
        `world policy profile is already owned by ${worldPolicyProfileOwner}`,
        definition.id, 'profile',
      ));
      else worldPolicyProfileOwner = definition.id;
    }
    if ('profile' in definition && definition.profile === 'residence_construction') {
      const recipeVersion = definition.values[0];
      const residenceConstructionProfileOwner = residenceConstructionProfileOwners.get(recipeVersion);
      if (residenceConstructionProfileOwner !== undefined) errors.push(issue(
        'error', 'ambiguous_interaction',
        `residence construction recipe version ${recipeVersion} is already owned by ${residenceConstructionProfileOwner}`,
        definition.id, 'profile',
      ));
      else residenceConstructionProfileOwners.set(recipeVersion, definition.id);
    }
    if (!('supportCap' in definition) || definition.supportCap === undefined) continue;
    const owner = supportCapOwners.get(definition.supportCap);
    if (owner !== undefined) errors.push(issue(
      'error', 'ambiguous_interaction',
      `support cap ${definition.supportCap} is already owned by ${owner}`,
      definition.id, 'supportCap',
    ));
    else supportCapOwners.set(definition.supportCap, definition.id);
  }

  const delveBoonIds=new Map<string,string>(),delveBoonModifiers=new Map<string,string>();
  for(const definition of definitions){
    if(definition.kind!=='upgrade'||definition.retired===true||!('delveBoon' in definition))continue;
    const [durableId,modifier]=definition.delveBoon;
    const idOwner=delveBoonIds.get(durableId),modifierOwner=delveBoonModifiers.get(modifier);
    if(idOwner!==undefined)errors.push(issue('error','ambiguous_interaction',
      `Delve boon id ${durableId} is already owned by ${idOwner}`,definition.id,'delveBoon[0]'));
    else delveBoonIds.set(durableId,definition.id);
    if(modifierOwner!==undefined)errors.push(issue('error','ambiguous_interaction',
      `Delve boon modifier ${modifier} is already owned by ${modifierOwner}`,definition.id,'delveBoon[1]'));
    else delveBoonModifiers.set(modifier,definition.id);
  }
  if(delveBoonIds.size>0&&delveBoonModifiers.size!==8)errors.push(issue(
    'error','invalid_world_definition','active Delve boon catalog requires all eight modifier roles',
    undefined,'delveBoon',
  ));


  const legacyJobOwners = new Map<string, string>();
  const activeProcessInputs = new Map<string, string>();
  for (const definition of definitions) {
    if (definition.kind !== 'process') continue;
    if (definition.legacyJob !== undefined) {
      const recipeId = definition.legacyJob.recipeId;
      const owner = legacyJobOwners.get(recipeId);
      if (owner !== undefined) errors.push(issue('error', 'ambiguous_interaction',
        `legacy job recipe ${recipeId} is already owned by ${owner}`, definition.id, 'legacyJob.recipeId'));
      else legacyJobOwners.set(recipeId, definition.id);
    }
    if (definition.retired === true) continue;
    const inputKey = `${definition.stationTag}\u0000${definition.input.item}`;
    const inputOwner = activeProcessInputs.get(inputKey);
    if (inputOwner !== undefined) errors.push(issue(
      'error', 'ambiguous_interaction',
      `process input ${definition.input.item} at ${definition.stationTag} is already owned by ${inputOwner}`,
      definition.id, 'input.item',
    ));
    else activeProcessInputs.set(inputKey, definition.id);
    if (definition.experience !== undefined) {
      const matchingTracks = definitions.filter((candidate) => candidate.kind === 'skill_tree'
        && candidate.retired !== true && candidate.track === definition.experience?.skill);
      if (matchingTracks.length !== 1) errors.push(issue(
        'error', matchingTracks.length === 0 ? 'unresolved_reference' : 'ambiguous_interaction',
        `process experience skill must resolve to one active track: ${definition.experience.skill}`,
        definition.id, 'experience.skill',
      ));
    }
  }

  const npcRuntimeIds = new Map<string, string>();
  const npcRuntimeKinds = new Map<string, string>();
  let starterHorseOwner: string | undefined;
  const villageOrderOwners = new Map<string, string>();
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
      if (definition.retired !== true && definition.spawnPolicy !== 'dynamic'
        && definition.mount?.adapter === 'horse' && definition.wildlifeProfile !== undefined) {
        if (starterHorseOwner !== undefined) errors.push(issue(
          'error', 'ambiguous_interaction',
          `fixed authored horse is already owned by ${starterHorseOwner}`,
          definition.id, 'mount',
        ));
        else starterHorseOwner = definition.id;
      }
      for (const order of definition.commerce?.villageOrders ?? []) {
        const orderOwner = villageOrderOwners.get(order.id);
        if (orderOwner !== undefined) errors.push(issue(
          'error', 'ambiguous_interaction', `village order ${order.id} is already owned by ${orderOwner}`,
          definition.id, 'commerce.villageOrders',
        ));
        else villageOrderOwners.set(order.id, definition.id);
      }
      const exchangeRecipes = definition.commerce?.recipeExchange?.recipes ?? [];
      if (new Set(exchangeRecipes).size !== exchangeRecipes.length) errors.push(issue(
        'error', 'ambiguous_interaction', 'recipe exchange contains duplicate recipes',
        definition.id, 'commerce.recipeExchange.recipes',
      ));
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

  const resourceRuntimeKinds = new Map<string, string>();
  const resourceFixedSiteIds = new Map<string, string>();
  const activeLoadoutRoleOwners = new Map<string, string>();
  const activeEnemyRuntimeKinds = new Map<string, string>();
  const activeEnemyNpcPatterns = new Map<string, { readonly owner: string; readonly pattern: string }>();
  let activeDelvePoolOwner: string | undefined;
  const activeEncounterRuntimeIds = new Map<string, string>();
  const activeEncounterRuntimeIndexes = new Map<string, string>();
  for (const definition of definitions) {
    if (definition.kind === 'resource') {
      errors.push(...validateResourceDefinition(definition, byId, resourceRuntimeKinds, resourceFixedSiteIds));
      if (!resourceRuntimeKinds.has(definition.runtimeKind)) {
        resourceRuntimeKinds.set(definition.runtimeKind, definition.id);
      }
    }
    if (definition.kind === 'loadout') {
      errors.push(...validateLoadoutDefinition(definition, byId, activeLoadoutRoleOwners));
    }
    if (definition.kind === 'enemy' || definition.kind === 'encounter') {
      errors.push(...validateOutdoorDefinition(definition, byId));
      if (definition.retired !== true) {
        const owners = definition.kind === 'enemy' ? activeEnemyRuntimeKinds : activeEncounterRuntimeIds;
        const runtimeIdentity = definition.kind === 'enemy' ? definition.runtimeKind : definition.runtimeId;
        const owner = owners.get(runtimeIdentity);
        if (owner !== undefined) errors.push(issue(
          'error', 'invalid_world_definition',
          `active ${definition.kind} runtime identity ${runtimeIdentity} is already owned by ${owner}`,
          definition.id, definition.kind === 'enemy' ? 'runtimeKind' : 'runtimeId',
        ));
        else owners.set(runtimeIdentity, definition.id);
        if (definition.kind === 'enemy') {
          if (definition.delvePools !== undefined) {
            if (activeDelvePoolOwner !== undefined) errors.push(issue(
              'error', 'ambiguous_interaction',
              `active Delve enemy pools are already owned by ${activeDelvePoolOwner}`,
              definition.id, 'delvePools',
            ));
            else activeDelvePoolOwner = definition.id;
          }
          for (const npcKind of [definition.npcKind, ...(definition.aliases ?? [])]) {
            const existing = activeEnemyNpcPatterns.get(npcKind);
            if (existing !== undefined && existing.pattern !== definition.pattern) errors.push(issue(
              'error', 'ambiguous_interaction',
              `enemy NPC kind ${npcKind} has conflicting attack patterns from ${existing.owner}`,
              definition.id, npcKind === definition.npcKind ? 'npcKind' : 'aliases',
            ));
            else if (existing === undefined) activeEnemyNpcPatterns.set(npcKind, {
              owner: definition.id, pattern: definition.pattern,
            });
          }
        }
        if (definition.kind === 'encounter') {
          const index = String(definition.runtimeIndex), indexOwner = activeEncounterRuntimeIndexes.get(index);
          if (indexOwner !== undefined) errors.push(issue(
            'error', 'invalid_world_definition',
            `active encounter runtime index ${index} is already owned by ${indexOwner}`,
            definition.id, 'runtimeIndex',
          ));
          else activeEncounterRuntimeIndexes.set(index, definition.id);
        }
      }
    }
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
      if (definition.equip !== undefined) for (const modifier of definition.modifiers ?? []) {
        if (!equipmentModifierAllowed(modifier)) errors.push(issue(
          'error', 'invalid_component_set', `unsupported equipment modifier or budget: ${modifier.id}`,
          definition.id, 'modifiers',
        ));
      }
      const gearSkill = definition.equip?.skillNode;
      if (gearSkill !== undefined) {
        const node = gearSkillNodes.get(gearSkill);
        if (node?.gearBoostable !== true || node.implemented !== true || node.root === true || node.passive !== undefined) {
          errors.push(issue('error', 'unresolved_reference', `equipment requires an eligible numeric skill node: ${gearSkill}`,
            definition.id, 'equip.skillNode'));
        }
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
          const effectPath = `${path}.effects[${effectIndex}]`;
          errors.push(...validateAuthoredEffectReferences(definition, effect, effectPath, byId));
          if ('learnRecipes' in effect) {
            effect.learnRecipes.forEach((reference, referenceIndex) => {
              const expected = reference.startsWith('recipe:') ? 'recipe' : 'process';
              const target = byId.get(reference);
              const referencePath = `${effectPath}.learnRecipes[${referenceIndex}]`;
              if (target?.kind !== expected) errors.push(issue(
                'error', 'unresolved_reference', `${expected} reference does not resolve: ${reference}`,
                definition.id, referencePath,
              ));
              else if (definition.retired !== true && target.retired === true) errors.push(issue(
                'error', 'retired_reference', `live definition references retired ${expected} ${reference}`,
                definition.id, referencePath,
              ));
            });
          }
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
