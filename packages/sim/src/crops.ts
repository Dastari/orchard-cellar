import { AUTHORITY_HZ } from './net-timing.js';
import { AUTHORITY_TICKS_PER_DAY } from './time.js';

export const CROP_STAGE_COUNT = 4;
export const CROP_WATERING_TICKS = BigInt(AUTHORITY_TICKS_PER_DAY);

export const CROP_KINDS = [
  'wheat', 'tomato', 'carrot', 'turnip', 'corn', 'pumpkin', 'parsley', 'cabbage',
  'cucumber', 'hot_pepper', 'red_pepper', 'yellow_pepper', 'green_pepper',
  'watermelon', 'sunflower', 'garlic', 'potato', 'strawberry', 'beetroot',
  'onion', 'leek', 'grape',
] as const;

export type CropKind = (typeof CROP_KINDS)[number];

export interface CropDefinition {
  readonly kind: CropKind;
  readonly displayName: string;
  readonly seedItemKind: `${CropKind}_seeds`;
  readonly harvestItemKind: CropKind;
  readonly assetKey: `crop_cf_${CropKind}`;
  readonly signAssetKey: `sign_cf_crop_${CropKind}`;
  readonly growthTicks: bigint;
  readonly harvestQuantity: number;
  readonly seedBuyPriceBronze: number;
  readonly harvestSellPriceBronze: number;
}

function realMinutes(minutes: number): bigint {
  return BigInt(minutes * 60 * AUTHORITY_HZ);
}

function crop(
  kind: CropKind,
  displayName: string,
  growthMinutes: number,
  harvestQuantity: number,
  seedBuyPriceBronze: number,
  harvestSellPriceBronze: number,
): CropDefinition {
  return {
    kind,
    displayName,
    seedItemKind: `${kind}_seeds`,
    harvestItemKind: kind,
    assetKey: `crop_cf_${kind}`,
    signAssetKey: `sign_cf_crop_${kind}`,
    growthTicks: realMinutes(growthMinutes),
    harvestQuantity,
    seedBuyPriceBronze,
    harvestSellPriceBronze,
  };
}

/** The source-sheet order is deliberately preserved. It is the common key
 * between gameplay data and the licensed Crops/Crops_2 artwork. */
export const CROP_DEFINITIONS = [
  crop('wheat', 'Wheat', 60, 3, 18, 7),
  crop('tomato', 'Tomato', 105, 3, 28, 11),
  crop('carrot', 'Carrot', 75, 2, 20, 9),
  crop('turnip', 'Turnip', 60, 2, 18, 8),
  crop('corn', 'Corn', 120, 3, 32, 12),
  crop('pumpkin', 'Pumpkin', 150, 1, 42, 38),
  crop('parsley', 'Parsley', 45, 3, 14, 5),
  crop('cabbage', 'Cabbage', 90, 1, 24, 22),
  crop('cucumber', 'Cucumber', 90, 3, 24, 9),
  crop('hot_pepper', 'Hot Pepper', 105, 3, 28, 11),
  crop('red_pepper', 'Red Pepper', 105, 3, 30, 12),
  crop('yellow_pepper', 'Yellow Pepper', 105, 3, 30, 12),
  crop('green_pepper', 'Green Pepper', 105, 3, 30, 12),
  crop('watermelon', 'Watermelon', 150, 1, 44, 40),
  crop('sunflower', 'Sunflower', 90, 2, 24, 11),
  crop('garlic', 'Garlic', 75, 2, 20, 9),
  crop('potato', 'Potato', 75, 3, 22, 8),
  crop('strawberry', 'Strawberry', 120, 3, 34, 13),
  crop('beetroot', 'Beetroot', 75, 2, 20, 9),
  crop('onion', 'Onion', 75, 2, 20, 9),
  crop('leek', 'Leek', 90, 2, 24, 11),
  crop('grape', 'Grapes', 150, 3, 40, 15),
] as const satisfies readonly CropDefinition[];

const CROP_BY_KIND = new Map<string, CropDefinition>(
  CROP_DEFINITIONS.map((definition) => [definition.kind, definition]),
);
const CROP_BY_SEED = new Map<string, CropDefinition>(
  CROP_DEFINITIONS.map((definition) => [definition.seedItemKind, definition]),
);

export function cropDefinition(kind: string): CropDefinition | null {
  return CROP_BY_KIND.get(kind) ?? null;
}

export function cropDefinitionForSeed(itemKind: string): CropDefinition | null {
  return CROP_BY_SEED.get(itemKind) ?? null;
}

export function isCropKind(kind: string): kind is CropKind {
  return CROP_BY_KIND.has(kind);
}

