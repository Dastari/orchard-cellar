import { describe, expect, it } from 'vitest';
import { MOON_PHASES } from '@orchard/sim';
import { MOON_PHASE_LABELS, moonPhasePixel } from './overworld-ui.js';

describe('27§7 lunar HUD silhouettes', () => {
  it('captures all eight named phases with distinct seven-pixel masks', () => {
    const masks = MOON_PHASES.map((phase) => {
      expect(MOON_PHASE_LABELS[phase]).toBeTruthy();
      let mask = '';
      for (let y = 0; y < 7; y += 1) {
        for (let x = 0; x < 7; x += 1) mask += moonPhasePixel(phase, x, y);
      }
      return mask;
    });
    expect(new Set(masks).size).toBe(8);
  });

  it('grows waxing light on the right and leaves New Moon unlit', () => {
    expect(moonPhasePixel('waxing_crescent', 5, 3)).toBe(2);
    expect(moonPhasePixel('waxing_crescent', 1, 3)).toBe(1);
    expect(moonPhasePixel('waning_crescent', 1, 3)).toBe(2);
    expect(moonPhasePixel('waning_crescent', 5, 3)).toBe(1);
    expect(moonPhasePixel('new_moon', 3, 3)).toBe(1);
  });
});
