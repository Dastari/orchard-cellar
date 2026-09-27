import type { ItemStack } from '@orchard/sim';
import { itemStacksCompatible } from '@orchard/sim/item-containers';
import type { UiPoint } from '../../geometry.js';
import { UiInventoryController, type UiInventoryModel, type UiInventorySlotRef } from '../runtime/inventory.js';
import type { UiElementPointer } from '../runtime/element.js';

/** A slot's place in the inventory: the container id and the index in it. */
export type UiSlotRef = UiInventorySlotRef;
/** Left places or picks up the whole stack and spreads evenly; right places one or splits, and spreads one each. */
export type UiSlotButton = 'left' | 'right';
export type UiSlotSpreadMode = 'even' | 'one_each';

/** A press moves the pressed stack once the pointer travels this far (logical pixels). It is below the backpack
 * scrollbar's 4px swipe threshold, so pickup wins a horizontal drag. */
export const UI_SLOT_PICKUP_DISTANCE = 3;
/** Two clicks of the same item in the same region within this window are a double-click. */
export const UI_SLOT_DOUBLE_CLICK_MS = 500;

/** What the controller reads: the surface's stacks and rules, per slot ref. The host's predicted view is the one to
 * report, so a gesture sees what the player sees. */
export interface UiSlotSource {
  /** The held stack. */
  cursor(): ItemStack | null;
  /** Whether the ref is a live, enabled slot of the open surface. */
  has(ref: UiSlotRef): boolean;
  stack(ref: UiSlotRef): ItemStack | null;
  /** The slot's rules for this item kind (the authority's restriction record, through the sim's `slotAcceptsItem`). */
  accepts(ref: UiSlotRef, itemKind: string): boolean;
  maxStack(itemKind: string): number;
  /** The containers a quick move of everything takes from, for a press in this container. Clicks in the same
   * source region pair up as a double-click. */
  quickMoveSources(container: string): readonly string[];
  /** The slot under a point, or null for empty space. */
  slotAt(point: UiPoint): UiSlotRef | null;
}

/** What the controller asks for: one call per reducer (wiki Roadmap/Item Slot Component, "Drag and drop
 * ownership"). The host predicts each change on its visible containers and then calls the reducer; the server
 * stays the authority. */
export interface UiSlotAuthority {
  /** Click a slot with the held stack (`inventoryCursorClick`). False when the prediction refused, so no reducer ran. */
  click(ref: UiSlotRef, button: UiSlotButton): boolean;
  /** Show the spread of the held stack over these slots (presentation only; recomputed from the originals). */
  previewSpread(targets: readonly UiSlotRef[], mode: UiSlotSpreadMode): void;
  /** Put back what `previewSpread` showed. */
  cancelSpread(): void;
  /** Commit the spread over these slots (`inventoryCursorQuickCraft`). */
  spread(targets: readonly UiSlotRef[], mode: UiSlotSpreadMode): void;
  /** Move one stack to the other side (`quickMoveMenuItem`). */
  quickMove(ref: UiSlotRef): void;
  /** Move every stack of this kind from the press's source region to the other side (`quickMoveAllMenuItems`). */
  quickMoveAll(itemKind: string, container: string): void;
  /** Gather matching stacks into the held stack (`inventoryCursorPickupAll`). */
  collect(): void;
  /** Drop the held stack, or one of it for the right button, outside the window (`dropInventoryCursor`). */
  drop(button: UiSlotButton): void;
  /** Put the held stack back, from a press on empty space inside the window (`returnInventoryCursor`). */
  return(): void;
}

/** One press on a slot, from pointer-down to pointer-up. */
export interface UiSlotPress {
  readonly origin: UiSlotRef;
  readonly button: UiSlotButton;
  /** A stack was held at pointer-down: the press places or spreads it. */
  readonly cursorWasHeld: boolean;
  readonly startPoint: UiPoint;
  /** Shift was held at pointer-down. */
  readonly shift: boolean;
  /** When the press went down (performance.now): a double-click is decided from it. */
  readonly pressedAt: number;
  /** The pointer travelled the pickup distance from where the press went down. */
  readonly moved: boolean;
  /** Spread targets in visit order (a held stack only). */
  readonly targets: readonly UiSlotRef[];
  /** The press left its origin slot. */
  readonly dragged: boolean;
  /** The pressed stack was picked up by moving past the pickup distance. */
  readonly pickedUpDuringDrag: boolean;
}
interface MutablePress extends Omit<UiSlotPress, 'targets' | 'dragged' | 'pickedUpDuringDrag' | 'moved'> {
  readonly targets: UiSlotRef[]; dragged: boolean; pickedUpDuringDrag: boolean; moved: boolean;
}
interface ClickRecord { readonly itemKind: string; readonly sourceRegion: string; readonly at: number }

