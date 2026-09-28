import {
  CONTAINER_CELL_CAPACITY_LIMIT,
  PLAYER_CONTAINERS,
  isContainerCellIndex,
  legacyGlobalSlotToCell,
  selectedSlotCell,
  type PlaceableContainerCellRef,
  type PlayerContainerCellRef,
  type PlayerContainerId,
} from './container-addressing.js';
import { migrateEquipmentLayout } from './inventory-migration.js';
import { assertContainerCellStack, containerCellStack, isVacantCellStack, type ContainerCellStack } from './sparse-containers.js';

/**
 * Container layout history (Uncapped Storage step 4). Version 0 is the legacy global `inventory_slot` numbering plus the
 * `hearth_stash_slot` table; version 1 is sparse container cells (`player_container_cell`). The world moves a player's
 * rows once at connect time, gated on this version, after the existing hotbar and equipment layout steps.
 */
export const LEGACY_CONTAINER_LAYOUT_VERSION = 0;
export const CURRENT_CONTAINER_LAYOUT_VERSION = 1;

/** One legacy container row: `inventory_slot`, `hearth_stash_slot` or `world_placeable_slot`, minus ids and owners. */
export interface LegacyContainerSlotRow extends ContainerCellStack {
  readonly slot: number;
}
export interface LegacyPlaceableSlotRow extends LegacyContainerSlotRow {
  readonly placeableId: bigint;
}
export interface PlayerContainerCell extends PlayerContainerCellRef, ContainerCellStack {}
export interface PlaceableContainerCell extends PlaceableContainerCellRef, ContainerCellStack {}

export interface ContainerMigrationCounts {
  /** Every source row read, vacant ones included. */
  readonly sourceRows: number;
  /** Explicit `empty` (or zero-quantity) rows. They hold no item and become absent cells. */
  readonly vacantRows: number;
  /** Item rows, one cell each. `sourceRows === vacantRows + cells`. */
  readonly cells: number;
  readonly totalQuantity: number;
  /** Summed quantity per item kind, keys sorted. */
  readonly quantityByKind: Readonly<Record<string, number>>;
}

export interface PlayerContainerMigrationInput {
  /** The player's `inventory_slot` rows, hotbar layout already current. */
  readonly inventoryRows: readonly LegacyContainerSlotRow[];
  /** `inventory_migration.equipmentLayoutVersion`; version 0 rows are relocated first as `migrateEquipmentLayout` does. */
  readonly equipmentLayoutVersion: number;
  /** The player's `hearth_stash_slot` rows. */
  readonly stashRows: readonly LegacyContainerSlotRow[];
  readonly selectedSlot: number;
}

export interface PlayerContainerMigrationPlan {
  readonly layoutVersion: typeof CURRENT_CONTAINER_LAYOUT_VERSION;
  /** Occupied cells only, in container then index order. */
  readonly cells: readonly PlayerContainerCell[];
  /** Unchanged: the stored value keeps its meaning under the named selected-slot values. */
  readonly selectedSlot: number;
  readonly selectedCell: PlayerContainerCellRef | null;
  readonly counts: ContainerMigrationCounts & { readonly cellsByContainer: Readonly<Record<PlayerContainerId, number>> };
  /** `legacyPlayerInventoryFingerprint` of the source; equals `resultFingerprint` or the plan is refused. */
  readonly sourceFingerprint: string;
  /** `playerContainerCellsFingerprint` of `cells`; the world re-reads its written rows and compares. */
  readonly resultFingerprint: string;
}

export interface PlaceableContainerMigrationPlan {
  /** Occupied cells only, in placeable then index order. */
  readonly cells: readonly PlaceableContainerCell[];
  readonly counts: ContainerMigrationCounts & { readonly placeables: number };
  readonly sourceFingerprint: string;
  readonly resultFingerprint: string;
}

function fail(code: string): never { throw new Error(code); }

function stableJson(value: unknown): string {
  if (typeof value === 'bigint') return JSON.stringify(`${value}n`);
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>).filter(([, child]) => child !== undefined)
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    .map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`).join(',')}}`;
}

