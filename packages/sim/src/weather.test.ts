import { describe, expect, it } from 'vitest';
import { AUTHORITY_TICKS_PER_DAY } from './time.js';
import { isWeatherMode, isWindDirectionMode, nextWeatherMode, nextWindDirectionMode, rainForWeatherMode, weatherVisualState, windVectorAtTick } from './weather.js';

describe('shared server weather', () => {
  it('validates and cycles all persisted modes', () => {
    expect(isWeatherMode('auto')).toBe(true);
    expect(isWeatherMode('storm')).toBe(false);
    expect(nextWeatherMode('auto')).toBe('rain');
    expect(nextWeatherMode('rain')).toBe('clear');
    expect(nextWeatherMode('clear')).toBe('cloudy');
    expect(nextWeatherMode('cloudy')).toBe('wind');
    expect(nextWeatherMode('wind')).toBe('auto');
  });

  it('resolves forced weather before the deterministic automatic schedule', () => {
    const scheduledRain = BigInt(AUTHORITY_TICKS_PER_DAY) + BigInt(Math.round(AUTHORITY_TICKS_PER_DAY * 0.25));
    expect(rainForWeatherMode('auto', scheduledRain)).toBe(true);
    expect(rainForWeatherMode('clear', scheduledRain)).toBe(false);
    expect(rainForWeatherMode('rain', 0n)).toBe(true);
  });

  it('maps forced modes to integrated rain, shadow, and wind visuals', () => {
    const midday = BigInt(Math.round(AUTHORITY_TICKS_PER_DAY * 0.4));
    expect(weatherVisualState('clear', midday)).toMatchObject({ raining: false, cloudShadow: 0, wind: 0.05 });
    expect(weatherVisualState('cloudy', midday)).toMatchObject({ raining: false, cloudShadow: 0.78, wind: 0.22 });
    expect(weatherVisualState('wind', midday)).toMatchObject({ raining: false, cloudShadow: 0.42, wind: 1 });
    expect(weatherVisualState('rain', 0n)).toMatchObject({ raining: true, cloudShadow: 0.9, wind: 0.58 });
  });

  it('keeps one normalized wind direction per day and changes it over time', () => {
    const first = windVectorAtTick(0n);
    const sameDay = windVectorAtTick(BigInt(AUTHORITY_TICKS_PER_DAY - 1));
    const nextDay = windVectorAtTick(BigInt(AUTHORITY_TICKS_PER_DAY));
    expect(sameDay).toEqual(first);
    expect(nextDay).not.toEqual(first);
    expect(Math.hypot(...first)).toBeCloseTo(1, 2);
    expect(weatherVisualState('wind', 0n)).toMatchObject({
      windDirectionX: first[0],
      windDirectionY: first[1],
    });
  });

  it('validates, cycles, and applies owner wind direction overrides', () => {
    expect(isWindDirectionMode('auto')).toBe(true);
    expect(isWindDirectionMode('sideways')).toBe(false);
    expect(nextWindDirectionMode('auto')).toBe('n');
    expect(nextWindDirectionMode('n')).toBe('ne');
    expect(nextWindDirectionMode('nw')).toBe('auto');
    expect(weatherVisualState('wind', 0n, 'sw')).toMatchObject({
      windDirectionX: -Math.SQRT1_2,
      windDirectionY: Math.SQRT1_2,
    });
  });

  it('shows non-rain cloud shadows only while the sun can cast them', () => {
    const midday = BigInt(Math.round(AUTHORITY_TICKS_PER_DAY * 0.4));
    const night = BigInt(Math.round(AUTHORITY_TICKS_PER_DAY * 0.9));
    expect(weatherVisualState('cloudy', midday).cloudShadow).toBe(0.78);
    expect(weatherVisualState('cloudy', night).cloudShadow).toBe(0);
    expect(weatherVisualState('wind', night).wind).toBe(1);
    expect(weatherVisualState('rain', night).cloudShadow).toBe(0.9);
  });

  it('uses restrained season-aware automatic weather instead of forced wind', () => {
    const midday = BigInt(Math.round(AUTHORITY_TICKS_PER_DAY * 0.4));
    const summer = weatherVisualState('auto', BigInt(AUTHORITY_TICKS_PER_DAY) * 9n + midday);
    const autumn = weatherVisualState('auto', BigInt(AUTHORITY_TICKS_PER_DAY) * 16n + midday);
    expect(autumn.wind).toBeGreaterThan(summer.wind);
    expect(autumn.cloudShadow).toBeGreaterThan(summer.cloudShadow);
    expect(autumn.raining).toBe(false);
    for (let day = 0; day < 28; day += 1) {
      for (let hour = 0; hour < 24; hour += 1) {
        const tick = BigInt(day * AUTHORITY_TICKS_PER_DAY
          + Math.floor(hour / 24 * AUTHORITY_TICKS_PER_DAY));
        expect(weatherVisualState('auto', tick).wind).toBeLessThanOrEqual(0.42);
      }
    }
  });
});
