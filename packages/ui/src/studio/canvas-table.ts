import { drawFantasyButton } from '../design-system/fantasy-controls.js';
import { drawUiFrame, uiFrameContentRect, type UiFrameStyle } from '../design-system/frame.js';
import type { UiPoint, UiRect } from '../geometry.js';
import { drawPixelTextInRect } from '../pixel-ui.js';
import type { StudioCanvasShellArt } from './canvas-shell.js';
import { STUDIO_SKIN_TOKENS } from './skin.js';

export const STUDIO_CANVAS_TABLE_MAX_VISIBLE_ROWS = 200;

export interface StudioCanvasTableColumn {
  readonly id: string;
  readonly label: string;
  readonly width?: number;
  readonly minWidth?: number;
}

export interface StudioCanvasTableRow {
  readonly id: string;
  readonly cells: readonly string[];
  readonly selected?: boolean;
  readonly disabled?: boolean;
}

export interface StudioCanvasTableModel {
  readonly columns: readonly StudioCanvasTableColumn[];
  readonly rows: readonly StudioCanvasTableRow[];
  readonly scrollRow: number;
  readonly focusedCell?: { readonly rowId: string; readonly columnId: string };
  readonly rowHeight?: number;
  readonly headerHeight?: number;
  readonly maxVisibleRows?: number;
  readonly emptyLabel?: string;
  /** Nested workspaces should prefer `thin`; the legacy composite remains the
   * default for standalone tables that own their outer frame. */
  readonly frameStyle?: Extract<UiFrameStyle, 'wood_parchment' | 'thin' | 'unframed'>;
}

export interface StudioCanvasTableCellLayout {
  readonly rowId: string;
  readonly rowIndex: number;
  readonly columnId: string;
  readonly columnIndex: number;
  readonly bounds: UiRect;
  readonly value: string;
  readonly focused: boolean;
}

export interface StudioCanvasTableRowLayout {
  readonly id: string;
  readonly rowIndex: number;
  readonly bounds: UiRect;
  readonly selected: boolean;
  readonly disabled: boolean;
  readonly cells: readonly StudioCanvasTableCellLayout[];
}

export interface StudioCanvasTableLayout {
  readonly bounds: UiRect;
  readonly viewport: UiRect;
  readonly header: UiRect;
  readonly headerCells: readonly (StudioCanvasTableColumn & { readonly bounds: UiRect })[];
  readonly rows: readonly StudioCanvasTableRowLayout[];
  readonly firstRow: number;
  readonly visibleRowCount: number;
  readonly maximumScrollRow: number;
  readonly rowHeight: number;
  readonly emptyLabel: string;
  readonly frameStyle: Extract<UiFrameStyle, 'wood_parchment' | 'thin' | 'unframed'>;
}

export type StudioCanvasTableHit =
  | { readonly kind: 'header'; readonly columnId: string; readonly columnIndex: number }
  | { readonly kind: 'row'; readonly rowId: string; readonly rowIndex: number }
  | { readonly kind: 'cell'; readonly rowId: string; readonly rowIndex: number;
      readonly columnId: string; readonly columnIndex: number };

export type StudioCanvasTableScrollCommand = 'line_up' | 'line_down' | 'page_up'
  | 'page_down' | 'home' | 'end';

function finiteWhole(value: number | undefined, fallback: number, minimum: number): number {
  return value === undefined || !Number.isFinite(value)
    ? fallback : Math.max(minimum, Math.round(value));
}

function assertUnique(values: readonly string[], label: string): void {
  if (values.some((value) => value.length === 0) || new Set(values).size !== values.length) {
    throw new Error(`studio_canvas_table_${label}_invalid`);
  }
}

