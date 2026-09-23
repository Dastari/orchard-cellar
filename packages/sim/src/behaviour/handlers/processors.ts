import type { ProcessContentDefinition } from '../../content/definitions.js';
import type { ObjectContentDefinition } from '../../content/object-definition.js';
import { maxStackFor, type ItemStack } from '../../item-containers.js';
import { effectsResult } from '../handler.js';
import {
  createHandlerRegistry,
  type AnyHandlerRegistration,
  type BehaviourHandlerRegistry,
} from '../registry.js';

export type ProcessAdapter = NonNullable<ProcessContentDefinition['adapter']>;

export interface ProcessSettlementState {
  readonly slots: readonly (ItemStack | null)[];
  readonly startTick: bigint | undefined;
  readonly lit?: boolean;
}

export interface ProcessSettlementOptions {
  readonly topology: ProcessTopology;
  /** Runtime upgrades may alter the authored duration without changing the live definition. */
  readonly ticksPerUnit?: bigint;
  readonly maximumBatch?: number;
  readonly minimumBatch?: number;
  /** Content-backed item stacks can replace the compiled bootstrap lookup. */
  readonly maxStackForItem?: (itemKind: string) => number | null;
  /** Authored processor components may bound offline catch-up. */
  readonly catchUpCap?: number;
}

export interface ProcessTopology {
  readonly slotCount: number;
  readonly inputSlots: readonly number[];
  readonly outputSlots: readonly number[];
  readonly fuelSlots: readonly number[];
}

export interface SettledProcess {
  readonly slots: readonly (ItemStack | null)[];
  readonly startTick: bigint | undefined;
  readonly completed: number;
  readonly completedInputKind: string | null;
}

function itemKind(id: string): string {
  return id.startsWith('item:') ? id.slice('item:'.length) : id;
}

export function processTopologyForObject(
  definition: ObjectContentDefinition,
): ProcessTopology | null {
  const processor = definition.components.processor;
  const container = definition.components.container;
  if (processor === undefined || container === undefined) return null;
  const inputSlots = processor.slotRoles.input ?? [];
  const outputSlots = processor.slotRoles.output ?? [];
  const fuelSlots = processor.slotRoles.fuel ?? [];
  if (inputSlots.length === 0 || outputSlots.length === 0) return null;
  return { slotCount: container.slotCount, inputSlots, outputSlots, fuelSlots };
}

function normalizedSlots(
  slots: readonly (ItemStack | null)[],
  slotCount: number,
): (ItemStack | null)[] {
  return Array.from({ length: slotCount }, (_, slot) => slots[slot] ?? null);
}

function outputRoom(
  stack: ItemStack | null,
  kind: string,
  maximumFor: (itemKind: string) => number | null,
): number {
  if (stack !== null && stack.itemKind !== kind) return 0;
  return Math.max(0, (maximumFor(kind) ?? 0) - (stack?.quantity ?? 0));
}

function reduceStack(stack: ItemStack, quantity: number): ItemStack | null {
  const nextQuantity = stack.quantity - quantity;
  return nextQuantity > 0 ? { ...stack, quantity: nextQuantity } : null;
}

function definitionsFor(
  definitions: Iterable<ProcessContentDefinition>,
  adapter: ProcessAdapter,
): readonly ProcessContentDefinition[] {
  return [...definitions]
    .filter((definition) => definition.adapter === adapter)
    .sort((left, right) => left.id.localeCompare(right.id));
}

export function processDurationTicks(
  definitions: Iterable<ProcessContentDefinition>,
  inputKind: string | undefined,
  fallbackTicks: number,
): bigint {
  const candidates = [...definitions].sort((left, right) => left.id.localeCompare(right.id));
  const definition = inputKind === undefined
    ? undefined
    : candidates.find(({ input }) => itemKind(input.item) === inputKind);
  return BigInt(definition?.ticksPerUnit ?? fallbackTicks);
}

export function processProgressAt(
  startTick: bigint | undefined,
  authorityTick: bigint,
  durationTicks: bigint,
): number {
  if (startTick === undefined || durationTicks <= 0n) return 0;
  const elapsed = authorityTick > startTick ? authorityTick - startTick : 0n;
  return Math.max(0, Math.min(1, Number(elapsed) / Number(durationTicks)));
}

