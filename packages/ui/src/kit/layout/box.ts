import type { UiRect, UiSize } from '../../geometry.js';
import type { UiAnchorPoint, UiContentDistribution, UiItemAlignment } from '../../design-system/layout.js';
import { UI_SPACES, type UiLayer, type UiSpace } from '../tokens.js';

export interface UiFixedDimension { readonly mode: 'fixed'; readonly size: number }
/** Explicit signed position, unlike a nonnegative layout size. */
export function uiOffset(size: number): UiFixedDimension {
  if (!Number.isFinite(size)) throw new Error('UI offsets must be finite');
  return { mode: 'fixed', size };
}
export type UiInset = UiSpace | UiFixedDimension;
export type UiDimension = 'fit' | 'grow' | UiFixedDimension
  | { readonly mode: 'percent'; readonly fraction: number };
export type UiPadding = UiSpace | Partial<Record<'left' | 'top' | 'right' | 'bottom', UiSpace>>;
export interface UiStyle {
  readonly position?: 'relative' | 'absolute' | 'fixed';
  readonly inset?: Partial<Record<'left' | 'top' | 'right' | 'bottom', UiInset>>;
  readonly anchor?: { readonly target: UiAnchorPoint; readonly self?: UiAnchorPoint; readonly constrain?: boolean };
  readonly width?: UiDimension; readonly height?: UiDimension;
  readonly minWidth?: UiDimension; readonly maxWidth?: UiDimension;
  readonly minHeight?: UiDimension; readonly maxHeight?: UiDimension;
  readonly padding?: UiPadding; readonly gap?: UiSpace;
  readonly overflow?: 'clip' | 'scroll' | 'scroll-x' | 'scroll-y';
  readonly display?: 'flex' | 'grid' | 'stack' | 'none';
  readonly direction?: 'row' | 'column'; readonly wrap?: boolean;
  readonly justify?: UiContentDistribution; readonly align?: UiItemAlignment;
  readonly alignSelf?: UiItemAlignment; readonly grow?: number; readonly shrink?: number;
  readonly basis?: UiDimension;
  readonly columns?: number | 'auto'; readonly rows?: number;
  readonly columnWidth?: UiFixedDimension; readonly minColumnWidth?: UiDimension; readonly rowHeight?: UiDimension;
  readonly columnGap?: UiSpace; readonly rowGap?: UiSpace;
  readonly areas?: readonly (readonly string[])[]; readonly area?: string;
  readonly zLayer?: UiLayer; readonly visible?: boolean;
}
export interface UiMeasurement { readonly min: UiSize; readonly preferred: UiSize }
export const UI_EMPTY_RECT: UiRect = Object.freeze({ x: 0, y: 0, width: 0, height: 0 });
export function uiFixed(size: number): UiFixedDimension {
  if (!Number.isFinite(size) || size < 0) throw new Error('Fixed UI sizes must be finite and nonnegative');
  return { mode: 'fixed', size };
}
export function uiResolveDimension(dimension: UiDimension | undefined, available: number, natural: number): number {
  if (dimension === 'grow') return available;
  if (dimension === undefined || dimension === 'fit') return natural;
  return dimension.mode === 'fixed' ? dimension.size : available * dimension.fraction;
}
export function uiBoundSize(style: UiStyle, natural: UiSize, available: UiSize): UiSize {
  const axis = (name: 'Width' | 'Height', value: number, space: number): number => Math.max(0,
    Math.min(uiResolveDimension(style[`max${name}`], space, Infinity),
      Math.max(uiResolveDimension(style[`min${name}`], space, 0), value)));
  return { width: axis('Width', uiResolveDimension(style.width, available.width, natural.width), available.width),
    height: axis('Height', uiResolveDimension(style.height, available.height, natural.height), available.height) };
}
/** Logical pixel edges are resolved once; painters and input reuse this object. */
export function uiSnapRect(rect: UiRect): UiRect {
  if ([rect.x, rect.y, rect.width, rect.height].every(Number.isInteger)) return rect;
  const x = Math.round(rect.x), y = Math.round(rect.y);
  return { x, y, width: Math.max(0, Math.round(rect.x + rect.width) - x), height: Math.max(0, Math.round(rect.y + rect.height) - y) };
}
export function uiIntersectRect(a: UiRect, b: UiRect): UiRect {
  const x = Math.max(a.x, b.x), y = Math.max(a.y, b.y);
  return { x, y, width: Math.max(0, Math.min(a.x + a.width, b.x + b.width) - x),
    height: Math.max(0, Math.min(a.y + a.height, b.y + b.height) - y) };
}
export function uiPaddingInsets(padding: UiPadding = 0) {
  return typeof padding === 'number' ? { left: padding, top: padding, right: padding, bottom: padding }
    : { left: padding.left ?? 0, top: padding.top ?? 0, right: padding.right ?? 0, bottom: padding.bottom ?? 0 };
}
export function uiSameRect(a: UiRect, b: UiRect): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}
export function uiIsFixed(dimension: UiDimension | undefined): boolean {
  return typeof dimension === 'object' && dimension.mode === 'fixed';
}

/** Validate JavaScript callers as well as the token-only TypeScript contract. */
export function validateUiStyle(style: UiStyle): UiStyle {
  if (style.overflow && !['clip', 'scroll', 'scroll-x', 'scroll-y'].includes(style.overflow)) throw new Error('Unknown UI overflow policy');
  const spacing = [style.gap, style.columnGap, style.rowGap, ...Object.values(uiPaddingInsets(style.padding))];
  if (spacing.some(value => value !== undefined && !UI_SPACES.includes(value))) throw new Error('UI spacing must use tokens');
  for (const dimension of [style.width, style.height, style.minWidth, style.maxWidth, style.minHeight, style.maxHeight, style.basis, style.columnWidth, style.minColumnWidth, style.rowHeight]) {
    if (dimension === undefined || dimension === 'fit' || dimension === 'grow') continue;
    if (typeof dimension !== 'object') throw new Error('UI dimensions require explicit fixed or percent sizing');
    const value = dimension.mode === 'fixed' ? dimension.size : dimension.fraction;
    if (!Number.isFinite(value) || value < 0 || (dimension.mode === 'percent' && value > 1)) throw new Error('Invalid UI dimension');
  }
  for (const inset of Object.values(style.inset ?? {})) {
    if (typeof inset === 'number' ? !UI_SPACES.includes(inset) : !Number.isFinite(inset.size)) throw new Error('UI insets require tokens or explicit fixed offsets');
  }
  return Object.freeze({ ...style });
}

export function uiInsetValue(value: UiInset | undefined): number | undefined {
  return typeof value === 'object' ? value.size : value;
}
