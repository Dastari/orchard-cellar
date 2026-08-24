import { describe, expect, it } from 'vitest';
import {
  AUTHORITY_HZ,
  AUTHORITY_TICKS_PER_DAY,
  SIM_STEPS_PER_AUTHORITY_TICK,
  TICKS_PER_DAY,
  authorityDayIndex,
  authorityDayProgress,
  simTickOfDayAtAuthorityTick,
} from './index.js';

describe('shared authority timing', () => {
  it('derives authority integration and the 15 minute game day from named rates', () => {
    expect(AUTHORITY_HZ * SIM_STEPS_PER_AUTHORITY_TICK).toBe(60);
    expect(AUTHORITY_TICKS_PER_DAY * SIM_STEPS_PER_AUTHORITY_TICK).toBe(TICKS_PER_DAY);
    expect(AUTHORITY_TICKS_PER_DAY / AUTHORITY_HZ).toBe(15 * 60);
  });

  it('converts the authority clock once for lighting, weather, and the HUD', () => {
    const noon = BigInt(AUTHORITY_TICKS_PER_DAY / 2);
    expect(authorityDayProgress(noon)).toBe(0.5);
    expect(simTickOfDayAtAuthorityTick(noon)).toBe(TICKS_PER_DAY / 2);
    expect(authorityDayIndex(BigInt(AUTHORITY_TICKS_PER_DAY) * 3n)).toBe(3n);
  });
});
