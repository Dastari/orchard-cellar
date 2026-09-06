import { describe, expect, it } from 'vitest';
import {
  questAcceptBaselines,
  questDefinition,
  questDefinitionFromContent,
  runtimeQuestDefinition,
  questIsComplete,
  questDefinitionForUniqueItem,
  questLocationAtTile,
  questLocationContains,
  questObjectiveProgress,
  QUEST_DEFINITIONS,
  validateQuestDefinition,
  type QuestDefinition,
  type QuestProgressSource,
} from './quests.js';
import { BRONZE_PER_SILVER } from './commerce.js';
import { TILE_SIZE_FIXED } from './state.js';
import { bootstrapContentRows } from './content/bootstrap-registry.js';
import { buildContentRegistry } from './content/registry.js';

const definitions = Object.values(QUEST_DEFINITIONS);
const marlowBook = definitions.find((definition) => definition.world?.surfaceItemsOnAccept !== undefined)!;
const firstBottle = definitions.find((definition) => (
  definition.objectives.some((objective) => objective.kind === 'statistic'
    && objective.statisticKind === 'bottles_produced')
))!;
const bobStrawberries = definitions.find((definition) => (
  definition.acceptItems?.some(({ itemKind }) => itemKind === 'bob_fast_strawberry_seeds')
))!;
const fishingLesson = definitions.find((definition) => definition.world?.personalResource !== undefined)!;

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

  it('projects quest authority from a published live revision', () => {
    const rows = bootstrapContentRows().map((row) => row.id !== `quest:${marlowBook.id}` ? row : {
      ...row,
      json: JSON.stringify({
        ...(JSON.parse(String(row.json)) as object), title: 'Published title',
      }),
    });
    const registry = buildContentRegistry(rows).registry;
    expect(runtimeQuestDefinition(registry, marlowBook.id)?.title).toBe('Published title');
    expect(runtimeQuestDefinition(registry, 'missing')).toBeNull();
  });

  it('requires Marlow\'s physical book to remain in carried inventory', () => {
    const definition = questDefinition(marlowBook.id)!;
    expect(definition.abandonRemovesItems).toEqual([{ itemKind: 'marlow_book', count: 1 }]);
    const before = source();
    const baselines = questAcceptBaselines(definition, before);
    expect(questIsComplete(definition, baselines, before)).toBe(false);
    expect(questIsComplete(definition, baselines, source({}, { marlow_book: 1 }))).toBe(true);
    expect(questDefinitionForUniqueItem('marlow_book')?.id).toBe(marlowBook.id);
    expect(questDefinitionForUniqueItem('wood')).toBeNull();
  });

  it('tracks the first Bottle loop from post-accept production and sale counters', () => {
    const definition = questDefinition(firstBottle.id)!;
    expect(definition.prerequisiteQuestIds).toEqual([bobStrawberries.id]);
    expect(definition.rewards.homesteadSizeTier).toBeUndefined();
    const accepted = source({
      'press_cycles_completed:': 9n,
      'bottles_produced:': 2n,
      'items_sold:bottles': 4n,
    });
    const baselines = questAcceptBaselines(definition, accepted);
    expect(questIsComplete(definition, baselines, accepted)).toBe(false);
    expect(questIsComplete(definition, baselines, source({
      'press_cycles_completed:': 12n,
      'bottles_produced:': 3n,
      'items_sold:bottles': 5n,
    }))).toBe(true);
  });

  it('starts Bob\'s farming line with a fast seed and Jane\'s journal reward', () => {
    const definition = questDefinition(bobStrawberries.id)!;
    expect(definition.giverNpcId).toBe(3n);
    expect(definition.acceptItems).toEqual([
      { itemKind: 'bob_fast_strawberry_seeds', count: 6 },
    ]);
    expect(definition.objectives).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'statistic', count: 6n }),
      expect.objectContaining({ kind: 'collect', items: [{ itemKind: 'strawberry', count: 3 }] }),
    ]));
    expect(definition.summary).toContain('outside his protected farm');
    expect(definition.summary).toContain('Any clear overworld ground elsewhere is fine');
    expect(definition.rewards.bronze).toBe(75n * BRONZE_PER_SILVER);
    expect(definition.rewards.items).toContainEqual({ itemKind: 'janes_gardening_book', count: 1 });
  });

  it('gives Fin\'s spare rod and completes only after the exact tutorial catch count', () => {
    const definition = questDefinition(fishingLesson.id)!;
    const target = definition.objectives.find((objective) => objective.kind === 'statistic')!;
    expect(definition.giverNpcId).toBeGreaterThan(0n);
    expect(definition.acceptItems).toEqual([{ itemKind: 'fishing_rod', count: 1 }]);
    expect(definition.rewards.items).toEqual([{ itemKind: 'fishing_handbook', count: 1 }]);
    const accepted = source({ 'fish_caught:raw_fish': 9n });
    const baselines = questAcceptBaselines(definition, accepted);
    expect(questIsComplete(definition, baselines, source({
      'fish_caught:raw_fish': 9n + target.count - 1n,
    }))).toBe(false);
    expect(questIsComplete(definition, baselines, source({
      'fish_caught:raw_fish': 9n + target.count,
    }))).toBe(true);
  });

  it('projects renamed quest, NPC, surface, and personal-resource ids without branches', () => {
    const registry = buildContentRegistry(bootstrapContentRows()).registry;
    const content = registry.quests.get(`quest:${fishingLesson.id}`)!;
    const renamed = {
      ...content,
      id: 'quest:harbour_lesson' as const,
      giver: 'npc:fisherman_fin' as const,
      world: {
        ...content.world,
        personalResource: {
          ...content.world!.personalResource!,
          resourceId: '987654321',
          tileX: 401,
          tileY: 302,
        },
      },
    };
    const projected = questDefinitionFromContent(registry, renamed);
    expect(projected).toMatchObject({
      id: 'harbour_lesson',
      world: { personalResource: { resourceId: 987654321n, tileX: 401, tileY: 302 } },
    });
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
