import { describe, expect, it } from 'vitest';
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
});
