import { describe, expect, it } from 'vitest';
import {
  craftItem,
  clickContainerSlot,
  distributeItemStack,
  insertItemStack,
  insertItemStackPartial,
  itemDefinition,
  isUniqueQuestItemKind,
  matchingRecipeId,
  moveItemStacks,
  quickMoveItemStack,
  quickMoveAllMatchingStacks,
  quickCraftCursorStack,
  pickupAllToCursor,
  sortAndStackContainer,
  slotAcceptsItem,
} from './item-containers.js';
import { MOVE_RULE_FIXTURES } from './item-containers.fixtures.js';

describe('shared container stacking rules', () => {
  it('distinguishes protected quest artifacts from ordinary objective materials', () => {
    expect(isUniqueQuestItemKind('marlow_book')).toBe(true);
    expect(isUniqueQuestItemKind('wood')).toBe(false);
    expect(isUniqueQuestItemKind('missing')).toBe(false);
  });

  it('registers stable item quality independently of quest ownership', () => {
    expect(itemDefinition('wood')?.quality).toBe('common');
    expect(itemDefinition('axe')?.quality).toBe('uncommon');
    expect(itemDefinition('sword')?.quality).toBe('rare');
    expect(itemDefinition('ring')?.quality).toBe('epic');
    expect(itemDefinition('homestead_deed')?.quality).toBe('legendary');
    expect(itemDefinition('marlow_book')).toMatchObject({ quality: 'common' });
    expect(isUniqueQuestItemKind('marlow_book')).toBe(true);
  });

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

  it('treats authority-owned output slots as read-only destinations', () => {
    const output = {
      id: 'processor', capacity: 1, slots: [null], restrictions: { 0: { readOnly: true } },
    } as const;
    expect(slotAcceptsItem(output, 0, 'iron_bar')).toBe(false);
  });

  it('stacks every raw ore and rejects ore from tool-only slots', () => {
    const hand = { id: 'hand', capacity: 1, slots: [null], restrictions: { 0: { requiredTags: ['item.tool'] } } } as const;
    for (const itemKind of ['iron_ore', 'copper_ore', 'gold_ore', 'emerald_ore', 'sapphire_ore', 'topaz_ore', 'ruby_ore', 'amethyst_ore']) {
      expect(insertItemStack({ id: 'bag', capacity: 1, slots: [null] }, { itemKind, quantity: 99 })).toMatchObject({ ok: true });
      expect(slotAcceptsItem(hand, 0, itemKind)).toBe(false);
    }
  });

  it('does not mutate authoritative input snapshots', () => {
    const containers = { bag: { id: 'bag', capacity: 2, slots: [{ itemKind: 'wood', quantity: 4 }, null] } } as const;
    moveItemStacks(containers, { fromContainer: 'bag', fromIndex: 0, toContainer: 'bag', toIndex: 1, quantity: 2 });
    expect(containers.bag.slots).toEqual([{ itemKind: 'wood', quantity: 4 }, null]);
  });

  it('sorts and compacts compatible stacks without losing metadata', () => {
    const container = {
      id: 'backpack', capacity: 7,
      slots: [
        { itemKind: 'wood', quantity: 60 },
        { itemKind: 'lantern', quantity: 1, lit: false },
        { itemKind: 'stone', quantity: 4 },
        null,
        { itemKind: 'wood', quantity: 50 },
        { itemKind: 'lantern', quantity: 1, lit: true },
        null,
      ],
    } as const;
    const result = sortAndStackContainer(container);
    expect(result).toMatchObject({
      ok: true,
      outcome: 'sort',
      container: { slots: [
        { itemKind: 'lantern', quantity: 1, lit: true },
        { itemKind: 'lantern', quantity: 1, lit: false },
        { itemKind: 'stone', quantity: 4 },
        { itemKind: 'wood', quantity: 99 },
        { itemKind: 'wood', quantity: 11 },
        null,
        null,
      ] },
    });
    expect(container.slots[0]).toEqual({ itemKind: 'wood', quantity: 60 });
  });

  it('preserves switchable-light state through moves, swaps, and quick moves', () => {
    const containers = {
      hotbar: {
        id: 'hotbar', capacity: 2,
        slots: [{ itemKind: 'lantern', quantity: 1, lit: false }, { itemKind: 'lantern', quantity: 1, lit: true }],
      },
      backpack: { id: 'backpack', capacity: 1, slots: [null] },
    } as const;
    const swapped = moveItemStacks(containers, {
      fromContainer: 'hotbar', fromIndex: 0, toContainer: 'hotbar', toIndex: 1, quantity: 1,
    });
    expect(swapped.ok && swapped.containers.hotbar?.slots.map((stack) => stack?.lit)).toEqual([true, false]);
    const quick = quickMoveItemStack(containers, {
      fromContainer: 'hotbar', fromIndex: 0, toContainers: ['backpack'],
    });
    expect(quick.ok && quick.containers.backpack?.slots[0]?.lit).toBe(false);
  });

  it('splits a pickup across the current stack and free slots', () => {
    const result = insertItemStack({
      id: 'hotbar', capacity: 3, slots: [{ itemKind: 'wood', quantity: 95 }, null, null],
    }, { itemKind: 'wood', quantity: 110 });
    expect(result).toMatchObject({
      ok: true,
      insertedQuantity: 110,
      container: { slots: [{ itemKind: 'wood', quantity: 99 }, { itemKind: 'wood', quantity: 99 }, { itemKind: 'wood', quantity: 7 }] },
    });
  });

  it('rejects a pickup atomically when all maximum stacks cannot hold it', () => {
    const container = { id: 'hotbar', capacity: 2, slots: [{ itemKind: 'wood', quantity: 98 }, null] } as const;
    expect(insertItemStack(container, { itemKind: 'wood', quantity: 101 })).toEqual({ ok: false, code: 'container_full' });
    expect(container.slots).toEqual([{ itemKind: 'wood', quantity: 98 }, null]);
  });

  it('partially drains a safety stack while preserving its exact remainder', () => {
    expect(insertItemStackPartial({
      id: 'hotbar', capacity: 2, slots: [{ itemKind: 'wood', quantity: 98 }, null],
    }, { itemKind: 'wood', quantity: 105 })).toMatchObject({
      ok: true,
      insertedQuantity: 100,
      remainderQuantity: 5,
      container: { slots: [{ itemKind: 'wood', quantity: 99 }, { itemKind: 'wood', quantity: 99 }] },
    });
  });

  it('uses equipment tags as slot acceptance types', () => {
    const equipment = {
      id: 'equipment', capacity: 2, slots: [null, null],
      restrictions: { 0: { requiredTags: ['gear.head'] }, 1: { requiredTags: ['gear.ring'] } },
    } as const;
    expect(slotAcceptsItem(equipment, 0, 'helm')).toBe(true);
    expect(slotAcceptsItem(equipment, 0, 'ring')).toBe(false);
    expect(slotAcceptsItem(equipment, 1, 'ring')).toBe(true);
  });
});

