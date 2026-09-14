import { describe, expect, it } from 'vitest';
import {
  bootstrapContentRows,
  buildContentRegistry,
  itemContainerContentResolver,
} from '@orchard/sim';
import { ItemSlot, itemSlotRejectsCursor } from './item-slot.js';

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
