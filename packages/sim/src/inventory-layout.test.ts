import { describe, expect, it } from 'vitest';
import {
  BACKPACK_SLOT_OFFSET,
  CRAFTING_SLOT_OFFSET,
  HOTBAR_SLOT_BINDINGS,
  HOTBAR_SLOT_COUNT,
  INVENTORY_SLOT_COUNT,
  accessibleBackpackSlotCount,
  hotbarSlotForInputCode,
  hotbarSlotLabel,
  isHotbarSlot,
  inventoryContainerSlotCount,
  inventoryContainerSlotOffset,
} from './inventory-layout.js';

describe('shared player inventory layout', () => {
  it('derives the numbered hotbar, including key 0, from one binding list', () => {
    expect(HOTBAR_SLOT_COUNT).toBe(HOTBAR_SLOT_BINDINGS.length);
    expect(hotbarSlotForInputCode('Digit1')).toBe(0);
    expect(hotbarSlotForInputCode('Numpad9')).toBe(8);
    expect(hotbarSlotForInputCode('Digit0')).toBe(9);
    expect(hotbarSlotLabel(9)).toBe('0');
    expect(hotbarSlotForInputCode('Minus')).toBeNull();
    expect(hotbarSlotLabel(HOTBAR_SLOT_COUNT)).toBeNull();
    expect(isHotbarSlot(0)).toBe(true);
    expect(isHotbarSlot(9)).toBe(true);
    expect(isHotbarSlot(10)).toBe(false);
    expect(isHotbarSlot(1.5)).toBe(false);
  });

  it('derives every global slot boundary from hotbar capacity', () => {
    expect(BACKPACK_SLOT_OFFSET).toBe(HOTBAR_SLOT_COUNT);
    expect(CRAFTING_SLOT_OFFSET).toBe(39);
    expect(INVENTORY_SLOT_COUNT).toBe(48);
    expect(inventoryContainerSlotOffset('backpack')).toBe(BACKPACK_SLOT_OFFSET);
    expect(inventoryContainerSlotOffset('crafting')).toBe(CRAFTING_SLOT_OFFSET);
    expect(inventoryContainerSlotCount('hotbar')).toBe(HOTBAR_SLOT_COUNT);
    expect(accessibleBackpackSlotCount(false)).toBe(8);
    expect(accessibleBackpackSlotCount(true)).toBe(20);
  });
});
