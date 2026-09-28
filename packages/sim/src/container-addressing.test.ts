import { describe, expect, it } from 'vitest';
import {
  CONTAINER_CELL_CAPACITY_LIMIT,
  LEGACY_GLOBAL_SLOT_COUNT,
  LEGACY_GLOBAL_SLOT_LAYOUT,
  MAIN_HAND_EQUIPMENT_INDEX,
  MAIN_HAND_SELECTED_SLOT,
  PLAYER_CONTAINERS,
  U32_MAX,
  cellToLegacyGlobalSlot,
  containerCellIndex,
  fixedPlayerContainerCapacity,
  isMainHandSelectedSlot,
  legacyGlobalSlotToCell,
  parsePlaceableContainerCellKey,
  parsePlayerContainerCellKey,
  placeableContainerCellKey,
  playerContainerCell,
  playerContainerCellKey,
  selectedSlotCell,
} from './container-addressing.js';
import { MAX_CONTAINER_CAPACITY } from './content/parse-contract.js';
import { MAIN_HAND_INVENTORY_SLOT } from './equipment-loadout.js';
import {
  EQUIPMENT_SLOTS,
  INVENTORY_SLOT_COUNT,
  equippedInventorySlot,
  inventoryContainerSlotCount,
  inventoryContainerSlotOffset,
} from './inventory-layout.js';

const IDENTITY = 'c200a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e';

