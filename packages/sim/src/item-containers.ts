export interface ItemDefinition {
  readonly maxStack: number;
  readonly tags: readonly string[];
}

export const ITEM_DEFINITIONS = {
  axe: { maxStack: 1, tags: ['item.tool', 'gear.hand'] },
  hoe: { maxStack: 1, tags: ['item.tool', 'gear.hand'] },
  pickaxe: { maxStack: 1, tags: ['item.tool', 'gear.hand'] },
  watering_can: { maxStack: 1, tags: ['item.tool', 'gear.hand'] },
  wood: { maxStack: 99, tags: ['item.resource', 'material.wood'] },
  stone: { maxStack: 99, tags: ['item.resource', 'material.stone'] },
  plank: { maxStack: 99, tags: ['item.resource', 'material.wood', 'item.crafted'] },
  apple: { maxStack: 32, tags: ['item.crop', 'item.food', 'crop.fruit'] },
  grape: { maxStack: 32, tags: ['item.crop', 'item.food', 'crop.fruit'] },
  barrel: { maxStack: 16, tags: ['item.placeable', 'item.crafted', 'container.barrel'] },
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
  | 'recipe_output_blocked';

export interface ItemRuleFailure {
  readonly ok: false;
  readonly code: ItemRuleErrorCode;
}

export interface MoveItemSuccess {
  readonly ok: true;
  readonly outcome: 'move' | 'split' | 'merge' | 'swap';
  readonly movedQuantity: number;
  readonly containers: Readonly<Record<string, ContainerSnapshot>>;
}

export type MoveItemResult = ItemRuleFailure | MoveItemSuccess;

export interface RecipeDefinition {
  readonly inputs: readonly ItemStack[];
  readonly output: ItemStack;
}

export const RECIPES = {
  dev_planks: { inputs: [{ itemKind: 'wood', quantity: 2 }], output: { itemKind: 'plank', quantity: 4 } },
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

  const required = new Map<string, number>();
  for (const input of recipe.inputs) required.set(input.itemKind, (required.get(input.itemKind) ?? 0) + input.quantity);
  const available = new Map<string, number>();
  grid.slots.forEach((stack, index) => {
    if (index === request.resultIndex || !stack) return;
    available.set(stack.itemKind, (available.get(stack.itemKind) ?? 0) + stack.quantity);
  });
  if ([...required].some(([kind, quantity]) => (available.get(kind) ?? 0) < quantity)) return failure('recipe_inputs_missing');

  const next = cloneContainers(containers);
  const slots = [...next[request.gridContainer]!.slots];
  for (const [kind, quantity] of required) {
    let remaining = quantity;
    for (let index = 0; index < slots.length && remaining > 0; index += 1) {
      if (index === request.resultIndex || slots[index]?.itemKind !== kind) continue;
      const stack = slots[index]!;
      const consumed = Math.min(stack.quantity, remaining);
      remaining -= consumed;
      slots[index] = stack.quantity === consumed ? null : { ...stack, quantity: stack.quantity - consumed };
    }
  }
  slots[request.resultIndex] = outputStack
    ? { ...outputStack, quantity: outputStack.quantity + recipe.output.quantity }
    : { ...recipe.output };
  next[request.gridContainer] = withSlots(next[request.gridContainer]!, slots);
  return { ok: true, crafted: recipe.output, containers: next };
}
