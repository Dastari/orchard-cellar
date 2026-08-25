export interface ItemDefinition {
  readonly maxStack: number;
  readonly tags: readonly string[];
}

export const ITEM_DEFINITIONS = {
  axe: { maxStack: 1, tags: ['item.tool', 'gear.hand'] },
  hoe: { maxStack: 1, tags: ['item.tool', 'gear.hand'] },
  pickaxe: { maxStack: 1, tags: ['item.tool', 'gear.hand'] },
  watering_can: { maxStack: 1, tags: ['item.tool', 'gear.hand'] },
  bow: { maxStack: 1, tags: ['item.weapon', 'item.ranged_weapon', 'gear.hand'] },
  arrow: { maxStack: 99, tags: ['item.ammunition', 'ammo.arrow'] },
  wood: { maxStack: 99, tags: ['item.resource', 'material.wood'] },
  stone: { maxStack: 99, tags: ['item.resource', 'material.stone'] },
  iron_ore: { maxStack: 99, tags: ['item.resource', 'material.ore', 'material.raw', 'ore.iron'] },
  copper_ore: { maxStack: 99, tags: ['item.resource', 'material.ore', 'material.raw', 'ore.copper'] },
  gold_ore: { maxStack: 99, tags: ['item.resource', 'material.ore', 'material.raw', 'ore.gold'] },
  emerald_ore: { maxStack: 99, tags: ['item.resource', 'material.ore', 'material.raw', 'ore.emerald'] },
  sapphire_ore: { maxStack: 99, tags: ['item.resource', 'material.ore', 'material.raw', 'ore.sapphire'] },
  topaz_ore: { maxStack: 99, tags: ['item.resource', 'material.ore', 'material.raw', 'ore.topaz'] },
  ruby_ore: { maxStack: 99, tags: ['item.resource', 'material.ore', 'material.raw', 'ore.ruby'] },
  amethyst_ore: { maxStack: 99, tags: ['item.resource', 'material.ore', 'material.raw', 'ore.amethyst'] },
  plank: { maxStack: 99, tags: ['item.resource', 'material.wood', 'item.crafted'] },
  stick: { maxStack: 99, tags: ['item.resource', 'material.wood', 'item.crafted'] },
  chest: { maxStack: 16, tags: ['item.placeable', 'item.crafted', 'container.chest'] },
  apple: { maxStack: 32, tags: ['item.crop', 'item.food', 'crop.fruit'] },
  pear: { maxStack: 32, tags: ['item.crop', 'item.food', 'crop.fruit'] },
  peach: { maxStack: 32, tags: ['item.crop', 'item.food', 'crop.fruit'] },
  cherry: { maxStack: 32, tags: ['item.crop', 'item.food', 'crop.fruit'] },
  grape: { maxStack: 32, tags: ['item.crop', 'item.food', 'crop.fruit'] },
  barrel: { maxStack: 16, tags: ['item.placeable', 'item.crafted', 'container.barrel'] },
  backpack: { maxStack: 1, tags: ['item.equipment', 'container.backpack'] },
  necklace: { maxStack: 1, tags: ['item.equipment', 'gear.neck'] },
  helm: { maxStack: 1, tags: ['item.equipment', 'gear.head'] },
  tunic: { maxStack: 1, tags: ['item.equipment', 'gear.body'] },
  ring: { maxStack: 1, tags: ['item.equipment', 'gear.ring'] },
  shield: { maxStack: 1, tags: ['item.equipment', 'gear.hand', 'gear.off_hand'] },
  gloves: { maxStack: 1, tags: ['item.equipment', 'gear.hands'] },
  pants: { maxStack: 1, tags: ['item.equipment', 'gear.legs'] },
  boots: { maxStack: 1, tags: ['item.equipment', 'gear.feet'] },
} as const satisfies Readonly<Record<string, ItemDefinition>>;

export type KnownItemKind = keyof typeof ITEM_DEFINITIONS;