describe('crafting recipes', () => {
  it('consumes inputs and inserts output atomically', () => {
    const result = craftItem({
      grid: { id: 'grid', capacity: 4, slots: [{ itemKind: 'wood', quantity: 3 }, null, null, null] },
    }, { recipeId: 'planks', gridContainer: 'grid', resultIndex: 3 });
    expect(result).toMatchObject({
      ok: true,
      crafted: { itemKind: 'plank', quantity: 4 },
      containers: { grid: { slots: [{ itemKind: 'wood', quantity: 2 }, null, null, { itemKind: 'plank', quantity: 4 }] } },
    });
  });

  it('leaves input unchanged when output is blocked', () => {
    const containers = {
      grid: { id: 'grid', capacity: 2, slots: [{ itemKind: 'wood', quantity: 2 }, { itemKind: 'stone', quantity: 1 }] },
    } as const;
    expect(craftItem(containers, { recipeId: 'planks', gridContainer: 'grid', resultIndex: 1 }))
      .toEqual({ ok: false, code: 'recipe_output_blocked' });
    expect(containers.grid.slots[0]?.quantity).toBe(2);
  });

  it('recognizes the eight-plank chest ring and rejects a filled center', () => {
    const ring = Array.from({ length: 9 }, (_, index) => index === 4 ? null : { itemKind: 'plank', quantity: 1 });
    expect(matchingRecipeId({ id: 'crafting', capacity: 9, slots: ring })).toBe('chest');
    ring[4] = { itemKind: 'plank', quantity: 1 };
    expect(matchingRecipeId({ id: 'crafting', capacity: 9, slots: ring })).toBeNull();
  });

  it('matches a one-item plank recipe anywhere in the crafting grid', () => {
    for (let index = 0; index < 9; index += 1) {
      const slots = Array.from({ length: 9 }, () => null as { itemKind: string; quantity: number } | null);
      slots[index] = { itemKind: 'wood', quantity: 1 };
      expect(matchingRecipeId({ id: 'crafting', capacity: 9, slots })).toBe('planks');
    }
  });

  it('matches vertical sticks at every valid grid offset and consumes the actual cells', () => {
    for (const [top, bottom] of [[0, 3], [1, 4], [2, 5], [3, 6], [4, 7], [5, 8]]) {
      const slots = Array.from({ length: 9 }, () => null as { itemKind: string; quantity: number } | null);
      slots[top!] = { itemKind: 'plank', quantity: 1 };
      slots[bottom!] = { itemKind: 'plank', quantity: 1 };
      expect(matchingRecipeId({ id: 'crafting', capacity: 9, slots })).toBe('sticks');
    }
  });

  it('crafts four arrows from a stick and stone in either position', () => {
    const grid = { id: 'crafting', capacity: 9, slots: [
      null, null, { itemKind: 'stone', quantity: 2 }, null, { itemKind: 'stick', quantity: 1 }, null, null, null, null,
    ] } as const;
    expect(matchingRecipeId(grid)).toBe('arrows');
    expect(craftItem({ grid: { ...grid, capacity: 10, slots: [...grid.slots, null] } }, {
      recipeId: 'arrows', gridContainer: 'grid', resultIndex: 9,
    })).toMatchObject({ ok: true, crafted: { itemKind: 'arrow', quantity: 4 } });
  });
});

