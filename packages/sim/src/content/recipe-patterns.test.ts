import { describe, expect, it } from 'vitest';
import { bootstrapContentRegistry } from './bootstrap-registry.js';

// Owner rules (2026-09-24): crafting uses logical, Minecraft-style shaped
// patterns (the core material swapped per tier); only mixing/processing recipes
// are shapeless. Every shape is unique, and nothing can be crafted and resold
// for more than its materials.
const registry = bootstrapContentRegistry();
const recipes = [...registry.recipes.values()];
const sell = (id: string) => registry.items.get(id as never)?.economy.sell ?? 0;
const SHAPELESS_ALLOWED = new Set([
  'recipe:cellar_supper', 'recipe:pantry_lunch', 'recipe:orchard_tea', 'recipe:compost', 'recipe:planks', 'recipe:string',
]);
/** Deliberate value-adding products and tiny material conversions. */
const RESALE_EXEMPT = new Set(['recipe:orchard_tea', 'recipe:planks', 'recipe:sticks', 'recipe:string', 'recipe:topaz_ore']);

function trimmed(pattern: readonly (readonly (string | null)[])[]): string {
  const rows = pattern.map((row, y) => ({ row, y })).filter(({ row }) => row.some((cell) => cell !== null)).map(({ y }) => y);
  const width = Math.max(...pattern.map((row) => row.length));
  const cols = Array.from({ length: width }, (_, x) => x).filter((x) => pattern.some((row) => row[x] != null));
  return pattern.slice(rows[0], rows.at(-1)! + 1)
    .map((row) => cols.map((x) => row[x] ?? '.').slice(0, cols.at(-1)! - cols[0]! + 1).join(','))
    .join('/');
}

describe('crafting patterns', () => {
  it('keeps shapeless recipes to mixing and processing only', () => {
    expect(recipes.filter((recipe) => recipe.recipeKind === 'shapeless').map((recipe) => recipe.id).sort())
      .toEqual([...SHAPELESS_ALLOWED].sort());
  });

  it('gives every shaped recipe a unique pattern (the first match would win)', () => {
    const byPattern = new Map<string, string[]>();
    for (const recipe of recipes) {
      if (recipe.recipeKind !== 'shaped') continue;
      const key = trimmed(recipe.pattern);
      byPattern.set(key, [...(byPattern.get(key) ?? []), recipe.id]);
    }
    expect([...byPattern.values()].filter((ids) => ids.length > 1)).toEqual([]);
  });

  it('never resells a crafted output for more than its materials', () => {
    const loops = recipes.filter((recipe) => !RESALE_EXEMPT.has(recipe.id)).flatMap((recipe) => {
      const inputs = recipe.recipeKind === 'shaped'
        ? recipe.pattern.flat().reduce((sum, cell) => sum + (cell === null ? 0 : sell(cell)), 0)
        : recipe.inputs.reduce((sum, input) => sum + sell(input.item) * input.count, 0);
      const output = sell(recipe.output.item) * recipe.output.count;
      return output > inputs ? [`${recipe.id}: ${output} > ${inputs}`] : [];
    });
    expect(loops).toEqual([]);
  });

  it('crafts every sword and bow tier from the same shape with its core material swapped', () => {
    const shape = (id: string) => {
      const recipe = registry.recipes.get(`recipe:${id}` as never);
      return recipe?.recipeKind === 'shaped' ? recipe.pattern.map((row) => row.map((cell) => (cell === null ? '.' : cell === 'item:stick' || cell === 'item:string' ? cell : 'M')).join(' ')) : null;
    };
    const sword = shape('sword');
    for (const id of ['wooden_sword', 'stone_sword', 'copper_sword', 'silver_sword', 'gold_sword']) expect(shape(id)).toEqual(sword);
    const bow = shape('copper_bow');
    for (const id of ['iron_bow', 'silver_bow', 'gold_bow']) expect(shape(id)).toEqual(bow);
  });

  it('gives each sword and bow tier distinct stats', () => {
    for (const family of [
      ['wooden_sword', 'stone_sword', 'copper_sword', 'sword', 'silver_sword', 'gold_sword',
        'hearth_common_sword', 'hearth_uncommon_sword', 'hearth_rare_sword', 'hearth_epic_sword', 'hearth_legendary_sword'],
      ['bow', 'copper_bow', 'iron_bow', 'silver_bow', 'gold_bow',
        'hearth_common_bow', 'hearth_uncommon_bow', 'hearth_rare_bow', 'hearth_epic_bow', 'hearth_legendary_bow'],
    ]) {
      const damage = family.map((id) => registry.items.get(`item:${id}` as never)?.combat?.baseDamageCenti);
      expect(damage.every((value) => typeof value === 'number')).toBe(true);
      expect(new Set(damage).size).toBe(family.length);
      expect([...damage].sort((a, b) => a! - b!)).toEqual(damage);
    }
  });
});
