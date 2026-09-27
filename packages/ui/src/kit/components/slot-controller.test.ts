import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ItemStack } from '@orchard/sim';
import type { UiPoint } from '../../geometry.js';
import type { UiElementPointer } from '../runtime/element.js';
import { UI_SLOT_DOUBLE_CLICK_MS, UI_SLOT_PICKUP_DISTANCE, UiSlotController, UiSlotGestures, type UiSlotAuthority, type UiSlotRef } from './slot-controller.js';

/** A tiny inventory: one row of slots in the "bag" container, a held stack, and a spy per reducer. The authority
 * applies clicks like the sim (pick up, place, merge) so the gesture sees the predicted state, as the host does. */
function harness(slots: (ItemStack | null)[], held: ItemStack | null = null, options: { readonly refuse?: (ref: UiSlotRef, kind: string) => boolean } = {}) {
  const state = { slots: [...slots], cursor: held };
  const at = (ref: UiSlotRef) => ref.container === 'bag' ? ref.index : -1;
  const authority = {
    click: vi.fn((ref: UiSlotRef, button: 'left' | 'right') => {
      const index = at(ref), stack = state.slots[index] ?? null;
      if (state.cursor === null) {
        if (stack === null) return false;
        const take = button === 'right' ? Math.ceil(stack.quantity / 2) : stack.quantity;
        state.cursor = { ...stack, quantity: take };
        state.slots[index] = stack.quantity === take ? null : { ...stack, quantity: stack.quantity - take };
        return true;
      }
      if (stack === null) { state.slots[index] = state.cursor; state.cursor = null; return true; }
      return false;
    }),
    previewSpread: vi.fn(), cancelSpread: vi.fn(), spread: vi.fn(), quickMove: vi.fn(), quickMoveAll: vi.fn(),
    collect: vi.fn(), drop: vi.fn(), return: vi.fn(),
  } satisfies UiSlotAuthority;
  const gestures = new UiSlotGestures({
    cursor: () => state.cursor,
    has: ref => at(ref) >= 0 && at(ref) < state.slots.length,
    stack: ref => state.slots[at(ref)] ?? null,
    accepts: (ref, kind) => !(options.refuse?.(ref, kind) ?? false),
    maxStack: () => 99,
    quickMoveSources: () => ['bag'],
    // Slots are 30px wide from x = 0 on the y = 0 row; anything below is empty window space.
    slotAt: point => point.y < 31 && point.x >= 0 && point.x < slots.length * 30 ? { container: 'bag', index: Math.floor(point.x / 30) } : null,
  }, authority);
  return { state, authority, gestures };
}
const bag = (index: number): UiSlotRef => ({ container: 'bag', index });
const centre = (index: number): UiPoint => ({ x: index * 30 + 15, y: 15 });
let clock = 0;
function tick(ms: number) { clock += ms; }
afterEach(() => { vi.restoreAllMocks(); clock = 0; });
function frozenClock() { vi.spyOn(performance, 'now').mockImplementation(() => clock); }
function click(gestures: UiSlotGestures, index: number, options: { readonly button?: number; readonly shift?: boolean; readonly holdMs?: number } = {}) {
  gestures.begin(bag(index), centre(index), options.button ?? 0, { shift: options.shift });
  tick(options.holdMs ?? 0);
  gestures.finish(centre(index), options.shift === true, true);
}

