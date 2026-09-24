import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import {
  bootstrapContentRegistry,
  runtimeConsumeCraftingRecipe,
  runtimeRecipeIdsUnlockedByBook,
} from '@orchard/sim';
import { buildHearthEquipmentAcquisition } from './hearth-equipment-acquisition.js';

const registry = bootstrapContentRegistry();
const pack = buildHearthEquipmentAcquisition(registry.items);

it('authors exactly 45 recipe outputs, 37 plans and 8 gated seal unlocks with no legendary aliases', () => {
  expect(pack.recipes).toHaveLength(45);
  expect(pack.plans).toHaveLength(37);
  expect(pack.legendaryRecipes).toHaveLength(8);
  for (const recipe of pack.recipes) {
    expect(registry.recipes.get(recipe.id)).toEqual(recipe);
    const item = registry.items.get(recipe.output.item)!;
    expect(recipe.requiresKnowledge === true).toBe(item.quality !== 'common');
    expect([...registry.recipes.values()].filter((row) => row.output.item === item.id).map((row) => row.id))
      .toEqual([recipe.id]);
    if (item.quality === 'legendary') {
      expect(recipe.unlockHint).toBeUndefined();
      expect([...registry.items.values()].some((plan) => plan.onUse.some((use) => (
        use.effects.some((effect) => 'learnRecipes' in effect && effect.learnRecipes.includes(recipe.id))
      )))).toBe(false);
    }
  }
});

it('connects plans to real service NPC shops and exactly one reusable recipe', () => {
  for (const [npcId, shopId, plans] of [
    ['npc:willow_smith', 'shop:willow_smith', pack.smithPlans],
    ['npc:willow_archivist', 'shop:willow_archivist', pack.guildPlans],
  ] as const) {
    expect(registry.npcs.get(npcId)!.shop).toBe(shopId);
    const dialogue = registry.dialogues.get(npcId.replace('npc:', 'dialogue:'))!;
    expect(dialogue.shop).toBe(shopId);
    const greeting = dialogue.nodes.find((node) => node.id === dialogue.initialNodeId)!;
    expect(greeting.choices.some((choice) => dialogue.nodes.some((node) => (
      node.id === choice.nextNodeId && node.mode === 'shop' && node.frameId === 'frame:shop'
    )))).toBe(true);
    const offers = registry.shops.get(shopId)!.offers.map((offer) => offer.item);
    for (const id of plans) {
      expect(offers).toContain(id);
      const plan = registry.items.get(id)!;
      expect(plan).toEqual(pack.plans.find((item) => item.id === id));
      expect(plan.economy.sell).toBe(0);
      expect(plan.economy.buy).toBeGreaterThan(0);
      expect(runtimeRecipeIdsUnlockedByBook(registry, id.slice(5))).toEqual([id.slice(5, -5)]);
      expect(plan.onUse[0]!.effects).toContainEqual({ consumeSelected: 1 });
    }
  }
});

it('shapes every piece from its tier: common from materials, higher tiers upgrade the tier below', () => {
  const previous: Record<string, string> = { uncommon: 'common', rare: 'uncommon', epic: 'rare', legendary: 'epic' };
  for (const recipe of pack.recipes) {
    if (recipe.recipeKind !== 'shaped') throw new Error('expected shaped recipe');
    const item = registry.items.get(recipe.output.item)!;
    const cells = recipe.pattern.flat().filter((cell): cell is NonNullable<typeof cell> => cell !== null);
    expect(cells.length).toBeLessThanOrEqual(9);
    expect(recipe.stationRequirement).toEqual({ objectTag: 'station.workbench' });
    const sale = cells.reduce((sum, cell) => sum + registry.items.get(cell)!.economy.sell, 0);
    expect(sale).toBeGreaterThan(item.economy.sell);
    expect(cells).not.toContain('item:guardian_seal');
    if (item.id.endsWith('_pendant')) {
      // A string loop, an iron setting and a charm for the pendant's trade.
      expect(cells.filter((cell) => cell === 'item:string')).toHaveLength(5);
      expect(cells).toContain('item:iron_bar');
      continue;
    }
    const slot = item.id.slice(item.id.lastIndexOf('_') + 1);
    if (item.quality === 'common') {
      expect(cells.some((cell) => cell.startsWith('item:hearth_'))).toBe(false);
    } else {
      // Exactly one copy of the same slot one quality below sits in the centre.
      expect(cells.filter((cell) => cell.startsWith('item:hearth_'))).toEqual([`item:hearth_${previous[item.quality]}_${slot}`]);
      expect(recipe.pattern[1]![1]).toBe(`item:hearth_${previous[item.quality]}_${slot}`);
    }
  }
});

it('every authored recipe consumes its exact placed grid and produces one native gear item', () => {
  for (const definition of pack.recipes) {
    const id = definition.id.slice(7);
    if (definition.recipeKind !== 'shaped') throw new Error('expected shaped recipe');
    const slots = Array.from({ length: 9 }, (_, index) => {
      const cell = definition.pattern[Math.floor(index / 3)]?.[index % 3] ?? null;
      return cell === null ? null : { itemKind: cell.slice(5), quantity: 1 };
    });
    const grid = { id: 'crafting', capacity: 9, slots };
    const result = runtimeConsumeCraftingRecipe(registry, grid, id);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.code);
    expect(result.crafted).toEqual({ itemKind: definition.output.item.slice(5), quantity: 1 });
    expect(result.container.slots.every((slot) => slot === null)).toBe(true);
  }
});

function productionTypeScript(directory: string): readonly string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return productionTypeScript(path);
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') ? [path] : [];
  });
}

it('keeps the authoring generator outside simulation, client and world runtime imports', () => {
  const runtimeRoots = ['sim', 'client', 'world'].map((name) => (
    resolve(import.meta.dirname, `../../${name}/src`)
  ));
  const runtimeSource = runtimeRoots.flatMap(productionTypeScript)
    .map((path) => readFileSync(path, 'utf8'))
    .join('\n');
  expect(runtimeSource).not.toContain('buildHearthEquipmentAcquisition');
  expect(runtimeSource).not.toContain('hearth-equipment-acquisition');
});
