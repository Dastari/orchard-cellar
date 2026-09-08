import { describe, expect, it } from 'vitest';
import { PresentationMetrics } from './presentation-metrics.js';
import { RenderMetrics } from './metrics.js';

describe('delivered game FPS', () => {
  it.each([30, 60, 120, 144])('reports %i Hz from actual frame delivery, independently of CPU work', (hz) => {
    const metrics = new RenderMetrics();
    for (let i = 0; i <= hz * 7; i++) {
      metrics.recordRafTimestamp(i * 1000 / hz);
      metrics.record(2, 1);
    }
    const result = metrics.snapshot();
    expect(result.presentation.fps).toBeCloseTo(hz, 5);
    expect(result.presentation.latestFrameMs).toBeCloseTo(1000 / hz, 5);
    expect(result.averageFrameMs).toBe(2);
  });

  it.each([30, 60])('does not add a phantom frame at rounded %iHz window boundaries', (hz) => {
    const metrics = new PresentationMetrics();
    for (let i = 0; i < hz * 4; i++) {
      metrics.record(Math.round(i * 1000 / hz * 10) / 10);
      if (i > hz) expect(metrics.snapshot().fps).toBeCloseTo(hz, 1);
    }
  });

  it('counts 30 presented frames on a 120Hz rAF when three out of four frames are skipped', () => {
    const metrics = new RenderMetrics();
    for (let i = 0; i <= 120 * 3; i++) {
      metrics.recordRafTimestamp(i * 1000 / 120);
      if (i % 4 === 0) metrics.record(2, 1);
    }
    expect(metrics.snapshot().presentation.fps).toBeCloseTo(30, 5);
    expect(metrics.snapshot().pacing.observedRefreshHz).toBeCloseTo(120, 4);
  });

  it('keeps a real stall visible for five seconds without disguising it as CPU cost', () => {
    const metrics = new PresentationMetrics();
    for (let time = 0; time <= 1000; time += 20) metrics.record(time);
    metrics.record(1200);
    expect(metrics.snapshot()).toMatchObject({ fps: 41, latestFrameMs: 200, worstFrameMs: 200 });
    for (let time = 1220; time <= 6180; time += 20) metrics.record(time);
    expect(metrics.snapshot()).toMatchObject({ fps: 50, worstFrameMs: 200 });
    metrics.record(6200);
    expect(metrics.snapshot()).toMatchObject({ fps: 50, worstFrameMs: 20 });
  });

  it('starts empty, ignores invalid/duplicate samples and handles a clock restart', () => {
    const metrics = new PresentationMetrics();
    metrics.record(Number.NaN); metrics.record(Infinity);
    expect(metrics.snapshot().sampleCount).toBe(0);
    metrics.record(100); metrics.record(100); metrics.record(120);
    expect(metrics.snapshot().fps).toBe(50);
    metrics.record(0);
    expect(metrics.snapshot()).toMatchObject({ fps: 0, sampleCount: 0 });
    metrics.record(25); expect(metrics.snapshot().fps).toBe(40);
  });

  it('resets hidden-tab history and retains foreground stalls longer than the window', () => {
    const metrics = new RenderMetrics();
    metrics.recordRafTimestamp(0); metrics.record(1, 0);
    metrics.recordRafTimestamp(10); metrics.record(1, 0);
    metrics.resetPresentation();
    metrics.recordRafTimestamp(60_000); metrics.record(1, 0);
    expect(metrics.snapshot().presentation.sampleCount).toBe(0);
    metrics.recordRafTimestamp(60_020); metrics.record(1, 0);
    expect(metrics.snapshot().presentation.fps).toBe(50);
    metrics.recordRafTimestamp(70_020); metrics.record(1, 0);
    expect(metrics.snapshot().presentation).toMatchObject({ fps: .1, worstFrameMs: 10_000 });
  });
});
