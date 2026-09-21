import type { UiSize } from '../../geometry.js';
import type { UiElement } from '../runtime/element.js';
import { uiBoundSize, uiPaddingInsets, type UiMeasurement } from './box.js';
import { uiLayoutFlex } from './flex.js';

/** Intrinsic measure is cached by available size and explicit invalidation. */
export function measureUiElement(node: UiElement, available: UiSize): UiMeasurement {
  if (!node.measureDirty && node.measureWidth === available.width && node.measureHeight === available.height) return node.measured;
  node.measureWidth = available.width; node.measureHeight = available.height; node.measureDirty = false;
  if (!node.visible) return node.measured = { min: { width: 0, height: 0 }, preferred: { width: 0, height: 0 } };
  const p = uiPaddingInsets(node.style.padding);
  const horizontal = p.left + p.right, vertical = p.top + p.bottom;
  // Ordinary leaves have no intrinsic content to aggregate. Avoid building
  // empty child arrays and running container measurement for every slot/icon.
  if (!node.children.length && !node.hooks.measure) {
    const min = { width: horizontal, height: vertical };
    return node.measured = { min, preferred: uiBoundSize(node.style, min, available) };
  }
  const constrained = uiBoundSize(node.style, available, available);
  const inner = { width: Math.max(0, constrained.width - horizontal), height: Math.max(0, constrained.height - vertical) };
  const intrinsic = node.hooks.measure?.(node, inner);
  const children = node.children.filter(child => child.visible && (child.style.position ?? 'relative') === 'relative');
  let sizes = children.map(child => measureUiElement(child, inner));
  // A growing column's preferred width is the available width, but its flex
  // basis decides which line it occupies. Use the same allocator as arrange,
  // then measure text and nested rows at their actual allocated widths.
  let wrappedPreferred: UiSize | undefined;
  if (node.style.display === 'flex' && node.style.direction !== 'column' && node.style.wrap && children.length) {
    const bounds = { x: 0, y: 0, ...inner };
    const boxes = uiLayoutFlex(bounds, children, node.style);
    sizes = children.map((child, index) => measureUiElement(child, { width: boxes[index]!.width, height: inner.height }));
    const resolved = uiLayoutFlex(bounds, children, node.style);
    wrappedPreferred = { width: Math.max(0, ...resolved.map(box => box.x + box.width)),
      height: Math.max(0, ...resolved.map(box => box.y + box.height)) };
  }
  const aggregate = (field: 'min' | 'preferred'): UiSize => {
    if (field === 'preferred' && wrappedPreferred) return wrappedPreferred;
    const items = sizes.map(s => s[field]);
    const maxW = Math.max(0, ...items.map(s => s.width)), maxH = Math.max(0, ...items.map(s => s.height));
    const gap = node.style.gap ?? 0;
    if (node.style.display === 'stack' || !items.length) return { width: maxW, height: maxH };
    if (node.style.display === 'grid') {
      const columns = node.style.areas?.[0]?.length ?? (typeof node.style.columns === 'number' ? node.style.columns
        : Math.max(1, Math.floor((inner.width + gap) / Math.max(1, maxW + gap))));
      const rows = node.style.areas?.length ?? Math.ceil(items.length / columns);
      return { width: columns * maxW + Math.max(0, columns - 1) * (node.style.columnGap ?? gap),
        height: rows * maxH + Math.max(0, rows - 1) * (node.style.rowGap ?? gap) };
    }
    if (node.style.direction === 'column') return { width: maxW, height: items.reduce((sum, s) => sum + s.height, 0) + Math.max(0, items.length - 1) * gap };
    if (node.style.wrap) {
      let width = 0, height = 0, lineW = 0, lineH = 0;
      for (const size of items) {
        if (lineW && lineW + gap + size.width > inner.width) { width = Math.max(width, lineW); height += lineH + gap; lineW = 0; lineH = 0; }
        lineW += (lineW ? gap : 0) + size.width; lineH = Math.max(lineH, size.height);
      }
      return { width: Math.max(width, lineW), height: height + lineH };
    }
    return { width: items.reduce((sum, s) => sum + s.width, 0) + Math.max(0, items.length - 1) * gap, height: maxH };
  };
  const min = aggregate('min'), preferred = aggregate('preferred');
  node.measured = {
    min: { width: Math.max(min.width, intrinsic?.min.width ?? 0) + horizontal, height: Math.max(min.height, intrinsic?.min.height ?? 0) + vertical },
    preferred: uiBoundSize(node.style, { width: Math.max(preferred.width, intrinsic?.preferred.width ?? 0) + horizontal,
      height: Math.max(preferred.height, intrinsic?.preferred.height ?? 0) + vertical }, available),
  };
  return node.measured;
}