function columnWidths(columns: readonly StudioCanvasTableColumn[], availableWidth: number): readonly number[] {
  const minimums = columns.map(({ minWidth }) => finiteWhole(minWidth, 48, 12));
  const requested = columns.map(({ width }, index) => width === undefined
    ? null : Math.max(minimums[index]!, finiteWhole(width, minimums[index]!, 1)));
  const committed = requested.reduce<number>((sum, width) => sum + (width ?? 0), 0);
  const flexible = requested.filter((width) => width === null).length;
  const remaining = Math.max(0, availableWidth - committed);
  const share = flexible === 0 ? 0 : Math.floor(remaining / flexible);
  return Object.freeze(requested.map((width, index) => width ?? Math.max(minimums[index]!, share)));
}

function cellRects(columns: readonly StudioCanvasTableColumn[], widths: readonly number[], row: UiRect): readonly UiRect[] {
  let x = row.x;
  return Object.freeze(columns.map((_column, index) => {
    const bounds = Object.freeze({ x, y: row.y, width: widths[index]!, height: row.height });
    x += bounds.width;
    return bounds;
  }));
}

export function layoutStudioCanvasTable(
  model: StudioCanvasTableModel,
  bounds: UiRect,
): StudioCanvasTableLayout {
  assertUnique(model.columns.map(({ id }) => id), 'columns');
  assertUnique(model.rows.map(({ id }) => id), 'rows');
  if (model.columns.length === 0) throw new Error('studio_canvas_table_columns_empty');
  if (![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite)
    || bounds.width <= 0 || bounds.height <= 0) throw new Error('studio_canvas_table_bounds_invalid');

  const frameStyle = model.frameStyle ?? 'wood_parchment';
  const viewport = Object.freeze(uiFrameContentRect(bounds, frameStyle, 0));
  const headerHeight = Math.min(viewport.height, finiteWhole(model.headerHeight, 40, 12));
  const rowHeight = finiteWhole(model.rowHeight, 40, 12);
  const capacity = Math.max(0, Math.floor((viewport.height - headerHeight) / rowHeight));
  const requestedMaximum = Math.min(
    STUDIO_CANVAS_TABLE_MAX_VISIBLE_ROWS,
    finiteWhole(model.maxVisibleRows, STUDIO_CANVAS_TABLE_MAX_VISIBLE_ROWS, 1),
  );
  const visibleRowCount = Math.min(capacity, requestedMaximum, model.rows.length);
  const maximumScrollRow = Math.max(0, model.rows.length - visibleRowCount);
  const firstRow = Math.max(0, Math.min(maximumScrollRow, Math.floor(model.scrollRow)));
  const header = Object.freeze({ x: viewport.x, y: viewport.y, width: viewport.width, height: headerHeight });
  const widths = columnWidths(model.columns, viewport.width);
  const headerRects = cellRects(model.columns, widths, header);
  const headerCells = Object.freeze(model.columns.map((column, index) => Object.freeze({
    ...column,
    bounds: headerRects[index]!,
  })));
  const rows = Object.freeze(model.rows.slice(firstRow, firstRow + visibleRowCount).map((row, offset) => {
    const rowIndex = firstRow + offset;
    const rowBounds = Object.freeze({ x: viewport.x, y: viewport.y + headerHeight + offset * rowHeight,
      width: viewport.width, height: rowHeight });
    const rects = cellRects(model.columns, widths, rowBounds);
    const cells = Object.freeze(model.columns.map((column, columnIndex) => Object.freeze({
      rowId: row.id,
      rowIndex,
      columnId: column.id,
      columnIndex,
      bounds: rects[columnIndex]!,
      value: row.cells[columnIndex] ?? '',
      focused: model.focusedCell?.rowId === row.id && model.focusedCell.columnId === column.id,
    })));
    return Object.freeze({ id: row.id, rowIndex, bounds: rowBounds,
      selected: row.selected === true, disabled: row.disabled === true, cells });
  }));
  return Object.freeze({ bounds: Object.freeze({ ...bounds }), viewport, header, headerCells, rows,
    firstRow, visibleRowCount, maximumScrollRow, rowHeight, emptyLabel: model.emptyLabel ?? 'No rows', frameStyle });
}

