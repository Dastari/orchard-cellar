import {
  CURRENT_CONTAINER_LAYOUT_VERSION,
  CURRENT_EQUIPMENT_LAYOUT_VERSION,
  LEGACY_CONTAINER_LAYOUT_VERSION,
  cellToLegacyGlobalSlot,
  containerCellStack,
  isPlayerContainerId,
  isVacantCellStack,
  legacyPlaceableSlotsFingerprint,
  placeableContainerCellKey,
  placeableContainerCellsFingerprint,
  planPlaceableContainerMigration,
  planPlayerContainerMigration,
  playerContainerCellKey,
  playerContainerCellsFingerprint,
  type ContainerCellStack,
  type ContainerMigrationCounts,
  type PlaceableContainerMigrationPlan,
  type PlayerContainerCell,
  type PlayerContainerId,
  type PlayerContainerMigrationPlan,
  type SparseContainerWrites,
} from '@orchard/sim';
import type { WorldReducerContext } from './index.js';

/**
 * Sparse container cells in the world (Uncapped Storage step 4b, wiki Roadmap/Uncapped Storage). The pure layout,
 * planning and fingerprints live in `@orchard/sim` (step 4a); this module owns the table reads and writes: one row per
 * occupied cell, insert or update when a cell fills, delete when it empties, and the two one-time copies from the
 * legacy dense tables. Errors are plain `Error(code)`; the world rethrows them as `SenderError` where a caller sees them.
 */

type Db = WorldReducerContext['db'];
type Identity = WorldReducerContext['sender'];
type Timestamp = WorldReducerContext['timestamp'];

export type PlayerCellRow = NonNullable<ReturnType<Db['player_container_cell']['id']['find']>>;
export type PlaceableCellRow = NonNullable<ReturnType<Db['placeable_container_cell']['id']['find']>>;

/** The player containers the legacy `inventory_slot` table held; the stash had its own table and is never carried. */
export const CARRIED_CONTAINERS = Object.freeze(['hotbar', 'backpack', 'equipment', 'crafting'] as const);
export type CarriedContainerId = (typeof CARRIED_CONTAINERS)[number];

export function isCarriedContainer(container: string): container is CarriedContainerId {
  return (CARRIED_CONTAINERS as readonly string[]).includes(container);
}

function fail(code: string): never { throw new Error(code); }

function firstOf<T>(rows: Iterable<T>): T | undefined {
  for (const row of rows) return row;
  return undefined;
}

// --- player cells ---

type PlayerCellDb = Pick<Db, 'player_container_cell'>;

export function playerCellId(identity: Identity, container: PlayerContainerId, index: number): string {
  return playerContainerCellKey(identity.toHexString(), { container, index });
}

/** A vacant cell as a row value. It is never stored: a missing row is an empty cell. */
export function vacantPlayerCell(identity: Identity, container: PlayerContainerId, index: number): PlayerCellRow {
  return {
    id: playerCellId(identity, container, index), identity, container, index,
    itemKind: 'empty', quantity: 0, durability: 0, lit: true,
  };
}

/** The stored row of one cell, or its vacant value. Callers that used to find a dense legacy row read this instead. */
export function playerCellOrVacant(
  db: PlayerCellDb, identity: Identity, container: PlayerContainerId, index: number,
): PlayerCellRow {
  return db.player_container_cell.id.find(playerCellId(identity, container, index))
    ?? vacantPlayerCell(identity, container, index);
}

export function playerContainerRows(db: PlayerCellDb, identity: Identity, container: PlayerContainerId): PlayerCellRow[] {
  return [...db.player_container_cell.by_identity_container.filter([identity, container])];
}

/** Every carried cell (hotbar, backpack, equipment, crafting): what `inventory_slot.by_identity` used to return,
 * minus its vacant rows. The stash is never part of it. */
