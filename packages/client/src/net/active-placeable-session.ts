import type { PlaceableContainerCell, WorldPlaceable } from '@orchard/world-bindings/types';
import type { KeyedStore } from './keyed-store.js';

/**
 * The player's open placeable session (the `own_active_placeable` and `own_open_placeable_container_cells` views) and
 * the chest compatibility copies the chest window reads (BUG-058). Cells are keyed by their container index (Uncapped
 * Storage step 4c).
 *
 * The server can replace one session with another in a single transaction: using a chest while a workbench, or
 * another chest, is still open. The view then reports the new row and the removal of the old one, in either order.
 * A removal therefore only ends the session (or empties a slot) when it names the placeable that is still current,
 * so a late removal of the old row can never erase the new session and leave "Chest opened" with no window.
 */
export class ActivePlaceableSession<Chest, ChestSlot> {
  private activeRow: WorldPlaceable | null = null;
  private chestView: Chest | null = null;

  constructor(
    private readonly slots: KeyedStore<number, PlaceableContainerCell>,
    private readonly chestSlots: KeyedStore<number, ChestSlot>,
    private readonly chest: {
      readonly isChest: (row: WorldPlaceable) => boolean;
      readonly toChest: (row: WorldPlaceable) => Chest;
      readonly toChestSlot: (row: PlaceableContainerCell) => ChestSlot;
    },
  ) {}

  get active(): WorldPlaceable | null { return this.activeRow; }
  get activeChest(): Chest | null { return this.chestView; }

  /** A session opened or changed (insert or update of the active row). */
  setActive(row: WorldPlaceable): void {
    this.activeRow = row;
    this.chestView = this.chest.isChest(row) ? this.chest.toChest(row) : null;
    this.syncChestSlots();
  }

  /** The active row was removed. Ignored when a newer session has already replaced it. */
  deleteActive(row: Pick<WorldPlaceable, 'id'>): void {
    if (this.activeRow !== null && this.activeRow.id !== row.id) return;
    this.activeRow = null; this.chestView = null; this.chestSlots.clear();
    // Slot rows of a replacing session can arrive first; only the ended placeable's rows go.
    for (const slot of [...this.slots]) if (slot.placeableId === row.id) this.slots.delete(slot.index);
  }

  setSlot(row: PlaceableContainerCell): void {
    this.slots.set(row.index, row);
    if (this.chestView !== null && row.placeableId === this.activeRow?.id) this.chestSlots.set(row.index, this.chest.toChestSlot(row));
  }

  /** A slot row was removed. Ignored when the slot already holds the replacing session's row. */
  deleteSlot(row: PlaceableContainerCell): void {
    const current = this.slots.get(row.index);
    if (current !== undefined && current.placeableId !== row.placeableId) return;
    this.slots.delete(row.index); this.chestSlots.delete(row.index);
  }

  /** Rebuilds the session from a fresh subscription snapshot. */
  hydrate(active: WorldPlaceable | null, rows: Iterable<PlaceableContainerCell>): void {
    this.slots.clear();
    for (const row of rows) if (row.placeableId === active?.id) this.slots.set(row.index, row);
    if (active === null) { this.activeRow = null; this.chestView = null; this.chestSlots.clear(); }
    else this.setActive(active);
  }

  reset(): void {
    this.activeRow = null; this.chestView = null;
    this.slots.clear(); this.chestSlots.clear();
  }

  /** The chest copies are exactly the active chest's own slot rows. */
  private syncChestSlots(): void {
    this.chestSlots.clear();
    const active = this.activeRow;
    if (active === null || this.chestView === null) return;
    for (const row of this.slots) if (row.placeableId === active.id) this.chestSlots.set(row.index, this.chest.toChestSlot(row));
  }
}
