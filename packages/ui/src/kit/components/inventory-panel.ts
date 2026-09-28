import type { ItemStack } from '@orchard/sim';
import { itemDefinition } from '@orchard/sim/item-containers';
import { UiElement } from '../runtime/element.js';
import { CanvasTextEditor } from '../runtime/text-editor.js';
import { uiFlex, uiScrollArea } from './layout.js';
import { uiInput } from './input.js';
import { uiText } from './text.js';
import { uiTooltip } from './tooltip.js';
import { uiGlyph, uiGlyphButton } from './window.js';
import { uiBindGridCell, uiHotbar, uiInventoryGrid, type UiInventoryCell, type UiInventoryGridOptions } from './inventory.js';
import { HOTBAR_SLOT_COUNT } from '@orchard/sim/inventory-layout';
import { uiFixed } from '../layout/box.js';
import { scrollUiElement } from '../layout/scroll.js';
import type { UiElementKey } from '../runtime/element.js';

export interface UiInventoryControls {
  readonly filterModel?: UiInventoryFilter;
  readonly showFilter?: boolean;
  readonly sortEnabled?: () => boolean;
  readonly filter?: string;
  readonly onFilter?: (value: string) => void;
  readonly onSort?: () => void;
  readonly itemLabel?: (item: ItemStack) => string;
  /** Rows shown before the grid scrolls. */
  readonly visibleRows?: number;
  /** Capacity belongs to the host; filtering never renumbers slot bindings. */
  readonly capacity?: () => number;
  /** Why sort is disabled (for example mid-trade), shown on the sort button; the button stays, disabled. */
  readonly sortDisabledReason?: () => string | null;
}

/** One editor/query may filter several panes without changing logical bindings. */
export class UiInventoryFilter {
  readonly editor: CanvasTextEditor;
  private readonly listeners = new Set<() => void>();
  constructor(value = '') { this.editor = new CanvasTextEditor({ value, maxLength: 32 }); }
  subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  refresh(): void { for (const listener of this.listeners) listener(); }
}

/** The keys that page a panel's cells: PageUp and PageDown by the visible rows, Home and End, and the arrows. A
 * gamepad's shoulder buttons arrive as PageUp and PageDown (`uiGamepadPagingKeys`). */
