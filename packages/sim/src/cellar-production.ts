import { AUTHORITY_HZ } from './net-timing.js';

export const PRESS_INPUT_SLOT = 0;
export const PRESS_MUST_OUTPUT_SLOT = 1;
export const PRESS_POMACE_OUTPUT_SLOT = 2;
export const PRESS_SLOT_CAPACITY = 3;
export const PRESS_CYCLE_MINUTES = 5;
export const PRESS_CYCLE_TICKS = BigInt(PRESS_CYCLE_MINUTES * 60 * AUTHORITY_HZ);

export const FERMENTATION_INPUT_SLOT = 0;
export const FERMENTATION_OUTPUT_SLOT = 1;
export const FERMENTATION_SLOT_CAPACITY = 2;
export const FERMENTATION_MUST_PER_BOTTLE = 3;
export const FERMENTATION_CYCLE_MINUTES = 30;
export const FERMENTATION_CYCLE_TICKS = BigInt(FERMENTATION_CYCLE_MINUTES * 60 * AUTHORITY_HZ);

export type CellarProcessorInterface = 'press' | 'fermentation';

export function cellarProcessorSlotCapacity(capability: CellarProcessorInterface): number {
  return capability === 'press' ? PRESS_SLOT_CAPACITY : FERMENTATION_SLOT_CAPACITY;
}

export function cellarProcessorCycleTicks(
  capability: CellarProcessorInterface,
  fermentationCycleTicks = FERMENTATION_CYCLE_TICKS,
): bigint {
  return capability === 'press' ? PRESS_CYCLE_TICKS : fermentationCycleTicks;
}

export function cellarProcessorProgress(
  capability: CellarProcessorInterface,
  processStartTick: bigint | undefined,
  authorityTick: bigint,
  fermentationCycleTicks = FERMENTATION_CYCLE_TICKS,
): number {
  if (processStartTick === undefined) return 0;
  const elapsed = authorityTick > processStartTick ? authorityTick - processStartTick : 0n;
  return Math.max(0, Math.min(1, Number(elapsed) / Number(cellarProcessorCycleTicks(capability, fermentationCycleTicks))));
}

export function cellarProcessorRemainingTicks(
  capability: CellarProcessorInterface,
  processStartTick: bigint | undefined,
  authorityTick: bigint,
  fermentationCycleTicks = FERMENTATION_CYCLE_TICKS,
): bigint | null {
  if (processStartTick === undefined) return null;
  const duration = cellarProcessorCycleTicks(capability, fermentationCycleTicks);
  const elapsed = authorityTick > processStartTick ? authorityTick - processStartTick : 0n;
  return elapsed >= duration ? 0n : duration - elapsed;
}
