import { describe, expect, it } from 'vitest';
import {
  BOOTSTRAP_ITEM_CONTAINER_CONTENT,
  fillCraftingRecipeFromInventory,
  type ContainerSnapshot,
  type ItemContainerContentResolver,
  type ItemStack,
} from './item-containers.js';
import type { ItemGear } from './item-gear.js';
import { recipeDefinition, recipeGridStacks, type RecipeDefinition } from './recipes.js';

// "Place in grid" returns the grid's other items to the pack first (BUG-037 follow-up, owner decision
// 2026-09-25). These tests pin the item-safety side of that: nothing is duplicated or lost, metadata
// never merges, and a refusal carries the right code.

/** Bootstrap content with copper axes made stackable, so a durability difference is the only thing that
 * keeps two axe stacks apart; with the shipped cap of 1 they could never merge anyway. */
const CONTENT: ItemContainerContentResolver = {
  ...BOOTSTRAP_ITEM_CONTAINER_CONTENT,
  maxStackFor: (kind) => kind === 'copper_axe' ? 4 : BOOTSTRAP_ITEM_CONTAINER_CONTENT.maxStackFor(kind),
};

function gear(instanceId: string): ItemGear {
  return { instanceId, rollVersion: 1, rarity: 'common', material: 'iron', itemLevel: 5,
    prefix: '', suffix: '', lineage: '', legendary: '', seed: 0 };
}

function container(id: string, slots: readonly (ItemStack | null)[], restrictions?: ContainerSnapshot['restrictions']): ContainerSnapshot {
  return restrictions ? { id, capacity: slots.length, slots, restrictions } : { id, capacity: slots.length, slots };
}

function grid(cells: Readonly<Record<number, ItemStack>>): ContainerSnapshot {
  return container('crafting', Array.from({ length: 9 }, (_, index) => cells[index] ?? null));
}

const PLANK_ONLY: RecipeDefinition = { id: 'plank_only', kind: 'shaped', output: { itemKind: 'stick', quantity: 1 }, pattern: [['plank']] };

