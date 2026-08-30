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

export const PRESSABLE_FRUIT_KINDS = ['apple', 'pear', 'peach', 'cherry', 'grape'] as const;
export type PressableFruitKind = typeof PRESSABLE_FRUIT_KINDS[number];
export type CellarProcessorInterface = 'press' | 'fermentation';

const PRODUCTION_STACK_LIMIT = 99;

export interface CellarProductionStack {
  readonly itemKind: string;
  readonly quantity: number;
  readonly durability?: number;
  readonly lit?: boolean;
}

export interface CellarProcessorState {
  readonly slots: readonly (CellarProductionStack | null)[];
  readonly processStartTick: bigint | undefined;
}

export interface SettledCellarProcessor {
  readonly slots: readonly (CellarProductionStack | null)[];
  readonly processStartTick: bigint | undefined;
  readonly completed: number;
  readonly completedInputKind: string | null;
}

export function isPressableFruitKind(itemKind: string): itemKind is PressableFruitKind {
  return PRESSABLE_FRUIT_KINDS.includes(itemKind as PressableFruitKind);
}

export function cellarProcessorSlotCapacity(capability: CellarProcessorInterface): number {
  return capability === 'press' ? PRESS_SLOT_CAPACITY : FERMENTATION_SLOT_CAPACITY;
}

export function cellarProcessorSlotAccepts(
  capability: CellarProcessorInterface,
  slot: number,
  itemKind: string,
): boolean {
  if (capability === 'press') {
    if (slot === PRESS_INPUT_SLOT) return isPressableFruitKind(itemKind);
    if (slot === PRESS_MUST_OUTPUT_SLOT) return itemKind === 'must';
    if (slot === PRESS_POMACE_OUTPUT_SLOT) return itemKind === 'pomace';
    return false;
  }
  if (slot === FERMENTATION_INPUT_SLOT) return itemKind === 'must';
  if (slot === FERMENTATION_OUTPUT_SLOT) return itemKind === 'bottles';
  return false;
}

export function cellarProcessorOutputSlots(capability: CellarProcessorInterface): readonly number[] {
  return capability === 'press'
    ? [PRESS_MUST_OUTPUT_SLOT, PRESS_POMACE_OUTPUT_SLOT]
    : [FERMENTATION_OUTPUT_SLOT];
}

function normalizeSlots(
  slots: readonly (CellarProductionStack | null)[],
  capacity: number,
): (CellarProductionStack | null)[] {
  return Array.from({ length: capacity }, (_, slot) => slots[slot] ?? null);
}

function outputRoom(stack: CellarProductionStack | null, itemKind: string): number {
  if (stack === null) return PRODUCTION_STACK_LIMIT;
  return stack.itemKind === itemKind ? Math.max(0, PRODUCTION_STACK_LIMIT - stack.quantity) : 0;
}

function addOutput(
  slots: (CellarProductionStack | null)[],
  slot: number,
  itemKind: string,
  quantity: number,
): void {
  const current = slots[slot];
  slots[slot] = { itemKind, quantity: (current?.quantity ?? 0) + quantity };
}

function reduceInput(
  slots: (CellarProductionStack | null)[],
  slot: number,
  quantity: number,
): void {
  const current = slots[slot]!;
  const remaining = current.quantity - quantity;
  slots[slot] = remaining > 0 ? { ...current, quantity: remaining } : null;
}

function pressCanRun(slots: readonly (CellarProductionStack | null)[]): boolean {
  const input = slots[PRESS_INPUT_SLOT] ?? null;
  return input !== null && input.quantity > 0 && isPressableFruitKind(input.itemKind)
    && outputRoom(slots[PRESS_MUST_OUTPUT_SLOT] ?? null, 'must') > 0
    && outputRoom(slots[PRESS_POMACE_OUTPUT_SLOT] ?? null, 'pomace') > 0;
}

