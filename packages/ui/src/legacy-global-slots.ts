import { cellToLegacyGlobalSlot, type PlayerContainerCellRef } from '@orchard/sim/container-addressing';

/**
 * The one client and UI boundary to the frozen legacy global slot numbering (Uncapped Storage step 4c). The client's
 * inventory model, its subscriptions and its container reducer calls are all container + u32 index; only these two
 * sim/world contracts still take a legacy global slot, and they get one only through here:
 *
 * - `compileEquipmentLoadout` (sim) reads rows by global slot (the world adapts the same way, `legacySlotRows` in
 *   packages/world/src/container-cells.ts).
 * - `use_selected`'s `equipmentSlot` argument (world) names an equipment cell by its global slot.
 *
 * Equipment, the hotbar and the crafting grid are fixed, so every one of their cells has a legacy slot; a backpack
 * cell past the legacy 20 has none and is left out, as the legacy numbering could not hold it (no loadout reads the
 * backpack). Remove this module when those two contracts take cells.
 */
export function legacySlotRows<T extends PlayerContainerCellRef>(cells: Iterable<T>): (T & { readonly slot: number })[] {
  const rows: (T & { readonly slot: number })[] = [];
  for (const cell of cells) {
    if (cell.container === 'stash') continue;
    const slot = cellToLegacyGlobalSlot(cell);
    if (slot !== null) rows.push({ ...cell, slot });
  }
  return rows;
}

/** `use_selected`'s `equipmentSlot` for an equipment cell. */
export function legacyEquipmentUseSlot(equipmentIndex: number): number {
  const slot = cellToLegacyGlobalSlot({ container: 'equipment', index: equipmentIndex });
  if (slot === null) throw new Error('equipment_cell_index_invalid');
  return slot;
}
