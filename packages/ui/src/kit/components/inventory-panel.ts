import type { ItemStack } from '@orchard/sim';
import { itemDefinition } from '@orchard/sim/item-containers';
import { UiElement } from '../runtime/element.js';
import { CanvasTextEditor } from '../runtime/text-editor.js';
import { uiFlex, uiScrollArea } from './layout.js';
import { uiInput } from './input.js';
import { uiText } from './text.js';
import { uiTooltip } from './tooltip.js';
import { uiGlyph, uiGlyphButton } from './window.js';
import { uiInventoryGrid, type UiInventoryGridOptions } from './inventory.js';
import { uiFixed } from '../layout/box.js';

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

/** Search and sort surround a tightly packed inventory, preserving the editor
 * and the authority controller when the visible set of cells changes. */
export function uiInventoryPanel(options: UiInventoryGridOptions & UiInventoryControls): UiElement {
  const filterModel = options.filterModel ?? new UiInventoryFilter(options.filter);
  const editor = filterModel.editor;
  const cells = (options.cells ?? Array.from({ length: options.count ?? 6 }, (_, index) => ({ id: String(index), index })))
    .map((cell, index) => ({ ...cell, index: cell.index ?? index }));
  const grid = uiInventoryGrid({ ...options, cells });
  // Large packs scroll inside a fixed number of rows; the scrollbar gutter is always reserved so slots never shift.
  const body = options.visibleRows ? uiScrollArea({ scrollStyle: 'wood', label: `${options.container} slots`, height: uiFixed(options.visibleRows * 33 - 2), padding: { right: 24 }, overflow: 'scroll-y' }, [grid])
    : uiFlex({ width: 'grow' }, [grid]);
  const sortReason = () => options.sortDisabledReason?.() ?? null;
  const sortAllowed = () => options.sortEnabled?.() !== false && sortReason() === null;
  const sortButton = options.onSort ? uiGlyphButton({ glyph: 'glyph.sort', id: options.id ? `${options.id}.sort` : undefined,
    label: 'Sort inventory', onPress: () => { if (sortAllowed()) options.onSort?.(); } }) : null;
  const sort = sortButton && options.sortDisabledReason ? uiTooltip(() => sortReason() ?? 'Sort & stack', sortButton, { shrink: 0 }) : sortButton;
  let previous = '';
  const refresh = () => {
    sortButton?.setDisabled(!sortAllowed());
    const query = editor.snapshot().value.trim().toLowerCase();
    const visible = cells.filter(cell => {
      const index = cell.index;
      if (index >= (options.capacity?.() ?? Infinity)) return false;
      if (!query) return true;
      const item = options.controller ? options.controller.model.stack({ container: options.container, index }) : options.stack?.(index);
      // Filtering hides only non-matching items: empty cells always stay, as places to put something down (BUG-065,
      // owner 2026-09-28).
      if (!item) return true;
      return Boolean((item.itemKind.toLowerCase().includes(query)
        || (options.itemLabel?.(item) ?? itemDefinition(item.itemKind)?.displayName ?? '').toLowerCase().includes(query)));
    });
    const key = JSON.stringify(visible.map(cell => cell.index ?? cells.indexOf(cell)));
    if (key === previous) return;
    previous = key;
    const indexes = new Set(visible.map(cell => cell.index));
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
