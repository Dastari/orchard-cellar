import { expect, it } from 'vitest';
import { bootstrapContentRegistry, runtimeObjectCarry, runtimeObjectDamageable,
  runtimeObjectFootprintTiles, runtimeObjectOccupiesTile, runtimeRecipeDefinition, recipeIngredientStacks } from '../index.js';

const registry = bootstrapContentRegistry();
const bench = { kind: 'workbench', tileX: 10, tileY: 20 };
it('authors a two-tile carryable workbench with axe salvage equal to its recipe inputs', () => {
  expect(runtimeObjectCarry(registry, bench)).toEqual({ mode: 'preserve_entity' });
  expect(runtimeObjectDamageable(registry, bench)).toEqual({ model: 'hits', maximumHits: 3,
    toolSpecialization: 'woodcutting', salvageRecipe: 'recipe:workbench' });
  expect(recipeIngredientStacks(runtimeRecipeDefinition(registry, 'workbench')!)).toEqual([{ itemKind: 'plank', quantity: 4 }]);
  for (const component of ['collision', 'placement'] as const) {
    expect(runtimeObjectFootprintTiles(registry, bench, component)).toEqual([{ tileX: 10, tileY: 20 }, { tileX: 11, tileY: 20 }]);
  }
  expect(runtimeObjectOccupiesTile(registry, bench, { tileX: 11, tileY: 20 })).toBe(true);
  expect(runtimeObjectOccupiesTile(registry, bench, { tileX: 12, tileY: 20 })).toBe(false);
});
it('honours authored holes, bottom-centred anchoring and retired definitions', () => {
  const definition = registry.objects.get('object:workbench')!;
  const objects = new Map(registry.objects);
  objects.set(definition.id, { ...definition, components: { collision: { footprint: [[15, 0, 15], [0, 15, 0]], blocksMovement: true } } });
  expect(runtimeObjectFootprintTiles({ objects }, bench, 'placement')).toEqual([
    { tileX: 9, tileY: 19 }, { tileX: 11, tileY: 19 }, { tileX: 10, tileY: 20 },
  ]);
  objects.set(definition.id, { ...definition, retired: true });
  expect(runtimeObjectFootprintTiles({ objects }, bench)).toEqual([]);
  objects.set(definition.id, { ...definition, components: {} });
  expect(runtimeObjectFootprintTiles({ objects }, bench)).toEqual([{ tileX: 10, tileY: 20 }]);
});
