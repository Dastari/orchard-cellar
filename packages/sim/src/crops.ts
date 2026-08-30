import { AUTHORITY_HZ } from './net-timing.js';
import { AUTHORITY_TICKS_PER_DAY, DAYS_PER_SEASON } from './time.js';

export const CROP_STAGE_COUNT = 4;
export const CROP_WATERING_TICKS = BigInt(AUTHORITY_TICKS_PER_DAY);
export const EMPTY_TOPSIDE_SOIL_DECAY_DAYS = 7;
export const EMPTY_TOPSIDE_SOIL_DECAY_TICKS = BigInt(
  AUTHORITY_TICKS_PER_DAY * EMPTY_TOPSIDE_SOIL_DECAY_DAYS,
);

export const CROP_KINDS = [
  'wheat', 'tomato', 'carrot', 'turnip', 'corn', 'pumpkin', 'parsley', 'cabbage',
  'cucumber', 'hot_pepper', 'red_pepper', 'yellow_pepper', 'green_pepper',
  'watermelon', 'sunflower', 'garlic', 'potato', 'strawberry', 'beetroot',
  'onion', 'leek', 'grape',
] as const;

export type CropKind = (typeof CROP_KINDS)[number];

export const FARMER_BOB_FAST_STRAWBERRY_SEEDS = 'bob_fast_strawberry_seeds';
export const FARMER_BOB_FAST_STRAWBERRY_CROP = 'bob_fast_strawberry';
export const FARMER_BOB_FAST_STRAWBERRY_GROWTH_TICKS = BigInt(30 * AUTHORITY_HZ);

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
  crop('wheat', 'Wheat', 12, 3, 18, 7),
  crop('tomato', 'Tomato', 20, 3, 28, 11),
  crop('carrot', 'Carrot', 15, 2, 20, 9),
  crop('turnip', 'Turnip', 12, 2, 18, 8),
  crop('corn', 'Corn', 25, 3, 32, 12),
  crop('pumpkin', 'Pumpkin', 30, 1, 42, 38),
  crop('parsley', 'Parsley', 8, 3, 14, 5),
  crop('cabbage', 'Cabbage', 18, 1, 24, 22),
  crop('cucumber', 'Cucumber', 18, 3, 24, 9),
  crop('hot_pepper', 'Hot Pepper', 20, 3, 28, 11),
  crop('red_pepper', 'Red Pepper', 20, 3, 30, 12),
  crop('yellow_pepper', 'Yellow Pepper', 20, 3, 30, 12),
  crop('green_pepper', 'Green Pepper', 20, 3, 30, 12),
  crop('watermelon', 'Watermelon', 30, 1, 44, 40),
  crop('sunflower', 'Sunflower', 18, 2, 24, 11),
  crop('garlic', 'Garlic', 15, 2, 20, 9),
  crop('potato', 'Potato', 15, 3, 22, 8),
  crop('strawberry', 'Strawberry', 25, 3, 34, 13),
  crop('beetroot', 'Beetroot', 15, 2, 20, 9),
  crop('onion', 'Onion', 15, 2, 20, 9),
  crop('leek', 'Leek', 18, 2, 24, 11),
  crop('grape', 'Grapes', 30, 3, 40, 15),
] as const satisfies readonly CropDefinition[];

const CROP_BY_KIND = new Map<string, CropDefinition>(
  CROP_DEFINITIONS.map((definition) => [definition.kind, definition]),
);
const CROP_BY_SEED = new Map<string, CropDefinition>(
  CROP_DEFINITIONS.map((definition) => [definition.seedItemKind, definition]),
);

export function cropDefinition(kind: string): CropDefinition | null {
  if (kind === FARMER_BOB_FAST_STRAWBERRY_CROP) {
    const strawberry = CROP_BY_KIND.get('strawberry');
    return strawberry === undefined ? null : {
      ...strawberry,
      growthTicks: FARMER_BOB_FAST_STRAWBERRY_GROWTH_TICKS,
    };
  }
  return CROP_BY_KIND.get(kind) ?? null;
}

export function cropDefinitionForSeed(itemKind: string): CropDefinition | null {
  if (itemKind === FARMER_BOB_FAST_STRAWBERRY_SEEDS) {
    return cropDefinition(FARMER_BOB_FAST_STRAWBERRY_CROP);
  }
  return CROP_BY_SEED.get(itemKind) ?? null;
}

export function cropStoredKindForSeed(itemKind: string, definition: CropDefinition): string {
  return itemKind === FARMER_BOB_FAST_STRAWBERRY_SEEDS
    ? FARMER_BOB_FAST_STRAWBERRY_CROP
    : definition.kind;
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
  readonly inSeason: boolean;
}

