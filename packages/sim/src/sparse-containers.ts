import { CONTAINER_CELL_CAPACITY_LIMIT, containerCellIndex } from './container-addressing.js';
import { runtimeDurabilityDefinition } from './content/runtime.js';
import type { ContentRegistry } from './content/registry.js';
import type { ContainerSnapshot, ItemStack, SlotRestriction } from './item-containers.js';
import type { ItemGear } from './item-gear.js';

/**
 * Sparse container cells (Uncapped Storage step 4). Only occupied cells are rows; a reducer builds a dense
 * `ContainerSnapshot` for just the containers it touches, runs the ordinary container operations, then writes back
 * only what changed: insert-or-update for occupied cells, delete for emptied ones. Nothing is ever dropped: rows at or
 * past the capacity come back as spill for `inventory_overflow`.
 */

/** Item kind the legacy tables store in a vacant cell. Sparse tables never store a vacant cell. */
export const VACANT_ITEM_KIND = 'empty';
const U16_MAX = 0xffff;

/** The stored stack columns of every container row (`inventory_slot`, `hearth_stash_slot`, `world_placeable_slot`
 * and the sparse cell tables): u16 quantity and durability, a lit flag, and a gear record once rows carry one. */
export interface ContainerCellStack {
  readonly itemKind: string;
  readonly quantity: number;
  readonly durability: number;
  readonly lit: boolean;
  readonly gear?: ItemGear;
}
export interface ContainerCellRow extends ContainerCellStack {
  readonly index: number;
}

/** A vacant row holds no item: the legacy `empty` kind, or a zero quantity (the world reads both as an empty cell). */
export function isVacantCellStack(stack: Pick<ContainerCellStack, 'itemKind' | 'quantity'>): boolean {
  return stack.itemKind === VACANT_ITEM_KIND || stack.quantity === 0;
}

/** Column ranges of a stored stack, or `container_cell_row_invalid`. */
export function assertContainerCellStack(stack: ContainerCellStack): void {
  if (typeof stack.itemKind !== 'string' || stack.itemKind.length === 0
    || !Number.isInteger(stack.quantity) || stack.quantity < 0 || stack.quantity > U16_MAX
    || !Number.isInteger(stack.durability) || stack.durability < 0 || stack.durability > U16_MAX
    || typeof stack.lit !== 'boolean') {
    throw new Error('container_cell_row_invalid');
  }
}

/** Exactly the stored columns, in one key order, so copies and fingerprints never carry row ids or owners. */
export function containerCellStack(stack: ContainerCellStack): ContainerCellStack {
  return Object.freeze({
    itemKind: stack.itemKind, quantity: stack.quantity, durability: stack.durability, lit: stack.lit,
    ...(stack.gear === undefined ? {} : { gear: stack.gear }),
  });
}

function gearKey(gear: ItemGear | undefined): string {
  return gear === undefined ? '' : JSON.stringify(Object.keys(gear).sort().map(key => [key, gear[key as keyof ItemGear]]));
}

export function sameContainerCellStack(left: ContainerCellStack, right: ContainerCellStack): boolean {
  return left.itemKind === right.itemKind && left.quantity === right.quantity && left.durability === right.durability
    && left.lit === right.lit && gearKey(left.gear) === gearKey(right.gear);
}

/** Converts between stored columns and the dense `ItemStack` the container operations use. */
export interface StoredStackCodec {
  /** Null only for a vacant row. */
  readonly read: (stack: ContainerCellStack) => ItemStack | null;
  readonly write: (stack: ItemStack) => ContainerCellStack;
}

/**
 * The world's stored-stack rules: durability exists only on durable kinds (a stored 0 is a broken tool, a missing one
 * is new and full), non-durable kinds store 0, lit defaults to true, and gear is carried through untouched.
 * `durableMaximum` returns the kind's maximum durability, or null for a non-durable kind.
 */
export function storedStackCodec(durableMaximum: (itemKind: string) => number | null): StoredStackCodec {
  return Object.freeze({
    read: (stack: ContainerCellStack): ItemStack | null => isVacantCellStack(stack) ? null : {
      itemKind: stack.itemKind,
      quantity: stack.quantity,
      ...(durableMaximum(stack.itemKind) === null ? {} : { durability: stack.durability }),
      lit: stack.lit,
      ...(stack.gear === undefined ? {} : { gear: stack.gear }),
    },
    write: (stack: ItemStack): ContainerCellStack => {
      const maximum = durableMaximum(stack.itemKind);
      if (maximum !== null && stack.durability !== undefined && !Number.isSafeInteger(stack.durability)) {
        throw new Error('container_cell_row_invalid');
      }
      return containerCellStack({
        itemKind: stack.itemKind,
        quantity: stack.quantity,
        durability: maximum === null ? 0 : Math.max(0, Math.min(maximum, stack.durability ?? maximum)),
        lit: stack.lit ?? true,
        ...(stack.gear === undefined ? {} : { gear: stack.gear }),
      });
    },
  });
}

/** `storedStackCodec` bound to the active content registry, as the world's `storedStack`/`storedDurability` are. */
export function runtimeStoredStackCodec(registry: ContentRegistry): StoredStackCodec {
  return storedStackCodec(itemKind => runtimeDurabilityDefinition(registry, itemKind)?.maximum ?? null);
}

