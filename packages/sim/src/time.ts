import { SIM_TICKS_PER_SECOND } from './state.js';
import { SIM_STEPS_PER_AUTHORITY_TICK } from './net-timing.js';

export const REAL_MINUTES_PER_GAME_DAY = 15;
export const TICKS_PER_DAY = SIM_TICKS_PER_SECOND * 60 * REAL_MINUTES_PER_GAME_DAY;
export const AUTHORITY_TICKS_PER_DAY = TICKS_PER_DAY / SIM_STEPS_PER_AUTHORITY_TICK;
export const GAME_DAY_START_HOUR = 6;
export const GAME_HOURS_PER_DAY = 24;
export const DAYS_PER_SEASON = 7;
export const SEASONS = ['spring', 'summer', 'autumn', 'winter'] as const;
export type Season = (typeof SEASONS)[number];

export const LUNAR_CYCLE_DAYS_NUMERATOR = 59;
export const LUNAR_CYCLE_DAYS_DENOMINATOR = 2;
export const MOON_PHASES = [
  'full_moon',
  'waning_gibbous',
  'last_quarter',
  'waning_crescent',
  'new_moon',
  'waxing_crescent',
  'first_quarter',
  'waxing_gibbous',
] as const;
export type MoonPhase = (typeof MOON_PHASES)[number];

/** Illumination at each phase center, in per mille. Intermediate ticks use
 * fixed-point linear interpolation so two clients always agree exactly. */
export const LUNAR_ILLUMINATION_ANCHORS = [1000, 854, 500, 146, 0, 146, 500, 854] as const;

export interface CalendarTime {
  readonly totalDay: number;
  readonly year: number;
  readonly season: Season;
  readonly dayOfSeason: number;
  readonly tickOfDay: number;
  readonly dayProgress: number;
  readonly hour: number;
  readonly minute: number;
}

export function clockMinutesAtDayProgress(dayProgress: number): number {
  const normalized = ((dayProgress % 1) + 1) % 1;
  return (GAME_DAY_START_HOUR * 60 + Math.floor(normalized * GAME_HOURS_PER_DAY * 60 + 1e-9))
    % (GAME_HOURS_PER_DAY * 60);
}

/** Converts a wall-clock time to progress through the named game day, whose
 * boundary remains 06:00. Times before 06:00 therefore live at its far end. */
export function dayProgressAtClockTime(hour: number, minute = 0): number {
  const minutesPerDay = GAME_HOURS_PER_DAY * 60;
  const clockMinutes = Math.floor(hour * 60 + minute);
  const sinceDayStart = ((clockMinutes - GAME_DAY_START_HOUR * 60) % minutesPerDay + minutesPerDay)
    % minutesPerDay;
  return sinceDayStart / minutesPerDay;
}

export function calendarAtTick(tick: number): CalendarTime {
  const safeTick = Math.max(0, Math.floor(tick));
  const totalDay = Math.floor(safeTick / TICKS_PER_DAY);
  const tickOfDay = safeTick % TICKS_PER_DAY;
  const dayProgress = tickOfDay / TICKS_PER_DAY;
  const gameMinutes = clockMinutesAtDayProgress(dayProgress);
  const seasonIndex = Math.floor(totalDay / DAYS_PER_SEASON) % SEASONS.length;
  return {
    totalDay,
    year: Math.floor(totalDay / (DAYS_PER_SEASON * SEASONS.length)) + 1,
    season: SEASONS[seasonIndex] ?? 'spring',
    dayOfSeason: (totalDay % DAYS_PER_SEASON) + 1,
    tickOfDay,
    dayProgress,
    hour: Math.floor(gameMinutes / 60),
    minute: gameMinutes % 60,
  };
}

export function nextDayTick(tick: number): number {
  return (Math.floor(Math.max(0, tick) / TICKS_PER_DAY) + 1) * TICKS_PER_DAY;
}

export function authorityDayIndex(authorityTick: bigint): bigint {
  return authorityTick / BigInt(AUTHORITY_TICKS_PER_DAY);
}

export function authorityDayProgress(authorityTick: bigint): number {
  const tickOfDay = authorityTick % BigInt(AUTHORITY_TICKS_PER_DAY);
  return Number(tickOfDay) / AUTHORITY_TICKS_PER_DAY;
}

function positiveModulo(value: bigint, divisor: bigint): bigint {
  const remainder = value % divisor;
  return remainder < 0n ? remainder + divisor : remainder;
}

function lunarScaledTick(authorityTick: bigint): readonly [bigint, bigint] {
  const cycle = BigInt(AUTHORITY_TICKS_PER_DAY * LUNAR_CYCLE_DAYS_NUMERATOR);
  return [positiveModulo(authorityTick * BigInt(LUNAR_CYCLE_DAYS_DENOMINATOR), cycle), cycle];
}

export function lunarCycleProgressAtAuthorityTick(authorityTick: bigint): number {
  const [tick, cycle] = lunarScaledTick(authorityTick);
  return Number(tick) / Number(cycle);
}

export function lunarPhaseIndexAtAuthorityTick(authorityTick: bigint): number {
  const [tick, cycle] = lunarScaledTick(authorityTick);
  const nearestCenter = (tick * BigInt(MOON_PHASES.length) + cycle / 2n) / cycle;
  return Number(nearestCenter % BigInt(MOON_PHASES.length));
}

export function lunarPhaseAtAuthorityTick(authorityTick: bigint): MoonPhase {
  return MOON_PHASES[lunarPhaseIndexAtAuthorityTick(authorityTick)] ?? 'full_moon';
}

export function lunarIlluminationAtAuthorityTick(authorityTick: bigint): number {
  const [tick, cycle] = lunarScaledTick(authorityTick);
  const phasePosition = tick * BigInt(MOON_PHASES.length);
  const leftIndex = Number(phasePosition / cycle);
  const remainder = phasePosition % cycle;
  const rightIndex = (leftIndex + 1) % MOON_PHASES.length;
  const left = BigInt(LUNAR_ILLUMINATION_ANCHORS[leftIndex] ?? 1000);
  const right = BigInt(LUNAR_ILLUMINATION_ANCHORS[rightIndex] ?? 1000);
  const weighted = left * (cycle - remainder) + right * remainder;
  return Number((weighted + cycle / 2n) / cycle);
}

export function authorityTickAtDayProgress(authorityTick: bigint, progress: number): bigint {
  const ticksPerDay = BigInt(AUTHORITY_TICKS_PER_DAY);
  const day = authorityTick / ticksPerDay;
  const safeProgress = Math.max(0, Math.min(1, progress));
  const tickOfDay = BigInt(Math.min(
    AUTHORITY_TICKS_PER_DAY - 1,
    Math.round(safeProgress * (AUTHORITY_TICKS_PER_DAY - 1)),
  ));
  return day * ticksPerDay + tickOfDay;
}

export function shiftAuthorityDay(authorityTick: bigint, days: number): bigint {
  const ticksPerDay = BigInt(AUTHORITY_TICKS_PER_DAY);
  const shifted = authorityTick + BigInt(Math.trunc(days)) * ticksPerDay;
  return shifted < 0n ? authorityTick % ticksPerDay : shifted;
}

export function simTickOfDayAtAuthorityTick(authorityTick: bigint): number {
  const authorityTickOfDay = authorityTick % BigInt(AUTHORITY_TICKS_PER_DAY);
  return Number(authorityTickOfDay) * SIM_STEPS_PER_AUTHORITY_TICK;
}
