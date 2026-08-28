import { describe, expect, it } from 'vitest';
import type { UiSkin } from './skin.js';
import { ScrollBar, scrollMaximum, scrollThumbRect } from './scrollbar.js';

describe('scrollbar geometry', () => {
  it('uses top-origin positions and a proportional thumb', () => {
    expect(scrollMaximum(20, 5)).toBe(15);
    const top = scrollThumbRect({ x: 10, y: 20, width: 14, height: 100 }, 20, 5, 0);
    const bottom = scrollThumbRect({ x: 10, y: 20, width: 14, height: 100 }, 20, 5, 15);
    expect(top).toEqual({ x: 10, y: 20, width: 14, height: 25 });
    expect(bottom).toEqual({ x: 10, y: 95, width: 14, height: 25 });
  });

  it('fills the track when the content does not overflow', () => {
    expect(scrollMaximum(3, 5)).toBe(0);
    expect(scrollThumbRect({ x: 0, y: 0, width: 14, height: 40 }, 3, 5, 0).height).toBe(40);
  });

  it('supports a compact grip without changing its end positions', () => {
    const bounds = { x: 10, y: 20, width: 14, height: 100 };
    expect(scrollThumbRect(bounds, 20, 15, 0, 18)).toEqual({ x: 10, y: 20, width: 14, height: 18 });
    expect(scrollThumbRect(bounds, 20, 15, 5, 18)).toEqual({ x: 10, y: 102, width: 14, height: 18 });
  });

  it('scrolls upward toward older rows and supports standard navigation keys', () => {
    const bar = new ScrollBar({} as UiSkin);
    bar.setBounds({ x: 0, y: 0, width: 14, height: 100 });
    bar.setMetrics(20, 5, true);
    expect(bar.position).toBe(15);
    expect(bar.wheel(-1)).toBe(true);
    expect(bar.position).toBe(13);
    expect(bar.handleKey('PageUp')).toBe(true);
    expect(bar.position).toBe(8);
    expect(bar.handleKey('Home')).toBe(true);
    expect(bar.position).toBe(0);
    expect(bar.handleKey('End')).toBe(true);
    expect(bar.position).toBe(15);
  });
});
