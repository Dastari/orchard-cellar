import { describe, expect, it } from 'vitest';
import {
  generatePlayerAppearance,
  isPlayerAppearanceSelection,
  runtimePlayerAppearanceCatalog,
} from './appearance.js';
import { bootstrapContentDefinitions, bootstrapContentRegistry } from './content/bootstrap-registry.js';
import { buildContentRegistry } from './content/registry.js';

const catalog = runtimePlayerAppearanceCatalog(bootstrapContentRegistry())!;

describe('generatePlayerAppearance', () => {
  it('is stable for the same identity regardless of hex casing', () => {
    const identity = '0123456789abcdef0123456789abcdef';
    expect(generatePlayerAppearance(catalog, identity)).toEqual(generatePlayerAppearance(catalog, identity.toUpperCase()));
    expect(generatePlayerAppearance(catalog, identity)).toEqual({
      hairKind: 'hair_1_brown', shirtKind: 'farmer_purple',
      pantsKind: 'farmer_green', shoesKind: 'blue',
    });
  });

  it('only returns supported modular parts', () => {
    const appearance = generatePlayerAppearance(catalog, 'deadbeef'.repeat(8));
    expect(catalog.hairKinds).toContain(appearance.hairKind);
    expect(catalog.shirtKinds).toContain(appearance.shirtKind);
    expect(catalog.pantsKinds).toContain(appearance.pantsKind);
    expect(catalog.shoesKinds).toContain(appearance.shoesKind);
  });

  it('gives a varied set of identities varied looks', () => {
    const looks = new Set(Array.from({ length: 32 }, (_, index) => JSON.stringify(
      generatePlayerAppearance(catalog, index.toString(16).padStart(64, '0')),
    )));
    expect(looks.size).toBeGreaterThan(20);
  });

  it('validates only authored modular appearance combinations', () => {
    expect(isPlayerAppearanceSelection(catalog, {
      hairKind: 'hair_1_brown', shirtKind: 'farmer_green',
      pantsKind: 'farmer_blue', shoesKind: 'red',
    })).toBe(true);
    expect(isPlayerAppearanceSelection(catalog, {
      hairKind: 'admin_hair', shirtKind: 'farmer_green',
      pantsKind: 'farmer_blue', shoesKind: 'red',
    })).toBe(false);
  });

  it('resolves a renamed active loadout and fails closed for missing content', () => {
    const definitions = bootstrapContentDefinitions().map((definition) => definition.kind === 'loadout'
      ? { ...definition, id: 'loadout:renamed_arrival' as const,
        appearance: { ...definition.appearance, hairKinds: ['custom_hair'] } }
      : definition);
    const renamed = buildContentRegistry(definitions.map((definition) => ({
      id: definition.id, kind: definition.kind, json: definition,
    })));
    expect(renamed.report.valid).toBe(true);
    expect(runtimePlayerAppearanceCatalog(renamed.registry)?.hairKinds).toEqual(['custom_hair']);
    expect(generatePlayerAppearance(runtimePlayerAppearanceCatalog(renamed.registry)!, 'identity').hairKind)
      .toBe('custom_hair');
    expect(runtimePlayerAppearanceCatalog(buildContentRegistry([]).registry)).toBeNull();
    const loadout = bootstrapContentDefinitions().find((definition) => definition.kind === 'loadout')!;
    const retired = buildContentRegistry([{
      id: loadout.id, kind: loadout.kind, json: { ...loadout, retired: true },
    }]);
    expect(runtimePlayerAppearanceCatalog(retired.registry)).toBeNull();
  });
});
