import type { RenderMetricsSnapshot } from './metrics.js';
import type { RenderBenchmarkScenario } from './render-benchmark-scenarios.js';

export const RENDER_BENCHMARK_SCHEMA_VERSION = 1;

export interface SteadyStateBenchmarkProtocol {
  readonly warmupMilliseconds: number;
  readonly measurementMilliseconds: number;
  readonly minimumMeasuredFrames: number;
}

export const STEADY_STATE_BENCHMARK_PROTOCOL: SteadyStateBenchmarkProtocol = Object.freeze({
  warmupMilliseconds: 5_000,
  measurementMilliseconds: 30_000,
  minimumMeasuredFrames: 1_800,
});

export interface RenderBenchmarkEnvironment {
  readonly buildIdentity: string;
  readonly browser: string;
  readonly operatingSystem: string;
  readonly device: string;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly devicePixelRatio: number;
  readonly worldZoom: number;
  readonly lightingModel: 'classic' | 'unified';
}

export interface RenderBenchmarkReport {
  readonly schemaVersion: typeof RENDER_BENCHMARK_SCHEMA_VERSION;
  readonly scenario: RenderBenchmarkScenario;
  readonly environment: RenderBenchmarkEnvironment;
  readonly protocol: SteadyStateBenchmarkProtocol;
  readonly measuredFrames: number;
  readonly render: RenderMetricsSnapshot;
}

export type BenchmarkPhase = 'warmup' | 'measure' | 'complete';

export function benchmarkPhase(elapsedMilliseconds: number): BenchmarkPhase {
  if (elapsedMilliseconds < STEADY_STATE_BENCHMARK_PROTOCOL.warmupMilliseconds) return 'warmup';
  if (elapsedMilliseconds < STEADY_STATE_BENCHMARK_PROTOCOL.warmupMilliseconds
    + STEADY_STATE_BENCHMARK_PROTOCOL.measurementMilliseconds) return 'measure';
  return 'complete';
}

export function createRenderBenchmarkReport(
  scenario: RenderBenchmarkScenario,
  environment: RenderBenchmarkEnvironment,
  measuredFrames: number,
  render: RenderMetricsSnapshot,
): RenderBenchmarkReport {
  return {
    schemaVersion: RENDER_BENCHMARK_SCHEMA_VERSION,
    scenario,
    environment,
    protocol: STEADY_STATE_BENCHMARK_PROTOCOL,
    measuredFrames: Math.max(0, Math.floor(measuredFrames)),
    render,
  };
}
