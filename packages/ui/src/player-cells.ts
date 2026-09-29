import {
  EQUIPMENT_SLOTS, accessibleBackpackCapacity, isAccessibleCarriedCell as isAccessibleCarriedCellForCapacity, type ActiveEquipmentSlotId,
} from '@orchard/sim/inventory-layout';
import { selectedSlotCell, type PlayerContainerCellRef, type PlayerContainerId } from '@orchard/sim/container-addressing';

/**
 * The player's items by container and cell (Uncapped Storage step 4c, wiki Roadmap/Uncapped Storage). The world keeps
 * one sparse `player_container_cell` row per occupied cell, a container plus a u32 index, so no container's size can
 * move another container's numbers. The client and UI address the player's items only this way.
 */
export interface PlayerCellStack extends PlayerContainerCellRef {
  readonly itemKind: string;
  readonly quantity: number;
  readonly durability?: number;
  readonly lit?: boolean;
}

/** The containers the player carries: the stash stays at the hearth and is shown only while it is open. */
export const CARRIED_PLAYER_CONTAINERS: readonly PlayerContainerId[] = Object.freeze(['hotbar', 'backpack', 'equipment', 'crafting']);

/** An equipment cell's index by its paper-doll id; the indices never change. */
export function equipmentCellIndex(id: ActiveEquipmentSlotId): number {
  return EQUIPMENT_SLOTS.find(slot => slot.id === id)!.index;
}
/** The Pack cell: the equipped bag decides the backpack's capacity. */
export const BACKPACK_EQUIPMENT_INDEX = equipmentCellIndex('backpack');
/** The Off Hand cell: a switchable light is equipped and lit here. */
export const OFF_HAND_EQUIPMENT_INDEX = equipmentCellIndex('off_hand');

export function isCarriedPlayerContainer(container: PlayerContainerId): boolean {
  return container !== 'stash';
}

export function sameCell(left: PlayerContainerCellRef, right: PlayerContainerCellRef): boolean {
  return left.container === right.container && left.index === right.index;
}

/** The row in one cell, or undefined; a null cell (an unset selection) finds nothing. */
export function playerCellRow<T extends PlayerContainerCellRef>(rows: Iterable<T>, cell: PlayerContainerCellRef | null): T | undefined {
  if (cell === null) return undefined;
  for (const row of rows) if (row.container === cell.container && row.index === cell.index) return row;
  return undefined;
}

/** The row a stored `selectedSlot` names: a hotbar cell or the Main Hand equipment cell. */
export function selectedCellRow<T extends PlayerContainerCellRef>(rows: Iterable<T>, selectedSlot: number): T | undefined {
  return playerCellRow(rows, selectedSlotCell(selectedSlot));
}

/** A real stack: the world never stores vacant cells, but older snapshots and fixtures keep explicit `empty` rows. */
export function isOccupiedCell(row: { readonly itemKind: string; readonly quantity: number }): boolean {
  return row.itemKind !== 'empty' && row.quantity > 0;
}

/** The carried cells a player draws from outside a menu (BUG-068): the hotbar and the backpack cells the accessible
 * capacity opens. Never equipment, the crafting grid, the stash, or cells stranded past a smaller bag. The world's rule
 * (the sim's `isAccessibleCarriedCell`), with `backpackCapacity` passed through `accessibleBackpackCapacity` first, which
 * leaves an already accessible capacity unchanged; bow ammunition, crafting and selling all use it. */
export function isAccessibleCarriedCell(cell: PlayerContainerCellRef, backpackCapacity: number): boolean {
  return isAccessibleCarriedCellForCapacity(cell, accessibleBackpackCapacity(backpackCapacity));
}
