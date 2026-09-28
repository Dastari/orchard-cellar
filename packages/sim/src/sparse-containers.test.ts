import { describe, expect, it } from 'vitest';
import { bootstrapContentRegistry } from './content/bootstrap-registry.js';
import { BOOTSTRAP_ITEM_CONTAINER_CONTENT, moveItemStacks, type ContainerSnapshot } from './item-containers.js';
import type { ItemGear } from './item-gear.js';
import { EQUIPMENT_SLOT_RESTRICTIONS } from './inventory-layout.js';
import {
  buildDenseContainer,
  diffDenseContainer,
  planContainerSpill,
  runtimeStoredStackCodec,
  storedStackCodec,
  type ContainerCellRow,
} from './sparse-containers.js';

const codec = runtimeStoredStackCodec(bootstrapContentRegistry());
const content = BOOTSTRAP_ITEM_CONTAINER_CONTENT;
const gear: ItemGear = {
  instanceId: '9007199254740993', rollVersion: 1, rarity: 'rare', material: 'copper', itemLevel: 12,
  prefix: 'mighty', suffix: '', lineage: '', legendary: '', seed: 7,
};
interface Row extends ContainerCellRow { readonly id: string }
const row = (index: number, itemKind: string, quantity: number, extra: Partial<Row> = {}): Row => ({
  id: `p:${index}`, index, itemKind, quantity, durability: 0, lit: true, ...extra,
});

