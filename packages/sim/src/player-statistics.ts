import { BOOTSTRAP_COMPILED_CONTENT } from './content/bootstrap-projection.js';

export type PlayerStatisticCategory =
  | 'account'
  | 'social'
  | 'exploration'
  | 'items'
  | 'crafting'
  | 'commerce'
  | 'farming'
  | 'world'
  | 'tools'
  | 'creatures'
  | 'combat'
  | 'progression'
  | 'future';

export type PlayerStatisticUnit =
  | 'count'
  | 'authority_ticks'
  | 'fixed_distance'
  | 'bronze'
  | 'durability'
  | 'damage';

export type PlayerStatisticAggregation = 'counter' | 'maximum';

export type PlayerStatisticSubject =
  | 'none'
  | 'chat_kind'
  | 'movement_mode'
  | 'item_kind'
  | 'resource_kind'
  | 'tool_kind'
  | 'npc_kind'
  | 'hit_kind'
  | 'transaction_kind'
  | 'crop_kind'
  | 'fish_kind'
  | 'creature_kind'
  | 'combat_target_kind'
  | 'damage_kind'
  | 'quest_kind'
  | 'npc_id'
  | 'quest_objective'
  | 'quest_action'
  | 'upgrade_kind'
  | 'skill_track';

export interface PlayerStatisticDefinition {
  readonly name: string;
  readonly description: string;
  readonly category: PlayerStatisticCategory;
  readonly unit: PlayerStatisticUnit;
  readonly aggregation: PlayerStatisticAggregation;
  readonly subject: PlayerStatisticSubject;
  readonly milestones: readonly bigint[];
  /** Reserved definitions document a required future hook without pretending
   * that the corresponding gameplay verb already exists. */
  readonly reserved?: boolean;
}

export const PLAYER_STATISTIC_DEFINITIONS: Readonly<Record<string, PlayerStatisticDefinition>> =
  BOOTSTRAP_COMPILED_CONTENT.statistics;

export type PlayerStatisticKind = keyof typeof PLAYER_STATISTIC_DEFINITIONS;

export const MAX_PLAYER_STATISTIC_VALUE = (1n << 64n) - 1n;

export function playerStatisticDefinition(kind: string): PlayerStatisticDefinition | null {
  return Object.prototype.hasOwnProperty.call(PLAYER_STATISTIC_DEFINITIONS, kind)
    ? PLAYER_STATISTIC_DEFINITIONS[kind as PlayerStatisticKind] ?? null
    : null;
}

function requiredStatisticDefinition(kind: PlayerStatisticKind): PlayerStatisticDefinition {
  const definition = playerStatisticDefinition(kind);
  if (definition === null) throw new Error(`unknown_player_statistic:${kind}`);
  return definition;
}

export function statisticSubjectIsValid(kind: PlayerStatisticKind, subjectKind: string): boolean {
  return statisticSubjectIsValidForDefinition(requiredStatisticDefinition(kind), subjectKind);
}

export function statisticSubjectIsValidForDefinition(
  definition: PlayerStatisticDefinition,
  subjectKind: string,
): boolean {
  if (definition.subject === 'none') return subjectKind === '';
  if (subjectKind.trim().length === 0) return false;
  if (definition.subject === 'chat_kind') {
    return ['channel', 'whisper', 'say', 'shout'].includes(subjectKind);
  }
  if (definition.subject === 'movement_mode') return ['foot', 'jump', 'horse', 'boat'].includes(subjectKind);
  if (definition.subject === 'transaction_kind') return subjectKind === 'buy' || subjectKind === 'sell';
  if (definition.subject === 'skill_track') return ['combat', 'explorer', 'farming'].includes(subjectKind);
  return true;
}

export function statisticValueAfter(
  kind: PlayerStatisticKind,
  current: bigint,
  input: bigint,
): bigint {
  return statisticValueAfterDefinition(requiredStatisticDefinition(kind), current, input);
}

export function statisticValueAfterDefinition(
  definition: PlayerStatisticDefinition,
  current: bigint,
  input: bigint,
): bigint {
  if (current < 0n || input < 0n) throw new Error('invalid_statistic_value');
  if (definition.aggregation === 'maximum') return input > current ? input : current;
  const total = current + input;
  return total > MAX_PLAYER_STATISTIC_VALUE ? MAX_PLAYER_STATISTIC_VALUE : total;
}

export function statisticMilestonesCrossed(
  kind: PlayerStatisticKind,
  previous: bigint,
  next: bigint,
): readonly bigint[] {
  return statisticMilestonesCrossedForDefinition(requiredStatisticDefinition(kind), previous, next);
}

export function statisticMilestonesCrossedForDefinition(
  definition: PlayerStatisticDefinition,
  previous: bigint,
  next: bigint,
): readonly bigint[] {
  if (previous < 0n || next < previous) throw new Error('invalid_statistic_range');
  return definition.milestones
    .filter((threshold) => threshold > previous && threshold <= next);
}
