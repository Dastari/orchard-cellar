import { BASE_BACKPACK_CAPACITY, accessibleBackpackCapacity, runtimeItemInventoryCapacity, type ContentRegistry } from '@orchard/sim';

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
