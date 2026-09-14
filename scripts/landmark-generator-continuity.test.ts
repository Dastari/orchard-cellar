import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  generateFarmerBobFarmDecorations,
  generateFishermanCampDecorations,
  generateMarlowCampDecorations,
  generateSurvivalDecorations,
  SURVIVAL_WORLD_SEED,
} from '../packages/sim/src/survival-world.js';

// Captured before replacing the three literal landmark generators. This is a
// continuity fixture, not a content-export fixture: never regenerate it merely
// because authored definitions changed. IDs, order and coordinates are durable.
const baseline = JSON.parse(readFileSync(new URL(
  '../packages/sim/src/fixtures/landmark-generator-continuity.json', import.meta.url,
), 'utf8')) as {
  readonly seed: number;
  readonly landmarks: readonly unknown[];
  readonly decorations: { readonly count: number; readonly sha256: string };
};

describe('authored landmark generator continuity', () => {
  it('preserves every original landmark row, id, position and ordering', () => {
    expect([
      generateMarlowCampDecorations(),
      generateFarmerBobFarmDecorations(),
      generateFishermanCampDecorations(),
    ]).toEqual(baseline.landmarks);
  });

  it('preserves the complete seeded decoration stream through authored expansion', () => {
    expect(SURVIVAL_WORLD_SEED).toBe(baseline.seed);
    const decorations = generateSurvivalDecorations(baseline.seed);
    expect(decorations).toHaveLength(baseline.decorations.count);
    expect(createHash('sha256').update(JSON.stringify(decorations)).digest('hex'))
      .toBe(baseline.decorations.sha256);
  });
});
