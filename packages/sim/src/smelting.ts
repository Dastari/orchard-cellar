import { bootstrapDefinitionsOfKind } from './content/bootstrap-pack-loader.js';
import { BOOTSTRAP_COMPILED_CONTENT } from './content/bootstrap-projection.js';
import { AUTHORITY_HZ } from './net-timing.js';

export const FURNACE_INPUT_SLOT = 0;
export const FURNACE_FUEL_SLOT = 1;
export const FURNACE_OUTPUT_SLOT = 2;
export const FURNACE_SLOT_CAPACITY = 3;

/** Smelting is deliberately an early-game commitment, not an instant craft. */
const bootstrapSmeltingProcesses = bootstrapDefinitionsOfKind('process')
  .filter(({ adapter }) => adapter === 'smelting')
  .sort((left, right) => left.id.localeCompare(right.id));
export const FURNACE_SMELT_TICKS = BigInt(
  bootstrapSmeltingProcesses[0]?.ticksPerUnit ?? 0,
);
export const FURNACE_SMELT_MINUTES = Number(FURNACE_SMELT_TICKS) / (60 * AUTHORITY_HZ);

export const SMELTING_RECIPES: Readonly<Record<string, string>> =
  BOOTSTRAP_COMPILED_CONTENT.smeltingRecipes;

export type SmeltableOreKind = keyof typeof SMELTING_RECIPES;
export type SmeltedBarKind = typeof SMELTING_RECIPES[SmeltableOreKind];

export function smeltingOutputFor(itemKind: string): SmeltedBarKind | null {
  return Object.prototype.hasOwnProperty.call(SMELTING_RECIPES, itemKind)
    ? SMELTING_RECIPES[itemKind as SmeltableOreKind] ?? null
    : null;
}

/** Wood and planks each fire one bar. Sticks intentionally are not fuel. */
export function furnaceFuelSmelts(itemKind: string): number {
  return bootstrapDefinitionsOfKind('item').find(({ id }) => id === `item:${itemKind}`)?.fuel?.smelts ?? 0;
}

export function furnaceSlotAccepts(slot: number, itemKind: string): boolean {
  if (slot === FURNACE_INPUT_SLOT) return smeltingOutputFor(itemKind) !== null;
  if (slot === FURNACE_FUEL_SLOT) return furnaceFuelSmelts(itemKind) > 0;
  if (slot === FURNACE_OUTPUT_SLOT) return Object.values(SMELTING_RECIPES).includes(itemKind as SmeltedBarKind);
  return false;
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
