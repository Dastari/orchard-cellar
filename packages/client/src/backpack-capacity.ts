import { BASE_BACKPACK_CAPACITY, EQUIPMENT_SLOT_OFFSET, accessibleBackpackCapacity, isAccessibleCarriedSlot, runtimeItemInventoryCapacity, type ContentRegistry } from '@orchard/sim';

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

/** The carried rows the world's bow draws ammunition from (BUG-068): the hotbar and the accessible backpack cells,
 * for the equipped bag and debug slots. Stranded cells past a smaller bag, equipment and the crafting grid are left out,
 * so the client refuses a draw the server would refuse. */
export function reachableCarriedRows<T extends { readonly slot: number; readonly itemKind: string; readonly quantity: number }>(
  registry: ContentRegistry, rows: Iterable<T>, debugBackpackSlots = 0,
): T[] {
  const all = [...rows];
  const capacity = clientBackpackSlotCapacity(registry, all.find(row => row.slot === EQUIPMENT_SLOT_OFFSET + 4), debugBackpackSlots);
  return all.filter(row => isAccessibleCarriedSlot(row.slot, capacity));
}
