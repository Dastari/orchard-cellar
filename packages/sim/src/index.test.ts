import { describe, expect, it } from 'vitest';
import { SIM_TICKS_PER_SECOND } from './index.js';

describe('simulation clock', () => {
  it('runs at the binding 60 Hz rate', () => {
    expect(SIM_TICKS_PER_SECOND).toBe(60);
  });
});

