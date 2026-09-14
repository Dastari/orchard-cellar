import { describe, expect, it } from 'vitest';
import {
  SURVIVAL_WORLD_SEED,
  TOPSIDE_SPACE_ID,
  bootstrapContentRegistry,
  createSurvivalCollisionMap,
} from '@orchard/sim';
import { precomputedSurvivalCollisionMap } from './precomputed-survival-collision.js';
import { terrainCollisionForSpace } from './world-rules.js';

describe('precomputed survival collision', () => {
  const contentRegistry = bootstrapContentRegistry();
  for (const medium of ['ground', 'water'] as const) {
    it(`is byte-for-byte equivalent to the fixed-seed ${medium} generator`, () => {
      const generated = createSurvivalCollisionMap(SURVIVAL_WORLD_SEED, [], medium);
      const precomputed = precomputedSurvivalCollisionMap(medium);

      expect(precomputed.width).toBe(generated.width);
      expect(precomputed.height).toBe(generated.height);
      expect(precomputed.blocked).toEqual(generated.blocked);
      expect(precomputed.horseJumpableTerrain).toEqual(generated.horseJumpableTerrain);
      expect(precomputed.elevations).toEqual(generated.elevations);
      expect(precomputed.terrainMinimumElevation).toEqual(generated.terrainMinimumElevation);
      expect(precomputed.terrainTransitions).toEqual(generated.terrainTransitions);
      expect(precomputed.terrainPlaneBlocked).toEqual(generated.terrainPlaneBlocked);
      expect(precomputed.obstacles).toEqual(generated.obstacles);
    }, 60_000);
  }

  it('preserves the generated island air semantics', () => {
    const generated = createSurvivalCollisionMap(SURVIVAL_WORLD_SEED, [], 'air');
    const precomputed = terrainCollisionForSpace(contentRegistry, TOPSIDE_SPACE_ID, 'air');
    expect(precomputed.blocked).toEqual(generated.blocked);
    expect(precomputed.obstacles).toEqual(generated.obstacles);
    expect(precomputed.elevations).toEqual(generated.elevations);
  });
});
