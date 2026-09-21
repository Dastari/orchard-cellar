import { layoutUiGrid } from '../../design-system/layout.js';
import type { UiRect } from '../../geometry.js';
import type { UiElement } from '../runtime/element.js';
import { uiResolveDimension, uiBoundSize, type UiStyle } from './box.js';

export function uiLayoutGrid(bounds: UiRect, children: readonly UiElement[], style: UiStyle): UiRect[] {
  const requestedColumns = style.areas?.[0]?.length ?? style.columns;
  const gap = style.columnGap ?? style.gap ?? 0, fixedWidth = style.columnWidth?.size;
  const columns = fixedWidth !== undefined && (requestedColumns === 'auto' || requestedColumns === undefined)
    ? Math.max(1, Math.floor((bounds.width + gap) / (fixedWidth + gap))) : requestedColumns;
  const gridBounds = fixedWidth !== undefined && typeof columns === 'number'
    ? { ...bounds, width: columns * fixedWidth + Math.max(0, columns - 1) * gap } : bounds;
  const count = style.areas ? style.areas.length * (style.areas[0]?.length ?? 1) : Math.max(children.length, typeof columns === 'number' ? columns : 0);
  const sizes = Array.from({ length: count }, (_, i) => children[i]?.measured.preferred ?? { width: 0, height: 0 });
  const grid = layoutUiGrid(gridBounds, sizes, { columns,
    minColumnWidth: uiResolveDimension(style.minColumnWidth, bounds.width, Math.max(1, ...sizes.map(s => s.width))),
    rowHeight: style.rowHeight ? uiResolveDimension(style.rowHeight, bounds.height, 0)
      : style.rows ? Math.max(0, (bounds.height - (style.rows - 1) * (style.rowGap ?? style.gap ?? 0)) / style.rows) : undefined,
    columnGap: style.columnGap ?? style.gap, rowGap: style.rowGap ?? style.gap, alignItems: style.align });
  const cellsForChildren = children.map((node, i) => {
    if (!node.style.area || !style.areas) return grid.cells[i] ?? bounds;
    const cells = grid.cells.filter((_, index) => style.areas![Math.floor(index / grid.columns)]?.[index % grid.columns] === node.style.area);
    if (!cells.length) throw new Error(`Unknown UI grid area: ${node.style.area}`);
    const x = Math.min(...cells.map(c => c.x)), y = Math.min(...cells.map(c => c.y));
    const rect = { x, y, width: Math.max(...cells.map(c => c.x + c.width)) - x, height: Math.max(...cells.map(c => c.y + c.height)) - y };
    if (cells.some(c => c.width <= 0) || cells.length !== new Set(cells.map(c => c.x)).size * new Set(cells.map(c => c.y)).size) {
      throw new Error(`UI grid area must be rectangular: ${node.style.area}`);
    }
    return rect;
  });
  return children.map((node, i) => {
    const cell = cellsForChildren[i]!;
    const align = node.style.alignSelf ?? style.align ?? 'stretch';
    const size = uiBoundSize({ ...node.style, width: node.style.width ?? (align === 'stretch' ? 'grow' : 'fit'),
      height: node.style.height ?? (align === 'stretch' ? 'grow' : 'fit') }, node.measured.preferred, cell);
    const offset = align === 'center' ? 0.5 : align === 'end' ? 1 : 0;
    return { x: cell.x + Math.round((cell.width - size.width) * offset), y: cell.y + Math.round((cell.height - size.height) * offset), ...size };
  });
}
