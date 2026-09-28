import {
  CONTAINER_CELL_INVENTORY_PROTOCOL_VERSION,
  CURRENT_CONTAINER_LAYOUT_VERSION,
  cellToLegacyGlobalSlot,
  isPlayerContainerId,
  legacyGlobalSlotToCell,
  parsePlaceableContainerCellKey,
  parsePlayerContainerCellKey,
  playerContainerCellKey,
} from '@orchard/sim';
import * as containerCells from './container-cells.js';

/**
 * Test fixtures for the sparse container-cell tables (Uncapped Storage step 4b). Many authority tests describe a
 * player's inventory as a map of legacy global slots (hotbar 0-9, backpack 10-29, equipment 30-39, crafting 40-48);
 * `legacySlotCellTable` serves such a map as the `player_container_cell` table, so the production code reads and
 * writes sparse cells while the test keeps asserting by slot. Emptied cells read back as the legacy vacant row.
 */

export interface FixtureIdentity { toHexString(): string; isEqual?(other: unknown): boolean }
export interface LegacySlotRow {
  id?: string;
  identity?: unknown;
  slot: number;
  itemKind: string;
  quantity: number;
  durability?: number;
  lit?: boolean;
}
export interface FixtureCellRow {
  id: string;
  identity: unknown;
  container: string;
  index: number;
  itemKind: string;
  quantity: number;
  durability: number;
  lit: boolean;
}

const vacant = (row: { itemKind: string; quantity: number }) => row.itemKind === 'empty' || row.quantity === 0;

/** The index.ts helpers most authority tests extract alongside the reducer under test. */
export const PLAYER_CELL_HELPER_NAMES = Object.freeze([
  'withSenderErrors', 'requirePlayerContainerCells', 'selectedInventorySlot', 'equipmentInventorySlot',
  'hotbarAndBackpackCells', 'carriedCellsInSlotOrder', 'legacySlotOfCell', 'putInventoryCell',
] as const);

/** Module functions and constants the extracted index.ts helpers call: pass them with `...sim`. */
export const playerCellDependencies = Object.freeze({ ...containerCells });

/** An `inventory_migration` stub reporting every player on the current container layout (and protocol). */
export function currentContainerLayout(identity?: unknown) {
  const row = (who: unknown) => ({
    identity: who ?? identity, durabilityVersion: 1, hotbarLayoutVersion: 1, equipmentLayoutVersion: 1,
    containerLayoutVersion: CURRENT_CONTAINER_LAYOUT_VERSION,
  });
  return { identity: { find: (who: unknown) => row(who), update: (next: unknown) => next }, iter: () => [][Symbol.iterator]() };
}

export const CURRENT_PROTOCOL = CONTAINER_CELL_INVENTORY_PROTOCOL_VERSION;

function keyOf(identity: unknown): string {
  return typeof identity === 'object' && identity !== null && 'toHexString' in identity
    ? (identity as FixtureIdentity).toHexString() : String(identity);
}

/**
 * Serves `slots` (legacy global slot to row) as a `player_container_cell` table for one owner. Reads return only
 * occupied slots as cell rows; writes store legacy-shaped rows back in the map (a delete stores the vacant row), so
 * `slots.get(n)` keeps working in assertions.
 */