export const UI_INVENTORY_PAGING_KEYS = ['PageUp', 'PageDown', 'Home', 'End', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'] as const;
/** The position `key` moves focus to in a list of `count` cells laid out `columns` wide with `rows` visible, or null. */
export function uiInventoryPagingTarget(key: string, position: number, count: number, columns: number, rows: number): number | null {
  if (count <= 0) return null;
  const step = key === 'ArrowLeft' ? -1 : key === 'ArrowRight' ? 1 : key === 'ArrowUp' ? -columns : key === 'ArrowDown' ? columns
    : key === 'PageUp' ? -columns * rows : key === 'PageDown' ? columns * rows : null;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  if (step === null) return null;
  const next = position + step;
  // Arrows stop at the edges; a page goes as far as it can, keeping the column where the last row allows.
  if (key.startsWith('Arrow')) return next >= 0 && next < count ? next : null;
  return Math.max(0, Math.min(count - 1, next));
}
/** Gamepad paging: the standard mapping's shoulder buttons (4 and 5) on any connected pad as PageUp and PageDown, once
 * per press. `state.held` keeps the buttons held last time (a bit mask); nothing is allocated per call. */
export function uiGamepadPagingKeys(pads: Iterable<{ readonly buttons: readonly { readonly pressed: boolean }[] } | null>,
  state: { held: number }, send: (key: 'PageUp' | 'PageDown') => void): void {
  let held = 0;
  for (const pad of pads) {
    if (!pad) continue;
    if (pad.buttons[4]?.pressed) held |= 1;
    if (pad.buttons[5]?.pressed) held |= 2;
  }
  const pressed = held & ~state.held; state.held = held;
  if (pressed & 1) send('PageUp');
  if (pressed & 2) send('PageDown');
}

/** Search and sort surround a tightly packed inventory, preserving the editor
 * and the authority controller when the visible set of cells changes.
 *
 * A panel with `visibleRows` and a fixed number of `columns` over more cells than (visible rows + 1) x columns is
 * virtualised (wiki Roadmap/Uncapped Storage, step 2): it keeps that many slot nodes and reuses them as it scrolls, over
 * a grid as tall as every row, so a pack of a thousand cells builds, measures and paints a few dozen slots. The filter
 * first makes the list of cells to show (empty cells always stay, owner 2026-09-28); the slots show a window of it. */
export function uiInventoryPanel(options: UiInventoryGridOptions & UiInventoryControls): UiElement {
  const filterModel = options.filterModel ?? new UiInventoryFilter(options.filter);
  const editor = filterModel.editor;
  const cells: (UiInventoryCell & { readonly index: number })[] = (options.cells ?? Array.from({ length: options.count ?? 6 }, (_, index) => ({ id: String(index), index })))
    .map((cell, index) => ({ ...cell, index: cell.index ?? index }));
  const rows = options.visibleRows, columns = typeof options.columns === 'number' ? Math.max(1, options.columns) : null;
  const poolSize = rows && columns ? (rows + 1) * columns : Infinity;
  const virtual = cells.length > poolSize;
  const pool = virtual ? cells.slice(0, poolSize) : cells;
  // The cells the filter lets through, in order; a virtualised grid's slots show a window of it.
  let shown: (UiInventoryCell & { readonly index: number })[] = [];
  let first = 0, bound = '', focusedSlot: UiElement | null = null;
  const spacers = { top: 0, bottom: 0 };
  const pitch = () => Number(grid.props['slotHeight'] ?? 31) + (options.gap ?? 2);
  const grid = uiInventoryGrid({ ...options, cells: pool, fixedColumns: options.fixedColumns ?? virtual,
    onCellKey: (index, event) => page(index, event) || (options.onCellKey?.(index, event) ?? false),
    onCellFocus: (slot, focused) => { if (focused) focusedSlot = slot; else if (focusedSlot === slot) focusedSlot = null; options.onCellFocus?.(slot, focused); } });
  const slots = [...grid.children];
  // Large packs scroll inside a fixed number of rows; the scrollbar gutter is always reserved so slots never shift.
  // Virtualised, spacers above and below the slots stand for the rows out of view, so the scroll range is every row.
  const above = new UiElement({ kind: 'spacer', style: { width: 'grow', height: uiFixed(0), shrink: 0 } });
  const below = new UiElement({ kind: 'spacer', style: { width: 'grow', height: uiFixed(0), shrink: 0 } });
  const body = rows ? uiScrollArea({ scrollStyle: 'wood', label: `${options.container} slots`, height: uiFixed(rows * 33 - 2), padding: { right: 24 }, overflow: 'scroll-y',
    onScroll: () => place() }, virtual ? [above, grid, below] : [grid])
    : uiFlex({ width: 'grow' }, [grid]);
  /** Virtualised: shows the rows under the scroll offset. Each list position keeps one slot (position mod pool size)
   * while it stays in the window, so a focused or hovered cell keeps its slot as the grid scrolls. */
  const place = (force = false) => {
    if (!virtual || !rows || !columns) return;
    const totalRows = Math.ceil(shown.length / columns);
    const next = Math.max(0, Math.min(totalRows - rows, Math.floor(body.scroll.y / pitch())));
    const key = `${next}:${shown.length}`;
    if (!force && key === bound) return;
    // The focused cell's list position, to move focus off its slot if the slot is about to show another cell.
    const focusedAt = focusedSlot ? shown.findIndex(cell => cell.index === (focusedSlot!.props['binding'] as { index?: number } | undefined)?.index) : -1;
    bound = key; first = next;
    const order: UiElement[] = [], start = first * columns;
    for (let position = start; position < start + poolSize; position++) {
      const slot = slots[position % poolSize]!, cell = shown[position];
      order.push(slot);
      if (cell) uiBindGridCell(slot, cell);
      const display = cell ? 'stack' : 'none';
      if (slot.style.display !== display) slot.setStyle({ display });
    }
    grid.reorderChildren(order);
    // A cell that left the window gives up its slot to another cell: focus goes to the same column of the nearest
    // row still in view rather than staying on the recycled slot (Enter would act on the wrong cell). Hover is
    // reconciled from the pointer after layout.
    if (focusedSlot && focusedAt >= 0 && (focusedAt < start || focusedAt >= start + poolSize)) {
      const column = focusedAt % columns, lastRow = Math.min(first + rows - 1, totalRows - 1);
      const row = focusedAt < start ? first : lastRow;
      const target = Math.min(shown.length - 1, row * columns + column);
      slots[target % poolSize]!.requestFocus();
    }
    const span = pitch(), windowRows = Math.ceil(Math.max(0, Math.min(poolSize, shown.length - start)) / columns);
    const top = first * span, bottom = Math.max(0, (totalRows - first - windowRows) * span);
    if (spacers.top !== top) { spacers.top = top; above.setStyle({ height: uiFixed(top) }); }
    if (spacers.bottom !== bottom) { spacers.bottom = bottom; below.setStyle({ height: uiFixed(bottom) }); }
  };
  /** The slot showing a list position, placing the window over it first. */
  const slotAt = (position: number): UiElement | undefined => {
    const cell = shown[position]; if (!cell) return undefined;
    if (!virtual) return slots.find(slot => (slot.props['binding'] as { index?: number } | undefined)?.index === cell.index);
    return slots[position % poolSize];
  };
  /** Paging: moves focus by a key and keeps it in view, scrolling (and, virtualised, recycling slots) as needed. */
  const page = (index: number, event: UiElementKey): boolean => {
    if (!(UI_INVENTORY_PAGING_KEYS as readonly string[]).includes(event.key) || event.ctrlKey || event.metaKey || event.altKey) return false;
    const width = columns ?? Math.max(1, Number(grid.props['columns'] ?? 1));
    const position = shown.findIndex(cell => cell.index === index);
    const target = position < 0 ? null : uiInventoryPagingTarget(event.key, position, shown.length, width, rows ?? Math.ceil(shown.length / width));
    // At an edge (or for a cell the panel doesn't list) the key is not the panel's: the window's own focus walk or
    // scrolling takes it, so arrows never trap focus in the grid.
    if (target === null) return false;
    // Focus moves to the target below, so the scroll must not hand the old cell's focus elsewhere first.
    focusedSlot = null;
    if (rows) {
      const row = Math.floor(target / width), y = body.scroll.y, span = pitch();
      const top = row * span, bottom = top + span - (options.gap ?? 2), height = rows * 33 - 2;
      const nextY = top < y ? top : bottom > y + height ? bottom - height : y;
      if (nextY !== y) { const maxY = Math.max(body.scroll.maxY, Math.ceil(shown.length / width) * span - (options.gap ?? 2) - height); body.scroll.maxY = maxY; scrollUiElement(body, body.scroll.x, nextY); }
      place();
    }
    slotAt(target)?.requestFocus();
    return true;
  };
  const sortReason = () => options.sortDisabledReason?.() ?? null;
  const sortAllowed = () => options.sortEnabled?.() !== false && sortReason() === null;
  const sortButton = options.onSort ? uiGlyphButton({ glyph: 'glyph.sort', id: options.id ? `${options.id}.sort` : undefined,
    label: 'Sort inventory', onPress: () => { if (sortAllowed()) options.onSort?.(); } }) : null;
  const sort = sortButton && options.sortDisabledReason ? uiTooltip(() => sortReason() ?? 'Sort & stack', sortButton, { shrink: 0 }) : sortButton;
  // Without a controller there is no stacks revision: a filtered panel re-runs on every refresh.
  let previous = '', filtered = '', uncached = 0;
  const refresh = () => {
    sortButton?.setDisabled(!sortAllowed());
    const query = editor.snapshot().value.trim().toLowerCase();
    const capacity = options.capacity?.() ?? Infinity;
    // The list depends on the query, the capacity and (with a query) the stacks: pointer motion changes none of them,
    // so it isn't re-filtered then (the controller's stacks revision doesn't move on motion).
    const revision = `${query}\u0000${capacity}\u0000${!query ? 0 : options.controller ? options.controller.stacksRevision : `x${++uncached}`}`;
    if (revision === filtered) return;
    filtered = revision;
    // The list of cells to show comes first: within capacity, and matching the filter. Filtering hides only
    // non-matching items: empty cells always stay, as places to put something down (BUG-065, owner 2026-09-28).
    shown = cells.filter(cell => {
      if (cell.index >= capacity) return false;
      if (!query) return true;
      const item = options.controller ? options.controller.model.stack({ container: options.container, index: cell.index }) : options.stack?.(cell.index);
      if (!item) return true;
      return Boolean((item.itemKind.toLowerCase().includes(query)
        || (options.itemLabel?.(item) ?? itemDefinition(item.itemKind)?.displayName ?? '').toLowerCase().includes(query)));
    });
    const key = shown.map(cell => cell.index).join(',');
    if (key === previous) return;
    previous = key;
    if (virtual) { grid.invalidate(); place(true); return; }
    const indexes = new Set(shown.map(cell => cell.index));
    grid.children.forEach((child, index) => child.setStyle({ display: indexes.has(cells[index]!.index) ? 'stack' : 'none' }));
  };
  const filter = options.showFilter === false ? null : uiInput({ id: options.id ? `${options.id}.filter` : undefined, label: 'Filter items', placeholder: 'Filter', editor,
    clearable: true, size: 'md', leading: uiGlyph('glyph.search'), onChange(value) { options.onFilter?.(value); filterModel.refresh(); },
  });
  // Opening a window never parks the keyboard in its filter: the player clicks or tabs into it (BUG-064).
  filter?.setProps({ skipAutoFocus: true }, false);
  const toolbar = uiFlex({ direction: 'row', width: 'grow', gap: 4 }, [
    ...(filter ? [filter] : []), ...(sort ? [sort] : []),
  ]);
  const unsubscribe = options.controller?.subscribe(refresh);
  const unsubscribeFilter = filterModel.subscribe(refresh);
  refresh();
  return new UiElement({ kind: 'inventory-panel', style: { direction: 'column', width: 'grow', gap: 4, ...options.layout }, children: [toolbar, body],
    onDispose() { unsubscribe?.(); unsubscribeFilter(); },
  });
}

export interface UiPlayerInventoryPaneOptions extends UiInventoryGridOptions, UiInventoryControls {
  /** The pane's heading (BACKPACK, INVENTORY, YOUR STORED ITEMS...). */
  readonly label: string;
  /** Authored rows; at most four are shown before the pane scrolls. */
  readonly rows?: number;
  /** The pane wrapper's id (defaults to `pane:<id>`). */
  readonly paneId?: string;
}

/**
 * The inventory pane every window uses to show the player's inventory, and the stores beside it (owner decision
 * 2026-09-28, BUG-065/067): one layout, capacity, filter, sort, always-visible empty cells and slot look. Window-specific
 * behaviour (a trade's unofferable items, a merchant's prices) is passed in as options, never copied.
 */
export function uiPlayerInventoryPane(options: UiPlayerInventoryPaneOptions): UiElement {
  const columns = typeof options.columns === 'number' ? options.columns : 5;
  const width = uiFixed(columns * 30 - 2 + 24);
  return uiFlex({ id: options.paneId ?? (options.id ? `pane:${options.id}` : undefined), direction: 'column', gap: 4, shrink: 0, width }, [uiText(options.label, { role: 'label' }),
    uiInventoryPanel({ ...options, columns, visibleRows: Math.min(4, options.rows ?? 4), layout: { width } })]);
}

/**
 * The hotbar row every inventory window shows as its footer (under the window's carved divider): ten slots in one row
 * where they fit, the player's selected slot marked as on the HUD, digit keys left to the host (BUG-067).
 */
export function uiPlayerHotbar(options: UiInventoryGridOptions & { readonly selected: () => number; readonly onSelect?: (index: number) => void }): UiElement {
  return uiHotbar({ ...options, count: HOTBAR_SLOT_COUNT, columns: HOTBAR_SLOT_COUNT, digitKeys: false,
    layout: { shrink: 0, width: 'fit', maxWidth: { mode: 'percent', fraction: 1 } } });
}
