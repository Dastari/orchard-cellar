import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import {
  bootstrapContentRegistry,
  runtimeConsumeCraftingRecipe,
  runtimeRecipeDefinition,
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

it('uses current affordable shore quantities and a peaceful pendant branch without resale loops', () => {
  for (const recipe of pack.recipes) {
    if (recipe.recipeKind !== 'shapeless') throw new Error('expected shapeless recipe');
    const item = registry.items.get(recipe.output.item)!;
    expect(recipe.inputs.length).toBeLessThanOrEqual(9);
    expect(recipe.stationRequirement).toEqual({ objectTag: 'station.workbench' });
    const sale = recipe.inputs.reduce((sum, input) => (
      sum + registry.items.get(input.item)!.economy.sell * input.count
    ), 0);
    expect(sale).toBeGreaterThan(item.economy.sell);
    expect(recipe.inputs.some((input) => input.item === 'item:guardian_seal')).toBe(false);
    if (item.quality === 'uncommon') {
      for (const id of ['item:ashwood', 'item:basalt']) {
        expect(recipe.inputs.find((input) => input.item === id)!.count).toBeLessThanOrEqual(4);
      }
    }
    if (item.id.endsWith('_pendant')) {
      expect(recipe.inputs.map((input) => input.item).sort()).toEqual(['item:fiber', 'item:iron_bar', 'item:wood']);
    }
    for (const input of recipe.inputs) {
      expect(input.count).toBeLessThanOrEqual(registry.items.get(input.item)!.maxStack);
    }
  }
});

it('every authored recipe consumes its exact actual nine-slot material grid and produces one native gear item', () => {
  for (const definition of pack.recipes) {
    const id = definition.id.slice(7);
    const recipe = runtimeRecipeDefinition(registry, id)!;
    if (recipe.kind !== 'shapeless') throw new Error('expected shapeless recipe');
    const inputs = Object.entries(recipe.inputs).map(([itemKind, quantity]) => ({ itemKind, quantity }));
    const grid = {
      id: 'crafting', capacity: 9, slots: [...inputs, ...Array(9 - inputs.length).fill(null)],
    };
    const result = runtimeConsumeCraftingRecipe(registry, grid, id);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.code);
    expect(result.crafted).toEqual({ itemKind: definition.output.item.slice(5), quantity: 1 });
    expect(result.container.slots.every((slot) => slot === null)).toBe(true);
    expect(grid.slots[0]).toEqual(inputs[0]);
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
