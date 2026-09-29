import { CRAFTING_SLOT_COUNT, EQUIPMENT_SLOT_COUNT, HOTBAR_SLOT_COUNT } from './inventory-layout.js';

/**
 * Container-scoped addressing (Uncapped Storage step 4, wiki Roadmap/Uncapped Storage). A player cell is a container
 * plus a u32 index, a placeable cell is a placeable id plus a u32 index. Capacity comes only from the granting item or
 * object, so no container's size can move another container's numbers; equipment keeps its ten indices forever.
 */
export const PLAYER_CONTAINERS = ['hotbar', 'backpack', 'equipment', 'crafting', 'stash'] as const;
export type PlayerContainerId = (typeof PLAYER_CONTAINERS)[number];
/** The containers the legacy `inventory_slot` table numbered globally; the stash had its own table. */
export const LEGACY_GLOBAL_SLOT_CONTAINERS = ['hotbar', 'backpack', 'equipment', 'crafting'] as const;

export interface PlayerContainerCellRef {
  readonly container: PlayerContainerId;
  readonly index: number;
}
export interface PlaceableContainerCellRef {
  readonly placeableId: bigint;
  readonly index: number;
}

export const U32_MAX = 0xffff_ffff;
/** Storage-layer bound on any one container. Content's `MAX_CONTAINER_CAPACITY` equals it (Uncapped Storage step 5). */
export const CONTAINER_CELL_CAPACITY_LIMIT = 65_535;

/** Fixed sizes stay fixed; backpack and stash sizes come from the equipped bag and the stash content. */
const FIXED_PLAYER_CONTAINER_CAPACITY: Readonly<Partial<Record<PlayerContainerId, number>>> = Object.freeze({
  hotbar: HOTBAR_SLOT_COUNT,
  equipment: EQUIPMENT_SLOT_COUNT,
  crafting: CRAFTING_SLOT_COUNT,
});

export function isPlayerContainerId(value: unknown): value is PlayerContainerId {
  return typeof value === 'string' && (PLAYER_CONTAINERS as readonly string[]).includes(value);
}

/** The container's fixed capacity, or null when the granting item or content decides it. */
export function fixedPlayerContainerCapacity(container: PlayerContainerId): number | null {
  return FIXED_PLAYER_CONTAINER_CAPACITY[container] ?? null;
}

export function isContainerCellIndex(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= U32_MAX;
}

/** A u32 cell index, or `container_cell_index_invalid`. */
export function containerCellIndex(value: unknown): number {
  if (!isContainerCellIndex(value)) throw new Error('container_cell_index_invalid');
  return value;
}

/** A validated player cell: a known container, a u32 index, and within a fixed container's size. */
export function playerContainerCell(container: PlayerContainerId, index: number): PlayerContainerCellRef {
  if (!isPlayerContainerId(container)) throw new Error('container_id_invalid');
  const fixed = fixedPlayerContainerCapacity(container);
  if (containerCellIndex(index) >= (fixed ?? CONTAINER_CELL_CAPACITY_LIMIT)) throw new Error('container_cell_index_invalid');
  return Object.freeze({ container, index });
}

/** Equipment index of the Main Hand cell; the paper-doll order in `EQUIPMENT_SLOTS` never changes. */
export const MAIN_HAND_EQUIPMENT_INDEX = 3;
/**
 * The stored `player_survival.selectedSlot` value that selects the Main Hand weapon. It was the legacy global slot of
 * that cell and stays this literal forever: it is a name, not an offset, so no stored value changes when the layout
 * does. Values 0..hotbar-1 select a hotbar cell.
 */
export const MAIN_HAND_SELECTED_SLOT = 33;

export function isMainHandSelectedSlot(selectedSlot: number): boolean {
  return selectedSlot === MAIN_HAND_SELECTED_SLOT;
}

/** The cell a stored `selectedSlot` addresses: a hotbar cell or the Main Hand equipment cell; null otherwise. */
export function selectedSlotCell(selectedSlot: number): PlayerContainerCellRef | null {
  if (isMainHandSelectedSlot(selectedSlot)) return Object.freeze({ container: 'equipment', index: MAIN_HAND_EQUIPMENT_INDEX });
  return Number.isInteger(selectedSlot) && selectedSlot >= 0 && selectedSlot < HOTBAR_SLOT_COUNT
    ? Object.freeze({ container: 'hotbar', index: selectedSlot })
    : null;
}

