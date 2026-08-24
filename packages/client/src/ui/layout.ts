import { clampSize, type UiConstraints, type UiRect, type UiSize } from './geometry.js';

export interface LinearChild {
  readonly minSize: UiSize;
  readonly flex?: number;
}

export type CrossAlign = 'start' | 'center' | 'end' | 'stretch';
export type Anchor = 'top_left' | 'top' | 'top_right' | 'left' | 'center' | 'right' | 'bottom_left' | 'bottom' | 'bottom_right';

function distribute(total: number, children: readonly LinearChild[], axis: 'width' | 'height', gap: number): number[] {
  const minimum = children.reduce((sum, child) => sum + child.minSize[axis], 0) + Math.max(0, children.length - 1) * gap;
  const extra = Math.max(0, total - minimum);
  const flexTotal = children.reduce((sum, child) => sum + Math.max(0, child.flex ?? 0), 0);
  let allocated = 0;
  return children.map((child, index) => {
    if (!flexTotal || !child.flex) return child.minSize[axis];
    const share = index === children.length - 1
      ? extra - allocated
      : Math.floor(extra * child.flex / flexTotal);
    allocated += share;
    return child.minSize[axis] + share;
  });
}

function crossPosition(start: number, available: number, requested: number, align: CrossAlign): readonly [number, number] {
  if (align === 'stretch') return [start, available];
  const size = Math.min(available, requested);
  if (align === 'center') return [start + Math.floor((available - size) / 2), size];
  if (align === 'end') return [start + available - size, size];
  return [start, size];
}

export function layoutRow(bounds: UiRect, children: readonly LinearChild[], gap = 0, align: CrossAlign = 'start'): UiRect[] {
  const widths = distribute(bounds.width, children, 'width', gap);
  let x = bounds.x;
  return children.map((child, index) => {
    const [y, height] = crossPosition(bounds.y, bounds.height, child.minSize.height, align);
    const rect = { x, y, width: widths[index] ?? 0, height };
    x += rect.width + gap;
    return rect;
  });
}

export function layoutColumn(bounds: UiRect, children: readonly LinearChild[], gap = 0, align: CrossAlign = 'start'): UiRect[] {
  const heights = distribute(bounds.height, children, 'height', gap);
  let y = bounds.y;
  return children.map((child, index) => {
    const [x, width] = crossPosition(bounds.x, bounds.width, child.minSize.width, align);
    const rect = { x, y, width, height: heights[index] ?? 0 };
    y += rect.height + gap;
    return rect;
  });
}

export function anchoredRect(parent: UiRect, requested: UiSize, anchor: Anchor, constraints: UiConstraints = {}): UiRect {
  const size = clampSize(requested, { ...constraints, maxWidth: Math.min(parent.width, constraints.maxWidth ?? parent.width), maxHeight: Math.min(parent.height, constraints.maxHeight ?? parent.height) });
  const horizontal = anchor.endsWith('left') || anchor === 'left' ? 0 : anchor.endsWith('right') || anchor === 'right' ? parent.width - size.width : Math.floor((parent.width - size.width) / 2);
  const vertical = anchor.startsWith('top') || anchor === 'top' ? 0 : anchor.startsWith('bottom') || anchor === 'bottom' ? parent.height - size.height : Math.floor((parent.height - size.height) / 2);
  return { x: parent.x + horizontal, y: parent.y + vertical, ...size };
}
