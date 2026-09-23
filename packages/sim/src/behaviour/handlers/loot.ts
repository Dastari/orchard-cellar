import {
  fishingCatchQuality,
  fishingCatchQualityWithProfile,
  statelessRoll,
  type FishingCatchQuality,
} from '../../checks.js';
import type { CharacterCombatBalanceProfile } from '../../character-combat-balance.js';
import { bootstrapDefinitionsOfKind } from '../../content/bootstrap-pack-loader.js';
import type { ResourceContentDefinition } from '../../content/resource-definition.js';
import type { CreatureContentDefinition } from '../../content/world-definition.js';
import type {
  LootCondition,
  LootContentDefinition,
  LootDrop,
  LootEntryDefinition,
  LootRollContext,
  LootRollRequest,
  LootRollResult,
  LootScalar,
} from '../../content/loot-definition.js';
import type { Modifier } from '../../modifiers.js';
import type { MiningYieldResult, MiningYieldState } from '../../mining.js';
import { effectsResult } from '../handler.js';
import {
  createHandlerRegistry,
  type AnyHandlerRegistration,
  type BehaviourHandlerRegistry,
} from '../registry.js';

function compareScalar(
  actual: LootScalar | undefined,
  operator: 'eq' | 'gte' | 'lte',
  expected: LootScalar,
): boolean {
  if (operator === 'eq') return actual === expected;
  return typeof actual === 'number' && typeof expected === 'number'
    && (operator === 'gte' ? actual >= expected : actual <= expected);
}

function conditionMatches(
  condition: LootCondition,
  context: LootRollContext,
  seedParts: LootRollRequest['seedParts'],
): boolean {
  if ('context' in condition) {
    return compareScalar(
      context.values?.[condition.context.key],
      condition.context.operator,
      condition.context.value,
    );
  }
  if ('toolTierAtLeast' in condition) {
    return (context.toolTier ?? 0) >= condition.toolTierAtLeast;
  }
  if ('skillRank' in condition) {
    return (context.skillRanks?.[condition.skillRank.skill] ?? 0) >= condition.skillRank.minimum;
  }
  const rank = condition.rareRoll.rankKey === undefined
    ? 0
    : context.skillRanks?.[condition.rareRoll.rankKey] ?? 0;
  const threshold = Math.max(0, Math.min(
    condition.rareRoll.outOf,
    condition.rareRoll.threshold + rank * (condition.rareRoll.perRank ?? 0),
  ));
  const roll = statelessRoll([...seedParts, condition.rareRoll.seedTag], condition.rareRoll.outOf);
  return condition.rareRoll.comparison === 'lt' ? roll < threshold : roll >= threshold;
}

function conditionsMatch(
  conditions: readonly LootCondition[] | undefined,
  context: LootRollContext,
  seedParts: LootRollRequest['seedParts'],
): boolean {
  return conditions?.every((condition) => conditionMatches(condition, context, seedParts)) ?? true;
}

function selectedEntry(
  entries: readonly LootEntryDefinition[],
  context: LootRollContext,
  seedParts: LootRollRequest['seedParts'],
  rollTag: string,
): LootEntryDefinition | null {
  const matching = entries.filter((entry) => conditionsMatch(entry.conditions, context, seedParts));
  if (matching.length === 0) return null;
  const priority = Math.max(...matching.map((entry) => entry.priority ?? 0));
  const candidates = matching.filter((entry) => (entry.priority ?? 0) === priority);
  if (candidates.length === 1) return candidates[0]!;
  const totalWeight = candidates.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = statelessRoll([...seedParts, rollTag], totalWeight);
  for (const candidate of candidates) {
    if (roll < candidate.weight) return candidate;
    roll -= candidate.weight;
  }
  throw new Error('loot_weight_resolution_failed');
}

function itemKind(id: `item:${string}`): string {
  return id.slice('item:'.length);
}

