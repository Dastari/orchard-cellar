import { describe, expect, it } from 'vitest';
import {
  bootstrapContentRows,
  buildContentRegistry,
  itemContainerContentResolver,
} from '@orchard/sim';
import { ItemSlot, ItemSlotTable, itemSlotRejectsCursor } from './item-slot.js';

describe('shared inventory slot acceptance feedback', () => {
  it('rejects incompatible carried items only while the destination is empty', () => {
    const fuel = new ItemSlot('fuel', 'placeable', 1, { acceptedKinds: ['wood', 'plank'] });
    fuel.enabled = true;
    fuel.item = null;
    expect(itemSlotRejectsCursor(fuel, { itemKind: 'raw_chicken', quantity: 1 })).toBe(true);
    expect(itemSlotRejectsCursor(fuel, { itemKind: 'wood', quantity: 1 })).toBe(false);

    fuel.item = { itemKind: 'wood', quantity: 1 };
    expect(itemSlotRejectsCursor(fuel, { itemKind: 'raw_chicken', quantity: 1 })).toBe(false);
  });

  it('marks empty processor output slots as invalid drop destinations', () => {
    const output = new ItemSlot('output', 'placeable', 2, { readOnly: true });
    output.enabled = true;
    expect(itemSlotRejectsCursor(output, { itemKind: 'iron_bar', quantity: 1 })).toBe(true);
  });

  it('follows active renamed item tags and fails closed after tag removal or retirement', () => {
    const source = buildContentRegistry(bootstrapContentRows()).registry.items.get('item:wood')!;
    const moonLog = {
      ...source,
      id: 'item:moon_log' as const,
      tags: [...source.tags, 'processor.moon_fuel'],
    };
    const slot = new ItemSlot(
      'moon-fuel', 'placeable', 0, { requiredTags: ['processor.moon_fuel'] },
      itemContainerContentResolver({ items: new Map([[moonLog.id, moonLog]]) }),
    );
    slot.enabled = true;

    expect(slot.accepts('moon_log')).toBe(true);
    expect(slot.accepts('wood')).toBe(false);

    slot.setContentResolver(itemContainerContentResolver({
      items: new Map([[moonLog.id, { ...moonLog, tags: source.tags }]]),
    }));
    expect(slot.accepts('moon_log')).toBe(false);

    slot.setContentResolver(itemContainerContentResolver({
      items: new Map([[moonLog.id, { ...moonLog, retired: true }]]),
    }));
    expect(slot.accepts('moon_log')).toBe(false);
  });
});

describe('item slot table (Uncapped Storage)', () => {
  const table = () => new ItemSlotTable((container, index) => new ItemSlot(`${container}.${index}`, container, index));

  it('makes any cell on first lookup and returns the same slot for the same cell', () => {
    const slots = table();
    // Far past the old fixed arrays (20 backpack cells, 16 chest cells): no container has a fixed length.
    const far = slots.slot('backpack', 999);
    expect(far).toMatchObject({ containerId: 'backpack', index: 999 });
    expect(slots.slot('backpack', 999)).toBe(far);
    expect(slots.find('backpack', 999)).toBe(far);
    expect(slots.slot('chest', 40)).not.toBe(slots.slot('placeable', 40));
    // Only the cells looked up exist.
    expect(slots.made('backpack')).toEqual([far]);
  });

  it('keeps each container in index order, and lists containers in the host order', () => {
    const slots = table();
    for (const index of [7, 2, 30, 0]) slots.slot('backpack', index);
    slots.slot('stash', 1); slots.slot('hotbar', 3);
    expect(slots.made('backpack').map(slot => slot.index)).toEqual([0, 2, 7, 30]);
    expect(slots.range('backpack', 3).map(slot => slot.index)).toEqual([0, 1, 2]);
    expect(slots.all().map(slot => `${slot.containerId}.${slot.index}`))
      .toEqual(['hotbar.3', 'backpack.0', 'backpack.1', 'backpack.2', 'backpack.7', 'backpack.30', 'stash.1']);
  });

  it('finds no slot for a reference that names no inventory cell', () => {
    const slots = table();
    expect(slots.find('merchant', 0)).toBeNull();
    expect(slots.find('chest', -1)).toBeNull();
    expect(slots.find('chest', 1.5)).toBeNull();
    expect(() => slots.slot('chest', -1)).toThrow(RangeError);
    expect(slots.all()).toEqual([]);
  });
});
