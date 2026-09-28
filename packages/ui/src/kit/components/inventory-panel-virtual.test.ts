import { describe, expect, it } from 'vitest';
import type { ItemStack } from '@orchard/sim';
import { UiRoot } from '../runtime/root.js';
import { UiInventoryController, type UiInventoryModel } from '../runtime/inventory.js';
import { UiElement, type UiElementKey } from '../runtime/element.js';
import { scrollUiElement } from '../layout/scroll.js';
import { uiGamepadPagingKeys, uiInventoryPagingTarget, uiInventoryPanel, uiPlayerInventoryPane } from './inventory-panel.js';
import { uiSlotDropTarget } from './inventory.js';
import { uiFlex } from './layout.js';
import { uiButton } from './button.js';
import { uiPlayerHotbar } from './inventory-panel.js';

// Uncapped Storage step 2 (wiki Roadmap/Uncapped Storage): a panel over many cells keeps (visible rows + 1) x columns
// slots and recycles them as it scrolls; paging keys move focus and keep it in view.
const PITCH = 33;
const bindingOf = (node: UiElement) => (node.props['binding'] as { container: string; index: number }).index;
function mount(count: number, options: { stack?: (index: number) => ItemStack | null; filter?: string; controller?: UiInventoryController } = {}) {
  const root = new UiRoot({ scale: 1 }); root.resize(480, 360);
  root.mount(uiInventoryPanel({ id: 'bag', container: 'bag', count, columns: 5, visibleRows: 4, onActivate: () => undefined,
    ...(options.controller ? { controller: options.controller } : { stack: options.stack ?? (index => ({ itemKind: index % 3 === 0 ? 'apple' : 'wood', quantity: 1 })) }),
    ...(options.filter ? { filter: options.filter } : {}) }));
  root.arrange();
  const area = root.entries().find(entry => entry.element.kind === 'scroll-area')!.element;
  // Slots in the tree (shown or not), and the ones shown in order.
  const pool = () => area.children.find(child => child.kind === 'inventory-grid')!.children;
  const shown = () => pool().filter(node => node.visible);
  const inView = (node: UiElement) => node.rect.y >= area.contentRect.y && node.rect.y + node.rect.height <= area.contentRect.y + area.contentRect.height;
  return { root, area, pool, shown, inView, scroll: (y: number) => { scrollUiElement(area, 0, y); root.arrange(); } };
}

