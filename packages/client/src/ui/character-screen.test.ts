import { describe, expect, it } from 'vitest';
import { characterScreenVerticalMetrics, cycleAppearanceValue, progressionWindowRect } from './character-screen.js';

const appearance = {
  hairKind: 'hair_1_brown',
  shirtKind: 'farmer_green',
  pantsKind: 'farmer_white_brown',
  shoesKind: 'brown',
} as const;

describe('character screen logic', () => {
  it('uses a centered full parchment window while remaining viewport-bounded', () => {
    expect(progressionWindowRect(800, 500)).toEqual({ x: 60, y: 55, width: 680, height: 390 });
    const compact = progressionWindowRect(360, 270);
    expect(compact.x).toBeGreaterThanOrEqual(0);
    expect(compact.y).toBeGreaterThanOrEqual(0);
    expect(compact.x + compact.width).toBeLessThanOrEqual(360);
    expect(compact.y + compact.height).toBeLessThanOrEqual(270);
  });

  it('cycles every authored appearance axis in both directions with wraparound', () => {
    expect(cycleAppearanceValue(appearance, 'hairKind', 1).hairKind).toBe('hair_2_black');
    expect(cycleAppearanceValue(appearance, 'hairKind', -1).hairKind).toBe('hair_6_brown');
    expect(cycleAppearanceValue(appearance, 'shirtKind', -1).shirtKind).toBe('farmer_white_brown');
    expect(cycleAppearanceValue(appearance, 'pantsKind', 1).pantsKind).toBe('farmer_black');
    expect(cycleAppearanceValue(appearance, 'shoesKind', -1).shoesKind).toBe('red');
  });

  it('keeps the compact paper doll, controls, stats, experience, and effects inside the window', () => {
    const rect = progressionWindowRect(480, 270);
    const metrics = characterScreenVerticalMetrics(rect);
    expect(metrics.appearanceTop + metrics.appearanceStep * 3 + metrics.appearanceHeight).toBeLessThan(rect.height);
    expect(metrics.experienceTop + metrics.experienceStep * 2 + 8).toBeLessThan(rect.height);
    expect(metrics.effects + 8).toBeLessThan(rect.height);
  });
});
