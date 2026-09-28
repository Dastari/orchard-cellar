import type { ContainerSnapshot, ItemContainerContentResolver, ItemStack, SlotRestriction } from '@orchard/sim';
import { EQUIPMENT_SLOT_COUNT, EQUIPMENT_SLOT_RESTRICTIONS as SHARED_EQUIPMENT_SLOT_RESTRICTIONS } from '@orchard/sim/inventory-layout';
import { BOOTSTRAP_ITEM_CONTAINER_CONTENT, slotAcceptsItem } from '@orchard/sim/item-containers';
import type { UiRect } from './geometry.js';
import { widget, type WidgetNode } from './widget.js';

export type InventoryContainerId = 'hotbar' | 'backpack' | 'equipment' | 'crafting' | 'chest' | 'placeable' | 'stash';

export const EQUIPMENT_SLOT_RESTRICTIONS: readonly SlotRestriction[] = Array.from(
  { length: EQUIPMENT_SLOT_COUNT },
  (_, index) => SHARED_EQUIPMENT_SLOT_RESTRICTIONS[index]!,
);

/** Empty destinations that cannot accept the carried item use the shared deny
 * treatment. Occupied slots stay visually stable because clicking them may
 * still pick up or swap their existing stack. */
export function itemSlotRejectsCursor(slot: ItemSlot, cursor: ItemStack | null | undefined): boolean {
  return cursor != null && slot.enabled && slot.item === null && !slot.accepts(cursor.itemKind);
}

/** Retained inventory cell shared by hotbars, bags, equipment, and containers. */
export class ItemSlot {
  readonly node: WidgetNode;
  item: ItemStack | null = null;

  constructor(
    id: string,
    readonly containerId: InventoryContainerId,
    readonly index: number,
    restriction?: SlotRestriction,
    private contentResolver: ItemContainerContentResolver = BOOTSTRAP_ITEM_CONTAINER_CONTENT,
  ) {
    this.restriction = restriction;
    this.node = widget('slot', id, {
      props: { containerId, index, restriction },
      capturePointer: true,
    });
  }

  restriction?: SlotRestriction;

  get bounds(): UiRect { return this.node.bounds; }
  get enabled(): boolean { return this.node.enabled; }
  get visible(): boolean { return this.node.visible; }
  set enabled(enabled: boolean) { this.node.enabled = enabled; }
  set visible(visible: boolean) { this.node.visible = visible; }
  setBounds(bounds: UiRect): void { this.node.setBounds(bounds); }
  setRestriction(restriction: SlotRestriction | undefined): void { this.restriction = restriction; }
  setContentResolver(contentResolver: ItemContainerContentResolver): void {
    this.contentResolver = contentResolver;
  }

  accepts(itemKind: string): boolean {
    if (!this.enabled) return false;
    // The rule reads the slot's index, capacity and restriction, not its contents; the one-slot container is kept
    // until the restriction changes, so a check allocates nothing.
    if (this.acceptContainer === null || this.acceptContainerRestriction !== this.restriction) {
      this.acceptContainerRestriction = this.restriction;
      this.acceptContainer = {
        id: this.containerId, capacity: this.index + 1, slots: [],
        ...(this.restriction ? { restrictions: { [this.index]: this.restriction } } : {}),
      };
    }
    return slotAcceptsItem(this.acceptContainer, this.index, itemKind, this.contentResolver);
  }
  private acceptContainer: ContainerSnapshot | null = null;
  private acceptContainerRestriction: SlotRestriction | undefined;
}

/** Every inventory container the host keeps slots for, in the order it lists them. */
export const INVENTORY_CONTAINER_IDS: readonly InventoryContainerId[] = ['hotbar', 'backpack', 'equipment', 'crafting', 'chest', 'placeable', 'stash'];

export function isInventoryContainerId(container: string): container is InventoryContainerId {
  return (INVENTORY_CONTAINER_IDS as readonly string[]).includes(container);
}

/** Retained item slots by container and cell index (Uncapped Storage). A cell's slot is made the first time it is
 * looked up, so no container has a fixed length: its size comes from whatever grants it. The same cell is always the
 * same slot, so state kept per slot (predictions, a press's spread targets, bounds) survives between lookups. */
export class ItemSlotTable {
  /** Each container's slots made so far, sorted by index. */
  private readonly containers = new Map<InventoryContainerId, ItemSlot[]>();

  constructor(private readonly make: (container: InventoryContainerId, index: number) => ItemSlot) {}

  /** The cell's slot, made on first use. */
  slot(container: InventoryContainerId, index: number): ItemSlot {
    if (!Number.isSafeInteger(index) || index < 0) throw new RangeError(`No ${container} cell ${index}`);
    const found = this.slotsOf(container), at = position(found, index);
    if (found[at]?.index === index) return found[at]!;
    const made = this.make(container, index), slots = this.slotsOf(container);
    slots.splice(position(slots, index), 0, made);
    return made;
  }

  private slotsOf(container: InventoryContainerId): ItemSlot[] {
    let slots = this.containers.get(container);
    if (!slots) { slots = []; this.containers.set(container, slots); }
    return slots;
  }

  /** The slot for a reference from outside (a kit binding, a gesture), or null when it names no inventory cell. */
  find(container: string, index: number): ItemSlot | null {
    return isInventoryContainerId(container) && Number.isSafeInteger(index) && index >= 0 ? this.slot(container, index) : null;
  }

  /** Cells 0 to count - 1 of a container. */
  range(container: InventoryContainerId, count: number): ItemSlot[] {
    const slots: ItemSlot[] = [];
    for (let index = 0; index < count; index += 1) slots.push(this.slot(container, index));
    return slots;
  }

  /** One container's slots made so far, by index. */
  made(container: InventoryContainerId): readonly ItemSlot[] { return this.containers.get(container) ?? []; }

  /** Every slot made so far, by container (in INVENTORY_CONTAINER_IDS order) and index. */
  all(): ItemSlot[] { return INVENTORY_CONTAINER_IDS.flatMap(container => this.made(container)); }
}

/** Where a cell's slot is, or goes, in a container's slots sorted by index. */
function position(slots: readonly ItemSlot[], index: number): number {
  let low = 0, high = slots.length;
  while (low < high) { const middle = (low + high) >> 1; if (slots[middle]!.index < index) low = middle + 1; else high = middle; }
  return low;
}