describe('UiSlotGestures (item slot S2)', () => {
  it('picks the pressed stack up once the pointer travels the pickup distance, and never again on release', () => {
    frozenClock();
    const { gestures, authority, state } = harness([{ itemKind: 'wood', quantity: 5 }, null]);
    gestures.begin(bag(0), { x: 10, y: 10 }, 0);
    gestures.move({ x: 10 + UI_SLOT_PICKUP_DISTANCE - 1, y: 10 }, bag(0));
    expect(authority.click).not.toHaveBeenCalled();
    gestures.move({ x: 10 + UI_SLOT_PICKUP_DISTANCE, y: 10 }, bag(0));
    expect(authority.click).toHaveBeenCalledExactlyOnceWith(bag(0), 'left');
    expect(gestures.press).toMatchObject({ pickedUpDuringDrag: true, dragged: true });
    expect(state.cursor).toEqual({ itemKind: 'wood', quantity: 5 });
    gestures.finish({ x: 45, y: 15 }, false, true);
    expect(authority.click).toHaveBeenCalledTimes(1);
    expect(authority.cancelSpread).toHaveBeenCalledTimes(1);
    expect(gestures.pressing).toBe(false);
  });

  it('clicks on release when the pointer stays within the pickup distance, splitting with the right button', () => {
    frozenClock();
    const { gestures, authority, state } = harness([{ itemKind: 'wood', quantity: 5 }]);
    click(gestures, 0, { button: 2 });
    expect(authority.click).toHaveBeenCalledExactlyOnceWith(bag(0), 'right');
    expect(state.cursor).toEqual({ itemKind: 'wood', quantity: 3 });
  });

  it('collects matching stacks on a double-click within the window, and only within it', () => {
    frozenClock();
    const { gestures, authority } = harness([{ itemKind: 'wood', quantity: 5 }, { itemKind: 'wood', quantity: 2 }]);
    click(gestures, 0);
    tick(UI_SLOT_DOUBLE_CLICK_MS - 100);
    click(gestures, 0);
    expect(authority.collect).toHaveBeenCalledTimes(1);
    expect(authority.click).toHaveBeenCalledTimes(1);

    const late = harness([{ itemKind: 'wood', quantity: 5 }]);
    click(late.gestures, 0);
    tick(UI_SLOT_DOUBLE_CLICK_MS + 1);
    click(late.gestures, 0);
    expect(late.authority.collect).not.toHaveBeenCalled();
    expect(late.authority.click).toHaveBeenCalledTimes(2);
  });

  it('decides the double-click at pointer-down, so a slow second release still collects', () => {
    frozenClock();
    const { gestures, authority } = harness([{ itemKind: 'wood', quantity: 5 }]);
    click(gestures, 0);
    tick(UI_SLOT_DOUBLE_CLICK_MS - 100);
    click(gestures, 0, { holdMs: 300 });
    expect(authority.collect).toHaveBeenCalledTimes(1);
  });

  it('places the held stack from a second press held past the window, instead of collecting', () => {
    frozenClock();
    const { gestures, authority, state } = harness([{ itemKind: 'wood', quantity: 5 }, null]);
    click(gestures, 0); // picks the wood up
    tick(400);
    click(gestures, 1, { holdMs: 2000 }); // pressed in time, released 2 s later
    expect(authority.collect).not.toHaveBeenCalled();
    expect(authority.click).toHaveBeenLastCalledWith(bag(1), 'left');
    expect(state.slots[1]).toEqual({ itemKind: 'wood', quantity: 5 });
  });

  it('places the held stack from a quick second press that moved the pickup distance', () => {
    frozenClock();
    const { gestures, authority } = harness([{ itemKind: 'wood', quantity: 5 }, null]);
    click(gestures, 0);
    tick(400);
    gestures.begin(bag(1), centre(1), 0);
    gestures.move({ x: centre(1).x + UI_SLOT_PICKUP_DISTANCE, y: centre(1).y }, bag(1));
    tick(200); // released 600 ms after the first click, 200 ms after its own press
    gestures.finish({ x: centre(1).x + UI_SLOT_PICKUP_DISTANCE, y: centre(1).y }, false, true);
    expect(authority.collect).not.toHaveBeenCalled();
    expect(authority.click).toHaveBeenLastCalledWith(bag(1), 'left');
  });

  it('pairs a double-click with the previous click itself, not with any recent press', () => {
    frozenClock();
    const { gestures, authority } = harness([{ itemKind: 'wood', quantity: 5 }, null]);
    click(gestures, 0);
    tick(10_000);
    click(gestures, 1, { shift: true });
    tick(100);
    click(gestures, 1);
    expect(authority.collect).not.toHaveBeenCalled();
    expect(authority.click).toHaveBeenCalledTimes(2);
  });

  it('moves everything of the kind on a double-click that pairs with a transfer click', () => {
    frozenClock();
    const { gestures, authority } = harness([{ itemKind: 'wood', quantity: 5 }, null], { itemKind: 'wood', quantity: 1 });
    // A held wood onto wood: a transfer candidate. The fake authority refuses the merge; the gesture records it anyway.
    click(gestures, 0);
    tick(100);
    click(gestures, 0);
    expect(authority.quickMoveAll).toHaveBeenCalledExactlyOnceWith('wood', 'bag');
    expect(authority.collect).not.toHaveBeenCalled();
  });

  it('quick-moves with Shift held at pointer-down even when it is released first', () => {
    frozenClock();
    const { gestures, authority } = harness([{ itemKind: 'wood', quantity: 5 }]);
    gestures.begin(bag(0), centre(0), 0, { shift: true });
    gestures.finish(centre(0), false, true);
    expect(authority.quickMove).toHaveBeenCalledExactlyOnceWith(bag(0));
    expect(authority.click).not.toHaveBeenCalled();
  });

  it('commits a spread when Shift, held at pointer-down, is released during the drag', () => {
    frozenClock();
    const { gestures, authority } = harness([null, null, null], { itemKind: 'wood', quantity: 6 });
    gestures.begin(bag(0), centre(0), 0, { shift: true });
    gestures.move(centre(1), bag(1)); gestures.move(centre(2), bag(2));
    gestures.finish(centre(2), false, true);
    expect(authority.spread).toHaveBeenCalledExactlyOnceWith([bag(0), bag(1), bag(2)], 'even');
    expect(authority.quickMove).not.toHaveBeenCalled(); expect(authority.quickMoveAll).not.toHaveBeenCalled();
  });

  it('keeps Shift at the release winning over a spread, as before', () => {
    frozenClock();
    const { gestures, authority } = harness([null, null], { itemKind: 'wood', quantity: 6 });
    gestures.begin(bag(0), centre(0), 0);
    gestures.move(centre(1), bag(1));
    gestures.finish(centre(1), true, true);
    expect(authority.spread).not.toHaveBeenCalled();
    expect(authority.cancelSpread).toHaveBeenCalled();
  });

  it('moves every stack of the kind on a Shift double-click', () => {
    frozenClock();
    const { gestures, authority } = harness([{ itemKind: 'wood', quantity: 5 }, { itemKind: 'wood', quantity: 3 }]);
    click(gestures, 0, { shift: true });
    tick(200);
    click(gestures, 1, { shift: true });
    expect(authority.quickMove).toHaveBeenCalledTimes(1);
    expect(authority.quickMoveAll).toHaveBeenCalledExactlyOnceWith('wood', 'bag');
  });

  it('spreads a held stack over the slots it visits: evenly with the left button, one each with the right', () => {
    frozenClock();
    for (const [button, mode] of [[0, 'even'], [2, 'one_each']] as const) {
      const { gestures, authority } = harness([null, null, { itemKind: 'stone', quantity: 1 }, null], { itemKind: 'wood', quantity: 9 });
      gestures.begin(bag(0), centre(0), button);
      expect(authority.previewSpread).toHaveBeenLastCalledWith([bag(0)], mode);
      gestures.move(centre(1), bag(1));
      gestures.move(centre(1), bag(1));
      gestures.move(centre(2), bag(2)); // occupied by another kind: not a target
      gestures.move(centre(3), bag(3));
      expect(gestures.press?.targets).toEqual([bag(0), bag(1), bag(3)]);
      gestures.finish(centre(3), false, true);
      expect(authority.spread).toHaveBeenCalledExactlyOnceWith([bag(0), bag(1), bag(3)], mode);
      expect(authority.click).not.toHaveBeenCalled();
    }
  });

  it('skips slots whose rules refuse the held stack', () => {
    frozenClock();
    const { gestures, authority } = harness([null, null, null], { itemKind: 'apple', quantity: 4 }, { refuse: ref => ref.index === 1 });
    gestures.begin(bag(0), centre(0), 0);
    gestures.move(centre(1), bag(1)); gestures.move(centre(2), bag(2));
    gestures.finish(centre(2), false, true);
    expect(authority.spread).toHaveBeenCalledExactlyOnceWith([bag(0), bag(2)], 'even');
  });

  it('drops a held stack from a press outside the window and returns it from empty space inside', () => {
    frozenClock();
    const { gestures, authority } = harness([null], { itemKind: 'wood', quantity: 4 });
    expect(gestures.pressOutside(2)).toBe(true);
    expect(gestures.finish({ x: 300, y: 300 }, false, false)).toBe(true);
    expect(authority.drop).toHaveBeenCalledExactlyOnceWith('right');
    gestures.pressOutside(0);
    gestures.finish({ x: 5, y: 100 }, false, true);
    expect(authority.return).toHaveBeenCalledTimes(1);
    // Released over a slot: neither.
    gestures.pressOutside(0);
    gestures.finish(centre(0), false, true);
    expect(authority.drop).toHaveBeenCalledTimes(1); expect(authority.return).toHaveBeenCalledTimes(1);
    expect(gestures.finish(centre(0), false, true)).toBe(false);
  });

  it('ignores an outside press with nothing held, and cancel puts back a spread preview', () => {
    frozenClock();
    const { gestures, authority } = harness([null], null);
    expect(gestures.pressOutside(0)).toBe(false);
    const held = harness([null, null], { itemKind: 'wood', quantity: 4 });
    held.gestures.begin(bag(0), centre(0), 0);
    held.gestures.cancel();
    expect(held.authority.cancelSpread).toHaveBeenCalledTimes(1);
    expect(held.gestures.pressing).toBe(false);
    expect(held.gestures.finish(centre(0), false, true)).toBe(false);
    expect(authority.drop).not.toHaveBeenCalled();
  });
});