export interface ItemStack {
  readonly itemKind: string;
  readonly quantity: number;
}

export interface SlotRestriction {
  readonly acceptedKinds?: readonly string[];
  readonly requiredTags?: readonly string[];
}

export interface ContainerSnapshot {
  readonly id: string;
  readonly capacity: number;
  /** Sparse rows from storage are represented as null slots at this boundary. */
  readonly slots: readonly (ItemStack | null)[];
  readonly restrictions?: Readonly<Record<number, SlotRestriction>>;
}

export interface MoveItemRequest {
  readonly fromContainer: string;
  readonly fromIndex: number;
  readonly toContainer: string;
  readonly toIndex: number;
  readonly quantity: number;
}

export interface QuickMoveItemRequest {
  readonly fromContainer: string;
  readonly fromIndex: number;
  readonly toContainers: readonly string[];
}

export interface DistributeItemRequest {
  readonly fromContainer: string;
  readonly fromIndex: number;
  readonly targets: readonly DragDistributionTarget[];
  readonly quantity?: number;
}

export interface DragDistributionTarget {
  readonly container: string;
  readonly index: number;
}

export type ItemRuleErrorCode =
  | 'container_not_found'
  | 'index_out_of_capacity'
  | 'invalid_quantity'
  | 'source_empty'
  | 'source_quantity_changed'
  | 'unknown_item_kind'
  | 'slot_rejects_item'
  | 'target_stack_full'
  | 'partial_swap_forbidden'
  | 'same_slot'
  | 'recipe_not_found'
  | 'recipe_inputs_missing'
  | 'recipe_output_blocked'
  | 'container_full';

export interface ItemRuleFailure {
  readonly ok: false;
  readonly code: ItemRuleErrorCode;
}

export interface MoveItemSuccess {
  readonly ok: true;
  readonly outcome: 'move' | 'split' | 'merge' | 'swap' | 'quick_move' | 'distribute';
  readonly movedQuantity: number;
  readonly containers: Readonly<Record<string, ContainerSnapshot>>;
}

export type MoveItemResult = ItemRuleFailure | MoveItemSuccess;

export interface InsertItemSuccess {
  readonly ok: true;
  readonly insertedQuantity: number;
  readonly container: ContainerSnapshot;
}

export type InsertItemResult = ItemRuleFailure | InsertItemSuccess;

export interface ShapelessRecipeDefinition {
  readonly kind: 'shapeless';
  readonly inputs: readonly ItemStack[];
  readonly output: ItemStack;
}

export interface ShapedRecipeDefinition {
  readonly kind: 'shaped';
  readonly width: number;
  readonly height: number;
  /** Row-major item kinds. Null cells must remain empty. */
  readonly pattern: readonly (string | null)[];
  readonly output: ItemStack;
}

export type RecipeDefinition = ShapelessRecipeDefinition | ShapedRecipeDefinition;

export const RECIPES = {
  planks: {
    kind: 'shapeless', inputs: [{ itemKind: 'wood', quantity: 1 }], output: { itemKind: 'plank', quantity: 4 },
  },
  sticks: {
    kind: 'shaped', width: 1, height: 2,
    pattern: ['plank', 'plank'],
    output: { itemKind: 'stick', quantity: 4 },
  },
  arrows: {
    kind: 'shapeless', inputs: [{ itemKind: 'stick', quantity: 1 }, { itemKind: 'stone', quantity: 1 }],
    output: { itemKind: 'arrow', quantity: 4 },
  },
  chest: {
    kind: 'shaped', width: 3, height: 3,
    pattern: ['plank', 'plank', 'plank', 'plank', null, 'plank', 'plank', 'plank', 'plank'],
    output: { itemKind: 'chest', quantity: 1 },
  },
} as const satisfies Readonly<Record<string, RecipeDefinition>>;

