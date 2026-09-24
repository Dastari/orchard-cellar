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
