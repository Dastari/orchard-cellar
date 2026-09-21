import type { ItemStack } from '@orchard/sim';
import { UiInventoryInteractionModel, type UiInventorySlotRef, type UiInventoryAction } from '../../design-system/inventory.js';
import { containsPoint, type UiPoint } from '../../geometry.js';
import type { UiElement, UiElementPointer } from './element.js';
/** Structural boundary lets a live host supply authority-backed transactions. */
export interface UiInventoryModel {
  readonly cursor: ItemStack | null; readonly status: string; readonly dragging: boolean;
  stack(ref: UiInventorySlotRef, preview?: boolean): ItemStack | null;
  displayedCursor(): ItemStack | null;
  canAccept(ref: UiInventorySlotRef, item?: ItemStack | null): boolean;
  pointerDown(ref: UiInventorySlotRef, button: number, options?: { readonly shift?: boolean; readonly double?: boolean }): UiInventoryAction;
  pointerEnter(ref: UiInventorySlotRef): boolean;
  /** Captured motion includes empty space, so a host can apply its pickup threshold. */
  pointerMove?(point: UiPoint, ref?: UiInventorySlotRef): void;
  pointerUp(ref?: UiInventorySlotRef, options?: { readonly shift?: boolean }): UiInventoryAction; cancel(): void;
}
export { UiInventoryInteractionModel };
export type { UiInventorySlotRef };
export class UiInventoryController {
  private slots = new Map<UiElement, UiInventorySlotRef>();
  private listeners = new Set<() => void>();
  private previous: { key: string; time: number } | undefined;
  point: UiPoint = { x: 0, y: 0 };
  constructor(readonly model: UiInventoryModel, readonly onAction?: (action: UiInventoryAction) => void) {}
  register(element: UiElement, ref: UiInventorySlotRef): () => void { this.slots.set(element, ref); return () => this.slots.delete(element); }
  subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  refresh(): void { for (const element of this.slots.keys()) element.invalidateRoot?.(false); for (const listener of this.listeners) listener(); }
  private hit(point: UiPoint): UiInventorySlotRef | undefined {
    return [...this.slots].toReversed().find(([node]) => node.visible && !node.disabled && containsPoint(node.clip, point) && containsPoint(node.rect, point))?.[1];
  }
  pointer(event: UiElementPointer, ref: UiInventorySlotRef): boolean {
    this.point = event.point;
    if (event.type === 'down' && (event.button === 0 || event.button === 2)) {
      const now = performance.now(), key = `${ref.container}:${ref.index}`;
      const action = this.model.pointerDown(ref, event.button, { shift: event.shiftKey, double: this.previous?.key === key && now - this.previous.time < 350 });
      this.previous = { key, time: now }; event.capture(); this.onAction?.(action); this.refresh(); return true;
    }
    if (event.type === 'move') {
      const target = this.hit(event.point);
      if (this.model.dragging) {
        if (this.model.pointerMove) this.model.pointerMove(event.point, target);
        else if (target) this.model.pointerEnter(target);
      }
      this.refresh(); return true;
    }
    if (event.type === 'up') { if (this.model.dragging) { const action = this.model.pointerUp(this.hit(event.point), { shift: event.shiftKey }); this.onAction?.(action); } event.release(); this.refresh(); return true; }
    if (event.type === 'cancel') { this.model.cancel(); event.release(); this.refresh(); return true; } return false;
  }
  activate(ref: UiInventorySlotRef, button = 0, shift = false): void {
    const action = this.model.pointerDown(ref, button, { shift }); this.onAction?.(action);
    if (this.model.dragging) { const released = this.model.pointerUp(ref, { shift }); this.onAction?.(released); } this.refresh();
  }
  cancel(): void { this.model.cancel(); this.refresh(); }
  dispose(): void { this.model.cancel(); this.slots.clear(); this.listeners.clear(); }
}