describe('sparse container cells', () => {
  it('builds a dense container with exact stack metadata and vacant rows as empty cells', () => {
    const cells = [
      row(3, 'copper_sword', 1, { durability: 0 }),
      row(0, 'apple', 32),
      row(1, 'copper_axe', 1, { durability: 117, lit: false }),
      row(2, 'empty', 0),
      row(5, 'copper_sword', 1, { durability: 200, gear }),
    ];
    const build = buildDenseContainer({ id: 'equipment', capacity: 10, restrictions: EQUIPMENT_SLOT_RESTRICTIONS, cells, codec });
    expect(build.container.slots).toEqual([
      { itemKind: 'apple', quantity: 32, lit: true },
      { itemKind: 'copper_axe', quantity: 1, durability: 117, lit: false },
      null,
      // A stored zero is a broken tool, not a missing value.
      { itemKind: 'copper_sword', quantity: 1, durability: 0, lit: true },
      null,
      { itemKind: 'copper_sword', quantity: 1, durability: 200, lit: true, gear },
      null, null, null, null,
    ]);
    expect(build.container.restrictions).toBe(EQUIPMENT_SLOT_RESTRICTIONS);
    expect(build.cellsByIndex.get(2)?.itemKind).toBe('empty');
    expect(build.spill).toEqual([]);
  });

  it('writes nothing for unchanged cells, including a stored value the codec would normalise', () => {
    const cells = [row(0, 'apple', 5, { durability: 9 }), row(4, 'copper_axe', 1, { durability: 50 })];
    const build = buildDenseContainer({ id: 'backpack', capacity: 20, cells, codec });
    expect(diffDenseContainer(build, build.container, codec)).toEqual({ upserts: [], deletes: [] });
  });

  it('diffs a real move into one update, one insert and one delete, keeping durability, lit and gear', () => {
    const cells = [row(0, 'apple', 30), row(1, 'copper_axe', 1, { durability: 60, lit: false }), row(2, 'copper_sword', 1, { durability: 200, gear })];
    const build = buildDenseContainer({ id: 'backpack', capacity: 20, cells, codec });
    const moved = moveItemStacks({ backpack: build.container }, { fromContainer: 'backpack', fromIndex: 2, toContainer: 'backpack', toIndex: 7, quantity: 1 }, content);
    if (!moved.ok) throw new Error(moved.code);
    const split = moveItemStacks(moved.containers, { fromContainer: 'backpack', fromIndex: 0, toContainer: 'backpack', toIndex: 19, quantity: 10 }, content);
    if (!split.ok) throw new Error(split.code);
    const writes = diffDenseContainer(build, split.containers.backpack!, codec);
    expect(writes.deletes).toEqual([cells[2]]);
    expect(writes.upserts).toEqual([
      { index: 0, stack: { itemKind: 'apple', quantity: 20, durability: 0, lit: true }, existing: cells[0] },
      { index: 7, stack: { itemKind: 'copper_sword', quantity: 1, durability: 200, lit: true, gear }, existing: null },
      { index: 19, stack: { itemKind: 'apple', quantity: 10, durability: 0, lit: true }, existing: null },
    ]);
  });

  it('removes vacant legacy rows it finds and updates a vacant row that gains an item', () => {
    const cells = [row(0, 'empty', 0), row(1, 'empty', 0)];
    const build = buildDenseContainer({ id: 'stash', capacity: 4, cells, codec });
    const after: ContainerSnapshot = { ...build.container, slots: [null, { itemKind: 'apple', quantity: 1 }, null, null] };
    const writes = diffDenseContainer(build, after, codec);
    expect(writes.deletes).toEqual([cells[0]]);
    expect(writes.upserts).toEqual([{ index: 1, stack: { itemKind: 'apple', quantity: 1, durability: 0, lit: true }, existing: cells[1] }]);
  });

  it('reports rows past a shrunk capacity as spill for overflow and never drops them', () => {
    const cells = [row(19, 'copper_axe', 1, { durability: 3, lit: false }), row(2, 'apple', 4), row(12, 'arrow', 99), row(15, 'empty', 0)];
    const build = buildDenseContainer({ id: 'backpack', capacity: 8, cells, codec });
    expect(build.container.slots.filter(stack => stack !== null)).toEqual([{ itemKind: 'apple', quantity: 4, lit: true }]);
    expect(build.spill.map(cell => cell.index)).toEqual([12, 19]);
    expect(build.staleVacant.map(cell => cell.index)).toEqual([15]);
    const spill = planContainerSpill(build);
    expect(spill.overflow).toEqual([
      { itemKind: 'arrow', quantity: 99, durability: 0, lit: true },
      { itemKind: 'copper_axe', quantity: 1, durability: 3, lit: false },
    ]);
    expect(spill.deletes.map(cell => cell.index)).toEqual([12, 19, 15]);
    // The in-capacity diff never touches spilled rows.
    expect(diffDenseContainer(build, build.container, codec)).toEqual({ upserts: [], deletes: [] });
  });

  it('fails closed on invalid, duplicate or unreadable rows and on a changed capacity', () => {
    const build = (cells: readonly Row[], capacity = 10) => buildDenseContainer({ id: 'x', capacity, cells, codec });
    expect(() => build([row(1, 'apple', 1), row(1, 'arrow', 1)])).toThrow('container_cells_duplicate');
    expect(() => build([row(-1, 'apple', 1)])).toThrow('container_cell_index_invalid');
    expect(() => build([row(0.5, 'apple', 1)])).toThrow('container_cell_index_invalid');
    expect(() => build([row(0, 'apple', 70_000)])).toThrow('container_cell_row_invalid');
    expect(() => build([row(0, 'apple', 1, { durability: -1 })])).toThrow('container_cell_row_invalid');
    expect(() => build([row(0, 'apple', 1, { lit: 1 as unknown as boolean })])).toThrow('container_cell_row_invalid');
    expect(() => build([row(0, '', 1)])).toThrow('container_cell_row_invalid');
    expect(() => build([], 65_536)).toThrow('container_capacity_invalid');
    const dropsItems = { ...storedStackCodec(() => null), read: () => null };
    expect(() => buildDenseContainer({ id: 'x', capacity: 2, cells: [row(0, 'apple', 1)], codec: dropsItems })).toThrow('container_cell_unreadable');
    const built = build([row(0, 'apple', 1)]);
    expect(() => diffDenseContainer(built, { ...built.container, capacity: 11 }, codec)).toThrow('container_capacity_changed');
    expect(() => diffDenseContainer(built, { ...built.container, slots: [...built.container.slots, { itemKind: 'apple', quantity: 1 }] }, codec))
      .toThrow('container_cells_past_capacity');
    expect(() => diffDenseContainer(built, { ...built.container, slots: [{ itemKind: 'apple', quantity: 0 }] }, codec))
      .toThrow('container_cell_stack_invalid');
  });

  it('builds and diffs a 1000-cell backpack touching only the changed cells', () => {
    const cells = [row(0, 'apple', 32), row(499, 'copper_axe', 1, { durability: 42, lit: false }), row(999, 'arrow', 50), row(1000, 'arrow', 7)];
    const build = buildDenseContainer({ id: 'backpack', capacity: 1000, cells, codec });
    expect(build.container.slots).toHaveLength(1000);
    expect(build.container.slots[999]).toEqual({ itemKind: 'arrow', quantity: 50, lit: true });
    expect(build.spill.map(cell => cell.index)).toEqual([1000]);
    const moved = moveItemStacks({ backpack: build.container }, { fromContainer: 'backpack', fromIndex: 499, toContainer: 'backpack', toIndex: 998, quantity: 1 }, content);
    if (!moved.ok) throw new Error(moved.code);
    const writes = diffDenseContainer(build, moved.containers.backpack!, codec);
    expect(writes.deletes).toEqual([cells[1]]);
    expect(writes.upserts).toEqual([{ index: 998, stack: { itemKind: 'copper_axe', quantity: 1, durability: 42, lit: false }, existing: null }]);
  });
});
