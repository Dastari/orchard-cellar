import { describe, expect, it } from 'vitest';
import { boundedStepperValue } from './bounded-stepper.js';

describe('bounded stepper controls', () => {
  it('moves one for an unmodified click', () => {
    expect(boundedStepperValue(12, 1, 0, 25)).toBe(13);
    expect(boundedStepperValue(12, -1, 0, 25)).toBe(11);
  });

  it('moves ten for a Shift-click and clamps at either limit', () => {
    expect(boundedStepperValue(12, 1, 0, 25, { shift: true })).toBe(22);
    expect(boundedStepperValue(12, -1, 0, 25, { shift: true })).toBe(2);
    expect(boundedStepperValue(22, 1, 0, 25, { shift: true })).toBe(25);
    expect(boundedStepperValue(2, -1, 0, 25, { shift: true })).toBe(0);
  });

  it('moves directly to the relevant limit for a Control-click', () => {
    expect(boundedStepperValue(12, 1, 0, 25, { control: true })).toBe(25);
    expect(boundedStepperValue(12, -1, 0, 25, { control: true })).toBe(0);
    expect(boundedStepperValue(12, 1, 0, 25, { shift: true, control: true })).toBe(25);
  });
});