export interface CraftRequest {
  readonly recipeId: string;
  readonly gridContainer: string;
  /** A reserved result slot is never consumed as an input. */
  readonly resultIndex: number;
}

export interface CraftSuccess {
  readonly ok: true;
  readonly crafted: ItemStack;
  readonly containers: Readonly<Record<string, ContainerSnapshot>>;
}

export type CraftResult = ItemRuleFailure | CraftSuccess;

export interface ConsumeRecipeSuccess {
  readonly ok: true;
  readonly crafted: ItemStack;
  readonly container: ContainerSnapshot;
}

export type ConsumeRecipeResult = ItemRuleFailure | ConsumeRecipeSuccess;

export function itemDefinition(itemKind: string): ItemDefinition | null {
  return Object.prototype.hasOwnProperty.call(ITEM_DEFINITIONS, itemKind)
    ? ITEM_DEFINITIONS[itemKind as KnownItemKind]
    : null;
}

export function maxStackFor(itemKind: string): number | null {
  return itemDefinition(itemKind)?.maxStack ?? null;
}

export function slotAcceptsItem(container: ContainerSnapshot, index: number, itemKind: string): boolean {
  const definition = itemDefinition(itemKind);
  if (!definition || !Number.isSafeInteger(index) || index < 0 || index >= container.capacity) return false;
  const restriction = container.restrictions?.[index];
  if (!restriction) return true;
  if (restriction.acceptedKinds && !restriction.acceptedKinds.includes(itemKind)) return false;
  return (restriction.requiredTags ?? []).every((tag) => definition.tags.includes(tag));
}

/**
 * Inserts a complete pickup atomically, filling partial stacks before empty
 * slots. If the entire quantity cannot fit, the original container is left
 * untouched and the pickup must remain in the world.
 */
export function insertItemStack(container: ContainerSnapshot, item: ItemStack): InsertItemResult {
  const maxStack = maxStackFor(item.itemKind);
  if (maxStack === null) return failure('unknown_item_kind');
  if (!Number.isSafeInteger(item.quantity) || item.quantity <= 0) return failure('invalid_quantity');
  const normalized = normalizeContainer(container);
  let available = 0;
  for (let index = 0; index < normalized.capacity; index += 1) {
    if (!slotAcceptsItem(normalized, index, item.itemKind)) continue;
    const stack = normalized.slots[index];
    if (stack == null) available += maxStack;
    else if (stack.itemKind === item.itemKind && validStack(stack)) available += maxStack - stack.quantity;
  }
  if (available < item.quantity) return failure('container_full');

  const slots = [...normalized.slots];
  let remaining = item.quantity;
  for (let index = 0; index < slots.length && remaining > 0; index += 1) {
    const stack = slots[index];
    if (stack?.itemKind !== item.itemKind || !slotAcceptsItem(normalized, index, item.itemKind)) continue;
    const inserted = Math.min(remaining, maxStack - stack.quantity);
    if (inserted <= 0) continue;
    slots[index] = { ...stack, quantity: stack.quantity + inserted };
    remaining -= inserted;
  }
  for (let index = 0; index < slots.length && remaining > 0; index += 1) {
    if (slots[index] !== null || !slotAcceptsItem(normalized, index, item.itemKind)) continue;
    const inserted = Math.min(remaining, maxStack);
    slots[index] = { itemKind: item.itemKind, quantity: inserted };
    remaining -= inserted;
  }
  return { ok: true, insertedQuantity: item.quantity, container: withSlots(normalized, slots) };
}

function validStack(stack: ItemStack | null): stack is ItemStack {
  if (!stack) return false;
  const maxStack = maxStackFor(stack.itemKind);
  return maxStack !== null && Number.isSafeInteger(stack.quantity) && stack.quantity > 0 && stack.quantity <= maxStack;
}

function normalizeContainer(container: ContainerSnapshot): ContainerSnapshot {
  return {
    ...container,
    slots: Array.from({ length: container.capacity }, (_, index) => container.slots[index] ?? null),
  };
}

