import { BOOTSTRAP_COMPILED_CONTENT } from './content/bootstrap-projection.js';
import { AUTHORITY_TICKS_PER_DAY, DAYS_PER_SEASON } from './time.js';

export const CROP_STAGE_COUNT = 4;
export const CROP_WATERING_TICKS = BigInt(AUTHORITY_TICKS_PER_DAY);
export const EMPTY_TOPSIDE_SOIL_DECAY_DAYS = 7;
export const EMPTY_TOPSIDE_SOIL_DECAY_TICKS = BigInt(
  AUTHORITY_TICKS_PER_DAY * EMPTY_TOPSIDE_SOIL_DECAY_DAYS,
);

/** Crop identifiers are authored data. This deliberately remains a generic
 * string so adding a reviewed crop never requires rebuilding a literal union. */
export type CropKind = string;
export type CropSeedKind = string;

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
  readonly wateringTicks?: bigint;
  readonly tags?: readonly string[];
}

/** The compiled projection preserves authored source-sheet order. Definitions
 * tagged as quest-only remain available to runtime lookup without entering the
 * standard merchant/art compatibility catalogue. */
const BOOTSTRAP_CROPS = BOOTSTRAP_COMPILED_CONTENT.crops;
export const AUTHORED_CROP_DEFINITIONS: readonly CropDefinition[] = BOOTSTRAP_CROPS;
export const CROP_DEFINITIONS: readonly CropDefinition[] = Object.freeze(
  BOOTSTRAP_CROPS.filter((definition) => !definition.tags?.includes('crop.quest')),
);
/** Bootstrap-only compatibility projection. Live authority must resolve crops
 * from its active ContentRegistry via runtimeCropDefinition*. */
export const CROP_KINDS: readonly string[] = Object.freeze(
  CROP_DEFINITIONS.map(({ kind }) => kind),
);

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

export function isCropSeedKind(kind: string): kind is CropSeedKind {
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
  const wateredUntil = wateredAtTick + (definition.wateringTicks ?? CROP_WATERING_TICKS);
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
      && currentTick >= wateredAtTick && currentTick < wateredAtTick + (definition.wateringTicks ?? CROP_WATERING_TICKS)),
    wateredUntilTick: automaticallyWatered
      ? currentTick + (definition.wateringTicks ?? CROP_WATERING_TICKS)
      : wateredAtTick + (definition.wateringTicks ?? CROP_WATERING_TICKS),
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

function bootstrapItemDefinition(itemKind: string) {
  const definition = BOOTSTRAP_COMPILED_CONTENT.itemDefinitions[itemKind];
  if (definition === undefined) throw new Error(`bootstrap_crop_item_missing:${itemKind}`);
  return definition;
}

function bootstrapItemEconomy(itemKind: string) {
  const economy = BOOTSTRAP_COMPILED_CONTENT.itemEconomy[itemKind];
  if (economy === undefined) throw new Error(`bootstrap_crop_economy_missing:${itemKind}`);
  return economy;
}

/** Retained compatibility exports, now projected entirely from parsed item and
 * crop content rather than maintaining a second catalogue in TypeScript. */
export const CROP_SEED_ITEM_DEFINITIONS = Object.freeze(Object.fromEntries(
  CROP_DEFINITIONS.map(({ seedItemKind }) => [
    seedItemKind, bootstrapItemDefinition(seedItemKind),
  ]),
));

export const CROP_HARVEST_ITEM_DEFINITIONS = Object.freeze(Object.fromEntries(
  CROP_DEFINITIONS.map(({ harvestItemKind }) => [
    harvestItemKind, bootstrapItemDefinition(harvestItemKind),
  ]),
));

export const CROP_SEED_ECONOMY = Object.freeze(Object.fromEntries(
  CROP_DEFINITIONS.map(({ seedItemKind }) => [
    seedItemKind, bootstrapItemEconomy(seedItemKind),
  ]),
));

export const CROP_HARVEST_ECONOMY = Object.freeze(Object.fromEntries(
  CROP_DEFINITIONS.map(({ harvestItemKind }) => [
    harvestItemKind, bootstrapItemEconomy(harvestItemKind),
  ]),
));
