import { describe, expect, it } from 'vitest';
import {
  FERMENTATION_CYCLE_TICKS,
  FERMENTATION_MUST_PER_BOTTLE,
  PRESS_CYCLE_TICKS,
  cellarProcessorMutationIsValid,
  cellarProcessorProgress,
  cellarProcessorRemainingTicks,
  settleFermentation,
  settleFruitPress,
} from './cellar-production.js';

describe('46 live first-bottle processors', () => {
  it('presses one fruit per five-minute cycle into must and pomace', () => {
    const started = settleFruitPress({
      slots: [{ itemKind: 'apple', quantity: 3 }, null, null],
      processStartTick: undefined,
    }, 100n);
    expect(started.processStartTick).toBe(100n);
    const one = settleFruitPress(started, 100n + PRESS_CYCLE_TICKS);
    expect(one).toMatchObject({ completed: 1, completedInputKind: 'apple' });
    expect(one.slots).toEqual([
      { itemKind: 'apple', quantity: 2 },
      { itemKind: 'must', quantity: 1 },
      { itemKind: 'pomace', quantity: 1 },
    ]);
  });

  it('catches up exact whole press cycles and pauses at output capacity', () => {
    const settled = settleFruitPress({
      slots: [{ itemKind: 'grape', quantity: 8 }, { itemKind: 'must', quantity: 97 }, null],
      processStartTick: 20n,
    }, 20n + PRESS_CYCLE_TICKS * 8n);
    expect(settled.completed).toBe(2);
    expect(settled.slots[0]).toEqual({ itemKind: 'grape', quantity: 6 });
    expect(settled.slots[1]).toEqual({ itemKind: 'must', quantity: 99 });
    expect(settled.slots[2]).toEqual({ itemKind: 'pomace', quantity: 2 });
    expect(settled.processStartTick).toBeUndefined();
  });

  it('ferments three must into one bottle over thirty minutes', () => {
    const started = settleFermentation({
      slots: [{ itemKind: 'must', quantity: FERMENTATION_MUST_PER_BOTTLE * 2 }, null],
      processStartTick: undefined,
    }, 40n);
    const settled = settleFermentation(started, 40n + FERMENTATION_CYCLE_TICKS * 2n);
    expect(settled.completed).toBe(2);
    expect(settled.slots).toEqual([null, { itemKind: 'bottles', quantity: 2 }]);
    expect(settled.processStartTick).toBeUndefined();
  });

  it('derives progress and countdown without timer writes', () => {
    expect(cellarProcessorProgress('press', 10n, 10n + PRESS_CYCLE_TICKS / 2n)).toBeCloseTo(0.5);
    expect(cellarProcessorRemainingTicks('press', 10n, 10n + PRESS_CYCLE_TICKS / 2n))
      .toBe(PRESS_CYCLE_TICKS / 2n);
    expect(cellarProcessorProgress('fermentation', 10n, 10n + FERMENTATION_CYCLE_TICKS * 2n)).toBe(1);
  });

  it('accepts only valid inputs and extraction-only outputs', () => {
    expect(cellarProcessorMutationIsValid('press', [null, null, null], [
      { itemKind: 'pear', quantity: 1 }, null, null,
    ])).toBe(true);
    expect(cellarProcessorMutationIsValid('press', [null, null, null], [
      { itemKind: 'stone', quantity: 1 }, null, null,
    ])).toBe(false);
    expect(cellarProcessorMutationIsValid('press', [null, null, null], [
      null, { itemKind: 'must', quantity: 1 }, null,
    ])).toBe(false);
    expect(cellarProcessorMutationIsValid('fermentation', [
      { itemKind: 'must', quantity: 3 }, { itemKind: 'bottles', quantity: 2 },
    ], [
      { itemKind: 'must', quantity: 3 }, { itemKind: 'bottles', quantity: 1 },
    ])).toBe(true);
  });
});
