import { insetRect, type UiInsets, type UiPoint, type UiRect, type UiSize } from '../geometry.js';

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
export type UiAnchorPoint =
  | 'top_left'
  | 'top'
  | 'top_right'
  | 'left'
  | 'center'
  | 'right'
  | 'bottom_left'
  | 'bottom'
  | 'bottom_right';

/** Explicit sizing contracts inspired by Clay's fit/grow/fixed/percent axes. */
export type UiAxisSizing =
  | {
    readonly mode: 'fit';
    readonly preferred?: number;
    readonly min?: number;
    readonly max?: number;
  }
  | {
    readonly mode: 'grow';
    readonly preferred?: number;
    readonly min?: number;
    readonly max?: number;
    readonly weight?: number;
  }
  | {
    readonly mode: 'fixed';
    readonly size: number;
  }
  | {
    readonly mode: 'percent';
    /** Fraction of the parent's usable axis after padding and requested gaps. */
    readonly fraction: number;
    readonly min?: number;
    readonly max?: number;
  };

export interface UiFlexItem {
  readonly minSize: UiSize;
  /** Main-axis sizing. Omit to use the legacy basis/grow/shrink contract. */
  readonly main?: UiAxisSizing;
  /** Cross-axis sizing. Omit to use minSize plus the container alignment. */
  readonly cross?: UiAxisSizing;
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

export interface UiAnchoredRectOptions {
  readonly targetAnchor?: UiAnchorPoint;
  readonly selfAnchor?: UiAnchorPoint;
  readonly offset?: Partial<UiPoint>;
  /** Optional safe rectangle. The result is shifted inside it without resizing. */
  readonly constrainTo?: UiRect;
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

function safeAxisValue(value: number | undefined, fallback: number): number {
  if (value === undefined || Number.isNaN(value)) return fallback;
  const safe = Math.max(0, value);
  return Number.isFinite(safe) ? Math.round(safe) : safe;
}

function sizingBounds(
  sizing: UiAxisSizing,
  fallbackMinimum: number,
): readonly [number, number] {
  if (sizing.mode === 'fixed') {
    const size = safeAxisValue(sizing.size, 0);
    return [size, size];
  }
  const minimum = safeAxisValue(sizing.min, fallbackMinimum);
  return [minimum, Math.max(minimum, safeAxisValue(sizing.max, Number.POSITIVE_INFINITY))];
}

function clampAxis(value: number, minimum: number, maximum: number): number {
  const candidate = Number.isNaN(value) ? minimum : value;
  const clamped = Math.min(maximum, Math.max(minimum, Math.max(0, candidate)));
  return Number.isFinite(clamped) ? Math.round(clamped) : clamped;
}

interface ResolvedFlexAxis {
  readonly base: number;
  readonly minimum: number;
  readonly maximum: number;
  readonly grow: number;
  readonly shrink: number;
}

function resolveMainAxis(
  item: UiFlexItem,
  direction: UiFlexDirection,
  usableMain: number,
): ResolvedFlexAxis {
  const intrinsicMinimum = safeAxisValue(axisSize(item.minSize, direction), 0);
  const sizing = item.main;
  if (sizing === undefined) {
    return {
      base: safeAxisValue(Math.max(intrinsicMinimum, item.basis ?? intrinsicMinimum), intrinsicMinimum),
      minimum: intrinsicMinimum,
      maximum: Number.POSITIVE_INFINITY,
      grow: Math.max(0, item.grow ?? 0),
      shrink: Math.max(0, item.shrink ?? 1),
    };
  }
  const [minimum, maximum] = sizingBounds(sizing, intrinsicMinimum);
  if (sizing.mode === 'fixed') {
    return { base: minimum, minimum, maximum, grow: 0, shrink: 0 };
  }
  const preferred = sizing.mode === 'percent'
    ? Math.max(0, Math.min(1, sizing.fraction)) * usableMain
    : sizing.preferred ?? item.basis ?? intrinsicMinimum;
  return {
    base: clampAxis(preferred, minimum, maximum),
    minimum,
    maximum,
    grow: sizing.mode === 'grow' ? Math.max(0, sizing.weight ?? item.grow ?? 1) : 0,
    shrink: Math.max(0, item.shrink ?? 1),
  };
}

function resolveCrossAxis(
  item: UiFlexItem,
  direction: UiFlexDirection,
  available: number,
): ResolvedFlexAxis | null {
  const sizing = item.cross;
  if (sizing === undefined) return null;
  const intrinsicMinimum = safeAxisValue(crossSize(item.minSize, direction), 0);
  const [minimum, maximum] = sizingBounds(sizing, intrinsicMinimum);
  if (sizing.mode === 'fixed') {
    return { base: minimum, minimum, maximum, grow: 0, shrink: 0 };
  }
  const preferred = sizing.mode === 'percent'
    ? Math.max(0, Math.min(1, sizing.fraction)) * available
    : sizing.mode === 'grow'
      ? available
      : sizing.preferred ?? intrinsicMinimum;
  return {
    base: clampAxis(preferred, minimum, maximum),
    minimum,
    maximum,
    grow: 0,
    shrink: Math.max(0, item.shrink ?? 1),
  };
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

function growIntoAvailable(sizes: number[], axes: readonly ResolvedFlexAxis[], available: number): void {
  let remaining = Math.max(0, Math.round(available));
  while (remaining > 0) {
    const indexes = axes
      .map((axis, index) => ({ axis, index }))
      .filter(({ axis, index }) => axis.grow > 0 && (sizes[index] ?? 0) < axis.maximum);
    if (indexes.length === 0) return;
    const shares = weightedShares(remaining, indexes.map(({ axis }) => axis.grow));
    let allocated = 0;
    indexes.forEach(({ axis, index }, shareIndex) => {
      const increase = Math.min(
        Math.max(0, axis.maximum - (sizes[index] ?? 0)),
        shares[shareIndex] ?? 0,
      );
      sizes[index] = (sizes[index] ?? 0) + increase;
      allocated += increase;
    });
    if (allocated <= 0) return;
    remaining -= allocated;
  }
}

function shrinkIntoAvailable(sizes: number[], axes: readonly ResolvedFlexAxis[], deficit: number): void {
  let remaining = Math.max(0, Math.round(deficit));
  while (remaining > 0) {
    const indexes = axes
      .map((axis, index) => ({ axis, index, capacity: Math.max(0, (sizes[index] ?? 0) - axis.minimum) }))
      .filter(({ axis, capacity }) => axis.shrink > 0 && capacity > 0);
    if (indexes.length === 0) return;
    const shares = weightedShares(
      Math.min(remaining, indexes.reduce((sum, entry) => sum + entry.capacity, 0)),
      indexes.map(({ axis, capacity }) => axis.shrink * capacity),
    );
    let allocated = 0;
    indexes.forEach(({ index, capacity }, shareIndex) => {
      const reduction = Math.min(capacity, shares[shareIndex] ?? 0);
      sizes[index] = (sizes[index] ?? 0) - reduction;
      allocated += reduction;
    });
    if (allocated <= 0) return;
    remaining -= allocated;
  }
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

function sizedCrossRect(
  crossStart: number,
  available: number,
  requested: ResolvedFlexAxis | null,
  fallback: number,
  alignment: UiItemAlignment,
): readonly [number, number] {
  if (requested === null) return alignedCrossRect(crossStart, available, fallback, alignment);
  const size = alignment === 'stretch'
    ? clampAxis(available, requested.minimum, requested.maximum)
    : clampAxis(requested.base, requested.minimum, Math.min(requested.maximum, available));
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
  const requestedGaps = Math.max(0, items.length - 1) * gap;
  const usableMain = Math.max(0, availableMain - requestedGaps);
  const axes = items.map((item) => resolveMainAxis(item, direction, usableMain));
  const sizes = axes.map((axis) => axis.base);
  const initialOccupied = sizes.reduce((sum, size) => sum + size, 0);
  const free = availableMain - initialOccupied - requestedGaps;
  if (free > 0) growIntoAvailable(sizes, axes, free);
  else if (free < 0) shrinkIntoAvailable(sizes, axes, -free);
  const occupied = sizes.reduce((sum, size) => sum + size, 0);
  const [offset, actualGap] = distribution(availableMain, occupied, items.length, gap, justify);
  let cursor = (direction === 'row' ? bounds.x : bounds.y) + offset;
  return items.map((item, index) => {
    const main = sizes[index] ?? 0;
    const [cross, itemCross] = sizedCrossRect(
      direction === 'row' ? bounds.y : bounds.x,
      availableCross,
      resolveCrossAxis(item, direction, availableCross),
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
    const main = resolveMainAxis(item, direction, availableMain).base;
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

function anchorFractions(anchor: UiAnchorPoint): readonly [number, number] {
  const horizontal = anchor.endsWith('_left') || anchor === 'left'
    ? 0
    : anchor.endsWith('_right') || anchor === 'right'
      ? 1
      : 0.5;
  const vertical = anchor.startsWith('top') || anchor === 'top'
    ? 0
    : anchor.startsWith('bottom') || anchor === 'bottom'
      ? 1
      : 0.5;
  return [horizontal, vertical];
}

/**
 * Attaches one point on a floating rectangle to one point on its target.
 * Useful for close controls, ribbons, bookmarks, tooltips, and popovers whose
 * authored pixels must not be distorted by their parent's size.
 */
export function layoutUiAnchoredRect(
  target: UiRect,
  size: UiSize,
  options: UiAnchoredRectOptions = {},
): UiRect {
  const safeSize = {
    width: Math.round(Math.max(0, size.width)),
    height: Math.round(Math.max(0, size.height)),
  };
  const [targetX, targetY] = anchorFractions(options.targetAnchor ?? 'top_left');
  const [selfX, selfY] = anchorFractions(options.selfAnchor ?? 'top_left');
  const offsetX = options.offset?.x ?? 0;
  const offsetY = options.offset?.y ?? 0;
  let x = Math.round(target.x + target.width * targetX - safeSize.width * selfX + offsetX);
  let y = Math.round(target.y + target.height * targetY - safeSize.height * selfY + offsetY);
  if (options.constrainTo !== undefined) {
    const maximumX = options.constrainTo.x + Math.max(0, options.constrainTo.width - safeSize.width);
    const maximumY = options.constrainTo.y + Math.max(0, options.constrainTo.height - safeSize.height);
    x = Math.max(options.constrainTo.x, Math.min(maximumX, x));
    y = Math.max(options.constrainTo.y, Math.min(maximumY, y));
  }
  return { x, y, ...safeSize };
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
