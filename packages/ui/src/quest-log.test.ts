import { describe, expect, it } from 'vitest';
import { questLogLayout, wrapQuestText } from './quest-log.js';

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

});
