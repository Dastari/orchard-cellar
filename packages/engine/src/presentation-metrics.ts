/** Submitted game frames, sampled at their rAF timestamps. This measures game
 * delivery (including presentation caps), not CPU cost or physical GPU scanout. */
export interface PresentationSnapshot {
  readonly fps: number;
  readonly latestFrameMs: number;
  readonly worstFrameMs: number;
  readonly sampleCount: number;
  readonly windowMs: number;
}

const CAPACITY = 2048;
const FPS_WINDOW_MS = 1000;
const SPIKE_WINDOW_MS = 5000;

export class PresentationMetrics {
  private readonly timestamps = new Float64Array(CAPACITY);
  private readonly intervals = new Float64Array(CAPACITY);
  private cursor = 0;
  private count = 0;
  private startedAt = Number.NaN;
  private previous = Number.NaN;

  record(timestamp: number): void {
    if (!Number.isFinite(timestamp)) return;
    if (timestamp === this.previous) return;
    if (!Number.isFinite(this.previous) || timestamp < this.previous) {
      this.reset(); this.startedAt = this.previous = timestamp; return;
    }
    this.timestamps[this.cursor] = timestamp;
    this.intervals[this.cursor] = timestamp - this.previous;
    this.previous = timestamp;
    this.cursor = (this.cursor + 1) % CAPACITY;
    this.count = Math.min(CAPACITY, this.count + 1);
  }

  snapshot(): PresentationSnapshot {
    const windowMs = Number.isFinite(this.previous) ? Math.min(FPS_WINDOW_MS, this.previous - this.startedAt) : 0;
    let frames = 0, weightedFrames = 0, worstFrameMs = 0;
    for (let offset = 0; offset < this.count; offset++) {
      const index = (this.cursor - 1 - offset + CAPACITY) % CAPACITY;
      const age = this.previous - this.timestamps[index]!;
      if (age >= SPIKE_WINDOW_MS) break;
      worstFrameMs = Math.max(worstFrameMs, this.intervals[index]!);
      if (age < windowMs - 0.000001) {
        frames++;
        // Prorate the interval crossing the window boundary. Whole-event
        // counting otherwise flickers to31 at30Hz after timestamp rounding.
        weightedFrames += Math.min(1, (windowMs - age) / this.intervals[index]!);
      }
    }
    return {
      fps: windowMs > 0 ? weightedFrames * 1000 / windowMs : 0,
      latestFrameMs: this.count > 0 ? this.intervals[(this.cursor - 1 + CAPACITY) % CAPACITY]! : 0,
      worstFrameMs,
      sampleCount: frames,
      windowMs,
    };
  }

  reset(): void {
    this.cursor = this.count = 0;
    this.startedAt = this.previous = Number.NaN;
  }
}
