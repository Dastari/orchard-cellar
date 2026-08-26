import { AUTHORITY_TICKS_PER_DAY } from '@orchard/sim';
import { describe, expect, it, vi } from 'vitest';
import {
  animationFrameForProgress,
  ParticlePool,
  RAIN_REFERENCE_WORLD_ZOOM,
  RAIN_VISUAL_SCALE,
  RAIN_STREAK_VELOCITY,
  RainWeather,
  rainMotionScale,
  rainStreakTarget,
  rainVisualScale,
  rainActiveAtTick,
  screenParticleScale,
  weatherCameraOffset,
} from './particles.js';

describe('pooled weather particles', () => {
  it('reuses a bounded pool and expires particles without growing it', () => {
    const pool = new ParticlePool(2);
    expect(pool.spawn({ space: 'screen', x: 0, y: 0, velocityX: 1, velocityY: 1, lifetime: 0.1 })).toBe(0);
    expect(pool.spawn({ space: 'world', x: 0, y: 0, velocityX: 1, velocityY: 1, lifetime: 1 })).toBe(1);
    expect(pool.spawn({ space: 'world', x: 0, y: 0, velocityX: 0, velocityY: 0, lifetime: 1 })).toBe(-1);
    pool.update(0.2);
    expect(pool.activeCount).toBe(1);
    expect(pool.spawn({ space: 'screen', x: 0, y: 0, velocityX: 0, velocityY: 0, lifetime: 1 })).toBe(0);
  });

  it('stops a drop exactly at its impact endpoint even when the update overshoots', () => {
    const pool = new ParticlePool(1);
    let impactY = -1;
    pool.spawnValues('screen', 0, 0, 0, 100, 0.05);
    pool.update(0.1, (_space, _x, y) => { impactY = y; });
    expect(impactY).toBe(5);
    expect(pool.activeCount).toBe(0);
  });

  it('translates active weather opposite to camera travel', () => {
    const pool = new ParticlePool(1);
    let impact: readonly [number, number] | null = null;
    pool.spawnValues('screen', 10, 20, 0, 0, 0.1);
    pool.translate(-4, 3);
    pool.update(0.2, (_space, x, y) => { impact = [x, y]; });
    expect(impact).toEqual([6, 23]);
    expect(weatherCameraOffset(100, 200, 104, 194, 2)).toEqual([-8, 12]);
  });

  it('draws particles only inside their ground-impact depth range', () => {
    const pool = new ParticlePool(2);
    pool.spawnValues('screen', 10, 2, 0, 1, 1, 'rain_streak', 10);
    pool.spawnValues('screen', 20, 4, 0, 1, 1, 'rain_streak', 30);
    const fillRect = vi.fn();
    const context = { fillStyle: '', fillRect } as unknown as CanvasRenderingContext2D;
    expect(pool.draw(context, 0, 0, 1, '#fff', 1, 1, null, null, 0, 20)).toBe(1);
    expect(fillRect).toHaveBeenCalledTimes(1);
  });

  it('schedules deterministic rain windows', () => {
    expect(rainActiveAtTick(0n)).toBe(false);
    expect(rainActiveAtTick(BigInt(AUTHORITY_TICKS_PER_DAY) + BigInt(Math.floor(AUTHORITY_TICKS_PER_DAY * 0.2)))).toBe(true);
    expect(rainActiveAtTick(BigInt(AUTHORITY_TICKS_PER_DAY) * 2n)).toBe(false);
  });

  it('uses the full authored splash range without wrapping', () => {
    expect(animationFrameForProgress(7, 0)).toBe(0);
    expect(animationFrameForProgress(7, 0.5)).toBe(3);
    expect(animationFrameForProgress(7, 0.999)).toBe(6);
    expect(animationFrameForProgress(7, 1)).toBe(6);
  });

  it('keeps screen particle positions invariant across world zoom', () => {
    const screenX = 240;
    for (const [worldScale, worldZoom] of [[2, 1], [4, 2], [7, 3.5]] as const) {
      const sourceX = screenX * screenParticleScale(worldScale, worldZoom);
      expect(sourceX * worldZoom / worldScale).toBe(screenX);
    }
  });

  it('scales rain visuals with world zoom around the default view', () => {
    for (const [worldScale, worldZoom] of [[1, 1], [3, 2], [7, 4]] as const) {
      const finalVisualScale = rainVisualScale(worldScale) * worldZoom / worldScale;
      expect(finalVisualScale).toBeCloseTo(RAIN_VISUAL_SCALE * worldZoom / RAIN_REFERENCE_WORLD_ZOOM);
    }
  });

  it('keeps close-zoom rain speed and apparent density proportional to terrain', () => {
    expect(rainMotionScale(1)).toBe(0.5);
    expect(rainMotionScale(2)).toBe(1);
    expect(rainMotionScale(4)).toBe(2);
    expect(rainStreakTarget(1)).toBe(200);
    expect(rainStreakTarget(2)).toBe(200);
    expect(rainStreakTarget(4)).toBe(50);
    expect(rainStreakTarget(8)).toBe(24);
  });

  it('keeps pooled streaks and ground splashes active together', () => {
    const rain = new RainWeather();
    for (let frame = 0; frame < 60; frame += 1) rain.update(true, 320, 180);
    expect(rain.activeCount).toBeGreaterThanOrEqual(200);
    expect(rain.splashCount).toBeGreaterThan(0);
    rain.update(false, 320, 180);
    expect(rain.enabled).toBe(false);
  });

  it('keeps tool splashes alive and drawable without rainy weather', () => {
    const rain = new RainWeather();
    rain.spawnWorldSplash(40, 56);
    expect(rain.enabled).toBe(false);
    expect(rain.splashCount).toBe(1);
    rain.update(false, 320, 180);
    expect(rain.splashCount).toBe(1);
  });

  it('moves the pack slash-shaped drop diagonally down-left', () => {
    expect(RAIN_STREAK_VELOCITY[0]).toBeLessThan(0);
    expect(RAIN_STREAK_VELOCITY[1]).toBeGreaterThan(0);
    expect(Math.abs(RAIN_STREAK_VELOCITY[0]) / RAIN_STREAK_VELOCITY[1]).toBeGreaterThanOrEqual(0.5);
    expect(RAIN_VISUAL_SCALE).toBe(1.5);
  });
});
