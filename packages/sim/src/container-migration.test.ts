import { describe, expect, it } from 'vitest';
import { cellToLegacyGlobalSlot, MAIN_HAND_SELECTED_SLOT } from './container-addressing.js';
import {
  CURRENT_CONTAINER_LAYOUT_VERSION,
  LEGACY_CONTAINER_LAYOUT_VERSION,
  legacyPlaceableSlotsFingerprint,
  legacyPlayerInventoryFingerprint,
  placeableContainerCellsFingerprint,
  planPlaceableContainerMigration,
  planPlayerContainerMigration,
  playerContainerCellsFingerprint,
  type LegacyContainerSlotRow,
  type LegacyPlaceableSlotRow,
  type PlayerContainerCell,
} from './container-migration.js';
import { bootstrapContentRegistry } from './content/bootstrap-registry.js';
import { CONTAINER_CELL_INVENTORY_PROTOCOL_VERSION, CURRENT_EQUIPMENT_LAYOUT_VERSION, CURRENT_INVENTORY_PROTOCOL_VERSION } from './inventory-migration.js';
import { EQUIPMENT_SLOT_OFFSET } from './inventory-layout.js';
import { buildDenseContainer, diffDenseContainer, runtimeStoredStackCodec } from './sparse-containers.js';

type Row = LegacyContainerSlotRow & { readonly id: string };
const vacant = (slot: number): Row => ({ id: `me:${slot}`, slot, itemKind: 'empty', quantity: 0, durability: 0, lit: true });
const item = (slot: number, itemKind: string, quantity: number, durability = 0, lit = true): Row => ({
  id: `me:${slot}`, slot, itemKind, quantity, durability, lit,
});
const EQUIPPED = ['hearth_angler_pendant', 'hearth_common_head', 'watch', 'copper_sword', 'backpack', 'hearth_common_shield',
  'hearth_common_hands', 'hearth_common_legs', 'hearth_common_feet', 'hearth_common_body'];
/** A full world inventory as stored today: one row per cell, every cell occupied, 49 rows. */
function fullInventory(): Row[] {
  const rows: Row[] = [];
  for (let slot = 0; slot < 10; slot += 1) rows.push(item(slot, slot % 2 === 0 ? 'apple' : 'arrow', slot + 1));
  rows[3] = item(3, 'copper_axe', 1, 0); // a broken tool keeps its stored zero
  rows[4] = item(4, 'torch', 1, 0, false);
  for (let slot = 10; slot < 30; slot += 1) rows.push(item(slot, slot % 3 === 0 ? 'wood' : 'stone', 99 - slot));
  EQUIPPED.forEach((kind, index) => rows.push(item(EQUIPMENT_SLOT_OFFSET + index, kind, 1, index === 3 ? 187 : 0)));
  for (let slot = 40; slot < 49; slot += 1) rows.push(item(slot, 'plank', slot - 39));
  return rows;
}
const stashRows = (): Row[] => [item(0, 'copper_bar', 12), vacant(1), item(2, 'gold_axe', 1, 399, false), item(15, 'apple', 32), vacant(3)];
const codec = runtimeStoredStackCodec(bootstrapContentRegistry());

function asLegacyRows(cells: readonly PlayerContainerCell[]): Row[] {
  return cells.filter(cell => cell.container !== 'stash').map(({ container, index, ...stack }) => {
    const slot = cellToLegacyGlobalSlot({ container, index })!;
    return { id: `me:${slot}`, slot, ...stack };
  });
}

