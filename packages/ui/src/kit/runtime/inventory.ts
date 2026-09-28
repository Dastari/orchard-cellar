import type { ItemStack } from '@orchard/sim';
import { UiInventoryInteractionModel, type UiInventorySlotRef, type UiInventoryAction } from '../../design-system/inventory.js';
import { containsPoint, type UiPoint } from '../../geometry.js';
import { uiElementEnabled, type UiElement, type UiElementPointer } from './element.js';
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
/** Each of the refused-drop flash's two frames lasts this long: about 300ms in all (render 02). */
export const UI_SLOT_REFUSED_FLASH_FRAME_MS = 150;
export type { UiInventorySlotRef };
export class UiInventoryController {
  private slots = new Map<UiElement, UiInventorySlotRef>();
  private listeners = new Set<() => void>();
  private previous: { key: string; time: number } | undefined;
  private ownerPointerId: number | null = null;
  point: UiPoint = { x: 0, y: 0 };
  constructor(readonly model: UiInventoryModel, readonly onAction?: (action: UiInventoryAction) => void) {}
  register(element: UiElement, ref: UiInventorySlotRef): () => void { this.slots.set(element, ref); return () => this.slots.delete(element); }
  subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  refresh(): void { for (const element of this.slots.keys()) element.invalidateRoot?.(false); for (const listener of this.listeners) listener(); }
  /** Moves only when the slots' rules or membership change (a new frame, content or capacity), never per frame: a
   * slot keeps its drop verdict for the held stack until this, the held stack or the slot's own stack changes. */
  rulesRevision = 0;
  /** The host's slot rules or slot set changed: every slot re-checks its drop verdict. */
  invalidateRules(): void { this.rulesRevision++; this.refresh(); }
  private refusals = new Map<string, number>();
  private hit(point: UiPoint): UiInventorySlotRef | undefined { const node = this.slotElementAt(point); return node === undefined ? undefined : this.slots.get(node); }
  /** The topmost enabled slot element registered with this controller under a point (the held stack's badge reads its
   * verdict). The last registered match is on top; nothing is allocated. */
  slotElementAt(point: UiPoint): UiElement | undefined {
    let found: UiElement | undefined;
    for (const node of this.slots.keys()) if (uiElementEnabled(node) && containsPoint(node.clip, point) && containsPoint(node.rect, point)) found = node;
    return found;
  }
  /** Forgets every pending refused-drop flash: the window closed or its slots were rebuilt, so a late refusal can't
   * replay on a reopened slot with the same ref. */
  clearRefusals(): void { if (this.refusals.size > 0) { this.refusals.clear(); this.refresh(); } }
  /** Whether a slot is a target of the spread in progress (white corners; the slot under the pointer is green). */
  spreadTarget(ref: UiInventorySlotRef): boolean { void ref; return false; }
  /** Plays the refused-drop flash on these slots (owner decision 2026-09-27, render 02): released over a slot that
   * refuses the held stack, or refused by the server. */
  refuse(refs: readonly UiInventorySlotRef[], now = performance.now()): void {
    for (const ref of refs) this.refusals.set(`${ref.container}:${ref.index}`, now);
    this.refresh();
  }
  /** Visits every registered, shown slot whose refused-drop flash is playing at `now`, with its frame (the held stack
   * paints the flash again above itself; owner decision 2026-09-28). Nothing is allocated while no flash plays. */
  forEachRefusal(now: number, visit: (element: UiElement, ref: UiInventorySlotRef, frame: 1 | 2) => void): void {
    if (this.refusals.size === 0) return;
    for (const [element, ref] of this.slots) {
      if (!element.visible) continue;
      const frame = this.refusalFrame(ref, now);
      if (frame !== 0) visit(element, ref, frame);
    }
  }
  /** The refused-drop flash frame at `now`: 1 (red wash and pushed-out red corners), 2 (red corners), or 0 (rest). */
  refusalFrame(ref: UiInventorySlotRef, now: number): 0 | 1 | 2 {
    if (this.refusals.size === 0) return 0;
    const key = `${ref.container}:${ref.index}`, at = this.refusals.get(key);
    if (at === undefined) return 0;
    const elapsed = now - at;
    if (elapsed >= 0 && elapsed < UI_SLOT_REFUSED_FLASH_FRAME_MS) return 1;
    if (elapsed >= 0 && elapsed < 2 * UI_SLOT_REFUSED_FLASH_FRAME_MS) return 2;
    if (elapsed >= 2 * UI_SLOT_REFUSED_FLASH_FRAME_MS) this.refusals.delete(key);
    return 0;
  }
  private claimPointer(event: UiElementPointer): boolean {
    if (this.ownerPointerId !== null && this.ownerPointerId !== event.pointerId) return false;
    if (event.type === 'down' && event.pointerType === 'touch' && event.isPrimary === false) return false;
    if (event.type === 'down' && (event.button === 0 || event.button === 2)) this.ownerPointerId = event.pointerId;
    return true;
  }
  /** Blank-space return/drop gestures share the slot pointer's ownership. */
  background(event: UiElementPointer, handle: () => void): boolean {
    if (!this.claimPointer(event)) return true;
    handle();
    if (event.type === 'up' || event.type === 'cancel') this.ownerPointerId = null;
    this.refresh(); return true;
  }
  pointer(event: UiElementPointer, ref: UiInventorySlotRef): boolean {
    if (!this.claimPointer(event)) return true;
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
    if (event.type === 'up') { if (this.model.dragging) { const action = this.model.pointerUp(this.hit(event.point), { shift: event.shiftKey }); this.onAction?.(action); } this.ownerPointerId = null; event.release(); this.refresh(); return true; }
    if (event.type === 'cancel') { this.cancel(); event.release(); return true; } return false;
  }
  activate(ref: UiInventorySlotRef, button = 0, shift = false): void {
    if (this.ownerPointerId !== null) return;
    const node = [...this.slots].find(([node, binding]) => uiElementEnabled(node)
      && binding.container === ref.container && binding.index === ref.index)?.[0];
    if (node) this.point = { x: node.rect.x + node.rect.width / 2, y: node.rect.y + node.rect.height / 2 };
    const action = this.model.pointerDown(ref, button, { shift }); this.onAction?.(action);
    if (this.model.dragging) { const released = this.model.pointerUp(ref, { shift }); this.onAction?.(released); } this.refresh();
  }
  cancel(): void { this.ownerPointerId = null; this.model.cancel(); this.refresh(); }
  dispose(): void { this.ownerPointerId = null; this.model.cancel(); this.slots.clear(); this.listeners.clear(); this.refusals.clear(); }
}
