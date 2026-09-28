import { describe, expect, it } from 'vitest';
import type { ItemStack } from '@orchard/sim';
import { UiRoot } from '../runtime/root.js';
import { UiInventoryController, type UiInventoryModel } from '../runtime/inventory.js';
import type { UiElement } from '../runtime/element.js';
import { scrollUiElement } from '../layout/scroll.js';
import { uiGamepadPagingKeys, uiInventoryPagingTarget, uiInventoryPanel, uiPlayerInventoryPane } from './inventory-panel.js';
import { uiSlotDropTarget } from './inventory.js';

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

  it('turns gamepad shoulder presses into one PageUp or PageDown each', () => {
    const buttons = (...pressed: number[]) => Array.from({ length: 8 }, (_, index) => ({ pressed: pressed.includes(index) }));
    let state = uiGamepadPagingKeys(buttons(5), new Set());
    expect(state.keys).toEqual(['PageDown']);
    state = uiGamepadPagingKeys(buttons(5), state.held); expect(state.keys).toEqual([]);
    state = uiGamepadPagingKeys(buttons(4, 5), state.held); expect(state.keys).toEqual(['PageUp']);
    state = uiGamepadPagingKeys(buttons(), state.held); expect(state.keys).toEqual([]);
    state = uiGamepadPagingKeys(buttons(4), state.held); expect(state.keys).toEqual(['PageUp']);
  });
});
