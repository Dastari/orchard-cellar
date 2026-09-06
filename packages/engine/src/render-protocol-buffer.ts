import { RENDER_COUNTER_IDS } from '@orchard/ui';
import { RENDER_STAGE_IDS, type CompletedRenderFrame } from './metrics.js';

export interface ProtocolDistribution {
  readonly count: number;
  readonly p50: number;
  readonly p95: number;
  readonly p99: number;
  readonly maximum: number;
  readonly mean: number;
}
export function protocolDistribution(values: readonly number[]): ProtocolDistribution {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (fraction: number) => sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] ?? 0;
  return { count: sorted.length, p50: at(0.5), p95: at(0.95), p99: at(0.99),
    maximum: sorted.at(-1) ?? 0,
    mean: sorted.length ? sorted.reduce((sum, value) => sum + value, 0) / sorted.length : 0 };
}

/** One allocation before warm-up, no allocation/sorting in the observed frame.
 * Overflow rejects the capture instead of silently dropping early frames. */
export class RenderProtocolBuffer {
  private readonly width = 3 + RENDER_STAGE_IDS.length + RENDER_COUNTER_IDS.length;
  private readonly values: Float64Array;
  count = 0;
  constructor(readonly capacity = 16_384) {
    if (!Number.isInteger(capacity) || capacity < 1) throw new RangeError('Invalid protocol capacity');
    this.values = new Float64Array(capacity * this.width);
  }
  record(frame: CompletedRenderFrame): void {
    if (this.count === this.capacity) throw new Error('render_protocol_buffer_overflow');
    let offset = this.count++ * this.width;
    this.values[offset++] = frame.timestamp;
    this.values[offset++] = frame.frameMs;
    this.values[offset++] = frame.renderItems;
    for (const value of frame.stages) this.values[offset++] = value;
    for (const id of RENDER_COUNTER_IDS) this.values[offset++] = frame.counters[id];
  }
  private column(index: number): number[] {
    return Array.from({ length: this.count }, (_, row) => this.values[row * this.width + index]!);
  }
  report() {
    const timestamps = this.column(0);
    return {
      frameCount: this.count,
      firstTimestamp: timestamps[0] ?? null,
      lastTimestamp: timestamps.at(-1) ?? null,
      frame: protocolDistribution(this.column(1)),
      renderItems: protocolDistribution(this.column(2)),
      frameIntervals: protocolDistribution(timestamps.slice(1).map((value, i) => value - timestamps[i]!)),
      stages: RENDER_STAGE_IDS.map((id, i) => ({ id,
        supported: !['lightingStaticSolve', 'lightingAnimatedStaticSolve', 'lightingDynamicSolve'].includes(id),
        ...protocolDistribution(this.column(3 + i)) })),
      counters: Object.fromEntries(RENDER_COUNTER_IDS.map((id, i) => [id,
        protocolDistribution(this.column(3 + RENDER_STAGE_IDS.length + i))])),
    };
  }
}
