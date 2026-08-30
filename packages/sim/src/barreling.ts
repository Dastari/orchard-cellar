import { CROP_DEFINITIONS, isCropKind, type CropKind } from './crops.js';
import { AUTHORITY_HZ } from './net-timing.js';

export const BARREL_SLOT_CAPACITY = 8;
export const BARREL_MIN_BATCH = 4;
export const BARREL_MAX_BATCH = 24;
export const BARREL_CURE_MINUTES = 30;
export const BARREL_CURE_TICKS = BigInt(BARREL_CURE_MINUTES * 60 * AUTHORITY_HZ);

export type PreservedCropKind = `preserved_${CropKind}`;

export const PRESERVED_CROP_ITEM_DEFINITIONS = Object.fromEntries(CROP_DEFINITIONS.map((crop) => [
  `preserved_${crop.kind}`,
  {
    displayName: `Preserved ${crop.displayName}`,
    iconKey: crop.kind === 'grape' ? 'item_cf_crop_grape' : `item_cf_crop_${crop.kind}`,
    quality: 'uncommon',
    maxStack: 99,
    tags: ['item.crop', 'item.food', 'item.preserved', `crop.${crop.kind}`],
  },
])) as unknown as Readonly<Record<PreservedCropKind, {
  readonly displayName: string;
  readonly iconKey: string;
  readonly quality: 'uncommon';
  readonly maxStack: number;
  readonly tags: readonly string[];
}>>;

export const PRESERVED_CROP_ECONOMY = Object.fromEntries(CROP_DEFINITIONS.map((crop) => [
  `preserved_${crop.kind}`,
  { buyPriceBronze: null, sellPriceBronze: Math.max(crop.harvestSellPriceBronze + 1, Math.ceil(crop.harvestSellPriceBronze * 1.5)) },
])) as unknown as Readonly<Record<PreservedCropKind, {
  readonly buyPriceBronze: null;
  readonly sellPriceBronze: number;
}>>;

export function preservedCropKind(cropKind: string): PreservedCropKind | null {
  return isCropKind(cropKind) ? `preserved_${cropKind}` : null;
}

export function cropKindForPreserved(itemKind: string): CropKind | null {
  const cropKind = itemKind.startsWith('preserved_') ? itemKind.slice('preserved_'.length) : '';
  return isCropKind(cropKind) ? cropKind : null;
}

export function isPreservedCropKind(itemKind: string): itemKind is PreservedCropKind {
  return cropKindForPreserved(itemKind) !== null;
}

export interface BarrelStack {
  readonly itemKind: string;
  readonly quantity: number;
  readonly durability?: number;
  readonly lit?: boolean;
}

export interface BarrelBatch {
  readonly cropKind: CropKind;
  readonly quantity: number;
}

export function barrelBatch(slots: readonly (BarrelStack | null)[]): BarrelBatch | null {
  let cropKind: CropKind | null = null;
  let quantity = 0;
  for (const stack of slots) {
    if (stack === null || stack.quantity <= 0) continue;
    if (!isCropKind(stack.itemKind)) return null;
    if (cropKind !== null && cropKind !== stack.itemKind) return null;
    cropKind = stack.itemKind;
    quantity += stack.quantity;
  }
  return cropKind === null ? null : { cropKind, quantity };
}

export function barrelCanSeal(
  slots: readonly (BarrelStack | null)[],
  maximumBatch = BARREL_MAX_BATCH,
): boolean {
  const batch = barrelBatch(slots);
  return batch !== null && batch.quantity >= BARREL_MIN_BATCH && batch.quantity <= maximumBatch;
}

function stacksEqual(left: BarrelStack | null, right: BarrelStack | null): boolean {
  return left?.itemKind === right?.itemKind && left?.quantity === right?.quantity
    && left?.durability === right?.durability && left?.lit === right?.lit;
}

/** Input stays single-crop and capped. A sealed batch is immutable; cured
 * output may only be removed, never manually inserted or mixed. */
export function barrelMutationIsValid(
  before: readonly (BarrelStack | null)[],
  after: readonly (BarrelStack | null)[],
  sealedAtTick: bigint | undefined,
  maximumBatch = BARREL_MAX_BATCH,
): boolean {
  if (sealedAtTick !== undefined) {
    return before.length === after.length
      && before.every((stack, index) => stacksEqual(stack, after[index] ?? null));
  }
  const beforePreserved = before.filter((stack): stack is BarrelStack => stack !== null && isPreservedCropKind(stack.itemKind));
  if (beforePreserved.length > 0) {
    const kind = beforePreserved[0]!.itemKind;
    const beforeQuantity = beforePreserved.reduce((sum, stack) => sum + stack.quantity, 0);
    const output = after.filter((stack): stack is BarrelStack => stack !== null);
    return output.every((stack) => stack.itemKind === kind)
      && output.reduce((sum, stack) => sum + stack.quantity, 0) <= beforeQuantity;
  }
  const batch = barrelBatch(after);
  return batch === null
    ? after.every((stack) => stack === null)
    : batch.quantity <= maximumBatch;
}

export interface SettledBarrel {
  readonly slots: readonly (BarrelStack | null)[];
  readonly sealedAtTick: bigint | undefined;
  readonly completedCropKind: CropKind | null;
  readonly completedQuantity: number;
}

export function settleBarrel(
  slots: readonly (BarrelStack | null)[],
  sealedAtTick: bigint | undefined,
  authorityTick: bigint,
  cureTicks = BARREL_CURE_TICKS,
  maximumBatch = BARREL_MAX_BATCH,
): SettledBarrel {
  if (sealedAtTick === undefined || authorityTick - sealedAtTick < cureTicks) {
    return { slots, sealedAtTick, completedCropKind: null, completedQuantity: 0 };
  }
  const batch = barrelBatch(slots);
  if (batch === null || !barrelCanSeal(slots, maximumBatch)) {
    return { slots, sealedAtTick: undefined, completedCropKind: null, completedQuantity: 0 };
  }
  const output = preservedCropKind(batch.cropKind);
  if (output === null) return { slots, sealedAtTick: undefined, completedCropKind: null, completedQuantity: 0 };
  return {
    slots: [{ itemKind: output, quantity: batch.quantity }, ...Array.from({ length: BARREL_SLOT_CAPACITY - 1 }, () => null)],
    sealedAtTick: undefined,
    completedCropKind: batch.cropKind,
    completedQuantity: batch.quantity,
  };
}

export function barrelProgress(
  sealedAtTick: bigint | undefined,
  authorityTick: bigint,
  cureTicks = BARREL_CURE_TICKS,
): number {
  if (sealedAtTick === undefined) return 0;
  const elapsed = authorityTick > sealedAtTick ? authorityTick - sealedAtTick : 0n;
  return Math.max(0, Math.min(1, Number(elapsed) / Number(cureTicks)));
}
