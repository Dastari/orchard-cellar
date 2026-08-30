import { maxStackFor, type ItemStack } from './item-containers.js';
import { AUTHORITY_HZ } from './net-timing.js';

export const FURNACE_INPUT_SLOT = 0;
export const FURNACE_FUEL_SLOT = 1;
export const FURNACE_OUTPUT_SLOT = 2;
export const FURNACE_SLOT_CAPACITY = 3;

/** Smelting is deliberately an early-game commitment, not an instant craft. */
export const FURNACE_SMELT_MINUTES = 5;
export const FURNACE_SMELT_TICKS = BigInt(FURNACE_SMELT_MINUTES * 60 * AUTHORITY_HZ);

export const SMELTING_RECIPES = {
  iron_ore: 'iron_bar',
  copper_ore: 'copper_bar',
  gold_ore: 'gold_bar',
} as const;

export type SmeltableOreKind = keyof typeof SMELTING_RECIPES;
export type SmeltedBarKind = typeof SMELTING_RECIPES[SmeltableOreKind];

export function smeltingOutputFor(itemKind: string): SmeltedBarKind | null {
  return Object.prototype.hasOwnProperty.call(SMELTING_RECIPES, itemKind)
    ? SMELTING_RECIPES[itemKind as SmeltableOreKind]
    : null;
}

/** Wood and planks each fire one bar. Sticks intentionally are not fuel. */
export function furnaceFuelSmelts(itemKind: string): number {
  return itemKind === 'wood' || itemKind === 'plank' ? 1 : 0;
}

export function furnaceSlotAccepts(slot: number, itemKind: string): boolean {
  if (slot === FURNACE_INPUT_SLOT) return smeltingOutputFor(itemKind) !== null;
  if (slot === FURNACE_FUEL_SLOT) return furnaceFuelSmelts(itemKind) > 0;
  if (slot === FURNACE_OUTPUT_SLOT) return Object.values(SMELTING_RECIPES).includes(itemKind as SmeltedBarKind);
  return false;
}

export interface FurnaceState {
  readonly slots: readonly (ItemStack | null)[];
  readonly smeltStartTick: bigint | undefined;
}

export interface SettledFurnace {
  readonly slots: readonly (ItemStack | null)[];
  readonly smeltStartTick: bigint | undefined;
  readonly completed: number;
}

function canSmelt(slots: readonly (ItemStack | null)[]): boolean {
  const input = slots[FURNACE_INPUT_SLOT] ?? null;
  const fuel = slots[FURNACE_FUEL_SLOT] ?? null;
  const output = slots[FURNACE_OUTPUT_SLOT] ?? null;
  if (input === null || fuel === null || input.quantity <= 0 || fuel.quantity <= 0) return false;
  const resultKind = smeltingOutputFor(input.itemKind);
  if (resultKind === null || furnaceFuelSmelts(fuel.itemKind) <= 0) return false;
  return output === null || (output.itemKind === resultKind && output.quantity < (maxStackFor(resultKind) ?? 0));
}

function reduced(stack: ItemStack, quantity: number): ItemStack | null {
  const nextQuantity = stack.quantity - quantity;
  return nextQuantity > 0 ? { ...stack, quantity: nextQuantity } : null;
}

/** Applies elapsed furnace time lazily. No per-furnace timer row is needed. */
export function settleFurnace(state: FurnaceState, authorityTick: bigint): SettledFurnace {
  const slots = Array.from({ length: FURNACE_SLOT_CAPACITY }, (_, slot) => state.slots[slot] ?? null);
  if (!canSmelt(slots)) return { slots, smeltStartTick: undefined, completed: 0 };
  if (state.smeltStartTick === undefined) return { slots, smeltStartTick: authorityTick, completed: 0 };
  const elapsed = authorityTick - state.smeltStartTick;
  if (elapsed < FURNACE_SMELT_TICKS) return { slots, smeltStartTick: state.smeltStartTick, completed: 0 };

  const input = slots[FURNACE_INPUT_SLOT]!;
  const fuel = slots[FURNACE_FUEL_SLOT]!;
  const outputKind = smeltingOutputFor(input.itemKind)!;
  const output = slots[FURNACE_OUTPUT_SLOT];
  const elapsedSmelts = Number(elapsed / FURNACE_SMELT_TICKS);
  const outputSpace = (maxStackFor(outputKind) ?? 0) - (output?.quantity ?? 0);
  const completed = Math.min(elapsedSmelts, input.quantity, fuel.quantity, outputSpace);
  if (completed <= 0) return { slots, smeltStartTick: undefined, completed: 0 };

  slots[FURNACE_INPUT_SLOT] = reduced(input, completed);
  slots[FURNACE_FUEL_SLOT] = reduced(fuel, completed);
  slots[FURNACE_OUTPUT_SLOT] = {
    itemKind: outputKind,
    quantity: (output?.quantity ?? 0) + completed,
  };
  const nextStartTick = state.smeltStartTick + BigInt(completed) * FURNACE_SMELT_TICKS;
  return {
    slots,
    smeltStartTick: canSmelt(slots) ? nextStartTick : undefined,
    completed,
  };
}

export function furnaceProgress(smeltStartTick: bigint | undefined, authorityTick: bigint): number {
  if (smeltStartTick === undefined) return 0;
  const elapsed = authorityTick > smeltStartTick ? authorityTick - smeltStartTick : 0n;
  return Math.max(0, Math.min(1, Number(elapsed) / Number(FURNACE_SMELT_TICKS)));
}

export function furnaceRemainingTicks(
  smeltStartTick: bigint | undefined,
  authorityTick: bigint,
): bigint | null {
  if (smeltStartTick === undefined) return null;
  const elapsed = authorityTick > smeltStartTick ? authorityTick - smeltStartTick : 0n;
  return elapsed >= FURNACE_SMELT_TICKS ? 0n : FURNACE_SMELT_TICKS - elapsed;
}

/** Players may extract output but cannot insert or replace it manually. */
export function furnaceMutationIsValid(
  before: readonly (ItemStack | null)[],
  after: readonly (ItemStack | null)[],
): boolean {
  for (let slot = 0; slot < FURNACE_SLOT_CAPACITY; slot += 1) {
    const stack = after[slot] ?? null;
    if (stack !== null && !furnaceSlotAccepts(slot, stack.itemKind)) return false;
  }
  const previousOutput = before[FURNACE_OUTPUT_SLOT] ?? null;
  const nextOutput = after[FURNACE_OUTPUT_SLOT] ?? null;
  if (nextOutput === null) return true;
  return previousOutput !== null
    && previousOutput.itemKind === nextOutput.itemKind
    && nextOutput.quantity <= previousOutput.quantity;
}
