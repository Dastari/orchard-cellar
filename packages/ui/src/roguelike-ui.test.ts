import { describe, expect, it } from 'vitest';
import { rogueRewardHit, rogueRewardLayout } from './roguelike-ui.js';

describe('roguelike reward layout', () => {
  it('keeps three cards on screen at desktop and narrow tablet sizes', () => {
    for (const [width, height] of [[1_024, 640], [360, 540]] as const) {
      const layout = rogueRewardLayout(width, height, 3, true);
      expect(layout.frame.x).toBeGreaterThanOrEqual(0);
      expect(layout.frame.y).toBeGreaterThanOrEqual(0);
      expect(layout.frame.x + layout.frame.width).toBeLessThanOrEqual(width);
      expect(layout.cards).toHaveLength(3);
      for (const card of layout.cards) {
        expect(card.x).toBeGreaterThanOrEqual(layout.frame.x);
        expect(card.y + card.height).toBeLessThanOrEqual(layout.frame.y + layout.frame.height);
      }
    }
  });

  it('uses the same rectangles for presentation and hit testing', () => {
    const layout = rogueRewardLayout(1_024, 640, 3, true);
    const card = layout.cards[1]!;
    expect(rogueRewardHit(layout, { x: card.x + 1, y: card.y + 1 })).toEqual({ kind: 'offer', index: 1 });
    expect(layout.skip).not.toBeNull();
    expect(rogueRewardHit(layout, { x: layout.skip!.x + 1, y: layout.skip!.y + 1 })).toEqual({ kind: 'skip' });
  });
});
