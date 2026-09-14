import { ui, uiFixed, UiRoot, scrollUiElement, UI_QUEST_TRACKER_METRICS, uiQuestTrackerHeight, uiQuestTrackerEntryHeight, type UiKitArt, type UiElement, type UiQuestTrackerEntry } from './kit/index.js';
import { containsPoint, type UiPoint, type UiRect } from './geometry.js';
const TRACKER_WIDTH = UI_QUEST_TRACKER_METRICS.width;
const HEADER_HEIGHT = UI_QUEST_TRACKER_METRICS.header;
const COLLAPSED_STORAGE_KEY = 'orchard:quest-tracker:collapsed';
const POSITION_STORAGE_KEY = 'orchard:quest-tracker:position';
const DRAG_THRESHOLD = 4;
export type QuestTrackerEntry = UiQuestTrackerEntry;
export interface QuestTrackerModel {
  readonly width: number; readonly height?: number; readonly anchorRect?: UiRect;
  readonly entries: readonly QuestTrackerEntry[];
}
export interface QuestTrackerPosition { readonly right: number; readonly y: number }
type LegacyQuestTrackerPosition = UiPoint;
export function questTrackerBounds(model: QuestTrackerModel, collapsed: boolean, position: QuestTrackerPosition | UiPoint | null = null): UiRect {
  const width = Math.min(TRACKER_WIDTH, Math.max(0, model.width - 8));
  const height = Math.min(uiQuestTrackerHeight(model.entries, collapsed), model.height === undefined ? Infinity : Math.max(HEADER_HEIGHT, model.height - 8));
  const defaultX = model.anchorRect === undefined ? model.width - width - 8 : model.anchorRect.x + model.anchorRect.width - width;
  const defaultY = model.anchorRect === undefined ? 34 : model.anchorRect.y + model.anchorRect.height + 4;
  const requested = position === null ? { x: defaultX, y: defaultY } : 'right' in position ? { x: model.width - width - position.right, y: position.y } : position;
  return { x: Math.round(Math.max(4, Math.min(Math.max(4, model.width - width - 4), requested.x))),
    y: Math.round(Math.max(4, Math.min(model.height === undefined ? requested.y : Math.max(4, model.height - height - 4), requested.y))), width, height };
}
export function questTrackerEntryRects(model: QuestTrackerModel, bounds: UiRect): readonly { readonly questId: string; readonly rect: UiRect }[] {
  let y = bounds.y + HEADER_HEIGHT + UI_QUEST_TRACKER_METRICS.gap;
  return model.entries.map(entry => {
    const rect = { x: bounds.x + 2, y, width: Math.max(0, bounds.width - 4), height: uiQuestTrackerEntryHeight(entry) };
    y += rect.height + UI_QUEST_TRACKER_METRICS.gap; return { questId: entry.id, rect };
  });
}
/** Position/session adapter. All painting and entry hit testing belong to the kit. */
export class QuestTracker {
  private model: QuestTrackerModel = { width: 320, entries: [] };
  private collapsed = typeof localStorage !== 'undefined' && localStorage.getItem(COLLAPSED_STORAGE_KEY) === 'true';
  private position: QuestTrackerPosition | LegacyQuestTrackerPosition | null = this.loadPosition();
  private pointer: UiPoint = { x: -100, y: -100 };
  private headerDrag: { readonly start: UiPoint; readonly position: UiPoint; moved: boolean } | null = null;
  private readonly root: UiRoot;
  private readonly ownsRoot: boolean;
  private entryPointerActive = false;
  private tree: UiElement | null = null;
  private treeKey = '';
  constructor(art: UiKitArt, private readonly openQuest: (questId: string) => void = () => {}, root?: UiRoot) { this.ownsRoot = root === undefined; this.root = root ?? new UiRoot({ art, scale: 1 }); }
  update(model: QuestTrackerModel): void {
    this.model = model;
    if (this.position !== null) {
      const migrated = !('right' in this.position);
      const relative = 'right' in this.position ? this.position : this.positionFromPoint(this.position);
      const bounds = questTrackerBounds(model, this.collapsed, relative);
      this.position = { right: Math.max(4, relative.right), y: bounds.y };
      if (migrated) this.savePosition();
    }
    this.sync();
  }
  get currentBounds(): UiRect { return questTrackerBounds(this.model, this.collapsed, this.position !== null && 'right' in this.position ? this.position : null); }
  private sync(): void {
    const bounds = this.currentBounds;
    this.root.resize(this.model.width, this.model.height ?? Math.max(270, bounds.y + bounds.height));
    const key = JSON.stringify([this.collapsed, this.model.entries]);
    if (key !== this.treeKey) {
      this.treeKey = key;
      const focus = this.root.focus.current?.id, source = this.root.focus.inputSource;
      const scroll = this.root.entries().find(({ element }) => this.tree && element.isDescendantOf(this.tree) && element.kind === 'scroll-area')?.element.scroll.y ?? 0;
      this.tree?.dispose();
      this.tree = this.root.mount(ui.questTracker({ entries: this.model.entries, collapsed: this.collapsed,
        onToggle: () => this.toggle(), onOpenQuest: this.openQuest, layout: { position: 'absolute' } }));
      this.place(bounds); this.root.arrange();
      const scroller = this.root.entries().find(({ element }) => element.isDescendantOf(this.tree!) && element.kind === 'scroll-area')?.element;
      if (scroller) scrollUiElement(scroller, 0, scroll);
      if (focus) this.root.focus.set(this.root.entries().find(entry => entry.element.id === focus)?.element ?? null, source);
    } else this.place(bounds);
    this.root.arrange();
  }
  private place(rect: UiRect): void { this.tree?.setStyle({ visible: this.model.entries.length > 0, inset: { left: uiFixed(rect.x), top: uiFixed(rect.y) }, width: uiFixed(rect.width), height: uiFixed(rect.height) }); }
  private toggle(): void {
    this.collapsed = !this.collapsed;
    if (typeof localStorage !== 'undefined') localStorage.setItem(COLLAPSED_STORAGE_KEY, String(this.collapsed));
    this.sync();
  }
  private headerAt(point: UiPoint): boolean {
    return this.root.entries().some(({ element }) => element.id === 'quest-tracker.header' && containsPoint(element.rect, point) && containsPoint(element.clip, point));
  }
  pointerMove(point: UiPoint): boolean {
    this.pointer = point;
    if (!this.model.entries.length) return false;
    if (this.headerDrag) {
      const dx = point.x - this.headerDrag.start.x, dy = point.y - this.headerDrag.start.y;
      this.headerDrag.moved ||= dx * dx + dy * dy >= DRAG_THRESHOLD * DRAG_THRESHOLD;
      if (this.headerDrag.moved) {
        this.position = this.positionFromBounds(questTrackerBounds(this.model, this.collapsed,
          this.positionFromPoint({ x: this.headerDrag.position.x + dx, y: this.headerDrag.position.y + dy })));
        this.sync();
      }
      return true;
    }
    return this.root.pointer({ type: 'move', point, button: 0, pointerId: 1 });
  }
  pointerDown(point: UiPoint, button: number): boolean {
    if (button !== 0 || !this.model.entries.length) return false;
    this.sync();
    if (this.headerAt(point)) { const bounds = this.currentBounds; this.headerDrag = { start: point, position: { x: bounds.x, y: bounds.y }, moved: false }; return true; }
    if (!this.tree || !this.root.input.hits(point).some(node => node.isDescendantOf(this.tree!))) return false;
    this.entryPointerActive = this.root.pointer({ type: 'down', point, button, pointerId: 1 });
    return this.entryPointerActive;
  }
  pointerUp(point: UiPoint = this.pointer): boolean {
    if (this.headerDrag) { const moved = this.headerDrag.moved; this.headerDrag = null; if (moved) this.savePosition(); else this.toggle(); return true; }
    if (!this.entryPointerActive) return false;
    this.entryPointerActive = false;
    return this.root.pointer({ type: 'up', point, button: 0, pointerId: 1 });
  }
  pointerCancel(): void { this.headerDrag = null; this.entryPointerActive = false; this.root.pointer({ type: 'cancel', point: this.pointer, button: 0, pointerId: 1 }); this.pointerLeave(); }
  pointerLeave(): void { this.pointer = { x: -100, y: -100 }; this.root.input.clearHover(); }
  wheel(point: UiPoint, deltaY: number): boolean { return this.root.wheel({ point, deltaX: 0, deltaY }); }
  handleKeyDown(key: string, shiftKey = false): boolean { return this.root.key({ key, shiftKey }); }
  draw(context: CanvasRenderingContext2D): void { if (this.ownsRoot && this.model.entries.length) this.root.drawInContext(context); }
  dispose(): void { if (this.ownsRoot) this.root.dispose(); else this.tree?.dispose(); }
  private loadPosition(): QuestTrackerPosition | LegacyQuestTrackerPosition | null {
    if (typeof localStorage === 'undefined') return null;
    try {
      const value = JSON.parse(localStorage.getItem(POSITION_STORAGE_KEY) ?? 'null') as unknown;
      if (typeof value !== 'object' || value === null) return null;
      const point = value as { readonly right?: unknown; readonly x?: unknown; readonly y?: unknown };
      if (typeof point.y !== 'number' || !Number.isFinite(point.y)) return null;
      if (typeof point.right === 'number' && Number.isFinite(point.right)) {
        return { right: point.right, y: point.y };
      }
      return typeof point.x === 'number' && Number.isFinite(point.x)
        ? { x: point.x, y: point.y }
        : null;
    } catch {
      return null;
    }
  }

  private savePosition(): void {
    if (this.position === null || !('right' in this.position) || typeof localStorage === 'undefined') return;
    localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(this.position));
  }

  private positionFromPoint(point: UiPoint): QuestTrackerPosition {
    return {
      right: this.model.width - TRACKER_WIDTH - point.x,
      y: point.y,
    };
  }

  private positionFromBounds(bounds: UiRect): QuestTrackerPosition {
    return {
      right: Math.max(4, this.model.width - bounds.x - bounds.width),
      y: bounds.y,
    };
  }

}
