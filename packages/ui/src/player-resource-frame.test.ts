import { describe, expect, it, vi } from 'vitest';
import { PlayerResourceFrame, playerResourceFrameLayout, resourceEndpointRect, resourceFillRect, resourceFillWidth } from './player-resource-frame.js';
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
    expect(playerResourceFrameLayout(10, 20, 1.5, true)).toEqual({
      frame: { x: 10, y: 20, width: 72, height: 29 },
      portrait: { x: 60, y: 25, width: 18, height: 20 },
      bars: {
        health: { x: 10, y: 25, width: 45, height: 8 },
        mana: { x: 10, y: 31, width: 45, height: 8 },
        vigour: { x: 10, y: 37, width: 45, height: 8 },
      },
    });
  });

  it('derives every visible fill width from live current/max values', () => {
    expect(resourceFillWidth(60, 1000, 1000)).toBe(60);
    expect(resourceFillWidth(60, 500, 1000)).toBe(30);
    expect(resourceFillWidth(60, 1, 1000)).toBe(0);
    expect(resourceFillWidth(60, 5000, 1000)).toBe(60);
    expect(resourceFillWidth(60, undefined, undefined)).toBe(0);
  });

  it('anchors mirrored target fills at the right edge so they drain in reverse', () => {
    const track = { x: 10, y: 5, width: 60, height: 10 };
    expect(resourceFillRect(track, 500, 1000)).toEqual({ x: 10, y: 5, width: 30, height: 10 });
    expect(resourceFillRect(track, 500, 1000, true)).toEqual({ x: 40, y: 5, width: 30, height: 10 });
    expect(resourceFillRect(track, 1000, 1000, true)).toEqual(track);
  });

  it('places the live endpoint at the current value in either direction', () => {
    const track = { x: 10, y: 5, width: 60, height: 10 };
    expect(resourceEndpointRect(track, 500, 1000)).toEqual({ x: 38, y: 7, width: 2, height: 6 });
    expect(resourceEndpointRect(track, 500, 1000, true)).toEqual({ x: 40, y: 7, width: 2, height: 6 });
    expect(resourceEndpointRect(track, 1000, 1000)).toEqual({ x: 66, y: 7, width: 2, height: 6 });
    expect(resourceEndpointRect(track, 1000, 1000, true)).toEqual({ x: 12, y: 7, width: 2, height: 6 });
    expect(resourceEndpointRect(track, 0, 1000)).toBeNull();
  });

  it('resolves resources by player identity and hit-tests each authored bar', () => {
    const resolve = vi.fn(() => null);
    const frame = new PlayerResourceFrame({} as UiSkin, { resolve, drawHead: vi.fn() });
    expect(frame.resourceAtPoint(10, 20, { x: 30, y: 24 })).toBe('health');
    expect(frame.resourceAtPoint(10, 20, { x: 30, y: 29 })).toBe('mana');
    expect(frame.resourceAtPoint(10, 20, { x: 30, y: 34 })).toBe('vigour');
    expect(frame.resourceAtPoint(10, 20, { x: 14, y: 24 })).toBeNull();
    expect(frame.resourceAtPoint(10, 20, { x: 50, y: 44 }, 2)).toBe('vigour');
    expect(frame.resourceAtPoint(10, 20, { x: 20, y: 26 }, 1.5, true)).toBe('health');
    expect(frame.resourceAtPoint(10, 20, { x: 65, y: 26 }, 1.5, true)).toBeNull();
    expect(frame.draw({} as CanvasRenderingContext2D, 'player-2', 10, 20)).toBe(false);
    expect(resolve).toHaveBeenCalledWith('player-2');
  });
});
