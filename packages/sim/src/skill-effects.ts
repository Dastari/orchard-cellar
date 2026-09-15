import type { Modifier } from './modifiers.js';
import { ownedSkillNodesWithPrerequisites, type SkillSpecialization } from './skill-trees.js';
import { bootstrapContentRegistry } from './content/bootstrap-registry.js';
import type { ContentRegistry } from './content/registry.js';
import type { SkillNodeCapability } from './content/world-definition.js';

function activeImplementedNodes(registry: Pick<ContentRegistry, 'skillTrees'>) {
  return [...registry.skillTrees.values()].filter((tree) => tree.retired !== true)
    .flatMap((tree) => tree.nodes).filter((node) => node.implemented === true);
}

function validOwnedRanks(
  registry: Pick<ContentRegistry, 'skillTrees'>,
  ranks: Readonly<Record<string, number>>,
): ReadonlyMap<string, number> {
  const nodes = activeImplementedNodes(registry);
  const owned = ownedSkillNodesWithPrerequisites(nodes, ranks);
  return new Map(nodes.flatMap((node) => {
    const rank = ranks[node.id] ?? 0;
    return owned.has(node.id) && node.root !== true && Number.isSafeInteger(rank) && rank > 0
      ? [[node.id, Math.min(rank, node.maxRank)] as const] : [];
  }));
}

/** Resolve one authored node reference such as a mount requirement while also
 * rejecting stale ranks whose active definition or prerequisite chain is gone. */
export function runtimeSkillNodeRank(
  registry: Pick<ContentRegistry, 'skillTrees'>,
  ranks: Readonly<Record<string, number>>,
  nodeId: string,
): number {
  return validOwnedRanks(registry, ranks).get(nodeId) ?? 0;
}

/** Compile global/weapon rank effects from the supplied active registry. The
 * default exists only for bootstrap-compatible isolated simulation callers. */
export function modifiersForSkillRanks(
  ranks: Readonly<Record<string, number>>,
  registry: ContentRegistry = bootstrapContentRegistry(),
): readonly Modifier[] {
  const modifiers: Modifier[] = [];
  const ownedRanks = validOwnedRanks(registry, ranks);
  for (const node of activeImplementedNodes(registry)) {
    const rank = ownedRanks.get(node.id) ?? 0;
    if (rank === 0) continue;
    for (const [index, effect] of (node.effectsPerRank ?? []).entries()) {
      if (effect.context !== 'global' && effect.context !== 'weapon') continue;
      modifiers.push({
        id: `skill.${node.id}.${index}`,
        target: effect.target,
        layer: 'pctAdd',
        value: rank * effect.value,
        source: 'skill',
      });
    }
  }
  return modifiers;
}

/** Modifiers whose meaning depends on the tool being used are compiled only
 * for that action from authored effect context, so a renamed Angler node still
 * cannot make an axe cheaper to swing. */
export function modifiersForToolSpecialization(
  ranks: Readonly<Record<string, number>>,
  specialization: SkillSpecialization | null,
  registry: ContentRegistry = bootstrapContentRegistry(),
): readonly Modifier[] {
  if (specialization === null) return [];
  const modifiers: Modifier[] = [];
  const ownedRanks = validOwnedRanks(registry, ranks);
  for (const node of activeImplementedNodes(registry)) {
    const rank = ownedRanks.get(node.id) ?? 0;
    if (rank === 0) continue;
    for (const [index, effect] of (node.effectsPerRank ?? []).entries()) {
      if (effect.context !== specialization) continue;
      modifiers.push({
        id: `skill.${node.id}.${index}`,
        target: effect.target,
        layer: 'pctAdd',
        value: rank * effect.value,
        source: 'skill',
      });
    }
  }
  return modifiers;
}

export interface RuntimeSkillCapabilities {
  readonly maximumFootGapTiles: number;
  readonly maximumFootCliffLevels: number;
  readonly minimapPlayerTracking: boolean;
  readonly efficientStrikesRank: number;
  readonly miningYieldInspection: boolean;
  readonly oreDressingRank: number;
  readonly rockhoundRank: number;
  readonly motherLodeRank: number;
}

const EMPTY_CAPABILITIES: RuntimeSkillCapabilities = Object.freeze({
  maximumFootGapTiles: 0,
  maximumFootCliffLevels: 0,
  minimapPlayerTracking: false,
  efficientStrikesRank: 0,
  miningYieldInspection: false,
  oreDressingRank: 0,
  rockhoundRank: 0,
  motherLodeRank: 0,
});

/** Resolve engine-facing skill semantics without inspecting authored node IDs.
 * Multiple active grants compose by maximum rank, and invalid/missing/retired
 * definitions grant nothing. */
