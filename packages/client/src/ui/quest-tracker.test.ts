import { describe, expect, it } from 'vitest';
import type { LoadedAsset } from '../render/assets.js';
import type { PixelUi } from '../render/pixel-ui.js';
import { QuestTracker, questTrackerBounds, questTrackerEntryRects } from './quest-tracker.js';

describe('quest tracker layout', () => {
  it('defaults directly below the minimap and collapses to its header', () => {
    const model = {
      width: 480,
      height: 270,
      anchorRect: { x: 360, y: 4, width: 116, height: 92 },
      entries: [{
        id: 'book',
        title: 'A Very Important Book',
        complete: false,
        objectives: ['0/1 Pick up the book'],
      }],
    } as const;
    const expanded = questTrackerBounds(model, false);
    const collapsed = questTrackerBounds(model, true);
    expect(expanded.x + expanded.width).toBe(476);
    expect(expanded.y).toBe(100);
    expect(expanded.height).toBeGreaterThan(collapsed.height);
    expect(collapsed.height).toBe(12);
    expect(expanded.width).toBe(170);
  });

  it('captures its header and clickable quest blocks without treating whitespace as UI', () => {
    const tracker = new QuestTracker({} as PixelUi, {} as LoadedAsset);
    const model = {
      width: 480,
      entries: [{ id: 'book', title: 'Book', complete: false, objectives: ['0/1 Find it'] }],
    } as const;
    tracker.update(model);
    const bounds = questTrackerBounds(model, false);
    const entry = questTrackerEntryRects(model, bounds)[0]!.rect;
    expect(tracker.pointerMove({ x: entry.x + 4, y: entry.y + 4 })).toBe(true);
    expect(tracker.pointerDown({ x: entry.x + 4, y: entry.y + 4 }, 0)).toBe(true);
    tracker.pointerCancel();
    expect(tracker.pointerMove({ x: bounds.x + bounds.width - 2, y: bounds.y + bounds.height - 1 })).toBe(false);
    expect(tracker.pointerMove({ x: bounds.x + 4, y: bounds.y + 4 })).toBe(true);
    expect(tracker.pointerDown({ x: bounds.x + 4, y: bounds.y + 4 }, 0)).toBe(true);
  });

  it('opens the selected quest from its overworld block', () => {
    const opened: string[] = [];
    const tracker = new QuestTracker(
      {} as PixelUi,
      {} as LoadedAsset,
      (questId) => opened.push(questId),
    );
    const model = {
      width: 480,
      entries: [{ id: 'book', title: 'Book', complete: false, objectives: ['0/1 Find it'] }],
    } as const;
    tracker.update(model);
    const entry = questTrackerEntryRects(model, tracker.currentBounds)[0]!.rect;
    const point = { x: entry.x + 4, y: entry.y + 4 };
    expect(tracker.pointerDown(point, 0)).toBe(true);
    expect(tracker.pointerUp(point)).toBe(true);
    expect(opened).toEqual(['book']);
  });

  it('drags from its header while clamping the list to the viewport', () => {
    const tracker = new QuestTracker({} as PixelUi, {} as LoadedAsset);
    const model = {
      width: 480,
      height: 270,
      anchorRect: { x: 360, y: 4, width: 116, height: 92 },
      entries: [{ id: 'book', title: 'Book', complete: false, objectives: ['0/1 Find it'] }],
    } as const;
    tracker.update(model);
    const start = tracker.currentBounds;
    expect(tracker.pointerDown({ x: start.x + 8, y: start.y + 4 }, 0)).toBe(true);
    tracker.pointerMove({ x: start.x - 1_000, y: start.y - 1_000 });
    expect(tracker.pointerUp()).toBe(true);
    expect(tracker.currentBounds.x).toBe(4);
    expect(tracker.currentBounds.y).toBe(4);
  });

  it('keeps a dragged position relative to the right edge when the viewport resizes', () => {
    const tracker = new QuestTracker({} as PixelUi, {} as LoadedAsset);
    const entry = { id: 'book', title: 'Book', complete: false, objectives: ['0/1 Find it'] } as const;
    tracker.update({ width: 480, height: 270, entries: [entry] });
    const start = tracker.currentBounds;
    const headerPoint = { x: start.x + 8, y: start.y + 4 };
    tracker.pointerDown(headerPoint, 0);
    tracker.pointerMove({ x: headerPoint.x - 40, y: headerPoint.y + 20 });
    tracker.pointerUp();
    const dragged = tracker.currentBounds;
    const rightOffset = 480 - dragged.x - dragged.width;

    tracker.update({ width: 640, height: 270, entries: [entry] });

    expect(640 - tracker.currentBounds.x - tracker.currentBounds.width).toBe(rightOffset);
    expect(tracker.currentBounds.y).toBe(dragged.y);

    tracker.update({ width: 180, height: 270, entries: [entry] });
    expect(tracker.currentBounds.x).toBe(4);
    tracker.update({ width: 640, height: 270, entries: [entry] });
    expect(640 - tracker.currentBounds.x - tracker.currentBounds.width).toBe(rightOffset);
  });
});
