import { BRONZE_PER_GOLD } from './commerce.js';
import { isUniqueQuestItemKind } from './item-containers.js';
import { TILE_SIZE_FIXED } from './state.js';

export type QuestState = 'active' | 'complete' | 'turned_in';

export interface QuestItemRequirement {
  readonly itemKind: string;
  readonly count: number;
}

export type QuestObjectiveDefinition =
  | {
      readonly id: string;
      readonly kind: 'location';
      readonly label: string;
      readonly spaceId: number;
      readonly x: number;
      readonly y: number;
      readonly radiusFixed: number;
    }
  | {
      readonly id: string;
      readonly kind: 'collect';
      readonly label: string;
      readonly items: readonly QuestItemRequirement[];
      readonly consumeOnTurnIn?: boolean;
    }
  | {
      readonly id: string;
      readonly kind: 'talk';
      readonly label: string;
      readonly npcIds: readonly bigint[];
      readonly count: number;
    }
  | {
      readonly id: string;
      readonly kind: 'action';
      readonly label: string;
      readonly actionKind: string;
      readonly count: number;
    }
  | {
      readonly id: string;
      readonly kind: 'statistic';
      readonly label: string;
      readonly statisticKind: string;
      readonly subjectKind: string;
      readonly count: bigint;
    };

export interface QuestRewardDefinition {
  readonly bronze: bigint;
  readonly experience: readonly { readonly track: string; readonly amount: bigint }[];
  readonly items: readonly QuestItemRequirement[];
}

export interface QuestDefinition {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly giverNpcId: bigint;
  readonly objectives: readonly QuestObjectiveDefinition[];
  readonly rewards: QuestRewardDefinition;
  /** Quest-owned carried items removed when the player abandons the quest.
   * Ordinary collected materials must not be listed here. */
  readonly abandonRemovesItems?: readonly QuestItemRequirement[];
}

export interface QuestProgressSource {
  readonly statistic: (statisticKind: string, subjectKind: string) => bigint;
  readonly itemCount: (itemKind: string) => number;
}

export interface QuestObjectiveComponentProgress {
  readonly label: string;
  readonly current: bigint;
  readonly target: bigint;
}

export interface QuestObjectiveProgress {
  readonly complete: boolean;
  readonly components: readonly QuestObjectiveComponentProgress[];
}

export const MARLOW_BOOK_QUEST_ID = 'marlow_important_book';
export const MARLOW_BOOK_ACTION = 'recover_marlow_important_book';

export const QUEST_DEFINITIONS = {
  [MARLOW_BOOK_QUEST_ID]: {
    id: MARLOW_BOOK_QUEST_ID,
    title: 'A Very Important Book',
    summary: 'Fetch the very important book from the table inside Marlow\'s tent.',
    giverNpcId: 2n,
    objectives: [
      {
        id: 'recover_book',
        kind: 'collect',
        label: 'Pick up the book from Marlow\'s table',
        items: [{ itemKind: 'marlow_book', count: 1 }],
        consumeOnTurnIn: true,
      },
    ],
    rewards: {
      bronze: BRONZE_PER_GOLD,
      experience: [{ track: 'explorer', amount: 100n }],
      // Marlow takes the physical book during hand-in and gives that same
      // inventory item back after admitting he has already read it.
      items: [{ itemKind: 'marlow_book', count: 1 }],
    },
    abandonRemovesItems: [{ itemKind: 'marlow_book', count: 1 }],
  },
} as const satisfies Readonly<Record<string, QuestDefinition>>;

export type QuestId = keyof typeof QUEST_DEFINITIONS;

function validateItemRequirements(
  requirements: readonly QuestItemRequirement[],
  path: string,
): string[] {
  const errors: string[] = [];
  if (requirements.length === 0) errors.push(`${path} must contain at least one item`);
  const kinds = new Set<string>();
  for (const [index, requirement] of requirements.entries()) {
    const itemPath = `${path}[${index}]`;
    if (requirement.itemKind.trim().length === 0) errors.push(`${itemPath}.itemKind must not be empty`);
    if (!Number.isSafeInteger(requirement.count) || requirement.count <= 0) {
      errors.push(`${itemPath}.count must be a positive safe integer`);
    }
    if (kinds.has(requirement.itemKind)) errors.push(`${path} repeats item ${requirement.itemKind}`);
    kinds.add(requirement.itemKind);
  }
  return errors;
}