export function processRemainingTicksAt(
  startTick: bigint | undefined,
  authorityTick: bigint,
  durationTicks: bigint,
): bigint | null {
  if (startTick === undefined || durationTicks <= 0n) return null;
  const elapsed = authorityTick > startTick ? authorityTick - startTick : 0n;
  return elapsed >= durationTicks ? 0n : durationTicks - elapsed;
}

function settleBarrelProcess(
  definitions: readonly ProcessContentDefinition[],
  state: ProcessSettlementState,
  authorityTick: bigint,
  options: ProcessSettlementOptions,
): SettledProcess {
  const slots = normalizedSlots(state.slots, options.topology.slotCount);
  if (state.startTick === undefined) {
    return { slots, startTick: undefined, completed: 0, completedInputKind: null };
  }
  const duration = options.ticksPerUnit ?? BigInt(definitions[0]?.ticksPerUnit ?? 0);
  if (duration <= 0n || authorityTick - state.startTick < duration) {
    return { slots, startTick: state.startTick, completed: 0, completedInputKind: null };
  }
  const occupied = options.topology.inputSlots
    .map((slot) => slots[slot] ?? null)
    .filter((slot): slot is ItemStack => slot !== null && slot.quantity > 0);
  const inputKind = occupied[0]?.itemKind ?? null;
  const homogeneous = inputKind !== null && occupied.every((slot) => slot.itemKind === inputKind);
  const definition = homogeneous
    ? definitions.find((candidate) => itemKind(candidate.input.item) === inputKind)
    : undefined;
  const quantity = occupied.reduce((sum, slot) => sum + slot.quantity, 0);
  const maximumBatch = options.maximumBatch ?? options.catchUpCap ?? Number.MAX_SAFE_INTEGER;
  const minimumBatch = options.minimumBatch ?? 1;
  if (definition === undefined || quantity < minimumBatch || quantity > maximumBatch) {
    // Legacy row-write parity: an invalid matured batch remains sealed because
    // its wrapper only persists a successful completion.
    return { slots, startTick: state.startTick, completed: 0, completedInputKind: null };
  }
  const output = definition.outputs[0];
  if (output === undefined || definition.input.count <= 0) {
    return { slots, startTick: state.startTick, completed: 0, completedInputKind: null };
  }
  const completed = Math.floor(quantity / definition.input.count);
  const outputQuantity = completed * output.count;
  const nextSlots = Array.from({ length: options.topology.slotCount }, () => null as ItemStack | null);
  nextSlots[options.topology.outputSlots[0]!] = {
    itemKind: itemKind(output.item), quantity: outputQuantity,
  };
  return {
    slots: nextSlots,
    startTick: undefined,
    completed: outputQuantity,
    completedInputKind: inputKind,
  };
}

/**
 * Settles every current processor from live process definitions. The adapter
 * selects only the stable slot topology; recipes, durations, fuel and outputs
 * all come from the supplied content registry.
 */
