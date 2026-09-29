import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { HOTBAR_SLOT_COUNT, INVENTORY_SLOT_COUNT, bootstrapContentRegistry, inventoryContainerSlotCount, planNewPlayerLoadout, MAIN_HAND_EQUIPMENT_INDEX, MAIN_HAND_SELECTED_SLOT, migrateEquipmentLayout, CURRENT_EQUIPMENT_LAYOUT_VERSION, CURRENT_CONTAINER_LAYOUT_VERSION, cellToLegacyGlobalSlot, isPlayerContainerId, legacyGlobalSlotToCell, playerContainerCellsFingerprint, type PlayerContainerMigrationPlan } from '@orchard/sim';
import * as containerCells from './container-cells.js';
import { playerCellDependencies, playerCellTable } from './player-cells.fixture.js';
import { contentRecoveryConnection } from './content/recovery.js';

const source = ts.createSourceFile('index.ts', readFileSync(new URL('./index.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
const printer = ts.createPrinter();
type Row = Record<string, unknown>;

/** Every write any fixture table takes, in order, so a test can prove a connect wrote nothing. */
const writes: string[] = [];
function table(initial: readonly Row[] = [], key = 'identity') {
  const rows = new Map(initial.map((row) => [row[key], { ...row }]));
  const index = {
    find: (id: unknown) => rows.get(id) ?? null,
    update: (row: Row) => { writes.push(`update:${String(row[key])}`); rows.set(row[key], row); return row; },
    delete: (id: unknown) => { writes.push(`delete:${String(id)}`); return rows.delete(id); },
  };
  return {
    identity: index, id: index,
    insert: (row: Row) => { writes.push(`insert:${String(row[key])}`); rows.set(row[key], row); return row; },
    iter: () => rows.values(), count: () => BigInt(rows.size),
    by_identity: { filter: (identity: unknown) => [...rows.values()].filter((row) => row['identity'] === identity) },
  };
}

/** Execute the actual connection callback through its inventory initialization
 * phase, before unrelated stats/presence writes. No duplicate grant algorithm. */
interface AuthoredLoadoutFixture {
  readonly selectedSlot: number;
  readonly equippedKind: string;
  readonly cells: readonly {
    readonly container: 'hotbar' | 'backpack' | 'equipment' | 'crafting';
    readonly index: number;
    readonly itemKind: string;
    readonly quantity: number;
    readonly durability: number;
    readonly lit: boolean;
  }[];
}

const starterLoadout: AuthoredLoadoutFixture = {
  selectedSlot: 0,
  equippedKind: 'axe',
  cells: ['axe', 'pickaxe', 'hoe', 'watering_can', 'bow', 'arrow'].map((itemKind, index) => ({
    container: 'hotbar', index, itemKind, quantity: itemKind === 'arrow' ? 32 : 1, durability: 0, lit: true,
  })),
};

interface LegacyFixture {
  readonly hotbarVersion: number;
  readonly equipmentVersion?: number;
  readonly rows: readonly Row[];
  readonly stash?: readonly Row[];
  readonly selectedSlot?: number;
  /** With a new character: keep the `inventory_migration` row too (a migration row whose character does not exist). */
  readonly orphanMigrationRow?: boolean;
}

function runInventoryConnection(
  newCharacter: boolean,
  occupied = false,
  legacy?: LegacyFixture,
  authoredLoadout: AuthoredLoadoutFixture = starterLoadout,
) {
  writes.length = 0;
  const sender = { toHexString: () => 'fixture-player' };
  const inventoryRows = legacy?.rows.map(row=>({...row,identity:sender,id:`fixture-player:${row['slot']}`})) ?? (newCharacter ? [] : Array.from({ length: INVENTORY_SLOT_COUNT }, (_, slot) => ({
    id: `fixture-player:${slot}`, identity: sender, slot,
    itemKind: occupied ? 'fiber' : 'empty', quantity: occupied ? 3 : 0, durability: 0, lit: true,
  })));
  const cursor = table([{identity:sender,itemKind:'torch',quantity:1,durability:73,lit:false}]);
  const inventory = table(inventoryRows, 'id');
  const cells = playerCellTable();
  const overflow: Row[] = [];
  const ctx = { sender, connectionId: {}, db: {
    player_survival: table(newCharacter ? [] : [{ identity: sender, selectedSlot: legacy?.selectedSlot ?? 0 }]),
    player_spawn: table(newCharacter ? [] : [{ identity: sender, tileX: 1, tileY: 1, spaceId: 0 }]),
    player_survival_migration: table(newCharacter ? [] : [{ identity: sender, hungerVersion: 1 }]),
    // An existing character has not connected since the container-cell publish: its rows are still on the legacy layout.
    inventory_migration: table(newCharacter && legacy?.orphanMigrationRow !== true ? [] : [{ identity: sender, hotbarLayoutVersion: legacy?.hotbarVersion ?? 1, durabilityVersion: 1, equipmentLayoutVersion: legacy === undefined ? CURRENT_EQUIPMENT_LAYOUT_VERSION : legacy.equipmentVersion ?? 0, containerLayoutVersion: 0 }]),
    inventory_slot: inventory, inventory_cursor: cursor,
    hearth_stash_slot: table((legacy?.stash ?? []).map(row => ({ ...row, identity: sender, id: `fixture-player:${row['slot']}` })), 'id'),
    player_container_cell: cells,
    inventory_overflow: { insert: (row: Row) => { overflow.push(row); writes.push(`overflow:${String(row['itemKind'])}`); return row; } },
    inventory_overflow_retry: table(),
    world_resource: table(), world_chest: table(), world_npc: table(), world_clock: table([], 'id'),
  } };
  let callback: ts.ArrowFunction | undefined;
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (declaration.name.getText(source) !== 'onConnect' || declaration.initializer === undefined
        || !ts.isCallExpression(declaration.initializer)) continue;
      const candidate = declaration.initializer.arguments[0];
      if (candidate !== undefined && ts.isArrowFunction(candidate)) callback = candidate;
    }
  }
  if (callback === undefined || !ts.isBlock(callback.body)) throw new Error('connection callback missing');
  const end = callback.body.statements.findIndex((statement) => ts.isExpressionStatement(statement)
    && ts.isCallExpression(statement.expression) && statement.expression.expression.getText(source) === 'ensurePlayerStats');
  if (end < 0) throw new Error('inventory phase boundary missing');
  const body = callback.body.statements.slice(0, end).map((statement) => printer.printNode(ts.EmitHint.Unspecified, statement, source)).join('\n');
  // The dry run the release-lane batch and status make from the untouched legacy rows, before any connect step.
  const migrationBefore = ctx.db.inventory_migration.identity.find(sender);
  const dryRun = migrationBefore === null ? null : containerCells.planLegacyPlayerContainerMove(ctx.db as never, sender as never, migrationBefore as never);
  const plans: (PlayerContainerMigrationPlan | null)[] = [];
  const dependencies = {
    ...playerCellDependencies, SenderError: Error, legacyGlobalSlotToCell, CURRENT_CONTAINER_LAYOUT_VERSION,
    movePlayerToContainerCells: (...args: Parameters<typeof containerCells.movePlayerToContainerCells>) => {
      const plan = containerCells.movePlayerToContainerCells(...args);
      plans.push(plan);
      return plan;
    },
    runtimeNormalizeDurability: () => { throw new Error('unexpected_durability_normalization'); },
    contentRecoveryConnection,
    requireContentEditor: () => { throw new Error('unexpected_recovery_authorization'); },
    ensureContentPublicationBase: () => { throw new Error('unexpected_recovery_integrity_check'); },
    prepareConnection: () => ({ connectionId: ctx.connectionId, firstLiveConnection: false, firstStatisticSession: false }),
    HOTBAR_SLOT_COUNT, INVENTORY_SLOT_COUNT, inventoryContainerCapacity: inventoryContainerSlotCount, migrateEquipmentLayout, CURRENT_EQUIPMENT_LAYOUT_VERSION, CURRENT_HOTBAR_LAYOUT_VERSION: 1,
    hotbarSlotCountForLayoutVersion: (version:number)=>version===0?9:HOTBAR_SLOT_COUNT,
    planNewPlayerLoadout: (_registry: unknown, request: { existingCharacter: boolean }) => request.existingCharacter
      ? { ok: true, apply: false, cells: [] }
      : { ok: true, apply: true, definitionId: 'loadout:fixture', ...authoredLoadout },
    HUNGER_MAX_CENTI: 10000, TOPSIDE_SPACE_ID: 0,
    findSurvivalSpawnTile: () => ({ tileX: 1, tileY: 1 }), storedDurability: () => 0,
    storedLit: () => true, contentRegistry: () => ({}), runtimeDurabilityDefinition: () => null, runtimeMaxStack: () => 99,
    activeWorldPolicyBalance: () => ({ survivalSpawnSearchRadiusTiles: 60 }),
  };
  // The connect callback and the helpers it calls, all from the module source: the legacy layout steps and the move
  // live in migrateLegacyPlayerStorage, which the release-lane batch runs too.
  const helpers = ['withSenderErrors', 'migrateLegacyPlayerStorage', 'stashOverflow'].map(name => source.statements.find(statement => ts.isFunctionDeclaration(statement)
    && statement.name?.text === name)!.getText(source)).join('\n');
  const javascript = ts.transpileModule(`(ctx) => { ${helpers}\n${body} }`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  const connect = new Function(...Object.keys(dependencies), `return ${javascript}`)(...Object.values(dependencies)) as (context: typeof ctx) => void;
  connect(ctx);
  const firstConnectWrites = writes.length;
  connect(ctx);
  return {
    dryRun, plans,
    firstConnectWrites,
    secondConnectWrites: writes.slice(firstConnectWrites),
    stash: [...ctx.db.hearth_stash_slot.iter()],
    legacyRows: [...inventory.iter()],
    // The authoritative sparse cells, each with its frozen legacy slot so assertions can name positions by slot.
    rows: [...cells.iter()].map((cell): Row => ({ ...cell, slot: isPlayerContainerId(cell.container)
      ? cellToLegacyGlobalSlot({ container: cell.container, index: cell.index }) : null })),
    survival: ctx.db.player_survival.identity.find(sender),
    migration: ctx.db.inventory_migration.identity.find(sender),
    overflow,
    cursor: cursor.identity.find(sender),
  };
}

describe('inventory preservation on reconnect', () => {
  it.each([false, true])('never replenishes spent, sold, or stored-away starter items (occupied=%s)', (occupied) => {
    const {rows, legacyRows, migration} = runInventoryConnection(false, occupied);
    // Only occupied cells are stored: an emptied inventory moves as no cells, and nothing is granted in their place.
    expect(rows).toHaveLength(occupied ? INVENTORY_SLOT_COUNT : 0);
    expect(rows.every((row) => row['itemKind'] === 'fiber')).toBe(true);
    expect(rows.reduce((quantity, row) => quantity + Number(row['quantity']), 0)).toBe(occupied ? INVENTORY_SLOT_COUNT * 3 : 0);
    expect(legacyRows.every((row) => row['itemKind'] === (occupied ? 'fiber' : 'empty'))).toBe(true);
    expect(migration).toMatchObject({ containerLayoutVersion: CURRENT_CONTAINER_LAYOUT_VERSION });
  });

  it('creates the initial starter kit once for a new character, then preserves it on reconnect', () => {
    const {rows, legacyRows, migration} = runInventoryConnection(true);
    expect(rows.filter((row) => row['itemKind'] === 'arrow')).toMatchObject([{ quantity: 32 }]);
    expect(rows.filter((row) => row['itemKind'] === 'bow')).toMatchObject([{ quantity: 1 }]);
    // A new character starts on the cell layout: exactly the six authored stacks, once, and no legacy rows.
    expect(rows.map((row) => row['slot'])).toEqual([0, 1, 2, 3, 4, 5]);
    expect(legacyRows).toHaveLength(0);
    expect(migration).toMatchObject({ containerLayoutVersion: CURRENT_CONTAINER_LAYOUT_VERSION });
  });

  it.each([
    ['a migration row with no character', true],
    ['rows with no migration row and no character', false],
  ] as const)('keeps orphan legacy rows for a new character (%s): moved first, never overwritten by the loadout', (_label, orphanMigrationRow) => {
    const legacyRow = (slot: number, itemKind: string, quantity: number) => ({ slot, itemKind, quantity, durability: 0, lit: true });
    const { rows, overflow, migration, plans, legacyRows, secondConnectWrites } = runInventoryConnection(true, false, {
      hotbarVersion: 1, equipmentVersion: 1, orphanMigrationRow,
      rows: [legacyRow(0, 'fiber', 3), legacyRow(12, 'wood', 40)],
      stash: [legacyRow(2, 'apple', 5)],
    });
    // The orphan items were moved (once), before the loadout: the fiber keeps hotbar 0, the rest keep their cells. With
    // no migration row the rows are on the nine-slot hotbar layout, as for any unversioned character, so slot 12 shifts.
    expect(plans.filter(plan => plan !== null)).toHaveLength(1);
    const wood = orphanMigrationRow ? 2 : 3;
    const custody = rows.map(row => `${row['container']}:${row['index']}:${row['itemKind']}x${row['quantity']}`).sort();
    expect(custody).toEqual([
      `backpack:${wood}:woodx40`, 'hotbar:0:fiberx3', 'hotbar:1:pickaxex1', 'hotbar:2:hoex1', 'hotbar:3:watering_canx1',
      'hotbar:4:bowx1', 'hotbar:5:arrowx32', 'stash:2:applex5',
    ]);
    // The loadout axe that would have overwritten the fiber is in overflow custody instead; nothing was lost.
    expect(overflow).toEqual([expect.objectContaining({ itemKind: 'axe', quantity: 1 })]);
    expect(migration).toMatchObject({ containerLayoutVersion: CURRENT_CONTAINER_LAYOUT_VERSION });
    // Legacy rows are kept as they were (plus vacant fill rows the legacy steps write); the second connect writes nothing.
    expect(legacyRows.filter(row => row['itemKind'] !== 'empty').map(row => `${row['slot']}:${row['itemKind']}`).sort()).toEqual(['0:fiber', `${10 + wood}:wood`]);
    expect(secondConnectWrites).toEqual([]);
  });

  it('writes the bootstrap starter kit to exactly the cells the legacy global slots 0-5 addressed', () => {
    const plan = planNewPlayerLoadout(bootstrapContentRegistry(), {
      existingCharacter: false, containerCapacity: inventoryContainerSlotCount,
    });
    if (!plan.ok || !plan.apply) throw new Error('bootstrap starter kit was not planned');
    const { rows, survival } = runInventoryConnection(true, false, undefined, plan);
    expect(survival).toMatchObject({ selectedSlot: 0 });
    // The output before container addressing: legacy slots 0-5, each the hotbar cell of the same number.
    expect(rows.map((row) => `${row['slot']}=${row['container']}:${row['index']}:${row['itemKind']}x${row['quantity']}d${row['durability']}:${row['lit']}`)).toEqual([
      '0=hotbar:0:axex1d200:true', '1=hotbar:1:pickaxex1d250:true', '2=hotbar:2:hoex1d180:true',
      '3=hotbar:3:watering_canx1d160:true', '4=hotbar:4:bowx1d180:true', '5=hotbar:5:arrowx32d0:true',
    ]);
  });

  it('persists arbitrary authored slots and selection without a starter-kind branch', () => {
    const authored: AuthoredLoadoutFixture = {
      selectedSlot: 3,
      equippedKind: 'survey_hatchet',
      cells: [{ container: 'hotbar', index: 3, itemKind: 'survey_hatchet', quantity: 1, durability: 777, lit: false }],
    };
    const { rows, survival } = runInventoryConnection(true, false, undefined, authored);
    expect(survival).toMatchObject({ selectedSlot: 3 });
    expect(rows.find((row) => row['slot'] === 3)).toMatchObject({
      itemKind: 'survey_hatchet', quantity: 1, durability: 777, lit: false,
    });
  });
});


describe('equipment migration through the real connection callback', () => {
  it.each([0,1])('preserves sparse crafting, equipment, cursor and both version markers (hotbar version %s)', hotbarVersion => {
    const offset = hotbarVersion === 0 ? -1 : 0;
    const oldRows = Array.from({length:hotbarVersion===0?9:10},(_,slot)=>({slot,itemKind:'empty',quantity:0,durability:0,lit:true}));
    oldRows.push(
      {slot:10+offset,itemKind:'fiber',quantity:23,durability:0,lit:true},
      {slot:33+offset,itemKind:'sword',quantity:1,durability:17,lit:true},
      {slot:35+offset,itemKind:'torch',quantity:1,durability:73,lit:false},
      {slot:39+offset,itemKind:'wood',quantity:7,durability:0,lit:true},
      {slot:47+offset,itemKind:'stone',quantity:11,durability:0,lit:true},
    );
    const {rows,legacyRows,migration,cursor}=runInventoryConnection(false,false,{hotbarVersion,rows:oldRows});
    expect(legacyRows).toHaveLength(49);
    const at=(slot:number)=>rows.find(row=>row['slot']===slot);
    expect(at(10)).toMatchObject({itemKind:'fiber',quantity:23});
    expect(at(33)).toMatchObject({itemKind:'sword',quantity:1,durability:17});
    expect(at(35)).toMatchObject({itemKind:'torch',quantity:1,durability:73,lit:false});
    expect(at(39)).toBeUndefined();
    expect(at(40)).toMatchObject({itemKind:'wood',quantity:7});
    expect(at(48)).toMatchObject({itemKind:'stone',quantity:11});
    expect(rows).toHaveLength(5);expect(rows.every(row=>Number(row['quantity'])>0)).toBe(true);
    expect(cursor).toMatchObject({itemKind:'torch',quantity:1,durability:73,lit:false});
    expect(migration).toMatchObject({durabilityVersion:1,hotbarLayoutVersion:1,equipmentLayoutVersion:1,containerLayoutVersion:CURRENT_CONTAINER_LAYOUT_VERSION});
  });
});

describe('a character last seen on the nine-slot hotbar (hotbar layout 0, equipment layout 0)', () => {
  // The oldest stored layout: hotbar 0-8, backpack 9-28, equipment 29-37 (nine cells; Body came later), crafting 38-46.
  // The rehearsal restore of production holds one such player. Every item below must reach its current cell.
  const item = (slot: number, itemKind: string, quantity: number, durability = 0, lit = true) => ({ slot, itemKind, quantity, durability, lit });
  const oldRows = (): Row[] => {
    const occupied = new Map<number, Row>([
      [0, item(0, 'axe', 1, 61)], [3, item(3, 'torch', 7, 0, false)], [8, item(8, 'apple', 12)],
      [9, item(9, 'wood', 40)], [28, item(28, 'arrow', 18)],
      [30, item(30, 'hearth_rare_helm', 1, 44)], [32, item(32, 'hearth_rare_bow', 1, 88)], [33, item(33, 'backpack', 1)],
      [34, item(34, 'hearth_rare_shield', 1)], [37, item(37, 'hearth_rare_boots', 1, 9)],
      [38, item(38, 'stone', 3)], [46, item(46, 'fiber', 5)],
    ]);
    return Array.from({ length: 47 }, (_, slot) => occupied.get(slot) ?? item(slot, 'empty', 0));
  };
  const stash = Array.from({ length: 20 }, (_, slot) => slot === 0 ? item(0, 'apple', 9) : slot === 17 ? item(17, 'sword', 1, 12) : item(slot, 'empty', 0));
  const expected = [
    ['hotbar', 0, 'axe', 1, 61, true], ['hotbar', 3, 'torch', 7, 0, false], ['hotbar', 8, 'apple', 12, 0, true],
    ['backpack', 0, 'wood', 40, 0, true], ['backpack', 19, 'arrow', 18, 0, true],
    ['equipment', 1, 'hearth_rare_helm', 1, 44, true], ['equipment', MAIN_HAND_EQUIPMENT_INDEX, 'hearth_rare_bow', 1, 88, true],
    ['equipment', 4, 'backpack', 1, 0, true], ['equipment', 5, 'hearth_rare_shield', 1, 0, true], ['equipment', 8, 'hearth_rare_boots', 1, 9, true],
    ['crafting', 0, 'stone', 3, 0, true], ['crafting', 8, 'fiber', 5, 0, true],
    ['stash', 0, 'apple', 9, 0, true], ['stash', 17, 'sword', 1, 12, true],
  ];

  it.each([
    ['the Main Hand', MAIN_HAND_SELECTED_SLOT, { container: 'equipment', index: MAIN_HAND_EQUIPMENT_INDEX }],
    ['the last old hotbar cell', 8, { container: 'hotbar', index: 8 }],
  ] as const)('moves every item to its cell on connect, keeping equipment and a selection of %s', (_label, selectedSlot, selectedCell) => {
    const result = runInventoryConnection(false, false, { hotbarVersion: 0, equipmentVersion: 0, rows: oldRows(), stash, selectedSlot });
    // Every item, and only items, is a cell: 12 carried plus 2 stash, with exact columns.
    const cells = result.rows.map(row => [row['container'], row['index'], row['itemKind'], row['quantity'], row['durability'], row['lit']]);
    expect(cells.sort((left, right) => `${left[0]}:${String(left[1]).padStart(3, '0')}`.localeCompare(`${right[0]}:${String(right[1]).padStart(3, '0')}`)))
      .toEqual([...expected].sort((left, right) => `${left[0]}:${String(left[1]).padStart(3, '0')}`.localeCompare(`${right[0]}:${String(right[1]).padStart(3, '0')}`)));
    // The move ran once (the second connect returned before reading) and its read-back matched its source fingerprint.
    expect(result.plans).toHaveLength(1);
    const plan = result.plans[0]!;
    const stored = result.rows.map(row => ({ container: row['container'], index: row['index'], itemKind: row['itemKind'], quantity: row['quantity'], durability: row['durability'], lit: row['lit'] }));
    expect(playerContainerCellsFingerprint(stored as never)).toBe(plan.cellsFingerprint);
    expect(plan.counts).toMatchObject({ cells: 14, totalQuantity: 1 + 7 + 12 + 40 + 18 + 1 + 1 + 1 + 1 + 1 + 3 + 5 + 9 + 1 });
    // The release-lane dry run over the untouched nine-slot rows plans exactly the connect path's move.
    expect(result.dryRun?.cellsFingerprint).toBe(plan.cellsFingerprint);
    expect(result.dryRun?.legacyCustodyFingerprint).toBe(plan.legacyCustodyFingerprint);
    expect(result.dryRun?.cells).toEqual(plan.cells);
    // selectedSlot is stored unchanged: appending hotbar cell 9 renumbers no hotbar index, and 33 names the Main Hand.
    expect(result.survival).toMatchObject({ selectedSlot });
    expect(plan.selectedCell).toEqual(selectedCell);
    expect(result.migration).toMatchObject({ hotbarLayoutVersion: 1, equipmentLayoutVersion: CURRENT_EQUIPMENT_LAYOUT_VERSION, containerLayoutVersion: CURRENT_CONTAINER_LAYOUT_VERSION });
    // The legacy steps left the frozen rows on the current 49-slot numbering; the stash rows were only read.
    expect(result.legacyRows).toHaveLength(INVENTORY_SLOT_COUNT);
    expect(result.stash).toHaveLength(20);
    // A second connect is a no-op: no table is written (the first wrote the legacy steps and the version).
    expect(result.firstConnectWrites).toBeGreaterThan(0);
    expect(result.secondConnectWrites).toEqual([]);
  });
});
