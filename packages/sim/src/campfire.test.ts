import { describe, expect, it } from 'vitest';
import { AUTHORITY_TICKS_PER_DAY, dayProgressAtClockTime } from './time.js';
import {
  MARLOW_CAMPFIRE_SCHEDULE_JITTER_MINUTES,
  marlowCampfireSchedule,
  marlowCampfireShouldBeLit,
} from './campfire.js';

function tickAt(day: bigint, hour: number, minute = 0): bigint {
  return day * BigInt(AUTHORITY_TICKS_PER_DAY)
    + BigInt(Math.floor(dayProgressAtClockTime(hour, minute) * AUTHORITY_TICKS_PER_DAY));
}

describe('Marlow campfire schedule', () => {
  it('is deterministic but varies slightly between days', () => {
    expect(marlowCampfireSchedule(7n)).toEqual(marlowCampfireSchedule(7n));
    expect(marlowCampfireSchedule(7n)).not.toEqual(marlowCampfireSchedule(8n));
    for (let day = 0n; day < 30n; day += 1n) {
      const schedule = marlowCampfireSchedule(day);
      expect(Math.abs(schedule.lightMinute - 18 * 60 - 30)).toBeLessThanOrEqual(MARLOW_CAMPFIRE_SCHEDULE_JITTER_MINUTES);
      expect(Math.abs(schedule.extinguishMinute - 6 * 60 - 30)).toBeLessThanOrEqual(MARLOW_CAMPFIRE_SCHEDULE_JITTER_MINUTES);
    }
  });

  it('keeps the fire off by day and lit through the night', () => {
    expect(marlowCampfireShouldBeLit(tickAt(3n, 12))).toBe(false);
    expect(marlowCampfireShouldBeLit(tickAt(3n, 20))).toBe(true);
    expect(marlowCampfireShouldBeLit(tickAt(3n, 2))).toBe(true);
  });
});
