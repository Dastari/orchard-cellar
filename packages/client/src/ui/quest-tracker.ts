import type { LoadedAsset } from '../render/assets.js';
import { drawOutlinedPixelText, measurePixelText, type PixelUi } from '../render/pixel-ui.js';
import type { UiPoint, UiRect } from './geometry.js';
import { containsPoint } from './geometry.js';
import { drawUiSkinNatural } from './skin.js';

const TRACKER_WIDTH = 170;
const HEADER_HEIGHT = 12;
const LINE_HEIGHT = 9;
const CONTENT_PADDING = 2;
const HEADER_TEXT_X_OFFSET = 15;
const COLLAPSED_STORAGE_KEY = 'orchard:quest-tracker:collapsed';
const POSITION_STORAGE_KEY = 'orchard:quest-tracker:position';
const DRAG_THRESHOLD = 4;

export interface QuestTrackerEntry {
  readonly id: string;
  readonly title: string;
  readonly complete: boolean;
  readonly objectives: readonly string[];
}

export interface QuestTrackerModel {
  readonly width: number;
  readonly height?: number;
  /** HUD element the tracker should sit beneath until the player moves it. */
  readonly anchorRect?: UiRect;
  readonly entries: readonly QuestTrackerEntry[];
}

export interface QuestTrackerPosition {
  /** Distance from the tracker's right edge to the viewport's right edge. */
  readonly right: number;
  readonly y: number;
}

type LegacyQuestTrackerPosition = UiPoint;

export function questTrackerBounds(
  model: QuestTrackerModel,
  collapsed: boolean,
  position: QuestTrackerPosition | UiPoint | null = null,
): UiRect {
  const lineCount = collapsed ? 0 : model.entries.reduce(
    (count, entry) => count + 1 + Math.max(1, entry.objectives.length),
    0,
  );
  const height = HEADER_HEIGHT + (collapsed ? 0 : Math.max(12, lineCount * LINE_HEIGHT + 3));
  const defaultX = model.anchorRect === undefined
    ? model.width - TRACKER_WIDTH - 8
    : model.anchorRect.x + model.anchorRect.width - TRACKER_WIDTH;
  const defaultY = model.anchorRect === undefined
    ? 34
    : model.anchorRect.y + model.anchorRect.height + 4;
  const requested = position === null
    ? { x: defaultX, y: defaultY }
    : 'right' in position
      ? { x: model.width - TRACKER_WIDTH - position.right, y: position.y }
      : position;
  const maximumX = Math.max(4, model.width - TRACKER_WIDTH - 4);
  const maximumY = model.height === undefined
    ? requested.y
    : Math.max(4, model.height - height - 4);
  return {
    x: Math.max(4, Math.min(maximumX, requested.x)),
    y: Math.max(4, Math.min(maximumY, requested.y)),
    width: TRACKER_WIDTH,
    height,
  };
}

export function questTrackerEntryRects(
  model: QuestTrackerModel,
  bounds: UiRect,
): readonly { readonly questId: string; readonly rect: UiRect }[] {
  let y = bounds.y + HEADER_HEIGHT + 3;
  return model.entries.map((entry) => {
    const lines = 1 + Math.max(1, entry.objectives.length);
    const rect = {
      x: bounds.x + CONTENT_PADDING,
      y: y - 2,
      width: bounds.width - CONTENT_PADDING * 2,
      height: lines * LINE_HEIGHT + 2,
    };
    y += lines * LINE_HEIGHT;
    return { questId: entry.id, rect };
  });
}

/** A deliberately small, WoW-style pinned objective list. Collapse state is
 * presentation-only; pinning individual quests remains server-owned. */
export class QuestTracker {
  private model: QuestTrackerModel = { width: 320, entries: [] };
  private collapsed = typeof localStorage !== 'undefined'
    && localStorage.getItem(COLLAPSED_STORAGE_KEY) === 'true';
  private position: QuestTrackerPosition | LegacyQuestTrackerPosition | null = this.loadPosition();
  private pointer: UiPoint = { x: -100, y: -100 };
  private headerDrag: {
    readonly start: UiPoint;
    readonly position: UiPoint;
    moved: boolean;
  } | null = null;
  private pressedQuestId: string | null = null;

  constructor(
    private readonly fonts: PixelUi,
    private readonly chevron: LoadedAsset,
    private readonly openQuest: (questId: string) => void = () => undefined,
  ) {}

  update(model: QuestTrackerModel): void {
    this.model = model;
    if (this.position !== null) {
      let relativePosition: QuestTrackerPosition;
      let migrated = false;
      if ('right' in this.position) relativePosition = this.position;
      else {
        relativePosition = this.positionFromPoint(this.position);
        migrated = true;
      }
      const bounds = questTrackerBounds(model, this.collapsed, relativePosition);
      // Preserve the requested right offset even if a temporarily narrow
      // viewport has to clamp the tracker against its left edge.
      this.position = { right: Math.max(4, relativePosition.right), y: bounds.y };
      if (migrated) this.savePosition();
    }
  }

  get currentBounds(): UiRect {
    const position = this.position !== null && 'right' in this.position ? this.position : null;
    return questTrackerBounds(this.model, this.collapsed, position);
  }