export function legacySlotCellTable(slots: Map<number, LegacySlotRow>, owner: unknown) {
  const ownerHex = keyOf(owner);
  const toCell = (row: LegacySlotRow): FixtureCellRow | null => {
    const cell = legacyGlobalSlotToCell(row.slot);
    if (cell === null || vacant(row)) return null;
    return {
      id: playerContainerCellKey(ownerHex, cell), identity: row.identity ?? owner, container: cell.container,
      index: cell.index, itemKind: row.itemKind, quantity: row.quantity, durability: row.durability ?? 0, lit: row.lit ?? true,
    };
  };
  const slotOf = (id: string): number | null => {
    const parsed = parsePlayerContainerCellKey(id);
    return parsed === null || parsed.identity !== ownerHex ? null : cellToLegacyGlobalSlot(parsed);
  };
  const store = (row: FixtureCellRow): FixtureCellRow => {
    if (!isPlayerContainerId(row.container)) throw new Error('fixture_container_invalid');
    const slot = cellToLegacyGlobalSlot({ container: row.container, index: row.index });
    if (slot === null) throw new Error(`fixture_cell_outside_legacy_layout:${row.container}:${row.index}`);
    slots.set(slot, {
      id: `${ownerHex}:${slot}`, identity: row.identity, slot,
      itemKind: row.itemKind, quantity: row.quantity, durability: row.durability, lit: row.lit,
    });
    return row;
  };
  const cells = () => [...slots.values()].sort((left, right) => left.slot - right.slot)
    .map(toCell).filter((cell): cell is FixtureCellRow => cell !== null);
  const index = {
    find: (id: string) => {
      const slot = slotOf(id);
      const row = slot === null ? undefined : slots.get(slot);
      return row === undefined ? null : toCell(row);
    },
    update: store,
    delete: (id: string) => {
      const slot = slotOf(id);
      const row = slot === null ? undefined : slots.get(slot);
      if (slot === null || row === undefined) return false;
      slots.set(slot, { ...row, itemKind: 'empty', quantity: 0, durability: 0, lit: true });
      return true;
    },
  };
  return {
    id: index,
    insert: store,
    iter: () => cells()[Symbol.iterator](),
    count: () => BigInt(cells().length),
    by_identity: { filter: (who: unknown) => cells().filter(() => keyOf(who) === ownerHex) },
    by_identity_container: {
      filter: ([who, container]: [unknown, string]) => cells().filter(cell => keyOf(who) === ownerHex && cell.container === container),
    },
  };
}

/** A plain multi-owner `player_container_cell` table (rows keyed by their id). */
export function playerCellTable(initial: readonly FixtureCellRow[] = []) {
  const rows = new Map<string, FixtureCellRow>(initial.map(row => [row.id, row]));
  const all = () => [...rows.values()];
  return {
    rows,
    id: {
      find: (id: string) => rows.get(id) ?? null,
      update: (row: FixtureCellRow) => { if (!rows.has(row.id)) throw new Error('fixture_row_missing'); rows.set(row.id, row); return row; },
      delete: (id: string) => rows.delete(id),
    },
    insert: (row: FixtureCellRow) => { if (rows.has(row.id)) throw new Error('fixture_row_duplicate'); rows.set(row.id, row); return row; },
    iter: () => all()[Symbol.iterator](),
    count: () => BigInt(rows.size),
    by_identity: { filter: (who: unknown) => all().filter(row => keyOf(row.identity) === keyOf(who)) },
    by_identity_container: {
      filter: ([who, container]: [unknown, string]) => all().filter(row => keyOf(row.identity) === keyOf(who) && row.container === container),
    },
  };
}

export interface FixturePlaceableCellRow {
  id: string; placeableId: bigint; index: number; itemKind: string; quantity: number; durability: number; lit: boolean;
}

/** A plain `placeable_container_cell` table plus an empty receipt table (every placeable counts as copied only when
 * it has no legacy rows, which is the fixture default). */
export function placeableCellTable(initial: readonly FixturePlaceableCellRow[] = []) {
  const rows = new Map<string, FixturePlaceableCellRow>(initial.map(row => [row.id, row]));
  const all = () => [...rows.values()].sort((left, right) => left.index - right.index);
  return {
    rows,
    id: {
      find: (id: string) => rows.get(id) ?? null,
      update: (row: FixturePlaceableCellRow) => { if (!rows.has(row.id)) throw new Error('fixture_row_missing'); rows.set(row.id, row); return row; },
      delete: (id: string) => rows.delete(id),
    },
    insert: (row: FixturePlaceableCellRow) => {
      if (parsePlaceableContainerCellKey(row.id) === null) throw new Error('fixture_key_invalid');
      if (rows.has(row.id)) throw new Error('fixture_row_duplicate');
      rows.set(row.id, row); return row;
    },
    iter: () => all()[Symbol.iterator](),
    count: () => BigInt(rows.size),
    by_placeable: { filter: (placeableId: bigint) => all().filter(row => row.placeableId === placeableId) },
  };
}

/** Empty legacy `world_placeable_slot` and `placeable_container_copy` tables, for fixtures whose placeables were
 * created after the copy (or never had legacy rows). */
export function copiedPlaceableTables() {
  const receipts = new Map<bigint, unknown>();
  return {
    world_placeable_slot: { by_placeable: { filter: () => [] }, iter: () => [][Symbol.iterator]() },
    placeable_container_copy: {
      placeableId: { find: (id: bigint) => receipts.get(id) ?? null },
      insert: (row: { placeableId: bigint }) => { receipts.set(row.placeableId, row); return row; },
      iter: () => receipts.values(),
    },
  };
}