/**
 * The legacy global numbering, frozen as it stood when the sparse layout replaced it (equipment layout version 1:
 * hotbar 0-9, backpack 10-29, equipment 30-39, crafting 40-48). Literal on purpose: later layout constants may grow,
 * but rows written under this numbering must always decode the same way.
 */
export const LEGACY_GLOBAL_SLOT_LAYOUT: readonly { readonly container: PlayerContainerId; readonly offset: number; readonly count: number }[] =
  Object.freeze([
    Object.freeze({ container: 'hotbar', offset: 0, count: 10 }),
    Object.freeze({ container: 'backpack', offset: 10, count: 20 }),
    Object.freeze({ container: 'equipment', offset: 30, count: 10 }),
    Object.freeze({ container: 'crafting', offset: 40, count: 9 }),
  ] as const);
export const LEGACY_GLOBAL_SLOT_COUNT = 49;

/** Legacy global slot to its cell; null when the slot is outside the legacy layout. Migration and transitional code only. */
export function legacyGlobalSlotToCell(slot: number): PlayerContainerCellRef | null {
  if (!Number.isInteger(slot)) return null;
  const range = LEGACY_GLOBAL_SLOT_LAYOUT.find(({ offset, count }) => slot >= offset && slot < offset + count);
  return range === undefined ? null : Object.freeze({ container: range.container, index: slot - range.offset });
}

/** Cell to its legacy global slot; null for the stash or an index the legacy layout never had. */
export function cellToLegacyGlobalSlot(cell: PlayerContainerCellRef): number | null {
  const range = LEGACY_GLOBAL_SLOT_LAYOUT.find(({ container }) => container === cell.container);
  return range === undefined || !Number.isInteger(cell.index) || cell.index < 0 || cell.index >= range.count
    ? null : range.offset + cell.index;
}

const CANONICAL_INDEX = /^(0|[1-9][0-9]{0,9})$/u;
const CANONICAL_U64 = /^(0|[1-9][0-9]{0,19})$/u;
const U64_MAX = (1n << 64n) - 1n;

function parseIndex(text: string): number | null {
  if (!CANONICAL_INDEX.test(text)) return null;
  const value = Number(text);
  return isContainerCellIndex(value) ? value : null;
}

/** Primary key of a `player_container_cell` row: `identity:container:index`. `identity` is the identity hex string. */
export function playerContainerCellKey(identity: string, cell: PlayerContainerCellRef): string {
  if (identity.length === 0 || identity.includes(':')) throw new Error('container_cell_owner_invalid');
  if (!isPlayerContainerId(cell.container)) throw new Error('container_id_invalid');
  return `${identity}:${cell.container}:${containerCellIndex(cell.index)}`;
}

/** Inverse of `playerContainerCellKey`; null for anything that is not exactly a canonical key. */
export function parsePlayerContainerCellKey(key: string): (PlayerContainerCellRef & { readonly identity: string }) | null {
  const parts = key.split(':');
  if (parts.length !== 3) return null;
  const [identity, container, indexText] = parts as [string, string, string];
  const index = parseIndex(indexText);
  if (identity.length === 0 || !isPlayerContainerId(container) || index === null) return null;
  return Object.freeze({ identity, container, index });
}

/** Primary key of a `placeable_container_cell` row: `placeableId:index` (the legacy placeable slot key shape). */
export function placeableContainerCellKey(cell: PlaceableContainerCellRef): string {
  if (typeof cell.placeableId !== 'bigint' || cell.placeableId < 0n || cell.placeableId > U64_MAX) {
    throw new Error('container_cell_owner_invalid');
  }
  return `${cell.placeableId}:${containerCellIndex(cell.index)}`;
}

export function parsePlaceableContainerCellKey(key: string): PlaceableContainerCellRef | null {
  const parts = key.split(':');
  if (parts.length !== 2 || !CANONICAL_U64.test(parts[0]!)) return null;
  const placeableId = BigInt(parts[0]!);
  const index = parseIndex(parts[1]!);
  return placeableId > U64_MAX || index === null ? null : Object.freeze({ placeableId, index });
}
