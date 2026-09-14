import { describe, expect, it } from 'vitest';
import { bootstrapContentRegistry, bootstrapContentRows } from './bootstrap-registry.js';
import { buildContentRegistry } from './registry.js';
import { runtimeNormalizeDurability, runtimeToolCanMineResource, runtimeWearTool } from './runtime.js';
import { rollLoot } from '../behaviour/handlers/loot.js';
import { parseContentDefinition } from './definitions.js';

const registry = bootstrapContentRegistry();
const originals = { axe: 200, pickaxe: 250, hoe: 180, shovel: 220 };
const materials = { wood: 1, stone: 1.5, copper: 1, gold: 2, silver: 2.5, iron: 3 };
const slug = (material: string, tool: string) => material === 'wood' ? tool : `${material}_${tool}`;

describe('authored tool material progression', () => {
  it('preserves original runtime IDs and every stored wear value while renaming their presentation', () => {
    for (const [tool, maximum] of Object.entries(originals)) {
      expect(registry.items.get(`item:${tool}`)?.displayName).toBe(`Wooden ${tool[0]!.toUpperCase()}${tool.slice(1)}`);
      for (let remaining = 0; remaining <= maximum; remaining += 1) {
        expect(runtimeNormalizeDurability(registry, tool, remaining)).toBe(remaining);
      }
      expect(runtimeNormalizeDurability(registry, tool)).toBe(maximum);
      expect(runtimeWearTool(registry, tool, 1)).toEqual({ durability: 0, broken: true });
    }
  });

  it('keeps speed and cost unchanged while increasing material durability with the explicit copper exception', () => {
    for (const [tool, maximum] of Object.entries(originals)) {
      const base = registry.items.get(`item:${tool}`)!;
      for (const [material, multiplier] of Object.entries(materials)) {
        const item = registry.items.get(`item:${slug(material, tool)}`)!;
        expect(item.durability?.max).toBe(maximum * multiplier);
        expect(item.vigour).toEqual(base.vigour);
        expect(item.tool?.swingTicks).toBe(base.tool?.swingTicks);
        expect(item.tool?.reachTiles).toBe(tool === 'hoe' ? 2 : 1);
        expect(item.icon.asset).toBe(`icon_tool_${material}_${tool}`);
      }
    }
  });

  it('uses authored mining permissions independently of material durability and vein quality', () => {
    for (const material of Object.keys(materials)) {
      const tool = slug(material, 'pickaxe');
      for (const kind of ['ore_copper', 'ore_iron', 'rock_large']) expect(runtimeToolCanMineResource(registry, tool, kind)).toBe(true);
      for (const kind of ['ore_gold', 'ore_emerald', 'ore_sapphire', 'ore_ruby', 'ore_topaz', 'ore_amethyst']) {
        expect(runtimeToolCanMineResource(registry, tool, kind)).toBe(['copper', 'silver', 'iron'].includes(material));
      }
    }
    expect(runtimeToolCanMineResource(registry, 'shovel', 'ore_iron')).toBe(false);
    expect(runtimeToolCanMineResource(registry, 'missing', 'ore_iron')).toBe(false);
  });

  it('honors renamed active definitions and changed permissions, failing closed after retirement or metadata removal', () => {
    const rows = bootstrapContentRows();
    const template = rows.find(({ id }) => id === 'item:pickaxe')!;
    const original = registry.items.get('item:pickaxe')!;
    const build = (retired: boolean, mineableResources?: readonly string[]) => buildContentRegistry([
      ...rows,
      { ...template, id: 'item:survey_tool', slug: 'survey_tool', json: JSON.stringify({
        ...original, id: 'item:survey_tool', retired,
        tool: { ...original.tool, mineableResources },
      }) },
    ]).registry;
    expect(runtimeToolCanMineResource(build(false, ['ore_ruby']), 'survey_tool', 'ore_ruby')).toBe(true);
    expect(runtimeToolCanMineResource(build(false, ['ore_ruby']), 'survey_tool', 'ore_iron')).toBe(false);
    expect(runtimeToolCanMineResource(build(true, ['ore_ruby']), 'survey_tool', 'ore_ruby')).toBe(false);
    expect(runtimeToolCanMineResource(build(false), 'survey_tool', 'ore_iron')).toBe(false);
    expect(() => parseContentDefinition('item', { ...original, tool: { ...original.tool, mineableResources: [5] } })).toThrow();
  });

  it('authors all 24 shaped workbench recipes with exact heads and two sticks, preserving book grants', () => {
    const ingredients: Record<string, string> = { wood: 'plank', stone: 'stone', copper: 'copper_bar', gold: 'gold_bar', silver: 'silver_bar', iron: 'iron_bar' };
    const heads: Record<string, number> = { axe: 3, pickaxe: 3, hoe: 2, shovel: 1 };
    const book = registry.items.get('item:marlow_book')!;
    const learned = book.onUse.flatMap(({ effects }) => effects.flatMap((effect) => 'learnRecipes' in effect ? effect.learnRecipes : []));
    for (const [material, ingredient] of Object.entries(ingredients)) {
      for (const tool of Object.keys(originals)) {
        const id = `recipe:${slug(material, tool)}`;
        const recipe = registry.recipes.get(id)!;
        expect(recipe.recipeKind).toBe('shaped');
        if (recipe.recipeKind !== 'shaped') throw new Error('shaped recipe required');
        const cells = recipe.pattern.flat();
        expect(cells.filter((cell) => cell === `item:${ingredient}`)).toHaveLength(heads[tool]!);
        expect(cells.filter((cell) => cell === 'item:stick')).toHaveLength(2);
        expect(recipe.stationRequirement).toEqual({ objectTag: 'station.workbench' });
        expect(recipe.output).toEqual({ item: `item:${slug(material, tool)}`, count: 1 });
        expect(learned).toContain(id);
      }
    }
    expect(learned).toContain('recipe:arrows');
    expect(learned).toContain('recipe:furnace');
  });

  it('adds obtainable silver as secondary loot without replacing any primary iron yield, then smelts through the generic furnace', () => {
    const definition = registry.loots.get('loot:mining_ore_iron')!;
    const primaryOnly = new Map(registry.loots);
    primaryOnly.set(definition.id, { ...definition, groups: definition.groups.filter(({ id }) => id !== 'silver_trace') });
    let silver = 0;
    for (let seed = 0; seed < 1_000; seed += 1) {
      const request = { lootId: definition.id, seedParts: [seed], context: { values: { nodeClass: 'pure', richnessRemaining: 5, producedOre: false } } } as const;
      const actual = rollLoot(registry.loots, request);
      const original = rollLoot(primaryOnly, request);
      expect(actual.drops.filter(({ itemKind }) => itemKind !== 'silver_ore')).toEqual(original.drops);
      expect(actual.flags).toEqual(original.flags);
      silver += actual.drops.filter(({ itemKind }) => itemKind === 'silver_ore').reduce((count, drop) => count + drop.quantity, 0);
    }
    expect(silver).toBeGreaterThan(50);
    expect(silver).toBeLessThan(150);
    expect(registry.processes.get('process:smelt_silver_ore')).toMatchObject({ stationTag: 'station.furnace', input: { item: 'item:silver_ore', count: 1 }, outputs: [{ item: 'item:silver_bar', count: 1 }], adapter: 'smelting' });
  });
});
