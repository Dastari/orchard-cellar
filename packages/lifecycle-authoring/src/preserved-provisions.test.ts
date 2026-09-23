import { describe, expect, it } from 'vitest';
import { bootstrapContentRegistry, restoreHunger, runtimeFoodRestoreCenti, type Handler, type ReadOnlySnapshot } from '@orchard/sim';
import { AUTHORED_ITEM_LIFECYCLE_METADATA, AUTHORED_ITEM_LIFECYCLE_REGISTRATIONS } from '../generated/item-lifecycles.js';

// wiki: Systems/Food & Alchemy: preserved provisions restore ten more Hunger than raw crops;
// wheat/sunflower use the documented 14-point prepared-grain portion.
const portions = {
  beetroot: 1700, cabbage: 1900, carrot: 1600, corn: 1800, cucumber: 1500,
  garlic: 1300, grape: 1500, green_pepper: 1500, hot_pepper: 1300, leek: 1600,
  onion: 1500, parsley: 1200, potato: 1700, pumpkin: 2200, red_pepper: 1500,
  strawberry: 1600, sunflower: 1400, tomato: 1500, turnip: 1600, watermelon: 2300,
  wheat: 1400, yellow_pepper: 1500,
} as const;
const registry = bootstrapContentRegistry();
const snapshot = {
  tick: 1n, registry: { engineVersion: 1, revision: 1n, contentHash: 'test', definitions: {} },
  space: { id: 'space:test', kind: 'overworld', tags: [] },
  calendar: { minuteOfDay: 0, season: 'spring' },
  actor: {
    entityType: 'player', id: 'player:test', tags: [],
    tile: { spaceId: 'space:test', x: 0, y: 0, tags: [] }, bronze: 0n,
    vitals: { hunger: 5000, vigour: 10000 }, inventory: [], worldRoles: [],
    homesteadRoles: {}, questStates: {}, statistics: {}, skillRanks: {},
  }, nearbyObjects: [],
} satisfies ReadOnlySnapshot;

function eat(kind: string, hunger: number, foodRestoreCenti?: number) {
  const registration = AUTHORED_ITEM_LIFECYCLE_REGISTRATIONS.find(entry => entry.id === `item:${kind}.on_use`);
  if (!registration) throw new Error(`missing provision callback: ${kind}`);
  return (registration.handler as Handler)({
    type: 'secondary', actor: { entityType: 'player', id: 'player:test' }, selectedItem: { kind },
  }, {
    ...snapshot, actor: { ...snapshot.actor, vitals: { hunger, vigour: 10000 } },
    selectedItem: { kind, definitionId: `item:${kind}`, tags: ['item.food', 'item.preserved'], count: 1,
      state: foodRestoreCenti === undefined ? {} : { foodRestoreCenti } },
  });
}

describe('preserving supplies outdoor provisions', () => {
  it('covers every preserved crop using its actual compiled player action', () => {
    const actual = [...registry.items.values()].filter(item => item.tags.includes('item.preserved'));
    expect(actual.map(item => item.id).sort()).toEqual(Object.keys(portions).map(crop => `item:preserved_${crop}`).sort());
    for (const [crop, amount] of Object.entries(portions)) {
      const kind = `preserved_${crop}`;
      expect(runtimeFoodRestoreCenti(registry, kind), kind).toBe(amount);
      expect(AUTHORED_ITEM_LIFECYCLE_METADATA.find(entry => entry.itemId === `item:${kind}`))
        .toMatchObject({ prompt: `EAT ${registry.items.get(`item:${kind}`)!.displayName.toUpperCase()}` });
      expect(eat(kind, 5000, amount), kind).toEqual({ effects: [
        { consumeSelected: 1 }, { restoreHunger: amount },
        { statistic: { kind: 'food_eaten', subject: kind } },
      ] });
      expect(eat(kind, 10000, amount), kind).toEqual({ blocked: 'hunger_full' });
      expect(eat(kind, 5000), kind).toEqual({ blocked: 'item_food_state_unavailable' });
    }
  });

  it('crosses the low-hunger work penalty and caps recovery without adding fruit buffs', () => {
    expect(restoreHunger({ hungerCenti: 2000, hungerUpdatedTick: 0n }, portions.carrot).hungerCenti).toBe(3600);
    expect(restoreHunger({ hungerCenti: 9900, hungerUpdatedTick: 0n }, portions.carrot).hungerCenti).toBe(10000);
    const result = eat('preserved_grape', 5000, portions.grape);
    expect('effects' in result && result.effects.some(effect => 'applyEffect' in effect)).toBe(false);
  });
});