export function settleFruitPress(
  state: CellarProcessorState,
  authorityTick: bigint,
): SettledCellarProcessor {
  const slots = normalizeSlots(state.slots, PRESS_SLOT_CAPACITY);
  if (!pressCanRun(slots)) {
    return { slots, processStartTick: undefined, completed: 0, completedInputKind: null };
  }
  if (state.processStartTick === undefined) {
    return { slots, processStartTick: authorityTick, completed: 0, completedInputKind: null };
  }
  const elapsed = authorityTick - state.processStartTick;
  if (elapsed < PRESS_CYCLE_TICKS) {
    return { slots, processStartTick: state.processStartTick, completed: 0, completedInputKind: null };
  }
  const input = slots[PRESS_INPUT_SLOT]!;
  const completed = Math.min(
    Number(elapsed / PRESS_CYCLE_TICKS),
    input.quantity,
    outputRoom(slots[PRESS_MUST_OUTPUT_SLOT] ?? null, 'must'),
    outputRoom(slots[PRESS_POMACE_OUTPUT_SLOT] ?? null, 'pomace'),
  );
  if (completed <= 0) {
    return { slots, processStartTick: undefined, completed: 0, completedInputKind: null };
  }
  reduceInput(slots, PRESS_INPUT_SLOT, completed);
  addOutput(slots, PRESS_MUST_OUTPUT_SLOT, 'must', completed);
  addOutput(slots, PRESS_POMACE_OUTPUT_SLOT, 'pomace', completed);
  const nextBoundary = state.processStartTick + BigInt(completed) * PRESS_CYCLE_TICKS;
  return {
    slots,
    processStartTick: pressCanRun(slots) ? nextBoundary : undefined,
    completed,
    completedInputKind: input.itemKind,
  };
}

function fermentationCanRun(slots: readonly (CellarProductionStack | null)[]): boolean {
  const input = slots[FERMENTATION_INPUT_SLOT];
  return input?.itemKind === 'must' && input.quantity >= FERMENTATION_MUST_PER_BOTTLE
    && outputRoom(slots[FERMENTATION_OUTPUT_SLOT] ?? null, 'bottles') > 0;
}

export function settleFermentation(
  state: CellarProcessorState,
  authorityTick: bigint,
  cycleTicks = FERMENTATION_CYCLE_TICKS,
): SettledCellarProcessor {
  const slots = normalizeSlots(state.slots, FERMENTATION_SLOT_CAPACITY);
  if (!fermentationCanRun(slots)) {
    return { slots, processStartTick: undefined, completed: 0, completedInputKind: null };
  }
  if (state.processStartTick === undefined) {
    return { slots, processStartTick: authorityTick, completed: 0, completedInputKind: null };
  }
  const elapsed = authorityTick - state.processStartTick;
  if (elapsed < cycleTicks) {
    return { slots, processStartTick: state.processStartTick, completed: 0, completedInputKind: null };
  }
  const input = slots[FERMENTATION_INPUT_SLOT]!;
  const completed = Math.min(
    Number(elapsed / cycleTicks),
    Math.floor(input.quantity / FERMENTATION_MUST_PER_BOTTLE),
    outputRoom(slots[FERMENTATION_OUTPUT_SLOT] ?? null, 'bottles'),
  );
  if (completed <= 0) {
    return { slots, processStartTick: undefined, completed: 0, completedInputKind: null };
  }
  reduceInput(slots, FERMENTATION_INPUT_SLOT, completed * FERMENTATION_MUST_PER_BOTTLE);
  addOutput(slots, FERMENTATION_OUTPUT_SLOT, 'bottles', completed);
  const nextBoundary = state.processStartTick + BigInt(completed) * cycleTicks;
  return {
    slots,
    processStartTick: fermentationCanRun(slots) ? nextBoundary : undefined,
    completed,
    completedInputKind: input.itemKind,
  };
}

export function settleCellarProcessor(
  capability: CellarProcessorInterface,
  state: CellarProcessorState,
  authorityTick: bigint,
  fermentationCycleTicks = FERMENTATION_CYCLE_TICKS,
): SettledCellarProcessor {
  return capability === 'press'
    ? settleFruitPress(state, authorityTick)
    : settleFermentation(state, authorityTick, fermentationCycleTicks);
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

function outputMutationIsExtractionOnly(
  before: CellarProductionStack | null,
  after: CellarProductionStack | null,
): boolean {
  if (after === null) return true;
  return before !== null && before.itemKind === after.itemKind && after.quantity <= before.quantity;
}

/** Inputs may be moved normally; output slots are authority-created and
 * extraction-only. */
export function cellarProcessorMutationIsValid(
  capability: CellarProcessorInterface,
  before: readonly (CellarProductionStack | null)[],
  after: readonly (CellarProductionStack | null)[],
): boolean {
  const capacity = cellarProcessorSlotCapacity(capability);
  for (let slot = 0; slot < capacity; slot += 1) {
    const stack = after[slot] ?? null;
    if (stack !== null && !cellarProcessorSlotAccepts(capability, slot, stack.itemKind)) return false;
  }
  return cellarProcessorOutputSlots(capability).every((slot) => (
    outputMutationIsExtractionOnly(before[slot] ?? null, after[slot] ?? null)
  ));
}