export interface SparseContainerInput<R extends ContainerCellRow> {
  readonly id: string;
  readonly capacity: number;
  readonly restrictions?: Readonly<Record<number, SlotRestriction>>;
  /** Every stored row of this one container, in any order. */
  readonly cells: readonly R[];
  readonly codec: StoredStackCodec;
}

export interface SparseContainerBuild<R extends ContainerCellRow> {
  readonly container: ContainerSnapshot;
  /** Stored rows inside the capacity, by index (vacant legacy rows included, so a write can remove them). */
  readonly cellsByIndex: ReadonlyMap<number, R>;
  /** Item rows at or past the capacity (a shrunk container), by index. They belong in `inventory_overflow`. */
  readonly spill: readonly R[];
  /** Vacant rows at or past the capacity: no item, only a row to delete. */
  readonly staleVacant: readonly R[];
}

/** Dense snapshot of one container from its sparse rows. Invalid or duplicate rows fail rather than lose an item. */
export function buildDenseContainer<R extends ContainerCellRow>(input: SparseContainerInput<R>): SparseContainerBuild<R> {
  const { capacity } = input;
  if (!Number.isInteger(capacity) || capacity < 0 || capacity > CONTAINER_CELL_CAPACITY_LIMIT) {
    throw new Error('container_capacity_invalid');
  }
  const slots: (ItemStack | null)[] = new Array<ItemStack | null>(capacity).fill(null);
  const cellsByIndex = new Map<number, R>();
  const spill: R[] = [];
  const staleVacant: R[] = [];
  const seen = new Set<number>();
  for (const row of input.cells) {
    const index = containerCellIndex(row.index);
    if (seen.has(index)) throw new Error('container_cells_duplicate');
    seen.add(index);
    assertContainerCellStack(row);
    const vacant = isVacantCellStack(row);
    if (index >= capacity) {
      (vacant ? staleVacant : spill).push(row);
      continue;
    }
    cellsByIndex.set(index, row);
    const stack = input.codec.read(row);
    if (!vacant && stack === null) throw new Error('container_cell_unreadable');
    slots[index] = stack;
  }
  const byIndex = (left: R, right: R) => left.index - right.index;
  return Object.freeze({
    container: Object.freeze({
      id: input.id, capacity, slots,
      ...(input.restrictions === undefined ? {} : { restrictions: input.restrictions }),
    }),
    cellsByIndex,
    spill: Object.freeze(spill.sort(byIndex)),
    staleVacant: Object.freeze(staleVacant.sort(byIndex)),
  });
}

export interface ContainerCellUpsert<R extends ContainerCellRow> {
  readonly index: number;
  readonly stack: ContainerCellStack;
  /** The row to update, or null to insert. */
  readonly existing: R | null;
}
export interface SparseContainerWrites<R extends ContainerCellRow> {
  readonly upserts: readonly ContainerCellUpsert<R>[];
  readonly deletes: readonly R[];
}

/**
 * The sparse writes that turn a build's rows into `after`: an upsert for each cell whose stored value changed, a delete
 * for each emptied cell (and each vacant legacy row), nothing for an unchanged cell. Spill is not touched here; see
 * `planContainerSpill`.
 */
export function diffDenseContainer<R extends ContainerCellRow>(
  build: SparseContainerBuild<R>, after: ContainerSnapshot, codec: StoredStackCodec,
): SparseContainerWrites<R> {
  const { capacity } = build.container;
  if (after.capacity !== capacity) throw new Error('container_capacity_changed');
  if (after.slots.slice(capacity).some(stack => stack !== null && stack !== undefined)) {
    throw new Error('container_cells_past_capacity');
  }
  const upserts: ContainerCellUpsert<R>[] = [];
  const deletes: R[] = [];
  for (let index = 0; index < capacity; index += 1) {
    const existing = build.cellsByIndex.get(index) ?? null;
    const next = after.slots[index] ?? null;
    if (next === null) {
      if (existing !== null) deletes.push(existing);
      continue;
    }
    const stack = codec.write(next);
    assertContainerCellStack(stack);
    if (isVacantCellStack(stack)) throw new Error('container_cell_stack_invalid');
    const previous = existing === null ? null : codec.read(existing);
    if (previous !== null && sameContainerCellStack(codec.write(previous), stack)) continue;
    upserts.push(Object.freeze({ index, stack, existing }));
  }
  return Object.freeze({ upserts: Object.freeze(upserts), deletes: Object.freeze(deletes) });
}

/** A shrunk container's custody move: spilled stacks (by index, exact columns) go to `inventory_overflow`, and every
 * row at or past the capacity is deleted. The existing overflow drain returns them as space opens. */
export function planContainerSpill<R extends ContainerCellRow>(build: SparseContainerBuild<R>): {
  readonly overflow: readonly ContainerCellStack[];
  readonly deletes: readonly R[];
} {
  return Object.freeze({
    overflow: Object.freeze(build.spill.map(containerCellStack)),
    deletes: Object.freeze([...build.spill, ...build.staleVacant]),
  });
}
