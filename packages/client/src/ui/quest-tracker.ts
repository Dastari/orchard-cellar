import { drawOutlinedPixelText, measurePixelText, type PixelUi } from '../render/pixel-ui.js';
import type { UiPoint, UiRect } from './geometry.js';
import { containsPoint } from './geometry.js';

const TRACKER_WIDTH = 170;
const HEADER_HEIGHT = 12;
const LINE_HEIGHT = 9;
const CONTENT_PADDING = 2;
const STORAGE_KEY = 'orchard:quest-tracker:collapsed';

export interface QuestTrackerEntry {
  readonly id: string;
  readonly title: string;
  readonly complete: boolean;
  readonly objectives: readonly string[];
}

export interface QuestTrackerModel {
  readonly width: number;
  readonly entries: readonly QuestTrackerEntry[];
}

export function questTrackerBounds(model: QuestTrackerModel, collapsed: boolean): UiRect {
  const lineCount = collapsed ? 0 : model.entries.reduce(
    (count, entry) => count + 1 + Math.max(1, entry.objectives.length),
    0,
  );
  return {
    x: Math.max(4, model.width - TRACKER_WIDTH - 8),
    y: 34,
    width: TRACKER_WIDTH,
    height: HEADER_HEIGHT + (collapsed ? 0 : Math.max(12, lineCount * LINE_HEIGHT + 3)),
  };
}

/** A deliberately small, WoW-style pinned objective list. Collapse state is
 * presentation-only; pinning individual quests remains server-owned. */
export class QuestTracker {
  private model: QuestTrackerModel = { width: 320, entries: [] };
  private collapsed = typeof localStorage !== 'undefined'
    && localStorage.getItem(STORAGE_KEY) === 'true';
  private pointer: UiPoint = { x: -100, y: -100 };

  constructor(private readonly fonts: PixelUi) {}

  update(model: QuestTrackerModel): void { this.model = model; }

  pointerMove(point: UiPoint): boolean {
    this.pointer = point;
    return this.model.entries.length > 0 && containsPoint(questTrackerBounds(this.model, this.collapsed), point);
  }

  pointerDown(point: UiPoint, button: number): boolean {
    if (button !== 0 || this.model.entries.length === 0) return false;
    const bounds = questTrackerBounds(this.model, this.collapsed);
    const header = { ...bounds, height: HEADER_HEIGHT };
    if (!containsPoint(header, point)) return containsPoint(bounds, point);
    this.collapsed = !this.collapsed;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, String(this.collapsed));
    }
    return true;
  }

  pointerLeave(): void { this.pointer = { x: -100, y: -100 }; }

  draw(context: CanvasRenderingContext2D): void {
    if (this.model.entries.length === 0) return;
    const bounds = questTrackerBounds(this.model, this.collapsed);
    const content = {
      x: bounds.x + CONTENT_PADDING,
      y: bounds.y + CONTENT_PADDING,
      width: bounds.width - CONTENT_PADDING * 2,
      height: bounds.height - CONTENT_PADDING * 2,
    };
    const header = { ...bounds, height: HEADER_HEIGHT };
    const hovering = containsPoint(header, this.pointer);
    drawOutlinedPixelText(context, this.fonts, `${this.collapsed ? '>' : 'v'} QUESTS`, content.x, content.y, {
      color: hovering ? '#fff3a0' : '#ffe36e', outlineColor: '#3f2832', font: 'body',
    });
    if (this.collapsed) return;
    let y = header.y + HEADER_HEIGHT + 3;
    for (const entry of this.model.entries) {
      const title = entry.title.toUpperCase();
      const maximumWidth = content.width;
      let clipped = title;
      while (clipped.length > 1 && measurePixelText(clipped, 1, this.fonts.font) > maximumWidth) clipped = clipped.slice(0, -1);
      drawOutlinedPixelText(context, this.fonts, clipped, content.x, y, {
        color: entry.complete ? '#ffe36e' : '#fff0cf', outlineColor: '#3f2832', font: 'body',
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
}
