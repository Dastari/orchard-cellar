export const RENDER_STAGE_IDS = [
  'snapshotPrepare',
  'ground',
  'painterBuild',
  'painterSort',
  'painterDraw',
  'weather',
  'lightingBoundsResize',
  'lightingOcclusionRaster',
  'lightingSolve',
  'lightingMerge',
  'lightingUpload',
  'lightingReceiver',
  'lightingComposite',
  'lightingStaticSolve',
  'lightingAnimatedStaticSolve',
  'lightingDynamicSolve',
  'finalWorldComposite',
  'uiModel',
  'uiLayout',
  'uiDraw',
  'fixedUpdate',
  'catchUp',
] as const;

export type RenderStageId = (typeof RENDER_STAGE_IDS)[number];

const RENDER_STAGE_INDEX: Readonly<Record<RenderStageId, number>> = {
  snapshotPrepare: 0,
  ground: 1,
  painterBuild: 2,
  painterSort: 3,
  painterDraw: 4,
  weather: 5,
  lightingBoundsResize: 6,
  lightingOcclusionRaster: 7,
  lightingSolve: 8,
  lightingMerge: 9,
  lightingUpload: 10,
  lightingReceiver: 11,
  lightingComposite: 12,
  lightingStaticSolve: 13,
  lightingAnimatedStaticSolve: 14,
  lightingDynamicSolve: 15,
  finalWorldComposite: 16,
  uiModel: 17,
  uiLayout: 18,
  uiDraw: 19,
  fixedUpdate: 20,
  catchUp: 21,
};

const RESERVED_STAGE_START = RENDER_STAGE_INDEX.lightingStaticSolve;
const RESERVED_STAGE_END = RENDER_STAGE_INDEX.lightingDynamicSolve;
const DEFAULT_SAMPLE_CAPACITY = 60;
const FRAME_INTERVAL_CAPACITY = 240;

export interface MetricDistributionSnapshot {
  readonly count: number;
  readonly latest: number;
  readonly mean: number;
  readonly p50: number;
  readonly p95: number;
  readonly p99: number;
  readonly maximum: number;
}

const EMPTY_DISTRIBUTION: MetricDistributionSnapshot = Object.freeze({
  count: 0,
  latest: 0,
  mean: 0,
  p50: 0,
  p95: 0,
  p99: 0,
  maximum: 0,
});

/** Fixed-capacity numeric telemetry. record() is allocation-free; snapshot()
 * deliberately allocates/sorts only when diagnostics or a benchmark asks. */
export class FixedMetricSeries {
  private readonly values: Float32Array;
  private cursor = 0;
  private countValue = 0;
  private latestValue = 0;

  constructor(capacity = DEFAULT_SAMPLE_CAPACITY) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new RangeError('Metric capacity must be a positive integer');
    }
    this.values = new Float32Array(capacity);
  }

  get count(): number { return this.countValue; }
  get latest(): number { return this.latestValue; }

  record(value: number): void {
    const sample = Number.isFinite(value) ? Math.max(0, value) : 0;
    this.values[this.cursor] = sample;
    this.cursor = (this.cursor + 1) % this.values.length;
    this.countValue = Math.min(this.values.length, this.countValue + 1);
    this.latestValue = sample;
  }

  snapshot(): MetricDistributionSnapshot {
    if (this.countValue === 0) return EMPTY_DISTRIBUTION;
    const sorted = new Float32Array(this.countValue);
    let total = 0;
    let maximum = 0;
    for (let index = 0; index < this.countValue; index += 1) {
      const value = this.values[index] ?? 0;
      sorted[index] = value;
      total += value;
      maximum = Math.max(maximum, value);
    }
    sorted.sort();
    return {
      count: this.countValue,
      latest: this.latestValue,
      mean: total / this.countValue,
      p50: percentile(sorted, 0.5),
      p95: percentile(sorted, 0.95),
      p99: percentile(sorted, 0.99),
      maximum,
    };
  }

  countAbove(limit: number): number {
    let missed = 0;
    for (let index = 0; index < this.countValue; index += 1) {
      if ((this.values[index] ?? 0) > limit) missed += 1;
    }
    return missed;
  }
}

function percentile(sorted: Float32Array, fraction: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.max(0, Math.ceil(sorted.length * fraction) - 1);
  return sorted[Math.min(sorted.length - 1, index)] ?? 0;
}

export interface RenderStageSnapshot extends MetricDistributionSnapshot {
  readonly id: RenderStageId;
  readonly supported: boolean;
}

export interface FramePacingSnapshot {
  readonly sampleCount: number;
  readonly observedRefreshHz: number;
  readonly observedIntervalMs: number;
  readonly missedObserved: number;
  readonly missed60Hz: number;
  readonly missed120Hz: number;
  readonly missed144Hz: number;
}

export interface RenderMetricsSnapshot {
  readonly schemaVersion: 2;
  readonly frame: MetricDistributionSnapshot;
  readonly averageFrameMs: number;
  readonly worstFrameMs: number;
  readonly renderItems: number;
  readonly sampleCount: number;
  readonly pacing: FramePacingSnapshot;
  readonly inputToRenderSubmit: MetricDistributionSnapshot;
  readonly longTasks: MetricDistributionSnapshot;
  readonly stages: readonly RenderStageSnapshot[];
  readonly accumulatedUpdateSteps: number;
  readonly discardedElapsedMs: number;
}

