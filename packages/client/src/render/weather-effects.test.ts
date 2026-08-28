import { describe, expect, it } from 'vitest';
import { CLOUD_VISUAL_SCALES, CloudDriftIntegrator, cloudVariantIndex, cloudVisualScale, treeSwayOffset, weatherCellNoise, weatherLoopPhase, windDirectionLabel, windLeafEmission, windLeafOpacity } from './weather-effects.js';

describe('deterministic weather effects', () => {
  it('keeps world-cell placement stable and distinct', () => {
    expect(weatherCellNoise(12, -4, 7)).toBe(weatherCellNoise(12, -4, 7));
    expect(weatherCellNoise(12, -4, 7)).not.toBe(weatherCellNoise(13, -4, 7));
    expect(weatherCellNoise(12, -4, 7)).toBeGreaterThanOrEqual(0);
    expect(weatherCellNoise(12, -4, 7)).toBeLessThan(1);
  });

  it('gives clouds several deterministic larger sizes and authored shapes', () => {
    expect([0, 0.3, 0.6, 0.9].map(cloudVisualScale)).toEqual(CLOUD_VISUAL_SCALES);
    const scales = new Set(Array.from({ length: 100 }, (_, cellX) => (
      cloudVisualScale(weatherCellNoise(cellX, 7, 0x53495a45))
    )));
    expect(scales).toEqual(new Set(CLOUD_VISUAL_SCALES));
    const variants = new Set(Array.from({ length: 100 }, (_, cellX) => cloudVariantIndex(cellX, 7, 4)));
    expect(variants).toEqual(new Set([0, 1, 2, 3]));
  });

  it('changes cloud direction without reapplying it to total server uptime', () => {
    const drift = new CloudDriftIntegrator();
    const initial = drift.advance(100, 10, 1, 0);
    expect(initial[0]).toBe(100 / 20 * 10);
    expect(drift.advance(100, 10, -1, 0)).toEqual(initial);
    const west = drift.advance(101, 10, -1, 0);
    expect(west[0]).toBe(initial[0] - 10 / 20);
    expect(west[1]).toBe(0);
    expect(drift.advance(10_000, 10, 1, 0)).toEqual(west);
  });

  it('loops animated gusts smoothly for positive and negative clock offsets', () => {
    expect(weatherLoopPhase(0, 4, 0)).toBe(0);
    expect(weatherLoopPhase(1, 4, 0)).toBe(0.25);
    expect(weatherLoopPhase(5, 4, 0)).toBe(0.25);
    expect(weatherLoopPhase(-1, 4, 0)).toBe(0.75);
  });

  it('fades tree leaves out instead of popping at the lifetime boundary', () => {
    expect(windLeafOpacity(0)).toBe(0);
    expect(windLeafOpacity(0.08)).toBe(1);
    expect(windLeafOpacity(0.62)).toBe(1);
    expect(windLeafOpacity(0.8)).toBeGreaterThan(0);
    expect(windLeafOpacity(0.8)).toBeLessThan(1);
    expect(windLeafOpacity(1)).toBe(0);
  });

  it('scales sparse translucent leaf emission with meaningful wind strength', () => {
    const light = windLeafEmission(0.35);
    const strong = windLeafEmission(1);
    expect(strong.probability).toBeGreaterThan(light.probability);
    expect(strong.interval).toBeLessThan(light.interval);
    expect(strong.maximumAlpha).toBeLessThan(0.7);
    expect(light.maximumAlpha).toBeLessThan(strong.maximumAlpha);
  });

  it('sways trees along the shared wind vector only in meaningful wind', () => {
    const calm = { raining: false, cloudShadow: 0, wind: 0.2, windDirectionX: 1, windDirectionY: 0 };
    expect(treeSwayOffset(calm, 50, 3)).toEqual([0, 0]);
    const windy = { ...calm, wind: 1 };
    const offsets = Array.from({ length: 20 }, (_, tick) => treeSwayOffset(windy, tick * 5, 3));
    expect(offsets.some(([x]) => x !== 0)).toBe(true);
    expect(offsets.every(([, y]) => y === 0)).toBe(true);
  });

  it('labels top-down wind vectors with compass directions', () => {
    expect(windDirectionLabel(1, 0)).toBe('E');
    expect(windDirectionLabel(-0.8, -0.4)).toBe('NW');
    expect(windDirectionLabel(0.8, 0.4)).toBe('SE');
  });

  it('can reset cloud integration without replaying hidden-tab drift', () => {
    const drift = new CloudDriftIntegrator();
    expect(drift.advance(100, 10, 1, 0)[0]).toBeGreaterThan(0);
    drift.reset();
    expect(drift.advance(200, 10, -1, 0)[0]).toBeLessThan(0);
  });
});
