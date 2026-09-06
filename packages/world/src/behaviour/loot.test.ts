import { describe, expect, it } from 'vitest';

import {
  createHandlerRegistry,
  createReadOnlySnapshot,
  effectsResult,
  raiseEvent,
  type Effect,
  type LootContentDefinition,
} from '@orchard/sim';

import type { WorldReducerContext } from '../index.js';
import {
  applyLootDropsBehaviour,
  resolveLifecycleLootEffects,
  type LootAuthorityDependencies,
} from './loot.js';

const identity = { toHexString: () => '01' } as unknown as WorldReducerContext['sender'];
const ctx = {} as WorldReducerContext;

function run(inventoryResults: readonly boolean[], inventoryFirst = false) {
  const inventory: Array<{ itemKind: string; quantity: number }> = [];
  const world: unknown[] = [];
  const statistics: unknown[] = [];
  let insert = 0;
  const dependencies: LootAuthorityDependencies = {
    insertPlayerCarriedItem: (_ctx, itemKind, quantity) => {
      inventory.push({ itemKind, quantity });
      return inventoryResults[insert++] ?? false;
    },
    dropWorldItemStack: (_ctx, drop) => world.push(drop),
    recordPlayerStatistic: (_ctx, _identity, statisticId, delta, authorityTick, context) => {
      statistics.push({ statisticId, delta, authorityTick, context });
    },
  };
  applyLootDropsBehaviour(ctx, [
    { itemKind: 'raw_fish', quantity: 2 },
    { itemKind: 'ruby_piece', quantity: 1 },
  ], {
    x: 100, y: 200, spaceId: 3, authorityTick: 50n,
    recipient: identity, inventoryFirst, reservedUntilTick: 90n,
    horizontalSpacing: 4, recordItemsObtained: true,
  }, dependencies);
  return { inventory, world, statistics };
}

describe('loot authority row adapter', () => {
  it('matches mining world-row fan-out, reservation, and statistic writes', () => {
    expect(run([], false)).toEqual({
      inventory: [],
      world: [
        { itemKind: 'raw_fish', quantity: 2, x: 100, y: 200, droppedAtTick: 50n,
          durability: 0, spaceId: 3, reservedFor: identity, reservedUntilTick: 90n },
        { itemKind: 'ruby_piece', quantity: 1, x: 104, y: 200, droppedAtTick: 50n,
          durability: 0, spaceId: 3, reservedFor: identity, reservedUntilTick: 90n },
      ],
      statistics: [
        { statisticId: 'items_obtained', delta: 2n, authorityTick: 50n, context: 'raw_fish' },
        { statisticId: 'items_obtained', delta: 1n, authorityTick: 50n, context: 'ruby_piece' },
      ],
    });
  });

  it('matches fishing inventory-first delivery and drops only overflow', () => {
    const result = run([true, false], true);
    expect(result.inventory).toEqual([
      { itemKind: 'raw_fish', quantity: 2 },
      { itemKind: 'ruby_piece', quantity: 1 },
    ]);
    expect(result.world).toEqual([
      { itemKind: 'ruby_piece', quantity: 1, x: 104, y: 200, droppedAtTick: 50n,
        durability: 0, spaceId: 3, reservedFor: identity, reservedUntilTick: 90n },
    ]);
    expect(result.statistics).toHaveLength(2);
  });

  it('rejects an invalid authored quantity before a row write', () => {
    const dependencies = {
      insertPlayerCarriedItem: () => true,
      dropWorldItemStack: () => { throw new Error('unexpected write'); },
      recordPlayerStatistic: () => { throw new Error('unexpected write'); },
    } satisfies LootAuthorityDependencies;
    expect(() => applyLootDropsBehaviour(ctx, [{ itemKind: 'wood', quantity: 0 }], {
      x: 0, y: 0, spaceId: 0, authorityTick: 0n,
    }, dependencies)).toThrow('invalid_loot_quantity');
  });
});

describe('lifecycle rollLoot effect adapter', () => {
  const definitions = new Map<string, LootContentDefinition>([['loot:moon_orchard', {
    id: 'loot:moon_orchard',
    kind: 'loot',
    schemaVersion: 1,
    groups: [{
      id: 'authored-fruit',
      conditions: [{ context: { key: 'moonPhase', operator: 'eq', value: 'full' } }],
      entries: [{
        id: 'silver-pear',
        weight: 1,
        target: { item: 'item:silver_pear', min: 2, max: 2 },
      }],
    }],
  }]]);

  it('interprets an arbitrary authored loot semantic selected by a handler', () => {
    const retained = { grantExperience: { skillId: 'foraging', amount: 7 } } as const;
    const target = {
      entityType: 'object' as const,
      id: 'moon-tree-4',
      definitionId: 'resource:moon_tree',
      tags: ['world.resource'],
      tile: { spaceId: 'moon', x: 4, y: 8, tags: [] },
      state: { depleted: true },
    };
    const result = raiseEvent(createHandlerRegistry([{
      id: 'test.break.moon-tree',
      eventType: 'break',
      source: 'target',
      match: { kind: 'definition', definitionId: 'resource:moon_tree' },
      handler: () => effectsResult([
        { rollLoot: { lootId: 'loot:moon_orchard' } },
        retained,
      ]),
    }]), {
      type: 'break',
      actor: { entityType: 'player', id: 'author' },
      object: { entityType: 'object', id: target.id, definitionId: target.definitionId },
      tool: { kind: 'silver_axe' },
    }, createReadOnlySnapshot({
      tick: 8n,
      registry: { engineVersion: 1, revision: 1n, contentHash: 'moon', definitions: {} },
      space: { id: 'moon', kind: 'overworld', tags: [] },
      calendar: { minuteOfDay: 0, season: 'spring' },
      target,
      nearbyObjects: [],
    }));
    if ('blocked' in result) throw new Error(result.blocked);
    expect(resolveLifecycleLootEffects(definitions, result.effects, {
      seedParts: ['arbitrary-authored-loot', 4],
      context: { values: { moonPhase: 'full' } },
    })).toEqual({
      drops: [{ itemKind: 'silver_pear', quantity: 2 }],
      flags: [],
      remainingEffects: [retained],
    });
  });

  it('caps aggregate authored rolls before authority delivery', () => {
    const effects: Effect[] = [
      { rollLoot: { lootId: 'loot:moon_orchard', rolls: 32 } },
      { rollLoot: { lootId: 'loot:moon_orchard', rolls: 1 } },
    ];
    expect(() => resolveLifecycleLootEffects(definitions, effects, {
      seedParts: ['too-many-rolls'],
      context: { values: { moonPhase: 'full' } },
    })).toThrow('lifecycle_loot_roll_cap_exceeded');
  });
});
