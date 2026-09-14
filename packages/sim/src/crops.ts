import { BOOTSTRAP_COMPILED_CONTENT } from './content/bootstrap-projection.js';
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

export interface CropDefinition {
  readonly kind: string;
  readonly displayName: string;
  readonly seedItemKind: string;
  readonly harvestItemKind: string;
  readonly assetKey: string;
  readonly signAssetKey: string;
  readonly growthTicks: bigint;
  readonly harvestQuantity: number;
  readonly seedBuyPriceBronze: number;
  readonly harvestSellPriceBronze: number;
  /** Quest crops may explicitly ignore the ordinary winter dormancy window. */
  readonly seasonless?: boolean;
  readonly tags?: readonly string[];
}

/** The source-sheet order is deliberately preserved. It is the common key
 * between gameplay data and the licensed Crops/Crops_2 artwork. The authored
 * values themselves come only from the committed bootstrap content pack. */
const BOOTSTRAP_CROPS = BOOTSTRAP_COMPILED_CONTENT.crops;
export const AUTHORED_CROP_DEFINITIONS: readonly CropDefinition[] = BOOTSTRAP_CROPS;
export const CROP_DEFINITIONS: readonly CropDefinition[] = Object.freeze(CROP_KINDS.map((kind) => {
  const definition = BOOTSTRAP_CROPS.find((candidate) => candidate.kind === kind);
  if (definition === undefined) throw new Error(`bootstrap_crop_missing:${kind}`);
  return definition;
}));

const AUTHORED_CROP_BY_KIND = new Map<string, CropDefinition>(
  AUTHORED_CROP_DEFINITIONS.map((definition) => [definition.kind, definition]),
);
const AUTHORED_CROP_BY_SEED = new Map<string, CropDefinition>(
  AUTHORED_CROP_DEFINITIONS.map((definition) => [definition.seedItemKind, definition]),
);
const STANDARD_CROP_BY_KIND = new Map<string, CropDefinition>(
  CROP_DEFINITIONS.map((definition) => [definition.kind, definition]),
);
const STANDARD_CROP_BY_SEED = new Map<string, CropDefinition>(
  CROP_DEFINITIONS.map((definition) => [definition.seedItemKind, definition]),
);

export function cropDefinition(kind: string): CropDefinition | null {
  return AUTHORED_CROP_BY_KIND.get(kind) ?? null;
}

export function cropDefinitionForSeed(itemKind: string): CropDefinition | null {
  return AUTHORED_CROP_BY_SEED.get(itemKind) ?? null;
}

export function cropStoredKindForSeed(_itemKind: string, definition: CropDefinition): string {
  return definition.kind;
}

export function isCropKind(kind: string): kind is CropKind {
  return STANDARD_CROP_BY_KIND.has(kind);
}

export function isCropSeedKind(kind: string): kind is `${CropKind}_seeds` {
  return STANDARD_CROP_BY_SEED.has(kind);
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
  const seasonProtected = greenhouseProtected || definition.seasonless === true;
  const intervalGrowth = (automaticallyWatered || hasBeenWatered) && growthEnd > growthStart
    ? cropSeasonalGrowthBetween(
      growthStart + calendarOffsetTicks,
      growthEnd + calendarOffsetTicks,
      seasonProtected,
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
    inSeason: seasonProtected
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
      tags: [
        'item.crop', 'item.food', `crop.${definition.kind}`,
        ...(['strawberry', 'watermelon'].includes(definition.kind) ? ['crop.fruit'] : []),
      ],
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