function cloneContainers(containers: Readonly<Record<string, ContainerSnapshot>>): Record<string, ContainerSnapshot> {
  return Object.fromEntries(Object.entries(containers).map(([id, container]) => [id, normalizeContainer(container)]));
}

function failure(code: ItemRuleErrorCode): ItemRuleFailure {
  return { ok: false, code };
}

function withSlots(container: ContainerSnapshot, slots: readonly (ItemStack | null)[]): ContainerSnapshot {
  return { ...container, slots };
}

export function moveItemStacks(
  containers: Readonly<Record<string, ContainerSnapshot>>,
  request: MoveItemRequest,
): MoveItemResult {
  const from = containers[request.fromContainer];
  const to = containers[request.toContainer];
  if (!from || !to) return failure('container_not_found');
  if (![request.fromIndex, request.toIndex].every(Number.isSafeInteger)
    || request.fromIndex < 0 || request.fromIndex >= from.capacity
    || request.toIndex < 0 || request.toIndex >= to.capacity) return failure('index_out_of_capacity');
  if (!Number.isSafeInteger(request.quantity) || request.quantity <= 0) return failure('invalid_quantity');
  if (request.fromContainer === request.toContainer && request.fromIndex === request.toIndex) return failure('same_slot');

  const source = from.slots[request.fromIndex] ?? null;
  if (!source) return failure('source_empty');
  if (!validStack(source)) return failure('unknown_item_kind');
  if (request.quantity > source.quantity) return failure('source_quantity_changed');
  if (!slotAcceptsItem(to, request.toIndex, source.itemKind)) return failure('slot_rejects_item');
  const target = to.slots[request.toIndex] ?? null;
  if (target && !validStack(target)) return failure('unknown_item_kind');

  const next = cloneContainers(containers);
  const sameContainer = request.fromContainer === request.toContainer;
  const fromSlots = [...next[request.fromContainer]!.slots];
  const toSlots = sameContainer ? fromSlots : [...next[request.toContainer]!.slots];
  const sourceRemainder = source.quantity - request.quantity;

  let outcome: MoveItemSuccess['outcome'];
  let movedQuantity = request.quantity;
  if (!target) {
    fromSlots[request.fromIndex] = sourceRemainder ? { ...source, quantity: sourceRemainder } : null;
    toSlots[request.toIndex] = { ...source, quantity: request.quantity };
    outcome = sourceRemainder ? 'split' : 'move';
  } else if (target.itemKind === source.itemKind) {
    const maxStack = maxStackFor(source.itemKind)!;
    movedQuantity = Math.min(request.quantity, maxStack - target.quantity);
    if (movedQuantity <= 0) return failure('target_stack_full');
    fromSlots[request.fromIndex] = source.quantity === movedQuantity ? null : { ...source, quantity: source.quantity - movedQuantity };
    toSlots[request.toIndex] = { ...target, quantity: target.quantity + movedQuantity };
    outcome = 'merge';
  } else {
    if (request.quantity !== source.quantity) return failure('partial_swap_forbidden');
    if (!slotAcceptsItem(from, request.fromIndex, target.itemKind)) return failure('slot_rejects_item');
    fromSlots[request.fromIndex] = target;
    toSlots[request.toIndex] = source;
    outcome = 'swap';
  }

  next[request.fromContainer] = withSlots(next[request.fromContainer]!, fromSlots);
  next[request.toContainer] = withSlots(next[request.toContainer]!, toSlots);
  return { ok: true, outcome, movedQuantity, containers: next };
}

function uniqueContainerIds(ids: readonly string[]): string[] {
  return [...new Set(ids)];
}

/** Minecraft-style shift click: merge into existing stacks first, then fill
 * empty slots in destination-container order. A partial move is valid. */
