import {
  CURRENT_CONTAINER_LAYOUT_VERSION,
  CURRENT_EQUIPMENT_LAYOUT_VERSION,
  HOTBAR_SLOT_COUNT,
  LEGACY_CONTAINER_LAYOUT_VERSION,
  containerCellStack,
  isPlayerContainerId,
  isVacantCellStack,
  legacyPlaceableSlotsFingerprint,
  legacyPlayerCustodyEntries,
  placeableContainerCellKey,
  placeableContainerCellsFingerprint,
  planPlaceableContainerMigration,
  planPlayerContainerMigration,
  playerCellCustodyEntries,
  playerContainerCellKey,
  playerContainerCellsFingerprint,
  playerCustodyFingerprint,
  worldPlayerCustodyFingerprint,
  type ContainerCellStack,
  type ContainerMigrationCounts,
  type PlaceableContainerMigrationPlan,
  type PlayerContainerCell,
  type PlayerContainerId,
  type PlayerContainerMigrationInput,
  type PlayerContainerMigrationPlan,
  type PlayerCustodyEntry,
  type SparseContainerBuild,
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

export interface PlayerCellSpill {
  /** Cells whose stacks moved to `inventory_overflow` (and were deleted). */
  readonly spilled: number;
  /** Cells kept where they are because the overflow drain could never place them (a retired item kind). */
  readonly kept: readonly PlayerCellRow[];
}

/**
 * A shrunk player container's custody move (the build's spill), with the checks `stashOverflow` applies, so the
 * overflow drain can always place what lands in `inventory_overflow`:
 * - an item kind the active content no longer defines (`maxStack` null, a retired item) stays in its cell, stored
 *   past the capacity exactly as before and reported in `kept`; it is never deleted, and moving it to overflow would
 *   only strand it where the drain cannot place it;
 * - a stack above its kind's current maximum is split into maximum-sized overflow rows (as `stashOverflow` does), with
 *   its exact durability and lit, so no quantity is lost;
 * - vacant rows past the capacity are deleted.
 * Every spilled cell is deleted only after its overflow rows are written, in the caller's transaction.
 */
export function spillPlayerCells(
  db: Pick<Db, 'player_container_cell' | 'inventory_overflow' | 'inventory_overflow_retry'>, identity: Identity,
  build: SparseContainerBuild<PlayerCellRow>, maxStack: (itemKind: string) => number | null,
): PlayerCellSpill {
  const kept: PlayerCellRow[] = [];
  let spilled = 0;
  for (const row of build.spill) {
    const maximum = maxStack(row.itemKind);
    if (maximum === null || !Number.isSafeInteger(maximum) || maximum < 1) { kept.push(row); continue; }
    for (let remaining = row.quantity; remaining > 0; remaining -= maximum) {
      db.inventory_overflow.insert({
        id: 0n, identity, itemKind: row.itemKind, quantity: Math.min(remaining, maximum), durability: row.durability, lit: row.lit,
      });
    }
    db.player_container_cell.id.delete(row.id);
    spilled += 1;
  }
  for (const row of build.staleVacant) db.player_container_cell.id.delete(row.id);
  if (spilled > 0 && db.inventory_overflow_retry.identity.find(identity) !== null) {
    db.inventory_overflow_retry.identity.delete(identity);
  }
  return Object.freeze({ spilled, kept: Object.freeze(kept) });
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

/** Persistent hotbar layout history. Add the outgoing shared count before changing HOTBAR_SLOT_COUNT again so existing
 * global inventory slots shift atomically. Version 0 is the nine-slot hotbar. */
export const HOTBAR_LAYOUT_SLOT_COUNTS = [9, HOTBAR_SLOT_COUNT] as const;
export const CURRENT_HOTBAR_LAYOUT_VERSION = HOTBAR_LAYOUT_SLOT_COUNTS.length - 1;

export function hotbarSlotCountForLayoutVersion(version: number): number {
  const bounded = Math.max(0, Math.min(CURRENT_HOTBAR_LAYOUT_VERSION, Math.floor(version)));
  return HOTBAR_LAYOUT_SLOT_COUNTS[bounded] ?? HOTBAR_SLOT_COUNT;
}

/** A player's stored legacy layout versions. A character with no `inventory_migration` row predates the table and is
 * on the oldest layouts, as the connect path treats it. */
export interface LegacyPlayerLayout {
  readonly hotbarLayoutVersion: number;
  readonly equipmentLayoutVersion: number;
}
export const UNVERSIONED_PLAYER_LAYOUT: LegacyPlayerLayout = Object.freeze({ hotbarLayoutVersion: 0, equipmentLayoutVersion: 0 });

type LegacyRow = { readonly slot: number; readonly itemKind: string; readonly quantity: number; readonly durability: number; readonly lit: boolean };

/**
 * One player's legacy rows as the sim's migration input, on the current hotbar layout: rows stored under an older,
 * shorter hotbar are placed where the connect-time hotbar step puts them (every row past the old hotbar shifts up by
 * the slots added). An older equipment layout is left to the sim, which relocates it exactly as the connect-time
 * equipment step does. Once those steps have run (the move), the stored versions are current and nothing shifts.
 */
function legacyPlayerMigrationInput(
  inventoryRows: readonly LegacyRow[], stashRows: readonly LegacyRow[], layout: LegacyPlayerLayout,
): Omit<PlayerContainerMigrationInput, 'selectedSlot'> {
  const previousHotbarSlotCount = hotbarSlotCountForLayoutVersion(layout.hotbarLayoutVersion);
  if (previousHotbarSlotCount > HOTBAR_SLOT_COUNT) fail('hotbar_layout_shrink_unsupported');
  const addedHotbarSlots = layout.hotbarLayoutVersion < CURRENT_HOTBAR_LAYOUT_VERSION ? HOTBAR_SLOT_COUNT - previousHotbarSlotCount : 0;
  return {
    inventoryRows: inventoryRows.map(row => ({
      slot: row.slot >= previousHotbarSlotCount ? row.slot + addedHotbarSlots : row.slot, ...legacyStack(row),
    })),
    equipmentLayoutVersion: layout.equipmentLayoutVersion,
    stashRows: stashRows.map(row => ({ slot: row.slot, ...legacyStack(row) })),
  };
}

/**
 * The pure move plan for one player's legacy rows. It reads only: the release status and the release-lane batch use it
 * as a dry run. The input is on the current hotbar layout (`legacyPlayerMigrationInput`) and an older equipment layout
 * is relocated inside the sim plan, so the plan equals the one the move makes after the connect-time steps have run.
 */
export function planLegacyPlayerContainerMove(
  db: Omit<PlayerMoveDb, 'player_container_cell'>, identity: Identity, layout: LegacyPlayerLayout,
): PlayerContainerMigrationPlan {
  return planPlayerContainerMigration({
    ...legacyPlayerMigrationInput(
      [...db.inventory_slot.by_identity.filter(identity)], [...db.hearth_stash_slot.by_identity.filter(identity)], layout,
    ),
    selectedSlot: db.player_survival.identity.find(identity)?.selectedSlot ?? 0,
  });
}

/** A player's stored legacy layout versions: its `inventory_migration` row, or the oldest layouts without one. */
function storedLegacyLayout(db: Pick<Db, 'inventory_migration'>, identity: Identity): LegacyPlayerLayout {
  return db.inventory_migration.identity.find(identity) ?? UNVERSIONED_PLAYER_LAYOUT;
}

/** One player whose storage is still on the legacy layout: a version-0 `inventory_migration` row, or a character with
 * no row at all. `character` is false for a migration row with no `player_survival` row; connecting creates that
 * character, so nothing but the connect path may touch it. */
export interface LegacyPlayerStorage extends LegacyPlayerLayout {
  readonly identity: Identity;
  readonly character: boolean;
}

export function legacyPlayerStorage(db: Pick<Db, 'inventory_migration' | 'player_survival'>): LegacyPlayerStorage[] {
  const players: LegacyPlayerStorage[] = [];
  for (const migration of db.inventory_migration.iter()) {
    if (migration.containerLayoutVersion >= CURRENT_CONTAINER_LAYOUT_VERSION) continue;
    players.push({
      identity: migration.identity, hotbarLayoutVersion: migration.hotbarLayoutVersion,
      equipmentLayoutVersion: migration.equipmentLayoutVersion,
      character: db.player_survival.identity.find(migration.identity) !== null,
    });
  }
  for (const survival of db.player_survival.iter()) {
    if (db.inventory_migration.identity.find(survival.identity) !== null) continue;
    players.push({ identity: survival.identity, ...UNVERSIONED_PLAYER_LAYOUT, character: true });
  }
  return players;
}

function storedCell(row: PlayerCellRow): PlayerContainerCell {
  if (!isPlayerContainerId(row.container)) fail('container_migration_parity_failed');
  return { container: row.container, index: row.index, ...containerCellStack(legacyStack(row)) };
}

function storedPlayerCells(db: PlayerCellDb, identity: Identity): PlayerContainerCell[] {
  return [...db.player_container_cell.by_identity.filter(identity)].map(storedCell);
}

/**
 * Moves one player's legacy `inventory_slot` and `hearth_stash_slot` rows into `player_container_cell`, once. Runs after
 * the connect-time hotbar and equipment layout steps (an older equipment layout is relocated inside the plan).
 *
 * - Gated on `inventory_migration.containerLayoutVersion`: a current player returns null and nothing is read or written.
 * - The whole plan is made before any write; an invalid, duplicate or out-of-layout legacy row refuses it.
 * - Refuses (`container_migration_conflict`) when the player already has cells, so nothing can be doubled.
 * - After writing, reads the player's rows back and checks them twice: their exact columns against the plan's cells
 *   (`cellsFingerprint`: every write landed as planned), and their custody (kind, quantity, cell and legacy slot, through
 *   the inverse mapping) against `legacyCustodyFingerprint`, which the sim computed from the legacy rows read here by a
 *   path that does not share the plan's cell construction. The connect-time layout steps have already run, so those
 *   rows are on the current layouts and are exactly what the legacy tables now hold.
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
  const plan = planLegacyPlayerContainerMove(db, identity, migration);
  if (firstOf(db.player_container_cell.by_identity.filter(identity)) !== undefined) fail('container_migration_conflict');
  for (const cell of plan.cells) {
    db.player_container_cell.insert(playerCellValues(identity, cell.container, cell.index, cell));
  }
  const written = storedPlayerCells(db, identity);
  if (playerContainerCellsFingerprint(written) !== plan.cellsFingerprint
    || playerCustodyFingerprint(playerCellCustodyEntries(written)) !== plan.legacyCustodyFingerprint) {
    fail('container_migration_parity_failed');
  }
  db.inventory_migration.identity.update({
    ...migration,
    equipmentLayoutVersion: CURRENT_EQUIPMENT_LAYOUT_VERSION,
    containerLayoutVersion: CURRENT_CONTAINER_LAYOUT_VERSION,
  });
  return plan;
}

/** Whether an identity not yet on the container layout holds any legacy `inventory_slot` or `hearth_stash_slot` row.
 * Connect moves such rows even for an identity with no character (orphan rows), so a new character keeps them. */
export function hasUnmovedLegacyStorage(
  db: Pick<Db, 'inventory_migration' | 'inventory_slot' | 'hearth_stash_slot'>, identity: Identity,
): boolean {
  return !playerContainerCellsCurrent(db, identity)
    && (firstOf(db.inventory_slot.by_identity.filter(identity)) !== undefined
      || firstOf(db.hearth_stash_slot.by_identity.filter(identity)) !== undefined);
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
  readonly kind: 'player_plan_refused' | 'player_custody_invalid' | 'placeable_receipt_mismatch' | 'placeable_receipt_orphan';
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
    /** `worldPlayerCustodyFingerprint` of every identity's legacy rows (see `playerCustody`). The legacy tables are
     * never written after the publish except by the connect-time layout steps, which this value does not see, so it
     * equals the value the rehearsal computes from the same backup. Empty when a legacy row is invalid (an issue). */
    readonly legacyFingerprint: string;
    /** The same custody read where each player's storage lives now: cells once moved, legacy rows until then. Equal to
     * `legacyFingerprint` before traffic returns exactly when every move kept every item's kind, quantity and place. */
    readonly cellFingerprint: string;
    /** Item-holding legacy rows of identities with no character that are not yet moved: neither the batch nor the
     * dry run can move them; the identity's first connect does, before any loadout is written. Reported, not refused. */
    readonly orphans: {
      readonly owners: number;
      readonly inventoryOwners: number;
      readonly stashOwners: number;
      /** Of `owners`, those with no `inventory_migration` row either, which `legacy` does not count. */
      readonly withoutMigrationRow: number;
      readonly quantity: number;
      /** At most 50 identities, sorted. */
      readonly ids: readonly string[];
    };
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

interface PlayerCustodyReport {
  readonly legacyFingerprint: string;
  readonly cellFingerprint: string;
  readonly orphans: ContainerCellMigrationStatus['players']['orphans'];
}

/**
 * Whole-world player custody for the release lane, from the tables alone (no plan). Legacy side: every identity's
 * `inventory_slot` and `hearth_stash_slot` rows, put on the current layouts with its stored layout versions (its
 * `inventory_migration` row, or the oldest layouts without one) exactly as the connect-time steps would, then mapped by
 * `legacyPlayerCustodyEntries`. The connect-time steps rewrite a player's legacy rows and versions together, and custody
 * leaves out the durability they may normalise, so the value is the same before and after a move. Cell side: a player
 * on the container layout contributes its `player_container_cell` rows (inverse mapping); any other player its legacy
 * rows plus any stray cells, so a stray cell shows as a difference.
 */
function playerCustody(
  db: Pick<Db, 'inventory_migration' | 'inventory_slot' | 'hearth_stash_slot' | 'player_survival' | 'player_container_cell'>,
  issue: (entry: ContainerCellMigrationIssue) => void,
  refusedPlans: ReadonlySet<string>,
): PlayerCustodyReport {
  interface Owner { identity: Identity; inventory: LegacyRow[]; stash: LegacyRow[]; cells: PlayerCellRow[] }
  const owners = new Map<string, Owner>();
  const owner = (identity: Identity) => {
    const key = identity.toHexString();
    let entry = owners.get(key);
    if (entry === undefined) owners.set(key, entry = { identity, inventory: [], stash: [], cells: [] });
    return entry;
  };
  for (const row of db.inventory_slot.iter()) owner(row.identity).inventory.push(row);
  for (const row of db.hearth_stash_slot.iter()) owner(row.identity).stash.push(row);
  for (const row of db.player_container_cell.iter()) owner(row.identity).cells.push(row);
  const legacy: { owner: string; entries: PlayerCustodyEntry[] }[] = [];
  const current: { owner: string; entries: PlayerCustodyEntry[] }[] = [];
  let valid = true;
  const orphanIds: string[] = [];
  let orphanOwners = 0; let inventoryOwners = 0; let stashOwners = 0; let withoutMigrationRow = 0; let orphanQuantity = 0;
  for (const [key, entry] of [...owners].sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)) {
    let legacyEntries: PlayerCustodyEntry[] = [];
    try {
      if (entry.inventory.length > 0 || entry.stash.length > 0) {
        legacyEntries = legacyPlayerCustodyEntries(
          legacyPlayerMigrationInput(entry.inventory, entry.stash, storedLegacyLayout(db, entry.identity)));
      }
      const cellEntries = playerCellCustodyEntries(entry.cells.map(storedCell));
      const moved = playerContainerCellsCurrent(db, entry.identity);
      legacy.push({ owner: key, entries: legacyEntries });
      current.push({ owner: key, entries: moved ? cellEntries : [...legacyEntries, ...cellEntries] });
      if (!moved && legacyEntries.length > 0 && db.player_survival.identity.find(entry.identity) === null) {
        orphanOwners += 1;
        if (orphanIds.length < 50) orphanIds.push(key);
        if (legacyEntries.some(item => item.container !== 'stash')) inventoryOwners += 1;
        if (legacyEntries.some(item => item.container === 'stash')) stashOwners += 1;
        if (db.inventory_migration.identity.find(entry.identity) === null) withoutMigrationRow += 1;
        orphanQuantity += legacyEntries.reduce((sum, item) => sum + item.quantity, 0);
      }
    } catch (error) {
      valid = false;
      // A refused dry run already names this player; only a player the dry run did not cover is a new issue.
      if (!refusedPlans.has(key)) {
        issue({ kind: 'player_custody_invalid', id: key, code: error instanceof Error ? error.message : 'unknown' });
      }
    }
  }
  return {
    legacyFingerprint: valid ? worldPlayerCustodyFingerprint(legacy) : '',
    cellFingerprint: valid ? worldPlayerCustodyFingerprint(current) : '',
    orphans: Object.freeze({
      owners: orphanOwners, inventoryOwners, stashOwners, withoutMigrationRow, quantity: orphanQuantity, ids: Object.freeze(orphanIds),
    }),
  };
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
  const refusedPlans = new Set<string>();
  for (const migration of db.inventory_migration.iter()) {
    if (migration.containerLayoutVersion >= CURRENT_CONTAINER_LAYOUT_VERSION) current += 1;
  }
  for (const player of legacyPlayerStorage(db)) {
    legacy += 1;
    if (planned >= maximumPlayerPlans) { planTruncated = true; continue; }
    planned += 1;
    try {
      addCounts(playerTotals, planLegacyPlayerContainerMove(db, player.identity, player).counts);
    } catch (error) {
      refusedPlans.add(player.identity.toHexString());
      issue({ kind: 'player_plan_refused', id: player.identity.toHexString(), code: error instanceof Error ? error.message : 'unknown' });
    }
  }
  const custody = playerCustody(db, issue, refusedPlans);
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
      legacyFingerprint: custody.legacyFingerprint,
      cellFingerprint: custody.cellFingerprint,
      orphans: custody.orphans,
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
    placeableCopyComplete: uncopied === 0 && issues.every(entry => entry.kind.startsWith('player_')),
  });
}