/** FNV-1a over canonical JSON, the chest migration's fingerprint. */
function hash(value: unknown): string {
  let result = 0x811c9dc5;
  for (const character of stableJson(value)) {
    result ^= character.codePointAt(0) ?? 0;
    result = Math.imul(result, 0x01000193) >>> 0;
  }
  return result.toString(16).padStart(8, '0');
}

function stackEntry(stack: ContainerCellStack): unknown[] {
  return [stack.itemKind, stack.quantity, stack.durability, stack.lit, stack.gear ?? null];
}

function totalQuantity(cells: readonly ContainerCellStack[]): number {
  return cells.reduce((sum, cell) => sum + cell.quantity, 0);
}

const CONTAINER_ORDER = new Map<string, number>(PLAYER_CONTAINERS.map((container, order) => [container, order]));
function comparePlayerCells(left: PlayerContainerCellRef, right: PlayerContainerCellRef): number {
  return (CONTAINER_ORDER.get(left.container)! - CONTAINER_ORDER.get(right.container)!) || left.index - right.index;
}
function comparePlaceableCells(left: PlaceableContainerCellRef, right: PlaceableContainerCellRef): number {
  return left.placeableId < right.placeableId ? -1 : left.placeableId > right.placeableId ? 1 : left.index - right.index;
}

/**
 * Custody fingerprint of one player's occupied cells: `player-cells:<cells>:<total quantity>:<hash>`. It covers every
 * cell's address and exact stack columns and ignores row order, row ids and vacant rows, so the same inventory gives
 * the same value whether read from the legacy tables or the sparse ones.
 */
export function playerContainerCellsFingerprint(cells: readonly PlayerContainerCell[]): string {
  const sorted = [...cells].sort(comparePlayerCells);
  return `player-cells:${sorted.length}:${totalQuantity(sorted)}:${hash(sorted.map(cell => [cell.container, cell.index, ...stackEntry(cell)]))}`;
}

/** Custody fingerprint of placeable cells, the same shape keyed by placeable id: `placeable-cells:...`. */
export function placeableContainerCellsFingerprint(cells: readonly PlaceableContainerCell[]): string {
  const sorted = [...cells].sort(comparePlaceableCells);
  return `placeable-cells:${sorted.length}:${totalQuantity(sorted)}:${hash(sorted.map(cell => [cell.placeableId, cell.index, ...stackEntry(cell)]))}`;
}

function counts(sourceRows: number, cells: readonly ContainerCellStack[]): ContainerMigrationCounts {
  const byKind = new Map<string, number>();
  for (const cell of cells) byKind.set(cell.itemKind, (byKind.get(cell.itemKind) ?? 0) + cell.quantity);
  return Object.freeze({
    sourceRows, vacantRows: sourceRows - cells.length, cells: cells.length, totalQuantity: totalQuantity(cells),
    quantityByKind: Object.freeze(Object.fromEntries([...byKind].sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0))),
  });
}

function checkedStack(row: ContainerCellStack): ContainerCellStack | null {
  assertContainerCellStack(row);
  return isVacantCellStack(row) ? null : containerCellStack(row);
}

/** Legacy player rows as cells. Every item row lands in exactly one cell; any row that cannot fails the whole plan. */
function legacyPlayerCells(input: Omit<PlayerContainerMigrationInput, 'selectedSlot'>): PlayerContainerCell[] {
  const cells: PlayerContainerCell[] = [];
  for (const row of migrateEquipmentLayout(input.inventoryRows, input.equipmentLayoutVersion).slots) {
    const stack = checkedStack(row);
    if (stack === null) continue;
    const cell = legacyGlobalSlotToCell(row.slot) ?? fail('inventory_layout_rows_invalid');
    cells.push(Object.freeze({ container: cell.container, index: cell.index, ...stack }));
  }
  const stashSlots = new Set<number>();
  for (const row of input.stashRows) {
    if (!isContainerCellIndex(row.slot) || row.slot >= CONTAINER_CELL_CAPACITY_LIMIT || stashSlots.has(row.slot)) {
      fail('stash_layout_rows_invalid');
    }
    stashSlots.add(row.slot);
    const stack = checkedStack(row);
    if (stack !== null) cells.push(Object.freeze({ container: 'stash', index: row.slot, ...stack }));
  }
  return cells.sort(comparePlayerCells);
}

