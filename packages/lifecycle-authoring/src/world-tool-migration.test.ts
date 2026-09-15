import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseLifecycleSourceBundle } from './contract.js';
import { bootstrapContentRegistry, type Handler, type ReadOnlySnapshot } from '@orchard/sim';
import { AUTHORED_ITEM_LIFECYCLE_REGISTRATIONS } from '../generated/item-lifecycles.js';

const source = parseLifecycleSourceBundle(JSON.parse(readFileSync(
  new URL('../source/bootstrap-item-on-use.source.json', import.meta.url),
  'utf8',
)) as unknown);
const metadata = JSON.parse(readFileSync(
  new URL('../generated/item-lifecycle-metadata.json', import.meta.url),
  'utf8',
)) as { readonly handlers: readonly {
  readonly itemId: string;
  readonly id: string;
  readonly triggers: readonly string[];
}[] };

describe('authored axe and pickaxe lifecycle migration', () => {
  it('executes every material variant through its reviewed callback with exact active repair metadata', () => {
    const registry = bootstrapContentRegistry();
    const actor = { entityType: 'player', id: 'player:test' } as const;
    const tile = { spaceId: 'space:test', x: 1, y: 1, tags: [] } as const;
    const target = { entityType: 'object', id: 'anvil:1', definitionId: 'object:anvil', tags: ['station.anvil'], tile, state: {} } as const;
    for (const material of ['wood', 'stone', 'copper', 'gold', 'silver', 'iron']) {
      for (const tool of ['axe', 'pickaxe', 'hoe', 'shovel']) {
        const kind = material === 'wood' ? tool : `${material}_${tool}`;
        const item = registry.items.get(`item:${kind}`)!;
        const durability = item.durability!;
        const handler = AUTHORED_ITEM_LIFECYCLE_REGISTRATIONS.find((registration) => registration.id.startsWith(`${item.id}.`) && registration.id.endsWith('.useWith'))?.handler as Handler | undefined;
        expect(handler, item.id).toBeDefined();
        const snapshot: ReadOnlySnapshot = {
          tick: 1n, registry: { engineVersion: 1, revision: 11n, contentHash: 'active', definitions: {} },
          space: { id: tile.spaceId, kind: 'overworld', tags: [] },
          calendar: { minuteOfDay: 0, season: 'spring' }, nearbyObjects: [], target,
          actor: { ...actor, tags: [], tile, bronze: 100n, vitals: { hunger: 5_000, vigour: 10_000 }, inventory: [], worldRoles: [], homesteadRoles: {}, questStates: {}, statistics: {}, skillRanks: {} },
          selectedItem: { kind, definitionId: item.id, tags: item.tags, count: 1, durability: 1,
            state: { repairMaximum: durability.max, repairMaterial: durability.repairMaterial.slice(5), repairCostBronze: durability.repairCost } },
        };
        expect(handler!({ type: 'useWith', actor, selectedItem: { kind }, target }, snapshot)).toEqual({ effects: [
          { consumeItem: { kind: durability.repairMaterial.slice(5), count: 1 } },
          { chargeBronze: durability.repairCost }, { repairSelected: true },
          { statistic: { kind: 'tools_repaired', subject: kind } },
        ] });
      }
    }
  });

  it('owns each tool through one callback shared with anvil repair', () => {
    const axe = source.handlers.filter(({ itemId }) => itemId === 'item:axe');
    const pickaxe = source.handlers.filter(({ itemId }) => itemId === 'item:pickaxe');
    expect(axe).toHaveLength(1);
    expect(pickaxe).toHaveLength(1);
    expect(axe[0]?.id).toBe('item:axe.world_tool');
    expect(axe[0]?.triggers).toEqual(['secondary', 'useWith']);
    expect(pickaxe[0]?.id).toBe('item:pickaxe.world_tool');
    expect(pickaxe[0]?.triggers).toEqual(['secondary', 'useWith', 'useAt']);
    for (const handler of [...axe, ...pickaxe]) {
      expect(handler.source).toContain("worldTool: { action: 'swing' }");
      expect(handler.source).toContain("worldTool: { action: 'target' }");
      expect(handler.source).toContain("target.definitionId === 'object:anvil'");
      expect(handler.source).toContain('context.item.repair()');
      expect(handler.source).toContain("kind: 'tools_repaired'");
      expect(handler.source).not.toMatch(/ctx\.|\.db\./u);
    }
    expect(pickaxe[0]?.source).toContain("context.event.type === 'useAt'");
    expect(pickaxe[0]?.source).toContain("context.event.actionId !== 'dig_cellar'");
    expect(pickaxe[0]?.source).toContain("worldTool: { action: 'digCellar', at: targetTile }");
  });

  it('publishes the exact trigger capabilities as code-free client metadata', () => {
    const axe = metadata.handlers.filter(({ itemId }) => itemId === 'item:axe');
    const pickaxe = metadata.handlers.filter(({ itemId }) => itemId === 'item:pickaxe');
    expect(axe).toEqual([expect.objectContaining({
      id: 'item:axe.world_tool', triggers: ['secondary', 'useWith'],
    })]);
    expect(pickaxe).toEqual([expect.objectContaining({
      id: 'item:pickaxe.world_tool', triggers: ['secondary', 'useWith', 'useAt'],
    })]);
  });
});

it('dispatches every authored swinging item without a target', () => {
  const registry = bootstrapContentRegistry();
  const actor = { entityType: 'player', id: 'player:test' } as const;
  for (const item of registry.items.values()) {
    if (!item.equip?.avatarAction?.startsWith('swing_')) continue;
    const kind = item.id.slice(5);
    const handler = AUTHORED_ITEM_LIFECYCLE_REGISTRATIONS.find(entry => entry.id.startsWith(`${item.id}.`) && entry.id.endsWith('.secondary'))?.handler as Handler | undefined;
    expect(handler, item.id).toBeDefined();
    // Secondary swings must not consult a target or cursor snapshot.
    const tile = { spaceId: 'space:test', x: 1, y: 1, tags: [] } as const;
    const snapshot: ReadOnlySnapshot = {
      tick: 1n, registry: { engineVersion: 1, revision: 15n, contentHash: 'active', definitions: {} },
      space: { id: tile.spaceId, kind: 'overworld', tags: [] },
      calendar: { minuteOfDay: 0, season: 'spring' }, nearbyObjects: [],
      actor: { ...actor, tags: [], tile, bronze: 100n, vitals: { hunger: 5_000, vigour: 10_000 }, inventory: [], worldRoles: [], homesteadRoles: {}, questStates: {}, statistics: {}, skillRanks: {} },
      selectedItem: { kind, definitionId: item.id, tags: item.tags, count: 1, durability: 1, state: {} },
    };
    expect(handler!({ type: 'secondary', actor, selectedItem: { kind } }, snapshot), item.id)
      .toEqual({ effects: [{ worldTool: { action: 'swing' } }] });
  }
});
