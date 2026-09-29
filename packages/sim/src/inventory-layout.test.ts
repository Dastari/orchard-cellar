import { describe, expect, it } from 'vitest';
import {
  BACKPACK_SLOT_OFFSET,
  CRAFTING_SLOT_OFFSET,
  HOTBAR_SLOT_BINDINGS,
  HOTBAR_SLOT_COUNT,
  INVENTORY_SLOT_COUNT,
  accessibleBackpackCapacity,
  isAccessibleCarriedCell,
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
    expect(inventoryContainerSlotCount('backpack')).toBe(BACKPACK_SLOT_COUNT);
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

  it('leaves an already accessible capacity unchanged, so the UI can pass a projected capacity back through it (BUG-056)', () => {
    for (let capacity = 8; capacity <= BACKPACK_SLOT_COUNT; capacity++) expect(accessibleBackpackCapacity(capacity)).toBe(capacity);
    expect(accessibleBackpackCapacity(BACKPACK_SLOT_COUNT + 5)).toBe(BACKPACK_SLOT_COUNT);
  });
});

describe('accessible carried cells (BUG-068)', () => {
  const cell = (container: string, index: number) => ({ container, index });
  it('are the hotbar and the backpack cells the accessible capacity opens, never equipment or the crafting grid', () => {
    const open = (capacity: number) => ['hotbar', 'backpack', 'equipment', 'crafting', 'stash']
      .flatMap(container => Array.from({ length: 24 }, (_, index) => cell(container, index - 1)))
      .filter(candidate => isAccessibleCarriedCell(candidate, accessibleBackpackCapacity(capacity)))
      .map(({ container, index }) => `${container}:${index}`);
    const hotbar = Array.from({ length: HOTBAR_SLOT_COUNT }, (_, index) => `hotbar:${index}`);
    const backpack = (cells: number) => Array.from({ length: cells }, (_, index) => `backpack:${index}`);
    expect(open(12)).toEqual([...hotbar, ...backpack(12)]);
    expect(open(20)).toEqual([...hotbar, ...backpack(20)]);
    // Through the one capacity rule: a bag below the base opens 8, and nothing opens past the backpack.
    expect(open(4)).toEqual([...hotbar, ...backpack(8)]);
    expect(open(99)).toEqual([...hotbar, ...backpack(BACKPACK_SLOT_COUNT)]);
    expect(isAccessibleCarriedCell(cell('crafting', 0), 20)).toBe(false);
    expect(isAccessibleCarriedCell(cell('hotbar', 1.5), 20)).toBe(false);
    expect(isAccessibleCarriedCell(cell('hotbar', HOTBAR_SLOT_COUNT), 20)).toBe(false);
  });

  it('adds no ceiling of its own: the resolved capacity alone bounds the backpack (Uncapped Storage step 5)', () => {
    expect(isAccessibleCarriedCell(cell('backpack', 30), 31)).toBe(true);
    expect(isAccessibleCarriedCell(cell('backpack', 300), 301)).toBe(true);
    expect(isAccessibleCarriedCell(cell('backpack', 300), 300)).toBe(false);
    expect(isAccessibleCarriedCell(cell('equipment', 3), 1000)).toBe(false);
  });
});
