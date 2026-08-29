import { SIM_TICKS_PER_SECOND } from '@orchard/sim';

export interface LoopCallbacks {
  update(): void;
  render(alpha: number): void;
}

export interface FixedStepLoopObserver {
  recordRafTimestamp(milliseconds: number): void;
  recordFixedUpdate(milliseconds: number): void;
  recordCatchUp(
    updateSteps: number,
    discardedMilliseconds: number,
    updateMilliseconds: number,
  ): void;
}

export class FixedStepAccumulator {
  private accumulator = 0;
  private lastUpdateStepsValue = 0;
  private lastDiscardedSecondsValue = 0;

  constructor(private readonly stepSeconds: number) {}

  get lastUpdateSteps(): number { return this.lastUpdateStepsValue; }
  get lastDiscardedSeconds(): number { return this.lastDiscardedSecondsValue; }

  advance(elapsedSeconds: number, update: () => void): number {
    const nonNegativeElapsed = Math.max(elapsedSeconds, 0);
    const acceptedElapsed = Math.min(nonNegativeElapsed, 0.25);
    this.lastDiscardedSecondsValue = nonNegativeElapsed - acceptedElapsed;
    this.lastUpdateStepsValue = 0;
    this.accumulator += acceptedElapsed;
    while (this.accumulator >= this.stepSeconds) {
      update();
      this.accumulator -= this.stepSeconds;
      this.lastUpdateStepsValue += 1;
    }
    return this.accumulator / this.stepSeconds;
  }
}

export class FixedStepLoop {
  private readonly stepSeconds = 1 / SIM_TICKS_PER_SECOND;
  private readonly accumulator = new FixedStepAccumulator(this.stepSeconds);
  private previousTime = 0;
  private frameRequest: number | null = null;
  private frameUpdateMilliseconds = 0;

  constructor(
    private readonly callbacks: LoopCallbacks,
    private readonly observer?: FixedStepLoopObserver,
  ) {}

  start(): void {
    if (this.frameRequest !== null) return;
    this.previousTime = performance.now() / 1000;
    this.callbacks.render(0);
    this.frameRequest = requestAnimationFrame(this.frame);
  }

  stop(): void {
    if (this.frameRequest === null) return;
    cancelAnimationFrame(this.frameRequest);
    this.frameRequest = null;
  }

  private readonly frame = (milliseconds: number): void => {
    this.observer?.recordRafTimestamp(milliseconds);
    const now = milliseconds / 1000;
    const elapsed = now - this.previousTime;
    this.previousTime = now;
    this.frameUpdateMilliseconds = 0;
    const alpha = this.accumulator.advance(elapsed, this.timedUpdate);
    this.observer?.recordCatchUp(
      this.accumulator.lastUpdateSteps,
      this.accumulator.lastDiscardedSeconds * 1000,
      this.frameUpdateMilliseconds,
    );
    this.callbacks.render(alpha);
    this.frameRequest = requestAnimationFrame(this.frame);
  };

  private readonly timedUpdate = (): void => {
    if (this.observer === undefined) {
      this.callbacks.update();
      return;
    }
    const startedAt = performance.now();
    this.callbacks.update();
    const elapsed = performance.now() - startedAt;
    this.frameUpdateMilliseconds += elapsed;
    this.observer.recordFixedUpdate(elapsed);
  };
}