/** Definition-time guard used by registry tests so adding content cannot weaken
 * the authoritative quest contract with malformed counts or ambiguous ids. */
export function validateQuestDefinition(definition: QuestDefinition): readonly string[] {
  const errors: string[] = [];
  if (definition.id.trim().length === 0) errors.push('id must not be empty');
  if (definition.title.trim().length === 0) errors.push('title must not be empty');
  if (definition.giverNpcId <= 0n) errors.push('giverNpcId must be positive');
  if (definition.objectives.length === 0) errors.push('objectives must not be empty');
  const objectiveIds = new Set<string>();
  for (const objective of definition.objectives) {
    const path = `objective ${objective.id || '<empty>'}`;
    if (objective.id.trim().length === 0) errors.push(`${path} id must not be empty`);
    if (objectiveIds.has(objective.id)) errors.push(`duplicate objective id ${objective.id}`);
    objectiveIds.add(objective.id);
    if (objective.label.trim().length === 0) errors.push(`${path} label must not be empty`);
    if (objective.kind === 'collect') {
      errors.push(...validateItemRequirements(objective.items, `${path}.items`));
    } else if (objective.kind === 'location') {
      if (!Number.isInteger(objective.spaceId) || objective.spaceId < 0 || objective.spaceId > 0xffff) {
        errors.push(`${path}.spaceId must be a u16`);
      }
      if (![objective.x, objective.y].every(Number.isSafeInteger)) {
        errors.push(`${path} position must use safe fixed-point integers`);
      }
      if (!Number.isSafeInteger(objective.radiusFixed) || objective.radiusFixed <= 0) {
        errors.push(`${path}.radiusFixed must be a positive safe integer`);
      }
    } else if (objective.kind === 'talk') {
      if (objective.npcIds.length === 0 || objective.npcIds.some((npcId) => npcId <= 0n)) {
        errors.push(`${path}.npcIds must contain positive NPC ids`);
      }
      if (new Set(objective.npcIds).size !== objective.npcIds.length) {
        errors.push(`${path}.npcIds must not contain duplicates`);
      }
      if (!Number.isSafeInteger(objective.count) || objective.count <= 0) {
        errors.push(`${path}.count must be a positive safe integer`);
      }
    } else if (objective.kind === 'action') {
      if (objective.actionKind.trim().length === 0) errors.push(`${path}.actionKind must not be empty`);
      if (!Number.isSafeInteger(objective.count) || objective.count <= 0) {
        errors.push(`${path}.count must be a positive safe integer`);
      }
    } else {
      if (objective.statisticKind.trim().length === 0) errors.push(`${path}.statisticKind must not be empty`);
      if (objective.count <= 0n) errors.push(`${path}.count must be positive`);
    }
  }
  if (definition.rewards.bronze < 0n) errors.push('rewards.bronze must not be negative');
  if (definition.abandonRemovesItems !== undefined) {
    errors.push(...validateItemRequirements(definition.abandonRemovesItems, 'abandonRemovesItems'));
    for (const item of definition.abandonRemovesItems) {
      if (!isUniqueQuestItemKind(item.itemKind)) {
        errors.push(`abandonRemovesItems item ${item.itemKind} must be tagged as a unique quest item`);
      }
    }
  }
  for (const [index, reward] of definition.rewards.experience.entries()) {
    if (reward.track.trim().length === 0) errors.push(`rewards.experience[${index}].track must not be empty`);
    if (reward.amount <= 0n) errors.push(`rewards.experience[${index}].amount must be positive`);
  }
  errors.push(...validateItemRequirements(definition.rewards.items, 'rewards.items').filter(
    (error) => definition.rewards.items.length > 0 || !error.includes('at least one item'),
  ));
  return errors;
}

export function questDefinition(questId: string): QuestDefinition | null {
  return Object.prototype.hasOwnProperty.call(QUEST_DEFINITIONS, questId)
    ? QUEST_DEFINITIONS[questId as QuestId]
    : null;
}

/** Resolves the owning quest for a protected artifact. A future destroy flow
 * must show a confirmation and abandon this quest in the same transaction;
 * ordinary objective materials intentionally return null. */
