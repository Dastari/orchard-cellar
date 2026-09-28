import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import * as sim from '@orchard/sim';
import { resolveStudioScopes } from '../../sim/src/studio-scopes.js';
import { requireOwnerOrAdminRead } from './admin/procedures.js';
import { OIDC_ISSUER, authenticationRejection, canAdministerWorld, membershipRejection } from './auth-policy.js';
import * as cells from './container-cells.js';

/**
 * Uncapped Storage step 4b: the one-time moves into `player_container_cell` and `placeable_container_cell`, run by the
 * production functions against in-memory tables, and one real reducer path (the open-menu move used by the inventory,
 * stash and chest windows) on the new tables compared with the sim's container move over the legacy dense layout.
 */

type Row = Record<string, unknown>;
interface Index { find(value: unknown): Row | null; update(row: Row): Row; delete(value: unknown): boolean }
interface FakeTable {
  rows: Map<string, Row>; writes: string[]; id: Index; identity: Index; placeableId: Index;
  insert(row: Row): Row; iter(): IterableIterator<Row>; count(): bigint;
}

/** A primary-keyed in-memory table with the named btree filters. */
function table<T extends Row>(primary: keyof T & string, indexes: Record<string, (row: T) => unknown> = {}, autoInc = false) {
  const rows = new Map<string, T>();
  let next = 1n;
  const key = (value: unknown) => typeof value === 'object' && value !== null && 'toHexString' in value
    ? (value as { toHexString(): string }).toHexString() : String(value);
  const writes: string[] = [];
  const index = {
    find: (value: unknown) => rows.get(key(value)) ?? null,
    update: (row: T) => {
      if (!rows.has(key(row[primary]))) throw new Error('fixture_row_missing');
      writes.push(`update:${key(row[primary])}`); rows.set(key(row[primary]), { ...row }); return row;
    },
    delete: (value: unknown) => { writes.push(`delete:${key(value)}`); return rows.delete(key(value)); },
  };
  const filters = Object.fromEntries(Object.entries(indexes).map(([name, pick]) => [name, {
    filter: (value: unknown) => [...rows.values()]
      .filter(row => Array.isArray(value)
        ? JSON.stringify((pick(row) as unknown[]).map(key)) === JSON.stringify(value.map(key))
        : key(pick(row)) === key(value))
      .sort((left, right) => {
        const a = pick(left), b = pick(right);
        return typeof a === 'bigint' && typeof b === 'bigint' ? (a < b ? -1 : a > b ? 1 : 0) : 0;
      }),
  }]));
  return {
    rows, writes, [primary]: index, id: index, ...filters,
    insert: (row: T) => {
      const stored = autoInc && row[primary] === 0n ? { ...row, [primary]: next++ } : row;
      if (rows.has(key(stored[primary]))) throw new Error('fixture_row_duplicate');
      writes.push(`insert:${key(stored[primary])}`); rows.set(key(stored[primary]), { ...stored }); return stored;
    },
    iter: () => [...rows.values()][Symbol.iterator](),
    count: () => BigInt(rows.size),
  } as unknown as FakeTable;
}

const identity = (hex: string) => ({ toHexString: () => hex, isEqual: (other: { toHexString(): string }) => other.toHexString() === hex });
const alice = identity('a1');
const bob = identity('b2');

function world() {
  return {
    inventory_migration: table<Row>('identity'),
    inventory_slot: table<Row>('id', { by_identity: row => row['identity'] }),
    hearth_stash_slot: table<Row>('id', { by_identity: row => row['identity'] }),
    player_survival: table<Row>('identity'),
    player_container_cell: table<Row>('id', {
      by_identity: row => row['identity'], by_identity_container: row => [row['identity'], row['container']],
    }),
    world_placeable_slot: table<Row>('id', { by_placeable: row => row['placeableId'] }),
    placeable_container_cell: table<Row>('id', { by_placeable: row => row['placeableId'] }),
    placeable_container_copy: table<Row>('placeableId'),
    container_cell_migration: table<Row>('id'),
    inventory_overflow: table<Row>('id', { by_identity: row => row['identity'] }, true),
    inventory_overflow_retry: table<Row>('identity'),
  };
}
type World = ReturnType<typeof world>;

const empty = { itemKind: 'empty', quantity: 0, durability: 0, lit: true };
/** A realistic dense legacy inventory: every one of the 49 slots has a row, most of them vacant. */
function seedPlayer(db: World, who: ReturnType<typeof identity>, options: { equipmentLayoutVersion?: number; selectedSlot?: number } = {}) {
  const equipmentLayoutVersion = options.equipmentLayoutVersion ?? 1;
  const count = equipmentLayoutVersion === 0 ? 48 : 49;
  const items: Record<number, Row> = equipmentLayoutVersion === 0
    ? { 0: { itemKind: 'axe', quantity: 1, durability: 61, lit: true }, 33: { itemKind: 'hearth_rare_bow', quantity: 1, durability: 88, lit: true },
      39: { itemKind: 'stone', quantity: 3, durability: 0, lit: true }, 47: { itemKind: 'wood', quantity: 2, durability: 0, lit: true } }
    : {
      0: { itemKind: 'axe', quantity: 1, durability: 61, lit: true },
      4: { itemKind: 'torch', quantity: 7, durability: 0, lit: false },
      12: { itemKind: 'wood', quantity: 40, durability: 0, lit: true },
      29: { itemKind: 'arrow', quantity: 18, durability: 0, lit: true },
      33: { itemKind: 'hearth_rare_bow', quantity: 1, durability: 88, lit: true },
      34: { itemKind: 'backpack', quantity: 1, durability: 0, lit: true },
      35: { itemKind: 'hearth_rare_shield', quantity: 1, durability: 0, lit: true },
      39: { itemKind: 'hearth_rare_body', quantity: 1, durability: 50, lit: true },
      40: { itemKind: 'stone', quantity: 3, durability: 0, lit: true },
      48: { itemKind: 'wood', quantity: 2, durability: 0, lit: true },
    };
  for (let slot = 0; slot < count; slot += 1) {
    db.inventory_slot.insert({ id: `${who.toHexString()}:${slot}`, identity: who, slot, ...(items[slot] ?? empty) });
  }
  const stash: Record<number, Row> = { 0: { itemKind: 'apple', quantity: 9, durability: 0, lit: true }, 17: { itemKind: 'sword', quantity: 1, durability: 12, lit: true } };
  for (let slot = 0; slot < 20; slot += 1) {
    db.hearth_stash_slot.insert({ id: `${who.toHexString()}:${slot}`, identity: who, slot, ...(stash[slot] ?? empty) });
  }
  db.player_survival.insert({ identity: who, selectedSlot: options.selectedSlot ?? 33, debugBackpackSlots: 0 });
  db.inventory_migration.insert({ identity: who, durabilityVersion: 1, hotbarLayoutVersion: 1, equipmentLayoutVersion, containerLayoutVersion: 0 });
}

const stackOf = (row: Row | null) => row === null ? null : ({ itemKind: row['itemKind'], quantity: row['quantity'], durability: row['durability'], lit: row['lit'] });
const snapshotOf = (tableRows: Map<string, Row>) => JSON.stringify([...tableRows.entries()], (_key, value) => (
  typeof value === 'bigint' ? `${value}n` : typeof value === 'object' && value !== null && 'toHexString' in value ? value.toHexString() : value));

