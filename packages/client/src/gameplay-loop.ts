import { FixedStepLoop, type FixedStepLoopObserver, type LoopCallbacks } from './loop.js';

/** Gameplay construction boundary; simulation and presentation remain in loop. */
export function createGameplayLoop(callbacks: LoopCallbacks, observer: FixedStepLoopObserver): FixedStepLoop {
  return new FixedStepLoop(callbacks, observer);
}
