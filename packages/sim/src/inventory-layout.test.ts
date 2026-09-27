import { describe, expect, it } from 'vitest';
import {
  BACKPACK_SLOT_OFFSET,
  CRAFTING_SLOT_OFFSET,
  HOTBAR_SLOT_BINDINGS,
  HOTBAR_SLOT_COUNT,
  INVENTORY_SLOT_COUNT,
  accessibleBackpackCapacity,
  accessibleBackpackSlotCount,
  BACKPACK_SLOT_COUNT,
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
    expect(CRAFTING_SLOT_OFFSET).toBe(40);
    expect(INVENTORY_SLOT_COUNT).toBe(49);
    expect(inventoryContainerSlotOffset('backpack')).toBe(BACKPACK_SLOT_OFFSET);
    expect(inventoryContainerSlotOffset('crafting')).toBe(CRAFTING_SLOT_OFFSET);
    expect(inventoryContainerSlotCount('hotbar')).toBe(HOTBAR_SLOT_COUNT);
    expect(accessibleBackpackSlotCount(false)).toBe(8);
    expect(accessibleBackpackSlotCount(true)).toBe(20);
  });
});

describe('accessible backpack capacity (BUG-054)', () => {
  it('is max(8, min(20, bag)), or more debug slots up to 20: exactly the world rule before it was shared', () => {
    // The world's accessibleInventoryContainerCapacity for the backpack, verbatim from before BUG-054.
    const previousWorldRule = (equipped: number, debug: number) => Math.max(Math.max(8, Math.min(BACKPACK_SLOT_COUNT, equipped)), Math.min(BACKPACK_SLOT_COUNT, debug));
    for (let equipped = -2; equipped <= 30; equipped++) for (let debug = 0; debug <= 30; debug++) {
      expect(accessibleBackpackCapacity(equipped, debug), `${equipped}/${debug}`).toBe(previousWorldRule(equipped, debug));
    }
    expect(accessibleBackpackCapacity(6)).toBe(8);
    expect(accessibleBackpackCapacity(20)).toBe(20);
  });
});
