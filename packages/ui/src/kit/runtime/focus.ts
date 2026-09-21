import { scrollUiElement } from '../layout/scroll.js';
import { uiElementEnabled, type UiElement } from './element.js';
import { uiTopModal, type UiPaintEntry } from './layers.js';
export class UiFocus {
  current: UiElement | null = null;
  private source: 'keyboard' | 'pointer' = 'keyboard';
  private candidates: UiElement[] = [];
  private modal: UiElement | null = null;
  private saved = new Map<UiElement, UiElement | null>();
  constructor(private readonly invalidate: () => void) {}
  get inputSource(): 'keyboard' | 'pointer' { return this.source; }
  update(entries: readonly UiPaintEntry[]): void {
    const modal = uiTopModal(entries);
    const all = entries.filter(entry => entry.element.focusable && uiElementEnabled(entry.element))
      .toSorted((a, b) => a.order - b.order).map(entry => entry.element);
    this.candidates = all.filter(node => !modal || node.isDescendantOf(modal));
    if (modal !== this.modal) {
      if (modal && !this.saved.has(modal)) this.saved.set(modal, this.current);
      if (this.modal && !entries.some(entry => entry.element === this.modal)) {
        const restore = this.saved.get(this.modal) ?? null;
        this.saved.delete(this.modal); this.set(restore);
      }
      this.modal = modal;
    }
    if (this.current && !this.candidates.includes(this.current)) this.set(null);
    if (modal && !this.current) this.set(this.candidates[0] ?? null);
    const requested = this.candidates.find(node => node.props['focusRequested']);
    if (requested) { requested.setProps({ focusRequested: false }, false); this.set(requested); }
  }
  set(node: UiElement | null, source: 'keyboard' | 'pointer' = 'keyboard'): boolean {
    if (node && (!this.candidates.includes(node) || node.disabled)) return false;
    const sourceChanged = this.source !== source;
    if (this.current === node && !sourceChanged) return false;
    const previous = this.current; this.current = node; this.source = source;
    for (let old = previous; old; old = old.parent) if (!node?.isDescendantOf(old)) old.hooks.onFocus?.(false, old);
    for (let next = node; next; next = next.parent) if (sourceChanged || !previous?.isDescendantOf(next)) next.hooks.onFocus?.(true, next, source);
    let rect = node?.rect;
    if (node && rect) for (let parent = node.parent; parent; parent = parent.parent) {
      const bounds = parent.contentRect;
      const dx = rect.x < bounds.x ? rect.x - bounds.x : Math.max(0, rect.x + rect.width - bounds.x - bounds.width);
      const dy = rect.y < bounds.y ? rect.y - bounds.y : Math.max(0, rect.y + rect.height - bounds.y - bounds.height);
      const previousX = parent.scroll.x, previousY = parent.scroll.y;
      scrollUiElement(parent, previousX + dx, previousY + dy);
      // Ancestors must see the target after inner scrolling, before the next
      // arrange updates its stored rect, or nested scroll areas overshoot it.
      rect = { ...rect, x: rect.x - (parent.scroll.x - previousX), y: rect.y - (parent.scroll.y - previousY) };
    }
    this.invalidate(); return true;
  }
  tab(backward = false): boolean {
    if (!this.candidates.length) return false;
    const index = this.current ? this.candidates.indexOf(this.current) : (backward ? 0 : -1);
    return this.set(this.candidates[(index + (backward ? -1 : 1) + this.candidates.length) % this.candidates.length]!);
  }
  move(direction: -1 | 1, edge?: 'first' | 'last'): boolean {
    const group = this.current?.focusGroup;
    if (!group) return false;
    const candidates = this.candidates.filter(node => node.focusGroup === group);
    const index = edge === 'first' ? 0 : edge === 'last' ? candidates.length - 1
      : (candidates.indexOf(this.current!) + direction + candidates.length) % candidates.length;
    return this.set(candidates[index] ?? null);
  }
  dispose(): void { this.set(null); this.candidates = []; this.saved.clear(); this.modal = null; }
}
