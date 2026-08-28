import { describe, expect, it, vi } from 'vitest';
import { HOTBAR_SLOT_COUNT } from '@orchard/sim';
import { bindContainerSlots } from './container-binding.js';
import { UI_FIXTURE_ROWS, barrelWindow, craftingWindow, packWindow } from './compositions.js';
import { DragContext } from './drag-context.js';
import { UiInputRouter } from './input-router.js';
import { anchoredRect, layoutColumn, layoutRow } from './layout.js';
import { nineSlicePatches, snapRectToDevicePixels } from './nine-slice.js';
import { uiSkinContentRect } from './skin.js';
import { widget } from './widget.js';
import { EQUIPMENT_SLOT_RESTRICTIONS, ItemSlot } from './item-slot.js';

describe('retained UI layout', () => {
  it('keeps content beyond a frame inset with even additional padding', () => {
    expect(uiSkinContentRect(
      { slice: [8, 8, 8, 8] },
      { x: 10, y: 20, width: 100, height: 60 },
      2,
    )).toEqual({ x: 20, y: 30, width: 80, height: 40 });
  });

  it('lays out rows, columns, flex, anchors, and minimum sizes in whole pixels', () => {
    expect(layoutRow({ x: 0, y: 0, width: 31, height: 10 }, [
      { minSize: { width: 5, height: 4 }, flex: 1 }, { minSize: { width: 5, height: 6 }, flex: 1 },
    ], 1, 'center')).toEqual([
      { x: 0, y: 3, width: 15, height: 4 }, { x: 16, y: 2, width: 15, height: 6 },
    ]);
    expect(layoutColumn({ x: 2, y: 3, width: 20, height: 11 }, [
      { minSize: { width: 4, height: 3 } }, { minSize: { width: 5, height: 4 } },
    ], 2, 'end')).toEqual([
      { x: 18, y: 3, width: 4, height: 3 }, { x: 17, y: 8, width: 5, height: 4 },
    ]);
    expect(anchoredRect({ x: 10, y: 20, width: 100, height: 80 }, { width: 30, height: 20 }, 'bottom_right'))
      .toEqual({ x: 80, y: 80, width: 30, height: 20 });
  });

  it('crops nine-slice corners instead of scaling them when the target is smaller than its insets', () => {
    const patches = nineSlicePatches({ x: 0, y: 0, width: 16, height: 16 }, { x: 4, y: 5, width: 5, height: 3 }, [4, 4, 4, 4]);
    expect(Math.max(...patches.map((patch) => patch.destination.x + patch.destination.width))).toBe(9);
    expect(Math.max(...patches.map((patch) => patch.destination.y + patch.destination.height))).toBe(8);
    expect(patches.every((patch) => patch.destination.width > 0 && patch.destination.height > 0)).toBe(true);
    expect(patches.every((patch) => patch.source.width === patch.destination.width
      && patch.source.height === patch.destination.height)).toBe(true);
    expect(Math.max(...patches.map((patch) => patch.source.x + patch.source.width))).toBe(16);
    expect(Math.max(...patches.map((patch) => patch.source.y + patch.source.height))).toBe(16);
  });

  it('repeats edge and face tiles at their authored size and source-crops the final repeat', () => {
    const patches = nineSlicePatches(
      { x: 100, y: 200, width: 12, height: 10 },
      { x: 4, y: 5, width: 27, height: 19 },
      [2, 3, 2, 2],
    );
    expect(patches).toHaveLength(25);
    expect(patches.every((patch) => patch.source.width === patch.destination.width
      && patch.source.height === patch.destination.height)).toBe(true);
    expect(Math.max(...patches.map((patch) => patch.destination.x + patch.destination.width))).toBe(31);
    expect(Math.max(...patches.map((patch) => patch.destination.y + patch.destination.height))).toBe(24);
    expect(patches.some((patch) => patch.source.width === 7 && patch.destination.width === 7)).toBe(true);
    expect(patches.some((patch) => patch.source.height === 4 && patch.destination.height === 4)).toBe(true);
  });

  it('snaps shared slice edges to the same physical pixel at fractional DPR', () => {
    const transform = { a: 1.25, b: 0, c: 0, d: 1.25, e: 0.3, f: 0.6 };
    const left = snapRectToDevicePixels({ x: 10, y: 5, width: 7, height: 13 }, transform);
    const center = snapRectToDevicePixels({ x: 17, y: 5, width: 19, height: 13 }, transform);
    const right = snapRectToDevicePixels({ x: 36, y: 5, width: 7, height: 13 }, transform);

    expect(left.x + left.width).toBe(center.x);
    expect(center.x + center.width).toBe(right.x);
    expect(left.y).toBe(center.y);
    expect(left.height).toBe(center.height);
    expect((left.x * transform.a + transform.e) % 1).toBeCloseTo(0);
    expect(((right.x + right.width) * transform.a + transform.e) % 1).toBeCloseTo(0);
  });
});

