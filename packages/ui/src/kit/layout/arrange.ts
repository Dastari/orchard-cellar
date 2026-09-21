import { insetRect, type UiRect } from '../../geometry.js';
import type { UiElement } from '../runtime/element.js';
import { uiIntersectRect, uiPaddingInsets, uiSameRect, uiSnapRect, uiBoundSize } from './box.js';
import { uiLayoutAbsolute } from './absolute.js';
import { uiLayoutFlex } from './flex.js';
import { uiLayoutGrid } from './grid.js';
import { measureUiElement } from './measure.js';
export interface UiArrangeStats { measured: number; arranged: number; visited: number }
export function arrangeUiElement(node: UiElement, bounds: UiRect, ancestorClip: UiRect, viewport: UiRect,
  stats: UiArrangeStats = { measured: 0, arranged: 0, visited: 0 }): UiArrangeStats {
  stats.visited++;
  const changed = !uiSameRect(node.rect, bounds) || !uiSameRect(node.clip, uiIntersectRect(bounds, ancestorClip));
  if (!changed && !node.layoutDirty && !node.descendantsDirty) return stats;
  if (node.measureDirty) { measureUiElement(node, bounds); stats.measured++; }
  const arrangeChildren = changed || node.layoutDirty;
  if (arrangeChildren) {
    stats.arranged++;
    node.rect = uiSnapRect(bounds);
    node.clip = uiIntersectRect(node.rect, ancestorClip);
    node.contentRect = insetRect(node.rect, uiPaddingInsets(node.style.padding));
    node.hooks.onArrange?.(node);
    // Run the hook first: it may populate a previously empty node. A leaf
    // needs its own geometry but has no flex/grid allocation or child clips.
    if (!node.children.length) {
      node.scroll.x = 0; node.scroll.y = 0;
      node.scroll.maxX = 0; node.scroll.maxY = 0;
      node.layoutDirty = false; node.descendantsDirty = false;
      return stats;
    }
    const children = node.children.filter(child => child.visible && (child.style.position ?? 'relative') === 'relative');
    for (const child of children) if (child.measureDirty || child.measureWidth !== node.contentRect.width) {
      measureUiElement(child, node.contentRect); stats.measured++;
    }
    let boxes: UiRect[];
    if (node.style.display === 'grid') boxes = uiLayoutGrid(node.contentRect, children, node.style);
    else if (node.style.display === 'stack') boxes = children.map(child => ({ x: node.contentRect.x, y: node.contentRect.y,
      ...uiBoundSize(child.style, child.measured.preferred, node.contentRect) }));
    else boxes = uiLayoutFlex(node.contentRect, children, node.style);
    // Resolve wrapping against the allocated column width, not the parent's
    // unconstrained width. Intrinsic text/grid height can change after flexing.
    if (node.style.display === 'grid' || node.style.display !== 'stack' && node.style.direction !== 'column') {
      let heightChanged = false;
      for (let i = 0; i < children.length; i++) {
        const child = children[i]!, box = boxes[i]!;
        if (child.measureWidth === box.width) continue;
        const height = child.measured.preferred.height;
        measureUiElement(child, { width: box.width, height: node.contentRect.height }); stats.measured++;
        heightChanged ||= height !== child.measured.preferred.height;
      }
      if (heightChanged) boxes = node.style.display === 'grid' ? uiLayoutGrid(node.contentRect, children, node.style)
        : uiLayoutFlex(node.contentRect, children, node.style);
    }
    const maxX = Math.max(0, ...boxes.map(box => box.x + box.width - node.contentRect.x - node.contentRect.width));
    const maxY = Math.max(0, ...boxes.map(box => box.y + box.height - node.contentRect.y - node.contentRect.height));
    node.scroll.maxX = maxX; node.scroll.maxY = maxY;
    node.scroll.x = Math.min(maxX, node.scroll.x); node.scroll.y = Math.min(maxY, node.scroll.y);
    const childClip = uiIntersectRect(node.clip, node.contentRect);
    for (let i = 0; i < children.length; i++) {
      const child = children[i]!, box = boxes[i]!;
      const portal = child.style.zLayer !== undefined && child.style.zLayer !== 'base';
      arrangeUiElement(child, { ...box, x: box.x - node.scroll.x, y: box.y - node.scroll.y }, portal ? viewport : childClip, viewport, stats);
    }
    for (const child of node.children) if (child.visible && child.style.position && child.style.position !== 'relative') {
      child.hooks.onPlace?.(child, viewport);
      measureUiElement(child, child.style.position === 'fixed' ? viewport : node.contentRect);
      const portal = child.style.zLayer !== undefined && child.style.zLayer !== 'base';
      arrangeUiElement(child, uiLayoutAbsolute(child, node.contentRect, viewport), portal ? viewport : childClip, viewport, stats);
    }
  } else for (const child of node.children) if (child.visible && (child.layoutDirty || child.descendantsDirty)) {
    const portal = child.style.zLayer !== undefined && child.style.zLayer !== 'base';
    arrangeUiElement(child, child.rect, portal ? viewport : uiIntersectRect(node.clip, node.contentRect), viewport, stats);
  }
  node.layoutDirty = false; node.descendantsDirty = false;
  return stats;
}