describe('connect-time player move to container cells', () => {
  it('moves every legacy item to its container cell exactly once, with parity by read-back fingerprint', () => {
    const db = world(); seedPlayer(db, alice); seedPlayer(db, bob);
    const legacyBefore = snapshotOf(db.inventory_slot.rows) + snapshotOf(db.hearth_stash_slot.rows);
    const plan = cells.movePlayerToContainerCells(db as never, alice as never, 1)!;
    expect(plan).not.toBeNull();
    const stored = [...db.player_container_cell.rows.values()].filter(row => row['identity'] === alice);
    // Every occupied legacy row (10 carried + 2 stash) is one cell; no vacant rows are stored.
    expect(stored).toHaveLength(12);
    expect(plan.counts).toMatchObject({ sourceRows: 69, vacantRows: 57, cells: 12, totalQuantity: 1 + 7 + 40 + 18 + 1 + 1 + 1 + 1 + 3 + 2 + 9 + 1 });
    const cellAt = (container: string, index: number) => db.player_container_cell.id.find(`a1:${container}:${index}`);
    expect(stackOf(cellAt('hotbar', 0))).toEqual({ itemKind: 'axe', quantity: 1, durability: 61, lit: true });
    expect(stackOf(cellAt('hotbar', 4))).toEqual({ itemKind: 'torch', quantity: 7, durability: 0, lit: false });
    expect(cellAt('backpack', 2)?.['itemKind']).toBe('wood');
    expect(cellAt('backpack', 19)?.['itemKind']).toBe('arrow');
    // Equipment keeps its ten fixed indices: Main Hand 3, Bag 4, Off Hand 5, Body 9.
    expect(cellAt('equipment', sim.MAIN_HAND_EQUIPMENT_INDEX)?.['itemKind']).toBe('hearth_rare_bow');
    expect(cellAt('equipment', 4)?.['itemKind']).toBe('backpack');
    expect(cellAt('equipment', 5)?.['itemKind']).toBe('hearth_rare_shield');
    expect(stackOf(cellAt('equipment', 9))).toEqual({ itemKind: 'hearth_rare_body', quantity: 1, durability: 50, lit: true });
    expect(cellAt('crafting', 0)?.['itemKind']).toBe('stone');
    expect(cellAt('crafting', 8)?.['itemKind']).toBe('wood');
    expect(cellAt('stash', 17)?.['itemKind']).toBe('sword');
    // selectedSlot is untouched and still names the Main Hand.
    expect(db.player_survival.identity.find(alice)?.['selectedSlot']).toBe(sim.MAIN_HAND_SELECTED_SLOT);
    expect(plan.selectedCell).toEqual({ container: 'equipment', index: sim.MAIN_HAND_EQUIPMENT_INDEX });
    expect(plan.legacyCustodyFingerprint).toBe(sim.legacyPlayerCustodyFingerprint({
      inventoryRows: [...db.inventory_slot.rows.values()].filter(row => row['identity'] === alice).map(row => ({ slot: row['slot'] as number, ...stackOf(row) }) as never),
      equipmentLayoutVersion: 1,
      stashRows: [...db.hearth_stash_slot.rows.values()].filter(row => row['identity'] === alice).map(row => ({ slot: row['slot'] as number, ...stackOf(row) }) as never),
    }));
    expect(db.inventory_migration.identity.find(alice)).toMatchObject({ containerLayoutVersion: 1, equipmentLayoutVersion: 1 });
    // Legacy rows are never modified; the other player is untouched until their own connect.
    expect(snapshotOf(db.inventory_slot.rows) + snapshotOf(db.hearth_stash_slot.rows)).toBe(legacyBefore);
    expect(db.inventory_migration.identity.find(bob)?.['containerLayoutVersion']).toBe(0);
    expect(cells.playerContainerCellsCurrent(db as never, alice as never)).toBe(true);
    expect(cells.playerContainerCellsCurrent(db as never, bob as never)).toBe(false);
  });

  it('is idempotent: a second connect reads nothing and writes nothing', () => {
    const db = world(); seedPlayer(db, alice);
    cells.movePlayerToContainerCells(db as never, alice as never, 1);
    const before = snapshotOf(db.player_container_cell.rows);
    const writes = db.player_container_cell.writes.length;
    expect(cells.movePlayerToContainerCells(db as never, alice as never, 1)).toBeNull();
    expect(db.player_container_cell.writes).toHaveLength(writes);
    expect(snapshotOf(db.player_container_cell.rows)).toBe(before);
  });

  it('relocates a pre-Body equipment layout inside the plan without writing legacy rows', () => {
    const db = world(); seedPlayer(db, alice, { equipmentLayoutVersion: 0, selectedSlot: 2 });
    const legacyBefore = snapshotOf(db.inventory_slot.rows);
    cells.movePlayerToContainerCells(db as never, alice as never, 1);
    // Old global 39 and 47 were crafting 0 and 8; Body (equipment 9) did not exist.
    expect(db.player_container_cell.id.find('a1:crafting:0')?.['itemKind']).toBe('stone');
    expect(db.player_container_cell.id.find('a1:crafting:8')?.['itemKind']).toBe('wood');
    expect(db.player_container_cell.id.find('a1:equipment:9')).toBeNull();
    expect(db.player_container_cell.id.find('a1:equipment:3')?.['itemKind']).toBe('hearth_rare_bow');
    expect(db.inventory_migration.identity.find(alice)).toMatchObject({ equipmentLayoutVersion: 1, containerLayoutVersion: 1 });
    expect(snapshotOf(db.inventory_slot.rows)).toBe(legacyBefore);
  });

  it('fails closed: an invalid, duplicate or conflicting source writes nothing and keeps the legacy layout', () => {
    const invalid = world(); seedPlayer(invalid, alice);
    invalid.inventory_slot.insert({ id: 'a1:60', identity: alice, slot: 60, itemKind: 'wood', quantity: 1, durability: 0, lit: true });
    expect(() => cells.movePlayerToContainerCells(invalid as never, alice as never, 1)).toThrow('inventory_layout_rows_invalid');
    expect(invalid.player_container_cell.rows.size).toBe(0);
    expect(invalid.inventory_migration.identity.find(alice)?.['containerLayoutVersion']).toBe(0);

    const stash = world(); seedPlayer(stash, alice);
    stash.hearth_stash_slot.insert({ id: 'a1:dup', identity: alice, slot: 0, itemKind: 'wood', quantity: 1, durability: 0, lit: true });
    expect(() => cells.movePlayerToContainerCells(stash as never, alice as never, 1)).toThrow('stash_layout_rows_invalid');
    expect(stash.player_container_cell.rows.size).toBe(0);

    const conflict = world(); seedPlayer(conflict, alice);
    conflict.player_container_cell.insert({ id: 'a1:hotbar:9', identity: alice, container: 'hotbar', index: 9, itemKind: 'apple', quantity: 1, durability: 0, lit: true });
    expect(() => cells.movePlayerToContainerCells(conflict as never, alice as never, 1)).toThrow('container_migration_conflict');
    expect(conflict.player_container_cell.rows.size).toBe(1);

    const stale = world(); seedPlayer(stale, alice);
    stale.inventory_migration.identity.update({ ...stale.inventory_migration.identity.find(alice), hotbarLayoutVersion: 0 });
    expect(() => cells.movePlayerToContainerCells(stale as never, alice as never, 1)).toThrow('container_migration_prerequisite_missing');
  });

  it('refuses when the written rows do not read back to the source fingerprint', () => {
    const db = world(); seedPlayer(db, alice);
    const insert = db.player_container_cell.insert;
    db.player_container_cell.insert = (row: Row) => insert({ ...row, quantity: (row['quantity'] as number) === 40 ? 39 : row['quantity'] });
    expect(() => cells.movePlayerToContainerCells(db as never, alice as never, 1)).toThrow('container_migration_parity_failed');
    // The reducer transaction rolls back the partial writes; the version was never set.
    expect(db.inventory_migration.identity.find(alice)?.['containerLayoutVersion']).toBe(0);
  });
});