describe('virtualised inventory panel', () => {
  it('keeps a thousand-cell pack to 25 slots and a bounded layout while it scrolls end to end', () => {
    const f = mount(1000);
    expect(f.pool()).toHaveLength(25);
    expect(f.shown().map(bindingOf)).toEqual(Array.from({ length: 25 }, (_, index) => index));
    // Every row is in the scroll range: 200 rows, 4 visible.
    expect(f.area.scroll.maxY).toBe(200 * PITCH - 2 - (4 * PITCH - 2));
    const started = performance.now();
    let visitedMost = 0;
    for (let y = 0; y <= f.area.scroll.maxY; y += 97) {
      scrollUiElement(f.area, 0, y); visitedMost = Math.max(visitedMost, f.root.arrange().visited);
      const row = Math.floor(f.area.scroll.y / PITCH);
      expect(f.pool()).toHaveLength(25);
      expect(f.shown()[0]!.props['binding']).toEqual({ container: 'bag', index: row * 5 });
      // The top visible row sits where the scroll offset puts it.
      expect(f.shown()[0]!.rect.y).toBe(f.area.contentRect.y + row * PITCH - f.area.scroll.y);
    }
    expect(visitedMost).toBeLessThan(80);
    expect(performance.now() - started).toBeLessThan(2000);
    f.scroll(f.area.scroll.maxY);
    expect(f.shown().map(bindingOf)).toEqual(Array.from({ length: 20 }, (_, index) => 980 + index));
    expect(f.shown().map(node => node.id)).toEqual(Array.from({ length: 20 }, (_, index) => `bag.slot.${980 + index}`));
    f.root.dispose();
  });

  it('keeps each cell on one slot while it stays in view, so focus and hover follow the cell', () => {
    const f = mount(100);
    const cell12 = f.shown().find(node => bindingOf(node) === 12)!;
    f.scroll(PITCH);
    expect(f.shown().find(node => bindingOf(node) === 12)).toBe(cell12);
    expect(new Set(f.pool().map(bindingOf)).size).toBe(25);
    f.root.dispose();
  });

  it('filters to a list of matching cells first and keeps empty cells', () => {
    // Every fourth cell is empty; the rest are apples (index divisible by 3) or wood.
    const stack = (index: number): ItemStack | null => index % 4 === 3 ? null : { itemKind: index % 3 === 0 ? 'apple' : 'wood', quantity: 1 };
    const f = mount(400, { stack, filter: 'apple' });
    const expected = Array.from({ length: 400 }, (_, index) => index).filter(index => stack(index) === null || stack(index)!.itemKind === 'apple');
    expect(f.shown().map(bindingOf)).toEqual(expected.slice(0, 25));
    expect(f.area.scroll.maxY).toBe(Math.ceil(expected.length / 5) * PITCH - 2 - (4 * PITCH - 2));
    f.scroll(f.area.scroll.maxY);
    expect(f.shown().map(bindingOf).at(-1)).toBe(expected.at(-1));
    f.root.dispose();
  });

  it('re-checks a recycled slot\'s drop verdict for the cell it now shows (keyed by container and index)', () => {
    const held: ItemStack = { itemKind: 'apple', quantity: 1 };
    const model: UiInventoryModel = { cursor: held, status: '', dragging: false, stack: () => null, displayedCursor: () => held,
      canAccept: ref => ref.index < 50, pointerDown: () => ({ type: 'none' }) as never, pointerEnter: () => false,
      pointerUp: () => ({ type: 'none' }) as never, cancel: () => undefined };
    const controller = new UiInventoryController(model);
    const f = mount(200, { controller });
    const slot = f.pool()[0]!;
    expect(bindingOf(slot)).toBe(0); expect(uiSlotDropTarget(slot)).toBe('accept');
    // Scroll 12 rows: pool slot 0 now shows cell 60 (position 60 mod 25 = 10 is another slot; 50 lands on slot 0).
    f.scroll(12 * PITCH);
    expect(bindingOf(slot)).toBeGreaterThanOrEqual(50);
    expect(uiSlotDropTarget(slot)).toBe('refuse');
    f.scroll(0);
    expect(bindingOf(slot)).toBe(0); expect(uiSlotDropTarget(slot)).toBe('accept');
    f.root.dispose(); controller.dispose();
  });
});