export function carriedPlayerCellRows(db: PlayerCellDb, identity: Identity): PlayerCellRow[] {
  return [...db.player_container_cell.by_identity.filter(identity)].filter(row => isCarriedContainer(row.container));
}

function playerCellValues(identity: Identity, container: PlayerContainerId, index: number, stack: ContainerCellStack) {
  return {
    id: playerCellId(identity, container, index), identity, container, index,
    itemKind: stack.itemKind, quantity: stack.quantity, durability: stack.durability, lit: stack.lit,
  };
}

/** Writes one cell's stored columns: insert or update when occupied, delete when vacant. Returns the stored row. */
export function putPlayerCell(
  db: PlayerCellDb, identity: Identity, container: PlayerContainerId, index: number,
  stack: ContainerCellStack | null,
): PlayerCellRow | null {
  const id = playerCellId(identity, container, index);
  const existing = db.player_container_cell.id.find(id);
  if (stack === null || isVacantCellStack(stack)) {
    if (existing !== null) db.player_container_cell.id.delete(id);
    return null;
  }
  const next = playerCellValues(identity, container, index, stack);
  return existing === null ? db.player_container_cell.insert(next) : db.player_container_cell.id.update(next);
}

/** Applies one container's sparse diff (deletes, then inserts and updates). Returns whether anything was written. */
export function applyPlayerContainerWrites(
  db: PlayerCellDb, identity: Identity, container: PlayerContainerId, writes: SparseContainerWrites<PlayerCellRow>,
): boolean {
  for (const row of writes.deletes) db.player_container_cell.id.delete(row.id);
  for (const upsert of writes.upserts) {
    const next = playerCellValues(identity, container, upsert.index, upsert.stack);
    if (upsert.existing === null) db.player_container_cell.insert(next);
    else db.player_container_cell.id.update(next);
  }
  return writes.deletes.length > 0 || writes.upserts.length > 0;
}

/** A carried cell with its frozen legacy global slot. */
export type CarriedSlotRow = PlayerCellRow & { readonly slot: number };

/**
 * Transitional: carried cells numbered by the frozen legacy global layout, for the sim helpers that still take global
 * slots (loadouts, expedition readiness, carried-slot rules). Every carried cell a current capacity allows has a legacy
 * slot (the backpack is at most 20 until step 5 lifts the ceiling); a cell without one is left out, as the legacy
 * table could not have held it.
 */
export function legacySlotRows(cells: readonly PlayerCellRow[]): CarriedSlotRow[] {
  const rows: CarriedSlotRow[] = [];
  for (const cell of cells) {
    if (!isPlayerContainerId(cell.container)) continue;
    const slot = cellToLegacyGlobalSlot({ container: cell.container, index: cell.index });
    if (slot !== null) rows.push({ ...cell, slot });
  }
  return rows.sort((left, right) => left.slot - right.slot);
}

/** Moves stacks into the owner's `inventory_overflow` custody with their exact stored columns; the overflow drain
 * returns them as capacity opens. */
export function spillToOverflow(
  db: Pick<Db, 'inventory_overflow' | 'inventory_overflow_retry'>, identity: Identity,
  stacks: readonly ContainerCellStack[],
): void {
  if (stacks.length === 0) return;
  for (const stack of stacks) {
    db.inventory_overflow.insert({
      id: 0n, identity, itemKind: stack.itemKind, quantity: stack.quantity, durability: stack.durability, lit: stack.lit,
    });
  }
  if (db.inventory_overflow_retry.identity.find(identity) !== null) db.inventory_overflow_retry.identity.delete(identity);
}

// --- placeable cells ---

type PlaceableCellDb = Pick<Db, 'placeable_container_cell'>;

export function placeableCellId(placeableId: bigint, index: number): string {
  return placeableContainerCellKey({ placeableId, index });
}

export function placeableCellRows(db: PlaceableCellDb, placeableId: bigint): PlaceableCellRow[] {
  return [...db.placeable_container_cell.by_placeable.filter(placeableId)].sort((left, right) => left.index - right.index);
}

