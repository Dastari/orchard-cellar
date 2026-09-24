import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createCanvas } from '@napi-rs/canvas';
import { QuestTracker, questTrackerBounds, type QuestTrackerEntry } from './quest-tracker.js';
import { uiTestArt } from './kit/lab/testing/art.js';
import type { UiKitArt } from './kit/components/art.js';
import type { UiRootPointer } from './kit/runtime/input.js';

let art: UiKitArt;
beforeAll(async () => { art = await uiTestArt(); });
afterAll(() => vi.unstubAllGlobals());
const entry: QuestTrackerEntry = { id: 'book', title: 'A Very Important Book', complete: false, objectives: ['0/1 Pick up the book'] };
function storage() {
  const values = new Map<string, string>();
  return { values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
}
function node(tracker: QuestTracker, id: string) {
  tracker.root.arrange();
  return tracker.root.entries().find(({ element }) => element.id === id)!.element;
}
function point(tracker: QuestTracker, id = 'quest-tracker.header') {
  const rect = node(tracker, id).rect; return { x: rect.x + 8, y: rect.y + 4 };
}
function pointer(tracker: QuestTracker, type: UiRootPointer['type'], at: { x: number; y: number }, pointerId = 7) {
  return tracker.root.pointer({ type, point: at, pointerId, button: 0 });
}

describe('production retained quest tracker', () => {
  it('anchors beneath the minimap, clicks real quest IDs once, and persists keyboard collapse', () => {
    const saved = storage(), open = vi.fn(), tracker = new QuestTracker(art, open, saved);
    const model = { width: 480, height: 270, anchorRect: { x: 360, y: 4, width: 116, height: 92 }, entries: [entry] };
    tracker.update(model);
    expect(tracker.currentBounds.x + tracker.currentBounds.width).toBe(476);
    expect(tracker.currentBounds.y).toBe(100);
    const questPoint = point(tracker, 'quest-tracker.quest.book');
    pointer(tracker, 'down', questPoint); expect(open).not.toHaveBeenCalled();
    pointer(tracker, 'up', questPoint); pointer(tracker, 'up', questPoint);
    expect(open).toHaveBeenCalledExactlyOnceWith('book');
    tracker.root.focus.set(node(tracker, 'quest-tracker.header'));
    tracker.root.key({ key: 'Enter' });
    expect(tracker.currentBounds.height).toBe(16);
    expect(saved.values.get('orchard:quest-tracker:collapsed')).toBe('true');
    const restored = new QuestTracker(art, open, saved); restored.update(model);
    expect(restored.currentBounds.height).toBe(16);
    restored.dispose(); tracker.dispose();
  });

  it('retains focused/captured quest rows across authority updates and cancels removed quests', () => {
    const open = vi.fn(), tracker = new QuestTracker(art, open, null);
    tracker.update({ width: 480, height: 270, entries: [entry] });
    const row = node(tracker, 'quest-tracker.quest.book'), at = point(tracker, row.id);
    pointer(tracker, 'down', at);
    tracker.update({ width: 480, height: 270, entries: [{ ...entry, complete: true, objectives: ['1/1 Pick up the book'] }] });
    expect(node(tracker, row.id)).toBe(row); expect(tracker.root.focus.current).toBe(row);
    pointer(tracker, 'up', at); expect(open).toHaveBeenCalledExactlyOnceWith('book');
    pointer(tracker, 'down', at);
    tracker.update({ width: 480, height: 270, entries: [] });
    pointer(tracker, 'up', at);
    expect(open).toHaveBeenCalledTimes(1); expect(tracker.isActive).toBe(false); tracker.dispose();
  });

  it('drags with capture, preserves the right offset through narrow resize, and restores storage', () => {
    const saved = storage(), tracker = new QuestTracker(art, () => {}, saved);
    const model = { width: 480, height: 270, entries: [entry] };
    tracker.update(model);
    const start = point(tracker);
    pointer(tracker, 'down', start);
    pointer(tracker, 'move', { x: start.x - 40, y: start.y + 20 });
    pointer(tracker, 'up', { x: start.x - 40, y: start.y + 20 });
    const dragged = tracker.currentBounds, right = model.width - dragged.x - dragged.width;
    expect(dragged.height).toBeGreaterThan(16);
    for (const width of [640, 100, 180, 640]) {
      tracker.update({ ...model, width });
      const bounds = tracker.currentBounds;
      expect(bounds.x).toBeGreaterThanOrEqual(4); expect(bounds.x + bounds.width).toBeLessThanOrEqual(width - 4);
      if (width === 640) expect(width - bounds.x - bounds.width).toBe(right);
    }
    const restored = new QuestTracker(art, () => {}, saved); restored.update(model);
    expect(restored.currentBounds).toEqual(dragged);
    restored.dispose(); tracker.dispose();
  });

  it('migrates legacy x/y storage and tolerates unavailable preferences', () => {
    const saved = storage(); saved.setItem('orchard:quest-tracker:position', JSON.stringify({ x: 150, y: 30 }));
    const tracker = new QuestTracker(art, () => {}, saved); tracker.update({ width: 480, height: 270, entries: [entry] });
    expect(tracker.currentBounds.x).toBe(150);
    expect(JSON.parse(saved.getItem('orchard:quest-tracker:position')!)).toEqual({ right: 160, y: 30 });
    const blocked = new QuestTracker(art, () => {}, { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } });
    blocked.update({ width: 480, height: 270, entries: [entry] });
    const at = point(blocked); pointer(blocked, 'down', at); pointer(blocked, 'up', at);
    expect(blocked.currentBounds.height).toBe(16); blocked.dispose(); tracker.dispose();
  });

  it('cancels header/row gestures without toggling or activating and clamps captured drags', () => {
    const open = vi.fn(), tracker = new QuestTracker(art, open, null);
    tracker.update({ width: 480, height: 270, entries: [entry] });
    const header = point(tracker), height = tracker.currentBounds.height;
    pointer(tracker, 'down', header); pointer(tracker, 'cancel', header); pointer(tracker, 'up', header);
    expect(tracker.currentBounds.height).toBe(height);
    const row = point(tracker, 'quest-tracker.quest.book');
    pointer(tracker, 'down', row); pointer(tracker, 'cancel', row); pointer(tracker, 'up', row);
    expect(open).not.toHaveBeenCalled();
    pointer(tracker, 'down', header); pointer(tracker, 'move', { x: -1000, y: -1000 }); pointer(tracker, 'up', { x: -1000, y: -1000 });
    expect(tracker.currentBounds.x).toBe(4); expect(tracker.currentBounds.y).toBe(4); tracker.dispose();
  });

  it('scrolls long objectives within compact bounds and draws through the caller scale/DPR transform', () => {
    const tracker = new QuestTracker(art, () => {}, null);
    const entries = Array.from({ length: 10 }, (_, index) => ({ ...entry, id: `quest-${index}`, title: 'A very long pinned quest title that must remain clipped', objectives: ['A long objective '.repeat(12), 'Second objective'] }));
    tracker.update({ width: 260, height: 180, entries }); tracker.root.arrange();
    const bounds = questTrackerBounds({ width: 260, height: 180, entries }, false);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(176);
    const list = tracker.root.entries().find(({ element }) => element.kind === 'scroll-area')!.element;
    expect(list.scroll.maxY).toBeGreaterThan(0);
    expect(tracker.root.wheel({ point: { x: list.rect.x + 5, y: list.rect.y + 5 }, deltaY: 30, deltaX: 0 })).toBe(true);
    expect(list.scroll.y).toBeGreaterThan(0);
    for (const scale of [1, 2, 3]) for (const dpr of [1, 1.25, 1.5]) {
      const canvas = createCanvas(Math.ceil(260 * scale * dpr), Math.ceil(180 * scale * dpr));
      const context = canvas.getContext('2d'); context.scale(scale * dpr, scale * dpr);
      tracker.draw(context as unknown as CanvasRenderingContext2D, 100);
      expect(canvas.data().some(value => value !== 0)).toBe(true); expect(tracker.root.scale).toBe(1);
    }
    tracker.dispose();
  });
});