export function quickMoveItemStack(
  containers: Readonly<Record<string, ContainerSnapshot>>,
  request: QuickMoveItemRequest,
): MoveItemResult {
  const sourceContainer = containers[request.fromContainer];
  if (!sourceContainer) return failure('container_not_found');
  if (!Number.isSafeInteger(request.fromIndex) || request.fromIndex < 0 || request.fromIndex >= sourceContainer.capacity) {
    return failure('index_out_of_capacity');
  }
  const source = sourceContainer.slots[request.fromIndex] ?? null;
  if (!source) return failure('source_empty');
  if (!validStack(source)) return failure('unknown_item_kind');
  const destinationIds = uniqueContainerIds(request.toContainers).filter((id) => id !== request.fromContainer);
  if (destinationIds.some((id) => containers[id] === undefined)) return failure('container_not_found');

  const next = cloneContainers(containers);
  let remaining = source.quantity;
  const maximum = maxStackFor(source.itemKind)!;
  const passes = ['merge', 'empty'] as const;
  for (const pass of passes) for (const id of destinationIds) {
    const destination = next[id]!;
    const slots = [...destination.slots];
    for (let index = 0; index < destination.capacity && remaining > 0; index += 1) {
      if (!slotAcceptsItem(destination, index, source.itemKind)) continue;
      const stack = slots[index];
      if (pass === 'merge' && stack?.itemKind === source.itemKind) {
        const moved = Math.min(remaining, maximum - stack.quantity);
        if (moved > 0) slots[index] = { ...stack, quantity: stack.quantity + moved };
        remaining -= moved;
      } else if (pass === 'empty' && stack === null) {
        const moved = Math.min(remaining, maximum);
        slots[index] = { itemKind: source.itemKind, quantity: moved };
        remaining -= moved;
      }
    }
    next[id] = withSlots(destination, slots);
  }
  const movedQuantity = source.quantity - remaining;
  if (movedQuantity <= 0) return failure('container_full');
  const sourceSlots = [...next[request.fromContainer]!.slots];
  sourceSlots[request.fromIndex] = remaining === 0 ? null : { ...source, quantity: remaining };
  next[request.fromContainer] = withSlots(next[request.fromContainer]!, sourceSlots);
  return { ok: true, outcome: 'quick_move', movedQuantity, containers: next };
}

/** Evenly spreads a held stack over every compatible slot crossed during a
 * shift-drag. Remainders are assigned in first-visited order. */
