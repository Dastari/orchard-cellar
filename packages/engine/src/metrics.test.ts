import { describe, expect, it } from 'vitest';
import { FixedMetricSeries, RenderMetrics } from './metrics.js';

describe('fixed metric series', () => {
  it('wraps without corrupting percentiles', () => {
    const series = new FixedMetricSeries(4);
    for (const value of [100, 1, 2, 3, 4]) series.record(value);
    expect(series.snapshot()).toEqual({
      count: 4,
      latest: 4,
      mean: 2.5,
      p50: 2,
      p95: 4,
      p99: 4,
      maximum: 4,
    });
  });

  it('normalizes invalid and negative samples at the write boundary', () => {
    const series = new FixedMetricSeries(3);
    series.record(-2);
    series.record(Number.NaN);
    series.record(3);
    expect(series.snapshot()).toMatchObject({ count: 3, mean: 1, maximum: 3 });
  });
});

describe('render metrics', () => {
  it('reports distributions, render items, and reserved stages', () => {
    const metrics = new RenderMetrics();
    metrics.record(1, 10);
    metrics.record(3, 20);
    metrics.recordStage('ground', 0.75);
    const snapshot = metrics.snapshot();
    expect(snapshot).toMatchObject({
      schemaVersion: 2,
      averageFrameMs: 2,
      worstFrameMs: 3,
      renderItems: 20,
      sampleCount: 2,
    });
    expect(snapshot.stages.find((stage) => stage.id === 'ground')).toMatchObject({
      supported: true,
      count: 1,
      latest: 0.75,
    });
    expect(snapshot.stages.find((stage) => stage.id === 'lightingStaticSolve')).toMatchObject({
      supported: false,
      count: 0,
    });
  });

  it('estimates observed refresh and fixed deadline misses', () => {
    const metrics = new RenderMetrics();
    for (const timestamp of [0, 16.67, 33.34, 50.01, 83.35]) {
      metrics.recordRafTimestamp(timestamp);
    }
    const pacing = metrics.snapshot().pacing;
    expect(pacing.sampleCount).toBe(4);
    expect(pacing.observedRefreshHz).toBeCloseTo(60, 1);
    expect(pacing.missed60Hz).toBe(1);
    expect(pacing.missed120Hz).toBe(4);
  });

  it('records loop work and deliberately discarded elapsed time', () => {
    const metrics = new RenderMetrics();
    metrics.recordFixedUpdate(0.4);
    metrics.recordCatchUp(3, 1750, 1.2);
    const snapshot = metrics.snapshot();
    expect(snapshot.accumulatedUpdateSteps).toBe(3);
    expect(snapshot.discardedElapsedMs).toBe(1750);
    expect(snapshot.stages.find((stage) => stage.id === 'fixedUpdate')?.latest).toBeCloseTo(0.4);
    expect(snapshot.stages.find((stage) => stage.id === 'catchUp')?.latest).toBe(1.2);
  });

  it('reports optional long-task samples without needing browser support', () => {
    const metrics = new RenderMetrics();
    metrics.recordLongTask(72.5);
    expect(metrics.snapshot().longTasks).toMatchObject({
      count: 1,
      latest: 72.5,
      p95: 72.5,
    });
  });

  it('records the first render submission after the oldest queued trusted input', () => {
    const metrics = new RenderMetrics();
    metrics.recordInputTimestamp(100);
    metrics.recordInputTimestamp(104);
    metrics.recordRenderSubmit(112.5);
    metrics.recordRenderSubmit(120);
    expect(metrics.snapshot().inputToRenderSubmit).toMatchObject({
      count: 1,
      latest: 12.5,
    });
  });
});
