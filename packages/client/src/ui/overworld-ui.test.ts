import { describe, expect, it } from 'vitest';
import { overworldUiLayout } from './overworld-ui.js';

describe('overworld retained UI layout', () => {
  it('anchors status, weather, hotbar, and window at 480x270', () => {
    const layout = overworldUiLayout(480, 270);
    expect(layout.status).toEqual({ x: 4, y: 4, width: 190, height: 21 });
    expect(layout.weather.x + layout.weather.width).toBe(476);
    expect(layout.hotbar.x).toBe(105);
    expect(layout.hotbar.y + layout.hotbar.height).toBe(264);
    expect(layout.window.x).toBe(105);
    expect(layout.window.y).toBe(43);
  });

  it('keeps all anchored UI inside a narrow viewport', () => {
    const layout = overworldUiLayout(360, 180);
    for (const rect of [layout.status, layout.weather, layout.hotbar, layout.window, layout.closeButton]) {
      expect(rect.x).toBeGreaterThanOrEqual(0);
      expect(rect.y).toBeGreaterThanOrEqual(0);
      expect(rect.x + rect.width).toBeLessThanOrEqual(360);
      expect(rect.y + rect.height).toBeLessThanOrEqual(180);
    }
  });
});