describe('Minecraft-style bulk slot gestures', () => {
  it('shift-click merges existing stacks before using empty slots', () => {
    const result = quickMoveItemStack({
      hotbar: { id: 'hotbar', capacity: 1, slots: [{ itemKind: 'wood', quantity: 10 }] },
      backpack: { id: 'backpack', capacity: 2, slots: [{ itemKind: 'wood', quantity: 95 }, null] },
    }, { fromContainer: 'hotbar', fromIndex: 0, toContainers: ['backpack'] });
    expect(result).toMatchObject({
      ok: true,
      movedQuantity: 10,
      containers: { backpack: { slots: [{ itemKind: 'wood', quantity: 99 }, { itemKind: 'wood', quantity: 6 }] } },
    });
  });

  it('shift-drag distributes evenly and gives the remainder to first-visited slots', () => {
    const result = distributeItemStack({
      hotbar: { id: 'hotbar', capacity: 1, slots: [{ itemKind: 'plank', quantity: 10 }] },
      crafting: { id: 'crafting', capacity: 3, slots: [null, null, null] },
    }, {
      fromContainer: 'hotbar', fromIndex: 0,
      targets: [0, 1, 2].map((index) => ({ container: 'crafting', index })),
    });
    expect(result).toMatchObject({
      ok: true,
      containers: {
        hotbar: { slots: [null] },
        crafting: { slots: [
          { itemKind: 'plank', quantity: 4 },
          { itemKind: 'plank', quantity: 3 },
          { itemKind: 'plank', quantity: 3 },
        ] },
      },
    });
  });

  it('shift-double-click transfers all matching stacks without touching other items', () => {
    const result = quickMoveAllMatchingStacks({
      hotbar: { id: 'hotbar', capacity: 3, slots: [
        { itemKind: 'wood', quantity: 60 }, { itemKind: 'stone', quantity: 7 }, { itemKind: 'wood', quantity: 50 },
      ] },
      backpack: { id: 'backpack', capacity: 2, slots: [{ itemKind: 'wood', quantity: 90 }, null] },
      chest: { id: 'chest', capacity: 3, slots: [{ itemKind: 'wood', quantity: 95 }, null, null] },
    }, {
      itemKind: 'wood', fromContainers: ['hotbar', 'backpack'], toContainers: ['chest'],
    });
    expect(result).toMatchObject({
      ok: true,
      movedQuantity: 200,
      containers: {
        hotbar: { slots: [null, { itemKind: 'stone', quantity: 7 }, null] },
        backpack: { slots: [null, null] },
        chest: { slots: [
          { itemKind: 'wood', quantity: 99 },
          { itemKind: 'wood', quantity: 99 },
          { itemKind: 'wood', quantity: 97 },
        ] },
      },
    });
  });
});

