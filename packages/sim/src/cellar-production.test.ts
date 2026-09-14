import { describe, expect, it } from 'vitest';
import {
  FERMENTATION_CYCLE_TICKS,
  PRESS_CYCLE_TICKS,
  cellarProcessorProgress,
  cellarProcessorRemainingTicks,
} from './cellar-production.js';

describe('46 live first-bottle processors', () => {
  it('derives progress and countdown without timer writes', () => {
    expect(cellarProcessorProgress('press', 10n, 10n + PRESS_CYCLE_TICKS / 2n)).toBeCloseTo(0.5);
    expect(cellarProcessorRemainingTicks('press', 10n, 10n + PRESS_CYCLE_TICKS / 2n))
      .toBe(PRESS_CYCLE_TICKS / 2n);
    expect(cellarProcessorProgress('fermentation', 10n, 10n + FERMENTATION_CYCLE_TICKS * 2n)).toBe(1);
  });
});