describe('player container migration plan', () => {
  it('defines the next layout and protocol versions without changing the current ones', () => {
    expect([LEGACY_CONTAINER_LAYOUT_VERSION, CURRENT_CONTAINER_LAYOUT_VERSION]).toEqual([0, 1]);
    expect(CURRENT_INVENTORY_PROTOCOL_VERSION).toBe(1);
    expect(CURRENT_EQUIPMENT_LAYOUT_VERSION).toBe(1);
    expect(CONTAINER_CELL_INVENTORY_PROTOCOL_VERSION).toBe(2);
  });

  it('moves a full inventory and stash into cells with every item accounted for', () => {
    const rows = fullInventory();
    const stash = stashRows();
    const plan = planPlayerContainerMigration({ inventoryRows: rows, equipmentLayoutVersion: 1, stashRows: stash, selectedSlot: MAIN_HAND_SELECTED_SLOT });
    expect(plan.layoutVersion).toBe(CURRENT_CONTAINER_LAYOUT_VERSION);
    expect(plan.counts).toMatchObject({ sourceRows: 54, vacantRows: 2, cells: 52,
      cellsByContainer: { hotbar: 10, backpack: 20, equipment: 10, crafting: 9, stash: 3 } });
    const sourceItems = [...rows, ...stash].filter(row => row.itemKind !== 'empty');
    expect(plan.counts.totalQuantity).toBe(sourceItems.reduce((sum, row) => sum + row.quantity, 0));
    const byKind: Record<string, number> = {};
    for (const row of sourceItems) byKind[row.itemKind] = (byKind[row.itemKind] ?? 0) + row.quantity;
    expect(plan.counts.quantityByKind).toEqual(byKind);
    expect(Object.keys(plan.counts.quantityByKind)).toEqual(Object.keys(byKind).sort());
    // Every source item is one cell with identical columns; equipment keeps its paper-doll index.
    for (const row of rows) {
      const cell = plan.cells.find(candidate => candidate.container !== 'stash' && cellToLegacyGlobalSlot(candidate) === row.slot)!;
      expect({ itemKind: cell.itemKind, quantity: cell.quantity, durability: cell.durability, lit: cell.lit })
        .toEqual({ itemKind: row.itemKind, quantity: row.quantity, durability: row.durability, lit: row.lit });
    }
    expect(plan.cells.filter(cell => cell.container === 'equipment').map(cell => [cell.index, cell.itemKind]))
      .toEqual(EQUIPPED.map((kind, index) => [index, kind]));
    expect(plan.cells.filter(cell => cell.container === 'stash').map(cell => [cell.index, cell.itemKind, cell.durability, cell.lit]))
      .toEqual([[0, 'copper_bar', 0, true], [2, 'gold_axe', 399, false], [15, 'apple', 0, true]]);
    expect(plan.selectedSlot).toBe(33);
    expect(plan.selectedCell).toEqual({ container: 'equipment', index: 3 });
    expect(plan.sourceFingerprint).toBe(plan.resultFingerprint);
    expect(plan.sourceFingerprint).toMatch(/^player-cells:52:\d+:[0-9a-f]{8}$/u);
  });

  it('round-trips through dense containers and back to legacy rows with equal fingerprints', () => {
    const rows = [...fullInventory().filter(row => row.slot % 4 !== 0), vacant(0), vacant(4), vacant(8)];
    const stash = stashRows();
    const plan = planPlayerContainerMigration({ inventoryRows: rows, equipmentLayoutVersion: 1, stashRows: stash, selectedSlot: 2 });
    expect(plan.selectedCell).toEqual({ container: 'hotbar', index: 2 });
    const capacities = { hotbar: 10, backpack: 20, equipment: 10, crafting: 9, stash: 16 } as const;
    for (const container of Object.keys(capacities) as (keyof typeof capacities)[]) {
      const build = buildDenseContainer({ id: container, capacity: capacities[container],
        cells: plan.cells.filter(cell => cell.container === container), codec });
      expect(build.spill).toEqual([]);
      expect(diffDenseContainer(build, build.container, codec)).toEqual({ upserts: [], deletes: [] });
    }
    const legacyAgain = asLegacyRows(plan.cells);
    const stashAgain = plan.cells.filter(cell => cell.container === 'stash').map(cell => ({ slot: cell.index, itemKind: cell.itemKind, quantity: cell.quantity, durability: cell.durability, lit: cell.lit }));
    expect(legacyPlayerInventoryFingerprint({ inventoryRows: legacyAgain, equipmentLayoutVersion: 1, stashRows: stashAgain }))
      .toBe(plan.sourceFingerprint);
    expect(playerContainerCellsFingerprint([...plan.cells].reverse())).toBe(plan.resultFingerprint);
    // Vacant rows never change custody or the fingerprint.
    expect(legacyPlayerInventoryFingerprint({ inventoryRows: rows.filter(row => row.itemKind !== 'empty'), equipmentLayoutVersion: 1, stashRows: stash }))
      .toBe(plan.sourceFingerprint);
  });

  it('applies the pre-Body equipment layout first, so a version 0 inventory lands in the same cells', () => {
    const current = fullInventory().filter(row => row.slot !== 39);
    const version0 = current.map(row => row.slot < 39 ? row : { ...row, slot: row.slot - 1 });
    const fromOld = planPlayerContainerMigration({ inventoryRows: version0, equipmentLayoutVersion: 0, stashRows: [], selectedSlot: 0 });
    const fromNew = planPlayerContainerMigration({ inventoryRows: current, equipmentLayoutVersion: 1, stashRows: [], selectedSlot: 0 });
    expect(fromOld.cells).toEqual(fromNew.cells);
    expect(fromOld.cells.filter(cell => cell.container === 'crafting').map(cell => cell.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(fromOld.resultFingerprint).toBe(fromNew.resultFingerprint);
  });

  it('keeps a stranded backpack cell, which spills to overflow when built at a smaller capacity', () => {
    const plan = planPlayerContainerMigration({ inventoryRows: [item(25, 'wood', 40)], equipmentLayoutVersion: 1, stashRows: [], selectedSlot: 0 });
    expect(plan.cells).toEqual([{ container: 'backpack', index: 15, itemKind: 'wood', quantity: 40, durability: 0, lit: true }]);
    const build = buildDenseContainer({ id: 'backpack', capacity: 8, cells: plan.cells, codec });
    expect(build.spill).toEqual(plan.cells);
  });

  it('changes the fingerprint when any custody detail changes', () => {
    const base = { inventoryRows: fullInventory(), equipmentLayoutVersion: 1, stashRows: stashRows() };
    const reference = legacyPlayerInventoryFingerprint(base);
    const changed = (patch: (rows: Row[]) => Row[]) => legacyPlayerInventoryFingerprint({ ...base, inventoryRows: patch(fullInventory()) });
    expect(changed(rows => rows.map(row => row.slot === 12 ? { ...row, quantity: row.quantity - 1 } : row))).not.toBe(reference);
    expect(changed(rows => rows.map(row => row.slot === 33 ? { ...row, durability: 186 } : row))).not.toBe(reference);
    expect(changed(rows => rows.map(row => row.slot === 4 ? { ...row, lit: true } : row))).not.toBe(reference);
    expect(changed(rows => rows.map(row => row.slot === 12 ? { ...row, itemKind: 'plank' } : row))).not.toBe(reference);
    expect(changed(rows => rows.map(row => row.slot === 12 ? { ...row, slot: 13 } : row.slot === 13 ? { ...row, slot: 12 } : row))).not.toBe(reference);
    expect(changed(rows => [...rows].reverse())).toBe(reference);
  });

  it('fails closed on invalid, duplicate or out-of-layout rows instead of losing items', () => {
    const plan = (inventoryRows: readonly LegacyContainerSlotRow[], stash: readonly LegacyContainerSlotRow[] = [], version = 1) =>
      () => planPlayerContainerMigration({ inventoryRows, equipmentLayoutVersion: version, stashRows: stash, selectedSlot: 0 });
    expect(plan([item(3, 'apple', 1), item(3, 'arrow', 1)])).toThrow('inventory_layout_rows_invalid');
    expect(plan([item(49, 'apple', 1)])).toThrow('inventory_layout_rows_invalid');
    expect(plan([item(48, 'apple', 1)], [], 0)).toThrow('inventory_layout_rows_invalid');
    expect(plan([item(2.5, 'apple', 1)])).toThrow('inventory_layout_rows_invalid');
    expect(plan([item(1, 'apple', 1)], [], 2)).toThrow('inventory_layout_version_unsupported');
    expect(plan([item(1, 'apple', 70_000)])).toThrow('container_cell_row_invalid');
    expect(plan([item(1, 'apple', 1, -2)])).toThrow('container_cell_row_invalid');
    expect(plan([{ ...item(1, 'apple', 1), lit: undefined as unknown as boolean }])).toThrow('container_cell_row_invalid');
    expect(plan([], [item(0, 'apple', 1), item(0, 'arrow', 1)])).toThrow('stash_layout_rows_invalid');
    expect(plan([], [item(-1, 'apple', 1)])).toThrow('stash_layout_rows_invalid');
    expect(plan([], [vacant(4), vacant(4)])).toThrow('stash_layout_rows_invalid');
  });
});

describe('placeable container migration plan', () => {
  const place = (placeableId: bigint, slot: number, itemKind: string, quantity: number, durability = 0, lit = true): LegacyPlaceableSlotRow =>
    ({ placeableId, slot, itemKind, quantity, durability, lit });
  const rows = (): LegacyPlaceableSlotRow[] => [
    place(9223372036854775809n, 15, 'apple', 7), place(9223372036854775809n, 0, 'copper_sword', 1, 12, false),
    place(9223372036854775809n, 1, 'empty', 0), place(42n, 3, 'wood', 99), place(42n, 0, 'empty', 0),
  ];

  it('copies every item row to a cell with counts and matching fingerprints', () => {
    const plan = planPlaceableContainerMigration(rows());
    expect(plan.cells.map(cell => [cell.placeableId, cell.index, cell.itemKind, cell.quantity, cell.durability, cell.lit])).toEqual([
      [42n, 3, 'wood', 99, 0, true],
      [9223372036854775809n, 0, 'copper_sword', 1, 12, false],
      [9223372036854775809n, 15, 'apple', 7, 0, true],
    ]);
    expect(plan.counts).toEqual({ sourceRows: 5, vacantRows: 2, cells: 3, totalQuantity: 107,
      quantityByKind: { apple: 7, copper_sword: 1, wood: 99 }, placeables: 2 });
    expect(plan.sourceFingerprint).toBe(plan.resultFingerprint);
    expect(placeableContainerCellsFingerprint([...plan.cells].reverse())).toBe(plan.resultFingerprint);
    expect(legacyPlaceableSlotsFingerprint(rows().reverse())).toBe(plan.sourceFingerprint);
    expect(legacyPlaceableSlotsFingerprint(rows().map(row => row.slot === 3 ? { ...row, quantity: 98 } : row))).not.toBe(plan.sourceFingerprint);
    expect(legacyPlaceableSlotsFingerprint(rows().map(row => row.slot === 3 ? { ...row, placeableId: 43n } : row))).not.toBe(plan.sourceFingerprint);
  });

  it('fails closed on duplicate or invalid rows', () => {
    expect(() => planPlaceableContainerMigration([...rows(), place(42n, 3, 'apple', 1)])).toThrow('placeable_layout_rows_invalid');
    expect(() => planPlaceableContainerMigration([place(-1n, 0, 'apple', 1)])).toThrow('placeable_layout_rows_invalid');
    expect(() => planPlaceableContainerMigration([place(1n << 64n, 0, 'apple', 1)])).toThrow('placeable_layout_rows_invalid');
    expect(() => planPlaceableContainerMigration([place(1n, 1.5, 'apple', 1)])).toThrow('placeable_layout_rows_invalid');
    expect(() => planPlaceableContainerMigration([place(1n, 0, 'apple', 1, 70_000)])).toThrow('container_cell_row_invalid');
  });
});
