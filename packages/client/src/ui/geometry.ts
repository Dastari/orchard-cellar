export interface UiPoint { readonly x: number; readonly y: number }
export interface UiSize { readonly width: number; readonly height: number }
export interface UiRect extends UiPoint, UiSize {}
export interface UiInsets { readonly left: number; readonly top: number; readonly right: number; readonly bottom: number }

export interface UiConstraints {
  readonly minWidth?: number;
  readonly minHeight?: number;
  readonly maxWidth?: number;
  readonly maxHeight?: number;
}

export function clampSize(size: UiSize, constraints: UiConstraints = {}): UiSize {
  const minWidth = Math.max(0, constraints.minWidth ?? 0);
  const minHeight = Math.max(0, constraints.minHeight ?? 0);
  const maxWidth = Math.max(minWidth, constraints.maxWidth ?? Number.POSITIVE_INFINITY);
  const maxHeight = Math.max(minHeight, constraints.maxHeight ?? Number.POSITIVE_INFINITY);
  return {
    width: Math.min(maxWidth, Math.max(minWidth, Math.floor(size.width))),
    height: Math.min(maxHeight, Math.max(minHeight, Math.floor(size.height))),
  };
}

export function insetRect(rect: UiRect, insets: Partial<UiInsets>): UiRect {
  const left = Math.max(0, insets.left ?? 0);
  const top = Math.max(0, insets.top ?? 0);
  const right = Math.max(0, insets.right ?? 0);
  const bottom = Math.max(0, insets.bottom ?? 0);
  return {
    x: rect.x + left,
    y: rect.y + top,
    width: Math.max(0, rect.width - left - right),
    height: Math.max(0, rect.height - top - bottom),
  };
}

export function containsPoint(rect: UiRect, point: UiPoint): boolean {
  return point.x >= rect.x && point.y >= rect.y && point.x < rect.x + rect.width && point.y < rect.y + rect.height;
}