export function isCropSeedKind(kind: string): kind is CropDefinition['seedItemKind'] {
  return CROP_BY_SEED.has(kind);
}

export interface CropGrowthSnapshot {
  readonly growthTicks: bigint;
  readonly remainingTicks: bigint;
  readonly progress: number;
  readonly stage: number;
  readonly mature: boolean;
  readonly watered: boolean;
  readonly wateredUntilTick: bigint;
}

/** Adds only the overlap between an observation interval and the current
 * watering window. This keeps growth closed-form and requires no crop ticks. */
export function wateredGrowthBetween(
  fromTick: bigint,
  toTick: bigint,
  wateredAtTick: bigint,
  wateringTicks = CROP_WATERING_TICKS,
): bigint {
  if (toTick <= fromTick || wateringTicks <= 0n) return 0n;
  const start = fromTick > wateredAtTick ? fromTick : wateredAtTick;
  const wateredUntil = wateredAtTick + wateringTicks;
  const end = toTick < wateredUntil ? toTick : wateredUntil;
  return end > start ? end - start : 0n;
}

export function cropGrowthAt(
  definition: CropDefinition,
  storedGrowthTicks: bigint,
  growthUpdatedAtTick: bigint,
  wateredAtTick: bigint,
  currentTick: bigint,
  hasBeenWatered = true,
): CropGrowthSnapshot {
  const accumulated = storedGrowthTicks + (hasBeenWatered ? wateredGrowthBetween(
    growthUpdatedAtTick, currentTick, wateredAtTick,
  ) : 0n);
  const growthTicks = accumulated < definition.growthTicks ? accumulated : definition.growthTicks;
  const remainingTicks = definition.growthTicks - growthTicks;
  const progress = definition.growthTicks === 0n
    ? 1
    : Number(growthTicks) / Number(definition.growthTicks);
  return {
    growthTicks,
    remainingTicks,
    progress,
    stage: Math.min(CROP_STAGE_COUNT - 1, Math.floor(progress * CROP_STAGE_COUNT)),
    mature: remainingTicks === 0n,
    watered: hasBeenWatered
      && currentTick >= wateredAtTick && currentTick < wateredAtTick + CROP_WATERING_TICKS,
    wateredUntilTick: wateredAtTick + CROP_WATERING_TICKS,
  };
}

export const CROP_SEED_ITEM_DEFINITIONS = Object.fromEntries(CROP_DEFINITIONS.map((definition) => [
  definition.seedItemKind,
  {
    displayName: `${definition.displayName} Seeds`,
    iconKey: `item_cf_${definition.seedItemKind}`,
    maxStack: 99,
    tags: ['item.seed', `seed.${definition.kind}`],
  },
])) as unknown as Readonly<Record<CropDefinition['seedItemKind'], {
  readonly displayName: string;
  readonly iconKey: string;
  readonly maxStack: number;
  readonly tags: readonly string[];
}>>;

export const CROP_HARVEST_ITEM_DEFINITIONS = Object.fromEntries(
  CROP_DEFINITIONS.filter((definition) => definition.kind !== 'grape').map((definition) => [
    definition.harvestItemKind,
    {
      displayName: definition.displayName,
      iconKey: `item_cf_crop_${definition.harvestItemKind}`,
      maxStack: 99,
      tags: ['item.crop', 'item.food', `crop.${definition.kind}`],
    },
  ]),
) as unknown as Readonly<Record<Exclude<CropKind, 'grape'>, {
  readonly displayName: string;
  readonly iconKey: string;
  readonly maxStack: number;
  readonly tags: readonly string[];
}>>;

export const CROP_SEED_ECONOMY = Object.fromEntries(CROP_DEFINITIONS.map((definition) => [
  definition.seedItemKind,
  { buyPriceBronze: definition.seedBuyPriceBronze, sellPriceBronze: Math.max(1, Math.floor(definition.seedBuyPriceBronze / 4)) },
])) as unknown as Readonly<Record<CropDefinition['seedItemKind'], {
  readonly buyPriceBronze: number;
  readonly sellPriceBronze: number;
}>>;

export const CROP_HARVEST_ECONOMY = Object.fromEntries(
  CROP_DEFINITIONS.filter((definition) => definition.kind !== 'grape').map((definition) => [
    definition.harvestItemKind,
    { buyPriceBronze: null, sellPriceBronze: definition.harvestSellPriceBronze },
  ]),
) as unknown as Readonly<Record<Exclude<CropKind, 'grape'>, {
  readonly buyPriceBronze: null;
  readonly sellPriceBronze: number;
}>>;
