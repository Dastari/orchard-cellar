import { expect, it, vi } from 'vitest';
import { uiQuestTracker } from './quest-tracker.js';
import { UiRoot } from '../runtime/root.js';

it('preserves the caller layout and retained controls when model data changes', () => {
  const root = new UiRoot({ scale: 1 }); root.resize(280, 220);
  const entry = { id: 'one', title: 'First quest', complete: false, objectives: ['0/1 Find the book'] };
  const open = vi.fn(), tracker = uiQuestTracker({ entries: [entry], onOpenQuest: open,
    layout: { width: 'grow', height: 'grow' } });
  root.mount(tracker); root.arrange();
  const header = root.entries().find(({ element }) => element.id === 'quest-tracker.header')!.element;
  const row = root.entries().find(({ element }) => element.id === 'quest-tracker.quest.one')!.element;
  root.focus.set(row);
  tracker.updateQuestTracker([{ ...entry, title: 'Updated quest', objectives: ['1/1 Find the book'], complete: true }], false);
  root.arrange();
  expect(tracker.rect).toMatchObject({ width: 280, height: 220 });
  expect(root.focus.current).toBe(row); expect(row.label).toBe('Updated quest');
  expect(root.entries().some(({ element }) => element === header)).toBe(true);
  root.key({ key: 'Enter' }); expect(open).toHaveBeenCalledExactlyOnceWith('one');
  tracker.updateQuestTracker([], false); root.arrange();
  expect(row.disposed).toBe(true); expect(root.focus.current).not.toBe(row);
  root.dispose();
});

it('paints the classic tracker: yellow text on a black outline, left-aligned after its chevron', async () => {
  const { createCanvas } = await import('@napi-rs/canvas');
  const { uiTestArt } = await import('../lab/testing/art.js');
  const root = new UiRoot({ scale: 1, art: await uiTestArt() }); root.resize(170, 60);
  root.mount(uiQuestTracker({ entries: [{ id: 'one', title: 'Strawberries', complete: false, objectives: ['0/6 Harvest'] }], layout: { width: 'grow', height: 'grow' } }));
  root.arrange();
  const canvas = createCanvas(170, 60), context = canvas.getContext('2d');
  root.drawInContext(context as unknown as CanvasRenderingContext2D, 0);
  const pixels = context.getImageData(0, 0, 170, 60).data, columns = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)), found: number[] = [];
    for (let i = 0; i < pixels.length; i += 4) if (pixels[i + 3] === 255 && pixels[i] === r && pixels[i + 1] === g && pixels[i + 2] === b) found.push((i / 4) % 170);
    return found;
  };
  const yellow = columns('#ffe36e'), black = columns('#000000');
  expect(yellow.length).toBeGreaterThan(0); expect(black.length).toBeGreaterThan(yellow.length);
  // Text starts at the left edge (the chevron and QUESTS) and never reaches the far right of the box.
  expect(Math.min(...yellow)).toBeLessThan(20); expect(Math.max(...yellow)).toBeLessThan(120);
  root.dispose();
});