describe('inventory paging keys', () => {
  const focused = (root: UiRoot) => bindingOf(root.focus.current!);
  it('pages by the visible rows, jumps with Home and End, and moves with the arrows, keeping focus in view', () => {
    const f = mount(1000);
    f.root.focus.set(f.shown()[0]!, 'keyboard');
    const press = (key: string) => { f.root.key({ key }); f.root.arrange(); };
    press('PageDown'); expect(focused(f.root)).toBe(20); expect(f.inView(f.root.focus.current!)).toBe(true);
    press('PageDown'); expect(focused(f.root)).toBe(40); expect(f.inView(f.root.focus.current!)).toBe(true);
    press('ArrowRight'); expect(focused(f.root)).toBe(41);
    press('ArrowDown'); expect(focused(f.root)).toBe(46); expect(f.inView(f.root.focus.current!)).toBe(true);
    press('End'); expect(focused(f.root)).toBe(999); expect(f.inView(f.root.focus.current!)).toBe(true);
    expect(f.area.scroll.y).toBe(f.area.scroll.maxY);
    press('PageUp'); expect(focused(f.root)).toBe(979); expect(f.inView(f.root.focus.current!)).toBe(true);
    press('Home'); expect(focused(f.root)).toBe(0); expect(f.area.scroll.y).toBe(0);
    press('ArrowUp'); expect(focused(f.root)).toBe(0);
    press('ArrowLeft'); expect(focused(f.root)).toBe(0);
    expect(f.pool()).toHaveLength(25);
    f.root.dispose();
  });

  it('pages a 20-cell pane the same way without recycling its slots', () => {
    const root = new UiRoot({ scale: 1 }); root.resize(480, 360);
    root.mount(uiPlayerInventoryPane({ id: 'pack', label: 'BACKPACK', container: 'backpack', count: 20, rows: 4, onActivate: () => undefined, stack: () => null }));
    root.arrange();
    const slots = root.entries().filter(entry => entry.element.kind === 'slot').map(entry => entry.element);
    expect(slots.map(bindingOf)).toEqual(Array.from({ length: 20 }, (_, index) => index));
    expect(slots.map(node => node.id)).toEqual(Array.from({ length: 20 }, (_, index) => `pack.slot.${index}`));
    root.focus.set(slots[2]!, 'keyboard');
    root.key({ key: 'PageDown' }); root.arrange(); expect(bindingOf(root.focus.current!)).toBe(19);
    expect(root.focus.current).toBe(slots[19]);
    root.key({ key: 'Home' }); root.arrange(); expect(root.focus.current).toBe(slots[0]);
    root.dispose();
  });

  it('computes targets at the edges', () => {
    expect(uiInventoryPagingTarget('PageDown', 3, 12, 5, 4)).toBe(11);
    expect(uiInventoryPagingTarget('PageUp', 3, 12, 5, 4)).toBe(0);
    expect(uiInventoryPagingTarget('ArrowDown', 8, 12, 5, 4)).toBeNull();
    expect(uiInventoryPagingTarget('ArrowRight', 11, 12, 5, 4)).toBeNull();
    expect(uiInventoryPagingTarget('Tab', 0, 12, 5, 4)).toBeNull();
    expect(uiInventoryPagingTarget('End', 0, 0, 5, 4)).toBeNull();
  });

  it('turns gamepad shoulder presses on any pad into one PageUp or PageDown each', () => {
    const pad = (...pressed: number[]) => ({ buttons: Array.from({ length: 8 }, (_, index) => ({ pressed: pressed.includes(index) })) });
    const state = { held: 0 }, keys: string[] = [], send = (key: string) => keys.push(key);
    uiGamepadPagingKeys([pad(5)], state, send); expect(keys).toEqual(['PageDown']);
    uiGamepadPagingKeys([pad(5)], state, send); expect(keys).toEqual(['PageDown']);
    uiGamepadPagingKeys([pad(4, 5)], state, send); expect(keys).toEqual(['PageDown', 'PageUp']);
    uiGamepadPagingKeys([pad()], state, send);
    uiGamepadPagingKeys([null, pad(), pad(4)], state, send); expect(keys).toEqual(['PageDown', 'PageUp', 'PageUp']);
  });
});