function placeableCellValues(placeableId: bigint, index: number, stack: ContainerCellStack) {
  return {
    id: placeableCellId(placeableId, index), placeableId, index,
    itemKind: stack.itemKind, quantity: stack.quantity, durability: stack.durability, lit: stack.lit,
  };
}

export function putPlaceableCell(
  db: PlaceableCellDb, placeableId: bigint, index: number, stack: ContainerCellStack | null,
): PlaceableCellRow | null {
  const id = placeableCellId(placeableId, index);
  const existing = db.placeable_container_cell.id.find(id);
  if (stack === null || isVacantCellStack(stack)) {
    if (existing !== null) db.placeable_container_cell.id.delete(id);
    return null;
  }
  const next = placeableCellValues(placeableId, index, stack);
  return existing === null ? db.placeable_container_cell.insert(next) : db.placeable_container_cell.id.update(next);
}

export function applyPlaceableContainerWrites(
  db: PlaceableCellDb, placeableId: bigint, writes: SparseContainerWrites<PlaceableCellRow>,
): boolean {
  for (const row of writes.deletes) db.placeable_container_cell.id.delete(row.id);
  for (const upsert of writes.upserts) {
    const next = placeableCellValues(placeableId, upsert.index, upsert.stack);
    if (upsert.existing === null) db.placeable_container_cell.insert(next);
    else db.placeable_container_cell.id.update(next);
  }
  return writes.deletes.length > 0 || writes.upserts.length > 0;
}

export function deletePlaceableCells(db: PlaceableCellDb, placeableId: bigint): void {
  for (const row of [...db.placeable_container_cell.by_placeable.filter(placeableId)]) {
    db.placeable_container_cell.id.delete(row.id);
  }
}

// --- the one-time player move ---

type PlayerMoveDb = Pick<Db, 'inventory_migration' | 'inventory_slot' | 'hearth_stash_slot' | 'player_container_cell'
  | 'player_survival'>;

function legacyStack(row: { readonly itemKind: string; readonly quantity: number; readonly durability: number; readonly lit: boolean }) {
  return { itemKind: row.itemKind, quantity: row.quantity, durability: row.durability, lit: row.lit };
}

/** The pure move plan for one player's legacy rows. It reads only: the release status uses it as a dry run. */
export function planLegacyPlayerContainerMove(
  db: Omit<PlayerMoveDb, 'player_container_cell'>, identity: Identity, equipmentLayoutVersion: number,
): PlayerContainerMigrationPlan {
  return planPlayerContainerMigration({
    inventoryRows: [...db.inventory_slot.by_identity.filter(identity)].map(row => ({ slot: row.slot, ...legacyStack(row) })),
    equipmentLayoutVersion,
    stashRows: [...db.hearth_stash_slot.by_identity.filter(identity)].map(row => ({ slot: row.slot, ...legacyStack(row) })),
    selectedSlot: db.player_survival.identity.find(identity)?.selectedSlot ?? 0,
  });
}

function storedPlayerCells(db: PlayerCellDb, identity: Identity): PlayerContainerCell[] {
  return [...db.player_container_cell.by_identity.filter(identity)].map((row) => {
    if (!isPlayerContainerId(row.container)) fail('container_migration_parity_failed');
    return { container: row.container, index: row.index, ...containerCellStack(legacyStack(row)) };
  });
}

/**
 * Moves one player's legacy `inventory_slot` and `hearth_stash_slot` rows into `player_container_cell`, once. Runs after
 * the connect-time hotbar and equipment layout steps (an older equipment layout is relocated inside the plan).
 *
 * - Gated on `inventory_migration.containerLayoutVersion`: a current player returns null and nothing is read or written.
 * - The whole plan is made before any write; an invalid, duplicate or out-of-layout legacy row refuses it.
 * - Refuses (`container_migration_conflict`) when the player already has cells, so nothing can be doubled.
 * - After writing, reads the player's rows back and compares their fingerprint with the plan's source fingerprint.
 * - The version is set in the same transaction, so a refusal anywhere rolls every write back: nothing is lost or
 *   duplicated, the player stays on version 0, and the next attempt starts over. Legacy rows are never modified.
 */
