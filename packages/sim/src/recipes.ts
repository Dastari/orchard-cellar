import type { ItemStack } from './item-containers.js';

export type CraftingStation = 'workbench' | 'furnace' | 'anvil' | 'campfire';

interface RecipeBase {
  readonly id: string;
  readonly output: ItemStack;
  readonly station?: CraftingStation;
}

export interface ShapedRecipeDefinition extends RecipeBase {
  readonly kind: 'shaped';
  /** A recipe is normalized to the occupied bounding box before matching. */
  readonly pattern: ReadonlyArray<ReadonlyArray<string | null>>;
}

export interface ShapelessRecipeDefinition extends RecipeBase {
  readonly kind: 'shapeless';
  readonly inputs: Readonly<Record<string, number>>;
}

export type RecipeDefinition = ShapedRecipeDefinition | ShapelessRecipeDefinition;

export const RECIPES = {
  planks: {
    id: 'planks', kind: 'shapeless', inputs: { wood: 1 }, output: { itemKind: 'plank', quantity: 4 },
  },
  sticks: {
    id: 'sticks', kind: 'shaped', pattern: [['plank'], ['plank']], output: { itemKind: 'stick', quantity: 4 },
  },
  torch: {
    id: 'torch', kind: 'shapeless', inputs: { wood: 1, fiber: 1 }, output: { itemKind: 'torch', quantity: 2 },
  },
  campfire: {
    id: 'campfire', kind: 'shapeless', inputs: { wood: 3, stick: 3 }, output: { itemKind: 'campfire', quantity: 1 },
  },
  cooking_fire: {
    id: 'cooking_fire', kind: 'shaped', station: 'workbench',
    pattern: [['stone', 'iron_bar', 'stone'], ['stone', 'campfire', 'stone'], ['stone', 'stone', 'stone']],
    output: { itemKind: 'cooking_fire', quantity: 1 },
  },
  camp_cooking_fire: {
    id: 'camp_cooking_fire', kind: 'shaped', station: 'workbench',
    pattern: [['iron_bar', null, 'iron_bar'], [null, 'iron_bar', null], [null, 'campfire', null]],
    output: { itemKind: 'camp_cooking_fire', quantity: 1 },
  },
  workbench: {
    id: 'workbench', kind: 'shaped', pattern: [['plank', 'plank'], ['plank', 'plank']],
    output: { itemKind: 'workbench', quantity: 1 },
  },
  chest: {
    id: 'chest', kind: 'shaped', station: 'workbench',
    pattern: [['plank', 'plank', 'plank'], ['plank', null, 'plank'], ['plank', 'plank', 'plank']],
    output: { itemKind: 'chest', quantity: 1 },
  },
  barrel: {
    id: 'barrel', kind: 'shaped', station: 'workbench',
    pattern: [['iron_bar', 'plank', 'iron_bar'], ['plank', null, 'plank'], ['plank', 'plank', 'plank']],
    output: { itemKind: 'barrel', quantity: 1 },
  },
  fruit_press: {
    id: 'fruit_press', kind: 'shaped', station: 'workbench',
    pattern: [['plank', 'iron_bar', 'plank'], ['plank', null, 'plank'], ['plank', null, 'plank']],
    output: { itemKind: 'fruit_press', quantity: 1 },
  },
  fermentation_cask: {
    id: 'fermentation_cask', kind: 'shaped', station: 'workbench',
    pattern: [['copper_bar'], ['barrel']],
    output: { itemKind: 'fermentation_cask', quantity: 1 },
  },
  stone: {
    id: 'stone', kind: 'shaped',
    pattern: [['pebble', 'pebble', 'pebble'], ['pebble', 'pebble', 'pebble'], ['pebble', 'pebble', 'pebble']],
    output: { itemKind: 'stone', quantity: 1 },
  },
  iron_ore: {
    id: 'iron_ore', kind: 'shaped',
    pattern: Array.from({ length: 3 }, () => ['iron_piece', 'iron_piece', 'iron_piece']),
    output: { itemKind: 'iron_ore', quantity: 1 },
  },
  copper_ore: {
    id: 'copper_ore', kind: 'shaped',
    pattern: Array.from({ length: 3 }, () => ['copper_piece', 'copper_piece', 'copper_piece']),
    output: { itemKind: 'copper_ore', quantity: 1 },
  },
  gold_ore: {
    id: 'gold_ore', kind: 'shaped',
    pattern: Array.from({ length: 3 }, () => ['gold_piece', 'gold_piece', 'gold_piece']),
    output: { itemKind: 'gold_ore', quantity: 1 },
  },
  emerald_ore: {
    id: 'emerald_ore', kind: 'shaped',
    pattern: Array.from({ length: 3 }, () => ['emerald_piece', 'emerald_piece', 'emerald_piece']),
    output: { itemKind: 'emerald_ore', quantity: 1 },
  },
  sapphire_ore: {
    id: 'sapphire_ore', kind: 'shaped',
    pattern: Array.from({ length: 3 }, () => ['sapphire_piece', 'sapphire_piece', 'sapphire_piece']),
    output: { itemKind: 'sapphire_ore', quantity: 1 },
  },
  topaz_ore: {
    id: 'topaz_ore', kind: 'shaped',
    pattern: Array.from({ length: 3 }, () => ['topaz_piece', 'topaz_piece', 'topaz_piece']),
    output: { itemKind: 'topaz_ore', quantity: 1 },
  },
  ruby_ore: {
    id: 'ruby_ore', kind: 'shaped',
    pattern: Array.from({ length: 3 }, () => ['ruby_piece', 'ruby_piece', 'ruby_piece']),
    output: { itemKind: 'ruby_ore', quantity: 1 },
  },
  amethyst_ore: {
    id: 'amethyst_ore', kind: 'shaped',
    pattern: Array.from({ length: 3 }, () => ['amethyst_piece', 'amethyst_piece', 'amethyst_piece']),
    output: { itemKind: 'amethyst_ore', quantity: 1 },
  },
  furnace: {
    id: 'furnace', kind: 'shaped', station: 'workbench',
    pattern: [['stone', 'stone', 'stone'], ['stone', null, 'stone'], ['stone', 'stone', 'stone']],
    output: { itemKind: 'furnace', quantity: 1 },
  },
  fence: {
    id: 'fence', kind: 'shaped', station: 'workbench',
    pattern: [['plank', 'stick', 'plank'], ['plank', 'stick', 'plank']],
    output: { itemKind: 'fence', quantity: 3 },
  },
  fence_gate: {
    id: 'fence_gate', kind: 'shaped', station: 'workbench',
    pattern: [['stick', 'plank', 'stick'], ['stick', 'plank', 'stick']],
    output: { itemKind: 'fence_gate', quantity: 1 },
  },
  sign: {
    id: 'sign', kind: 'shaped', station: 'workbench',
    pattern: [['plank', 'plank', 'plank'], ['plank', 'plank', 'plank'], [null, 'stick', null]],
    output: { itemKind: 'sign', quantity: 1 },
  },
  standing_torch: {
    id: 'standing_torch', kind: 'shaped', station: 'workbench',
    pattern: [['torch'], ['stick']], output: { itemKind: 'standing_torch', quantity: 1 },
  },
  shed: {
    id: 'shed', kind: 'shapeless', station: 'workbench', inputs: { plank: 24, iron_bar: 4 },
    output: { itemKind: 'shed', quantity: 1 },
  },
  greenhouse: {
    id: 'greenhouse', kind: 'shapeless', station: 'workbench', inputs: { plank: 20, iron_bar: 8, stone: 12 },
    output: { itemKind: 'greenhouse', quantity: 1 },
  },
  barn: {
    id: 'barn', kind: 'shapeless', station: 'workbench', inputs: { plank: 40, iron_bar: 12, stone: 16 },
    output: { itemKind: 'barn', quantity: 1 },
  },
  coop: {
    id: 'coop', kind: 'shapeless', station: 'workbench', inputs: { plank: 24, iron_bar: 6, stone: 8 },
    output: { itemKind: 'coop', quantity: 1 },
  },
  silo: {
    id: 'silo', kind: 'shapeless', station: 'workbench', inputs: { stone: 30, iron_bar: 10 },
    output: { itemKind: 'silo', quantity: 1 },
  },
  arrows: {
    id: 'arrows', kind: 'shapeless', station: 'workbench', inputs: { stick: 1, stone: 1 },
    output: { itemKind: 'arrow', quantity: 4 },
  },
  orchard_tea: {
    id: 'orchard_tea', kind: 'shapeless', inputs: { apple: 1, pear: 1 },
    output: { itemKind: 'orchard_tea', quantity: 1 },
  },
} as const satisfies Readonly<Record<string, RecipeDefinition>>;

