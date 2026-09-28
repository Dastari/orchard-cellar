import { BASE_BACKPACK_CAPACITY, accessibleBackpackCapacity, runtimeItemInventoryCapacity, type ContentRegistry, type PlayerContainerCellRef } from '@orchard/sim';
import { BACKPACK_EQUIPMENT_INDEX, isAccessibleCarriedCell } from '@orchard/ui';

/** The equipped bag's authored capacity: the base 8 with no bag, a retired bag or a bag without an authored capacity.
 * The world reads the same (`equippedInventoryCapacity`). */
export function equippedBackpackCapacity(registry: ContentRegistry, equipped: { readonly itemKind: string; readonly quantity: number } | undefined): number {
  return equipped === undefined || equipped.quantity <= 0
    ? BASE_BACKPACK_CAPACITY
    : runtimeItemInventoryCapacity(registry, equipped.itemKind) ?? BASE_BACKPACK_CAPACITY;
}

/** The backpack cells the client shows as usable (BUG-054): the world's own rule, `accessibleBackpackCapacity`, so a
 * bag authored below 8 cells still opens the base 8 the server accepts. */
export function clientBackpackSlotCapacity(registry: ContentRegistry, equipped: { readonly itemKind: string; readonly quantity: number } | undefined, debugBackpackSlots = 0): number {
  return accessibleBackpackCapacity(equippedBackpackCapacity(registry, equipped), debugBackpackSlots);
}

/** The equipped bag's row: the Pack equipment cell. */
export function equippedBackpackRow<T extends PlayerContainerCellRef>(rows: Iterable<T>): T | undefined {
  for (const row of rows) if (row.container === 'equipment' && row.index === BACKPACK_EQUIPMENT_INDEX) return row;
  return undefined;
}

/** The carried rows the world's bow draws ammunition from (BUG-068): the hotbar and the accessible backpack cells,
 * for the equipped bag and debug slots. Stranded cells past a smaller bag, equipment, the crafting grid and the stash
 * are left out, so the client refuses a draw the server would refuse. */
export function reachableCarriedRows<T extends PlayerContainerCellRef & { readonly itemKind: string; readonly quantity: number }>(
  registry: ContentRegistry, rows: Iterable<T>, debugBackpackSlots = 0,
): T[] {
  const all = [...rows];
  const capacity = clientBackpackSlotCapacity(registry, equippedBackpackRow(all), debugBackpackSlots);
  return all.filter(row => isAccessibleCarriedCell(row, capacity));
}