describe('#270 review', () => {
  it('lets arrows leave a 20-cell pane at its edges: the window, not the grid, takes the key there', () => {
    const root = new UiRoot({ scale: 1 }); root.resize(480, 360);
    const reached: string[] = [];
    const pane = uiPlayerInventoryPane({ id: 'pack', label: 'BACKPACK', container: 'backpack', count: 20, rows: 4, onActivate: () => undefined, stack: () => null });
    const hotbar = uiPlayerHotbar({ id: 'bar', container: 'hotbar', selected: () => -1, onActivate: () => undefined, stack: () => null });
    const done = uiButton({ id: 'done', label: 'Done', onPress: () => undefined });
    root.mount(new UiElement({ kind: 'window', children: [uiFlex({ direction: 'column' }, [pane, hotbar, done])],
      onKey(event: UiElementKey) { reached.push(event.key); return false; } }));
    root.arrange();
    const slot = (index: number) => root.entries().find(entry => entry.element.id === `pack.slot.${index}`)!.element;
    const press = (key: string) => { root.key({ key }); root.arrange(); };
    root.focus.set(slot(0), 'keyboard');
    press('ArrowUp'); press('ArrowLeft');
    expect(reached).toEqual(['ArrowUp', 'ArrowLeft']); expect(root.focus.current).toBe(slot(0));
    press('ArrowRight'); expect(root.focus.current).toBe(slot(1)); expect(reached).toHaveLength(2);
    root.focus.set(slot(19), 'keyboard');
    press('ArrowRight'); press('ArrowDown');
    expect(reached).toEqual(['ArrowUp', 'ArrowLeft', 'ArrowRight', 'ArrowDown']);
    // The walk out of the pane is the window's: Tab from the last cell reaches the hotbar, then the button.
    press('Tab'); expect(root.focus.current?.id).toBe('bar.slot.0');
    for (let i = 0; i < 10; i++) press('Tab');
    expect(root.focus.current?.id).toBe('done');
    root.dispose();
  });

  it('moves focus off a slot whose cell scrolls out of view, and hover follows the pointer', () => {
    const f = mount(1000);
    const cell2 = f.shown().find(node => bindingOf(node) === 2)!;
    f.root.focus.set(cell2, 'keyboard');
    // Scrolled six rows by the wheel or scrollbar: cell 2 is gone, and its slot now shows cell 52.
    f.scroll(6 * PITCH);
    expect(bindingOf(cell2)).toBe(52);
    expect(bindingOf(f.root.focus.current!)).toBe(32);
    expect(f.inView(f.root.focus.current!)).toBe(true);
    // Scrolled back up past it from below, focus lands on the last row in view, same column.
    f.root.focus.set(f.shown().find(node => bindingOf(node) === 52)!, 'keyboard');
    f.scroll(0);
    expect(bindingOf(f.root.focus.current!)).toBe(17);
    const under = f.shown().find(node => bindingOf(node) === 7)!;
    const point = { x: under.rect.x + 4, y: under.rect.y + 4 };
    f.root.pointer({ type: 'move', point, pointerId: 1, button: 0, pointerType: 'mouse' }); f.root.arrange();
    f.scroll(3 * PITCH);
    const hovered = f.root.input.hovered!;
    expect(hovered.kind).toBe('slot');
    expect(bindingOf(hovered)).toBe(22);
    expect(hovered.rect.y).toBeLessThanOrEqual(point.y); expect(hovered.rect.y + hovered.rect.height).toBeGreaterThan(point.y);
    f.root.dispose();
  });

  it('does not re-filter on pointer motion, only when the stacks, query or capacity change', () => {
    let reads = 0;
    const apple: ItemStack = { itemKind: 'apple', quantity: 1 };
    const model: UiInventoryModel = { cursor: null, status: '', dragging: false, stack: () => { reads++; return apple; }, displayedCursor: () => null,
      canAccept: () => true, pointerDown: () => ({ type: 'none' }) as never, pointerEnter: () => false,
      pointerUp: () => ({ type: 'none' }) as never, cancel: () => undefined };
    const controller = new UiInventoryController(model);
    const f = mount(300, { controller, filter: 'apple' });
    const slot = f.shown()[3]!, point = { x: slot.rect.x + 4, y: slot.rect.y + 4 };
    reads = 0;
    for (let i = 0; i < 20; i++) { f.root.pointer({ type: 'move', point: { x: point.x + (i % 3), y: point.y }, pointerId: 1, button: 0, pointerType: 'mouse' }); f.root.arrange(); }
    controller.pointer({ type: 'move', point, pointerId: 1, button: 0, pointerType: 'mouse', capture: () => undefined, release: () => undefined } as never, { container: 'bag', index: 3 });
    expect(reads).toBe(0);
    controller.refresh();
    expect(reads).toBeGreaterThanOrEqual(300);
    f.root.dispose(); controller.dispose();
  });

  it('rebinds a recycled slot\'s icon with its cell', () => {
    const root = new UiRoot({ scale: 1 }); root.resize(480, 360);
    root.mount(uiInventoryPanel({ id: 'bag', container: 'bag', columns: 5, visibleRows: 4, onActivate: () => undefined, stack: () => null,
      cells: Array.from({ length: 100 }, (_, index) => ({ id: String(index), index, ...(index === 30 ? { icon: { lucide: 'star' } as const } : {}) })) }));
    root.arrange();
    const area = root.entries().find(entry => entry.element.kind === 'scroll-area')!.element;
    const slot5 = root.entries().find(entry => entry.element.id === 'bag.slot.5')!.element;
    expect(slot5.children).toHaveLength(0);
    scrollUiElement(area, 0, 6 * PITCH); root.arrange();
    expect(bindingOf(slot5)).toBe(30); expect(slot5.children).toHaveLength(1);
    scrollUiElement(area, 0, 0); root.arrange();
    expect(bindingOf(slot5)).toBe(5); expect(slot5.children).toHaveLength(0);
    root.dispose();
  });
});
