import { paintUiSkin } from './art.js';
import { UiElement, type UiElementKey } from '../runtime/element.js';
import { uiFixed, type UiStyle, type UiDimension } from '../layout/box.js';
import { scrollUiElement, uiScrollThumb } from '../layout/scroll.js';
import { resolveUiTextContrast } from '../skin/contrast.js';
import { UI_SIZE_METRICS, UI_TABLE_DEFAULTS, type UiControlSize, type UiTone } from '../tokens.js';
import { uiFlex, uiScrollArea } from './layout.js';
import { uiText } from './text.js';
import { uiButton } from './button.js';
import { uiIcon } from './media.js';
export interface UiListOptions<T> {
  readonly id?: string; readonly kind?: 'list' | 'tree'; readonly label: string; readonly items: readonly T[]; readonly key: (item: T) => string;
  readonly render: (item: T, index: number) => UiElement; readonly layout?: UiStyle; readonly size?: UiControlSize; readonly tone?: UiTone;
  readonly selected?: readonly string[]; readonly multiple?: boolean; readonly onSelect?: (keys: readonly string[], item: T) => void;
  readonly onActivate?: (item: T) => void; readonly virtual?: boolean; readonly rowHeight?: ReturnType<typeof uiFixed>; readonly rowPadding?: UiStyle['padding'];
  readonly initialActive?: number; readonly initialScrollY?: number;
  readonly onActiveChange?: (index: number) => void; readonly onScroll?: (element: UiElement) => void;
  readonly onKey?: (event: UiElementKey, element: UiElement) => boolean; readonly onArrange?: (element: UiElement) => void;
}
/** A single keyboard stop with a bounded set of mounted rows. Scroll geometry is
 * represented by an intrinsic spacer; offscreen controls are disposed. */