it('uses temporary HUD space without overwriting saved anchors and cancels hidden gestures', () => {
  const saved = storage(), open = vi.fn(), tracker = new QuestTracker(art, open, saved);
  const model = { width: 640, height: 360, entries: [entry] };
  tracker.update(model);
  tracker.update({ ...model, width: 320, height: 180, layoutRegion: { x:160,y:40,width:156,height:38 } });
  expect(tracker.currentBounds).toEqual({ x:160,y:40,width:156,height:38 });
  const p = point(tracker, 'quest-tracker.quest.book'); pointer(tracker, 'down', p);
  tracker.update({ ...model, visible:false }); pointer(tracker, 'up', p);
  expect(open).not.toHaveBeenCalled(); expect(tracker.isActive).toBe(false);
  tracker.update(model); expect(tracker.isActive).toBe(true); expect(tracker.currentBounds.width).toBe(170);
  expect(saved.values.size).toBe(0); tracker.dispose();
  saved.setItem('orchard:quest-tracker:position', JSON.stringify({ right:30,y:240 }));
  const anchored = new QuestTracker(art,open,saved); anchored.update(model);
  const original = anchored.currentBounds;
  anchored.update({ ...model,width:320,height:180,layoutRegion:{x:160,y:40,width:156,height:38} });
  expect(anchored.currentBounds.width).toBe(170);
  anchored.update(model); expect(anchored.currentBounds).toEqual(original);
  expect(JSON.parse(saved.getItem('orchard:quest-tracker:position')!)).toEqual({right:30,y:240}); anchored.dispose();
});

it('does not jump sideways while dragging out of a temporary narrow HUD region', () => {
  const tracker = new QuestTracker(art,()=>{},null);
  tracker.update({width:320,height:180,entries:[entry],layoutRegion:{x:160,y:40,width:156,height:38}});
  const start = point(tracker); pointer(tracker,'down',start);
  const next = {x:start.x-20,y:start.y+12}; pointer(tracker,'move',next);
  expect(tracker.currentBounds).toEqual({x:140,y:52,width:170,height:46});
  pointer(tracker,'up',next); expect(tracker.currentBounds).toEqual({x:140,y:52,width:170,height:46}); tracker.dispose();
});