const sameRef = (left: UiSlotRef, right: UiSlotRef) => left.container === right.container && left.index === right.index;
const buttonOf = (button: number): UiSlotButton => button === 2 ? 'right' : 'left';
const pastPickup = (from: UiPoint, to: UiPoint) => {
  const dx = to.x - from.x, dy = to.y - from.y; return dx * dx + dy * dy >= UI_SLOT_PICKUP_DISTANCE * UI_SLOT_PICKUP_DISTANCE;
};

/**
 * The inventory gesture state machine: pickup past 3px, click, right-click split, drag to spread (evenly or one
 * each), Shift quick move, double-click collect or move-all, and drops outside the window or returns inside it.
 * It holds no stacks: it reads them from a `UiSlotSource` and changes them only through a `UiSlotAuthority`.
 * `UiSlotController` routes kit pointer input into it; a host that still hit-tests its own slots calls it directly.
 */
export class UiSlotGestures {
  private current: MutablePress | null = null;
  private outside: UiSlotButton | null = null;
  private lastShiftClick: ClickRecord | null = null;
  private lastCursorClick: (ClickRecord & { readonly transferCandidate: boolean }) | null = null;
  private readonly refusalListeners = new Set<(refs: readonly UiSlotRef[]) => void>();

  constructor(readonly source: UiSlotSource, readonly authority: UiSlotAuthority) {}

  /** Reports slots that refused the held stack: a release over a slot that refuses it, or a move the server
   * rejected (the host calls this). The kit plays the refused-drop flash on them. */
  refused(refs: readonly UiSlotRef[]): void { if (refs.length > 0) for (const listener of this.refusalListeners) listener(refs); }
  /** Listens for refused slots; returns the unsubscribe. */
  onRefused(listener: (refs: readonly UiSlotRef[]) => void): () => void {
    this.refusalListeners.add(listener); return () => this.refusalListeners.delete(listener);
  }

  /** The press in progress, if any. */
  get press(): UiSlotPress | null { return this.current; }
  /** A slot press is in progress (the kit's `dragging`). */
  get pressing(): boolean { return this.current !== null; }

  /** Pointer-down on a slot. Shift and the press time (for the double-click) are read here, at the press. */
  begin(ref: UiSlotRef, point: UiPoint, button: number, modifiers: { readonly shift?: boolean } = {}): boolean {
    if (!this.source.has(ref)) return false;
    const cursor = this.source.cursor(), cursorWasHeld = cursor != null, stack = this.source.stack(ref);
    const originEligible = cursor != null && this.source.accepts(ref, cursor.itemKind)
      && (stack === null || (itemStacksCompatible(stack, cursor) && stack.quantity < this.source.maxStack(cursor.itemKind)));
    this.current = {
      origin: ref, button: buttonOf(button), cursorWasHeld, startPoint: point, shift: modifiers.shift === true, pressedAt: performance.now(),
      targets: cursorWasHeld && originEligible ? [ref] : [], dragged: false, pickedUpDuringDrag: false, moved: false,
    };
    if (cursorWasHeld && originEligible) this.authority.previewSpread(this.current.targets, this.spreadMode(this.current));
    return true;
  }

  /** Pointer-down on empty space: with a held stack, its release drops (outside the window) or returns it. */
  pressOutside(button: number): boolean {
    if (this.source.cursor() === null) return false;
    this.outside = buttonOf(button); return true;
  }

  /** Pointer motion during a press; `target` is the slot under the pointer, or null. */
  move(point: UiPoint, target: UiSlotRef | null): void {
    const press = this.current;
    if (press !== null && !press.moved && pastPickup(press.startPoint, point)) press.moved = true;
    if (press !== null && !press.cursorWasHeld && !press.pickedUpDuringDrag && this.source.stack(press.origin) !== null) {
      if (pastPickup(press.startPoint, point) && this.authority.click(press.origin, press.button)) {
        press.pickedUpDuringDrag = true; press.dragged = true;
      }
    }
    if (press?.cursorWasHeld && target !== null) {
      const cursor = this.source.cursor(), targetStack = this.source.stack(target);
      const targetCompatible = targetStack === null || (cursor != null && itemStacksCompatible(targetStack, cursor)
        && targetStack.quantity < this.source.maxStack(cursor.itemKind));
      if (cursor != null && this.source.accepts(target, cursor.itemKind) && targetCompatible
        && !press.targets.some(visited => sameRef(visited, target))) {
        press.targets.push(target);
        if (!sameRef(target, press.origin)) press.dragged = true;
        if (press.targets.length > 1) this.authority.previewSpread(press.targets, this.spreadMode(press));
      }
    }
  }

