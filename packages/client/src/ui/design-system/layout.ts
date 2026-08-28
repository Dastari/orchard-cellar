import { insetRect, type UiInsets, type UiRect, type UiSize } from '../geometry.js';

export type UiItemAlignment = 'start' | 'center' | 'end' | 'stretch';
export type UiContentDistribution =
  | 'start'
  | 'center'
  | 'end'
  | 'space_between'
  | 'space_around'
  | 'space_evenly';
export type UiFlexDirection = 'row' | 'column';
export type UiContainerVariant = 'compact' | 'regular' | 'wide';

export interface UiFlexItem {
  readonly minSize: UiSize;
  /** Preferred size on the main axis. It may shrink back to minSize. */
  readonly basis?: number;
  readonly grow?: number;
  readonly shrink?: number;
  readonly alignSelf?: UiItemAlignment;
}

export interface UiFlexOptions {
  readonly direction?: UiFlexDirection;
  readonly gap?: number;
  readonly align?: UiItemAlignment;
  readonly justify?: UiContentDistribution;
  readonly padding?: number | Partial<UiInsets>;
  readonly wrap?: boolean;
}

export interface UiGridOptions {
  readonly columns?: number | 'auto';
  readonly minColumnWidth?: number;
  readonly maxColumns?: number;
  readonly rowHeight?: number;
  readonly columnGap?: number;
  readonly rowGap?: number;
  readonly alignItems?: UiItemAlignment;
  readonly justifyItems?: UiItemAlignment;
  readonly padding?: number | Partial<UiInsets>;
}

export interface UiGridLayout {
  readonly columns: number;
  readonly rows: number;
  readonly cells: readonly UiRect[];
  readonly items: readonly UiRect[];
}

export interface UiContainerBreakpoints {
  readonly regular: number;
  readonly wide: number;
}

export const DEFAULT_UI_CONTAINER_BREAKPOINTS: UiContainerBreakpoints = {
  regular: 240,
  wide: 420,
};

function normalizedPadding(padding: number | Partial<UiInsets> | undefined): Partial<UiInsets> {
  if (typeof padding === 'number') {
    const value = Math.max(0, padding);
    return { left: value, top: value, right: value, bottom: value };
  }
  return padding ?? {};
}

function axisSize(size: UiSize, direction: UiFlexDirection): number {
  return direction === 'row' ? size.width : size.height;
}

function crossSize(size: UiSize, direction: UiFlexDirection): number {
  return direction === 'row' ? size.height : size.width;
}

function weightedShares(total: number, weights: readonly number[]): number[] {
  const safeTotal = Math.max(0, Math.round(total));
  const weightTotal = weights.reduce((sum, weight) => sum + Math.max(0, weight), 0);
  if (safeTotal === 0 || weightTotal === 0) return weights.map(() => 0);
  let allocated = 0;
  return weights.map((weight, index) => {
    const share = index === weights.length - 1
      ? safeTotal - allocated
      : Math.floor(safeTotal * Math.max(0, weight) / weightTotal);
    allocated += share;
    return share;
  });
}

function alignedCrossRect(
  crossStart: number,
  available: number,
  requested: number,
  alignment: UiItemAlignment,
): readonly [number, number] {
  if (alignment === 'stretch') return [crossStart, available];
  const size = Math.min(available, Math.max(0, requested));
  if (alignment === 'center') return [crossStart + Math.round((available - size) / 2), size];
  if (alignment === 'end') return [crossStart + available - size, size];
  return [crossStart, size];
}

function distribution(
  available: number,
  occupied: number,
  count: number,
  requestedGap: number,
  justify: UiContentDistribution,
): readonly [number, number] {
  const remaining = Math.max(0, available - occupied - Math.max(0, count - 1) * requestedGap);
  if (justify === 'center') return [remaining / 2, requestedGap];
  if (justify === 'end') return [remaining, requestedGap];
  if (justify === 'space_between' && count > 1) return [0, requestedGap + remaining / (count - 1)];
  if (justify === 'space_around' && count > 0) {
    const unit = remaining / count;
    return [unit / 2, requestedGap + unit];
  }
  if (justify === 'space_evenly' && count > 0) {
    const unit = remaining / (count + 1);
    return [unit, requestedGap + unit];
  }
  return [0, requestedGap];
}