export type RecipeId = keyof typeof RECIPES;

export interface RecipeBookDefinition {
  readonly itemKind: string;
  readonly displayName: string;
  readonly recipeIds: readonly RecipeId[];
}

/** Recipe books reveal patterns in the crafting guide; they are deliberately
 * not crafting permission. The authority continues to accept any correctly
 * arranged recipe, whether or not its pattern has been learned. */
export const RECIPE_BOOK_DEFINITIONS = {
  marlow_book: {
    itemKind: 'marlow_book',
    displayName: "Marlow's Practical Patterns",
    recipeIds: [
      'planks',
      'sticks',
      'torch',
      'campfire',
      'workbench',
      'stone',
      'iron_ore',
      'copper_ore',
      'gold_ore',
      'emerald_ore',
      'sapphire_ore',
      'topaz_ore',
      'ruby_ore',
      'amethyst_ore',
      'chest',
      'furnace',
      'cooking_fire',
      'camp_cooking_fire',
      'fence',
      'fence_gate',
      'sign',
      'standing_torch',
      'arrows',
    ],
  },
  janes_gardening_book: {
    itemKind: 'janes_gardening_book',
    displayName: "Jane's Garden & Cellar Journal",
    recipeIds: [
      'planks',
      'workbench',
      'barrel',
      'fruit_press',
      'fermentation_cask',
      'orchard_tea',
    ],
  },
} as const satisfies Readonly<Record<string, RecipeBookDefinition>>;