export function uiList<T>(options: UiListOptions<T>): UiElement {
  const rowHeight = Math.max(1, options.rowHeight?.size ?? UI_SIZE_METRICS[options.size ?? 'md'].controlHeight);
  let rendered: readonly T[] | null = null, renderedWidth = -1, range = '', active = Math.max(0, options.initialActive ?? 0);
  const selected = new Set(options.selected ?? []);
  const items = () => list.props['items'] as readonly T[];
  const choose = (index: number, toggle = options.multiple ?? false) => {
    const item = items()[index]; if (!item) return;
    active = index; options.onActiveChange?.(active); const key = options.key(item);
    if (!toggle) selected.clear(); if (toggle && selected.has(key)) selected.delete(key); else selected.add(key);
    list.setProps({ selected: [...selected], active }, false); range = ''; rebuild(list); options.onSelect?.([...selected], item);
  };
  const reveal = () => { const y = active * rowHeight;
    if (y < list.scroll.y) scrollUiElement(list, list.scroll.x, y);
    else if (y + rowHeight > list.scroll.y + list.contentRect.height) scrollUiElement(list, list.scroll.x, y + rowHeight - list.contentRect.height);
  };
  const rebuild = (element: UiElement) => {
    active = Math.max(0, Math.min(items().length - 1, Number(element.props['active']) || 0));
    const all = items(), height = Math.max(rowHeight, element.contentRect.height || 240);
    const start = options.virtual === false ? 0 : Math.max(0, Math.floor(element.scroll.y / rowHeight) - 2);
    const end = options.virtual === false ? all.length : Math.min(all.length, start + Math.ceil(height / rowHeight) + 4);
    const next = `${start}:${end}:${element.contentRect.width}:${active}`;
    if (range === next && rendered === all) return;
    const retained = new Map<string, UiElement>();
    if (rendered === all && renderedWidth === element.contentRect.width) {
      for (const row of [...(element.children[0]?.children ?? [])]) {
        const index=Number(row.props['index']);
        if(index>=start&&index<end) { row.parent?.remove(row); retained.set(`${index}:${String(row.props['key'])}`,row); }
      }
    }
    range = next; rendered = all; renderedWidth = element.contentRect.width;
    for (const child of [...element.children]) child.dispose();
    const extent = new UiElement({ kind: 'list-extent', style: { width: uiFixed(Math.max(0, element.contentRect.width - 4)), height: uiFixed(all.length * rowHeight), shrink: 0 } }); element.append(extent);
    for (let index = start; index < end; index++) {
      const item = all[index]!, key = options.key(item);
      const existing=retained.get(`${index}:${key}`); if(existing){extent.append(existing);continue;}
      const row = new UiElement({ kind: 'list-row', label: key, props: { index, key, tone: options.tone }, pointerMode: 'capture',
        style: { position: 'absolute', inset: { left: 0, top: uiFixed(index * rowHeight) }, width: 'grow', height: uiFixed(rowHeight), display: 'flex', direction: 'column', justify: 'center', padding: options.rowPadding ?? { left: 4, right: 8 } }, children: [options.render(item, index)],
        onPointer(event) { if (event.type === 'down' && event.button === 0) { event.capture(); return true; } if (event.type === 'up') { event.release(); choose(index, options.multiple && event.shiftKey); return true; } if (event.type === 'cancel') { event.release(); return true; } return false; },
        paint(node, { context, art }) {
          if (art && !art.missingArt && (selected.has(key) || index === active && list.props['focused'])) {
            paintUiSkin(context, art.skin.button, `outline.md.chamfered.idle.${index === active && list.props['focused'] ? 'white' : 'gold'}`, node.rect);
          }
        },
      }); extent.append(row);
    }
    element.setProps({ range: [start, end], active }, false);
  };
  const list = new UiElement({ id: options.id, kind: options.kind ?? 'list', label: options.label, focusable: true, pointerMode: 'capture', props: { items: options.items, selected: [...selected], active },
    style: { width: 'grow', height: 'grow', display: 'stack', overflow: 'scroll-y', ...options.layout },
    onArrange: element => { options.onArrange?.(element); rebuild(element); }, onScroll: element => { rebuild(element); options.onScroll?.(element); }, onFocus: (focused, element) => { element.setProps({ focused }, false); },
    onKey(event) {
      if (options.onKey?.(event, list)) return true;
      const count = items().length; if (!count) return false;
      const page = Math.max(1, Math.floor(list.contentRect.height / rowHeight));
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? count - 1 : event.key === 'PageDown' ? active + page : event.key === 'PageUp' ? active - page
        : event.key === 'ArrowDown' ? active + 1 : event.key === 'ArrowUp' ? active - 1 : undefined;
      if (next !== undefined) { active = Math.max(0, Math.min(count - 1, next)); options.onActiveChange?.(active); list.setProps({ active }, false); list.requestFocus(); reveal(); range = ''; rebuild(list); return true; }
      if (event.key === 'Enter' || event.key === ' ') { choose(active); if (event.key === 'Enter') options.onActivate?.(items()[active]!); return true; } return false;
    },
    paintOverlay(element, { context }) { const thumb = uiScrollThumb(element, 'y'); if (thumb) { context.fillStyle = resolveUiTextContrast(options.tone ?? 'neutral').color; const r = thumb.thumb; context.fillRect(r.x, r.y, r.width, r.height); } },
  });
  list.scroll.y = Math.max(0, options.initialScrollY ?? 0); rebuild(list); return list;
}
export interface UiTab { readonly id: string; readonly label: string; readonly badge?: number | string; readonly disabled?: boolean; readonly content: UiElement }
export interface UiTabsElement extends UiElement { selectTab(id: string): void }
export function uiTabs(options: { readonly id?: string; readonly label: string; readonly tabs: readonly UiTab[]; readonly value?: string; readonly tone?: UiTone; readonly layout?: UiStyle; readonly onChange?: (id: string) => void }): UiTabsElement {
  const selected = options.value ?? options.tabs.find(tab => !tab.disabled)?.id;
  const group = uiFlex({ id: options.id, label: options.label, width: 'grow', height: 'grow', gap: 4, ...options.layout });
  const strip = uiScrollArea({ direction: 'row', overflow: 'scroll-x', width: 'grow', height: uiFixed(28), gap: 4, shrink: 0 });
  const body = uiFlex({ width: 'grow', height: 'grow' }); group.append(strip).append(body); group.setProps({ value: selected });
  const select = (id: string) => { if (!options.tabs.some(tab => tab.id === id && !tab.disabled)) return; group.setProps({ value: id }, false); for (const tab of options.tabs) tab.content.setStyle({ visible: tab.id === id }); for (const [index, button] of strip.children.entries()) button.setProps({ tone: options.tabs[index]!.id === id ? options.tone ?? 'primary' : 'neutral' }, false); options.onChange?.(id); };
  for (const tab of options.tabs) {
    tab.content.setStyle({ visible: tab.id === selected }); body.append(tab.content);
    const base = uiButton({ id: `${group.id}:tab:${tab.id}`, label: `${tab.label}${tab.badge === undefined ? '' : ` (${tab.badge})`}`, tone: tab.id === selected ? options.tone ?? 'primary' : 'neutral', disabled: tab.disabled, onPress: () => select(tab.id) });
    strip.append(new UiElement({ ...base.hooks, kind: 'tab', focusGroup: strip.id, onFocus(focused) { if (focused && group.props['value'] !== tab.id) select(tab.id); } }));
  }
  return Object.assign(group, { selectTab: select });
}
export interface UiTreeNode { readonly id: string; readonly label: string; readonly searchText?: string; readonly children?: readonly UiTreeNode[] }
export interface UiTreeOptions {
  readonly id?: string; readonly label: string; readonly nodes: readonly UiTreeNode[]; readonly expanded?: readonly string[]; readonly query?: string; readonly layout?: UiStyle;
  readonly activeId?: string | null; readonly selected?: readonly string[]; readonly initialScrollY?: number;
  readonly onSelect?: (id: string) => void; readonly onExpandedChange?: (ids: readonly string[]) => void;
  readonly onActiveChange?: (id: string) => void; readonly onScroll?: (element: UiElement) => void;
  readonly onKey?: (event: UiElementKey, element: UiElement) => boolean; readonly trailing?: (node: UiTreeNode) => UiElement | undefined;
  readonly rowHeight?: ReturnType<typeof uiFixed>; readonly renderNode?: (node: UiTreeNode) => UiElement;
}
export function uiTree(options: UiTreeOptions): UiElement {
  const expanded = new Set(options.expanded ?? []);
  const flatten = (): { node: UiTreeNode; depth: number }[] => {
    const query = String(ref.tree?.props['query'] ?? options.query ?? '').toLowerCase();
    const matches = (node: UiTreeNode): boolean => (node.searchText ?? node.label).toLowerCase().includes(query) || Boolean(node.children?.some(matches));
    const result: { node: UiTreeNode; depth: number }[] = [];
    const visit = (nodes: readonly UiTreeNode[], depth: number) => { for (const node of nodes) if (!query || matches(node)) { result.push({ node, depth }); if (node.children && (query || expanded.has(node.id))) visit(node.children, depth + 1); } };
    visit(options.nodes, 0); return result;
  };
  const ref: { tree?: UiElement } = {}; let query = options.query ?? '';
  const toggle = (node: UiTreeNode) => { if (expanded.has(node.id)) expanded.delete(node.id); else expanded.add(node.id); ref.tree!.setProps({ items: flatten(), expanded: [...expanded] }); options.onExpandedChange?.([...expanded]); };
  const base = uiList({ id: options.id, label: options.label, kind: 'tree', items: flatten(), key: entry => entry.node.id, layout: options.layout, rowHeight: options.rowHeight,
    selected: options.selected, initialActive: Math.max(0, flatten().findIndex(entry => entry.node.id === options.activeId)), initialScrollY: options.initialScrollY, onScroll: options.onScroll,
    onActiveChange: index => { const entry = flatten()[index]; if (entry) options.onActiveChange?.(entry.node.id); },
    onKey(event, node) {
      if (options.onKey?.(event, node)) return true;
      const rows = node.props['items'] as ReturnType<typeof flatten>, current = rows[Number(node.props['active'])];
      if (current && (event.key === 'ArrowRight' || event.key === 'ArrowLeft')) {
        if ((event.key === 'ArrowRight') !== expanded.has(current.node.id) && current.node.children?.length) toggle(current.node); return true;
      } return false;
    }, onArrange(node) { const next = String(node.props['query'] ?? options.query ?? ''); if (next !== query) { query = next; node.setProps({ items: flatten() }); } },
    onSelect: (_keys, entry) => options.onSelect?.(entry.node.id), render: entry => options.renderNode?.(entry.node) ?? uiFlex({ direction: 'row', gap: 4, width: 'grow', height: 'grow' }, [
      new UiElement({ style: { width: uiFixed(entry.depth * 12), height: uiFixed(1), shrink: 0 } }),
      ...(entry.node.children?.length ? [new UiElement({ kind: 'tree-expander', label: `Expand ${entry.node.label}`, pointerMode: 'capture', style: { width: uiFixed(16), height: uiFixed(16) }, children: [uiIcon({ lucide: expanded.has(entry.node.id) ? 'chevronDown' : 'chevronRight' })], onPointer(event) { if (event.type !== 'up') return event.type === 'down'; toggle(entry.node); return true; } })] : []),
      uiText(entry.node.label, { overflow: 'ellipsis', layout: { width: 'grow' } }),
      ...(options.trailing ? [options.trailing(entry.node)].filter((child): child is UiElement => child !== undefined) : []),
    ]) });
  ref.tree = base; return base;
}