export function movePlayerToContainerCells(
  db: PlayerMoveDb, identity: Identity, currentHotbarLayoutVersion: number,
): PlayerContainerMigrationPlan | null {
  const migration = db.inventory_migration.identity.find(identity);
  if (migration === null || migration.hotbarLayoutVersion < currentHotbarLayoutVersion) {
    fail('container_migration_prerequisite_missing');
  }
  if (migration.containerLayoutVersion >= CURRENT_CONTAINER_LAYOUT_VERSION) return null;
  if (migration.containerLayoutVersion !== LEGACY_CONTAINER_LAYOUT_VERSION) fail('container_layout_version_unsupported');
  const plan = planLegacyPlayerContainerMove(db, identity, migration.equipmentLayoutVersion);
  if (firstOf(db.player_container_cell.by_identity.filter(identity)) !== undefined) fail('container_migration_conflict');
  for (const cell of plan.cells) {
    db.player_container_cell.insert(playerCellValues(identity, cell.container, cell.index, cell));
  }
  if (playerContainerCellsFingerprint(storedPlayerCells(db, identity)) !== plan.sourceFingerprint) {
    fail('container_migration_parity_failed');
  }
  db.inventory_migration.identity.update({
    ...migration,
    equipmentLayoutVersion: CURRENT_EQUIPMENT_LAYOUT_VERSION,
    containerLayoutVersion: CURRENT_CONTAINER_LAYOUT_VERSION,
  });
  return plan;
}

/** Whether a player's storage lives in `player_container_cell`. Writes for anyone else are refused. */
export function playerContainerCellsCurrent(db: Pick<Db, 'inventory_migration'>, identity: Identity): boolean {
  return (db.inventory_migration.identity.find(identity)?.containerLayoutVersion ?? 0) >= CURRENT_CONTAINER_LAYOUT_VERSION;
}

// --- the one-time placeable copy ---

type PlaceableCopyDb = Pick<Db, 'world_placeable_slot' | 'placeable_container_cell' | 'placeable_container_copy'>;

function legacyPlaceableRows(db: Pick<Db, 'world_placeable_slot'>, placeableId: bigint) {
  return [...db.world_placeable_slot.by_placeable.filter(placeableId)]
    .map(row => ({ placeableId: row.placeableId, slot: row.slot, ...legacyStack(row) }));
}

/**
 * Copies one placeable's legacy `world_placeable_slot` rows into `placeable_container_cell`, once, with the same
 * guarantees as the player move: plan first, refuse over existing cells, read back and compare fingerprints, and record
 * a `placeable_container_copy` receipt in the same transaction. Returns null when there is nothing to copy (already
 * copied, or no legacy rows; the legacy table is never written again, so an empty placeable stays empty). Cells keep
 * their exact index, including any past the placeable's current capacity: they stay stored, as the legacy rows did.
 */