function resolveDefinition(
  definitions: ReadonlyMap<string, LootContentDefinition>,
  definition: LootContentDefinition,
  request: LootRollRequest,
  depth: number,
): LootRollResult {
  const context = request.context ?? {};
  const drops: LootDrop[] = [];
  const flags = new Set<string>();
  for (let rollIndex = 0; rollIndex < (request.rolls ?? 1); rollIndex += 1) {
    const rollSeed = request.rolls === undefined || request.rolls === 1
      ? request.seedParts
      : [...request.seedParts, 'loot.roll', rollIndex];
    for (const group of definition.groups) {
      if (!conditionsMatch(group.conditions, context, rollSeed)) continue;
      const chosen = selectedEntry(
        group.entries,
        context,
        rollSeed,
        group.rollTag ?? `loot.${definition.id}.${group.id}`,
      );
      if (chosen === null) continue;
      for (const flag of chosen.flags ?? []) flags.add(flag);
      if ('loot' in chosen.target) {
        if (depth >= 1) throw new Error('loot_recursion_limit');
        const nested = definitions.get(chosen.target.loot);
        if (nested === undefined || nested.retired === true) throw new Error('loot_definition_missing');
        const result = resolveDefinition(definitions, nested, {
          lootId: nested.id,
          seedParts: rollSeed,
          context,
        }, depth + 1);
        drops.push(...result.drops);
        for (const flag of result.flags) flags.add(flag);
        continue;
      }
      const span = chosen.target.max - chosen.target.min + 1;
      const quantity = span === 1
        ? chosen.target.min
        : chosen.target.min + statelessRoll([...rollSeed, 'loot.quantity', chosen.id], span);
      drops.push({ itemKind: itemKind(chosen.target.item), quantity });
    }
  }
  return Object.freeze({ drops: Object.freeze(drops), flags: Object.freeze([...flags].sort()) });
}

/** Deterministic, bounded loot interpreter shared by previews and authority. */
export function rollLoot(
  definitions: ReadonlyMap<string, LootContentDefinition>,
  request: LootRollRequest,
): LootRollResult {
  const rolls = request.rolls ?? 1;
  if (!Number.isSafeInteger(rolls) || rolls < 1 || rolls > 32) {
    throw new Error('loot_roll_count_invalid');
  }
  const definition = definitions.get(request.lootId);
  if (definition === undefined || definition.retired === true) throw new Error('loot_definition_missing');
  return resolveDefinition(definitions, definition, { ...request, rolls }, 0);
}

/** Bootstrap compatibility projection. Runtime authority consumes the active
 * ResourceContentDefinition directly and is not coupled to this map. */
export const RESOURCE_LOOT_IDS: Readonly<Record<string, `loot:${string}`>> = Object.freeze(Object.fromEntries(
  bootstrapDefinitionsOfKind('resource').map((definition) => [definition.runtimeKind, definition.loot]),
));

export interface WildlifeLootResult extends LootRollResult {
  readonly combatExperience: bigint;
}

/** Compatibility-shaped adapters let authority migrate one reducer at a time
 * while all outcome selection comes from authored loot definitions. */
export function resolveWildlifeLoot(
  definitions: ReadonlyMap<string, LootContentDefinition>,
  creature: CreatureContentDefinition,
  seedParts: LootRollRequest['seedParts'],
): WildlifeLootResult {
  const combatExperience = creature.combat.experience;
  if (creature.retired === true || !creature.combat.huntable || creature.loot === undefined) {
    return { drops: [], flags: [], combatExperience: 0n };
  }
  const result = rollLoot(definitions, { lootId: creature.loot, seedParts });
  return { ...result, combatExperience: BigInt(combatExperience) };
}

export function resolveMiningLoot(
  definitions: ReadonlyMap<string, LootContentDefinition>,
  state: MiningYieldState,
  seedParts: LootRollRequest['seedParts'],
  oreDressingRank = 0,
  rockhoundRank = 0,
  motherLodeRank = 0,
): MiningYieldResult {
  const lootId = state.lootId ?? RESOURCE_LOOT_IDS[state.kind];
  if (lootId === undefined) throw new Error('resource_loot_definition_missing');
  const result = rollLoot(definitions, {
    lootId,
    seedParts,
    context: {
      values: {
        nodeClass: state.nodeClass,
        richnessRemaining: state.richnessRemaining,
        maximumRichness: state.maximumRichness,
        yieldsProduced: state.yieldsProduced,
        producedOre: state.producedOre,
      },
      skillRanks: {
        ore_dressing: Math.max(0, Math.min(3, Math.floor(oreDressingRank))),
        rockhound: Math.max(0, Math.min(2, Math.floor(rockhoundRank))),
        mother_lode: Math.max(0, Math.floor(motherLodeRank)),
      },
    },
  });
  return { drops: result.drops, producedOre: result.flags.includes('ore') };
}

/** Completed cellar walls share the authored fragment roll with rock nodes. */
export function resolveMiningRockBonus(
  definitions: ReadonlyMap<string, LootContentDefinition>,
  seedParts: LootRollRequest['seedParts'],
  rockhoundRank: number,
): readonly LootDrop[] {
  return rollLoot(definitions, {
    lootId: 'loot:mining_rock_bonus', seedParts,
    context: { skillRanks: { rockhound: Math.max(0, Math.min(2, Math.floor(rockhoundRank))) } },
  }).drops;
}