describe('container-scoped addressing', () => {
  it('freezes the legacy numbering that the current 20-slot layout still uses', () => {
    expect(LEGACY_GLOBAL_SLOT_COUNT).toBe(INVENTORY_SLOT_COUNT);
    for (const { container, offset, count } of LEGACY_GLOBAL_SLOT_LAYOUT) {
      expect(container === 'stash').toBe(false);
      expect(offset).toBe(inventoryContainerSlotOffset(container as 'hotbar'));
      expect(count).toBe(inventoryContainerSlotCount(container as 'hotbar'));
    }
  });

  it('round-trips every legacy global slot through a cell', () => {
    const seen = new Set<string>();
    for (let slot = 0; slot < LEGACY_GLOBAL_SLOT_COUNT; slot += 1) {
      const cell = legacyGlobalSlotToCell(slot)!;
      expect(cellToLegacyGlobalSlot(cell)).toBe(slot);
      seen.add(`${cell.container}:${cell.index}`);
    }
    expect(seen.size).toBe(49);
    expect(legacyGlobalSlotToCell(0)).toEqual({ container: 'hotbar', index: 0 });
    expect(legacyGlobalSlotToCell(29)).toEqual({ container: 'backpack', index: 19 });
    expect(legacyGlobalSlotToCell(39)).toEqual({ container: 'equipment', index: 9 });
    expect(legacyGlobalSlotToCell(48)).toEqual({ container: 'crafting', index: 8 });
    for (const bad of [-1, 49, 255, 1.5, Number.NaN]) expect(legacyGlobalSlotToCell(bad)).toBeNull();
    expect(cellToLegacyGlobalSlot({ container: 'stash', index: 0 })).toBeNull();
    expect(cellToLegacyGlobalSlot({ container: 'backpack', index: 20 })).toBeNull();
    expect(cellToLegacyGlobalSlot({ container: 'hotbar', index: -1 })).toBeNull();
  });

  it('keeps equipment indices equal to the paper-doll indices', () => {
    for (const slot of EQUIPMENT_SLOTS) {
      expect(legacyGlobalSlotToCell(equippedInventorySlot(slot.index))).toEqual({ container: 'equipment', index: slot.index });
    }
    expect(EQUIPMENT_SLOTS[MAIN_HAND_EQUIPMENT_INDEX]!.id).toBe('main_hand');
  });

  it('names the Main Hand selected slot without layout arithmetic, and keeps the legacy alias', () => {
    expect(MAIN_HAND_SELECTED_SLOT).toBe(33);
    expect(MAIN_HAND_INVENTORY_SLOT).toBe(MAIN_HAND_SELECTED_SLOT);
    // Today's stored value happens to be the legacy global slot of the Main Hand cell.
    expect(cellToLegacyGlobalSlot({ container: 'equipment', index: MAIN_HAND_EQUIPMENT_INDEX })).toBe(MAIN_HAND_SELECTED_SLOT);
    expect(isMainHandSelectedSlot(33)).toBe(true);
    expect(selectedSlotCell(33)).toEqual({ container: 'equipment', index: MAIN_HAND_EQUIPMENT_INDEX });
    for (let slot = 0; slot < 10; slot += 1) expect(selectedSlotCell(slot)).toEqual({ container: 'hotbar', index: slot });
    for (const bad of [-1, 10, 30, 34, 1.5]) expect(selectedSlotCell(bad)).toBeNull();
  });

  it('validates u32 indices and fixed container sizes', () => {
    expect(PLAYER_CONTAINERS).toEqual(['hotbar', 'backpack', 'equipment', 'crafting', 'stash']);
    expect([fixedPlayerContainerCapacity('hotbar'), fixedPlayerContainerCapacity('equipment'), fixedPlayerContainerCapacity('crafting')])
      .toEqual([10, 10, 9]);
    expect(fixedPlayerContainerCapacity('backpack')).toBeNull();
    expect(fixedPlayerContainerCapacity('stash')).toBeNull();
    expect(containerCellIndex(U32_MAX)).toBe(U32_MAX);
    for (const bad of [-1, U32_MAX + 1, 0.5, '1', null]) expect(() => containerCellIndex(bad)).toThrow('container_cell_index_invalid');
    expect(playerContainerCell('backpack', 999)).toEqual({ container: 'backpack', index: 999 });
    expect(() => playerContainerCell('hotbar', 10)).toThrow('container_cell_index_invalid');
    expect(() => playerContainerCell('crafting', 9)).toThrow('container_cell_index_invalid');
    expect(() => playerContainerCell('backpack', CONTAINER_CELL_CAPACITY_LIMIT)).toThrow('container_cell_index_invalid');
    expect(() => playerContainerCell('pocket' as 'hotbar', 0)).toThrow('container_id_invalid');
    expect(CONTAINER_CELL_CAPACITY_LIMIT).toBeGreaterThanOrEqual(MAX_CONTAINER_CAPACITY);
  });

  it('builds and parses the planned table keys exactly', () => {
    const key = playerContainerCellKey(IDENTITY, { container: 'backpack', index: 999 });
    expect(key).toBe(`${IDENTITY}:backpack:999`);
    expect(parsePlayerContainerCellKey(key)).toEqual({ identity: IDENTITY, container: 'backpack', index: 999 });
    for (const bad of [`${IDENTITY}:backpack:01`, `${IDENTITY}:backpack:-1`, `${IDENTITY}:pocket:1`, `:hotbar:1`,
      `${IDENTITY}:hotbar`, `${IDENTITY}:hotbar:1:2`, `${IDENTITY}:hotbar:4294967296`, `${IDENTITY}:hotbar:1e3`]) {
      expect(parsePlayerContainerCellKey(bad)).toBeNull();
    }
    expect(() => playerContainerCellKey('a:b', { container: 'hotbar', index: 0 })).toThrow('container_cell_owner_invalid');
    const maxId = (1n << 64n) - 1n;
    expect(placeableContainerCellKey({ placeableId: maxId, index: 65534 })).toBe(`${maxId}:65534`);
    expect(parsePlaceableContainerCellKey(`${maxId}:65534`)).toEqual({ placeableId: maxId, index: 65534 });
    expect(parsePlaceableContainerCellKey('42:0')).toEqual({ placeableId: 42n, index: 0 });
    for (const bad of ['042:0', '42', '42:0:1', `${maxId + 1n}:0`, '-1:0', 'x:0']) expect(parsePlaceableContainerCellKey(bad)).toBeNull();
    expect(() => placeableContainerCellKey({ placeableId: -1n, index: 0 })).toThrow('container_cell_owner_invalid');
  });
});