function layoutFlexLine(
  bounds: UiRect,
  items: readonly UiFlexItem[],
  direction: UiFlexDirection,
  gap: number,
  align: UiItemAlignment,
  justify: UiContentDistribution,
): UiRect[] {
  if (items.length === 0) return [];
  const availableMain = direction === 'row' ? bounds.width : bounds.height;
  const availableCross = direction === 'row' ? bounds.height : bounds.width;
  const minimums = items.map((item) => axisSize(item.minSize, direction));
  const sizes = items.map((item, index) => Math.max(minimums[index] ?? 0, item.basis ?? minimums[index] ?? 0));
  const requestedGaps = Math.max(0, items.length - 1) * gap;
  const initialOccupied = sizes.reduce((sum, size) => sum + size, 0);
  const free = availableMain - initialOccupied - requestedGaps;
  if (free > 0) {
    const shares = weightedShares(free, items.map((item) => item.grow ?? 0));
    sizes.forEach((_size, index) => { sizes[index] = (sizes[index] ?? 0) + (shares[index] ?? 0); });
  } else if (free < 0) {
    let deficit = -free;
    const capacities = sizes.map((size, index) => Math.max(0, size - (minimums[index] ?? 0)));
    const weights = capacities.map((capacity, index) => capacity * Math.max(0, items[index]?.shrink ?? 1));
    const shares = weightedShares(Math.min(deficit, capacities.reduce((sum, value) => sum + value, 0)), weights);
    sizes.forEach((_size, index) => {
      const reduction = Math.min(capacities[index] ?? 0, shares[index] ?? 0, deficit);
      sizes[index] = (sizes[index] ?? 0) - reduction;
      deficit -= reduction;
    });
  }
  const occupied = sizes.reduce((sum, size) => sum + size, 0);
  const [offset, actualGap] = distribution(availableMain, occupied, items.length, gap, justify);
  let cursor = (direction === 'row' ? bounds.x : bounds.y) + offset;
  return items.map((item, index) => {
    const main = sizes[index] ?? 0;
    const [cross, itemCross] = alignedCrossRect(
      direction === 'row' ? bounds.y : bounds.x,
      availableCross,
      crossSize(item.minSize, direction),
      item.alignSelf ?? align,
    );
    const rect = direction === 'row'
      ? { x: Math.round(cursor), y: Math.round(cross), width: Math.round(main), height: Math.round(itemCross) }
      : { x: Math.round(cross), y: Math.round(cursor), width: Math.round(itemCross), height: Math.round(main) };
    cursor += main + actualGap;
    return rect;
  });
}

/**
 * Canvas equivalent of the CSS flex formatting context. The algorithm stays
 * deterministic and pixel-snapped so retained hit bounds match painted art.
 */
export function layoutUiFlex(
  bounds: UiRect,
  items: readonly UiFlexItem[],
  options: UiFlexOptions = {},
): UiRect[] {
  const direction = options.direction ?? 'row';
  const gap = Math.max(0, options.gap ?? 0);
  const inner = insetRect(bounds, normalizedPadding(options.padding));
  if (!options.wrap || items.length < 2) {
    return layoutFlexLine(inner, items, direction, gap, options.align ?? 'stretch', options.justify ?? 'start');
  }

  const availableMain = direction === 'row' ? inner.width : inner.height;
  const lines: { readonly indexes: number[]; readonly cross: number }[] = [];
  let indexes: number[] = [];
  let occupied = 0;
  let lineCross = 0;
  items.forEach((item, index) => {
    const main = Math.max(axisSize(item.minSize, direction), item.basis ?? 0);
    const next = indexes.length === 0 ? main : occupied + gap + main;
    if (indexes.length > 0 && next > availableMain) {
      lines.push({ indexes, cross: lineCross });
      indexes = [];
      occupied = 0;
      lineCross = 0;
    }
    occupied = indexes.length === 0 ? main : occupied + gap + main;
    lineCross = Math.max(lineCross, crossSize(item.minSize, direction));
    indexes.push(index);
  });
  if (indexes.length > 0) lines.push({ indexes, cross: lineCross });

  const result: UiRect[] = items.map(() => ({ x: inner.x, y: inner.y, width: 0, height: 0 }));
  let crossCursor = direction === 'row' ? inner.y : inner.x;
  for (const line of lines) {
    const lineBounds = direction === 'row'
      ? { x: inner.x, y: crossCursor, width: inner.width, height: line.cross }
      : { x: crossCursor, y: inner.y, width: line.cross, height: inner.height };
    const lineItems = line.indexes.map((index) => items[index]!);
    const lineRects = layoutFlexLine(
      lineBounds,
      lineItems,
      direction,
      gap,
      options.align ?? 'stretch',
      options.justify ?? 'start',
    );
    line.indexes.forEach((itemIndex, lineIndex) => { result[itemIndex] = lineRects[lineIndex]!; });
    crossCursor += line.cross + gap;
  }
  return result;
}

