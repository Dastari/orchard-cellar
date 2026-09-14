import { bootstrapDefinitionsOfKind } from './content/bootstrap-pack-loader.js';
import { authorityDayIndex, authorityDayProgress, dayProgressAtClockTime } from './time.js';
import type { LandmarkAutomationDefinition } from './content/world-definition.js';

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

function scheduleJitter(day: bigint, salt: bigint, jitterMinutes: number): number {
  let value = (day + 1n) * 1_103_515_245n + salt * 12_345n;
  value ^= value >> 16n;
  const width = jitterMinutes * 2 + 1;
  return Number((value & 0x7fff_ffffn) % BigInt(width)) - jitterMinutes;
}

export function authoredCampfireSchedule(
  day: bigint,
  automation: LandmarkAutomationDefinition,
): DailyCampfireSchedule {
  return {
    lightMinute: automation.lightMinute
      + scheduleJitter(day, BigInt(automation.lightSalt), automation.jitterMinutes),
    extinguishMinute: automation.extinguishMinute
      + scheduleJitter(day, BigInt(automation.extinguishSalt), automation.jitterMinutes),
  };
}

export function authoredCampfireShouldBeLit(
  calendarTick: bigint,
  automation: LandmarkAutomationDefinition,
): boolean {
  const schedule = authoredCampfireSchedule(authorityDayIndex(calendarTick), automation);
  const progress = authorityDayProgress(calendarTick);
  return progress < dayProgressAtClockTime(
    Math.floor(schedule.extinguishMinute / 60), schedule.extinguishMinute % 60,
  ) || progress >= dayProgressAtClockTime(
    Math.floor(schedule.lightMinute / 60), schedule.lightMinute % 60,
  );
}

function bootstrapMarlowAutomation(): LandmarkAutomationDefinition {
  for (const space of bootstrapDefinitionsOfKind('space')) {
    for (const landmark of space.landmarks ?? []) {
      for (const rule of landmark.decorations) {
        if (rule.kind === 'point' && rule.placeable?.automation !== undefined) {
          return rule.placeable.automation;
        }
      }
    }
  }
  throw new Error('bootstrap_campfire_automation_missing');
}

/** Marlow follows recognizable dusk/dawn habits without acting at the exact
 * same minute every day. The result is derived only from the game-day index. */
export function marlowCampfireSchedule(day: bigint): DailyCampfireSchedule {
  return authoredCampfireSchedule(day, bootstrapMarlowAutomation());
}

/** The named game day starts at 06:00, so dawn belongs to the beginning of a
 * day and dusk to its middle. A fire remains lit across the day boundary. */
export function marlowCampfireShouldBeLit(calendarTick: bigint): boolean {
  return authoredCampfireShouldBeLit(calendarTick, bootstrapMarlowAutomation());
}
