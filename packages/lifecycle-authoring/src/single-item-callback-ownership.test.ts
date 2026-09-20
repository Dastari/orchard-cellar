import { readFileSync } from 'node:fs';
import {
  AUTHORED_ITEM_LIFECYCLE_METADATA,
  AUTHORED_ITEM_LIFECYCLE_REGISTRATIONS,
} from '../generated/item-lifecycles.js';
import type { Handler, ReadOnlySnapshot } from '@orchard/sim';
import { describe, expect, it } from 'vitest';

interface SourceBundle {
  readonly revision: number;
  readonly handlers: readonly {
    readonly itemId: string;
    readonly id: string;
    readonly triggers?: readonly string[];
    readonly source: string;
  }[];
}

const source = JSON.parse(readFileSync(
  new URL('../source/bootstrap-item-on-use.source.json', import.meta.url),
  'utf8',
)) as SourceBundle;

describe('single authored item callback ownership', () => {
  it('keeps at most one TypeScript onUse callback per authored item', () => {
    const byItem = new Map<string, string[]>();
    for (const handler of source.handlers) {
      const ids = byItem.get(handler.itemId) ?? [];
      ids.push(handler.id);
      byItem.set(handler.itemId, ids);
    }
    expect([...byItem].filter(([, ids]) => ids.length > 1)).toEqual([]);
  });

  it('uses bounded hunger and repair capabilities with generic authored statistics', () => {
    const authored = source.handlers.map(({ source: handlerSource }) => handlerSource).join('\n');
    expect(authored.match(/context\.player\.restoreHunger\(restored\)/gu)).toHaveLength(29);
    expect(authored.match(/kind: 'food_eaten'/gu)).toHaveLength(29);
    expect(authored.match(/context\.item\.repair\(\)/gu)).toHaveLength(39);
    expect(authored.match(/kind: 'tools_repaired'/gu)).toHaveLength(39);
    expect(authored.match(/statistic: 'orchard_tea_consumed'/gu)).toHaveLength(1);
    expect(authored).not.toContain("context.item.applyEffect('hunger'");
    expect(authored).not.toContain("context.item.applyEffect('repair_selected'");
    expect(authored.match(/context\.item\.applyEffect\('fruitful_energy'\)/gu)).toHaveLength(29);
    expect(authored.match(/context\.item\.applyEffect\('orchard_tea'\)/gu)).toHaveLength(1);
  });

  it('merges hoe and watering-can farm and repair lanes without semantic drift', () => {
    expect(source.revision).toBe(16);
    for (const itemId of ['item:hoe', 'item:watering_can']) {
      const handlers = source.handlers.filter((handler) => handler.itemId === itemId);
      expect(handlers, itemId).toHaveLength(1);
      expect(handlers[0]?.triggers).toEqual(itemId === 'item:hoe' ? ['secondary', 'useWith', 'place'] : ['useWith', 'place']);
      expect(handlers[0]?.source).toContain("context.event.type === 'place'");
      expect(handlers[0]?.source).toContain("context.event.type === 'useWith'");
      expect(handlers[0]?.source).toContain("context.snapshot.target.definitionId !== 'object:anvil'");
      expect(handlers[0]?.source).toContain('context.item.repair()');
      expect(handlers[0]?.source).toContain("kind: 'tools_repaired'");
      expect(handlers[0]?.source).toContain('context.player.consumeItem(material)');
      expect(handlers[0]?.source).toContain('context.emit({ chargeBronze: cost })');
    }
    expect(source.handlers.find(({ itemId }) => itemId === 'item:hoe')?.source)
      .toContain("context.event.actionId === 'restore' ? 'restore' : 'use'");
    expect(source.handlers.find(({ itemId }) => itemId === 'item:watering_can')?.source)
      .toContain("farmTool: { action: 'use'");
  });

  it('executes the exact farm and repair effects while retaining each primary prompt', () => {
    const tile = { spaceId: 'space:test', x: 4, y: 5 } as const;
    const anvil = {
      entityType: 'object' as const, id: 'anvil:1', definitionId: 'object:anvil',
      tags: ['station.anvil'], tile: { ...tile, tags: [] }, state: {},
    };
    const base = {
      tick: 1n,
      registry: { engineVersion: 1, revision: 9n, contentHash: 'test', definitions: {} },
      space: { id: 'space:test', kind: 'overworld', tags: [] },
      calendar: { minuteOfDay: 0, season: 'spring' },
      actor: {
        entityType: 'player', id: 'player:test', tags: [],
        tile: { spaceId: 'space:test', x: 0, y: 0, tags: [] }, bronze: 100n,
        vitals: { hunger: 5_000, vigour: 10_000 }, inventory: [], worldRoles: [],
        homesteadRoles: {}, questStates: {}, statistics: {}, skillRanks: {},
      },
      nearbyObjects: [],
    } satisfies Omit<ReadOnlySnapshot, 'selectedItem' | 'target'>;
    const run = (id: string, event: Parameters<Handler>[0], view: ReadOnlySnapshot) => {
      const registration = AUTHORED_ITEM_LIFECYCLE_REGISTRATIONS.find((entry) => entry.id === id);
      if (registration === undefined) throw new Error(`missing registration ${id}`);
      return (registration.handler as Handler)(event, view);
    };
    for (const fixture of [
      { kind: 'hoe', material: 'wood', prompt: 'USE HOE', action: 'restore' as const },
      { kind: 'watering_can', material: 'stone', prompt: 'WATER', action: 'use' as const },
    ]) {
      const itemId = `item:${fixture.kind}`;
      expect(AUTHORED_ITEM_LIFECYCLE_METADATA.filter((entry) => entry.itemId === itemId))
        .toEqual([expect.objectContaining({
          id: `${itemId}.on_use`, prompt: fixture.prompt, triggers: fixture.kind === 'hoe' ? ['secondary', 'useWith', 'place'] : ['useWith', 'place'],
        })]);
      const selectedItem = {
        kind: fixture.kind, definitionId: itemId, tags: ['item.tool'], count: 1, durability: 100,
        state: { repairMaximum: 200, repairMaterial: fixture.material, repairCostBronze: 5 },
      } as const;
      expect(run(`${itemId}.on_use.place`, {
        type: 'place', actor: { entityType: 'player', id: 'player:test' },
        subject: { kind: fixture.kind }, tile, actionId: fixture.action,
      }, { ...base, selectedItem, target: { ...tile, tags: [] } })).toEqual({
        effects: [{ farmTool: { action: fixture.action, at: tile } }],
      });
      expect(run(`${itemId}.on_use.useWith`, {
        type: 'useWith', actor: { entityType: 'player', id: 'player:test' },
        selectedItem: { kind: fixture.kind },
        target: { entityType: 'object', id: anvil.id, definitionId: anvil.definitionId },
      }, { ...base, selectedItem, target: anvil })).toEqual({ effects: [
        { consumeItem: { kind: fixture.material, count: 1 } },
        { chargeBronze: 5 },
        { repairSelected: true },
        { statistic: { kind: 'tools_repaired', subject: fixture.kind } },
      ] });
    }
  });
});