  /** Pointer-up. `shift` is the modifier at the release; `inside` says whether the point is inside the window.
   * True when a press or outside press was consumed.
   *
   * The Shift rule for a left press that did not pick its stack up by dragging:
   * - Shift held at the release quick-moves, as before, even over a spread.
   * - Shift held only at pointer-down quick-moves too, unless the press turned into a spread (a held stack dragged
   *   across targets): then the spread commits, as it did before S2. */
  finish(point: UiPoint, shift: boolean, inside: boolean): boolean {
    const press = this.current;
    if (press !== null) {
      this.current = null;
      if (!press.moved && pastPickup(press.startPoint, point)) press.moved = true;
      const spreading = press.cursorWasHeld && press.targets.length > 0 && (press.dragged || press.targets.length > 1);
      if (press.pickedUpDuringDrag) {
        this.authority.cancelSpread();
        this.lastCursorClick = null;
      } else if ((shift || (press.shift && !spreading)) && press.button === 'left') this.finishShiftClick(press);
      else if (spreading) this.authority.spread(press.targets, this.spreadMode(press));
      else this.finishClick(press);
      return true;
    }
    if (this.outside !== null) {
      const button = this.outside;
      this.outside = null;
      if (this.source.slotAt(point) === null) {
        if (inside) this.authority.return();
        else this.authority.drop(button);
      }
      return true;
    }
    return false;
  }

  /** Abandons the press (pointer left, swipe took over, window closed): puts back any spread preview. */
  cancel(): void { this.authority.cancelSpread(); this.current = null; this.outside = null; }

  private spreadMode(press: Pick<UiSlotPress, 'button'>): UiSlotSpreadMode { return press.button === 'right' ? 'one_each' : 'even'; }

  /** A double-click pairs with the previous click (the same kind, in the same source region) when either:
   * - this release is within UI_SLOT_DOUBLE_CLICK_MS of that click (the pre-S2 rule, unchanged); or
   * - this press went down within UI_SLOT_DOUBLE_CLICK_MS of that click, was released within
   *   UI_SLOT_DOUBLE_CLICK_MS of its own pointer-down, and never moved the pickup distance (a quick second click
   *   whose release was a little late). A second press held longer, or moved, is an ordinary click. */
  private isDouble(press: UiSlotPress, previous: ClickRecord | null, itemKind: string | undefined, sourceRegion: string, now: number): boolean {
    if (itemKind === undefined || previous === null || previous.itemKind !== itemKind || previous.sourceRegion !== sourceRegion) return false;
    return now - previous.at <= UI_SLOT_DOUBLE_CLICK_MS || (press.pressedAt - previous.at <= UI_SLOT_DOUBLE_CLICK_MS
      && now - press.pressedAt <= UI_SLOT_DOUBLE_CLICK_MS && !press.moved);
  }

  private finishShiftClick(press: UiSlotPress): void {
    this.authority.cancelSpread();
    const container = press.origin.container, sourceRegion = this.source.quickMoveSources(container).join('|');
    const now = performance.now(), previous = this.lastShiftClick, item = this.source.stack(press.origin);
    const secondClickKind = item?.itemKind ?? (press.cursorWasHeld ? previous?.itemKind : undefined);
    if (this.isDouble(press, previous, secondClickKind, sourceRegion, now)) {
      this.authority.quickMoveAll(secondClickKind!, container);
      this.lastShiftClick = null;
    } else if (item !== null) {
      this.authority.quickMove(press.origin);
      this.lastShiftClick = { sourceRegion, itemKind: item.itemKind, at: now };
    } else this.lastShiftClick = null;
  }

