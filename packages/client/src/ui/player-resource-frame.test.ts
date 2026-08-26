import { describe, expect, it, vi } from 'vitest';
import { PlayerResourceFrame, playerResourceFrameLayout } from './player-resource-frame.js';
import type { UiSkin } from './skin.js';

describe('player resource frame', () => {
  it('maps the portrait and three resources to the authored 48x19 sprite', () => {
    const layout = playerResourceFrameLayout(10, 20);
    expect(layout.frame).toEqual({ x: 10, y: 20, width: 48, height: 19 });
    expect(layout.portrait).toEqual({ x: 13, y: 23, width: 12, height: 13 });
    expect(layout.bars.health).toEqual({ x: 28, y: 23, width: 30, height: 5 });
    expect(layout.bars.mana).toEqual({ x: 28, y: 27, width: 30, height: 5 });
    expect(layout.bars.vigour).toEqual({ x: 28, y: 31, width: 30, height: 5 });
    expect(playerResourceFrameLayout(10, 20, 2)).toEqual({
      frame: { x: 10, y: 20, width: 96, height: 38 },
      portrait: { x: 16, y: 26, width: 24, height: 26 },
      bars: {
        health: { x: 46, y: 26, width: 60, height: 10 },
        mana: { x: 46, y: 34, width: 60, height: 10 },
        vigour: { x: 46, y: 42, width: 60, height: 10 },
      },
    });
  });

  it('resolves resources by player identity and hit-tests each authored bar', () => {
    const resolve = vi.fn(() => null);
    const frame = new PlayerResourceFrame({} as UiSkin, { resolve, drawHead: vi.fn() });
    expect(frame.resourceAtPoint(10, 20, { x: 30, y: 24 })).toBe('health');
    expect(frame.resourceAtPoint(10, 20, { x: 30, y: 29 })).toBe('mana');
    expect(frame.resourceAtPoint(10, 20, { x: 30, y: 34 })).toBe('vigour');
    expect(frame.resourceAtPoint(10, 20, { x: 14, y: 24 })).toBeNull();
    expect(frame.resourceAtPoint(10, 20, { x: 50, y: 44 }, 2)).toBe('vigour');
    expect(frame.draw({} as CanvasRenderingContext2D, 'player-2', 10, 20)).toBe(false);
    expect(resolve).toHaveBeenCalledWith('player-2');
  });
});
