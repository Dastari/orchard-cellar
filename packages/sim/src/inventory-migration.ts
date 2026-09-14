/** Additive equipment layout history, independent of the older hotbar migration.
 * Run the hotbar migration first. Version 1 inserts Body at global slot 39.
 * Cursor/overflow custody and station queues contain no global slot references.
 */
export const CURRENT_EQUIPMENT_LAYOUT_VERSION = 1;
export const CURRENT_INVENTORY_PROTOCOL_VERSION = 1;
export interface InventoryMigrationSlot {
  readonly slot: number;
  readonly itemKind: string;
  readonly quantity: number;
  readonly durability: number;
  readonly lit: boolean;
}
export interface EquipmentLayoutMigration<T extends InventoryMigrationSlot> {
  readonly version: number;
  readonly slots: readonly T[];
  readonly insertedEmptySlots: readonly number[];
}
/** Produces a complete relocation plan before authority writes any row. The
 * authority deletes moved keys then inserts their exact metadata in one reducer.
 * Unknown/future layouts and unexpected slots fail rather than overwrite items.
 */
export function migrateEquipmentLayout<T extends InventoryMigrationSlot>(
  slots: readonly T[], version: number,
): EquipmentLayoutMigration<T> {
  if (!Number.isInteger(version) || version < 0 || version > CURRENT_EQUIPMENT_LAYOUT_VERSION) {
    throw new Error('inventory_layout_version_unsupported');
  }
  const count = version === 0 ? 48 : 49;
  const seen = new Set<number>();
  for (const row of slots) {
    if (!Number.isInteger(row.slot) || row.slot < 0 || row.slot >= count || seen.has(row.slot)) {
      throw new Error('inventory_layout_rows_invalid');
    }
    seen.add(row.slot);
  }
  if (version === CURRENT_EQUIPMENT_LAYOUT_VERSION) return {version, slots, insertedEmptySlots: []};
  return {
    version: CURRENT_EQUIPMENT_LAYOUT_VERSION,
    slots: slots.map(row => row.slot < 39 ? row : {...row, slot: row.slot + 1}),
    insertedEmptySlots: [39],
  };
}
