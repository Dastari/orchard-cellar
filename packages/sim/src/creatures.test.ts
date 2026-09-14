import { describe, expect, it } from 'vitest';
import { bootstrapContentDefinitions } from './content/bootstrap-registry.js';
import { definitionSlug } from './content/definitions.js';
import { buildContentRegistry } from './content/registry.js';
import {
  CREATURE_DEFINITIONS,
  resolveCreatureStats,
  runtimeCreatureCombatExperience,
  runtimeCreatureIsHuntable,
  runtimeCreatureRespawnTicks,
  runtimeResolveCreatureStats,
} from './creatures.js';
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

  it('resolves renamed active definitions by stable species and fails closed for retired or missing species', () => {
    const definitions = bootstrapContentDefinitions().map((definition) => {
      if (definition.id === 'creature:cow') return { ...definition, id: 'creature:moon_cow' as const };
      if (definition.kind === 'spawn' && definition.target === 'creature:cow') {
        return { ...definition, target: 'creature:moon_cow' as const };
      }
      return definition;
    });
    const built = buildContentRegistry(definitions.map((definition) => ({
      id: definition.id, kind: definition.kind, slug: definitionSlug(definition.id)!, json: definition,
    })));
    expect(built.report.valid).toBe(true);
    expect(runtimeResolveCreatureStats(built.registry, 'cow')?.maxHealthCenti).toBe(12_000);
    expect(runtimeCreatureIsHuntable(built.registry, 'cow')).toBe(true);
    expect(runtimeCreatureCombatExperience(built.registry, 'cow')).toBe(28);
    expect(runtimeCreatureRespawnTicks(built.registry, 'cow')).toBe(12_000);
    expect(runtimeResolveCreatureStats(built.registry, 'not_authored')).toBeNull();

    const retiredDefinitions = definitions.map((definition) => {
      if (definition.id === 'creature:moon_cow') {
        return { ...definition, retired: true, replacement: 'creature:horse' as const };
      }
      if (definition.kind === 'spawn' && definition.target === 'creature:moon_cow') {
        return { ...definition, target: 'creature:horse' as const };
      }
      return definition;
    });
    const retired = buildContentRegistry(retiredDefinitions.map((definition) => ({
      id: definition.id, kind: definition.kind, slug: definitionSlug(definition.id)!, json: definition,
    })));
    expect(runtimeCreatureIsHuntable(retired.registry, 'cow')).toBe(false);
    expect(runtimeResolveCreatureStats(retired.registry, 'cow')).toBeNull();
  });
});
