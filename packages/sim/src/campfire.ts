import { authorityDayIndex, authorityDayProgress, dayProgressAtClockTime } from './time.js';

export const MARLOW_CAMPFIRE_ID = 3_000_000_004n;
export const MARLOW_CAMPFIRE_LIGHT_BASE_HOUR = 18;
export const MARLOW_CAMPFIRE_LIGHT_BASE_MINUTE = 30;
export const MARLOW_CAMPFIRE_EXTINGUISH_BASE_HOUR = 6;
export const MARLOW_CAMPFIRE_EXTINGUISH_BASE_MINUTE = 30;
export const MARLOW_CAMPFIRE_SCHEDULE_JITTER_MINUTES = 24;

export interface DailyCampfireSchedule {
  readonly lightMinute: number;
  readonly extinguishMinute: number;
}

function scheduleJitter(day: bigint, salt: bigint): number {
  let value = (day + 1n) * 1_103_515_245n + salt * 12_345n;
  value ^= value >> 16n;
  const width = MARLOW_CAMPFIRE_SCHEDULE_JITTER_MINUTES * 2 + 1;
  return Number((value & 0x7fff_ffffn) % BigInt(width)) - MARLOW_CAMPFIRE_SCHEDULE_JITTER_MINUTES;
}

/** Marlow follows recognizable dusk/dawn habits without acting at the exact
 * same minute every day. The result is derived only from the game-day index. */
export function marlowCampfireSchedule(day: bigint): DailyCampfireSchedule {
  return {
    lightMinute: MARLOW_CAMPFIRE_LIGHT_BASE_HOUR * 60
      + MARLOW_CAMPFIRE_LIGHT_BASE_MINUTE + scheduleJitter(day, 0x4d41n),
    extinguishMinute: MARLOW_CAMPFIRE_EXTINGUISH_BASE_HOUR * 60
      + MARLOW_CAMPFIRE_EXTINGUISH_BASE_MINUTE + scheduleJitter(day, 0x524cn),
  };
}

/** The named game day starts at 06:00, so dawn belongs to the beginning of a
 * day and dusk to its middle. A fire remains lit across the day boundary. */
export function marlowCampfireShouldBeLit(calendarTick: bigint): boolean {
  const day = authorityDayIndex(calendarTick);
  const schedule = marlowCampfireSchedule(day);
  const progress = authorityDayProgress(calendarTick);
  const extinguishHour = Math.floor(schedule.extinguishMinute / 60);
  const extinguishMinute = schedule.extinguishMinute % 60;
  const lightHour = Math.floor(schedule.lightMinute / 60);
  const lightMinute = schedule.lightMinute % 60;
  return progress < dayProgressAtClockTime(extinguishHour, extinguishMinute)
    || progress >= dayProgressAtClockTime(lightHour, lightMinute);
}