describe('placing a recipe returns the grid to the pack (BUG-037 follow-up)', () => {
  it('refuses a partial fit with container_full and moves nothing', () => {
    // Room for 30 of the 60 stone: the hotbar stack has 30 headroom and the backpack is full of planks.
    const containers = {
      hotbar: container('hotbar', [{ itemKind: 'stone', quantity: 69 }]),
      backpack: container('backpack', [{ itemKind: 'plank', quantity: 99 }]),
      crafting: grid({ 4: { itemKind: 'stone', quantity: 60 } }),
    };
    const before = JSON.stringify(containers);
    expect(fillCraftingRecipeFromInventory(containers, 'barrel', CONTENT)).toEqual({ ok: false, code: 'container_full' });
    expect(JSON.stringify(containers)).toBe(before);
  });

  it('puts gear, durability and unlit-torch strays in empty slots without merging, and leaves equipment alone', () => {
    const equipment = container('equipment', [{ itemKind: 'sword', quantity: 1, gear: gear('equipped-sword') },
      { itemKind: 'copper_axe', quantity: 1, durability: 3 }]);
    const containers = {
      hotbar: container('hotbar', [
        { itemKind: 'torch', quantity: 5 }, { itemKind: 'copper_axe', quantity: 1, durability: 9 },
        { itemKind: 'stone', quantity: 5 }, { itemKind: 'plank', quantity: 1 }, null, null, null, null,
      ]),
      backpack: container('backpack', [null]),
      crafting: grid({
        1: { itemKind: 'torch', quantity: 2, lit: false },
        2: { itemKind: 'copper_axe', quantity: 1, durability: 7 },
        3: { itemKind: 'stone', quantity: 1, gear: gear('stone-copy') },
      }),
      equipment,
    };
    const before = JSON.stringify(containers);
    const placed = fillCraftingRecipeFromInventory(containers, PLANK_ONLY.id, CONTENT, PLANK_ONLY);
    if (!placed.ok) throw new Error(placed.code);
    expect(placed.containers.hotbar!.slots).toEqual([
      { itemKind: 'torch', quantity: 5 }, { itemKind: 'copper_axe', quantity: 1, durability: 9 },
      { itemKind: 'stone', quantity: 5 }, null,
      { itemKind: 'torch', quantity: 2, lit: false },
      { itemKind: 'copper_axe', quantity: 1, durability: 7 },
      { itemKind: 'stone', quantity: 1, gear: gear('stone-copy') },
      null,
    ]);
    expect(placed.containers.backpack!.slots).toEqual([null]);
    expect(placed.containers.crafting!.slots).toEqual([{ itemKind: 'plank', quantity: 1 }, ...Array(8).fill(null)]);
    expect(placed.containers.equipment).toEqual(equipment);
    expect(JSON.stringify(containers)).toBe(before);
  });

  it('returns a stray that is also a recipe input and then places it where the recipe wants it', () => {
    const containers = {
      hotbar: container('hotbar', [{ itemKind: 'plank', quantity: 5 }, { itemKind: 'nails', quantity: 2 }]),
      backpack: container('backpack', [null]),
      // The barrel wants a plank in cell 0 and nothing in the centre.
      crafting: grid({ 0: { itemKind: 'stone', quantity: 1 }, 4: { itemKind: 'plank', quantity: 5 } }),
    };
    const placed = fillCraftingRecipeFromInventory(containers, 'barrel', CONTENT);
    if (!placed.ok) throw new Error(placed.code);
    const plank = { itemKind: 'plank', quantity: 1 }, nails = { itemKind: 'nails', quantity: 1 };
    expect(placed.containers.crafting!.slots).toEqual([plank, plank, plank, nails, null, nails, plank, plank, plank]);
    expect(placed.containers.hotbar!.slots).toEqual([{ itemKind: 'plank', quantity: 4 }, null]);
    expect(placed.containers.backpack!.slots).toEqual([{ itemKind: 'stone', quantity: 1 }]);
    expect(placed.movedQuantity).toBe(8);
  });

  it('keeps the stray\'s own error code when it cannot be moved at all', () => {
    const roomy = { hotbar: container('hotbar', [null, null, null]), backpack: container('backpack', [null]) };
    // Oversize (above the plank cap of 99), zero-quantity and unknown strays are not a "no room" problem.
    for (const stray of [{ itemKind: 'plank', quantity: 150 }, { itemKind: 'stone', quantity: 0 }, { itemKind: 'not_an_item', quantity: 1 }]) {
      const containers = { ...roomy, crafting: grid({ 4: stray }) };
      const before = JSON.stringify(containers);
      expect(fillCraftingRecipeFromInventory(containers, 'barrel', CONTENT)).toEqual({ ok: false, code: 'unknown_item_kind' });
      expect(JSON.stringify(containers)).toBe(before);
    }
    // With a full pack, a well-formed stray is still reported as no room.
    const full = { hotbar: container('hotbar', [{ itemKind: 'plank', quantity: 99 }]), backpack: container('backpack', [{ itemKind: 'plank', quantity: 99 }]),
      crafting: grid({ 4: { itemKind: 'stone', quantity: 1 } }) };
    expect(fillCraftingRecipeFromInventory(full, 'barrel', CONTENT)).toEqual({ ok: false, code: 'container_full' });
  });
});

/** mulberry32: a small seeded PRNG so every run explores the same cases. */
function prng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CARRIED = ['hotbar', 'backpack', 'crafting'] as const;
const KINDS = ['plank', 'nails', 'stone', 'stick', 'torch', 'copper_axe', 'sword'] as const;
const RECIPES: readonly RecipeDefinition[] = [
  recipeDefinition('barrel')!,
  PLANK_ONLY,
  { id: 'lit_tool', kind: 'shaped', output: { itemKind: 'stick', quantity: 1 }, pattern: [['torch', 'copper_axe'], ['stick', null]] },
  { id: 'loose', kind: 'shapeless', output: { itemKind: 'stick', quantity: 1 }, inputs: { plank: 3, stone: 2 } },
  // More than nine items, so the shapeless fill packs whole stacks per cell.
  { id: 'bulk', kind: 'shapeless', output: { itemKind: 'stick', quantity: 1 }, inputs: { plank: 150, nails: 40, torch: 20 } },
];

/** What makes two stacks the same item: kind plus every piece of metadata (lit defaults to true). */
function identity(stack: ItemStack): string {
  return JSON.stringify([stack.itemKind, stack.durability ?? null, stack.lit ?? true, stack.gear ?? null]);
}

function totals(containers: Readonly<Record<string, ContainerSnapshot>>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const id of CARRIED) for (const stack of containers[id]?.slots ?? []) {
    if (stack) counts.set(identity(stack), (counts.get(identity(stack)) ?? 0) + stack.quantity);
  }
  for (const [key, count] of counts) if (count === 0) counts.delete(key);
  return counts;
}