export function recipeBookDefinition(itemKind: string): RecipeBookDefinition | null {
  return Object.prototype.hasOwnProperty.call(RECIPE_BOOK_DEFINITIONS, itemKind)
    ? RECIPE_BOOK_DEFINITIONS[itemKind as keyof typeof RECIPE_BOOK_DEFINITIONS]
    : null;
}

export function recipeDefinition(recipeId: string): RecipeDefinition | null {
  return Object.prototype.hasOwnProperty.call(RECIPES, recipeId)
    ? RECIPES[recipeId as RecipeId]
    : null;
}

/** Aggregates the exact input stacks consumed by one execution of a recipe.
 * Object-breaking reducers use this as their salvage source so recipe balance
 * changes automatically update recovered components. */
export function recipeIngredientStacks(recipe: RecipeDefinition): readonly ItemStack[] {
  const totals = new Map<string, number>();
  if (recipe.kind === 'shapeless') {
    for (const [itemKind, quantity] of Object.entries(recipe.inputs)) totals.set(itemKind, quantity);
  } else {
    for (const row of recipe.pattern) {
      for (const itemKind of row) {
        if (itemKind !== null) totals.set(itemKind, (totals.get(itemKind) ?? 0) + 1);
      }
    }
  }
  return [...totals.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([itemKind, quantity]) => ({ itemKind, quantity }));
}

export interface NormalizedShapedRecipe {
  readonly width: number;
  readonly height: number;
  readonly pattern: readonly (string | null)[];
}

/** Removes empty outer rows/columns. Interior nulls remain strict empty cells. */
export function normalizeShapedRecipe(recipe: ShapedRecipeDefinition): NormalizedShapedRecipe | null {
  const rows = recipe.pattern;
  const sourceWidth = Math.max(0, ...rows.map((row) => row.length));
  let minX = sourceWidth;
  let maxX = -1;
  let minY = rows.length;
  let maxY = -1;
  rows.forEach((row, y) => row.forEach((kind, x) => {
    if (kind === null) return;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }));
  if (maxX < minX || maxY < minY) return null;
  const width = maxX - minX + 1;
  const height = maxY - minY + 1;
  return {
    width,
    height,
    pattern: Array.from({ length: width * height }, (_, index) => {
      const x = minX + index % width;
      const y = minY + Math.floor(index / width);
      return rows[y]?.[x] ?? null;
    }),
  };
}

export function shapedRecipeIndexes(
  recipe: ShapedRecipeDefinition,
  slots: readonly (ItemStack | null)[],
): readonly number[] | null {
  const gridWidth = Math.sqrt(slots.length);
  if (!Number.isInteger(gridWidth)) return null;
  const width = Math.round(gridWidth);
  const height = slots.length / width;
  const normalized = normalizeShapedRecipe(recipe);
  if (normalized === null || normalized.width > width || normalized.height > height) return null;
  for (let offsetY = 0; offsetY <= height - normalized.height; offsetY += 1) {
    for (let offsetX = 0; offsetX <= width - normalized.width; offsetX += 1) {
      const consumed: number[] = [];
      let matches = true;
      for (let gridY = 0; gridY < height && matches; gridY += 1) {
        for (let gridX = 0; gridX < width; gridX += 1) {
          const patternX = gridX - offsetX;
          const patternY = gridY - offsetY;
          const expected = patternX >= 0 && patternX < normalized.width
            && patternY >= 0 && patternY < normalized.height
            ? normalized.pattern[patternY * normalized.width + patternX] ?? null
            : null;
          const index = gridY * width + gridX;
          const stack = slots[index] ?? null;
          if (expected === null ? stack !== null : stack?.itemKind !== expected || stack.quantity <= 0) {
            matches = false;
            break;
          }
          if (expected !== null) consumed.push(index);
        }
      }
      if (matches) return consumed;
    }
  }
  return null;
}

export function recipeMatches(recipe: RecipeDefinition, slots: readonly (ItemStack | null)[]): boolean {
  if (recipe.kind === 'shaped') return shapedRecipeIndexes(recipe, slots) !== null;
  const available = new Map<string, number>();
  for (const stack of slots) if (stack) available.set(stack.itemKind, (available.get(stack.itemKind) ?? 0) + stack.quantity);
  const required = Object.entries(recipe.inputs);
  return available.size === required.length
    && required.every(([kind, quantity]) => (available.get(kind) ?? 0) >= quantity);
}
