import { describe, expect, it } from 'vitest';
import { bootstrapContentRegistry, bootstrapContentDefinitions } from './content/bootstrap-registry.js';
import { delveCompletionRecipe, delveCompletionRewardError, delveCompletionTotal } from './delve-keepsake.js';
import { runtimeRecipeDefinition } from './content/runtime.js';
import { hearthFurnitureShapeFromDefinition } from './hearth-furniture-placement.js';
const registry = bootstrapContentRegistry();
const definitions = bootstrapContentDefinitions();

describe('Delve keepsake content contract', () => {
  it('provides a knowledge-gated peaceful home recipe without a sale payout', () => {
    const recipe = delveCompletionRecipe(registry)!;
    expect(recipe.id).toBe('recipe:delver_memorial_planter');
    expect(recipe).toMatchObject({ requiresKnowledge: true, stationRequirement: { objectTag: 'station.workbench' },
      inputs: [{ item: 'item:stone', count: 4 }, { item: 'item:fiber', count: 8 }, { item: 'item:sunflower', count: 2 }] });
    expect(runtimeRecipeDefinition(registry, 'delver_memorial_planter')?.requiresKnowledge).toBe(true);
    expect(registry.items.get(recipe.output.item)?.economy?.sell).toBe(0);
    const object = registry.objects.get('object:delver_memorial_planter')!;
    expect(object.components.placement?.spaces).toEqual(['residence']);
    expect(hearthFurnitureShapeFromDefinition(object)).not.toBeNull();
    expect(delveCompletionRewardError(definitions)).toBeNull();
  });
  it('allows disabled rewards while rejecting ambiguous, saleable or ungated keepsakes', () => {
    const reward = registry.items.get('item:delver_memorial_planter')!;
    const recipe = registry.recipes.get('recipe:delver_memorial_planter')!;
    expect(delveCompletionRewardError(definitions.filter(d => d.id !== reward.id))).toBeNull();
    expect(delveCompletionRewardError([...definitions, { ...reward, id: 'item:duplicate_reward' }])).toContain('at most one');
    expect(delveCompletionRewardError(definitions.map(d => d.id === reward.id ? { ...reward, economy: { buy: 0, sell: 10 } } : d)))
      .toContain('non-saleable');
    expect(delveCompletionRewardError(definitions.map(d => d.id === recipe.id ? { ...recipe, requiresKnowledge: false } : d)))
      .toContain('knowledge-gated');
    const items = new Map(registry.items); items.set(reward.id, { ...reward, retired: true });
    expect(delveCompletionRecipe({ ...registry, items })).toBeNull();
  });
  it('reads only bounded completion receipts and never treats arbitrary quest flags as wins', () => {
    expect(delveCompletionTotal(undefined)).toBe(0n);
    expect(delveCompletionTotal('quest.completed')).toBe(0n);
    expect(delveCompletionTotal('delve.completed:-1')).toBe(0n);
    expect(delveCompletionTotal(`delve.completed:${1n << 64n}`)).toBe(0n);
    expect(delveCompletionTotal('delve.completed:12')).toBe(12n);
  });
});
