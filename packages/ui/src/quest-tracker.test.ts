import { describe, expect, it } from 'vitest';
import { ui, UiRoot, type UiKitArt } from './kit/index.js';
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
    expect(collapsed.height).toBe(16);
    expect(expanded.width).toBe(170);
  });

  it('captures its header and clickable quest blocks without treating whitespace as UI', () => {
    const tracker = new QuestTracker({} as UiKitArt);
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
      {} as UiKitArt,
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
    const tracker = new QuestTracker({} as UiKitArt);
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
    const tracker = new QuestTracker({} as UiKitArt);
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

it('joins the HUD focus order and preserves quest focus when objective data changes', () => {
  const root = new UiRoot({ scale: 1 }), opened: string[] = [];
  root.mount(ui.button({ label: 'Inventory' }));
  const tracker = new QuestTracker({} as UiKitArt, id => opened.push(id), root);
  const model = { width: 480, height: 270, entries: [{ id: 'book', title: 'Book', complete: false, objectives: ['Find it'] }] };
  tracker.update(model);
  root.key({ key: 'Tab' }); expect(root.focus.current?.label).toBe('Inventory');
  root.key({ key: 'Tab' }); expect(root.focus.current?.id).toBe('quest-tracker.header');
  root.key({ key: 'Tab' }); expect(root.focus.current?.id).toBe('quest-tracker.quest.book');
  tracker.update({ ...model, entries: [{ ...model.entries[0]!, objectives: ['Return it'] }] });
  root.key({ key: 'Enter' }); expect(opened).toEqual(['book']);
  tracker.dispose(); expect(root.disposed).toBe(false); root.dispose();
});
it('clips long objective lists and retains their scroll position across updates', () => {
  const root = new UiRoot({ scale: 1 }), tracker = new QuestTracker({} as UiKitArt, () => {}, root);
  const model = { width: 320, height: 120, entries: Array.from({ length: 20 }, (_, i) => ({ id: String(i), title: `Quest ${i}`, complete: false, objectives: ['First', 'Second'] })) };
  tracker.update(model);
  const scroll = () => root.entries().find(entry => entry.element.kind === 'scroll-area')!.element;
  const rect = scroll().rect;
  tracker.wheel({ x: rect.x + 4, y: rect.y + 4 }, 120);
  const offset = scroll().scroll.y; expect(offset).toBeGreaterThan(0);
  tracker.update({ ...model, entries: model.entries.map(entry => ({ ...entry, complete: true })) });
  expect(scroll().scroll.y).toBe(offset);
  expect(tracker.currentBounds.y + tracker.currentBounds.height).toBeLessThanOrEqual(model.height - 4);
  tracker.dispose(); root.dispose();
});

it('keeps quest text within the authored button face rather than its border', () => {
  const root = new UiRoot({ scale: 1 }); root.resize(200,160);
  root.mount(ui.questTracker({ entries: [{ id: 'apple', title: 'Apple harvest', complete: false, objectives: ['Gather apples 3/5'] }] })); root.arrange();
  const row = root.entries().find(entry => entry.element.id === 'quest-tracker.quest.apple')!.element;
  const text = root.entries().filter(entry => entry.element.kind === 'text' && entry.element.isDescendantOf(row));
  for (const { element } of text) {
    expect(element.rect.x).toBeGreaterThanOrEqual(row.rect.x + 6);
    expect(element.rect.y).toBeGreaterThanOrEqual(row.rect.y + 6);
    expect(element.rect.y + element.rect.height).toBeLessThanOrEqual(row.rect.y + row.rect.height - 6);
  }
  root.dispose();
});
