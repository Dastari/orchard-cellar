import { describe, expect, it, vi } from 'vitest';
import type { PixelUi } from '../render/pixel-ui.js';
import { QuestLog, questLogLayout, wrapQuestText, type QuestLogEntry } from './quest-log.js';
import type { UiSkin } from './skin.js';

const quest: QuestLogEntry = {
  id: 'book', title: 'A Very Important Book', summary: 'Fetch the book from the table.',
  state: 'active', pinned: true,
  objectives: [{ label: 'Pick up the book', complete: false, progress: '0/1' }],
  rewards: ['1 GOLD', '100 EXPLORER XP'],
};

describe('quest log', () => {
  it('lays out a two-pane log with standard action buttons', () => {
    const frame = { x: 6, y: 6, width: 468, height: 258 };
    const layout = questLogLayout(frame);
    expect(layout.list.x + layout.list.width).toBeLessThan(layout.details.x);
    expect(layout.pinButton.height).toBe(22);
    expect(layout.dropButton.height).toBe(22);
    expect(layout.dropButton.x + layout.dropButton.width).toBe(layout.details.x + layout.details.width);
  });

  it('wraps detail prose without splitting ordinary words', () => {
    expect(wrapQuestText('Fetch the important book from Marlow', 12))
      .toEqual(['Fetch the', 'important', 'book from', 'Marlow']);
  });

  it('routes track and drop actions for the selected authoritative quest', () => {
    const setPinned = vi.fn();
    const drop = vi.fn();
    const log = new QuestLog({} as UiSkin, {} as PixelUi, { setPinned, drop });
    log.update([quest]);
    const frame = { x: 6, y: 6, width: 468, height: 258 };
    const layout = questLogLayout(frame);
    expect(log.pointerDown({ x: layout.pinButton.x + 3, y: layout.pinButton.y + 3 }, 0, frame)).toBe(true);
    expect(setPinned).toHaveBeenCalledWith('book', false);
    expect(log.pointerDown({ x: layout.dropButton.x + 3, y: layout.dropButton.y + 3 }, 0, frame)).toBe(true);
    expect(drop).toHaveBeenCalledWith('book');
  });

  it('selects a quest requested by the overworld tracker', () => {
    const log = new QuestLog({} as UiSkin, {} as PixelUi, { setPinned: vi.fn(), drop: vi.fn() });
    log.update([quest, { ...quest, id: 'second', title: 'Second Quest' }]);
    expect(log.select('second')).toBe(true);
    expect(log.select('missing')).toBe(false);
  });
});
