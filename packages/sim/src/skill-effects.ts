import type { Modifier } from './modifiers.js';
import { ownedSkillNodesWithPrerequisites, type SkillSpecialization } from './skill-trees.js';
import type { ContentRegistry } from './content/registry.js';

/** The first live skill effects are deliberately narrow and data-only. More
 * nodes can join this compiler without branching combat reducers. */
export function modifiersForSkillRanks(ranks: Readonly<Record<string, number>>): readonly Modifier[] {
  const modifiers: Modifier[] = [];
  const add = (nodeId: string, target: Modifier['target'], valuePerRank: number): void => {
    const rank = Math.max(0, Math.floor(ranks[nodeId] ?? 0));
    if (rank <= 0) return;
    modifiers.push({
      id: `skill.${nodeId}`,
      target,
      layer: 'pctAdd',
      value: rank * valuePerRank,
      source: 'skill',
    });
  };
  add('archery_basics', 'rangedPower', 300);
  add('blade_training', 'attackPower', 300);
  add('battle_conditioning', 'toolVigourCost', -500);
  add('measured_stride', 'sprintVigourCost', -600);
  return modifiers;
}

const TOOL_VIGOUR_NODE_BY_SPECIALIZATION: Readonly<Partial<Record<SkillSpecialization, string>>> = {
  farming: 'farmcraft',
  mining: 'mining_endurance',
  fishing: 'fishing_endurance',
  woodcutting: 'woodcutting_endurance',
};

/** Modifiers whose meaning depends on the tool being used are compiled only
 * for that action, so an Angler rank cannot make an axe cheaper to swing. */
export function modifiersForToolSpecialization(
  ranks: Readonly<Record<string, number>>,
  specialization: SkillSpecialization | null,
): readonly Modifier[] {
  if (specialization === null) return [];
  const nodeId = TOOL_VIGOUR_NODE_BY_SPECIALIZATION[specialization];
  if (nodeId === undefined) return [];
  const rank = Math.max(0, Math.floor(ranks[nodeId] ?? 0));
  return rank === 0 ? [] : [{
    id: `skill.${nodeId}.tool_vigour`,
    target: 'toolVigourCost',
    layer: 'pctAdd',
    value: rank * -500,
    source: 'skill',
  }];
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
  const nodes = [...registry.skillTrees.values()].filter((tree) => tree.retired !== true)
    .flatMap((tree) => tree.nodes).filter((node) => node.implemented === true);
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
