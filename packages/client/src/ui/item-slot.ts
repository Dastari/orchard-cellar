import { slotAcceptsItem, type ItemStack, type SlotRestriction } from '@orchard/sim';
import type { UiRect } from './geometry.js';
import { widget, type WidgetNode } from './widget.js';

export type InventoryContainerId = 'hotbar' | 'backpack' | 'equipment' | 'crafting' | 'chest' | 'placeable';

export const EQUIPMENT_SLOT_RESTRICTIONS: readonly SlotRestriction[] = [
  { requiredTags: ['gear.neck'] },
  { requiredTags: ['gear.head'] },
  { requiredTags: ['gear.ring'] },
  { requiredTags: ['gear.hand'] },
  { requiredTags: ['gear.body'] },
  { requiredTags: ['gear.hand'] },
  { requiredTags: ['gear.hands'] },
  { requiredTags: ['gear.legs'] },
  { requiredTags: ['gear.feet'] },
];

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
    readonly restriction?: SlotRestriction,
  ) {
    this.node = widget('slot', id, {
      props: { containerId, index, restriction },
      capturePointer: true,
    });
  }

  get bounds(): UiRect { return this.node.bounds; }
  get enabled(): boolean { return this.node.enabled; }
  get visible(): boolean { return this.node.visible; }
  set enabled(enabled: boolean) { this.node.enabled = enabled; }
  set visible(visible: boolean) { this.node.visible = visible; }
  setBounds(bounds: UiRect): void { this.node.setBounds(bounds); }

  accepts(itemKind: string): boolean {
    if (!this.enabled) return false;
    return slotAcceptsItem({
      id: this.containerId,
      capacity: this.index + 1,
      slots: Array.from({ length: this.index + 1 }, (_, index) => index === this.index ? this.item : null),
      ...(this.restriction ? { restrictions: { [this.index]: this.restriction } } : {}),
    }, this.index, itemKind);
  }
}