  private finishClick(press: UiSlotPress): void {
    this.authority.cancelSpread();
    const cursor = this.source.cursor(), item = this.source.stack(press.origin), now = performance.now();
    const clickedKind = cursor?.itemKind ?? item?.itemKind;
    const sourceRegion = this.source.quickMoveSources(press.origin.container).join('|');
    const previous = this.lastCursorClick;
    if (press.button === 'left' && this.isDouble(press, previous, clickedKind, sourceRegion, now)) {
      if (previous!.transferCandidate) this.authority.quickMoveAll(clickedKind!, press.origin.container);
      else this.authority.collect();
      this.lastCursorClick = null;
      return;
    }
    const transferCandidate = cursor !== null && item !== null && itemStacksCompatible(cursor, item);
    // A held stack released over a slot that refuses it: nothing moves, and the slot flashes red.
    if (!this.authority.click(press.origin, press.button) && cursor !== null && !this.source.accepts(press.origin, cursor.itemKind)) this.refused([press.origin]);
    this.lastCursorClick = press.button !== 'left' || clickedKind === undefined ? null
      : { itemKind: clickedKind, sourceRegion, transferCandidate, at: now };
  }
}

/** What the kit slots paint from, beyond the gesture: the held stack as drawn and a slot's drop verdict. */
export interface UiSlotControllerView {
  /** The stack drawn under the pointer; during a spread preview, the original held stack. Defaults to the cursor. */
  displayedCursor?(): ItemStack | null;
  /** Whether a point is inside the window: a press on empty space there returns the held stack instead of dropping it. */
  contains(point: UiPoint): boolean;
}

function slotModel(gestures: UiSlotGestures, view: UiSlotControllerView, point: () => UiPoint): UiInventoryModel {
  const { source } = gestures, done = { ok: true, status: '' } as const;
  return {
    get cursor() { return source.cursor(); }, status: '', get dragging() { return gestures.pressing; },
    stack: ref => source.stack(ref),
    displayedCursor: () => view.displayedCursor?.() ?? source.cursor(),
    canAccept: (ref, item) => { const cursor = item ?? source.cursor(); return source.has(ref) && (cursor === null || source.accepts(ref, cursor.itemKind)); },
    // Shift reaches the gesture at the press, not only at the release.
    pointerDown: (ref, button, options) => { gestures.begin(ref, point(), button, { shift: options?.shift === true }); return done; },
    pointerEnter: () => false,
    pointerMove: (at, ref) => gestures.move(at, ref ?? null),
    pointerUp: (_ref, options) => { const at = point(); gestures.finish(at, options?.shift === true, view.contains(at)); return done; },
    cancel: () => gestures.cancel(),
  };
}

/**
 * The one controller for item slots on a UI root (wiki Roadmap/Item Slot Component, S2). It is the kit's
 * `UiInventoryController` pointer routing (one owning pointer, touch single-pointer ownership, capture, keyboard
 * activation) driving the shared `UiSlotGestures` state machine, so every surface gets the same thresholds and
 * gestures. Slots made by `uiSlot` with this controller route their input here; empty space routes through
 * `backgroundPointer`.
 */
export class UiSlotController extends UiInventoryController {
  readonly gestures: UiSlotGestures;
  constructor(gestures: UiSlotGestures, view: UiSlotControllerView) {
    // The model reads the pointer position the router records (`point`), which exists once super() returns.
    const at = { point: (): UiPoint => ({ x: 0, y: 0 }) };
    super(slotModel(gestures, view, () => at.point()));
    at.point = () => this.point; this.gestures = gestures;
    this.stopRefusals = gestures.onRefused(refs => this.refuse(refs));
  }
  private readonly stopRefusals: () => void;

  /** A slot the held stack is being spread over (a press that has visited more than one slot). */
  override spreadTarget(ref: UiSlotRef): boolean {
    const press = this.gestures.press;
    return press !== null && press.cursorWasHeld && press.targets.length > 1 && press.targets.some(target => sameRef(target, ref));
  }

  override dispose(): void { this.stopRefusals(); super.dispose(); }

  /** Pointer input on empty space: with a held stack, a press there drops it on release (outside the window) or
   * returns it (inside). It shares the slot pointer's ownership. */
  backgroundPointer(event: UiElementPointer, inside: boolean): boolean {
    return this.background(event, () => {
      if (event.type === 'down' && (event.button === 0 || event.button === 2)) { if (this.gestures.pressOutside(event.button)) event.capture(); }
      else if (event.type === 'up') { this.gestures.finish(event.point, event.shiftKey === true, inside); event.release(); }
      else if (event.type === 'cancel') { this.gestures.cancel(); event.release(); }
    });
  }
}
