import { describe, expect, it } from 'vitest';
import { bootstrapContentRegistry, HEARTH_FURNITURE_SHAPES, runtimeRecipeDefinition, runtimeRecipeMatchesGrid,
  runtimeMatchingRecipeId, runtimeConsumeCraftingRecipe, runtimeRecipeIdsUnlockedByBook,
  fillCraftingRecipeFromInventory, itemContainerContentResolver, delveCompletionRecipe, type ContainerSnapshot } from '../index.js';
const registry = bootstrapContentRegistry();
describe('furniture acquisition', () => {
  it('atomically fills the production grid using split stacks and the live recipe', () => {
    const id = 'furniture_rustic_bed', recipe = runtimeRecipeDefinition(registry, id)!;
    // The bed is shaped (owner crafting overhaul): a fiber mattress over a plank frame.
    const shaped: Record<string, ContainerSnapshot> = {
      hotbar: { id: 'hotbar', capacity: 3, slots: [{ itemKind: 'plank', quantity: 2 }, { itemKind: 'plank', quantity: 5 }, { itemKind: 'fiber', quantity: 4 }] },
      backpack: { id: 'backpack', capacity: 1, slots: [null] },
      crafting: { id: 'crafting', capacity: 9, slots: [{ itemKind: 'fiber', quantity: 1 }, ...Array(8).fill(null)] },
    };
    const shapedBefore = JSON.stringify(shaped), content = itemContainerContentResolver(registry);
    const placed = fillCraftingRecipeFromInventory(shaped, id, content, recipe);
    if (!placed.ok) throw new Error(placed.code);
    expect(placed.containers.crafting!.slots.slice(0, 6)).toEqual([
      { itemKind: 'fiber', quantity: 1 }, { itemKind: 'fiber', quantity: 1 }, { itemKind: 'fiber', quantity: 1 },
      { itemKind: 'plank', quantity: 1 }, { itemKind: 'plank', quantity: 1 }, { itemKind: 'plank', quantity: 1 },
    ]);
    expect(placed.movedQuantity).toBe(5);
    expect(runtimeRecipeMatchesGrid(registry, placed.containers.crafting!, id)).toBe(true);
    expect(JSON.stringify(shaped)).toBe(shapedBefore);
    const occupied = { ...shaped, crafting: { ...shaped.crafting!, slots: [{ itemKind: 'stone', quantity: 1 }, ...Array(8).fill(null)] } };
    // A cell the recipe doesn't want is returned to carried storage first (owner decision, 2026-09-25).
    const cleared = fillCraftingRecipeFromInventory(occupied, id, content, recipe);
    if (!cleared.ok) throw new Error(cleared.code);
    expect(cleared.containers.backpack!.slots[0]).toEqual({ itemKind: 'stone', quantity: 1 });
    expect(runtimeRecipeMatchesGrid(registry, cleared.containers.crafting!, id)).toBe(true);
    // Shapeless recipes (mixing and processing) still fill by count from split stacks.
    const containers: Record<string, ContainerSnapshot> = {
      hotbar: { id: 'hotbar', capacity: 3, slots: [{ itemKind: 'wood', quantity: 10 }, { itemKind: 'wood', quantity: 20 }, { itemKind: 'fiber', quantity: 40 }] },
      backpack: { id: 'backpack', capacity: 1, slots: [null] },
      crafting: { id: 'crafting', capacity: 9, slots: [{ itemKind: 'wood', quantity: 4 }, ...Array(8).fill(null)] },
    };
    const before = JSON.stringify(containers);
    // With nowhere to put the stray stone, nothing moves and the player is told.
    const blocked = { ...containers, backpack: { id: 'backpack', capacity: 1, slots: [{ itemKind: 'fiber', quantity: 99 }] },
      crafting: { ...containers.crafting!, slots: [{ itemKind: 'wood', quantity: 4 }, { itemKind: 'stone', quantity: 1 }, ...Array(7).fill(null)] } };
    const blockedBefore = JSON.stringify(blocked);
    expect(fillCraftingRecipeFromInventory(blocked, id, content, { ...recipe, kind: 'shapeless', inputs: { wood: 24, fiber: 40 } }))
      .toMatchObject({ ok: false, code: 'container_full' });
    expect(JSON.stringify(blocked)).toBe(blockedBefore);
    expect(JSON.stringify(containers)).toBe(before);
    const liveRecipe = { ...recipe, kind: 'shapeless' as const, inputs: { wood: 30, fiber: 35 } };
    const live = fillCraftingRecipeFromInventory(containers, id, content, liveRecipe);
    if (!live.ok) throw new Error(live.code);
    expect(live.containers.crafting!.slots.slice(0, 2)).toEqual([{ itemKind: 'wood', quantity: 30 }, { itemKind: 'fiber', quantity: 35 }]);
    const incompatible = { ...containers,
      hotbar: { id: 'hotbar', capacity: 1, slots: [{ itemKind: 'wood', quantity: 6, lit: true }] },
      crafting: { id: 'crafting', capacity: 9, slots: [{ itemKind: 'wood', quantity: 4, lit: false }, ...Array(8).fill(null)] },
    };
    const unchanged = fillCraftingRecipeFromInventory(incompatible, id, content,
      { ...recipe, kind: 'shapeless', inputs: { wood: 10 } });
    expect(unchanged).toMatchObject({ ok: true, movedQuantity: 0, containers: incompatible });
  });
  it('connects all 32 shop pieces to finished purchases and learned recipes without resale arbitrage', () => {
    const offers = registry.shops.get('shop:willow_furnisher')!.offers.map(offer => offer.item);
    const shopPieces = Object.values(HEARTH_FURNITURE_SHAPES).filter(shape => shape.id !== 'delver_memorial_planter');
    expect(shopPieces).toHaveLength(32);
    for (const shape of shopPieces) {
      const id = shape.id, item = registry.items.get(`item:${id}`)!, plan = registry.items.get(`item:${id}_plan`)!;
      const recipe = registry.recipes.get(`recipe:${id}`)!;
      expect(offers).toContain(item.id); expect(offers).toContain(plan.id);
      expect(recipe.output).toEqual({ item: item.id, count: 1 });
      expect(runtimeRecipeIdsUnlockedByBook(registry, `${id}_plan`)).toEqual([id]);
      expect(plan.onUse[0]!.effects).toContainEqual({ consumeSelected: 1 });
      expect(plan.economy.sell).toBe(0);
      expect(recipe.recipeKind).toBe('shaped');
      if (recipe.recipeKind !== 'shaped') throw new Error('expected shaped recipe');
      const materialSale = recipe.pattern.flat().reduce((sum, cell) => sum + (cell === null ? 0 : registry.items.get(cell)!.economy.sell), 0);
      expect(item.economy.sell).toBeLessThan(materialSale);
      expect(item.economy.sell).toBeLessThan(item.economy.buy!);
      expect(recipe.stationRequirement).toEqual({ objectTag: 'station.workbench' });
    }
  });
  it('reserves the one earned keepsake for Delve recipe knowledge rather than a shop or plan', () => {
    const id = 'delver_memorial_planter';
    expect(Object.keys(HEARTH_FURNITURE_SHAPES)).toHaveLength(33);
    expect(HEARTH_FURNITURE_SHAPES[id]).toBeDefined();
    const reward = delveCompletionRecipe(registry)!;
    expect(reward.id).toBe(`recipe:${id}`);
    expect(reward.requiresKnowledge).toBe(true);
    expect(reward.output).toEqual({ item: `item:${id}`, count: 1 });
    expect(reward.stationRequirement).toEqual({ objectTag: 'station.workbench' });
    expect(registry.items.get(`item:${id}`)?.economy).toEqual({ buy: null, sell: 0 });
    expect(registry.items.has(`item:${id}_plan`)).toBe(false);
    expect(runtimeRecipeIdsUnlockedByBook(registry, `${id}_plan`)).toEqual([]);
    const allOffers = [...registry.shops.values()].flatMap(shop => shop.offers.map(offer => offer.item));
    expect(allOffers).not.toContain(`item:${id}`);
    expect(allOffers).not.toContain(`item:${id}_plan`);
  });
  it('keeps a selected table recipe across batches while rejecting insufficient or unrelated inputs', () => {
    const id = 'furniture_rustic_dining_table';
    // Shaped table (planks top and apron, stick legs); two of each cell makes two tables.
    const two = (itemKind: string) => ({ itemKind, quantity: 2 });
    const grid = { id: 'crafting', capacity: 9, slots: [
      two('plank'), two('plank'), two('plank'), two('plank'), two('plank'), two('plank'), two('stick'), null, two('stick'),
    ] };
    expect(runtimeMatchingRecipeId(registry, grid, 9, id)).toBe(id);
    expect(runtimeRecipeMatchesGrid(registry, grid, 'furniture_rustic_chest')).toBe(false);
    let current = grid;
    for (let i = 0; i < 2; i++) {
      expect(runtimeRecipeMatchesGrid(registry, current, id)).toBe(true);
      const consumed = runtimeConsumeCraftingRecipe(registry, current, id);
      if (!consumed.ok) throw new Error('consume failed');
      expect(consumed.crafted).toEqual({ itemKind: id, quantity: 1 });
      current = { ...grid, slots: [...consumed.container.slots] };
    }
    expect(current.slots.every((slot) => slot === null)).toBe(true);
    expect(runtimeRecipeMatchesGrid(registry, current, id)).toBe(false);
    expect(runtimeRecipeMatchesGrid(registry, current, 'missing')).toBe(false);
    const definition = registry.recipes.get(`recipe:${id}`)!;
    const retired = { ...registry, recipes: new Map([...registry.recipes, [definition.id, { ...definition, retired: true }]]) };
    expect(runtimeRecipeDefinition(retired, id)).toBeNull();
    expect(runtimeRecipeMatchesGrid(retired, grid, id)).toBe(false);
  });
});
