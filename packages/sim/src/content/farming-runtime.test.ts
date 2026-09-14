import { describe, expect, it } from 'vitest';
import { bootstrapContentRegistry } from './bootstrap-registry.js';
import { parseObjectDefinition } from './object-definition.js';
import { buildContentRegistry } from './registry.js';
import { bootstrapContentRows } from './bootstrap-registry.js';
import {
  runtimeObjectIrrigatesTile,
  runtimeObjectProtectsCropSeasons,
  runtimeRecipeSkillSatisfied,
} from './farming-runtime.js';

describe('authored farming capabilities', () => {
  it('uses the active definition and authored radius for arbitrary object IDs', () => {
    const base = bootstrapContentRegistry();
    const sprinkler = base.objects.get('object:sprinkler')!;
    const authored = parseObjectDefinition({ ...sprinkler, id: 'object:rain_tower',
      components: { ...sprinkler.components, farming: { irrigation: { radiusTiles: 4 } } } });
    const registry = { objects: new Map([...base.objects, [authored.id, authored]]) };
    const placed = { kind: 'sprinkler', definitionId: authored.id, tileX: 10, tileY: 10 };
    expect(runtimeObjectIrrigatesTile(registry, placed, 14, 14)).toBe(true);
    expect(runtimeObjectIrrigatesTile(registry, placed, 15, 10)).toBe(false);
    expect(runtimeObjectIrrigatesTile(base, placed, 10, 10)).toBe(false);
    const retired = { objects: new Map([[authored.id, { ...authored, retired: true }]]) };
    expect(runtimeObjectIrrigatesTile(retired, placed, 10, 10)).toBe(false);
  });

  it('requires the season-protection component instead of the persisted kind', () => {
    const base = bootstrapContentRegistry();
    const greenhouse = base.objects.get('object:greenhouse')!;
    const protectedObject = parseObjectDefinition({ ...greenhouse, id: 'object:winter_garden' });
    const registry = { objects: new Map([...base.objects, [protectedObject.id, protectedObject]]) };
    expect(runtimeObjectProtectsCropSeasons(registry,
      { kind: 'sprinkler', definitionId: protectedObject.id })).toBe(true);
    expect(runtimeObjectProtectsCropSeasons(registry,
      { kind: 'greenhouse', definitionId: 'object:sprinkler' })).toBe(false);
    expect(runtimeObjectProtectsCropSeasons(registry,
      { kind: 'greenhouse', definitionId: 'object:missing' })).toBe(false);
  });

  it('bounds irrigation authoring and rejects unknown or empty capabilities', () => {
    const object = bootstrapContentRegistry().objects.get('object:sprinkler')!;
    for (const farming of [
      {}, { irrigation: { radiusTiles: -1 } }, { irrigation: { radiusTiles: 33 } },
      { irrigation: { radiusTiles: 1.5 } }, { seasonProtection: 'world' },
      { irrigation: { radiusTiles: 2, unbounded: true } },
    ]) {
      expect(() => parseObjectDefinition({ ...object, components: { ...object.components, farming } }))
        .toThrow();
    }
  });

  it('applies authored recipe skill requirements and validates their references', () => {
    const base = bootstrapContentRegistry();
    const recipe = [...base.recipes.values()].find((entry) => entry.skillRequirement !== undefined)!;
    expect(recipe).toBeDefined();
    const requirement = recipe.skillRequirement!;
    const renamed = { ...recipe, id: 'recipe:custom_garden' as const };
    const registry = { ...base, recipes: new Map([[renamed.id, renamed]]) };
    expect(runtimeRecipeSkillSatisfied(registry, renamed.id, {})).toBe(false);
    expect(runtimeRecipeSkillSatisfied(registry, renamed.id,
      { farmcraft: 1, barreling: 1, [requirement.skillNode]: requirement.minimumRank })).toBe(true);
    expect(runtimeRecipeSkillSatisfied(registry, renamed.id,
      { [requirement.skillNode]: requirement.minimumRank })).toBe(false);
    expect(runtimeRecipeSkillSatisfied(registry, 'missing', {})).toBe(false);
    const rows = bootstrapContentRows().map((row) => row.id !== recipe.id ? row : {
      ...row, json: JSON.stringify({ ...recipe,
        skillRequirement: { skillNode: 'unknown_skill', minimumRank: 1 } }),
    });
    expect(buildContentRegistry(rows).report.valid).toBe(false);
  });
});
