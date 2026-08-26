import { describe, expect, it } from 'vitest';
import {
  AUTHORITY_TICKS_PER_DAY,
  LUNAR_CYCLE_DAYS_DENOMINATOR,
  LUNAR_CYCLE_DAYS_NUMERATOR,
  LUNAR_ILLUMINATION_ANCHORS,
  MOON_PHASES,
  lunarCycleProgressAtAuthorityTick,
  lunarIlluminationAtAuthorityTick,
  lunarPhaseAtAuthorityTick,
} from './time.js';

const cycleTicks = BigInt(AUTHORITY_TICKS_PER_DAY * LUNAR_CYCLE_DAYS_NUMERATOR)
  / BigInt(LUNAR_CYCLE_DAYS_DENOMINATOR);

describe('27§7 lunar calendar', () => {
  it('pins all eight phase centers and illumination anchors', () => {
    for (let index = 0; index < MOON_PHASES.length; index += 1) {
      const tick = cycleTicks * BigInt(index) / BigInt(MOON_PHASES.length);
      expect(lunarPhaseAtAuthorityTick(tick)).toBe(MOON_PHASES[index]);
      expect(lunarIlluminationAtAuthorityTick(tick)).toBe(LUNAR_ILLUMINATION_ANCHORS[index]);
    }
  });

  it('wraps Full Moon across the cycle boundary', () => {
    expect(lunarPhaseAtAuthorityTick(0n)).toBe('full_moon');
    expect(lunarPhaseAtAuthorityTick(cycleTicks - 1n)).toBe('full_moon');
    expect(lunarPhaseAtAuthorityTick(cycleTicks)).toBe('full_moon');
    expect(lunarCycleProgressAtAuthorityTick(cycleTicks)).toBe(0);
    expect(lunarIlluminationAtAuthorityTick(cycleTicks)).toBe(1000);
  });

  it('does not reset at the 28-day seasonal year', () => {
    const yearTwo = BigInt(AUTHORITY_TICKS_PER_DAY * 28);
    expect(lunarCycleProgressAtAuthorityTick(yearTwo)).toBeCloseTo(56 / 59, 10);
    expect(lunarCycleProgressAtAuthorityTick(yearTwo)).not.toBe(0);
    expect(lunarCycleProgressAtAuthorityTick(BigInt(AUTHORITY_TICKS_PER_DAY * 59))).toBe(0);
  });

  it('interpolates symmetrically between phase centers using integers', () => {
    const waxingMidpoint = cycleTicks * 9n / 16n;
    const waningMidpoint = cycleTicks * 7n / 16n;
    expect(lunarIlluminationAtAuthorityTick(waxingMidpoint)).toBe(73);
    expect(lunarIlluminationAtAuthorityTick(waningMidpoint)).toBe(73);
  });
});