export function distributeItemStack(
  containers: Readonly<Record<string, ContainerSnapshot>>,
  request: DistributeItemRequest,
): MoveItemResult {
  const sourceContainer = containers[request.fromContainer];
  if (!sourceContainer) return failure('container_not_found');
  if (!Number.isSafeInteger(request.fromIndex) || request.fromIndex < 0 || request.fromIndex >= sourceContainer.capacity) {
    return failure('index_out_of_capacity');
  }
  const source = sourceContainer.slots[request.fromIndex] ?? null;
  if (!source) return failure('source_empty');
  if (!validStack(source)) return failure('unknown_item_kind');
  const requestedQuantity = request.quantity ?? source.quantity;
  if (!Number.isSafeInteger(requestedQuantity) || requestedQuantity <= 0 || requestedQuantity > source.quantity) {
    return failure('invalid_quantity');
  }

  const seen = new Set<string>();
  const targets = request.targets.filter((target) => {
    const key = `${target.container}:${target.index}`;
    if (seen.has(key) || (target.container === request.fromContainer && target.index === request.fromIndex)) return false;
    seen.add(key);
    return true;
  });
  const capacities = targets.flatMap((target) => {
    const container = containers[target.container];
    if (!container) return [];
    if (!Number.isSafeInteger(target.index) || target.index < 0 || target.index >= container.capacity) return [];
    if (!slotAcceptsItem(container, target.index, source.itemKind)) return [];
    const stack = container.slots[target.index] ?? null;
    if (stack !== null && stack.itemKind !== source.itemKind) return [];
    return [{ ...target, available: (maxStackFor(source.itemKind) ?? 0) - (stack?.quantity ?? 0) }];
  }).filter((target) => target.available > 0);
  if (capacities.length === 0) return failure('container_full');
  const movedQuantity = Math.min(requestedQuantity, capacities.reduce((sum, target) => sum + target.available, 0));
  if (movedQuantity <= 0) return failure('container_full');

  const allocations = capacities.map(() => 0);
  let remaining = movedQuantity;
  while (remaining > 0) {
    const eligible = capacities.map((target, index) => ({ target, index }))
      .filter(({ target, index }) => allocations[index]! < target.available);
    if (eligible.length === 0) break;
    const share = Math.max(1, Math.floor(remaining / eligible.length));
    for (const { target, index } of eligible) {
      const moved = Math.min(share, target.available - allocations[index]!, remaining);
      allocations[index] = allocations[index]! + moved;
      remaining -= moved;
      if (remaining === 0) break;
    }
  }

  const next = cloneContainers(containers);
  capacities.forEach((target, allocationIndex) => {
    const quantity = allocations[allocationIndex] ?? 0;
    if (quantity <= 0) return;
    const container = next[target.container]!;
    const slots = [...container.slots];
    const stack = slots[target.index];
    slots[target.index] = stack
      ? { ...stack, quantity: stack.quantity + quantity }
      : { itemKind: source.itemKind, quantity };
    next[target.container] = withSlots(container, slots);
  });
  const sourceSlots = [...next[request.fromContainer]!.slots];
  const sourceRemainder = source.quantity - movedQuantity;
  sourceSlots[request.fromIndex] = sourceRemainder === 0 ? null : { ...source, quantity: sourceRemainder };
  next[request.fromContainer] = withSlots(next[request.fromContainer]!, sourceSlots);
  return { ok: true, outcome: 'distribute', movedQuantity, containers: next };
}

function inputSlots(grid: ContainerSnapshot, resultIndex: number): readonly (ItemStack | null)[] {
  return grid.slots.filter((_stack, index) => index !== resultIndex);
}