export function questDefinitionForUniqueItem(itemKind: string): QuestDefinition | null {
  if (!isUniqueQuestItemKind(itemKind)) return null;
  return Object.values(QUEST_DEFINITIONS).find((definition) => (
    definition.abandonRemovesItems?.some((item) => item.itemKind === itemKind) === true
  )) ?? null;
}

export function questCounterKey(questId: string, objective: QuestObjectiveDefinition): {
  readonly statisticKind: string;
  readonly subjectKind: string;
} | null {
  if (objective.kind === 'action') {
    return { statisticKind: 'quest_actions', subjectKind: objective.actionKind };
  }
  if (objective.kind === 'location') {
    return { statisticKind: 'quest_locations_reached', subjectKind: `${questId}:${objective.id}` };
  }
  if (objective.kind === 'statistic') {
    return { statisticKind: objective.statisticKind, subjectKind: objective.subjectKind };
  }
  return null;
}

export function questAcceptBaselines(
  definition: QuestDefinition,
  source: QuestProgressSource,
): Readonly<Record<string, bigint>> {
  return Object.fromEntries(definition.objectives.map((objective) => {
    const counter = questCounterKey(definition.id, objective);
    if (counter !== null) return [objective.id, source.statistic(counter.statisticKind, counter.subjectKind)];
    if (objective.kind === 'talk') {
      return [objective.id, objective.npcIds.reduce(
        (sum, npcId) => sum + source.statistic('quest_npc_talks', npcId.toString()),
        0n,
      )];
    }
    return [objective.id, 0n];
  }));
}

function counterProgress(current: bigint, baseline: bigint, target: bigint, label: string): QuestObjectiveProgress {
  const progress = current > baseline ? current - baseline : 0n;
  return {
    complete: progress >= target,
    components: [{ label, current: progress > target ? target : progress, target }],
  };
}

export function questObjectiveProgress(
  definition: QuestDefinition,
  objective: QuestObjectiveDefinition,
  baseline: bigint,
  source: QuestProgressSource,
): QuestObjectiveProgress {
  if (objective.kind === 'collect') {
    const components = objective.items.map((item) => ({
      label: item.itemKind,
      current: BigInt(Math.min(item.count, Math.max(0, source.itemCount(item.itemKind)))),
      target: BigInt(item.count),
    }));
    return { complete: components.every((component) => component.current >= component.target), components };
  }
  if (objective.kind === 'talk') {
    const total = objective.npcIds.reduce(
      (sum, npcId) => sum + source.statistic('quest_npc_talks', npcId.toString()),
      0n,
    );
    return counterProgress(total, baseline, BigInt(objective.count), objective.label);
  }
  const counter = questCounterKey(definition.id, objective);
  if (counter === null) return { complete: false, components: [] };
  const target = objective.kind === 'statistic' ? objective.count : 1n * BigInt(objective.kind === 'action' ? objective.count : 1);
  return counterProgress(source.statistic(counter.statisticKind, counter.subjectKind), baseline, target, objective.label);
}

export function questIsComplete(
  definition: QuestDefinition,
  baselines: Readonly<Record<string, bigint>>,
  source: QuestProgressSource,
): boolean {
  return definition.objectives.every((objective) => questObjectiveProgress(
    definition,
    objective,
    baselines[objective.id] ?? 0n,
    source,
  ).complete);
}

export function questLocationContains(
  objective: Extract<QuestObjectiveDefinition, { readonly kind: 'location' }>,
  position: { readonly spaceId: number; readonly x: number; readonly y: number },
): boolean {
  if (position.spaceId !== objective.spaceId) return false;
  const dx = position.x - objective.x;
  const dy = position.y - objective.y;
  return dx * dx + dy * dy <= objective.radiusFixed * objective.radiusFixed;
}

export function questLocationAtTile(
  id: string,
  label: string,
  spaceId: number,
  tileX: number,
  tileY: number,
  radiusTiles: number,
): Extract<QuestObjectiveDefinition, { readonly kind: 'location' }> {
  return {
    id,
    kind: 'location',
    label,
    spaceId,
    x: tileX * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2,
    y: tileY * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2,
    radiusFixed: radiusTiles * TILE_SIZE_FIXED,
  };
}
