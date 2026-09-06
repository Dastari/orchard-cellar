import { AUTHORITY_TICKS_PER_DAY } from '@orchard/sim';
import { describe, expect, it } from 'vitest';
import { celestialLightingAtCalendar, celestialLightingAtTick, seasonalLightingAtDay } from './celestial-lighting.js';

const evaluate = (clockHours: number, continuousDay = 3.5, lunarProgress = 0, lunarIllumination = 1, cloudCover = 0) =>
  celestialLightingAtCalendar({ clockHours, continuousDay, lunarProgress, lunarIllumination, cloudCover });

describe('seasonal celestial illumination', () => {
  it.each([[3.5, 6, 18, 50], [10.5, 5, 21, 75], [17.5, 6, 18, 50], [24.5, 8, 16, 25]])('matches the season midpoint at day %s', (day, sunrise, sunset, sunAltitude) => {
    expect(seasonalLightingAtDay(day)).toMatchObject({ sunrise, sunset, sunAltitude });
  });
  it('has continuous wrap and named-day boundaries', () => {
    expect(seasonalLightingAtDay(28)).toEqual(seasonalLightingAtDay(0));
    for (const day of [0, 7, 14, 21, 28]) expect(Math.abs(seasonalLightingAtDay(day - 1e-6).sunrise - seasonalLightingAtDay(day + 1e-6).sunrise)).toBeLessThan(1e-5);
    const day = BigInt(AUTHORITY_TICKS_PER_DAY);
    expect(Math.abs(celestialLightingAtTick(day - 1n, 0, 1).sun.altitude - celestialLightingAtTick(day).sun.altitude)).toBeLessThan(1e-8);
  });
  it('moves east to south to west and emits no sunlight below the horizon', () => {
    expect(evaluate(8).sun.direction[0]).toBeGreaterThan(0);
    expect(evaluate(12).sun.direction[0]).toBeCloseTo(0);
    expect(evaluate(12).sun.direction[1]).toBeGreaterThan(0);
    expect(evaluate(16).sun.direction[0]).toBeLessThan(0);
    expect(evaluate(5).sun.intensity).toBe(0);
    expect(evaluate(18).sun.intensity).toBe(0);
    expect(Math.hypot(...evaluate(10).sun.direction)).toBeCloseTo(1);
    expect(evaluate(12).combined).toEqual({ r: 255, g: 255, b: 255 });
  });
  it('makes full-moon light visibly stronger than diffuse, blue, moving, and altitude dependent', () => {
    const night = evaluate(0);
    expect(night.moon.intensity).toBeGreaterThan(0);
    expect(night.moon.illumination.b).toBeGreaterThan(night.moon.illumination.r);
    expect(night.moon.illumination.r - night.diffuse.r).toBeGreaterThan(20);
    expect(night.moon.illumination.b - night.diffuse.b).toBeGreaterThan(50);
    expect(night.diffuse.b).toBeGreaterThan(night.diffuse.r * 2);
    expect(evaluate(20).moon.direction[0]).toBeGreaterThan(0);
    expect(evaluate(4).moon.direction[0]).toBeLessThan(0);
    expect(night.moon.altitude).toBeGreaterThan(evaluate(20).moon.altitude);
    expect(evaluate(12).moon.intensity).toBe(0);
  });
  it('keeps new moon dark and phases independent of seasons and clock jumps', () => {
    expect(evaluate(0, 3.5, 0.5, 0).combined).toEqual({ r: 20, g: 20, b: 32 });
    const cycle = BigInt(AUTHORITY_TICKS_PER_DAY * 29.5);
    expect(celestialLightingAtTick(cycle).lunarIllumination).toBe(1);
    expect(celestialLightingAtTick(BigInt(AUTHORITY_TICKS_PER_DAY * 28)).lunarIllumination).not.toBe(1);
    const hugeTick = 1234567890123456789n;
    expect(celestialLightingAtTick(hugeTick)).toEqual(celestialLightingAtTick(hugeTick));
    expect(celestialLightingAtTick(-1n)).toEqual(celestialLightingAtTick(0n));
  });
  it('attenuates weather once while retaining the night floor and warm low sun', () => {
    const clear = evaluate(12), overcast = evaluate(12, 3.5, 0, 1, 1);
    expect(overcast.sun.intensity).toBeCloseTo(clear.sun.intensity * 0.25);
    expect(evaluate(6.5).sun.color.r).toBeGreaterThan(evaluate(6.5).sun.color.b);
    expect(evaluate(0, 3.5, 0.5, 0, 1).combined).toEqual({ r: 20, g: 20, b: 32 });
  });
});