export function settleProcess(
  definitions: Iterable<ProcessContentDefinition>,
  adapter: ProcessAdapter,
  state: ProcessSettlementState,
  authorityTick: bigint,
  options: ProcessSettlementOptions,
): SettledProcess {
  const matching = definitionsFor(definitions, adapter);
  if (adapter === 'barrel') {
    return settleBarrelProcess(matching, state, authorityTick, options);
  }
  const slots = normalizedSlots(state.slots, options.topology.slotCount);
  const maximumFor = options.maxStackForItem ?? maxStackFor;
  const inputSlot = options.topology.inputSlots[0]!;
  const input = slots[inputSlot] ?? null;
  const definition = input === null
    ? undefined
    : matching.find((candidate) => itemKind(candidate.input.item) === input.itemKind);
  const duration = options.ticksPerUnit ?? BigInt(definition?.ticksPerUnit ?? 0);
  const outputs = definition?.outputs ?? [];
  const targets = options.topology.outputSlots;
  if (targets.length < outputs.length) {
    return { slots, startTick: undefined, completed: 0, completedInputKind: null };
  }
  const enabled = adapter !== 'campfire_cooking' || state.lit === true;
  const inputUnits = input === null || definition === undefined || definition.input.count <= 0
    ? 0
    : Math.floor(input.quantity / definition.input.count);
  const outputUnits = definition === undefined || outputs.length === 0
    ? 0
    : Math.min(...outputs.map((output, index) => Math.floor(
        outputRoom(
          slots[targets[index]!] ?? null,
          itemKind(output.item),
          maximumFor,
        ) / output.count,
      )));
  const fuelSlot = options.topology.fuelSlots[0];
  const fuel = fuelSlot === undefined ? null : slots[fuelSlot] ?? null;
  const fuelPolicy = definition?.fuelPolicy;
  const fuelAccepted = fuel !== null && fuelPolicy !== undefined
    && fuelPolicy.acceptedItems.some((id) => itemKind(id) === fuel.itemKind);
  const fuelUnits = fuelPolicy === undefined
    ? Number.MAX_SAFE_INTEGER
    : fuelAccepted && fuelPolicy !== undefined && fuelPolicy.unitsPerItem > 0
      ? fuel!.quantity * fuelPolicy.unitsPerItem
      : 0;
  const catchUpCap = options.catchUpCap === undefined
    ? Number.MAX_SAFE_INTEGER
    : Math.max(0, Math.trunc(options.catchUpCap));
  const availableUnits = Math.min(inputUnits, outputUnits, fuelUnits, catchUpCap);
  if (!enabled || definition === undefined || duration <= 0n || availableUnits <= 0) {
    return { slots, startTick: undefined, completed: 0, completedInputKind: null };
  }
  if (state.startTick === undefined) {
    return { slots, startTick: authorityTick, completed: 0, completedInputKind: null };
  }
  const elapsed = authorityTick - state.startTick;
  if (elapsed < duration) {
    return { slots, startTick: state.startTick, completed: 0, completedInputKind: null };
  }
  const completed = Math.min(Number(elapsed / duration), availableUnits);
  if (completed <= 0) {
    return { slots, startTick: undefined, completed: 0, completedInputKind: null };
  }
  slots[inputSlot] = reduceStack(input!, completed * definition.input.count);
  if (fuelPolicy !== undefined && fuelSlot !== undefined) {
    const consumedFuel = Math.ceil(completed / fuelPolicy!.unitsPerItem);
    slots[fuelSlot] = reduceStack(fuel!, consumedFuel);
  }
  outputs.forEach((output, index) => {
    const slot = targets[index]!;
    const current = slots[slot];
    slots[slot] = {
      itemKind: itemKind(output.item),
      quantity: (current?.quantity ?? 0) + completed * output.count,
    };
  });
  const nextBoundary = state.startTick + BigInt(completed) * duration;
  const remainingInput = slots[inputSlot];
  const canContinue = remainingInput !== null
    && remainingInput.itemKind === input!.itemKind
    && remainingInput.quantity >= definition.input.count
    && outputs.every((output, index) => (
      outputRoom(
        slots[targets[index]!] ?? null,
        itemKind(output.item),
        maximumFor,
      ) >= output.count
    ))
    && (fuelPolicy === undefined || (fuelSlot !== undefined && (slots[fuelSlot]?.quantity ?? 0) > 0));
  return {
    slots,
    startTick: canContinue ? nextBoundary : undefined,
    completed,
    completedInputKind: input!.itemKind,
  };
}

const PROCESSOR_EVENTS = Object.freeze([
  'use',
  'slotChanged',
  'timer',
] as const);

/** Registry-derived migration bridge for the authoring parity checklist (wiki: Studio/Authoring Suite) row 7. */
export function processorHandlerRegistrations(
  objects: Iterable<ObjectContentDefinition>,
): readonly AnyHandlerRegistration[] {
  const tags = [...new Set([...objects].flatMap((definition) => (
    definition.components.processor === undefined
      ? [] : [definition.components.processor.processTag]
  )))].sort();
  return Object.freeze(PROCESSOR_EVENTS.flatMap((eventType) => tags.map((tag) => ({
    id: `processor.${eventType}.${tag}`,
    eventType,
    source: 'target' as const,
    match: { kind: 'tag' as const, tag },
    priority: 120,
    handler: () => effectsResult([{ settleProcess: true }], { continue: eventType === 'use' }),
  }))) as readonly AnyHandlerRegistration[]);
}

/** Canonical registry construction makes repeated wiring safe and deterministic. */
export function registerProcessorHandlers(
  objects: Iterable<ObjectContentDefinition>,
  registry: BehaviourHandlerRegistry = createHandlerRegistry(),
): BehaviourHandlerRegistry {
  const existing = new Set(registry.registrations.map(({ id }) => id));
  return createHandlerRegistry([
    ...registry.registrations,
    ...processorHandlerRegistrations(objects).filter(({ id }) => !existing.has(id)),
  ]);
}
