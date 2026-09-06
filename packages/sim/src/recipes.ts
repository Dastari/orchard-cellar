import { bootstrapDefinitionsOfKind } from './content/bootstrap-pack-loader.js';
import { BOOTSTRAP_COMPILED_CONTENT } from './content/bootstrap-projection.js';
import type { ItemStack } from './item-containers.js';
import type { CookingRecipeId } from './food.js';

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

export const RECIPES: Readonly<Record<string, RecipeDefinition>> =
  BOOTSTRAP_COMPILED_CONTENT.recipes;

export type RecipeId = keyof typeof RECIPES;

export interface RecipeBookDefinition {
  readonly itemKind: string;
  readonly displayName: string;
  readonly recipeIds: readonly RecipeId[];
  /** Cooking stations already match their input automatically; these ids are
   * still learned so the handbook remains the player's complete recipe index. */
  readonly cookingRecipeIds?: readonly CookingRecipeId[];
}

export const RECIPE_BOOK_DEFINITIONS: Readonly<Record<string, RecipeBookDefinition>> = Object.freeze(
  Object.fromEntries(bootstrapDefinitionsOfKind('item')
    .filter((item) => item.onUse.some(({ effects }) => effects.some((effect) => 'learnRecipes' in effect)))
    .map((item) => {
      const itemKind = item.id.slice('item:'.length);
      const unlocks = item.onUse.flatMap(({ effects }) => effects.flatMap((effect) => (
        'learnRecipes' in effect ? effect.learnRecipes : []
      )));
      const recipes = unlocks.filter((id) => id.startsWith('recipe:'));
      const processes = unlocks.filter((id) => id.startsWith('process:'));
      return [itemKind, {
        itemKind,
        displayName: item.displayName,
        recipeIds: recipes.map((id) => id.slice('recipe:'.length)).sort(),
        ...(processes.length === 0 ? {} : {
          cookingRecipeIds: processes.map((id) => id.slice('process:'.length)).sort(),
        }),
      } satisfies RecipeBookDefinition] as const;
    })),
);

export function recipeBookPatternIds(book: RecipeBookDefinition): readonly string[] {
  return [...book.recipeIds, ...(book.cookingRecipeIds ?? [])];
}

export function recipeBookDefinition(itemKind: string): RecipeBookDefinition | null {
  return Object.prototype.hasOwnProperty.call(RECIPE_BOOK_DEFINITIONS, itemKind)
    ? RECIPE_BOOK_DEFINITIONS[itemKind as keyof typeof RECIPE_BOOK_DEFINITIONS] ?? null
    : null;
}

export function recipeDefinition(recipeId: string): RecipeDefinition | null {
  return Object.prototype.hasOwnProperty.call(RECIPES, recipeId)
    ? RECIPES[recipeId as RecipeId] ?? null
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
