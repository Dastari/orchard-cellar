import { BASE_BACKPACK_CAPACITY } from './item-containers.js';

/**
 * One shared carried-inventory layout contract. Hotbar capacity is derived
 * from the bindings, so adding a slot cannot leave client, authority, shops,
 * crafting, or global slot offsets on different numbers.
 */
export const HOTBAR_SLOT_BINDINGS = [
  { label: '1', codes: ['Digit1', 'Numpad1'] },
  { label: '2', codes: ['Digit2', 'Numpad2'] },
  { label: '3', codes: ['Digit3', 'Numpad3'] },
  { label: '4', codes: ['Digit4', 'Numpad4'] },
  { label: '5', codes: ['Digit5', 'Numpad5'] },
  { label: '6', codes: ['Digit6', 'Numpad6'] },
  { label: '7', codes: ['Digit7', 'Numpad7'] },
  { label: '8', codes: ['Digit8', 'Numpad8'] },
  { label: '9', codes: ['Digit9', 'Numpad9'] },
  { label: '0', codes: ['Digit0', 'Numpad0'] },
] as const;

export const HOTBAR_SLOT_COUNT = HOTBAR_SLOT_BINDINGS.length;
export const BACKPACK_SLOT_COUNT = 20;
export const EQUIPMENT_SLOT_COUNT = 9;
export const CRAFTING_SLOT_COUNT = 9;

export const HOTBAR_SLOT_OFFSET = 0;
export const BACKPACK_SLOT_OFFSET = HOTBAR_SLOT_OFFSET + HOTBAR_SLOT_COUNT;
export const EQUIPMENT_SLOT_OFFSET = BACKPACK_SLOT_OFFSET + BACKPACK_SLOT_COUNT;
export const CRAFTING_SLOT_OFFSET = EQUIPMENT_SLOT_OFFSET + EQUIPMENT_SLOT_COUNT;
export const INVENTORY_SLOT_COUNT = CRAFTING_SLOT_OFFSET + CRAFTING_SLOT_COUNT;

/**
 * All nine paper-doll positions remain visible. Empty `acceptedKinds` marks a
 * reserved, visibly locked slot; it does not remove the slot from either UI.
 * Only Watch, Pack, and Off Hand accept items in the current game slice.
 */
export const EQUIPMENT_SLOTS = [
  { index: 0, id: 'neck', label: 'NECK', iconAnimation: 'neck', acceptedKinds: [] },
  { index: 1, id: 'head', label: 'HEAD', iconAnimation: 'head', acceptedKinds: [] },
  { index: 2, id: 'watch', label: 'WATCH', iconAnimation: 'ring', acceptedKinds: ['watch'] },
  { index: 3, id: 'main_hand', label: 'MAIN HAND', iconAnimation: 'main_hand', acceptedKinds: [] },
  { index: 4, id: 'backpack', label: 'PACK', iconAnimation: 'body', acceptedKinds: ['backpack'] },
  {
    index: 5,
    id: 'off_hand',
    label: 'OFF HAND',
    iconAnimation: 'off_hand',
    acceptedKinds: ['lantern', 'torch'],
  },
  { index: 6, id: 'hands', label: 'HANDS', iconAnimation: 'hands', acceptedKinds: [] },
  { index: 7, id: 'legs', label: 'LEGS', iconAnimation: 'legs', acceptedKinds: [] },
  { index: 8, id: 'feet', label: 'FEET', iconAnimation: 'feet', acceptedKinds: [] },
] as const;

export const ACTIVE_EQUIPMENT_SLOTS = EQUIPMENT_SLOTS.filter(
  (slot) => slot.acceptedKinds.length > 0,
);

export type ActiveEquipmentSlotId = (typeof ACTIVE_EQUIPMENT_SLOTS)[number]['id'];

export const ACTIVE_EQUIPMENT_SLOT_INDEXES: readonly number[] = ACTIVE_EQUIPMENT_SLOTS
  .map((slot) => slot.index);

export const EQUIPMENT_SLOT_RESTRICTIONS = Object.fromEntries(
  EQUIPMENT_SLOTS.map((slot) => [slot.index, { acceptedKinds: [...slot.acceptedKinds] }]),
) as Readonly<Record<number, { readonly acceptedKinds: readonly string[] }>>;

export function activeEquipmentSlotAt(index: number) {
  return ACTIVE_EQUIPMENT_SLOTS.find((slot) => slot.index === index) ?? null;
}

export function activeEquipmentSlotAccepts(index: number, itemKind: string): boolean {
  const slot = activeEquipmentSlotAt(index);
  return slot !== null && (slot.acceptedKinds as readonly string[]).includes(itemKind);
}

export function equippedInventorySlot(slotIndex: number): number {
  return EQUIPMENT_SLOT_OFFSET + slotIndex;
}

export type PlayerInventoryContainerId = 'hotbar' | 'backpack' | 'equipment' | 'crafting';

export function inventoryContainerSlotOffset(containerId: PlayerInventoryContainerId): number {
  if (containerId === 'hotbar') return HOTBAR_SLOT_OFFSET;
  if (containerId === 'backpack') return BACKPACK_SLOT_OFFSET;
  return containerId === 'equipment' ? EQUIPMENT_SLOT_OFFSET : CRAFTING_SLOT_OFFSET;
}

export function inventoryContainerSlotCount(containerId: PlayerInventoryContainerId): number {
  if (containerId === 'hotbar') return HOTBAR_SLOT_COUNT;
  if (containerId === 'backpack') return BACKPACK_SLOT_COUNT;
  return containerId === 'equipment' ? EQUIPMENT_SLOT_COUNT : CRAFTING_SLOT_COUNT;
}

export function accessibleBackpackSlotCount(hasBackpack: boolean): number {
  return hasBackpack ? BACKPACK_SLOT_COUNT : BASE_BACKPACK_CAPACITY;
}

export function hotbarSlotForInputCode(code: string): number | null {
  const slot = HOTBAR_SLOT_BINDINGS.findIndex((binding) => (
    (binding.codes as readonly string[]).includes(code)
  ));
  return slot < 0 ? null : slot;
}

export function hotbarSlotLabel(slot: number): string | null {
  return HOTBAR_SLOT_BINDINGS[slot]?.label ?? null;
}

export function isHotbarSlot(slot: number): boolean {
  return Number.isInteger(slot) && slot >= 0 && slot < HOTBAR_SLOT_COUNT;
}