function randomCase(random: () => number, caseIndex: number) {
  const int = (below: number) => Math.floor(random() * below);
  const pick = <T,>(values: readonly T[]): T => values[int(values.length)]!;
  let gearCopies = 0;
  let lastGear: ItemGear | null = null;
  const stack = (): ItemStack => {
    const itemKind = pick(KINDS);
    const maximum = CONTENT.maxStackFor(itemKind)!;
    const roll = random();
    if (roll < 0.12) {
      // A gear copy: usually fresh, sometimes a clone of the previous record (they must still never merge).
      lastGear = lastGear !== null && random() < 0.3 ? lastGear : gear(`case-${caseIndex}-gear-${gearCopies++}`);
      return { itemKind, quantity: 1, gear: lastGear };
    }
    const quantity = roll < 0.17 ? maximum + 1 + int(20) : roll < 0.2 ? 0 : 1 + int(maximum);
    const durability = (itemKind === 'copper_axe' || itemKind === 'sword') && random() < 0.7 ? { durability: 1 + int(3) } : {};
    const lit = itemKind === 'torch' && random() < 0.6 ? { lit: random() < 0.6 ? false : true } : {};
    return { itemKind, quantity, ...durability, ...lit };
  };
  const recipe = pick(RECIPES);
  const desired = recipeGridStacks(recipe, 9, (kind) => CONTENT.maxStackFor(kind))!;
  const hotbarSize = 1 + int(6);
  const readOnly = Object.fromEntries(Array.from({ length: hotbarSize }, (_, index) => index)
    .filter(() => random() < 0.15).map((index) => [index, { readOnly: true }]));
  const containers: Record<string, ContainerSnapshot> = {
    hotbar: container('hotbar', Array.from({ length: hotbarSize }, () => random() < 0.6 ? stack() : null),
      Object.keys(readOnly).length > 0 ? readOnly : undefined),
    crafting: container('crafting', Array.from({ length: 9 }, (_, index) => {
      const want = desired[index];
      if (want && random() < 0.3) return { itemKind: want.itemKind, quantity: 1 + int(3) };
      return random() < 0.3 ? stack() : null;
    })),
    equipment: container('equipment', Array.from({ length: 3 }, () => random() < 0.7 ? stack() : null)),
  };
  if (random() < 0.85) containers.backpack = container('backpack', Array.from({ length: int(7) }, () => random() < 0.5 ? stack() : null));
  return { containers, recipe, desired, readOnly };
}

describe('placing a recipe conserves items (property run)', () => {
  it('never duplicates, loses or merges items across 2,000 seeded cases', () => {
    const random = prng(0x0b0037);
    const outcomes = { placed: 0, refused: 0, returnedStrays: 0 };
    for (let caseIndex = 0; caseIndex < 2000; caseIndex += 1) {
      const { containers, recipe, desired, readOnly } = randomCase(random, caseIndex);
      const before = JSON.stringify(containers);
      const result = fillCraftingRecipeFromInventory(containers, recipe.id, CONTENT, recipe);
      const label = `case ${caseIndex}: ${before}`;
      expect(JSON.stringify(containers), label).toBe(before);
      if (!result.ok) {
        outcomes.refused += 1;
        expect(['container_full', 'unknown_item_kind'], label).toContain(result.code);
        continue;
      }
      outcomes.placed += 1;
      const after = result.containers;
      expect(totals(after), label).toEqual(totals(containers));
      expect(after.equipment, label).toEqual(containers.equipment);
      expect(Object.keys(after).sort(), label).toEqual(Object.keys(containers).sort());
      for (const id of CARRIED) for (const stack of after[id]?.slots ?? []) {
        if (stack?.gear !== undefined) expect(stack.quantity, label).toBe(1);
      }
      // Every cell the recipe doesn't want is cleared.
      after.crafting!.slots.forEach((cell, index) => {
        if (cell !== null) expect(cell.itemKind, label).toBe(desired[index]?.itemKind);
      });
      if (containers.crafting!.slots.some((cell, index) => cell !== null && cell.itemKind !== desired[index]?.itemKind)) {
        outcomes.returnedStrays += 1;
      }
      // Read-only hotbar slots never receive anything (the fill may still draw from them: BUG-045).
      for (const index of Object.keys(readOnly).map(Number)) {
        const was = containers.hotbar!.slots[index] ?? null, now = after.hotbar!.slots[index] ?? null;
        if (now === null) continue;
        expect(was !== null && identity(was) === identity(now) && now.quantity <= was.quantity, label).toBe(true);
      }
    }
    // The generator must exercise both outcomes and the return path, or the run proves little.
    expect(outcomes.placed).toBeGreaterThan(200);
    expect(outcomes.refused).toBeGreaterThan(200);
    expect(outcomes.returnedStrays).toBeGreaterThan(100);
  });
});
