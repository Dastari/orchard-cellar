import { readFileSync } from 'node:fs';
import {
  bootstrapContentRegistry,
  runtimeCropDefinitionForSeed,
  type Handler,
  type ReadOnlySnapshot,
} from '@orchard/sim';
import { AUTHORED_ITEM_LIFECYCLE_REGISTRATIONS } from '../generated/item-lifecycles.js';
import { describe, expect, it } from 'vitest';
import { parseLifecycleSourceBundle } from './contract.js';

const source = parseLifecycleSourceBundle(JSON.parse(readFileSync(
  new URL('../source/bootstrap-item-on-use.source.json', import.meta.url),
  'utf8',
)) as unknown);
const metadata = JSON.parse(readFileSync(
  new URL('../generated/item-lifecycle-metadata.json', import.meta.url),
  'utf8',
)) as { readonly handlers: readonly { readonly itemId: string; readonly triggers?: readonly string[] }[] };

const EXPECTED_SOURCE = [
  'const targetTile = context.tile;',
  "if (targetTile === undefined) context.block('farm_tile_required');",
  'else context.emit({ plantSeed: targetTile });',
  'context.item.consume();',
].join('\n');

describe('authored seed migration', () => {
  it('gives every live seed item exactly one generated place lifecycle', () => {
    const expected: string[] = [...bootstrapContentRegistry().items.values()]
      .filter((item) => item.retired !== true && item.tags.includes('item.seed'))
      .map((item) => item.id)
      .sort();
    const expectedIds: ReadonlySet<string> = new Set(expected);
    const handlers = source.handlers.filter((handler) => handler.source.includes('plantSeed:'));
    expect(handlers.map((handler) => handler.itemId)).toEqual(expected);
    expect(handlers).toHaveLength(23);
    for (const handler of handlers) {
      expect(handler.event).toBe('onUse');
      expect(handler.triggers).toEqual(['place']);
      expect(handler.prompt).toBe('PLANT SEEDS');
      expect(handler.source).toBe(EXPECTED_SOURCE);
    }
    expect(metadata.handlers
      .filter((handler) => expectedIds.has(handler.itemId)
        && handler.triggers?.includes('place') === true)
      .map((handler) => handler.itemId)).toEqual(expected);
  });

  it("keeps Bob's quest seed on the same authority-owned planting path", () => {
    expect(source.handlers.find(({ itemId }) => itemId === 'item:bob_fast_strawberry_seeds'))
      .toMatchObject({ triggers: ['place'], source: EXPECTED_SOURCE });

    const registration = AUTHORED_ITEM_LIFECYCLE_REGISTRATIONS.find(
      ({ id }) => id === 'item.bob-fast-strawberry-seeds.on-use.place',
    );
    expect(registration).toBeDefined();
    const registry = bootstrapContentRegistry();
    const definition = runtimeCropDefinitionForSeed(registry, 'bob_fast_strawberry_seeds');
    expect(definition).toMatchObject({
      kind: 'bob_fast_strawberry', harvestItemKind: 'strawberry', growthTicks: 600n,
    });
    expect(registry.quests.get('quest:farmer_bob_fast_strawberries')?.objectives)
      .toContainEqual(expect.objectContaining({
        kind: 'statistic', statisticKind: 'crops_harvested', subjectKind: definition?.harvestItemKind,
      }));
    const snapshot: ReadOnlySnapshot = {
      tick: 1n,
      registry: { engineVersion: 1, revision: 1n, contentHash: registry.contentHash, definitions: {} },
      space: { id: '0', kind: 'overworld', tags: [] },
      calendar: { minuteOfDay: 600, season: 'spring' },
      actor: {
        entityType: 'player', id: 'player', tags: [],
        tile: { spaceId: '0', x: 1, y: 1, tags: [] }, bronze: 0n,
        vitals: { hunger: 10_000, vigour: 10_000 }, inventory: [], worldRoles: [],
        homesteadRoles: {}, questStates: {}, statistics: {}, skillRanks: {}, knownRecipeIds: [],
      },
      selectedItem: {
        kind: 'bob_fast_strawberry_seeds',
        definitionId: 'item:bob_fast_strawberry_seeds',
        instanceId: 'hotbar:0', tags: ['item.seed', 'item.quest'], count: 6,
      },
      nearbyObjects: [],
    };
    expect((registration!.handler as Handler)({
      type: 'place', actor: { entityType: 'player', id: 'player' },
      subject: { kind: 'bob_fast_strawberry_seeds' },
      tile: { spaceId: '0', x: 4, y: 5 },
    }, snapshot)).toEqual({ effects: [
      { plantSeed: { spaceId: '0', x: 4, y: 5 } },
      { consumeSelected: 1 },
    ] });
  });
});
