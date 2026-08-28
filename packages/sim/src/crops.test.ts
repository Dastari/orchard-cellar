import { describe, expect, it } from 'vitest';
import {
  CROP_DEFINITIONS,
  CROP_WATERING_TICKS,
  cropDefinition,
  cropDefinitionForSeed,
  cropGrowthAt,
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
