import { describe, expect, it } from 'vitest';
import {
  CROP_DEFINITIONS,
  FARMER_BOB_FAST_STRAWBERRY_CROP,
  FARMER_BOB_FAST_STRAWBERRY_SEEDS,
  CROP_WATERING_TICKS,
  EMPTY_TOPSIDE_SOIL_DECAY_TICKS,
  cropDefinition,
  cropDefinitionForSeed,
  cropStoredKindForSeed,
  cropGrowthAt,
  cropSeasonalGrowthBetween,
  emptySoilDecayAtTick,
  emptySoilDecayDue,
  wateredGrowthBetween,
} from './crops.js';
import { AUTHORITY_HZ } from './net-timing.js';
import { AUTHORITY_TICKS_PER_DAY, DAYS_PER_SEASON } from './time.js';

describe('crop catalogue', () => {
  it('covers the 22 authored crop groups and maps every seed back to its crop', () => {
    expect(CROP_DEFINITIONS).toHaveLength(22);
    expect(new Set(CROP_DEFINITIONS.map(({ kind }) => kind)).size).toBe(22);
    for (const definition of CROP_DEFINITIONS) {
      expect(cropDefinition(definition.kind)).toBe(definition);
      expect(cropDefinitionForSeed(definition.seedItemKind)).toBe(definition);
    }
  });

  it('keeps the live farming loop between 8 and 30 real minutes', () => {
    const minuteTicks = BigInt(60 * AUTHORITY_HZ);
    const durations = CROP_DEFINITIONS.map(({ growthTicks }) => growthTicks);
    expect(durations.every((ticks) => ticks >= 8n * minuteTicks)).toBe(true);
    expect(durations.every((ticks) => ticks <= 30n * minuteTicks)).toBe(true);
    expect(cropDefinition('parsley')?.growthTicks).toBe(8n * minuteTicks);
    expect(cropDefinition('grape')?.growthTicks).toBe(30n * minuteTicks);
  });

  it('gives Bob\'s quest seed a one-water, thirty-second strawberry crop', () => {
    const definition = cropDefinitionForSeed(FARMER_BOB_FAST_STRAWBERRY_SEEDS);
    expect(definition).toMatchObject({ kind: 'strawberry', harvestItemKind: 'strawberry' });
    expect(definition?.growthTicks).toBe(BigInt(30 * AUTHORITY_HZ));
    if (definition === null) throw new Error('missing fast strawberry definition');
    expect(cropStoredKindForSeed(FARMER_BOB_FAST_STRAWBERRY_SEEDS, definition))
      .toBe(FARMER_BOB_FAST_STRAWBERRY_CROP);
    expect(cropDefinition(FARMER_BOB_FAST_STRAWBERRY_CROP)).toStrictEqual(definition);
  });
});

describe('water-gated crop growth', () => {
  const wheat = cropDefinition('wheat')!;
  const grape = cropDefinition('grape')!;

  it('advances only inside the watering window', () => {
    expect(wateredGrowthBetween(100n, 200n, 150n, 25n)).toBe(25n);
    expect(wateredGrowthBetween(200n, 300n, 150n, 25n)).toBe(0n);
  });

  it('pauses after water expires and resumes from settled progress', () => {
    const paused = cropGrowthAt(grape, 0n, 100n, 100n, 100n + CROP_WATERING_TICKS + 500n);
    expect(paused.growthTicks).toBe(CROP_WATERING_TICKS);
    expect(paused.watered).toBe(false);

    const resumedAt = 100n + CROP_WATERING_TICKS + 500n;
    const resumed = cropGrowthAt(grape, paused.growthTicks, resumedAt, resumedAt, resumedAt + 100n);
    expect(resumed.growthTicks).toBe(CROP_WATERING_TICKS + 100n);
    expect(resumed.watered).toBe(true);
  });

  it('does not treat the zero timestamp on never-watered soil as a watering window', () => {
    const dry = cropGrowthAt(wheat, 0n, 0n, 0n, 100n, false);
    expect(dry.growthTicks).toBe(0n);
    expect(dry.watered).toBe(false);
  });

  it('derives continuous offline growth while a sprinkler covers the tile', () => {
    const automated = cropGrowthAt(wheat, 0n, 1_000n, 0n, 1_250n, false, true);
    expect(automated.growthTicks).toBe(250n);
    expect(automated.watered).toBe(true);
    expect(automated.wateredUntilTick).toBe(1_250n + CROP_WATERING_TICKS);
  });

  it('clamps mature crops to the final visual stage', () => {
    const mature = cropGrowthAt(wheat, wheat.growthTicks, 0n, 0n, 0n);
    expect(mature).toMatchObject({ progress: 1, stage: 3, mature: true });
    expect(mature.remainingTicks).toBe(0n);
  });
});

describe('season-gated crop growth', () => {
  const seasonTicks = BigInt(AUTHORITY_TICKS_PER_DAY * DAYS_PER_SEASON);
  const winterStarts = seasonTicks * 3n;

  it('counts spring through autumn but pauses throughout winter', () => {
    expect(cropSeasonalGrowthBetween(100n, 250n)).toBe(150n);
    expect(cropSeasonalGrowthBetween(winterStarts + 100n, winterStarts + 250n)).toBe(0n);
    expect(cropSeasonalGrowthBetween(winterStarts - 100n, winterStarts + 100n)).toBe(100n);
  });

  it('lets greenhouse crops grow continuously through winter', () => {
    expect(cropSeasonalGrowthBetween(winterStarts + 100n, winterStarts + 250n, true)).toBe(150n);
  });

  it('reports outdoor winter dormancy while greenhouse crops remain active', () => {
    const wheat = cropDefinition('wheat')!;
    const plantedTick = winterStarts + 100n;
    const outdoor = cropGrowthAt(wheat, 0n, plantedTick, 0n, plantedTick + 200n, false, true);
    const greenhouse = cropGrowthAt(wheat, 0n, plantedTick, 0n, plantedTick + 200n, false, true, 0n, true);

    expect(outdoor).toMatchObject({ growthTicks: 0n, inSeason: false });
    expect(greenhouse).toMatchObject({ growthTicks: 200n, inSeason: true });
  });
});

describe('empty overworld soil decay', () => {
  it('gives newly tilled soil seven game days of grace', () => {
    expect(emptySoilDecayAtTick(100n, 0n)).toBe(100n + EMPTY_TOPSIDE_SOIL_DECAY_TICKS);
  });

  it('restarts the grace period from the newest watering or empty-soil refresh', () => {
    expect(emptySoilDecayAtTick(100n, 250n)).toBe(250n + EMPTY_TOPSIDE_SOIL_DECAY_TICKS);
    expect(emptySoilDecayAtTick(300n, 250n)).toBe(300n + EMPTY_TOPSIDE_SOIL_DECAY_TICKS);
  });

  it('decays exactly at the deadline only while the tile is empty', () => {
    expect(emptySoilDecayDue(699n, 700n, false)).toBe(false);
    expect(emptySoilDecayDue(700n, 700n, false)).toBe(true);
    expect(emptySoilDecayDue(900n, 700n, true)).toBe(false);
  });
});