function shapedRecipeIndexes(
  recipe: ShapedRecipeDefinition,
  slots: readonly (ItemStack | null)[],
): readonly number[] | null {
  const gridWidth = Math.sqrt(slots.length);
  if (!Number.isInteger(gridWidth)) return null;
  const width = Math.round(gridWidth);
  const height = slots.length / width;
  if (recipe.width > width || recipe.height > height) return null;
  for (let offsetY = 0; offsetY <= height - recipe.height; offsetY += 1) {
    for (let offsetX = 0; offsetX <= width - recipe.width; offsetX += 1) {
      const consumed: number[] = [];
      let matches = true;
      for (let gridY = 0; gridY < height && matches; gridY += 1) {
        for (let gridX = 0; gridX < width; gridX += 1) {
          const patternX = gridX - offsetX;
          const patternY = gridY - offsetY;
          const expected = patternX >= 0 && patternX < recipe.width && patternY >= 0 && patternY < recipe.height
            ? recipe.pattern[patternY * recipe.width + patternX] ?? null
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

function recipeMatches(recipe: RecipeDefinition, slots: readonly (ItemStack | null)[]): boolean {
  if (recipe.kind === 'shaped') return shapedRecipeIndexes(recipe, slots) !== null;
  const required = new Map<string, number>();
  for (const input of recipe.inputs) required.set(input.itemKind, (required.get(input.itemKind) ?? 0) + input.quantity);
  const available = new Map<string, number>();
  for (const stack of slots) if (stack) available.set(stack.itemKind, (available.get(stack.itemKind) ?? 0) + stack.quantity);
  return available.size === required.size
    && [...required].every(([kind, quantity]) => (available.get(kind) ?? 0) >= quantity);
}

export function matchingRecipeId(
  grid: ContainerSnapshot,
  resultIndex = grid.capacity,
): keyof typeof RECIPES | null {
  const slots = inputSlots(normalizeContainer(grid), resultIndex);
  for (const [recipeId, recipe] of Object.entries(RECIPES)) {
    if (recipeMatches(recipe, slots)) return recipeId as keyof typeof RECIPES;
  }
  return null;
}

export function craftingRecipeOutput(recipeId: string): ItemStack | null {
  return Object.prototype.hasOwnProperty.call(RECIPES, recipeId)
    ? { ...RECIPES[recipeId as keyof typeof RECIPES].output }
    : null;
}

export function consumeCraftingRecipe(
  grid: ContainerSnapshot,
  recipeId: string,
  resultIndex = grid.capacity,
): ConsumeRecipeResult {
  const recipe = Object.prototype.hasOwnProperty.call(RECIPES, recipeId)
    ? RECIPES[recipeId as keyof typeof RECIPES]
    : null;
  if (!recipe) return failure('recipe_not_found');
  const normalized = normalizeContainer(grid);
  if (!recipeMatches(recipe, inputSlots(normalized, resultIndex))) return failure('recipe_inputs_missing');
  const slots = [...normalized.slots];
  if (recipe.kind === 'shaped') {
    const indexes = shapedRecipeIndexes(recipe, inputSlots(normalized, resultIndex));
    if (indexes === null) return failure('recipe_inputs_missing');
    indexes.forEach((index) => {
      const stack = slots[index]!;
      slots[index] = stack.quantity === 1 ? null : { ...stack, quantity: stack.quantity - 1 };
    });
  } else {
    for (const input of recipe.inputs) {
      let remaining = input.quantity;
      for (let index = 0; index < slots.length && remaining > 0; index += 1) {
        if (index === resultIndex || slots[index]?.itemKind !== input.itemKind) continue;
        const stack = slots[index]!;
        const consumed = Math.min(stack.quantity, remaining);
        remaining -= consumed;
        slots[index] = stack.quantity === consumed ? null : { ...stack, quantity: stack.quantity - consumed };
      }
    }
  }
  return { ok: true, crafted: recipe.output, container: withSlots(normalized, slots) };
}

export function craftItem(
  containers: Readonly<Record<string, ContainerSnapshot>>,
  request: CraftRequest,
): CraftResult {
  const recipe = Object.prototype.hasOwnProperty.call(RECIPES, request.recipeId)
    ? RECIPES[request.recipeId as keyof typeof RECIPES]
    : null;
  if (!recipe) return failure('recipe_not_found');
  const grid = containers[request.gridContainer];
  if (!grid) return failure('container_not_found');
  if (!Number.isSafeInteger(request.resultIndex) || request.resultIndex < 0 || request.resultIndex >= grid.capacity) {
    return failure('index_out_of_capacity');
  }
  if (!slotAcceptsItem(grid, request.resultIndex, recipe.output.itemKind)) return failure('recipe_output_blocked');

  const outputStack = grid.slots[request.resultIndex] ?? null;
  const outputMax = maxStackFor(recipe.output.itemKind);
  if (outputMax === null) return failure('unknown_item_kind');
  if (outputStack && (outputStack.itemKind !== recipe.output.itemKind
    || outputStack.quantity + recipe.output.quantity > outputMax)) return failure('recipe_output_blocked');

  const consumed = consumeCraftingRecipe(grid, request.recipeId, request.resultIndex);
  if (!consumed.ok) return consumed;
  const next = cloneContainers(containers);
  const slots = [...consumed.container.slots];
  slots[request.resultIndex] = outputStack
    ? { ...outputStack, quantity: outputStack.quantity + recipe.output.quantity }
    : { ...recipe.output };
  next[request.gridContainer] = withSlots(next[request.gridContainer]!, slots);
  return { ok: true, crafted: recipe.output, containers: next };
}