export function drawStudioCanvasTable(
  context: CanvasRenderingContext2D,
  art: StudioCanvasShellArt,
  layout: StudioCanvasTableLayout,
): void {
  drawUiFrame(context, art.skin, layout.bounds, layout.frameStyle);
  context.save();
  context.beginPath();
  context.rect(layout.viewport.x, layout.viewport.y, layout.viewport.width, layout.viewport.height);
  context.clip();
  for (const header of layout.headerCells) {
    drawFantasyButton(context, art.skin, art.fonts, header.bounds, {
      label: header.label,
      tone: 'gold',
      shape: 'square',
      state: 'idle',
    });
  }
  for (const row of layout.rows) {
    context.save();
    if (row.disabled) context.globalAlpha *= 0.52;
    drawUiFrame(context, art.skin, row.bounds, row.selected ? 'wood' : 'thin');
    for (const cell of row.cells) {
      if (cell.focused) drawUiFrame(context, art.skin, cell.bounds, 'wood');
      drawPixelTextInRect(context, art.fonts, cell.value, cell.bounds, {
        verticalAlign: 'center',
        overflow: 'ellipsis',
        paddingX: 4,
        color: row.selected ? STUDIO_SKIN_TOKENS.parchmentLight
          : row.disabled ? STUDIO_SKIN_TOKENS.mutedInk : STUDIO_SKIN_TOKENS.ink,
      });
    }
    context.restore();
  }
  if (layout.rows.length === 0) {
    drawPixelTextInRect(context, art.fonts, layout.emptyLabel, {
      x: layout.viewport.x,
      y: layout.header.y + layout.header.height,
      width: layout.viewport.width,
      height: Math.max(0, layout.viewport.height - layout.header.height),
    }, { align: 'center', verticalAlign: 'center', overflow: 'ellipsis',
      color: STUDIO_SKIN_TOKENS.mutedInk });
  }
  context.restore();
}

export function hitStudioCanvasTable(layout: StudioCanvasTableLayout, point: UiPoint): StudioCanvasTableHit | null {
  for (let index = 0; index < layout.headerCells.length; index += 1) {
    const header = layout.headerCells[index]!;
    if (point.x >= header.bounds.x && point.y >= header.bounds.y
      && point.x < header.bounds.x + header.bounds.width
      && point.y < header.bounds.y + header.bounds.height) {
      return Object.freeze({ kind: 'header', columnId: header.id, columnIndex: index });
    }
  }
  for (const row of layout.rows) {
    if (point.y < row.bounds.y || point.y >= row.bounds.y + row.bounds.height
      || point.x < row.bounds.x || point.x >= row.bounds.x + row.bounds.width) continue;
    const cell = row.cells.find(({ bounds }) => point.x >= bounds.x && point.x < bounds.x + bounds.width);
    return cell === undefined
      ? Object.freeze({ kind: 'row', rowId: row.id, rowIndex: row.rowIndex })
      : Object.freeze({ kind: 'cell', rowId: row.id, rowIndex: row.rowIndex,
        columnId: cell.columnId, columnIndex: cell.columnIndex });
  }
  return null;
}

export function scrollStudioCanvasTable(
  layout: Pick<StudioCanvasTableLayout, 'firstRow' | 'visibleRowCount' | 'maximumScrollRow'>,
  command: StudioCanvasTableScrollCommand,
): number {
  const page = Math.max(1, layout.visibleRowCount);
  const delta = command === 'line_up' ? -1 : command === 'line_down' ? 1
    : command === 'page_up' ? -page : command === 'page_down' ? page : 0;
  if (command === 'home') return 0;
  if (command === 'end') return layout.maximumScrollRow;
  return Math.max(0, Math.min(layout.maximumScrollRow, layout.firstRow + delta));
}