describe('connect-time player move parity against the legacy tables', () => {
  it.each([
    ['a quantity', (row: Row) => row['itemKind'] === 'wood' && row['quantity'] === 40 ? { ...row, quantity: 41 } : row],
    ['a cell', (row: Row) => row['id'] === 'a1:backpack:2' ? { ...row, id: 'a1:backpack:3', index: 3 } : row],
    ['an item kind', (row: Row) => row['itemKind'] === 'arrow' ? { ...row, itemKind: 'stone' } : row],
  ] as const)('refuses a move whose written cells, read back, differ from the legacy rows in %s', (_label, tamper) => {
    const db = world(); seedPlayer(db, alice);
    const insert = db.player_container_cell.insert;
    db.player_container_cell.insert = (row: Row) => insert(tamper(row));
    expect(() => cells.movePlayerToContainerCells(db as never, alice as never, 1)).toThrow('container_migration_parity_failed');
    expect(db.inventory_migration.identity.find(alice)?.['containerLayoutVersion']).toBe(0);
  });
});

describe('one-time placeable copy', () => {
  function seedPlaceable(db: World, placeableId: bigint, stacks: Record<number, Row>, count = 16) {
    for (let slot = 0; slot < count; slot += 1) {
      db.world_placeable_slot.insert({ id: `${placeableId}:${slot}`, placeableId, slot, ...(stacks[slot] ?? empty) });
    }
  }
  const at = { microsSinceUnixEpoch: 7n };

  it('copies occupied rows with counts, a receipt and a fingerprint, once, keeping indices past capacity', () => {
    const db = world();
    seedPlaceable(db, 5n, { 0: { itemKind: 'apple', quantity: 12, durability: 0, lit: true }, 15: { itemKind: 'axe', quantity: 1, durability: 3, lit: true } });
    // A shrunk container: a stranded item at index 20 is still custody and must be copied, not dropped.
    db.world_placeable_slot.insert({ id: '5:20', placeableId: 5n, slot: 20, itemKind: 'stone', quantity: 4, durability: 0, lit: true });
    seedPlaceable(db, 9n, { 3: { itemKind: 'wood', quantity: 2, durability: 0, lit: true } }, 4);
    const legacy = snapshotOf(db.world_placeable_slot.rows);
    const plan = cells.copyPlaceableToContainerCells(db as never, 5n, at as never)!;
    expect(plan.counts).toMatchObject({ sourceRows: 17, vacantRows: 14, cells: 3, totalQuantity: 17, placeables: 1 });
    expect([...db.placeable_container_cell.rows.keys()].sort()).toEqual(['5:0', '5:15', '5:20']);
    expect(stackOf(db.placeable_container_cell.id.find('5:15'))).toEqual({ itemKind: 'axe', quantity: 1, durability: 3, lit: true });
    expect(db.placeable_container_copy.placeableId.find(5n)).toMatchObject({
      sourceRows: 17, cells: 3, totalQuantity: 17n, sourceFingerprint: plan.sourceFingerprint, copiedAt: at,
    });
    expect(plan.sourceFingerprint).toBe(sim.legacyPlaceableSlotsFingerprint(
      [...db.world_placeable_slot.rows.values()].filter(row => row['placeableId'] === 5n).map(row => ({ placeableId: 5n, slot: row['slot'] as number, ...stackOf(row) }) as never)));
    // Idempotent even after the copied cells change (a player emptied the chest): the receipt blocks a re-copy.
    for (const id of ['5:0', '5:15', '5:20']) db.placeable_container_cell.id.delete(id);
    expect(cells.copyPlaceableToContainerCells(db as never, 5n, at as never)).toBeNull();
    expect(db.placeable_container_cell.rows.size).toBe(0);
    // Nothing to copy for a placeable without legacy rows; the legacy table is never written.
    expect(cells.copyPlaceableToContainerCells(db as never, 77n, at as never)).toBeNull();
    expect(snapshotOf(db.world_placeable_slot.rows)).toBe(legacy);
  });

  it('refuses over existing cells and reports lane status with counts and fingerprints', () => {
    const db = world(); seedPlayer(db, alice); seedPlayer(db, bob);
    bob.toHexString(); db.inventory_slot.insert({ id: 'b2:99', identity: bob, slot: 99, itemKind: 'wood', quantity: 1, durability: 0, lit: true });
    seedPlaceable(db, 5n, { 0: { itemKind: 'apple', quantity: 12, durability: 0, lit: true } });
    seedPlaceable(db, 9n, { 3: { itemKind: 'wood', quantity: 2, durability: 0, lit: true } }, 4);
    db.placeable_container_cell.insert({ id: '9:1', placeableId: 9n, index: 1, itemKind: 'apple', quantity: 1, durability: 0, lit: true });
    expect(() => cells.copyPlaceableToContainerCells(db as never, 9n, at as never)).toThrow('container_migration_conflict');
    db.placeable_container_cell.id.delete('9:1');
    const before = cells.containerCellMigrationStatus(db as never, 100);
    expect(before.players).toMatchObject({ current: 0, legacy: 2, planned: 2, planTruncated: false, legacyCells: 12 });
    expect(before.issues).toEqual([{ kind: 'player_plan_refused', id: 'b2', code: 'inventory_layout_rows_invalid' }]);
    expect(before.placeables).toMatchObject({ legacy: 2, copied: 0, uncopied: 2, legacyRows: 20, legacyCells: 2, legacyQuantity: 14, receipts: 0 });
    expect(before.placeables.legacyFingerprint).toBe(sim.legacyPlaceableSlotsFingerprint(
      [...db.world_placeable_slot.rows.values()].map(row => ({ placeableId: row['placeableId'] as bigint, slot: row['slot'] as number, ...stackOf(row) }) as never)));
    expect(before.placeableCopyComplete).toBe(false);
    cells.copyPlaceableToContainerCells(db as never, 5n, at as never);
    cells.copyPlaceableToContainerCells(db as never, 9n, at as never);
    cells.movePlayerToContainerCells(db as never, alice as never, 1);
    const after = cells.containerCellMigrationStatus(db as never, 100);
    expect(after.players).toMatchObject({ current: 1, legacy: 1, cells: 12 });
    expect(after.placeables).toMatchObject({ legacy: 2, copied: 2, uncopied: 0, receipts: 2, cells: 2 });
    expect(after.placeables.legacyFingerprint).toBe(before.placeables.legacyFingerprint);
    expect(after.placeableCopyComplete).toBe(true);
    // A legacy row changed after its copy (the table must never be written again) is a reported mismatch.
    db.world_placeable_slot.id.update({ ...db.world_placeable_slot.id.find('9:3'), quantity: 3 });
    const tampered = cells.containerCellMigrationStatus(db as never, 0);
    expect(tampered.players.planTruncated).toBe(true);
    // Bob's invalid row is outside the (empty) dry run now, so the custody pass names it; the player fingerprints are empty.
    expect(tampered.issues).toEqual([{ kind: 'player_custody_invalid', id: 'b2', code: 'inventory_layout_rows_invalid' },
      { kind: 'placeable_receipt_mismatch', id: '9', code: 'container_migration_parity_failed' }]);
    expect([tampered.players.legacyFingerprint, tampered.players.cellFingerprint]).toEqual(['', '']);
    expect(tampered.placeableCopyComplete).toBe(false);
  });
});

// --- one production reducer path on the new tables ---