/** Renderer-wide telemetry. The legacy average/worst fields remain in the
 * snapshot while callers migrate to the distribution and named stages. */
export class RenderMetrics {
  private readonly frames: FixedMetricSeries;
  private readonly frameIntervals = new FixedMetricSeries(FRAME_INTERVAL_CAPACITY);
  private readonly inputToRenderSubmit = new FixedMetricSeries(FRAME_INTERVAL_CAPACITY);
  private readonly longTasks = new FixedMetricSeries(FRAME_INTERVAL_CAPACITY);
  private readonly stages = RENDER_STAGE_IDS.map(() => new FixedMetricSeries());
  private renderItemsValue = 0;
  private previousRafTimestamp = Number.NaN;
  private pendingInputTimestamp = Number.NaN;
  private accumulatedUpdateStepsValue = 0;
  private discardedElapsedMsValue = 0;

  constructor(sampleCapacity = DEFAULT_SAMPLE_CAPACITY) {
    this.frames = new FixedMetricSeries(sampleCapacity);
  }

  record(frameMs: number, renderItems: number): void {
    this.frames.record(frameMs);
    this.renderItemsValue = Math.max(0, Math.floor(renderItems));
  }

  recordStage(stage: RenderStageId, milliseconds: number): void {
    this.stages[RENDER_STAGE_INDEX[stage]]?.record(milliseconds);
  }

  recordRafTimestamp(milliseconds: number): void {
    if (Number.isFinite(this.previousRafTimestamp)) {
      this.frameIntervals.record(milliseconds - this.previousRafTimestamp);
    }
    this.previousRafTimestamp = milliseconds;
  }

  recordInputTimestamp(milliseconds: number): void {
    if (!Number.isFinite(milliseconds) || milliseconds < 0) return;
    if (!Number.isFinite(this.pendingInputTimestamp)) {
      this.pendingInputTimestamp = milliseconds;
      return;
    }
    this.pendingInputTimestamp = Math.min(this.pendingInputTimestamp, milliseconds);
  }

  recordRenderSubmit(milliseconds: number): void {
    if (!Number.isFinite(this.pendingInputTimestamp)) return;
    const latency = milliseconds - this.pendingInputTimestamp;
    // Modern Event.timeStamp and performance.now() share the time origin. If a
    // legacy browser supplies epoch time, reject the incompatible sample.
    if (latency >= 0 && latency <= 60_000) this.inputToRenderSubmit.record(latency);
    this.pendingInputTimestamp = Number.NaN;
  }

  recordLongTask(milliseconds: number): void {
    this.longTasks.record(milliseconds);
  }

  /** Installs optional development telemetry without making the Long Tasks API
   * a browser requirement. The returned disposer is safe to call repeatedly. */
  observeLongTasks(): (() => void) | null {
    if (typeof PerformanceObserver === 'undefined'
      || !PerformanceObserver.supportedEntryTypes.includes('longtask')) return null;
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) this.recordLongTask(entry.duration);
    });
    observer.observe({ type: 'longtask', buffered: true });
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      observer.disconnect();
    };
  }

  recordFixedUpdate(milliseconds: number): void {
    this.recordStage('fixedUpdate', milliseconds);
  }

  recordCatchUp(
    updateSteps: number,
    discardedMilliseconds: number,
    updateMilliseconds: number,
  ): void {
    this.accumulatedUpdateStepsValue += Math.max(0, Math.floor(updateSteps));
    this.discardedElapsedMsValue += Math.max(0, discardedMilliseconds);
    if (updateSteps > 1) this.recordStage('catchUp', updateMilliseconds);
  }

  snapshot(): RenderMetricsSnapshot {
    const frame = this.frames.snapshot();
    return {
      schemaVersion: 2,
      frame,
      averageFrameMs: frame.mean,
      worstFrameMs: frame.maximum,
      renderItems: this.renderItemsValue,
      sampleCount: frame.count,
      pacing: this.pacingSnapshot(),
      inputToRenderSubmit: this.inputToRenderSubmit.snapshot(),
      longTasks: this.longTasks.snapshot(),
      stages: RENDER_STAGE_IDS.map((id, index): RenderStageSnapshot => ({
        id,
        supported: index < RESERVED_STAGE_START || index > RESERVED_STAGE_END,
        ...this.stages[index]!.snapshot(),
      })),
      accumulatedUpdateSteps: this.accumulatedUpdateStepsValue,
      discardedElapsedMs: this.discardedElapsedMsValue,
    };
  }

  private pacingSnapshot(): FramePacingSnapshot {
    const intervals = this.frameIntervals.snapshot();
    const observedIntervalMs = intervals.p50;
    return {
      sampleCount: intervals.count,
      observedRefreshHz: observedIntervalMs <= 0 ? 0 : 1000 / observedIntervalMs,
      observedIntervalMs,
      missedObserved: this.missedDeadline(observedIntervalMs),
      missed60Hz: this.missedDeadline(1000 / 60),
      missed120Hz: this.missedDeadline(1000 / 120),
      missed144Hz: this.missedDeadline(1000 / 144),
    };
  }

  /** A deadline miss permits 5% scheduling jitter or 0.5 ms, whichever is
   * larger. The tolerance is reported here rather than hidden in a browser
   * harness so every refresh-rate comparison uses the same definition. */
  private missedDeadline(deadlineMs: number): number {
    if (deadlineMs <= 0) return 0;
    return this.frameIntervals.countAbove(deadlineMs + Math.max(0.5, deadlineMs * 0.05));
  }
}
