import type { UiRect } from '../../geometry.js';
import type { UiElement } from '../runtime/element.js';
export function scrollUiElement(node: UiElement, x: number, y: number): boolean {
  const mode = node.style.overflow ?? 'clip';
  const nextX = mode === 'scroll' || mode === 'scroll-x' ? Math.round(Math.max(0, Math.min(node.scroll.maxX, x))) : 0;
  const nextY = mode === 'scroll' || mode === 'scroll-y' ? Math.round(Math.max(0, Math.min(node.scroll.maxY, y))) : 0;
  if (nextX === node.scroll.x && nextY === node.scroll.y) return false;
  node.scroll.x = nextX; node.scroll.y = nextY; node.layoutDirty = true;
  for (let parent = node.parent; parent; parent = parent.parent) parent.descendantsDirty = true;
  node.hooks.onScroll?.(node); node.invalidateRoot?.(false); return true;
}
export function uiScrollThumb(node: UiElement, axis: 'x' | 'y'): { track: UiRect; thumb: UiRect } | null {
  const mode = node.style.overflow ?? 'clip';
  if (mode === 'clip' || (axis === 'y' && mode === 'scroll-x') || (axis === 'x' && mode === 'scroll-y')) return null;
  const vertical = axis === 'y', maximum = vertical ? node.scroll.maxY : node.scroll.maxX;
  if (maximum <= 0) return null;
  const r = node.contentRect, length = vertical ? r.height : r.width;
  const extent = Math.min(length, Math.max(8, Math.floor(length * length / (length + maximum))));
  const offset = Math.round((length - extent) * (vertical ? node.scroll.y : node.scroll.x) / maximum);
  const track = vertical ? { x: node.rect.x + node.rect.width - 4, y: r.y, width: 4, height: r.height }
    : { x: r.x, y: node.rect.y + node.rect.height - 4, width: r.width, height: 4 };
  const thumb = vertical ? { ...track, y: track.y + offset, height: extent } : { ...track, x: track.x + offset, width: extent };
  return { track, thumb };
}
