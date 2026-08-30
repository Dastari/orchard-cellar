import type { Modifier } from './modifiers.js';

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
  return modifiers;
}