  pointerMove(point: UiPoint): boolean {
    this.pointer = point;
    if (this.model.entries.length === 0) return false;
    if (this.headerDrag !== null) {
      const deltaX = point.x - this.headerDrag.start.x;
      const deltaY = point.y - this.headerDrag.start.y;
      if (!this.headerDrag.moved
        && deltaX * deltaX + deltaY * deltaY >= DRAG_THRESHOLD * DRAG_THRESHOLD) {
        this.headerDrag.moved = true;
      }
      if (this.headerDrag.moved) {
        const bounds = questTrackerBounds(this.model, this.collapsed, this.positionFromPoint({
          x: this.headerDrag.position.x + deltaX,
          y: this.headerDrag.position.y + deltaY,
        }));
        this.position = this.positionFromBounds(bounds);
      }
      return true;
    }
    const bounds = this.currentBounds;
    return containsPoint({ ...bounds, height: HEADER_HEIGHT }, point)
      || (!this.collapsed && this.questAt(point) !== null);
  }

  pointerDown(point: UiPoint, button: number): boolean {
    if (button !== 0 || this.model.entries.length === 0) return false;
    const bounds = this.currentBounds;
    const header = { ...bounds, height: HEADER_HEIGHT };
    if (containsPoint(header, point)) {
      this.headerDrag = {
        start: point,
        position: { x: bounds.x, y: bounds.y },
        moved: false,
      };
      return true;
    }
    if (this.collapsed) return false;
    this.pressedQuestId = this.questAt(point);
    return this.pressedQuestId !== null;
  }

  pointerUp(point: UiPoint = this.pointer): boolean {
    if (this.headerDrag !== null) {
      const moved = this.headerDrag.moved;
      this.headerDrag = null;
      if (moved) this.savePosition();
      else {
        this.collapsed = !this.collapsed;
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(COLLAPSED_STORAGE_KEY, String(this.collapsed));
        }
      }
      return true;
    }
    if (this.pressedQuestId === null) return false;
    const pressedQuestId = this.pressedQuestId;
    this.pressedQuestId = null;
    if (this.questAt(point) === pressedQuestId) this.openQuest(pressedQuestId);
    return true;
  }

  pointerCancel(): void {
    this.headerDrag = null;
    this.pressedQuestId = null;
    this.pointerLeave();
  }

  pointerLeave(): void { this.pointer = { x: -100, y: -100 }; }

  draw(context: CanvasRenderingContext2D): void {
    if (this.model.entries.length === 0) return;
    const bounds = this.currentBounds;
    const content = {
      x: bounds.x + CONTENT_PADDING,
      y: bounds.y + CONTENT_PADDING,
      width: bounds.width - CONTENT_PADDING * 2,
      height: bounds.height - CONTENT_PADDING * 2,
    };
    const header = { ...bounds, height: HEADER_HEIGHT };
    const hovering = containsPoint(header, this.pointer);
    drawUiSkinNatural(
      context,
      this.chevron,
      content.x - 3,
      header.y - 2,
      this.collapsed ? 'collapsed' : 'expanded',
    );
    drawOutlinedPixelText(context, this.fonts, 'QUESTS', content.x + HEADER_TEXT_X_OFFSET, content.y, {
      color: hovering ? '#fff3a0' : '#ffe36e', outlineColor: '#3f2832', font: 'body',
    });
    if (this.collapsed) return;
    let y = header.y + HEADER_HEIGHT + 3;
    const entryRects = new Map(questTrackerEntryRects(this.model, bounds)
      .map((entry) => [entry.questId, entry.rect]));
    for (const entry of this.model.entries) {
      const entryHovered = containsPoint(entryRects.get(entry.id)!, this.pointer);
      const title = entry.title.toUpperCase();
      const maximumWidth = content.width;
      let clipped = title;
      while (clipped.length > 1 && measurePixelText(clipped, 1, this.fonts.font) > maximumWidth) clipped = clipped.slice(0, -1);
      drawOutlinedPixelText(context, this.fonts, clipped, content.x, y, {
        color: entry.complete ? '#ffe36e' : entryHovered ? '#fff3a0' : '#fff0cf',
        outlineColor: '#3f2832', font: 'body',
      });
      y += LINE_HEIGHT;
      for (const objective of entry.objectives.length > 0 ? entry.objectives : ['No objectives']) {
        let clippedObjective = objective;
        while (clippedObjective.length > 1
          && measurePixelText(clippedObjective, 1, this.fonts.font) > maximumWidth - 6) {
          clippedObjective = clippedObjective.slice(0, -1);
        }
        drawOutlinedPixelText(context, this.fonts, `- ${clippedObjective}`, content.x + 4, y, {
          color: entry.complete ? '#d9bd5c' : '#e7c9a0', outlineColor: '#3f2832', font: 'body',
        });
        y += LINE_HEIGHT;
      }
    }
  }

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

  private questAt(point: UiPoint): string | null {
    const bounds = this.currentBounds;
    return questTrackerEntryRects(this.model, bounds)
      .find((entry) => containsPoint(entry.rect, point))?.questId ?? null;
  }
}