export function copyPlaceableToContainerCells(
  db: PlaceableCopyDb, placeableId: bigint, copiedAt: Timestamp,
): PlaceableContainerMigrationPlan | null {
  if (db.placeable_container_copy.placeableId.find(placeableId) !== null) return null;
  const legacy = legacyPlaceableRows(db, placeableId);
  if (legacy.length === 0) return null;
  const plan = planPlaceableContainerMigration(legacy);
  if (firstOf(db.placeable_container_cell.by_placeable.filter(placeableId)) !== undefined) {
    fail('container_migration_conflict');
  }
  for (const cell of plan.cells) db.placeable_container_cell.insert(placeableCellValues(placeableId, cell.index, cell));
  const written = [...db.placeable_container_cell.by_placeable.filter(placeableId)]
    .map(row => ({ placeableId: row.placeableId, index: row.index, ...containerCellStack(legacyStack(row)) }));
  if (placeableContainerCellsFingerprint(written) !== plan.sourceFingerprint) fail('container_migration_parity_failed');
  db.placeable_container_copy.insert({
    placeableId,
    sourceRows: plan.counts.sourceRows,
    cells: plan.counts.cells,
    totalQuantity: BigInt(plan.counts.totalQuantity),
    sourceFingerprint: plan.sourceFingerprint,
    copiedAt,
  });
  return plan;
}

// --- release status ---

export interface ContainerCellMigrationIssue {
  readonly kind: 'player_plan_refused' | 'placeable_receipt_mismatch' | 'placeable_receipt_orphan';
  readonly id: string;
  readonly code: string;
}

export interface ContainerCellMigrationStatus {
  readonly schemaVersion: 1;
  readonly layoutVersion: typeof CURRENT_CONTAINER_LAYOUT_VERSION;
  readonly players: {
    /** `inventory_migration` rows by container layout version. */
    readonly current: number;
    readonly legacy: number;
    /** Legacy players whose move was planned (dry run) in this report, and the refused ones among them. */
    readonly planned: number;
    readonly planTruncated: boolean;
    readonly legacyRows: number;
    readonly legacyCells: number;
    readonly legacyQuantity: number;
    readonly cells: number;
  };
  readonly placeables: {
    /** Placeables with legacy rows; `copied` of them have a matching receipt. */
    readonly legacy: number;
    readonly copied: number;
    readonly uncopied: number;
    readonly legacyRows: number;
    readonly legacyCells: number;
    readonly legacyQuantity: number;
    /** `legacyPlaceableSlotsFingerprint` of every legacy row: equal to the value computed from the pre-publish backup,
     * because the legacy table is never written after the publish. */
    readonly legacyFingerprint: string;
    /** FNV-1a over the sorted receipts' (placeableId, source fingerprint): changes only when a receipt does. */
    readonly receiptFingerprint: string;
    readonly receipts: number;
    readonly cells: number;
    readonly backfillComplete: boolean;
  };
  readonly issues: readonly ContainerCellMigrationIssue[];
  /** True when every placeable with legacy rows has a matching receipt and no receipt or player plan is refused. */
  readonly placeableCopyComplete: boolean;
}