export function uiPagination(options: { readonly id?: string; readonly page: number; readonly pages: number; readonly onChange: (page: number) => void; readonly layout?: UiStyle }): UiElement {
  const group = uiFlex({ id: options.id, direction: 'row', gap: 4, align: 'center', ...options.layout });
  const page = Math.max(0, Math.min(Math.max(0, options.pages - 1), options.page));
  group.append(uiButton({ label: 'Previous', size: 'sm', disabled: page === 0, onPress: () => options.onChange(page - 1) }));
  group.append(uiText(`${page + 1} / ${Math.max(1, options.pages)}`));
  group.append(uiButton({ label: 'Next', size: 'sm', disabled: page >= options.pages - 1, onPress: () => options.onChange(page + 1) })); return group;
}
export interface UiTableColumn<T> { readonly id: string; readonly label: string; readonly width?: UiDimension; readonly value: (row: T) => string | number; readonly render?: (row: T) => UiElement; readonly sortable?: boolean }
export interface UiTableSort { readonly column: string; readonly direction: 'asc' | 'desc' }
export interface UiTableState { readonly sort: readonly UiTableSort[]; readonly page: number; readonly scrollY: number; readonly active: number }
export interface UiTableOptions<T> {
  readonly id?: string; readonly label: string; readonly rows: readonly T[]; readonly key: (row: T) => string; readonly columns: readonly UiTableColumn<T>[];
  readonly state?: UiTableState; readonly onStateChange?: (state: UiTableState) => void;
  readonly surface?: 'studio' | 'game'; readonly mode?: 'virtual' | 'pagination'; readonly pageSize?: number; readonly sort?: readonly UiTableSort[];
  readonly selected?: readonly string[]; readonly multiple?: boolean; readonly onSelect?: (keys: readonly string[]) => void; readonly layout?: UiStyle;
}
export function uiTable<T>(options: UiTableOptions<T>): UiElement {
  let page = options.state?.page ?? 0, sort = [...options.sort ?? options.state?.sort ?? []], selected = [...options.selected ?? []], requestedFocus = '';
  let scrollY = options.state?.scrollY ?? 0, active = options.state?.active ?? 0;  const pageSize = Math.max(1, options.pageSize ?? 20), widths = new Map(options.columns.map(column => [column.id, column.width ?? 'grow']));
  const mode = options.mode ?? UI_TABLE_DEFAULTS[options.surface ?? 'studio'];
  const shell = uiScrollArea({ id: options.id, label: options.label, width: 'grow', height: 'grow', ...options.layout, overflow: 'scroll-x' });
  const outer = new UiElement({ ...shell.hooks, kind: 'table' });
  const table = uiFlex({ width: 'grow', height: 'grow', gap: 4 }); outer.append(table);
  const publishState = () => { const state = { sort: [...sort], page, scrollY, active }; outer.setProps({ state }, false); options.onStateChange?.(state); };
  const sorted = () => options.rows.toSorted((a, b) => {
    for (const item of sort) { const column = options.columns.find(column => column.id === item.column); if (!column) continue;
      const left = column.value(a), right = column.value(b), compare = typeof left === 'number' && typeof right === 'number' ? left - right : String(left).localeCompare(String(right));
      if (compare) return item.direction === 'asc' ? compare : -compare;
    } return 0;
  });
  const rebuild = () => {
    for (const child of [...table.children]) child.dispose();
    const rows = sorted(), shown = mode === 'pagination' ? rows.slice(page * pageSize, (page + 1) * pageSize) : rows;
    table.setStyle({ minWidth: uiFixed(options.columns.reduce((sum, column) => { const width = widths.get(column.id); return sum + (typeof width === 'object' && width.mode === 'fixed' ? width.size : 80); }, 16 + Math.max(0, options.columns.length - 1) * 4)) });
    const header = uiFlex({ direction: 'row', width: 'grow', height: uiFixed(24), gap: 4, padding: { left: 4, right: 12 }, shrink: 0 });
    for (const column of options.columns) {
      const order = sort.find(item => item.column === column.id);
      const button = uiButton({ id: `${outer.id}:sort:${column.id}`, label: `${column.label}${order ? order.direction === 'asc' ? ' ^' : ' v' : ''}`, size: 'sm', disabled: column.sortable === false,
        layout: { width: 'grow' }, onPress: event => {
          const current = sort.find(item => item.column === column.id); const next = { column: column.id, direction: current?.direction === 'asc' ? 'desc' as const : 'asc' as const };
          sort = event.shiftKey ? [...sort.filter(item => item.column !== column.id), next] : [next]; page = 0; scrollY = 0; active = 0; requestedFocus = `${outer.id}:sort:${column.id}`; rebuild();
        } });
      let drag: { x: number; width: number } | null = null;
      const cell = uiFlex({ direction: 'row', gap: 0, width: widths.get(column.id), shrink: 0 }, [button]);
      cell.append(new UiElement({ id: `${outer.id}:resize:${column.id}`, kind: 'column-resize', label: `Resize ${column.label}`, focusable: true, pointerMode: 'capture', style: { width: uiFixed(4), height: 'grow' },
        onKey(event) { if (!['ArrowLeft','ArrowRight'].includes(event.key)) return false; widths.set(column.id, uiFixed(Math.max(40, cell.rect.width + (event.key === 'ArrowRight' ? 8 : -8)))); requestedFocus = `${outer.id}:resize:${column.id}`; rebuild(); return true; },
        onPointer(event) { if (event.type === 'down') { drag = { x: event.point.x, width: cell.rect.width }; event.capture(); return true; } if (event.type === 'move' && drag) { widths.set(column.id, uiFixed(Math.max(40, drag.width + event.point.x - drag.x))); cell.setStyle({ width: widths.get(column.id) }); return true; } if (drag && (event.type === 'up' || event.type === 'cancel')) { drag = null; event.release(); rebuild(); return true; } return false; },
      })); header.append(cell);
    }
    table.append(header);
    table.append(uiList({ id: `${outer.id}:rows`, label: options.label, items: shown, initialActive: active, initialScrollY: scrollY,
      onActiveChange: index => { active = index; publishState(); }, onScroll: element => { scrollY = element.scroll.y; publishState(); }, key: options.key, selected, multiple: options.multiple, onSelect: keys => { selected = [...keys]; outer.setProps({ selected }, false); options.onSelect?.(keys); },
      render: row => uiFlex({ direction: 'row', gap: 4, width: 'grow' }, options.columns.map(column => uiFlex({ width: widths.get(column.id), shrink: 0 }, [column.render?.(row) ?? uiText(String(column.value(row)), { overflow: 'ellipsis' })]))) }));
    if (mode === 'pagination') table.append(uiPagination({ page, pages: Math.ceil(rows.length / pageSize), onChange: next => { page = next; scrollY = 0; active = 0; requestedFocus = 'pagination'; rebuild(); } }));
    outer.setProps({ sort, page, mode, selected, rowOrder: rows.map(options.key) }, false); publishState();
    const descendants = (node: UiElement): UiElement[] => node.children.flatMap(child => [child, ...descendants(child)]);
    if (requestedFocus === 'pagination') table.children.at(-1)?.children.toReversed().find(node => node.focusable && !node.disabled)?.requestFocus();
    else descendants(table).find(node => node.id === requestedFocus)?.requestFocus();
    requestedFocus = '';
  };
  rebuild(); return outer;
}
