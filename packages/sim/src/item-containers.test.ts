import { describe, expect, it } from 'vitest';
import { craftItem, moveItemStacks, slotAcceptsItem } from './item-containers.js';
import { MOVE_RULE_FIXTURES } from './item-containers.fixtures.js';

describe('shared container stacking rules', () => {
  for (const fixture of MOVE_RULE_FIXTURES) {
    it(fixture.name, () => {
      const result = moveItemStacks(fixture.containers, fixture.request);
      if (!result.ok) {
        expect(result).toMatchObject(fixture.expected);
        return;
      }
      expect({ ...result, slots: result.containers[fixture.request.toContainer]?.slots }).toMatchObject(fixture.expected);
    });
  }

  it('checks restrictions from item tags', () => {
    const hand = { id: 'hand', capacity: 1, slots: [null], restrictions: { 0: { requiredTags: ['item.tool'] } } } as const;
    expect(slotAcceptsItem(hand, 0, 'axe')).toBe(true);
    expect(slotAcceptsItem(hand, 0, 'wood')).toBe(false);
  });

  it('does not mutate authoritative input snapshots', () => {
    const containers = { bag: { id: 'bag', capacity: 2, slots: [{ itemKind: 'wood', quantity: 4 }, null] } } as const;
    moveItemStacks(containers, { fromContainer: 'bag', fromIndex: 0, toContainer: 'bag', toIndex: 1, quantity: 2 });
    expect(containers.bag.slots).toEqual([{ itemKind: 'wood', quantity: 4 }, null]);
  });
});

describe('dev crafting recipe', () => {
  it('consumes inputs and inserts output atomically', () => {
    const result = craftItem({
      grid: { id: 'grid', capacity: 4, slots: [{ itemKind: 'wood', quantity: 3 }, null, null, null] },
    }, { recipeId: 'dev_planks', gridContainer: 'grid', resultIndex: 3 });
    expect(result).toMatchObject({
      ok: true,
      crafted: { itemKind: 'plank', quantity: 4 },
      containers: { grid: { slots: [{ itemKind: 'wood', quantity: 1 }, null, null, { itemKind: 'plank', quantity: 4 }] } },
    });
  });

  it('leaves input unchanged when output is blocked', () => {
    const containers = {
      grid: { id: 'grid', capacity: 2, slots: [{ itemKind: 'wood', quantity: 2 }, { itemKind: 'stone', quantity: 1 }] },
    } as const;
    expect(craftItem(containers, { recipeId: 'dev_planks', gridContainer: 'grid', resultIndex: 1 }))
      .toEqual({ ok: false, code: 'recipe_output_blocked' });
    expect(containers.grid.slots[0]?.quantity).toBe(2);
  });
});
