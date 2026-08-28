import { describe, expect, it } from 'vitest';
import {
  MARLOW_BOOK_QUEST_ID,
  questAcceptBaselines,
  questDefinition,
  questIsComplete,
  questLocationAtTile,
  questLocationContains,
  questObjectiveProgress,
  QUEST_DEFINITIONS,
  validateQuestDefinition,
  type QuestDefinition,
  type QuestProgressSource,
} from './quests.js';
import { TILE_SIZE_FIXED } from './state.js';

function source(
  statistics: Readonly<Record<string, bigint>> = {},
  items: Readonly<Record<string, number>> = {},
): QuestProgressSource {
  return {
    statistic: (kind, subject) => statistics[`${kind}:${subject}`] ?? 0n,
    itemCount: (kind) => items[kind] ?? 0,
  };
}

describe('quest definitions and progress', () => {
  it('keeps every registered quest structurally safe for authority', () => {
    for (const definition of Object.values(QUEST_DEFINITIONS)) {
      expect(validateQuestDefinition(definition)).toEqual([]);
    }
    expect(questDefinition('not-a-real-quest')).toBeNull();
  });

  it('requires Marlow\'s physical book to remain in carried inventory', () => {
    const definition = questDefinition(MARLOW_BOOK_QUEST_ID)!;
    expect(definition.abandonRemovesItems).toEqual([{ itemKind: 'marlow_book', count: 1 }]);
    const before = source();
    const baselines = questAcceptBaselines(definition, before);
    expect(questIsComplete(definition, baselines, before)).toBe(false);
    expect(questIsComplete(definition, baselines, source({}, { marlow_book: 1 }))).toBe(true);
  });

  it('supports multi-item collection objectives without accepting stale client counts', () => {
    const definition = {
      id: 'supplies', title: 'Supplies', summary: '', giverNpcId: 1n,
      objectives: [{ id: 'collect', kind: 'collect' as const, label: 'Collect supplies', items: [
        { itemKind: 'wood', count: 4 }, { itemKind: 'stone', count: 2 },
      ] }],
      rewards: { bronze: 0n, experience: [], items: [] },
    };
    const progress = questObjectiveProgress(definition, definition.objectives[0]!, 0n, source({}, { wood: 9, stone: 1 }));
    expect(progress.complete).toBe(false);
    expect(progress.components.map(({ current, target }) => [current, target])).toEqual([[4n, 4n], [1n, 2n]]);
  });

  it('supports bounded position/radius objectives', () => {
    const objective = questLocationAtTile('camp', 'Reach camp', 7, 10, 12, 2);
    expect(questLocationContains(objective, {
      spaceId: 7,
      x: objective.x + 2 * TILE_SIZE_FIXED,
      y: objective.y,
    })).toBe(true);
    expect(questLocationContains(objective, { spaceId: 0, x: objective.x, y: objective.y })).toBe(false);
  });

  it('snapshots and advances talk, action, location, and statistic objectives', () => {
    const definition: QuestDefinition = {
      id: 'generic', title: 'Generic', summary: '', giverNpcId: 1n,
      objectives: [
        { id: 'talk', kind: 'talk', label: 'Talk', npcIds: [2n, 3n], count: 2 },
        { id: 'act', kind: 'action', label: 'Act', actionKind: 'wave', count: 3 },
        questLocationAtTile('reach', 'Reach', 7, 2, 4, 1),
        { id: 'stat', kind: 'statistic', label: 'Travel', statisticKind: 'distance', subjectKind: 'walk', count: 5n },
      ],
      rewards: { bronze: 0n, experience: [], items: [] },
    };
    const accepted = source({
      'quest_npc_talks:2': 4n,
      'quest_npc_talks:3': 8n,
      'quest_actions:wave': 10n,
      'quest_locations_reached:generic:reach': 2n,
      'distance:walk': 20n,
    });
    const baselines = questAcceptBaselines(definition, accepted);
    expect(baselines).toEqual({ talk: 12n, act: 10n, reach: 2n, stat: 20n });
    const progressed = source({
      'quest_npc_talks:2': 5n,
      'quest_npc_talks:3': 9n,
      'quest_actions:wave': 13n,
      'quest_locations_reached:generic:reach': 3n,
      'distance:walk': 25n,
    });
    expect(questIsComplete(definition, baselines, progressed)).toBe(true);
  });

  it('rejects malformed content definitions before they can be registered', () => {
    const malformed = {
      id: '', title: '', summary: '', giverNpcId: 0n,
      objectives: [
        { id: 'same', kind: 'collect' as const, label: '', items: [{ itemKind: '', count: 0 }] },
        { id: 'same', kind: 'location' as const, label: 'Reach', spaceId: 70_000, x: 0.5, y: 0, radiusFixed: 0 },
        { id: 'talk', kind: 'talk' as const, label: 'Talk', npcIds: [2n, 2n], count: 0 },
        { id: 'action', kind: 'action' as const, label: 'Act', actionKind: '', count: -1 },
        { id: 'stat', kind: 'statistic' as const, label: 'Stat', statisticKind: '', subjectKind: '', count: 0n },
      ],
      rewards: { bronze: -1n, experience: [{ track: '', amount: 0n }], items: [{ itemKind: 'book', count: 0 }] },
    } satisfies QuestDefinition;
    expect(validateQuestDefinition(malformed).length).toBeGreaterThanOrEqual(14);
  });
});
