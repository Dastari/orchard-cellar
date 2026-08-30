import { clampSize, type UiConstraints, type UiRect, type UiSize } from './geometry.js';
import { layoutUiAnchoredRect, layoutUiFlex } from './design-system/layout.js';

export interface LinearChild {
  readonly minSize: UiSize;
  readonly flex?: number;
}

export type CrossAlign = 'start' | 'center' | 'end' | 'stretch';
export type Anchor = 'top_left' | 'top' | 'top_right' | 'left' | 'center' | 'right' | 'bottom_left' | 'bottom' | 'bottom_right';

/** @deprecated Prefer layoutUiFlex. Kept as a compatibility adapter. */
export function layoutRow(bounds: UiRect, children: readonly LinearChild[], gap = 0, align: CrossAlign = 'start'): UiRect[] {
  return layoutUiFlex(bounds, children.map((child) => ({
    minSize: child.minSize,
    grow: child.flex,
  })), { direction: 'row', gap, align });
}

/** @deprecated Prefer layoutUiFlex. Kept as a compatibility adapter. */
export function layoutColumn(bounds: UiRect, children: readonly LinearChild[], gap = 0, align: CrossAlign = 'start'): UiRect[] {
  return layoutUiFlex(bounds, children.map((child) => ({
    minSize: child.minSize,
    grow: child.flex,
  })), { direction: 'column', gap, align });
}

/** @deprecated Prefer layoutUiAnchoredRect. Kept as a compatibility adapter. */
export function anchoredRect(parent: UiRect, requested: UiSize, anchor: Anchor, constraints: UiConstraints = {}): UiRect {
  const size = clampSize(requested, { ...constraints, maxWidth: Math.min(parent.width, constraints.maxWidth ?? parent.width), maxHeight: Math.min(parent.height, constraints.maxHeight ?? parent.height) });
  return layoutUiAnchoredRect(parent, size, { targetAnchor: anchor, selfAnchor: anchor });
}
