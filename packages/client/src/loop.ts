import { SIM_TICKS_PER_SECOND } from '@orchard/sim';

export interface LoopCallbacks {
  update(): void;
  render(alpha: number): void;
}

export class FixedStepAccumulator {
  private accumulator = 0;

  constructor(private readonly stepSeconds: number) {}

  advance(elapsedSeconds: number, update: () => void): number {
    this.accumulator += Math.min(Math.max(elapsedSeconds, 0), 0.25);
    while (this.accumulator >= this.stepSeconds) {
      update();
      this.accumulator -= this.stepSeconds;
    }
    return this.accumulator / this.stepSeconds;
  }
}

export class FixedStepLoop {
  private readonly stepSeconds = 1 / SIM_TICKS_PER_SECOND;
  private readonly accumulator = new FixedStepAccumulator(this.stepSeconds);
  private previousTime = 0;
  private frameRequest: number | null = null;

  constructor(private readonly callbacks: LoopCallbacks) {}

  start(): void {
    if (this.frameRequest !== null) return;
    this.previousTime = performance.now() / 1000;
    this.frameRequest = requestAnimationFrame(this.frame);
  }

  stop(): void {
    if (this.frameRequest === null) return;
    cancelAnimationFrame(this.frameRequest);
    this.frameRequest = null;
  }

  private readonly frame = (milliseconds: number): void => {
    const now = milliseconds / 1000;
    const elapsed = now - this.previousTime;
    this.previousTime = now;
    const alpha = this.accumulator.advance(elapsed, this.callbacks.update);
    this.callbacks.render(alpha);
    this.frameRequest = requestAnimationFrame(this.frame);
  };
}
