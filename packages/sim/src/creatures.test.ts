import { describe, expect, it } from 'vitest';
import { CREATURE_DEFINITIONS, resolveCreatureStats } from './creatures.js';
import { WILDLIFE_SPECIES } from './wildlife.js';

describe('25§8 creature statlines', () => {
  it('gives every generated animal the shared non-hostile stat shape', () => {
    expect(Object.keys(CREATURE_DEFINITIONS).sort()).toEqual([...WILDLIFE_SPECIES].sort());
    for (const species of WILDLIFE_SPECIES) {
      const definition = CREATURE_DEFINITIONS[species];
      const stats = resolveCreatureStats(species);
      expect(definition.hostile, species).toBe(false);
      expect(definition.level, species).toBeGreaterThan(0);
      expect(stats.maxHealthCenti, species).toBe(definition.attributes.str * 1_000);
    }
  });

  it('establishes a full derived statline for horses before combat exists', () => {
    expect(resolveCreatureStats('horse')).toMatchObject({
      maxHealthCenti: 14_000,
      maxManaCenti: 2_000,
      maxVigourCenti: 14_000,
    });
  });
});