export function runtimeSkillCapabilities(
  registry: ContentRegistry,
  ranks: Readonly<Record<string, number>>,
): RuntimeSkillCapabilities {
  const ownedRanks = validOwnedRanks(registry, ranks);
  const capabilityRanks = new Map<SkillNodeCapability, number>();
  for (const node of activeImplementedNodes(registry)) {
    const rank = ownedRanks.get(node.id) ?? 0;
    if (rank === 0) continue;
    for (const capability of node.capabilities ?? []) {
      capabilityRanks.set(capability, Math.max(capabilityRanks.get(capability) ?? 0, rank));
    }
  }
  if (capabilityRanks.size === 0) return EMPTY_CAPABILITIES;
  const rank = (capability: SkillNodeCapability): number => capabilityRanks.get(capability) ?? 0;
  return Object.freeze({
    maximumFootGapTiles: rank('foot_gap_jump'),
    maximumFootCliffLevels: rank('foot_cliff_climb'),
    minimapPlayerTracking: rank('minimap_player_tracking') > 0,
    efficientStrikesRank: rank('mining_efficient_strikes'),
    miningYieldInspection: rank('mining_yield_inspection') > 0,
    oreDressingRank: rank('mining_ore_dressing'),
    rockhoundRank: rank('mining_rockhound'),
    motherLodeRank: rank('mining_mother_lode'),
  });
}

export interface ResourcePerception {
  readonly buriedOreRadiusTiles: number;
  readonly identifyBuriedOre: boolean;
  readonly minimapOre: boolean;
  readonly minimapFishing: boolean;
  readonly minimapOreRadiusTiles: number;
  readonly minimapFishingRadiusTiles: number;
}

/** Passive presentation capabilities come exclusively from the active authored
 * tree and server-owned ranks. They never change tool reach or execute effects. */
export function runtimeResourcePerception(
  registry: ContentRegistry,
  ranks: Readonly<Record<string, number>>,
): ResourcePerception {
  const nodes = activeImplementedNodes(registry);
  const owned = ownedSkillNodesWithPrerequisites(nodes, ranks);
  let buriedOreRadiusTiles = 0;
  let identifyBuriedOre = false;
  let minimapOre = false;
  let minimapFishing = false;
  let minimapOreRadiusTiles = 0;
  let minimapFishingRadiusTiles = 0;
  for (const node of nodes) {
    if (!owned.has(node.id) || node.passive === undefined) continue;
    buriedOreRadiusTiles = Math.max(buriedOreRadiusTiles, node.passive.buriedOreDetectionRadiusTiles ?? 0);
    identifyBuriedOre ||= node.passive.identifyBuriedOre === true;
    if (node.passive.minimapResources?.includes('ore') === true) {
      minimapOre = true;
      minimapOreRadiusTiles = Math.max(minimapOreRadiusTiles, node.passive.minimapRadiusTiles ?? 0);
    }
    if (node.passive.minimapResources?.includes('fish_pool') === true) {
      minimapFishing = true;
      minimapFishingRadiusTiles = Math.max(minimapFishingRadiusTiles, node.passive.minimapRadiusTiles ?? 0);
    }
  }
  return { buriedOreRadiusTiles, identifyBuriedOre, minimapOre, minimapFishing, minimapOreRadiusTiles, minimapFishingRadiusTiles };
}

export interface FarmingSkillEffects {
  readonly greenThumb: number;
  readonly seedSaver: number;
  readonly orchardSeedSaver: number;
  readonly bountifulHarvest: number;
  readonly tenderHand: number;
  readonly masterGrower: boolean;
  readonly barreling: number;
  readonly harvestFestival: boolean;
  readonly soilWhisperer: boolean;
}

/** Farming capabilities follow authored metadata, including renamed nodes. */
export function farmingSkillEffects(
  registry: ContentRegistry, ranks: Readonly<Record<string, number>>,
): FarmingSkillEffects {
  const owned = validOwnedRanks(registry, ranks);
  const capabilities = new Map<SkillNodeCapability, number>();
  for (const node of activeImplementedNodes(registry)) {
    const rank = owned.get(node.id) ?? 0;
    for (const capability of node.capabilities ?? []) {
      capabilities.set(capability, Math.max(capabilities.get(capability) ?? 0, rank));
    }
  }
  const rank = (key: SkillNodeCapability) => capabilities.get(key) ?? 0;
  return {
    greenThumb: rank('farming_green_thumb'), seedSaver: rank('farming_seed_saver'),
    orchardSeedSaver: rank('farming_orchard_seed_saver'),
    bountifulHarvest: rank('farming_bountiful_harvest'), tenderHand: rank('farming_tender_hand'),
    masterGrower: rank('farming_master_grower') > 0, barreling: rank('farming_barreling'),
    harvestFestival: rank('farming_harvest_festival') > 0,
    soilWhisperer: rank('farming_soil_whisperer') > 0,
  };
}