function gridItemRect(
  cell: UiRect,
  requested: UiSize,
  justify: UiItemAlignment,
  align: UiItemAlignment,
): UiRect {
  const [x, width] = alignedCrossRect(cell.x, cell.width, requested.width, justify);
  const [y, height] = alignedCrossRect(cell.y, cell.height, requested.height, align);
  return { x, y, width, height };
}

/** Responsive equal-track grid with CSS-grid-like item alignment. */
export function layoutUiGrid(
  bounds: UiRect,
  itemSizes: readonly UiSize[],
  options: UiGridOptions = {},
): UiGridLayout {
  const inner = insetRect(bounds, normalizedPadding(options.padding));
  const columnGap = Math.max(0, options.columnGap ?? 0);
  const rowGap = Math.max(0, options.rowGap ?? columnGap);
  const minColumnWidth = Math.max(1, options.minColumnWidth ?? 1);
  const automaticColumns = Math.max(1, Math.floor((inner.width + columnGap) / (minColumnWidth + columnGap)));
  const requestedColumns = options.columns === undefined || options.columns === 'auto'
    ? automaticColumns
    : Math.max(1, Math.floor(options.columns));
  const columns = Math.max(1, Math.min(itemSizes.length || 1, options.maxColumns ?? Number.POSITIVE_INFINITY, requestedColumns));
  const rows = Math.max(1, Math.ceil(itemSizes.length / columns));
  const availableTrackWidth = Math.max(0, inner.width - columnGap * (columns - 1));
  const baseColumnWidth = Math.floor(availableTrackWidth / columns);
  const extraColumns = Math.round(availableTrackWidth - baseColumnWidth * columns);
  const naturalRowHeight = itemSizes.length === 0 ? 0 : Math.max(...itemSizes.map((size) => size.height));
  const rowHeight = Math.max(0, options.rowHeight ?? naturalRowHeight);
  const cells: UiRect[] = [];
  const items: UiRect[] = [];
  let y = inner.y;
  for (let row = 0; row < rows; row += 1) {
    let x = inner.x;
    for (let column = 0; column < columns; column += 1) {
      const width = baseColumnWidth + (column < extraColumns ? 1 : 0);
      const cell = { x, y, width, height: rowHeight };
      cells.push(cell);
      const index = row * columns + column;
      const requested = itemSizes[index];
      if (requested !== undefined) {
        items.push(gridItemRect(
          cell,
          requested,
          options.justifyItems ?? 'stretch',
          options.alignItems ?? 'stretch',
        ));
      }
      x += width + columnGap;
    }
    y += rowHeight + rowGap;
  }
  return { columns, rows, cells, items };
}

/** Named container variant used by frame compositions instead of viewport media queries. */
export function uiContainerVariant(
  width: number,
  breakpoints: UiContainerBreakpoints = DEFAULT_UI_CONTAINER_BREAKPOINTS,
): UiContainerVariant {
  if (width >= breakpoints.wide) return 'wide';
  if (width >= breakpoints.regular) return 'regular';
  return 'compact';
}