describe('DragContext', () => {
  it('keeps the row authoritative while emitting one move intent', () => {
    const drag = new DragContext();
    drag.dispatch({ type: 'grab', source: { containerId: 'bag', index: 0 }, item: { itemKind: 'wood', quantity: 9 }, half: true });
    expect(drag.state).toMatchObject({ phase: 'grabbing', quantity: 5 });
    drag.dispatch({ type: 'hover', target: { containerId: 'barrel', index: 1 }, accepts: true });
    const drop = drag.dispatch({ type: 'drop' });
    expect(drop.intent).toEqual({ fromContainer: 'bag', fromIndex: 0, toContainer: 'barrel', toIndex: 1, quantity: 5 });
    expect(drag.state.phase).toBe('awaiting_commit');
    drag.dispatch({ type: 'error', code: 'race_lost' });
    expect(drag.state).toMatchObject({ phase: 'error', code: 'race_lost' });
    drag.dispatch({ type: 'cancel' });
    expect(drag.state.phase).toBe('idle');
  });

  it('does not emit an intent for a denied target', () => {
    const drag = new DragContext();
    drag.dispatch({ type: 'grab', source: { containerId: 'bag', index: 0 }, item: { itemKind: 'wood', quantity: 2 } });
    drag.dispatch({ type: 'hover', target: { containerId: 'hand', index: 0 }, accepts: false });
    expect(drag.dispatch({ type: 'drop' }).intent).toBeUndefined();
  });

  it('keeps carrying the remainder after placing one item', () => {
    const drag = new DragContext();
    drag.dispatch({ type: 'grab', source: { containerId: 'bag', index: 0 }, item: { itemKind: 'wood', quantity: 3 } });
    drag.dispatch({ type: 'hover', target: { containerId: 'crafting', index: 0 }, accepts: true });
    drag.dispatch({ type: 'place_one' });
    expect(drag.state).toMatchObject({ phase: 'hovering', quantity: 2 });
    drag.dispatch({ type: 'place_one' });
    expect(drag.state).toMatchObject({ phase: 'hovering', quantity: 1 });
    drag.dispatch({ type: 'place_one' });
    expect(drag.state.phase).toBe('idle');
  });
});

describe('bindings and routing', () => {
  it('uses reusable typed item slots for equipment acceptance', () => {
    const head = new ItemSlot('head', 'equipment', 1, EQUIPMENT_SLOT_RESTRICTIONS[1]);
    expect(head.accepts('helm')).toBe(true);
    expect(head.accepts('ring')).toBe(false);
    head.enabled = false;
    expect(head.accepts('helm')).toBe(false);
  });

  it('renders sparse subscribed rows through a self binding', () => {
    expect(bindContainerSlots('self:backpack', 3, UI_FIXTURE_ROWS, { 'self:backpack': 'player:local:backpack' }))
      .toEqual([
        { containerId: 'player:local:backpack', index: 0, itemKind: 'axe', quantity: 1 },
        { containerId: 'player:local:backpack', index: 1, itemKind: 'wood', quantity: 12 },
        { containerId: 'player:local:backpack', index: 2, itemKind: null, quantity: 0 },
      ]);
  });

  it('consumes UI clicks and slider wheels without leaking to the world', () => {
    const click = vi.fn(() => true);
    const wheel = vi.fn(() => true);
    const root = widget('root', 'root').setBounds({ x: 0, y: 0, width: 200, height: 100 });
    root.add(widget('panel', 'panel', { capturePointer: true }).setBounds({ x: 10, y: 10, width: 80, height: 60 })
      .add(widget('button', 'button', { onPointer: click }).setBounds({ x: 20, y: 20, width: 30, height: 16 })),
    widget('slider', 'slider', { onWheel: wheel }).setBounds({ x: 100, y: 10, width: 60, height: 16 }));
    const router = new UiInputRouter(root);
    expect(router.routePointer({ kind: 'click', point: { x: 25, y: 25 }, button: 0 })).toBe(true);
    expect(click).toHaveBeenCalledOnce();
    expect(router.routePointer({ kind: 'click', point: { x: 70, y: 50 }, button: 0 })).toBe(true);
    expect(router.routePointer({ kind: 'click', point: { x: 190, y: 90 }, button: 0 })).toBe(false);
    expect(router.routeWheel({ point: { x: 120, y: 15 }, deltaX: 0, deltaY: 1 })).toBe(true);
    const disabled = widget('button', 'disabled', { enabled: false, onPointer: click }).setBounds({ x: 165, y: 10, width: 20, height: 20 });
    root.add(disabled);
    expect(router.routePointer({ kind: 'click', point: { x: 170, y: 15 }, button: 0 })).toBe(false);
  });

  it('builds the three fixture-driven window compositions', () => {
    expect(barrelWindow().children[0]?.props).toMatchObject({ columns: 4, rows: 2 });
    expect(craftingWindow().children.map((child) => child.id)).toEqual(['row.crafting', 'button.craft']);
    const pack = packWindow();
    expect(pack.children[0]?.children[0]?.children).toHaveLength(8);
    expect(pack.children[0]?.children[1]?.props).toMatchObject({ columns: 5, rows: 4, disabled: true });
    expect(pack.children[0]?.children[1]?.enabled).toBe(false);
    expect(pack.children[1]?.props).toMatchObject({ columns: HOTBAR_SLOT_COUNT, rows: 1, binding: 'self:hotbar' });
  });
});
