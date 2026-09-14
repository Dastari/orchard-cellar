import { type SkillGearMetadata } from './skill-gear-metadata.js';
import { BOOTSTRAP_COMPILED_CONTENT } from './content/bootstrap-projection.js';
import type { SkillNodeCapability, SkillNodePassives } from './content/world-definition.js';
import type { ContentRegistry } from './content/registry.js';

export const SKILL_TRACKS = ['combat', 'explorer', 'farming'] as const;
export type SkillTrack = (typeof SKILL_TRACKS)[number];

export const SKILL_LEVEL_CAP = 50;
export const SKILL_SPECIALIZATIONS = [
  'farming', 'mining', 'fishing', 'woodcutting', 'animal_husbandry', 'exploration',
] as const;
export type SkillSpecialization = (typeof SKILL_SPECIALIZATIONS)[number];

export interface SkillNodeDefinition extends SkillGearMetadata {
  readonly id: string;
  readonly iconAsset: string;
  readonly track: SkillTrack;
  readonly name: string;
  readonly description: string;
  readonly position: readonly [x: number, y: number];
  readonly connects: readonly string[];
  /** Every prerequisite and its prerequisite chain must be owned. */
  readonly prerequisites?: readonly string[];
  readonly passive?: SkillNodePassives;
  readonly capabilities?: readonly SkillNodeCapability[];
  readonly maxRank: number;
  readonly pointCost: number;
  readonly requiresLevel?: number;
  readonly root?: boolean;
  /** Branch ownership used by tool-quality gates and contextual effects. */
  readonly specialization?: SkillSpecialization;
  /** Present only when buying this node changes live gameplay today. */
  readonly implemented?: true;
}

const nodes: readonly SkillNodeDefinition[] = BOOTSTRAP_COMPILED_CONTENT.skillNodes;

export const SKILL_NODE_DEFINITIONS: readonly SkillNodeDefinition[] = nodes;
const SKILL_NODE_BY_ID = new Map<string, SkillNodeDefinition>(nodes.map((node) => [node.id, node]));

export function isSkillTrack(value: string): value is SkillTrack {
  return (SKILL_TRACKS as readonly string[]).includes(value);
}

export function skillNodeDefinition(id: string): SkillNodeDefinition | null {
  return SKILL_NODE_BY_ID.get(id) ?? null;
}

export function skillNodesForTrack(track: SkillTrack): readonly SkillNodeDefinition[] {
  return nodes.filter((node) => node.track === track);
}

export function skillNodeIsImplemented(node: SkillNodeDefinition): boolean {
  return node.implemented === true;
}

export function specializationRankTotal(
  ranks: Readonly<Record<string, number>>,
  specialization: SkillSpecialization,
): number {
  return (nodes as readonly SkillNodeDefinition[]).reduce((total, node) => node.specialization === specialization
    ? total + Math.max(0, Math.floor(ranks[node.id] ?? 0))
    : total, 0);
}

/** Live equivalent of the bootstrap compatibility helper above. Invalid or
 * orphaned stored ranks do not grant authored tool-specialization access. */
export function runtimeSpecializationRankTotal(
  registry: ContentRegistry,
  ranks: Readonly<Record<string, number>>,
  specialization: SkillSpecialization,
): number {
  const definitions = [...registry.skillTrees.values()].filter((tree) => tree.retired !== true)
    .flatMap((tree) => tree.nodes).filter((node) => node.implemented === true);
  const owned = ownedSkillNodesWithPrerequisites(definitions, ranks);
  return definitions.reduce((total, node) => {
    const rank = ranks[node.id] ?? 0;
    return node.specialization === specialization && owned.has(node.id)
      && Number.isSafeInteger(rank) && rank > 0
      ? total + Math.min(rank, node.maxRank) : total;
  }, 0);
}

/** Total XP threshold for reaching `level`. Level zero always starts at zero. */
export function skillExperienceForLevel(level: number): bigint {
  const normalized = Math.max(0, Math.min(SKILL_LEVEL_CAP, Math.floor(level)));
  return BigInt(Math.floor(100 * normalized ** 1.7));
}

export function skillLevelForExperience(experience: bigint): number {
  const normalized = experience < 0n ? 0n : experience;
  let level = 0;
  while (level < SKILL_LEVEL_CAP && normalized >= skillExperienceForLevel(level + 1)) level += 1;
  return level;
}

