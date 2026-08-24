export interface RenderMetricsSnapshot {
  readonly averageFrameMs: number;
  readonly worstFrameMs: number;
  readonly drawCalls: number;
  readonly sampleCount: number;
}

/** Fixed-size render telemetry; recording a frame performs no allocation. */
export class RenderMetrics {
  private readonly frameTimes = new Float32Array(60);
  private cursor = 0;
  private count = 0;
  private drawCallsValue = 0;

  record(frameMs: number, drawCalls: number): void {
    this.frameTimes[this.cursor] = frameMs;
    this.cursor = (this.cursor + 1) % this.frameTimes.length;
    this.count = Math.min(this.frameTimes.length, this.count + 1);
    this.drawCallsValue = drawCalls;
  }

  snapshot(): RenderMetricsSnapshot {
    let total = 0;
    let worst = 0;
    for (let index = 0; index < this.count; index += 1) {
      const value = this.frameTimes[index] ?? 0;
      total += value;
      worst = Math.max(worst, value);
    }
    return {
      averageFrameMs: this.count === 0 ? 0 : total / this.count,
      worstFrameMs: worst,
      drawCalls: this.drawCallsValue,
      sampleCount: this.count,
    };
  }
}
