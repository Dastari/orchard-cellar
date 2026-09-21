import { containsPoint, type UiPoint } from '../../geometry.js';
import { scrollUiElement, uiScrollThumb } from '../layout/scroll.js';
import { uiElementEnabled, type UiElement, type UiElementKey, type UiElementPointer, type UiElementWheel } from './element.js';
import type { UiFocus } from './focus.js';
import { uiTopModal, type UiPaintEntry } from './layers.js';
export type UiRootPointer = Omit<UiElementPointer, 'capture' | 'release'>;
export class UiInput {
  hovered: UiElement | null = null;
  private captured = new Map<number, UiElement>();
  private thumbDrag: { pointer: number; node: UiElement; axis: 'x' | 'y'; start: number; offset: number; travel: number } | null = null;
  constructor(private readonly entries: () => readonly UiPaintEntry[], readonly focus: UiFocus,
    private readonly invalidate: () => void) {}
  private allowed(node: UiElement): boolean {
    const entries = this.entries(), modal = uiTopModal(entries);
    return uiElementEnabled(node) && entries.some(entry => entry.element === node) && (!modal || node.isDescendantOf(modal));
  }
  hits(point: UiPoint): UiElement[] {
    const entries = this.entries(), modal = uiTopModal(entries), result: UiElement[] = [];
    for (let i = entries.length - 1; i >= 0; i--) {
      const node = entries[i]!.element;
      if (!uiElementEnabled(node) || (modal && !node.isDescendantOf(modal))) continue;
      if (containsPoint(node.rect, point) && containsPoint(node.clip, point)) result.push(node);
    }
    return result;
  }
  pointer(event: UiRootPointer): boolean {
    for (const { element } of this.entries()) element.hooks.onPointerObserved?.(event, element);
    let capture = this.captured.get(event.pointerId);
    if (capture && (event.type === 'down' || !this.allowed(capture))) {
      this.captured.delete(event.pointerId);
      if (this.thumbDrag?.pointer === event.pointerId) this.thumbDrag = null;
      capture.hooks.onPointer?.({ ...event, type: 'cancel', capture() {}, release() {} }, capture);
      capture = undefined;
    }
    if (event.type === 'down') for (const { element } of this.entries()) if (element.hooks.onOutsidePointer && this.allowed(element) && !containsPoint(element.rect, event.point)) element.hooks.onOutsidePointer(element, event.point);
    const hits = this.hits(event.point);
    if (event.type === 'down' && event.button === 2) for (const node of hits) if (node.hooks.onContextMenu?.({ ...event, capture() {}, release() {} }, node)) return true;
    if (event.type === 'move') this.setHover(hits[0] ?? null);
    if (event.type === 'down') {
      this.focus.set(hits.find(node => node.focusable) ?? null, 'pointer');
      for (const node of hits) for (const axis of ['y', 'x'] as const) {
        const geometry = uiScrollThumb(node, axis);
        if (geometry && containsPoint(geometry.track, event.point)) {
          const vertical = axis === 'y', point = vertical ? event.point.y : event.point.x;
          const start = vertical ? geometry.thumb.y : geometry.thumb.x;
          const length = vertical ? geometry.thumb.height : geometry.thumb.width;
          if (point >= start && point < start + length) {
            this.thumbDrag = { pointer: event.pointerId, node, axis, start: point,
              offset: vertical ? node.scroll.y : node.scroll.x,
              travel: (vertical ? geometry.track.height : geometry.track.width) - length };
            this.captured.set(event.pointerId, node);
          } else scrollUiElement(node, node.scroll.x + (vertical ? 0 : Math.sign(point - start) * node.contentRect.width),
            node.scroll.y + (vertical ? Math.sign(point - start) * node.contentRect.height : 0));
          return true;
        }
      }
    }
    if (this.thumbDrag?.pointer === event.pointerId) {
      const drag = this.thumbDrag;
      const delta = (drag.axis === 'y' ? event.point.y : event.point.x) - drag.start;
      const max = drag.axis === 'y' ? drag.node.scroll.maxY : drag.node.scroll.maxX;
      const offset = drag.offset + delta * max / Math.max(1, drag.travel);
      scrollUiElement(drag.node, drag.axis === 'x' ? offset : drag.node.scroll.x, drag.axis === 'y' ? offset : drag.node.scroll.y);
      if (event.type === 'up' || event.type === 'cancel') { this.thumbDrag = null; this.captured.delete(event.pointerId); }
      return true;
    }
    let handled = false;
    for (const node of capture ? [capture] : hits) {
      handled = node.hooks.onPointer?.({ ...event, capture: () => { this.captured.set(event.pointerId, node); },
        release: () => { this.captured.delete(event.pointerId); } }, node) ?? false;
      if (handled || node.pointerMode === 'capture') { handled = true; break; }
    }
    if (event.type === 'up' || event.type === 'cancel') this.captured.delete(event.pointerId);
    return handled || uiTopModal(this.entries()) !== null;
  }
  wheel(event: UiElementWheel): boolean {
    for (const node of this.hits(event.point)) {
      if (node.hooks.onWheel?.(event, node)) return true;
      if (scrollUiElement(node, node.scroll.x + event.deltaX, node.scroll.y + event.deltaY)) return true;
    }
    return uiTopModal(this.entries()) !== null;
  }
  key(event: UiElementKey): boolean {
    this.focus.update(this.entries());
    const current = this.focus.current;
    const ancestors: UiElement[] = []; for (let node = current; node; node = node.parent) ancestors.push(node);
    for (const node of ancestors.toReversed()) if (node.hooks.onKeyCapture?.(event, node)) return true;
    if (event.key === 'Tab') { this.focus.tab(event.shiftKey); return true; }
    for (const node of ancestors) if (node.hooks.onKey?.(event, node)) return true;
    if (event.key === 'Escape') {
      const entries = this.entries();
      for (let i = entries.length - 1; i >= 0; i--) {
        const node = entries[i]!.element;
        if (this.allowed(node) && node.hooks.onDismiss) { node.hooks.onDismiss(node); return true; }
      }
    }
    if (['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft', 'Home', 'End'].includes(event.key)
      && this.focus.move(event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? -1 : 1,
        event.key === 'Home' ? 'first' : event.key === 'End' ? 'last' : undefined)) return true;
    for (let node = current; node; node = node.parent) {
      const delta = event.key === 'PageDown' ? node.contentRect.height : event.key === 'PageUp' ? -node.contentRect.height
        : event.key === 'ArrowDown' ? 16 : event.key === 'ArrowUp' ? -16 : 0;
      if (delta && scrollUiElement(node, node.scroll.x, node.scroll.y + delta)) return true;
    }
    return uiTopModal(this.entries()) !== null;
  }
  text(text: string): boolean { const node = this.focus.current; return node && this.allowed(node) ? node.hooks.onText?.(text, node) ?? false : false; }
  private setHover(next: UiElement | null): void {
    if (next === this.hovered) return;
    const previous = this.hovered; this.hovered = next;
    for (let node = previous; node; node = node.parent) if (!next?.isDescendantOf(node)) node.hooks.onHover?.(false, node);
    for (let node = next; node; node = node.parent) if (!previous?.isDescendantOf(node)) node.hooks.onHover?.(true, node);
    this.invalidate();
  }
  clearHover(): void { this.setHover(null); }
  dispose(): void { this.captured.clear(); this.thumbDrag = null; this.clearHover(); }
}
