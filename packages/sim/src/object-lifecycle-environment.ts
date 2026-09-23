import { AUTHORITY_TICKS_PER_DAY, DAYS_PER_SEASON, calendarAtTick, dayProgressAtClockTime } from './time.js';
import { rainForWeatherMode, type WeatherMode } from './weather.js';
import type { GrowthEnvironment } from './content/stateful-components.js';
export interface ObjectEnvironmentEpoch {
  readonly atTick: bigint;
  readonly calendarOffset: bigint;
  readonly weatherMode: WeatherMode;
}
export interface ObjectEnvironmentInterval {
  readonly throughTick: bigint;
  readonly environment: GrowthEnvironment;
}
const DAY = BigInt(AUTHORITY_TICKS_PER_DAY);
const YEAR = DAY * BigInt(DAYS_PER_SEASON * 4);
const WEATHER_BOUNDARIES = [0, 9 * 60, 9 * 60 + 36, 10 * 60 + 24, 14 * 60 + 24, 15 * 60 + 36, 17 * 60]
  .flatMap(minutes => {
    const tick = BigInt(Math.round(dayProgressAtClockTime(Math.floor(minutes / 60), minutes % 60) * AUTHORITY_TICKS_PER_DAY));
    return [tick, tick + 1n];
  }).sort((a, b) => a < b ? -1 : a > b ? 1 : 0);

/** Bounded historical intervals. The authority persists throughTick and resumes
 * long offline catch-up in later per-object transactions. Weather is sampled at
 * the completed growth sweep, matching the kernel's discrete growth contract. */
export function objectEnvironmentIntervals(
  epochs: readonly ObjectEnvironmentEpoch[], from: bigint, through: bigint,
  local: GrowthEnvironment = {}, limit = 512,
): readonly ObjectEnvironmentInterval[] {
  if (through <= from) return [];
  if (epochs.length === 0) throw new Error('object_environment_history_missing');
  const ordered = [...epochs].sort((a, b) => a.atTick < b.atTick ? -1 : a.atTick > b.atTick ? 1 : 0);
  let cursor = from;
  const result: ObjectEnvironmentInterval[] = [];
  while (cursor < through && result.length < limit) {
    const sampleTick = cursor + 1n;
    const epoch = [...ordered].reverse().find(row => row.atTick <= sampleTick);
    if (epoch === undefined) throw new Error('object_environment_history_missing');
    const calendar = sampleTick + epoch.calendarOffset;
    const safeCalendar = calendar < 0n ? 0n : calendar;
    const dayStart = safeCalendar / DAY * DAY;
    const boundary = WEATHER_BOUNDARIES.map(tick => dayStart + tick).find(tick => tick > safeCalendar) ?? dayStart + DAY;
    const nextEpoch = ordered.find(row => row.atTick > sampleTick)?.atTick ?? through + 1n;
    const weatherEnd = sampleTick + (boundary - safeCalendar);
    const end = [through, nextEpoch - 1n, weatherEnd - 1n].reduce((a, b) => a < b ? a : b);
    result.push({ throughTick: end, environment: { ...local,
      season: calendarAtTick(Number(safeCalendar % YEAR)).season,
      raining: rainForWeatherMode(epoch.weatherMode, safeCalendar) } });
    cursor = end;
  }
  return result;
}
