import { layoutUiAnchoredRect } from '../../design-system/layout.js';
import type { UiRect } from '../../geometry.js';
import type { UiElement } from '../runtime/element.js';
import { uiBoundSize, uiInsetValue } from './box.js';
export function uiLayoutAbsolute(node: UiElement, parent: UiRect, viewport: UiRect): UiRect {
  const bounds = node.style.position === 'fixed' ? viewport : parent;
  const offsets = node.style.inset;
  const inset = { left: uiInsetValue(offsets?.left), top: uiInsetValue(offsets?.top), right: uiInsetValue(offsets?.right), bottom: uiInsetValue(offsets?.bottom) };
  const size = { ...uiBoundSize(node.style, node.measured.preferred, bounds) };
  if (node.style.width === undefined && inset.left !== undefined && inset.right !== undefined) size.width = Math.max(0, bounds.width - inset.left - inset.right);
  if (node.style.height === undefined && inset.top !== undefined && inset.bottom !== undefined) size.height = Math.max(0, bounds.height - inset.top - inset.bottom);
  if (node.style.anchor) return layoutUiAnchoredRect(bounds, size, {
    targetAnchor: node.style.anchor.target, selfAnchor: node.style.anchor.self,
    offset: { x: inset.left ?? 0, y: inset.top ?? 0 }, ...(node.style.anchor.constrain === false ? {} : { constrainTo: viewport }),
  });
  return { x: bounds.x + (inset.left ?? (inset.right === undefined ? 0 : bounds.width - inset.right - size.width)),
    y: bounds.y + (inset.top ?? (inset.bottom === undefined ? 0 : bounds.height - inset.bottom - size.height)), ...size };
}