function pointer(type: UiElementPointer['type'], point: UiPoint, extra: Partial<UiElementPointer> = {}): UiElementPointer & { captured: boolean } {
  const event = { type, point, pointerId: 1, button: 0, captured: false, capture() { event.captured = true; }, release() { event.captured = false; }, ...extra };
  return event;
}

describe('UiSlotController (item slot S2)', () => {
  it('passes Shift to the gesture at pointer-down', () => {
    frozenClock();
    const { gestures, authority } = harness([{ itemKind: 'wood', quantity: 5 }]);
    const controller = new UiSlotController(gestures, { contains: () => true });
    controller.pointer(pointer('down', centre(0), { shiftKey: true }), bag(0));
    controller.pointer(pointer('up', centre(0), { shiftKey: false }), bag(0));
    expect(authority.quickMove).toHaveBeenCalledExactlyOnceWith(bag(0));
  });

  it('keeps single-pointer touch ownership: a second finger neither starts nor ends a gesture', () => {
    frozenClock();
    const { gestures, authority } = harness([{ itemKind: 'wood', quantity: 5 }, { itemKind: 'stone', quantity: 2 }]);
    const controller = new UiSlotController(gestures, { contains: () => true });
    controller.pointer(pointer('down', centre(0), { pointerType: 'touch', isPrimary: true }), bag(0));
    controller.pointer(pointer('down', centre(1), { pointerType: 'touch', isPrimary: false, pointerId: 2 }), bag(1));
    expect(gestures.press?.origin).toEqual(bag(0));
    controller.pointer(pointer('up', centre(1), { pointerType: 'touch', pointerId: 2 }), bag(1));
    expect(gestures.pressing).toBe(true);
    controller.pointer(pointer('up', centre(0), { pointerType: 'touch' }), bag(0));
    expect(authority.click).toHaveBeenCalledExactlyOnceWith(bag(0), 'left');
  });

  it('routes empty-space presses: capture with a held stack, drop outside on release', () => {
    frozenClock();
    const { gestures, authority } = harness([null], { itemKind: 'wood', quantity: 4 });
    const controller = new UiSlotController(gestures, { contains: () => false });
    const down = pointer('down', { x: 400, y: 400 });
    controller.backgroundPointer(down, false);
    expect(down.captured).toBe(true);
    controller.backgroundPointer(pointer('up', { x: 400, y: 400 }), false);
    expect(authority.drop).toHaveBeenCalledExactlyOnceWith('left');
  });

  it('answers the kit model from the source: cursor, stacks and drop verdicts', () => {
    const { gestures } = harness([{ itemKind: 'wood', quantity: 5 }, null], { itemKind: 'apple', quantity: 1 }, { refuse: ref => ref.index === 1 });
    const controller = new UiSlotController(gestures, { contains: () => true, displayedCursor: () => ({ itemKind: 'apple', quantity: 9 }) });
    expect(controller.model.cursor).toEqual({ itemKind: 'apple', quantity: 1 });
    expect(controller.model.displayedCursor()).toEqual({ itemKind: 'apple', quantity: 9 });
    expect(controller.model.stack(bag(0))).toEqual({ itemKind: 'wood', quantity: 5 });
    expect(controller.model.canAccept(bag(0))).toBe(true);
    expect(controller.model.canAccept(bag(1))).toBe(false);
    expect(controller.model.canAccept(bag(7))).toBe(false);
  });
});
