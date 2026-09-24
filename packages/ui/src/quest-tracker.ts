import type { UiPoint, UiRect } from './geometry.js';
import type { UiKitArt } from './kit/components/art.js';
import { uiFixed } from './kit/layout/box.js';
import { UiRoot } from './kit/runtime/root.js';
import { uiQuestTracker, uiQuestTrackerHeight, UI_QUEST_TRACKER_METRICS,
  type UiQuestTrackerElement, type UiQuestTrackerEntry } from './kit/components/quest-tracker.js';

const COLLAPSED_STORAGE_KEY = 'orchard:quest-tracker:collapsed';
const POSITION_STORAGE_KEY = 'orchard:quest-tracker:position';
export type QuestTrackerEntry = UiQuestTrackerEntry;
export interface QuestTrackerModel {
  readonly width: number;
  readonly height?: number;
  /** HUD element the tracker should sit beneath until the player moves it. */
  readonly anchorRect?: UiRect;
  /** Temporary space used only until the player explicitly moves the tracker. */
  readonly layoutRegion?: UiRect;
  readonly visible?: boolean;
  readonly entries: readonly QuestTrackerEntry[];
}
export interface QuestTrackerPosition {
  /** Distance from the tracker's right edge to the viewport's right edge. */
  readonly right: number;
  readonly y: number;
}
type QuestTrackerStorage = Pick<Storage, 'getItem' | 'setItem'>;
function availableStorage(): QuestTrackerStorage | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}

export function questTrackerBounds(
  model: QuestTrackerModel,
  collapsed: boolean,
  position: QuestTrackerPosition | UiPoint | null = null,
): UiRect {
  const region = position === null ? model.layoutRegion : undefined;
  const width = Math.max(0, Math.min(UI_QUEST_TRACKER_METRICS.width, model.width - 8, region?.width ?? Infinity));
  const height = Math.min(uiQuestTrackerHeight(model.entries, collapsed), Math.max(0, (model.height ?? 270) - 8), region?.height ?? Infinity);
  const defaultX = model.anchorRect === undefined
    ? model.width - width - 8 : model.anchorRect.x + model.anchorRect.width - width;
  const defaultY = model.anchorRect === undefined ? 34 : model.anchorRect.y + model.anchorRect.height + 4;
  const requested = position === null ? { x: region?.x ?? defaultX, y: region?.y ?? defaultY }
    : 'right' in position ? { x: model.width - width - position.right, y: position.y } : position;
  return {
    x: Math.max(4, Math.min(Math.max(4, model.width - width - 4), requested.x)),
    y: Math.max(4, Math.min(Math.max(4, (model.height ?? 270) - height - 4), requested.y)),
    width, height,
  };
}

/** Retained HUD adapter. Pinning stays server-owned; only collapse and a
 * right-anchored position are local preferences. The client dispatches to root. */
export class QuestTracker {
  readonly root: UiRoot;
  private readonly tracker: UiQuestTrackerElement;
  private model: QuestTrackerModel = { width: 320, height: 270, entries: [] };
  private collapsed: boolean;
  private position: QuestTrackerPosition | UiPoint | null;
  private contentKey = '';
  private layoutKey = '';
  private headerDrag: { readonly start: UiPoint; readonly position: UiPoint } | null = null;

  constructor(
    art: UiKitArt,
    private readonly openQuest: (questId: string) => void,
    private readonly storage: QuestTrackerStorage | null = availableStorage(),
  ) {
    this.collapsed = this.readStorage(COLLAPSED_STORAGE_KEY) === 'true';
    this.position = this.loadPosition();
    this.root = new UiRoot({ art, scale: 1, label: 'Tracked quests' });
    this.tracker = uiQuestTracker({ entries: [], collapsed: this.collapsed,
      layout: { position: 'absolute', visible: false },
      onToggle: () => {
        this.collapsed = !this.collapsed;
        this.writeStorage(COLLAPSED_STORAGE_KEY, String(this.collapsed));
        this.refresh();
      },
      onOpenQuest: id => { if (this.model.entries.some(entry => entry.id === id)) this.openQuest(id); },
      drag: {
        onMove: (point, active) => this.moveHeader(point, active),
        onDrop: point => { this.moveHeader(point, true); this.savePosition(); },
        onEnd: () => { this.headerDrag = null; },
      },
    });
    this.root.mount(this.tracker);
  }

