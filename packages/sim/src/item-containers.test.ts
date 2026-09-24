import { describe, expect, it } from 'vitest';
import {
  craftItem,
  BOOTSTRAP_ITEM_CONTAINER_CONTENT,
  clickContainerSlot,
  distributeItemStack,
  fillCraftingRecipeFromInventory,
  canUseToolWithSkillRanks,
  ITEM_DEFINITIONS,
  TOOL_QUALITY_REQUIRED_SPECIALIZATION_RANKS,
  insertItemStack,
  insertItemStackPartial,
  itemDefinition,
  itemStacksCompatible,
  isUniqueQuestItemKind,
  matchingRecipeId,
  moveItemStacks,
  quickMoveItemStack,
  quickMoveAllMatchingStacks,
  quickCraftCursorStack,
  pickupAllToCursor,
  sortAndStackContainer,
  slotAcceptsItem,
  toolQualityRequiredRanks,
} from './item-containers.js';
import {
  ACTIVE_EQUIPMENT_SLOTS,
  EQUIPMENT_SLOTS,
  activeEquipmentSlotAccepts,
} from './inventory-layout.js';
import { MOVE_RULE_FIXTURES } from './item-containers.fixtures.js';

describe('shared container stacking rules', () => {
  it('merges newly granted fiber with persisted stacks without requiring an empty cell', () => {
    const hotbar = { id: 'hotbar', capacity: 1, slots: [{ itemKind: 'fiber', quantity: 10, lit: true }] };
    const fresh = { itemKind: 'fiber', quantity: 1 };
    const inserted = insertItemStack(hotbar, fresh);
    expect(inserted.ok && inserted.container.slots).toEqual([{ itemKind: 'fiber', quantity: 11, lit: true }]);
    const moved = quickMoveItemStack({
      hotbar, grant: { id: 'grant', capacity: 1, slots: [fresh] },
    }, { fromContainer: 'grant', fromIndex: 0, toContainers: ['hotbar'] }, BOOTSTRAP_ITEM_CONTAINER_CONTENT);
    expect(moved.ok && moved.containers.hotbar?.slots).toEqual([{ itemKind: 'fiber', quantity: 11, lit: true }]);
    expect(moved.ok && moved.containers.grant?.slots).toEqual([null]);
    expect(hotbar.slots[0]?.quantity).toBe(10);
  });

  it('merges fresh crafted arrows into persisted output while retaining explicit power and wear differences', () => {
    const crafted = craftItem({
      grid: { id: 'grid', capacity: 10, slots: [
        { itemKind: 'stone', quantity: 1, lit: true }, null, null,
        { itemKind: 'stick', quantity: 1, lit: true }, null, null,
        { itemKind: 'fiber', quantity: 1, lit: true }, null, null, { itemKind: 'arrow', quantity: 5, lit: true },
      ] },
    }, { recipeId: 'arrows', gridContainer: 'grid', resultIndex: 9 });
    expect(crafted.ok && crafted.containers.grid?.slots[9]).toEqual({ itemKind: 'arrow', quantity: 9, lit: true });
    if (!crafted.ok) throw new Error('arrow recipe fixture failed');
    const moved = quickMoveItemStack({
      hotbar: { id: 'hotbar', capacity: 1, slots: [{ itemKind: 'arrow', quantity: 5, lit: true }] },
      output: { id: 'output', capacity: 1, slots: [crafted.crafted] },
    }, { fromContainer: 'output', fromIndex: 0, toContainers: ['hotbar'] }, BOOTSTRAP_ITEM_CONTAINER_CONTENT);
    expect(moved.ok && moved.containers.hotbar?.slots).toEqual([{ itemKind: 'arrow', quantity: 9, lit: true }]);
    expect(itemStacksCompatible({ itemKind: 'lantern', quantity: 1 }, { itemKind: 'lantern', quantity: 1, lit: false })).toBe(false);
    expect(itemStacksCompatible({ itemKind: 'axe', quantity: 1, durability: 5 }, { itemKind: 'axe', quantity: 1, durability: 6, lit: true })).toBe(false);
  });

  it('distinguishes protected quest artifacts from ordinary objective materials', () => {
    expect(isUniqueQuestItemKind('marlow_book')).toBe(true);
    expect(isUniqueQuestItemKind('bob_fast_strawberry_seeds')).toBe(false);
    expect(itemDefinition('bob_fast_strawberry_seeds')).toMatchObject({ maxStack: 99 });
    expect(isUniqueQuestItemKind('wood')).toBe(false);
    expect(isUniqueQuestItemKind('missing')).toBe(false);
  });

  it('registers stable item quality independently of quest ownership', () => {
    expect(itemDefinition('wood')?.quality).toBe('common');
    // Starter equipment deliberately begins at the lowest quality; later
    // qualities are specialization-gated rather than baked into starter gear.
    for (const itemKind of [
      'axe', 'hoe', 'pickaxe', 'watering_can', 'fishing_rod',
      'sword', 'bow', 'shovel', 'hammer', 'lantern',
    ]) expect(itemDefinition(itemKind)?.quality).toBe('common');
    expect(itemDefinition('watch')).toMatchObject({
      displayName: 'Watch', quality: 'rare', maxStack: 1,
      tags: expect.arrayContaining(['item.equipment', 'gear.ring', 'utility.time']),
      iconKey: 'item_cf_watch',
    });
    expect(itemDefinition('ring')).toBeNull();
    expect(itemDefinition('strawberry')?.tags).toContain('crop.fruit');
    expect(itemDefinition('watermelon')?.tags).toContain('crop.fruit');
    expect(itemDefinition('leather')?.iconKey).toBe('item_cf_leather');
    expect(itemDefinition('homestead_deed')?.quality).toBe('legendary');
    expect(itemDefinition('marlow_book')).toMatchObject({ quality: 'common' });
    expect(isUniqueQuestItemKind('marlow_book')).toBe(true);
  });

  for (const fixture of MOVE_RULE_FIXTURES) {
    it(fixture.name, () => {
      const result = moveItemStacks(fixture.containers, fixture.request, BOOTSTRAP_ITEM_CONTAINER_CONTENT);
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
    moveItemStacks(containers, { fromContainer: 'bag', fromIndex: 0, toContainer: 'bag', toIndex: 1, quantity: 2 }, BOOTSTRAP_ITEM_CONTAINER_CONTENT);
    expect(containers.bag.slots).toEqual([{ itemKind: 'wood', quantity: 4 }, null]);
  });

  it('atomically fills a known recipe from multiple carried stacks without overwriting the grid', () => {
    const containers = {
      hotbar: { id: 'hotbar', capacity: 2, slots: [
        { itemKind: 'plank', quantity: 6 },
        { itemKind: 'iron_bar', quantity: 2 },
      ] },
      backpack: { id: 'backpack', capacity: 1, slots: [null] },
      crafting: { id: 'crafting', capacity: 9, slots: Array.from({ length: 9 }, () => null) },
    } as const;
    const filled = fillCraftingRecipeFromInventory(containers, 'barrel', BOOTSTRAP_ITEM_CONTAINER_CONTENT);
    expect(filled).toMatchObject({
      ok: true,
      movedQuantity: 8,
      containers: {
        hotbar: { slots: [null, null] },
        crafting: { slots: [
          { itemKind: 'iron_bar', quantity: 1 }, { itemKind: 'plank', quantity: 1 }, { itemKind: 'iron_bar', quantity: 1 },
          { itemKind: 'plank', quantity: 1 }, null, { itemKind: 'plank', quantity: 1 },
          { itemKind: 'plank', quantity: 1 }, { itemKind: 'plank', quantity: 1 }, { itemKind: 'plank', quantity: 1 },
        ] },
      },
    });
    expect(containers.hotbar.slots).toEqual([
      { itemKind: 'plank', quantity: 6 },
      { itemKind: 'iron_bar', quantity: 2 },
    ]);

    const blocked = fillCraftingRecipeFromInventory({
      ...containers,
      crafting: { ...containers.crafting, slots: [
        { itemKind: 'stone', quantity: 1 }, ...containers.crafting.slots.slice(1),
      ] },
    }, 'barrel', BOOTSTRAP_ITEM_CONTAINER_CONTENT);
    expect(blocked).toEqual({ ok: false, code: 'recipe_inputs_missing' });
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
    const result = sortAndStackContainer(container, BOOTSTRAP_ITEM_CONTAINER_CONTENT);
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
    }, BOOTSTRAP_ITEM_CONTAINER_CONTENT);
    expect(swapped.ok && swapped.containers.hotbar?.slots.map((stack) => stack?.lit)).toEqual([true, false]);
    const quick = quickMoveItemStack(containers, {
      fromContainer: 'hotbar', fromIndex: 0, toContainers: ['backpack'],
    }, BOOTSTRAP_ITEM_CONTAINER_CONTENT);
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
    expect(Object.entries(ITEM_DEFINITIONS)
      .filter(([, definition]) => (definition.tags as readonly string[]).includes('item.equipment'))
      .map(([itemKind]) => itemKind).sort()).toEqual(['backpack', 'lantern', 'torch', 'watch']);
    expect(EQUIPMENT_SLOTS).toHaveLength(10);
    expect(ACTIVE_EQUIPMENT_SLOTS.map((slot) => slot.id)).toContain('body');
    expect(activeEquipmentSlotAccepts(9, 'hearth_common_body')).toBe(true);
    expect(activeEquipmentSlotAccepts(9, 'backpack')).toBe(false);
    expect(activeEquipmentSlotAccepts(3, 'hearth_rare_sword')).toBe(true);
    expect(activeEquipmentSlotAccepts(3, 'axe')).toBe(false);
    expect(activeEquipmentSlotAccepts(5, 'hearth_rare_shield')).toBe(true);
    expect(activeEquipmentSlotAccepts(2, 'watch')).toBe(true);
    expect(activeEquipmentSlotAccepts(2, 'backpack')).toBe(false);
    expect(activeEquipmentSlotAccepts(4, 'backpack')).toBe(true);
    expect(activeEquipmentSlotAccepts(5, 'lantern')).toBe(true);
    expect(activeEquipmentSlotAccepts(5, 'torch')).toBe(true);
    expect(activeEquipmentSlotAccepts(5, 'shield')).toBe(false);
  });

  it('gates upgraded tools by ranks in their matching specialization', () => {
    expect(TOOL_QUALITY_REQUIRED_SPECIALIZATION_RANKS).toEqual({
      common: 0, uncommon: 3, rare: 6, epic: 10, legendary: 15,
    });
    expect(toolQualityRequiredRanks('pickaxe')).toBe(0);
    expect(canUseToolWithSkillRanks('pickaxe', {})).toBe(true);
    expect(canUseToolWithSkillRanks('sword', {})).toBe(true);
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

  it('crafts four arrows from a stone tip, stick shaft and fiber fletching in any column', () => {
    const grid = { id: 'crafting', capacity: 9, slots: [
      null, null, { itemKind: 'stone', quantity: 2 }, null, null, { itemKind: 'stick', quantity: 1 }, null, null, { itemKind: 'fiber', quantity: 1 },
    ] } as const;
    expect(matchingRecipeId(grid)).toBe('arrows');
    expect(craftItem({ grid: { ...grid, capacity: 10, slots: [...grid.slots, null] } }, {
      recipeId: 'arrows', gridContainer: 'grid', resultIndex: 9,
    })).toMatchObject({ ok: true, crafted: { itemKind: 'arrow', quantity: 4 } });
  });
});

describe('Minecraft-style bulk slot gestures', () => {
  it('preserves durable stacks above a reduced cap without creating items during a quick move', () => {
    const containers = {
      escrow: { id: 'escrow', capacity: 1, slots: [{ itemKind: 'cooked_beef', quantity: 4, lit: true }] },
      hotbar: { id: 'hotbar', capacity: 1, slots: [{ itemKind: 'cooked_beef', quantity: 5, lit: true }] },
      backpack: { id: 'backpack', capacity: 2, slots: [null, null] },
    };
    const original = structuredClone(containers);
    const content = { maxStackFor: () => 4, hasTag: () => false };
    const request = { fromContainer: 'escrow', fromIndex: 0, toContainers: ['hotbar', 'backpack'] };
    const result = quickMoveItemStack(containers, request, content);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.code);
    expect(result.movedQuantity).toBe(4);
    expect(result.containers.hotbar!.slots).toEqual(original.hotbar.slots);
    expect(result.containers.backpack!.slots).toEqual([
      { itemKind: 'cooked_beef', quantity: 4, lit: true }, null,
    ]);
    expect(result.containers.escrow!.slots).toEqual([null]);
    expect(Object.values(result.containers).flatMap(({ slots }) => slots)
      .reduce((total, stack) => total + (stack?.quantity ?? 0), 0)).toBe(9);
    expect(containers).toEqual(original);

    expect(quickMoveItemStack({ ...containers,
      backpack: { id: 'backpack', capacity: 0, slots: [] },
    }, request, content)).toEqual({ ok: false, code: 'container_full' });
    expect(containers).toEqual(original);
  });

  it('shift-click merges existing stacks before using empty slots', () => {
    const result = quickMoveItemStack({
      hotbar: { id: 'hotbar', capacity: 1, slots: [{ itemKind: 'wood', quantity: 10 }] },
      backpack: { id: 'backpack', capacity: 2, slots: [{ itemKind: 'wood', quantity: 95 }, null] },
    }, { fromContainer: 'hotbar', fromIndex: 0, toContainers: ['backpack'] }, BOOTSTRAP_ITEM_CONTAINER_CONTENT);
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
    }, BOOTSTRAP_ITEM_CONTAINER_CONTENT);
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
    }, BOOTSTRAP_ITEM_CONTAINER_CONTENT);
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
    expect(clickContainerSlot(menu, null, { container: 'hotbar', index: 0, button: 'left' }, BOOTSTRAP_ITEM_CONTAINER_CONTENT))
      .toMatchObject({ ok: true, cursor: { itemKind: 'wood', quantity: 15 }, containers: { hotbar: { slots: [null, null, null] } } });
    expect(clickContainerSlot(menu, null, { container: 'hotbar', index: 0, button: 'right' }, BOOTSTRAP_ITEM_CONTAINER_CONTENT))
      .toMatchObject({ ok: true, cursor: { itemKind: 'wood', quantity: 8 }, containers: { hotbar: { slots: [{ itemKind: 'wood', quantity: 7 }, null, null] } } });
  });

  it('places all with left click, one with right click, and swaps incompatible stacks with either button', () => {
    expect(clickContainerSlot(menu, { itemKind: 'wood', quantity: 4 }, { container: 'hotbar', index: 1, button: 'left' }, BOOTSTRAP_ITEM_CONTAINER_CONTENT))
      .toMatchObject({ ok: true, cursor: null, containers: { hotbar: { slots: [{ itemKind: 'wood', quantity: 15 }, { itemKind: 'wood', quantity: 4 }, null] } } });
    expect(clickContainerSlot(menu, { itemKind: 'wood', quantity: 4 }, { container: 'hotbar', index: 1, button: 'right' }, BOOTSTRAP_ITEM_CONTAINER_CONTENT))
      .toMatchObject({ ok: true, cursor: { quantity: 3 }, containers: { hotbar: { slots: [{ itemKind: 'wood', quantity: 15 }, { itemKind: 'wood', quantity: 1 }, null] } } });
    expect(clickContainerSlot(menu, { itemKind: 'wood', quantity: 4 }, { container: 'backpack', index: 1, button: 'right' }, BOOTSTRAP_ITEM_CONTAINER_CONTENT))
      .toMatchObject({ ok: true, outcome: 'swap', cursor: { itemKind: 'stone', quantity: 7 }, containers: { backpack: { slots: [{ itemKind: 'wood', quantity: 90 }, { itemKind: 'wood', quantity: 4 }] } } });
  });

  it('left quick-craft uses a fixed even share and leaves the remainder on the cursor', () => {
    const result = quickCraftCursorStack({
      crafting: { id: 'crafting', capacity: 3, slots: [null, null, null] },
    }, { itemKind: 'plank', quantity: 10 }, {
      mode: 'even', targets: [0, 1, 2].map((index) => ({ container: 'crafting', index })),
    }, BOOTSTRAP_ITEM_CONTAINER_CONTENT);
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
    }, BOOTSTRAP_ITEM_CONTAINER_CONTENT)).toMatchObject({
      ok: true, cursor: null,
      containers: { hotbar: { slots: [{ quantity: 1 }, { quantity: 1 }, null] } },
    });
  });

  it('double-click collects compatible stacks up to the item maximum', () => {
    expect(pickupAllToCursor(menu, { itemKind: 'wood', quantity: 5 }, ['hotbar', 'backpack'], BOOTSTRAP_ITEM_CONTAINER_CONTENT))
      .toMatchObject({
        ok: true, cursor: { itemKind: 'wood', quantity: 99 },
        containers: {
          hotbar: { slots: [null, null, null] },
          backpack: { slots: [{ itemKind: 'wood', quantity: 11 }, { itemKind: 'stone', quantity: 7 }] },
        },
      });
  });
});
