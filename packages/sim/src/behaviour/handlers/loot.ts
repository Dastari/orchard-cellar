import { fishingCatchQuality, statelessRoll, type FishingCatchQuality } from '../../checks.js';
import { WILDLIFE_LOOT_PROFILES } from '../../content/loot-bootstrap.js';
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
import type { WildlifeSpecies } from '../../wildlife.js';
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

export const RESOURCE_LOOT_IDS = Object.freeze({
  tree_oak: 'loot:resource_tree_oak',
  tree_birch: 'loot:resource_tree_birch',
  tree_spruce: 'loot:resource_tree_spruce',
  tree_acacia: 'loot:resource_tree_acacia',
  tree_palm: 'loot:resource_tree_palm',
  tree_apple: 'loot:resource_tree_apple',
  tree_pear: 'loot:resource_tree_pear',
  tree_peach: 'loot:resource_tree_peach',
  tree_cherry: 'loot:resource_tree_cherry',
  cactus: 'loot:resource_cactus',
  loose_stone: 'loot:resource_loose_stone',
  fallen_branch: 'loot:resource_fallen_branch',
  ore_iron: 'loot:mining_ore_iron',
  ore_copper: 'loot:mining_ore_copper',
  ore_gold: 'loot:mining_ore_gold',
  ore_emerald: 'loot:mining_ore_emerald',
  ore_sapphire: 'loot:mining_ore_sapphire',
  ore_topaz: 'loot:mining_ore_topaz',
  ore_ruby: 'loot:mining_ore_ruby',
  ore_amethyst: 'loot:mining_ore_amethyst',
  rock_large: 'loot:mining_rock_large',
  fish_pool: 'loot:fishing_pool',
} as const);

export interface WildlifeLootResult extends LootRollResult {
  readonly combatExperience: bigint;
}

/** Compatibility-shaped adapters let authority migrate one reducer at a time
 * while all outcome selection comes from authored loot definitions. */
export function resolveWildlifeLoot(
  definitions: ReadonlyMap<string, LootContentDefinition>,
  species: WildlifeSpecies,
  seedParts: LootRollRequest['seedParts'],
): WildlifeLootResult {
  const profile = WILDLIFE_LOOT_PROFILES[species as keyof typeof WILDLIFE_LOOT_PROFILES];
  if (profile === undefined) return { drops: [], flags: [], combatExperience: 0n };
  const result = rollLoot(definitions, { lootId: profile.lootId, seedParts });
  return { ...result, combatExperience: BigInt(profile.combatExperience) };
}

export function resolveMiningLoot(
  definitions: ReadonlyMap<string, LootContentDefinition>,
  state: MiningYieldState,
  seedParts: LootRollRequest['seedParts'],
  oreDressingRank = 0,
  rockhoundRank = 0,
  motherLodeRank = 0,
): MiningYieldResult {
  const lootId = RESOURCE_LOOT_IDS[state.kind];
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
): FishingLootResult {
  const rolledQuality = fishingCatchQuality(seedParts, dexterity, modifiers);
  const quality = richnessRemaining <= 1 && rolledQuality === 'common' ? 'good' : rolledQuality;
  const result = rollLoot(definitions, {
    lootId: RESOURCE_LOOT_IDS.fish_pool,
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
  const stage = Math.max(1, Math.min(3, Math.floor(treeGrowthStage)));
  return rollLoot(definitions, {
    lootId,
    seedParts,
    context: { values: { remainingHealth, treeGrowthStage: stage } },
  }).drops;
}

const wildlifeHandlers = Object.entries(WILDLIFE_LOOT_PROFILES).map(([species, profile]) => ({
  id: `loot.break.wildlife.${species}`,
  eventType: 'break' as const,
  source: 'target' as const,
  match: { kind: 'definition' as const, definitionId: `creature:${species}` },
  priority: 110,
  handler: () => effectsResult([{ rollLoot: { lootId: profile.lootId } }]),
}));

const resourceHandlers = Object.entries(RESOURCE_LOOT_IDS).map(([kind, lootId]) => ({
  id: `loot.${kind === 'loose_stone' || kind === 'fallen_branch' ? 'use' : 'break'}.resource.${kind}`,
  eventType: kind === 'loose_stone' || kind === 'fallen_branch' ? 'use' as const : 'break' as const,
  source: 'target' as const,
  match: { kind: 'definition' as const, definitionId: `resource:${kind}` },
  priority: 110,
  handler: () => effectsResult([{ rollLoot: { lootId } }]),
}));

/** Compiled migration bridge for docs/55 §11 rows 16–17. */
export const LOOT_HANDLER_REGISTRATIONS: readonly AnyHandlerRegistration[] = Object.freeze([
  ...wildlifeHandlers,
  ...resourceHandlers,
]);

export function registerLootHandlers(
  registry: BehaviourHandlerRegistry = createHandlerRegistry(),
): BehaviourHandlerRegistry {
  const existing = new Set(registry.registrations.map(({ id }) => id));
  return createHandlerRegistry([
    ...registry.registrations,
    ...LOOT_HANDLER_REGISTRATIONS.filter(({ id }) => !existing.has(id)),
  ]);
}
