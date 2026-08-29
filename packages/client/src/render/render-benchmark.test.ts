import { describe, expect, it } from 'vitest';
import { RenderMetrics } from './metrics.js';
import {
  benchmarkPhase,
  createRenderBenchmarkReport,
  STEADY_STATE_BENCHMARK_PROTOCOL,
} from './render-benchmark.js';
import {
  RENDER_BENCHMARK_SCENARIOS,
  RENDER_BENCHMARK_SCENARIO_IDS,
} from './render-benchmark-scenarios.js';

describe('render benchmark protocol', () => {
  it('defines every required deterministic scenario exactly once', () => {
    expect(Object.keys(RENDER_BENCHMARK_SCENARIOS)).toEqual(RENDER_BENCHMARK_SCENARIO_IDS);
    expect(new Set(RENDER_BENCHMARK_SCENARIO_IDS).size).toBe(RENDER_BENCHMARK_SCENARIO_IDS.length);
    expect(JSON.parse(JSON.stringify(RENDER_BENCHMARK_SCENARIOS)))
      .toEqual(RENDER_BENCHMARK_SCENARIOS);
  });

  it('uses the mandatory five-second warmup and thirty-second sample', () => {
    expect(STEADY_STATE_BENCHMARK_PROTOCOL).toEqual({
      warmupMilliseconds: 5_000,
      measurementMilliseconds: 30_000,
      minimumMeasuredFrames: 1_800,
    });
    expect(benchmarkPhase(4_999)).toBe('warmup');
    expect(benchmarkPhase(5_000)).toBe('measure');
    expect(benchmarkPhase(34_999)).toBe('measure');
    expect(benchmarkPhase(35_000)).toBe('complete');
  });

  it('emits a versioned JSON-serializable report without authority state', () => {
    const metrics = new RenderMetrics();
    metrics.record(3, 120);
    const report = createRenderBenchmarkReport(
      RENDER_BENCHMARK_SCENARIOS['day-clear-baseline'],
      {
        buildIdentity: 'test',
        browser: 'Chromium test',
        operatingSystem: 'test',
        device: 'test',
        viewportWidth: 960,
        viewportHeight: 540,
        devicePixelRatio: 2,
        worldZoom: 2,
        lightingModel: 'classic',
      },
      1_800,
      metrics.snapshot(),
    );
    expect(JSON.parse(JSON.stringify(report))).toEqual(report);
    expect(JSON.stringify(report)).not.toContain('token');
  });
});