function fnv(text: string): string {
  let hash = 0x811c9dc5;
  for (const character of text) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function addCounts(total: { rows: number; cells: number; quantity: number }, counts: ContainerMigrationCounts): void {
  total.rows += counts.sourceRows;
  total.cells += counts.cells;
  total.quantity += counts.totalQuantity;
}

/**
 * The lane's report: player layout versions with a bounded dry run of every legacy player's move, and the placeable
 * copy's counts and fingerprints. Reads only. A refused plan or receipt is listed (at most 50) rather than thrown.
 */
export function containerCellMigrationStatus(
  db: Pick<Db, 'inventory_migration' | 'inventory_slot' | 'hearth_stash_slot' | 'player_survival' | 'player_container_cell'
    | 'world_placeable_slot' | 'placeable_container_cell' | 'placeable_container_copy' | 'container_cell_migration'>,
  maximumPlayerPlans: number,
): ContainerCellMigrationStatus {
  const issues: ContainerCellMigrationIssue[] = [];
  const issue = (entry: ContainerCellMigrationIssue) => { if (issues.length < 50) issues.push(entry); };
  let current = 0; let legacy = 0; let planned = 0; let planTruncated = false;
  const playerTotals = { rows: 0, cells: 0, quantity: 0 };
  for (const migration of db.inventory_migration.iter()) {
    if (migration.containerLayoutVersion >= CURRENT_CONTAINER_LAYOUT_VERSION) { current += 1; continue; }
    legacy += 1;
    if (planned >= maximumPlayerPlans) { planTruncated = true; continue; }
    planned += 1;
    try {
      addCounts(playerTotals, planLegacyPlayerContainerMove(db, migration.identity, migration.equipmentLayoutVersion).counts);
    } catch (error) {
      issue({ kind: 'player_plan_refused', id: migration.identity.toHexString(), code: error instanceof Error ? error.message : 'unknown' });
    }
  }
  const legacyByPlaceable = new Map<bigint, ReturnType<typeof legacyPlaceableRows>>();
  const allLegacy: ReturnType<typeof legacyPlaceableRows> = [];
  for (const row of db.world_placeable_slot.iter()) {
    const entry = { placeableId: row.placeableId, slot: row.slot, ...legacyStack(row) };
    allLegacy.push(entry);
    const rows = legacyByPlaceable.get(row.placeableId) ?? [];
    rows.push(entry);
    legacyByPlaceable.set(row.placeableId, rows);
  }
  let copied = 0;
  const placeableTotals = { rows: 0, cells: 0, quantity: 0 };
  for (const [placeableId, rows] of legacyByPlaceable) {
    const receipt = db.placeable_container_copy.placeableId.find(placeableId);
    try {
      const plan = planPlaceableContainerMigration(rows);
      addCounts(placeableTotals, plan.counts);
      if (receipt === null) continue;
      if (receipt.sourceFingerprint === plan.sourceFingerprint) copied += 1;
      else issue({ kind: 'placeable_receipt_mismatch', id: placeableId.toString(), code: 'container_migration_parity_failed' });
    } catch (error) {
      issue({ kind: 'placeable_receipt_mismatch', id: placeableId.toString(), code: error instanceof Error ? error.message : 'unknown' });
    }
  }
  const receipts = [...db.placeable_container_copy.iter()]
    .sort((left, right) => left.placeableId < right.placeableId ? -1 : left.placeableId > right.placeableId ? 1 : 0);
  for (const receipt of receipts) {
    if (!legacyByPlaceable.has(receipt.placeableId)) {
      issue({ kind: 'placeable_receipt_orphan', id: receipt.placeableId.toString(), code: 'container_migration_receipt_orphan' });
    }
  }
  let legacyFingerprint = '';
  try { legacyFingerprint = legacyPlaceableSlotsFingerprint(allLegacy); } catch (error) {
    issue({ kind: 'placeable_receipt_mismatch', id: '*', code: error instanceof Error ? error.message : 'unknown' });
  }
  const control = db.container_cell_migration.id.find(0);
  const uncopied = legacyByPlaceable.size - copied;
  return Object.freeze({
    schemaVersion: 1,
    layoutVersion: CURRENT_CONTAINER_LAYOUT_VERSION,
    players: Object.freeze({
      current, legacy, planned, planTruncated,
      legacyRows: playerTotals.rows, legacyCells: playerTotals.cells, legacyQuantity: playerTotals.quantity,
      cells: Number(db.player_container_cell.count()),
    }),
    placeables: Object.freeze({
      legacy: legacyByPlaceable.size, copied, uncopied,
      legacyRows: placeableTotals.rows, legacyCells: placeableTotals.cells, legacyQuantity: placeableTotals.quantity,
      legacyFingerprint,
      receiptFingerprint: fnv(JSON.stringify(receipts.map(receipt => [receipt.placeableId.toString(), receipt.sourceFingerprint]))),
      receipts: receipts.length,
      cells: Number(db.placeable_container_cell.count()),
      backfillComplete: control?.placeableBackfillComplete ?? false,
    }),
    issues: Object.freeze(issues),
    placeableCopyComplete: uncopied === 0 && issues.every(entry => entry.kind === 'player_plan_refused'),
  });
}
