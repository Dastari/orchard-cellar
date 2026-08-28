import { describe, expect, it } from 'vitest';
import { BUTTON_HEIGHT } from './button.js';
import {
  skillNodeRankLabelPosition,
  skillNodeReticleRect,
  skillNodeShowsReticle,
  skillTreeLayout,
} from './skill-tree-ui.js';

describe('skill-tree canvas layout', () => {
  it('reserves non-overlapping tree, details, tabs, and actions', () => {
    const rect = { x: 60, y: 55, width: 680, height: 390 };
    const layout = skillTreeLayout(rect);
    expect(layout.viewport.x + layout.viewport.width).toBeLessThan(layout.detail.x);
    expect(layout.detail.x + layout.detail.width).toBeLessThanOrEqual(rect.x + rect.width);
    expect(layout.learnButton.y).toBeGreaterThan(layout.resetButton.y);
    expect(layout.resetButton.height).toBe(BUTTON_HEIGHT.regular);
    expect(layout.learnButton.height).toBe(BUTTON_HEIGHT.regular);
    for (const tab of Object.values(layout.tabs)) {
      expect(tab.y).toBeLessThan(layout.viewport.y);
      expect(tab.x).toBeGreaterThanOrEqual(rect.x);
    }
  });

  it('shows a reticle only on the explicitly selected skill', () => {
    expect(skillNodeShowsReticle('trailblazer', null)).toBe(false);
    expect(skillNodeShowsReticle('trailblazer', 'measured_stride')).toBe(false);
    expect(skillNodeShowsReticle('trailblazer', 'trailblazer')).toBe(true);
  });

  it('places the selected reticle outside the full skill slot and lowers the rank label', () => {
    const node = { x: 40, y: 70, width: 30, height: 30 };
    expect(skillNodeReticleRect(node)).toEqual({ x: 25, y: 55, width: 60, height: 60 });
    expect(skillNodeRankLabelPosition(node)).toEqual({ x: 55, y: 97 });
  });
});
