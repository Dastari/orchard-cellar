import { SIM_TICKS_PER_SECOND } from './state.js';
import { SIM_STEPS_PER_AUTHORITY_TICK } from './net-timing.js';

export const REAL_MINUTES_PER_GAME_DAY = 15;
export const TICKS_PER_DAY = SIM_TICKS_PER_SECOND * 60 * REAL_MINUTES_PER_GAME_DAY;
export const AUTHORITY_TICKS_PER_DAY = TICKS_PER_DAY / SIM_STEPS_PER_AUTHORITY_TICK;
export const DAYS_PER_SEASON = 7;
export const SEASONS = ['spring', 'summer', 'autumn', 'winter'] as const;
export type Season = (typeof SEASONS)[number];

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

export function calendarAtTick(tick: number): CalendarTime {
  const safeTick = Math.max(0, Math.floor(tick));
  const totalDay = Math.floor(safeTick / TICKS_PER_DAY);
  const tickOfDay = safeTick % TICKS_PER_DAY;
  const dayProgress = tickOfDay / TICKS_PER_DAY;
  const gameMinutes = Math.floor(dayProgress * 20 * 60);
  const seasonIndex = Math.floor(totalDay / DAYS_PER_SEASON) % SEASONS.length;
  return {
    totalDay,
    year: Math.floor(totalDay / (DAYS_PER_SEASON * SEASONS.length)) + 1,
    season: SEASONS[seasonIndex] ?? 'spring',
    dayOfSeason: (totalDay % DAYS_PER_SEASON) + 1,
    tickOfDay,
    dayProgress,
    hour: 6 + Math.floor(gameMinutes / 60),
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

export function simTickOfDayAtAuthorityTick(authorityTick: bigint): number {
  const authorityTickOfDay = authorityTick % BigInt(AUTHORITY_TICKS_PER_DAY);
  return Number(authorityTickOfDay) * SIM_STEPS_PER_AUTHORITY_TICK;
}