export interface FishingLootResult {
  readonly quality: FishingCatchQuality;
  readonly drops: readonly LootDrop[];
}

export function resolveFishingLoot(
  definitions: ReadonlyMap<string, LootContentDefinition>,
  seedParts: LootRollRequest['seedParts'],
  dexterity: number,
  richnessRemaining: number,
  modifiers: readonly Modifier[] = [],
  lootId: `loot:${string}` = RESOURCE_LOOT_IDS.fish_pool!,
  profile?: CharacterCombatBalanceProfile,
): FishingLootResult {
  const rolledQuality = profile === undefined
    ? fishingCatchQuality(seedParts, dexterity, modifiers)
    : fishingCatchQualityWithProfile(profile, seedParts, dexterity, modifiers);
  const quality = richnessRemaining <= 1 && rolledQuality === 'common' ? 'good' : rolledQuality;
  const result = rollLoot(definitions, {
    lootId,
    seedParts,
    context: { values: { quality } },
  });
  return { quality, drops: result.drops };
}

export function resolveResourceHitLoot(
  definitions: ReadonlyMap<string, LootContentDefinition>,
  kind: keyof typeof RESOURCE_LOOT_IDS,
  remainingHealth: number,
  treeGrowthStage = 3,
  seedParts: LootRollRequest['seedParts'] = [],
): readonly LootDrop[] {
  const lootId = RESOURCE_LOOT_IDS[kind];
  if (lootId === undefined) throw new Error('resource_loot_definition_missing');
  const stage = Math.max(1, Math.min(3, Math.floor(treeGrowthStage)));
  return rollLoot(definitions, {
    lootId,
    seedParts,
    context: { values: { remainingHealth, treeGrowthStage: stage } },
  }).drops;
}

export function wildlifeLootHandlerRegistrations(
  creatures: Iterable<CreatureContentDefinition>,
): readonly AnyHandlerRegistration[] {
  return Object.freeze([...creatures].filter((definition) => definition.retired !== true
    && definition.loot !== undefined
    && definition.combat.huntable
    && definition.combat.experience > 0).map((definition) => ({
  id: `loot.break.wildlife.${definition.id.slice('creature:'.length)}`,
  eventType: 'break' as const,
  source: 'target' as const,
  match: { kind: 'definition' as const, definitionId: definition.id },
  priority: 110,
  handler: () => effectsResult([{ rollLoot: { lootId: definition.loot! } }]),
  })));
}

export function resourceLootHandlerRegistrations(
  resources: Iterable<ResourceContentDefinition>,
): readonly AnyHandlerRegistration[] {
  return Object.freeze([...resources].filter(({ retired }) => retired !== true).map((definition) => ({
  id: `loot.${definition.interaction.event}.resource.${definition.id.slice('resource:'.length)}`,
  eventType: definition.interaction.event,
  source: 'target' as const,
  match: { kind: 'definition' as const, definitionId: definition.id },
  priority: 110,
  handler: () => effectsResult([{ rollLoot: { lootId: definition.loot } }]),
  })));
}

const resourceHandlers = resourceLootHandlerRegistrations(bootstrapDefinitionsOfKind('resource'));
const wildlifeHandlers = wildlifeLootHandlerRegistrations(bootstrapDefinitionsOfKind('creature'));

/** Compiled migration bridge for the authoring parity checklist (wiki: Studio/Authoring Suite) rows 16–17. */
export const LOOT_HANDLER_REGISTRATIONS: readonly AnyHandlerRegistration[] = Object.freeze([
  ...wildlifeHandlers,
  ...resourceHandlers,
]);

export function registerLootHandlers(
  registry: BehaviourHandlerRegistry = createHandlerRegistry(),
  resources: Iterable<ResourceContentDefinition> = bootstrapDefinitionsOfKind('resource'),
  creatures: Iterable<CreatureContentDefinition> = bootstrapDefinitionsOfKind('creature'),
): BehaviourHandlerRegistry {
  const existing = new Set(registry.registrations.map(({ id }) => id));
  const activeResourceHandlers = resourceLootHandlerRegistrations(resources);
  const activeWildlifeHandlers = wildlifeLootHandlerRegistrations(creatures);
  return createHandlerRegistry([
    ...registry.registrations,
    ...activeWildlifeHandlers.filter(({ id }) => !existing.has(id)),
    ...activeResourceHandlers.filter(({ id }) => !existing.has(id)),
  ]);
}
