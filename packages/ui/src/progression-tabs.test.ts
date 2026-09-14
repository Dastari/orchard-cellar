import { describe, expect, it } from 'vitest';
import { PROGRESSION_TABS, progressionTabsLayout } from './progression-tabs.js';

describe('progression tab layout', () => {
  it('keeps all tabs and page content inside the character frame', () => {
    const frame = { x: 60, y: 55, width: 680, height: 390 };
    const layout = progressionTabsLayout(frame);
    for (const tab of PROGRESSION_TABS) {
      const rect = layout.tabs[tab];
      expect(rect.x).toBeGreaterThanOrEqual(frame.x);
      expect(rect.x + rect.width).toBeLessThanOrEqual(frame.x + frame.width);
      expect(rect.y).toBeGreaterThan(frame.y);
    }
    expect(layout.content.y).toBeGreaterThan(layout.tabs.character.y + layout.tabs.character.height);
    expect(layout.content.y + layout.content.height).toBeLessThanOrEqual(frame.y + frame.height);
  });

  it('retains usable tab targets on the compact viewport', () => {
    const layout = progressionTabsLayout({ x: 6, y: 6, width: 348, height: 258 });
    expect(layout.tabs.character.width).toBeGreaterThanOrEqual(90);
    expect(layout.content.height).toBeGreaterThanOrEqual(180);
  });
});