/** The custody fingerprint of a player's legacy rows, comparable with `playerContainerCellsFingerprint`. */
export function legacyPlayerInventoryFingerprint(input: Omit<PlayerContainerMigrationInput, 'selectedSlot'>): string {
  return playerContainerCellsFingerprint(legacyPlayerCells(input));
}

/**
 * Pure plan for one player's move to container cells, made in full before any write. Equipment keeps its indices,
 * `selectedSlot` is unchanged, vacant legacy rows become absent cells, and invalid, duplicate or out-of-layout rows
 * refuse the plan (like `migrateEquipmentLayout`) rather than lose an item.
 */
export function planPlayerContainerMigration(input: PlayerContainerMigrationInput): PlayerContainerMigrationPlan {
  const cells = legacyPlayerCells(input);
  const cellsByContainer = Object.fromEntries(PLAYER_CONTAINERS.map(container => [container, 0])) as Record<PlayerContainerId, number>;
  for (const cell of cells) cellsByContainer[cell.container] += 1;
  const sourceFingerprint = legacyPlayerInventoryFingerprint(input);
  const resultFingerprint = playerContainerCellsFingerprint(cells);
  const planCounts = counts(input.inventoryRows.length + input.stashRows.length, cells);
  if (sourceFingerprint !== resultFingerprint) fail('container_migration_parity_failed');
  return Object.freeze({
    layoutVersion: CURRENT_CONTAINER_LAYOUT_VERSION,
    cells: Object.freeze(cells),
    selectedSlot: input.selectedSlot,
    selectedCell: selectedSlotCell(input.selectedSlot),
    counts: Object.freeze({ ...planCounts, cellsByContainer: Object.freeze(cellsByContainer) }),
    sourceFingerprint,
    resultFingerprint,
  });
}

function legacyPlaceableCells(rows: readonly LegacyPlaceableSlotRow[]): PlaceableContainerCell[] {
  const seen = new Set<string>();
  const cells: PlaceableContainerCell[] = [];
  for (const row of rows) {
    const key = `${row.placeableId}:${row.slot}`;
    if (typeof row.placeableId !== 'bigint' || row.placeableId < 0n || row.placeableId >= 1n << 64n
      || !isContainerCellIndex(row.slot) || row.slot >= CONTAINER_CELL_CAPACITY_LIMIT || seen.has(key)) {
      fail('placeable_layout_rows_invalid');
    }
    seen.add(key);
    const stack = checkedStack(row);
    if (stack !== null) cells.push(Object.freeze({ placeableId: row.placeableId, index: row.slot, ...stack }));
  }
  return cells.sort(comparePlaceableCells);
}

/** The custody fingerprint of legacy `world_placeable_slot` rows, comparable with `placeableContainerCellsFingerprint`. */
export function legacyPlaceableSlotsFingerprint(rows: readonly LegacyPlaceableSlotRow[]): string {
  return placeableContainerCellsFingerprint(legacyPlaceableCells(rows));
}

/** Pure one-time copy plan for any batch of `world_placeable_slot` rows (whole placeables per batch). Cells keep
 * their index; vacant rows become absent cells; invalid or duplicate rows refuse the plan. */
export function planPlaceableContainerMigration(rows: readonly LegacyPlaceableSlotRow[]): PlaceableContainerMigrationPlan {
  const cells = legacyPlaceableCells(rows);
  const sourceFingerprint = legacyPlaceableSlotsFingerprint(rows);
  const resultFingerprint = placeableContainerCellsFingerprint(cells);
  if (sourceFingerprint !== resultFingerprint) fail('container_migration_parity_failed');
  return Object.freeze({
    cells: Object.freeze(cells),
    counts: Object.freeze({ ...counts(rows.length, cells), placeables: new Set(rows.map(row => row.placeableId)).size }),
    sourceFingerprint,
    resultFingerprint,
  });
}