  get isActive(): boolean { return !this.root.disposed && this.model.visible !== false && this.model.entries.length > 0; }
  get currentBounds(): UiRect { return questTrackerBounds(this.model, this.collapsed, this.position); }

  update(model: QuestTrackerModel): void {
    if (this.root.disposed) return;
    this.model = model;
    this.root.resize(model.width, model.height ?? 270, 1);
    if (this.position !== null) {
      const migrated = !('right' in this.position);
      const relative = 'right' in this.position ? this.position : this.positionFromPoint(this.position);
      // Temporary viewport clamping must preserve both requested coordinates.
      this.position = { right: Math.max(4, relative.right), y: relative.y };
      if (migrated) this.savePosition();
    }
    this.refresh();
  }

  draw(context: CanvasRenderingContext2D, now = performance.now()): void {
    if (this.isActive) this.root.drawInContext(context, now);
  }

  dispose(): void { this.headerDrag = null; this.root.dispose(); }

  private refresh(): void {
    const key = JSON.stringify([this.collapsed, this.model.entries, this.isActive]);
    if (key !== this.contentKey) {
      this.contentKey = key;
      this.tracker.updateQuestTracker(this.model.entries, this.collapsed);
      this.tracker.setStyle({ visible: this.isActive });
      this.layoutKey = '';
    }
    if (!this.isActive) { this.root.input.cancelPointers(); this.root.focus.set(null); this.headerDrag = null; }
    this.place();
  }

  private place(): void {
    const bounds = this.currentBounds, key = JSON.stringify(bounds);
    if (this.layoutKey === key) return;
    this.layoutKey = key;
    this.tracker.setStyle({ width: uiFixed(bounds.width), height: uiFixed(bounds.height),
      inset: { left: uiFixed(bounds.x), top: uiFixed(bounds.y) } });
  }

  private moveHeader(point: UiPoint, active: boolean): void {
    if (this.headerDrag === null) {
      const bounds = this.currentBounds;
      this.headerDrag = { start: point, position: { x: bounds.x, y: bounds.y } };
    }
    if (!active) return;
    const bounds = questTrackerBounds(this.model, this.collapsed, this.positionFromPoint({
      x: this.headerDrag.position.x + point.x - this.headerDrag.start.x,
      y: this.headerDrag.position.y + point.y - this.headerDrag.start.y,
    }));
    this.position = this.positionFromPoint(bounds);
    this.place();
  }

  private readStorage(key: string): string | null {
    try { return this.storage?.getItem(key) ?? null; } catch { return null; }
  }
  private writeStorage(key: string, value: string): void {
    try { this.storage?.setItem(key, value); } catch { /* Preferences may be unavailable in private browsing. */ }
  }
  private loadPosition(): QuestTrackerPosition | UiPoint | null {
    try {
      const value: unknown = JSON.parse(this.readStorage(POSITION_STORAGE_KEY) ?? 'null');
      if (typeof value !== 'object' || value === null || !('y' in value)
        || typeof value.y !== 'number' || !Number.isFinite(value.y)) return null;
      if ('right' in value && typeof value.right === 'number' && Number.isFinite(value.right)) {
        return { right: value.right, y: value.y };
      }
      return 'x' in value && typeof value.x === 'number' && Number.isFinite(value.x)
        ? { x: value.x, y: value.y } : null;
    } catch { return null; }
  }
  private savePosition(): void {
    if (this.position !== null && 'right' in this.position) this.writeStorage(POSITION_STORAGE_KEY, JSON.stringify(this.position));
  }
  private positionFromPoint(point: UiPoint): QuestTrackerPosition {
    return { right: Math.max(4, this.model.width - Math.max(0, Math.min(UI_QUEST_TRACKER_METRICS.width, this.model.width - 8)) - point.x), y: point.y };
  }
}
