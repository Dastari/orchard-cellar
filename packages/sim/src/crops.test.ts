import { describe, expect, it } from 'vitest';
import {
  CROP_DEFINITIONS,
  CROP_WATERING_TICKS,
  EMPTY_TOPSIDE_SOIL_DECAY_TICKS,
  cropDefinition,
  cropDefinitionForSeed,
  cropGrowthAt,
  emptySoilDecayAtTick,
  emptySoilDecayDue,
  wateredGrowthBetween,
} from './crops.js';

describe('crop catalogue', () => {
  it('covers the 22 authored crop groups and maps every seed back to its crop', () => {
    expect(CROP_DEFINITIONS).toHaveLength(22);
    expect(new Set(CROP_DEFINITIONS.map(({ kind }) => kind)).size).toBe(22);
    for (const definition of CROP_DEFINITIONS) {
      expect(cropDefinition(definition.kind)).toBe(definition);
      expect(cropDefinitionForSeed(definition.seedItemKind)).toBe(definition);
    }
  });
});

describe('water-gated crop growth', () => {
  const wheat = cropDefinition('wheat')!;

  it('advances only inside the watering window', () => {
    expect(wateredGrowthBetween(100n, 200n, 150n, 25n)).toBe(25n);
    expect(wateredGrowthBetween(200n, 300n, 150n, 25n)).toBe(0n);
  });

  it('pauses after water expires and resumes from settled progress', () => {
    const paused = cropGrowthAt(wheat, 0n, 100n, 100n, 100n + CROP_WATERING_TICKS + 500n);
    expect(paused.growthTicks).toBe(CROP_WATERING_TICKS);
    expect(paused.watered).toBe(false);

    const resumedAt = 100n + CROP_WATERING_TICKS + 500n;
    const resumed = cropGrowthAt(wheat, paused.growthTicks, resumedAt, resumedAt, resumedAt + 100n);
    expect(resumed.growthTicks).toBe(CROP_WATERING_TICKS + 100n);
    expect(resumed.watered).toBe(true);
  });

  it('does not treat the zero timestamp on never-watered soil as a watering window', () => {
    const dry = cropGrowthAt(wheat, 0n, 0n, 0n, 100n, false);
    expect(dry.growthTicks).toBe(0n);
    expect(dry.watered).toBe(false);
  });

  it('clamps mature crops to the final visual stage', () => {
    const mature = cropGrowthAt(wheat, wheat.growthTicks, 0n, 0n, 0n);
    expect(mature).toMatchObject({ progress: 1, stage: 3, mature: true });
    expect(mature.remainingTicks).toBe(0n);
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
