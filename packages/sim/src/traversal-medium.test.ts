import { expect, it } from 'vitest';
import { RULE_MEDIA } from './rule-catalogue.js';
import { terrainCellMedium } from './traversal-medium.js';

it('shares biome, authored surface and explicit role precedence without artwork inference', () => {
  expect(terrainCellMedium({ biome: 'water' })).toBe('deep_water');
  expect(terrainCellMedium({ biome: 'lava', surface: 'water' })).toBe('lava');
  expect(terrainCellMedium({ biome: 'plains', surface: 'water' })).toBe('shallow_water');
  expect(terrainCellMedium({ biome: 'plains', feature: 'river' })).toBe('shallow_water');
  for (const biome of ['freshwater', 'oasis_water', 'waterfall'] as const) {
    expect(terrainCellMedium({ biome })).toBe('shallow_water');
  }
  for (const ruleMedium of RULE_MEDIA) expect(terrainCellMedium({ biome: 'water', ruleMedium })).toBe(ruleMedium);
  expect(terrainCellMedium({ biome: 'plains' })).toBe('land');
  expect(() => terrainCellMedium({ biome: 'water', ruleMedium: 'bogus' as never })).toThrow('Unknown rule medium');
});