describe('Minecraft cursor stack authority', () => {
  const menu = {
    hotbar: { id: 'hotbar', capacity: 3, slots: [{ itemKind: 'wood', quantity: 15 }, null, null] },
    backpack: { id: 'backpack', capacity: 2, slots: [{ itemKind: 'wood', quantity: 90 }, { itemKind: 'stone', quantity: 7 }] },
  } as const;

  it('picks up a whole stack on left click and the larger half on right click', () => {
    expect(clickContainerSlot(menu, null, { container: 'hotbar', index: 0, button: 'left' }))
      .toMatchObject({ ok: true, cursor: { itemKind: 'wood', quantity: 15 }, containers: { hotbar: { slots: [null, null, null] } } });
    expect(clickContainerSlot(menu, null, { container: 'hotbar', index: 0, button: 'right' }))
      .toMatchObject({ ok: true, cursor: { itemKind: 'wood', quantity: 8 }, containers: { hotbar: { slots: [{ itemKind: 'wood', quantity: 7 }, null, null] } } });
  });

  it('places all with left click, one with right click, and swaps incompatible stacks with either button', () => {
    expect(clickContainerSlot(menu, { itemKind: 'wood', quantity: 4 }, { container: 'hotbar', index: 1, button: 'left' }))
      .toMatchObject({ ok: true, cursor: null, containers: { hotbar: { slots: [{ itemKind: 'wood', quantity: 15 }, { itemKind: 'wood', quantity: 4 }, null] } } });
    expect(clickContainerSlot(menu, { itemKind: 'wood', quantity: 4 }, { container: 'hotbar', index: 1, button: 'right' }))
      .toMatchObject({ ok: true, cursor: { quantity: 3 }, containers: { hotbar: { slots: [{ itemKind: 'wood', quantity: 15 }, { itemKind: 'wood', quantity: 1 }, null] } } });
    expect(clickContainerSlot(menu, { itemKind: 'wood', quantity: 4 }, { container: 'backpack', index: 1, button: 'right' }))
      .toMatchObject({ ok: true, outcome: 'swap', cursor: { itemKind: 'stone', quantity: 7 }, containers: { backpack: { slots: [{ itemKind: 'wood', quantity: 90 }, { itemKind: 'wood', quantity: 4 }] } } });
  });

  it('left quick-craft uses a fixed even share and leaves the remainder on the cursor', () => {
    const result = quickCraftCursorStack({
      crafting: { id: 'crafting', capacity: 3, slots: [null, null, null] },
    }, { itemKind: 'plank', quantity: 10 }, {
      mode: 'even', targets: [0, 1, 2].map((index) => ({ container: 'crafting', index })),
    });
    expect(result).toMatchObject({
      ok: true,
      cursor: { itemKind: 'plank', quantity: 1 },
      containers: { crafting: { slots: [{ quantity: 3 }, { quantity: 3 }, { quantity: 3 }] } },
    });
  });

  it('right quick-craft deposits one in each unique eligible slot', () => {
    expect(quickCraftCursorStack({
      hotbar: { id: 'hotbar', capacity: 3, slots: [null, null, null] },
    }, { itemKind: 'wood', quantity: 2 }, {
      mode: 'one_each', targets: [0, 1, 1, 2].map((index) => ({ container: 'hotbar', index })),
    })).toMatchObject({
      ok: true, cursor: null,
      containers: { hotbar: { slots: [{ quantity: 1 }, { quantity: 1 }, null] } },
    });
  });

  it('double-click collects compatible stacks up to the item maximum', () => {
    expect(pickupAllToCursor(menu, { itemKind: 'wood', quantity: 5 }, ['hotbar', 'backpack']))
      .toMatchObject({
        ok: true, cursor: { itemKind: 'wood', quantity: 99 },
        containers: {
          hotbar: { slots: [null, null, null] },
          backpack: { slots: [{ itemKind: 'wood', quantity: 11 }, { itemKind: 'stone', quantity: 7 }] },
        },
      });
  });
});