export function availableSkillPoints(experience: bigint, spentPoints: number, bonusPoints = 0): number {
  return Math.max(0, skillLevelForExperience(experience) + Math.max(0, bonusPoints) - Math.max(0, spentPoints));
}

export function skillRespecCostBronze(respecCount: number): bigint {
  const ladder = [0n, 100n, 500n, 2_500n, 10_000n] as const;
  return ladder[Math.max(0, Math.min(ladder.length - 1, Math.floor(respecCount)))] ?? 10_000n;
}

export interface SkillPurchaseState {
  readonly experience: bigint;
  readonly spentPoints: number;
  readonly bonusPoints: number;
  readonly ranks: Readonly<Record<string, number>>;
}

export type SkillPurchaseRejection =
  | 'skill_not_found'
  | 'skill_root_owned'
  | 'skill_rank_maxed'
  | 'skill_level_required'
  | 'skill_not_connected'
  | 'skill_points_required';

export function skillPurchaseRejection(
  nodeId: string,
  state: SkillPurchaseState,
): SkillPurchaseRejection | null {
  return skillPurchaseRejectionForNodes(nodes, nodeId, state);
}

export function skillPurchaseRejectionForNodes(
  definitions: readonly SkillNodeDefinition[],
  nodeId: string,
  state: SkillPurchaseState,
): SkillPurchaseRejection | null {
  const byId = new Map(definitions.map((definition) => [definition.id, definition]));
  const node = byId.get(nodeId) ?? null;
  if (node === null) return 'skill_not_found';
  if (node.root === true) return 'skill_root_owned';
  const currentRank = Math.max(0, state.ranks[node.id] ?? 0);
  if (currentRank >= node.maxRank) return 'skill_rank_maxed';
  if (skillLevelForExperience(state.experience) < (node.requiresLevel ?? 0)) return 'skill_level_required';
  const connected = node.connects.some((id) => {
    const neighbour = byId.get(id);
    return neighbour?.root === true || (state.ranks[id] ?? 0) > 0;
  });
  if (!connected) return 'skill_not_connected';
  if (node.prerequisites !== undefined) {
    const owned = ownedSkillNodesWithPrerequisites(definitions, state.ranks);
    if (!node.prerequisites.every((id) => owned.has(id))) return 'skill_not_connected';
  }
  if (availableSkillPoints(state.experience, state.spentPoints, state.bonusPoints) < node.pointCost) {
    return 'skill_points_required';
  }
  return null;
}

export function runtimeSkillNodeDefinition(
  registry: ContentRegistry,
  nodeId: string,
): SkillNodeDefinition | null {
  return registry.compiled.skillNodes.find(({ id }) => id === nodeId) ?? null;
}

export function runtimeSkillPurchaseRejection(
  registry: ContentRegistry,
  nodeId: string,
  state: SkillPurchaseState,
): SkillPurchaseRejection | null {
  return skillPurchaseRejectionForNodes(registry.compiled.skillNodes, nodeId, state);
}

/** Resolve ownership without depending on node IDs or traversal order. Missing
 * references, invalid ranks and prerequisite cycles never grant ownership. */
export function ownedSkillNodesWithPrerequisites(
  definitions: readonly SkillNodeDefinition[],
  ranks: Readonly<Record<string, number>>,
): ReadonlySet<string> {
  const byId = new Map(definitions.map((node) => [node.id, node]));
  const owned = new Set<string>();
  const visiting = new Set<string>();
  const rejected = new Set<string>();
  const visit = (id: string): boolean => {
    if (owned.has(id)) return true;
    if (visiting.has(id) || rejected.has(id)) return false;
    const node = byId.get(id);
    const rank = ranks[id] ?? 0;
    if (node === undefined || (node.root !== true && (!Number.isSafeInteger(rank) || rank <= 0 || rank > node.maxRank))) {
      rejected.add(id);
      return false;
    }
    visiting.add(id);
    const allowed = (node.prerequisites ?? []).every(visit);
    visiting.delete(id);
    if (allowed) owned.add(id);
    else rejected.add(id);
    return allowed;
  };
  for (const node of definitions) visit(node.id);
  return owned;
}