const CROP_ACTIVE_SEASON_TICKS = BigInt(AUTHORITY_TICKS_PER_DAY * DAYS_PER_SEASON * 3);
const CROP_YEAR_TICKS = BigInt(AUTHORITY_TICKS_PER_DAY * DAYS_PER_SEASON * 4);

function activeSeasonTicksBefore(tick: bigint): bigint {
  const safe = tick > 0n ? tick : 0n;
  const years = safe / CROP_YEAR_TICKS;
  const withinYear = safe % CROP_YEAR_TICKS;
  return years * CROP_ACTIVE_SEASON_TICKS
    + (withinYear < CROP_ACTIVE_SEASON_TICKS ? withinYear : CROP_ACTIVE_SEASON_TICKS);
}

/** Spring through autumn are the broad outdoor growing window. This prefix
 * calculation remains O(1) even when a reconnect spans many game years. */
export function cropSeasonalGrowthBetween(
  fromCalendarTick: bigint,
  toCalendarTick: bigint,
  greenhouseProtected = false,
): bigint {
  if (toCalendarTick <= fromCalendarTick) return 0n;
  if (greenhouseProtected) return toCalendarTick - fromCalendarTick;
  return activeSeasonTicksBefore(toCalendarTick) - activeSeasonTicksBefore(fromCalendarTick);
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
  automaticallyWatered = false,
  calendarOffsetTicks = 0n,
  greenhouseProtected = false,
): CropGrowthSnapshot {
  const growthStart = automaticallyWatered
    ? growthUpdatedAtTick
    : growthUpdatedAtTick > wateredAtTick ? growthUpdatedAtTick : wateredAtTick;
  const wateredUntil = wateredAtTick + CROP_WATERING_TICKS;
  const growthEnd = automaticallyWatered
    ? currentTick
    : currentTick < wateredUntil ? currentTick : wateredUntil;
  const intervalGrowth = (automaticallyWatered || hasBeenWatered) && growthEnd > growthStart
    ? cropSeasonalGrowthBetween(
      growthStart + calendarOffsetTicks,
      growthEnd + calendarOffsetTicks,
      greenhouseProtected,
    )
    : 0n;
  const accumulated = storedGrowthTicks + intervalGrowth;
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
    watered: automaticallyWatered || (hasBeenWatered
      && currentTick >= wateredAtTick && currentTick < wateredAtTick + CROP_WATERING_TICKS),
    wateredUntilTick: automaticallyWatered
      ? currentTick + CROP_WATERING_TICKS
      : wateredAtTick + CROP_WATERING_TICKS,
    inSeason: greenhouseProtected
      || (((currentTick + calendarOffsetTicks) > 0n ? currentTick + calendarOffsetTicks : 0n)
        % CROP_YEAR_TICKS) < CROP_ACTIVE_SEASON_TICKS,
  };
}

/** Empty overworld soil gets a fresh grace period whenever it is tilled,
 * watered, or returned to an empty cultivated state after harvest. */
export function emptySoilDecayAtTick(
  tilledAtTick: bigint,
  wateredAtTick: bigint,
  decayTicks = EMPTY_TOPSIDE_SOIL_DECAY_TICKS,
): bigint {
  const lastTendedTick = tilledAtTick > wateredAtTick ? tilledAtTick : wateredAtTick;
  return lastTendedTick + decayTicks;
}

export function emptySoilDecayDue(
  currentTick: bigint,
  decayAtTick: bigint,
  cropOccupiesTile: boolean,
): boolean {
  return !cropOccupiesTile && currentTick >= decayAtTick;
}

export const CROP_SEED_ITEM_DEFINITIONS = Object.fromEntries(CROP_DEFINITIONS.map((definition) => [
  definition.seedItemKind,
  {
    displayName: `${definition.displayName} Seeds`,
    iconKey: `item_cf_${definition.seedItemKind}`,
    quality: 'common',
    maxStack: 99,
    tags: ['item.seed', `seed.${definition.kind}`],
  },
])) as unknown as Readonly<Record<CropDefinition['seedItemKind'], {
  readonly displayName: string;
  readonly iconKey: string;
  readonly quality: 'common';
  readonly maxStack: number;
  readonly tags: readonly string[];
}>>;

export const CROP_HARVEST_ITEM_DEFINITIONS = Object.fromEntries(
  CROP_DEFINITIONS.filter((definition) => definition.kind !== 'grape').map((definition) => [
    definition.harvestItemKind,
    {
      displayName: definition.displayName,
      iconKey: `item_cf_crop_${definition.harvestItemKind}`,
      quality: 'common',
      maxStack: 99,
      tags: ['item.crop', 'item.food', `crop.${definition.kind}`],
    },
  ]),
) as unknown as Readonly<Record<Exclude<CropKind, 'grape'>, {
  readonly displayName: string;
  readonly iconKey: string;
  readonly quality: 'common';
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