const source = ts.createSourceFile('index.ts', readFileSync(new URL('./index.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
function authority(names: readonly string[], dependencies: Record<string, unknown>) {
  const definitions = names.map((name) => {
    const fn = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
    if (fn === undefined) throw new Error(`Missing authority ${name}`);
    return fn.getText(source);
  }).join('\n');
  const javascript = ts.transpileModule(`${definitions}\nreturn {${names.join(',')}};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  return new Function(...Object.keys(dependencies), javascript)(...Object.values(dependencies));
}

describe('open-menu moves on container cells', () => {
  const registry = sim.bootstrapContentRegistry();
  function menuWorld(options: { stash?: boolean; debugBackpackSlots?: number } = {}) {
    const db = world(); seedPlayer(db, alice);
    cells.movePlayerToContainerCells(db as never, alice as never, 1);
    db.player_survival.identity.update({ ...db.player_survival.identity.find(alice), debugBackpackSlots: options.debugBackpackSlots ?? 0 });
    const full = {
      ...db,
      world_clock: { id: { find: () => ({ authorityTick: 10n }) } },
      active_chest: { identity: { find: () => null } },
      active_placeable: { identity: { find: () => null } },
    };
    const ctx = { sender: alice, timestamp: { microsSinceUnixEpoch: 1n }, db: full };
    const api = authority([
      'moveOpenMenuItem', 'loadOpenMenuInventory', 'writeOpenMenuInventory', 'loadPlayerInventory', 'writePlayerInventory',
      'loadHearthStashBuild', 'equippedInventoryCapacity', 'accessibleInventoryContainerCapacity', 'inventoryContainerCapacity',
      'playerDebugBackpackSlots', 'withSenderErrors', 'requirePlayerContainerCells', 'sameStoredStack', 'activeItemContainerContent',
    ], {
      ...sim, ...cells, SenderError: Error, contentRegistry: () => registry,
      DEFAULT_BACKPACK_CAPACITY: sim.BASE_BACKPACK_CAPACITY,
      requirePersistentInventoryAvailable: () => {}, hearthStashSessionAvailable: () => options.stash === true,
      activeHearthLobbyDefinition: () => ({ stashCapacity: 20 }), hearthStashFrameRestrictions: () => ({}),
      advancePlayerStats: () => {}, updateEquippedForIdentity: () => {}, refreshSenderQuestsFromInventory: () => {},
      processorRuntimeForPlaceableBehaviour: () => null,
    });
    return { db, ctx, api };
  }
  /** The same move over the frozen legacy layout, as the pre-migration world applied it. */
  function legacyMove(db: World, request: sim.MoveItemRequest, stashOpen: boolean) {
    const rows = [...db.inventory_slot.rows.values()].filter(row => row['identity'] === alice);
    const stack = (row: Row | undefined) => row === undefined || row['itemKind'] === 'empty' || row['quantity'] === 0 ? null
      : { itemKind: row['itemKind'] as string, quantity: row['quantity'] as number,
        ...(sim.runtimeDurabilityDefinition(registry, row['itemKind'] as string) === null ? {} : { durability: row['durability'] as number }), lit: row['lit'] as boolean };
    const bySlot = new Map(rows.map(row => [row['slot'] as number, row]));
    const make = (id: 'hotbar' | 'backpack' | 'equipment' | 'crafting', capacity: number) => ({
      id, capacity, slots: Array.from({ length: capacity }, (_, index) => stack(bySlot.get(sim.inventoryContainerSlotOffset(id) + index))),
      ...(id === 'equipment' ? { restrictions: sim.EQUIPMENT_SLOT_RESTRICTIONS } : {}),
    });
    const stashRows = new Map([...db.hearth_stash_slot.rows.values()].filter(row => row['identity'] === alice).map(row => [row['slot'] as number, row]));
    const containers: Record<string, sim.ContainerSnapshot> = {
      hotbar: make('hotbar', 10), backpack: make('backpack', 20), equipment: make('equipment', 10), crafting: make('crafting', 9),
      ...(stashOpen ? { stash: { id: 'stash', capacity: 20, slots: Array.from({ length: 20 }, (_, index) => stack(stashRows.get(index))) } } : {}),
    };
    return sim.moveItemStacks(containers, request, sim.itemContainerContentResolver(registry));
  }
  function custody(db: World) {
    return [...db.player_container_cell.rows.values()].filter(row => row['identity'] === alice)
      .map(row => `${row['container']}:${row['index']}:${row['itemKind']}x${row['quantity']}`).sort();
  }
  function expected(result: ReturnType<typeof legacyMove>) {
    if (!result.ok) throw new Error(result.code);
    return Object.values(result.containers).flatMap(container => container.slots.flatMap((slot, index) => slot === null || slot === undefined ? []
      : [`${container.id}:${index}:${slot.itemKind}x${slot.quantity}`])).sort();
  }

  it.each([
    ['split a backpack stack into the hotbar', { fromContainer: 'backpack', fromIndex: 2, toContainer: 'hotbar', toIndex: 9, quantity: 15 }, false],
    ['unequip the Main Hand bow into the hotbar', { fromContainer: 'equipment', fromIndex: 3, toContainer: 'hotbar', toIndex: 1, quantity: 1 }, false],
    ['swap two hotbar stacks', { fromContainer: 'hotbar', fromIndex: 0, toContainer: 'hotbar', toIndex: 4, quantity: 1 }, false],
    ['stow crafting stone in the stash', { fromContainer: 'crafting', fromIndex: 0, toContainer: 'stash', toIndex: 5, quantity: 3 }, true],
    ['take the stash sword into the backpack', { fromContainer: 'stash', fromIndex: 17, toContainer: 'backpack', toIndex: 0, quantity: 1 }, true],
  ] as const)('%s: the same custody as the legacy layout, written as sparse upserts and deletes', (_label, request, stash) => {
    const { db, ctx, api } = menuWorld({ stash });
    const want = expected(legacyMove(db, request, stash));
    api.moveOpenMenuItem(ctx, request);
    expect(custody(db)).toEqual(want.filter(entry => !entry.startsWith('stash:') || stash)
      .concat(stash ? [] : ['stash:0:applex9', 'stash:17:swordx1']).sort());
    // Only occupied cells are rows.
    expect([...db.player_container_cell.rows.values()].every(row => row['itemKind'] !== 'empty' && (row['quantity'] as number) > 0)).toBe(true);
  });

  it('spills cells stranded past a smaller backpack into overflow with their exact columns on the next write', () => {
    const { db, ctx, api } = menuWorld({ debugBackpackSlots: 20 });
    // The bag grants 20 while equipped; unequip it through storage the player controls, then lower the debug slots.
    db.player_container_cell.id.delete('a1:equipment:4');
    db.player_survival.identity.update({ ...db.player_survival.identity.find(alice), debugBackpackSlots: 0 });
    // Arrows at backpack 19 are now past the 8-cell default capacity.
    api.moveOpenMenuItem(ctx, { fromContainer: 'hotbar', fromIndex: 4, toContainer: 'hotbar', toIndex: 5, quantity: 7 });
    expect(db.player_container_cell.id.find('a1:backpack:19')).toBeNull();
    expect([...db.inventory_overflow.rows.values()]).toEqual([
      expect.objectContaining({ identity: alice, itemKind: 'arrow', quantity: 18, durability: 0, lit: true }),
    ]);
    expect(db.player_container_cell.id.find('a1:hotbar:5')).toMatchObject({ itemKind: 'torch', quantity: 7, lit: false });
  });

  it('writes a snapshot taken at another backpack size (an admin undo) by rebuilding the stored rows at its capacity', () => {
    const { db, ctx, api } = menuWorld();
    db.player_container_cell.id.delete('a1:equipment:4');
    const inventory = api.loadPlayerInventory(ctx, alice);
    expect(inventory.containers.backpack.capacity).toBe(sim.BASE_BACKPACK_CAPACITY);
    const slots = Array.from({ length: 20 }, (_, index) => index === 15 ? { itemKind: 'apple', quantity: 2, lit: true } : null);
    slots[19] = { itemKind: 'arrow', quantity: 18, lit: true };
    api.writePlayerInventory(ctx, inventory, inventory.containers, {
      ...inventory.containers, backpack: { ...inventory.containers.backpack, capacity: 20, slots },
    });
    expect(db.player_container_cell.id.find('a1:backpack:15')).toMatchObject({ itemKind: 'apple', quantity: 2 });
    expect(db.player_container_cell.id.find('a1:backpack:19')).toMatchObject({ itemKind: 'arrow', quantity: 18 });
    expect(db.player_container_cell.id.find('a1:backpack:2')).toBeNull();
    expect(db.inventory_overflow.rows.size).toBe(0);
  });

  it('refuses writes for a player still on the legacy layout', () => {
    const { db, ctx, api } = menuWorld();
    db.inventory_migration.identity.update({ ...db.inventory_migration.identity.find(alice), containerLayoutVersion: 0 });
    expect(() => api.moveOpenMenuItem(ctx, { fromContainer: 'hotbar', fromIndex: 4, toContainer: 'hotbar', toIndex: 5, quantity: 7 }))
      .toThrow('inventory_migration_pending');
  });
});

describe('stranded retired items and over-maximum stacks: spill, drain, connect and maintenance', () => {
  const registry = sim.bootstrapContentRegistry();
  const warnings: string[] = [];
  /** Alice (moved, with the bag unequipped) and Bob (moved) on real cells, with the real write, drain and 1 Hz pass. */
  function strandedWorld() {
    const db = world(); seedPlayer(db, alice); seedPlayer(db, bob);
    cells.movePlayerToContainerCells(db as never, alice as never, 1);
    cells.movePlayerToContainerCells(db as never, bob as never, 1);
    db.player_container_cell.id.delete('a1:equipment:4');
    // Past the 8-cell default backpack: a retired item kind the content no longer defines, and a stack above the
    // current wood maximum (99), next to the seeded arrows at 19.
    db.player_container_cell.insert({ id: 'a1:backpack:17', identity: alice, container: 'backpack', index: 17, itemKind: 'retired_relic', quantity: 2, durability: 5, lit: true });
    db.player_container_cell.insert({ id: 'a1:backpack:18', identity: alice, container: 'backpack', index: 18, itemKind: 'wood', quantity: 250, durability: 0, lit: true });
    const full = {
      ...db,
      world_clock: { id: { find: () => ({ authorityTick: 20n }) } },
      active_chest: { identity: { find: () => null } },
      active_placeable: { identity: { find: () => null } },
      player_trade_session: { iter: () => [][Symbol.iterator]() },
    };
    const ctx = { sender: alice, timestamp: { microsSinceUnixEpoch: 1n }, db: full };
    warnings.length = 0;
    const api = authority([
      'moveOpenMenuItem', 'loadOpenMenuInventory', 'writeOpenMenuInventory', 'loadPlayerInventory', 'writePlayerInventory',
      'loadHearthStashBuild', 'equippedInventoryCapacity', 'accessibleInventoryContainerCapacity', 'inventoryContainerCapacity',
      'playerDebugBackpackSlots', 'withSenderErrors', 'requirePlayerContainerCells', 'sameStoredStack', 'activeItemContainerContent',
      'planPlayerOverflowDrain', 'applyPlayerOverflowDrain', 'drainPlayerOverflowSafely', 'firstIndexRow', 'runOneHertzTickMaintenance',
    ], {
      ...sim, ...cells, SenderError: Error, contentRegistry: () => registry,
      DEFAULT_BACKPACK_CAPACITY: sim.BASE_BACKPACK_CAPACITY,
      requirePersistentInventoryAvailable: () => {}, hearthStashSessionAvailable: () => false,
      activeHearthLobbyDefinition: () => ({ stashCapacity: 20 }), hearthStashFrameRestrictions: () => ({}),
      advancePlayerStats: () => {}, updateEquippedForIdentity: () => {}, refreshSenderQuestsFromInventory: () => {},
      processorRuntimeForPlaceableBehaviour: () => null,
      recordTickRowScan: () => {}, tradePlayersWithinReach: () => true, cancelPlayerTrade: () => {}, PLAYER_TRADE_REQUEST_TTL_TICKS: 600n,
      console: { warn: (text: string) => warnings.push(text) },
    });
    return { db, ctx, api };
  }
  const overflowOf = (db: World, who: ReturnType<typeof identity>) => [...db.inventory_overflow.rows.values()]
    .filter(row => (row['identity'] as { toHexString(): string }).toHexString() === who.toHexString())
    .map(row => `${row['itemKind']}x${row['quantity']}`).sort();
  const quantityOf = (db: World, who: ReturnType<typeof identity>, itemKind: string) =>
    [...db.player_container_cell.rows.values(), ...db.inventory_overflow.rows.values()]
      .filter(row => (row['identity'] as { toHexString(): string }).toHexString() === who.toHexString() && row['itemKind'] === itemKind)
      .reduce((sum, row) => sum + (row['quantity'] as number), 0);

  it('spills without throwing: the retired item stays in its cell, the over-maximum stack splits, nothing is lost', () => {
    const { db, ctx, api } = strandedWorld();
    expect(() => api.moveOpenMenuItem(ctx, { fromContainer: 'hotbar', fromIndex: 4, toContainer: 'hotbar', toIndex: 5, quantity: 7 })).not.toThrow();
    expect(db.player_container_cell.id.find('a1:backpack:17')).toMatchObject({ itemKind: 'retired_relic', quantity: 2, durability: 5 });
    expect(db.player_container_cell.id.find('a1:backpack:18')).toBeNull();
    expect(db.player_container_cell.id.find('a1:backpack:19')).toBeNull();
    expect(overflowOf(db, alice)).toEqual(['arrowx18', 'woodx52', 'woodx99', 'woodx99']);
    expect(quantityOf(db, alice, 'wood')).toBe(40 + 250 + 2);
    // A second write finds the retired cell again and keeps it again: idempotent, still no throw.
    expect(() => api.moveOpenMenuItem(ctx, { fromContainer: 'hotbar', fromIndex: 5, toContainer: 'hotbar', toIndex: 4, quantity: 7 })).not.toThrow();
    expect(db.player_container_cell.id.find('a1:backpack:17')).toMatchObject({ itemKind: 'retired_relic', quantity: 2 });
  });

  it('drains around unplaceable overflow rows (retired or over maximum) instead of throwing, at connect and in maintenance', () => {
    const { db, ctx, api } = strandedWorld();
    // Overflow rows written before this fix (or content that later retired a kind or lowered a maximum).
    const put = (who: ReturnType<typeof identity>, itemKind: string, quantity: number) =>
      db.inventory_overflow.insert({ id: 0n, identity: who, itemKind, quantity, durability: 0, lit: true });
    put(alice, 'retired_relic', 3); put(alice, 'wood', 250); put(alice, 'apple', 3);
    put(bob, 'apple', 4);
    // The connect-time drain for Alice: no throw; the relic row is kept, wood placed in pieces, apples placed.
    expect(api.drainPlayerOverflowSafely(ctx, alice)).toBe(true);
    expect(overflowOf(db, alice).filter(entry => entry.startsWith('retired_relic'))).toEqual(['retired_relicx3']);
    expect(overflowOf(db, alice).some(entry => entry.startsWith('apple'))).toBe(false);
    expect(quantityOf(db, alice, 'wood')).toBe(40 + 250 + 2 + 250);
    expect(warnings.some(text => text.includes('overflow_item_retired'))).toBe(true);
    // Alice is marked to sleep until her next inventory write; Bob's row is drained by the 1 Hz pass.
    expect(db.inventory_overflow_retry.identity.find(alice)).not.toBeNull();
    api.runOneHertzTickMaintenance(ctx, 20n, {});
    expect(overflowOf(db, bob)).toEqual([]);
    expect(quantityOf(db, bob, 'apple')).toBe(9 + 4);
    expect(overflowOf(db, alice).filter(entry => entry.startsWith('retired_relic'))).toEqual(['retired_relicx3']);
  });

  it('keeps the 1 Hz pass going past an owner whose drain is refused, writing nothing for that owner', () => {
    const { db, ctx, api } = strandedWorld();
    // An unreadable stored cell makes Alice's inventory load refuse; Bob is fine.
    db.player_container_cell.insert({ id: 'a1:hotbar:9', identity: alice, container: 'hotbar', index: 9, itemKind: 'apple', quantity: 70_000, durability: 0, lit: true });
    db.inventory_overflow.insert({ id: 0n, identity: alice, itemKind: 'apple', quantity: 2, durability: 0, lit: true });
    db.inventory_overflow.insert({ id: 0n, identity: bob, itemKind: 'apple', quantity: 4, durability: 0, lit: true });
    const aliceCells = snapshotOf(new Map([...db.player_container_cell.rows].filter(([key]) => key.startsWith('a1:'))));
    expect(() => api.runOneHertzTickMaintenance(ctx, 20n, {})).not.toThrow();
    expect(overflowOf(db, bob)).toEqual([]);
    expect(overflowOf(db, alice)).toEqual(['applex2']);
    expect(snapshotOf(new Map([...db.player_container_cell.rows].filter(([key]) => key.startsWith('a1:'))))).toBe(aliceCells);
    expect(db.inventory_overflow_retry.identity.find(alice)).not.toBeNull();
    expect(warnings.some(text => text.includes('drain refused for a1'))).toBe(true);
    // Marked, Alice is not retried every second.
    warnings.length = 0;
    api.runOneHertzTickMaintenance(ctx, 40n, {});
    expect(warnings).toEqual([]);
  });

  it('leaves a legacy-layout player\'s overflow for the connect that moves them, without throwing or writing', () => {
    const { db, ctx, api } = strandedWorld();
    db.inventory_migration.identity.update({ ...db.inventory_migration.identity.find(bob), containerLayoutVersion: 0 });
    db.inventory_overflow.insert({ id: 0n, identity: bob, itemKind: 'apple', quantity: 4, durability: 0, lit: true });
    const bobCells = snapshotOf(new Map([...db.player_container_cell.rows].filter(([key]) => key.startsWith('b2:'))));
    let drained = true;
    expect(() => { drained = api.drainPlayerOverflowSafely(ctx, bob); }).not.toThrow();
    expect(drained).toBe(false);
    expect(overflowOf(db, bob)).toEqual(['applex4']);
    expect(snapshotOf(new Map([...db.player_container_cell.rows].filter(([key]) => key.startsWith('b2:'))))).toBe(bobCells);
    // The 1 Hz pass skips them the same way and carries on.
    expect(() => api.runOneHertzTickMaintenance(ctx, 20n, {})).not.toThrow();
    expect(overflowOf(db, bob)).toEqual(['applex4']);
  });

  it('wires connect and the legacy farm recipients to the per-owner safe drain', () => {
    const text = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
    expect(text).not.toMatch(/(?<![A-Za-z])drainPlayerOverflow\(/u);
    const onConnect = text.slice(text.indexOf('export const onConnect = spacetimedb.clientConnected('), text.indexOf('export const onDisconnect'));
    expect(onConnect).toContain('drainPlayerOverflowSafely(ctx, ctx.sender);');
    expect(text).toContain('for (const identity of overflowOwners.values()) drainPlayerOverflowSafely(ctx, identity);');
    expect(text).toContain('for (const identity of inventoryRecipients.values()) drainPlayerOverflowSafely(ctx, identity);');
  });
});

describe('connect-time wiring', () => {
  const text = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
  const onConnect = text.slice(text.indexOf('export const onConnect = spacetimedb.clientConnected('),
    text.indexOf('export const onDisconnect'));

  const migrateFn = text.slice(text.indexOf('function migrateLegacyPlayerStorage('), text.indexOf('export const onConnect = spacetimedb.clientConnected('));

  it('runs the legacy layout steps only before the move, then moves in the same transaction before any inventory read', () => {
    const gate = onConnect.indexOf('if (!enteringSurvivalWorld || hasUnmovedLegacyStorage(ctx.db, ctx.sender)) migrateLegacyPlayerStorage(ctx, ctx.sender);');
    const created = onConnect.indexOf('if (survival === null) {');
    const stats = onConnect.indexOf('ensurePlayerStats(ctx, ctx.sender');
    const drain = onConnect.indexOf('drainPlayerOverflowSafely(ctx, ctx.sender)');
    expect([gate, created, stats, drain].every(index => index > 0)).toBe(true);
    // The move runs before a new character's loadout is written, so orphan legacy rows are moved, never overwritten.
    expect(gate).toBeLessThan(created);
    expect(created).toBeLessThan(stats);
    expect(stats).toBeLessThan(drain);
    // Inside the shared step: the version gate, then hotbar, then equipment, then the move.
    const current = migrateFn.indexOf('>= CURRENT_CONTAINER_LAYOUT_VERSION) {\n    return null;');
    const hotbar = migrateFn.indexOf('storedHotbarLayoutVersion < CURRENT_HOTBAR_LAYOUT_VERSION');
    const equipment = migrateFn.indexOf('migrateEquipmentLayout(equipmentRows, equipmentVersion)');
    const move = migrateFn.indexOf('movePlayerToContainerCells(ctx.db, identity, CURRENT_HOTBAR_LAYOUT_VERSION)');
    expect([current, hotbar, equipment, move].every(index => index > 0)).toBe(true);
    expect(current).toBeLessThan(hotbar);
    expect(hotbar).toBeLessThan(equipment);
    expect(equipment).toBeLessThan(move);
    // New characters start on the cell layout; no legacy row is written for them, and a loadout cell already holding
    // a moved orphan item keeps it (the loadout stack goes to overflow custody).
    const createdBlock = onConnect.slice(created, onConnect.indexOf('const survivalMigration = ctx.db.player_survival_migration'));
    expect(createdBlock).toContain('putPlayerCell(ctx.db, ctx.sender, cell.container, cell.index');
    expect(createdBlock).toContain('stashOverflow(ctx, ctx.sender, stack)');
    expect(createdBlock).toContain('containerLayoutVersion: CURRENT_CONTAINER_LAYOUT_VERSION');
    expect(createdBlock).not.toMatch(/db\.inventory_slot/u);
  });

  it('writes legacy tables nowhere but the gated legacy steps, and views both generations', () => {
    const writes = [...text.matchAll(/ctx\.db\.(inventory_slot|hearth_stash_slot|world_placeable_slot)\.(insert|id\.update|id\.delete)/gu)];
    const gated = migrateFn.slice(0, migrateFn.indexOf('movePlayerToContainerCells('));
    expect(writes.length).toBeGreaterThan(0);
    for (const write of writes) expect(gated).toContain(write[0]);
    expect(writes.every(write => write[1] === 'inventory_slot')).toBe(true);
    // Only connect (for an existing character) and the release-lane batch run those steps.
    const callers = [...text.matchAll(/migrateLegacyPlayerStorage\((ctx, [a-z.]+)\)/gu)].map(match => match[1]);
    expect(callers.sort()).toEqual(['ctx, ctx.sender', 'ctx, player.identity']);
    for (const view of ['own_player_container_cells', 'own_open_placeable_container_cells', 'own_placed_placeable_container_cells',
      'own_inventory_slots', 'own_hearth_stash_slots', 'own_placed_placeable_slots']) {
      expect(text).toContain(`name: '${view}'`.replace("name: 'own_hearth_stash_slots'", "name:'own_hearth_stash_slots'"));
    }
  });

  it('requires inventory protocol 2 and takes u32 container indices', () => {
    expect(sim.CONTAINER_CELL_INVENTORY_PROTOCOL_VERSION).toBe(2);
    expect(text).toContain('acknowledgement.version !== CONTAINER_CELL_INVENTORY_PROTOCOL_VERSION');
    expect(text).not.toMatch(/\b(?:index|fromIndex|toIndex|hotbarIndex|inventoryIndex|tradeSlot): t\.u8\(\)/u);
    expect(text).not.toContain('targetIndexes: t.array(t.u8())');
  });
});

// --- the release-lane entry points, from the module source ---

/** One `export const name = spacetimedb.reducer|procedure(..., handler)` handler, compiled from the module source. */
function entryPoint(name: string, dependencies: Record<string, unknown>) {
  let handler: string | undefined;
  for (const node of source.statements) {
    if (!ts.isVariableStatement(node)) continue;
    const declaration = node.declarationList.declarations.find(candidate => candidate.name.getText(source) === name);
    if (declaration?.initializer !== undefined && ts.isCallExpression(declaration.initializer)) {
      handler = declaration.initializer.arguments[declaration.initializer.arguments.length - 1]!.getText(source);
    }
  }
  if (handler === undefined) throw new Error(`Missing entry point ${name}`);
  const javascript = ts.transpileModule(`return ${handler};`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  return new Function(...Object.keys(dependencies), javascript)(...Object.values(dependencies));
}

describe('release-lane batches and status (owner or admin)', () => {
  const registry = sim.bootstrapContentRegistry();
  const carol = identity('c3');
  const dave = identity('d4');
  const erin = identity('e5');
  const jwt = { issuer: OIDC_ISSUER, audience: ['orchard-web'] };
  type Member = { role: string; blocked: boolean; revokedAt?: unknown } | null;

  /** The oldest stored layout (hotbar layout 0, equipment layout 0): 47 dense rows, hotbar 0-8, backpack 9-28,
   * equipment 29-37, crafting 38-46. `versioned: false` is a character from before `inventory_migration` existed. */
  function seedNineSlotPlayer(db: World, who: ReturnType<typeof identity>, versioned = true) {
    const items: Record<number, Row> = {
      0: { itemKind: 'apple', quantity: 4, durability: 0, lit: true }, 8: { itemKind: 'torch', quantity: 2, durability: 0, lit: false },
      9: { itemKind: 'wood', quantity: 40, durability: 0, lit: true }, 32: { itemKind: 'hearth_rare_bow', quantity: 1, durability: 0, lit: true },
      33: { itemKind: 'backpack', quantity: 1, durability: 0, lit: true }, 46: { itemKind: 'stone', quantity: 6, durability: 0, lit: true },
    };
    for (let slot = 0; slot < 47; slot += 1) {
      db.inventory_slot.insert({ id: `${who.toHexString()}:${slot}`, identity: who, slot, ...(items[slot] ?? empty) });
    }
    db.hearth_stash_slot.insert({ id: `${who.toHexString()}:3`, identity: who, slot: 3, itemKind: 'sword', quantity: 1, durability: 0, lit: true });
    db.player_survival.insert({ identity: who, selectedSlot: sim.MAIN_HAND_SELECTED_SLOT, debugBackpackSlots: 0 });
    if (versioned) {
      db.inventory_migration.insert({ identity: who, durabilityVersion: 1, hotbarLayoutVersion: 0, equipmentLayoutVersion: 0, containerLayoutVersion: 0 });
    }
  }

  function lane(member: Member, options: { scopeGrant?: boolean } = {}) {
    const db = world();
    const full = {
      ...db,
      membership: { identity: { find: () => member } },
      content_editor_grant: { identity: { find: () => null } },
      support_grant: { identity: { find: () => null } },
      studio_scope_grant: {
        id: { find: (key: string) => options.scopeGrant === true && key === 'a1:operate.world' ? { scope: 'operate.world', revokedAt: undefined } : null },
        by_identity: { filter: () => options.scopeGrant === true ? [{ scope: 'operate.world', revokedAt: undefined }] : [] },
      },
    };
    // The placeable batch walks `by_placeable` with an open or cursor Range; serve rows in placeable order.
    full.world_placeable_slot = { ...db.world_placeable_slot, by_placeable: { filter: () => [...db.world_placeable_slot.rows.values()]
      .sort((left, right) => (left['placeableId'] as bigint) < (right['placeableId'] as bigint) ? -1 : 1) } } as never;
    const ctx = { sender: alice, senderAuth: { jwt }, timestamp: { microsSinceUnixEpoch: 3n }, db: full };
    const helpers = authority([
      'requireAuthorizedSender', 'requireWorldOwner', 'scopesFor', 'requireStudioScope', 'requireAdminProcedure',
      'requireWorldAdministrationRead', 'migrateLegacyPlayerStorage', 'withSenderErrors', 'ensureContainerCellMigrationControl',
      'ensurePlaceableContainerCells',
    ], {
      ...sim, ...cells, SenderError: Error, authenticationRejection, membershipRejection, canAdministerWorld, requireOwnerOrAdminRead,
      resolveStudioScopes,
      contentRegistry: () => registry, CONTAINER_CELL_MIGRATION_CONTROL_ID: 0,
    });
    const dependencies = {
      ...sim, ...cells, ...helpers, SenderError: Error, Range: class { constructor(readonly bound?: unknown) {} },
      CONTAINER_CELL_BACKFILL_MAX: 100, CONTAINER_CELL_STATUS_PLAN_MAX: 10_000,
    };
    return {
      db, ctx,
      players: (limit = 100) => entryPoint('adminBackfillPlayerContainerCells', dependencies)(ctx, { limit }),
      placeables: (limit = 100) => entryPoint('adminBackfillPlaceableContainerCells', dependencies)(ctx, { limit }),
      status: (maximumPlayerPlans = 100) => JSON.parse(entryPoint('adminContainerCellMigrationStatus', dependencies)(
        { withTx: (run: (tx: unknown) => unknown) => run({ sender: alice, db: full }) }, { maximumPlayerPlans })) as cells.ContainerCellMigrationStatus,
    };
  }

  const owner = { role: 'owner', blocked: false };
  const admin = { role: 'admin', blocked: false };

  it.each([['owner', owner], ['admin', admin]] as const)('lets the %s run the placeable copy, the player move and the status', (_label, member) => {
    const run = lane(member);
    seedPlayer(run.db, bob);
    run.db.world_placeable_slot.insert({ id: '5:0', placeableId: 5n, slot: 0, itemKind: 'apple', quantity: 12, durability: 0, lit: true });
    expect(run.status().players).toMatchObject({ legacy: 1, current: 0 });
    run.placeables();
    run.players();
    const after = run.status();
    expect(after.players).toMatchObject({ legacy: 0, current: 1, cells: 12 });
    expect(after.placeables).toMatchObject({ copied: 1, uncopied: 0, backfillComplete: true });
    expect(after.issues).toEqual([]);
  });

  it.each([
    ['moderator', { role: 'moderator', blocked: false }, 'studio_scope_required:operate.world'],
    ['plain player', { role: 'friend', blocked: false }, 'studio_scope_required:operate.world'],
    ['missing member', null, 'membership_required'],
    ['blocked admin', { role: 'admin', blocked: true }, 'membership_blocked'],
    ['revoked owner', { role: 'owner', blocked: false, revokedAt: 'then' }, 'membership_revoked'],
  ] as const)('refuses a %s on every entry point, writing nothing', (_label, member, code) => {
    const run = lane(member);
    seedPlayer(run.db, bob);
    run.db.world_placeable_slot.insert({ id: '5:0', placeableId: 5n, slot: 0, itemKind: 'apple', quantity: 12, durability: 0, lit: true });
    expect(() => run.players()).toThrow(code);
    expect(() => run.placeables()).toThrow(code);
    expect(() => run.status()).toThrow(member === null ? 'studio_scope_required:operate.world' : /studio_scope_required|admin_role_forbidden/u);
    expect(run.db.player_container_cell.rows.size + run.db.placeable_container_cell.rows.size + run.db.container_cell_migration.rows.size).toBe(0);
  });

  it('refuses a moderator holding an explicit operate.world grant: the role must be owner or admin', () => {
    const run = lane({ role: 'moderator', blocked: false }, { scopeGrant: true });
    seedPlayer(run.db, bob);
    expect(() => run.players()).toThrow('owner_required');
    expect(() => run.placeables()).toThrow('owner_required');
    expect(() => run.status()).toThrow('owner_required');
    expect(run.db.player_container_cell.rows.size).toBe(0);
  });

  it('moves characters on the nine-slot hotbar and with no migration row, skips a refused plan, leaves a characterless row', () => {
    const run = lane(admin);
    seedPlayer(run.db, alice);
    seedPlayer(run.db, bob);
    run.db.inventory_slot.insert({ id: 'b2:99', identity: bob, slot: 99, itemKind: 'wood', quantity: 1, durability: 0, lit: true });
    seedNineSlotPlayer(run.db, carol);
    seedNineSlotPlayer(run.db, dave, false);
    // A migration row whose character does not exist: connecting would create the character, so only connect may act.
    run.db.inventory_migration.insert({ identity: erin, durabilityVersion: 1, hotbarLayoutVersion: 0, equipmentLayoutVersion: 0, containerLayoutVersion: 0 });
    const before = run.status();
    expect(before.players).toMatchObject({ current: 0, legacy: 5, planned: 5 });
    expect(before.issues).toEqual([{ kind: 'player_plan_refused', id: 'b2', code: 'inventory_layout_rows_invalid' }]);
    const carolPlan = cells.planLegacyPlayerContainerMove(run.db as never, carol as never, { hotbarLayoutVersion: 0, equipmentLayoutVersion: 0 });
    const legacyStash = snapshotOf(run.db.hearth_stash_slot.rows);

    run.players();
    const after = run.status();
    expect(after.players).toMatchObject({ current: 3, legacy: 2 });
    expect(after.issues).toEqual(before.issues);
    for (const who of [alice, carol, dave]) {
      expect(run.db.inventory_migration.identity.find(who)).toMatchObject({ hotbarLayoutVersion: 1, equipmentLayoutVersion: 1, containerLayoutVersion: 1 });
    }
    // Carol went through the connect path's hotbar and equipment steps: her items sit in their current cells, and the
    // read-back equals the dry run the status made from her nine-slot rows.
    const carolCells = [...run.db.player_container_cell.rows.values()].filter(row => row['identity'] === carol);
    expect(carolCells.map(row => `${row['container']}:${row['index']}:${row['itemKind']}x${row['quantity']}`).sort()).toEqual([
      'backpack:0:woodx40', 'crafting:8:stonex6', 'equipment:3:hearth_rare_bowx1', 'equipment:4:backpackx1',
      'hotbar:0:applex4', 'hotbar:8:torchx2', 'stash:3:swordx1',
    ]);
    expect(sim.playerContainerCellsFingerprint(carolCells.map(row => ({ container: row['container'], index: row['index'], ...stackOf(row) })) as never))
      .toBe(carolPlan.cellsFingerprint);
    expect(run.db.player_survival.identity.find(carol)?.['selectedSlot']).toBe(sim.MAIN_HAND_SELECTED_SLOT);
    // Dave had no migration row: the same steps created it (current versions) and moved him.
    expect([...run.db.player_container_cell.rows.values()].filter(row => row['identity'] === dave)).toHaveLength(7);
    // Bob (refused) and Erin (no character) were not touched.
    expect([...run.db.player_container_cell.rows.values()].some(row => row['identity'] === bob || row['identity'] === erin)).toBe(false);
    expect(run.db.inventory_migration.identity.find(bob)?.['containerLayoutVersion']).toBe(0);
    expect(run.db.inventory_migration.identity.find(erin)).toMatchObject({ hotbarLayoutVersion: 0, containerLayoutVersion: 0 });
    expect(snapshotOf(run.db.hearth_stash_slot.rows)).toBe(legacyStash);

    // Idempotent: a second batch writes no cell and no version.
    const cellWrites = run.db.player_container_cell.writes.length;
    const versionWrites = run.db.inventory_migration.writes.length;
    run.players();
    expect(run.db.player_container_cell.writes).toHaveLength(cellWrites);
    expect(run.db.inventory_migration.writes).toHaveLength(versionWrites);
  });

  it('reports whole-world player custody: legacy and cell fingerprints agree across the move and catch a changed cell', () => {
    const run = lane(owner);
    const frank = identity('f6');
    seedPlayer(run.db, alice);
    seedNineSlotPlayer(run.db, carol);
    // Dave predates inventory_migration: his move also normalises the bow's durability, which custody leaves out.
    seedNineSlotPlayer(run.db, dave, false);
    // Orphans: Erin has a migration row but no character; Frank only a stash row, no migration row and no character.
    run.db.inventory_migration.insert({ identity: erin, durabilityVersion: 1, hotbarLayoutVersion: 1, equipmentLayoutVersion: 1, containerLayoutVersion: 0 });
    run.db.inventory_slot.insert({ id: 'e5:12', identity: erin, slot: 12, itemKind: 'wood', quantity: 7, durability: 0, lit: true });
    run.db.hearth_stash_slot.insert({ id: 'f6:1', identity: frank, slot: 1, itemKind: 'apple', quantity: 5, durability: 0, lit: true });
    const before = run.status();
    expect(before.issues).toEqual([]);
    expect(before.players.legacyFingerprint).toMatch(/^player-custody-world:5:\d+:\d+:[0-9a-f]{8}$/u);
    expect(before.players.cellFingerprint).toBe(before.players.legacyFingerprint);
    expect(before.players.orphans).toEqual({ owners: 2, inventoryOwners: 1, stashOwners: 1, withoutMigrationRow: 1, quantity: 12, ids: ['e5', 'f6'] });

    run.players();
    const after = run.status();
    expect(after.players).toMatchObject({ current: 3, legacy: 1 });
    expect(run.db.player_container_cell.id.find('d4:equipment:3')?.['durability']).not.toBe(0);
    // Legacy custody is unchanged by the connect-time steps that rewrote Carol's and Dave's legacy rows, and the cells
    // hold exactly that custody; the orphans are still legacy and still reported.
    expect(after.players.legacyFingerprint).toBe(before.players.legacyFingerprint);
    expect(after.players.cellFingerprint).toBe(after.players.legacyFingerprint);
    expect(after.players.orphans).toEqual(before.players.orphans);

    // A changed cell (one fewer arrow) or a stray cell for a player not yet moved shows as a difference.
    run.db.player_container_cell.id.update({ ...run.db.player_container_cell.id.find('a1:backpack:19'), quantity: 17 });
    const changed = run.status();
    expect(changed.players.legacyFingerprint).toBe(before.players.legacyFingerprint);
    expect(changed.players.cellFingerprint).not.toBe(changed.players.legacyFingerprint);
    run.db.player_container_cell.id.update({ ...run.db.player_container_cell.id.find('a1:backpack:19'), quantity: 18 });
    expect(run.status().players.cellFingerprint).toBe(before.players.legacyFingerprint);
    run.db.player_container_cell.insert({ id: 'e5:hotbar:0', identity: erin, container: 'hotbar', index: 0, itemKind: 'apple', quantity: 1, durability: 0, lit: true });
    expect(run.status().players.cellFingerprint).not.toBe(before.players.legacyFingerprint);
  });

  it('moves at most `limit` characters per call', () => {
    const run = lane(owner);
    seedPlayer(run.db, alice);
    seedNineSlotPlayer(run.db, carol);
    run.players(1);
    expect(run.status().players).toMatchObject({ current: 1, legacy: 1 });
    run.players(1);
    expect(run.status().players).toMatchObject({ current: 2, legacy: 0 });
    expect(() => run.players(0)).toThrow('container_migration_limit_invalid');
  });
});
