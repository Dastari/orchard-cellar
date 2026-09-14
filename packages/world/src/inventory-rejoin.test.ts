import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { HOTBAR_SLOT_COUNT, INVENTORY_SLOT_COUNT, migrateEquipmentLayout, CURRENT_EQUIPMENT_LAYOUT_VERSION } from '@orchard/sim';

const source = ts.createSourceFile('index.ts', readFileSync(new URL('./index.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
const printer = ts.createPrinter();
type Row = Record<string, unknown>;

function table(initial: readonly Row[] = [], key = 'identity') {
  const rows = new Map(initial.map((row) => [row[key], { ...row }]));
  const index = {
    find: (id: unknown) => rows.get(id) ?? null,
    update: (row: Row) => { rows.set(row[key], row); return row; },
    delete: (id: unknown) => rows.delete(id),
  };
  return {
    identity: index, id: index,
    insert: (row: Row) => { rows.set(row[key], row); return row; },
    iter: () => rows.values(), count: () => BigInt(rows.size),
    by_identity: { filter: (identity: unknown) => [...rows.values()].filter((row) => row['identity'] === identity) },
  };
}

/** Execute the actual connection callback through its inventory initialization
 * phase, before unrelated stats/presence writes. No duplicate grant algorithm. */
interface AuthoredLoadoutFixture {
  readonly selectedSlot: number;
  readonly equippedKind: string;
  readonly slots: readonly {
    readonly slot: number;
    readonly itemKind: string;
    readonly quantity: number;
    readonly durability: number;
    readonly lit: boolean;
  }[];
}

const starterLoadout: AuthoredLoadoutFixture = {
  selectedSlot: 0,
  equippedKind: 'axe',
  slots: Array.from({ length: INVENTORY_SLOT_COUNT }, (_, slot) => {
    const items = ['axe', 'pickaxe', 'hoe', 'watering_can', 'bow', 'arrow'];
    const itemKind = items[slot] ?? 'empty';
    return {
      slot,
      itemKind,
      quantity: itemKind === 'empty' ? 0 : itemKind === 'arrow' ? 32 : 1,
      durability: 0,
      lit: true,
    };
  }),
};

function runInventoryConnection(
  newCharacter: boolean,
  occupied = false,
  legacy?: { hotbarVersion: number; rows: readonly Row[] },
  authoredLoadout: AuthoredLoadoutFixture = starterLoadout,
) {
  const sender = { toHexString: () => 'fixture-player' };
  const inventoryRows = legacy?.rows.map(row=>({...row,identity:sender,id:`fixture-player:${row['slot']}`})) ?? (newCharacter ? [] : Array.from({ length: INVENTORY_SLOT_COUNT }, (_, slot) => ({
    id: `fixture-player:${slot}`, identity: sender, slot,
    itemKind: occupied ? 'fiber' : 'empty', quantity: occupied ? 3 : 0, durability: 0, lit: true,
  })));
  const cursor = table([{identity:sender,itemKind:'torch',quantity:1,durability:73,lit:false}]);
  const inventory = table(inventoryRows, 'id');
  const ctx = { sender, db: {
    player_survival: table(newCharacter ? [] : [{ identity: sender }]),
    player_spawn: table(newCharacter ? [] : [{ identity: sender, tileX: 1, tileY: 1, spaceId: 0 }]),
    player_survival_migration: table(newCharacter ? [] : [{ identity: sender, hungerVersion: 1 }]),
    inventory_migration: table(newCharacter ? [] : [{ identity: sender, hotbarLayoutVersion: legacy?.hotbarVersion ?? 1, durabilityVersion: 1, equipmentLayoutVersion: legacy === undefined ? CURRENT_EQUIPMENT_LAYOUT_VERSION : 0 }]),
    inventory_slot: inventory, inventory_cursor: cursor,
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
  const dependencies = {
    prepareConnection: () => ({ connectionId: null, firstLiveConnection: false, firstStatisticSession: false }),
    HOTBAR_SLOT_COUNT, INVENTORY_SLOT_COUNT, migrateEquipmentLayout, CURRENT_EQUIPMENT_LAYOUT_VERSION, CURRENT_HOTBAR_LAYOUT_VERSION: 1,
    hotbarSlotCountForLayoutVersion: (version:number)=>version===0?9:HOTBAR_SLOT_COUNT,
    planNewPlayerLoadout: (_registry: unknown, request: { existingCharacter: boolean }) => request.existingCharacter
      ? { ok: true, apply: false, slots: [] }
      : { ok: true, apply: true, definitionId: 'loadout:fixture', ...authoredLoadout },
    HUNGER_MAX_CENTI: 10000, TOPSIDE_SPACE_ID: 0,
    findSurvivalSpawnTile: () => ({ tileX: 1, tileY: 1 }), storedDurability: () => 0,
    storedLit: () => true, contentRegistry: () => ({}), runtimeDurabilityDefinition: () => null,
    activeWorldPolicyBalance: () => ({ survivalSpawnSearchRadiusTiles: 60 }),
  };
  const javascript = ts.transpileModule(`(ctx) => { ${body} }`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  const connect = new Function(...Object.keys(dependencies), `return ${javascript}`)(...Object.values(dependencies)) as (context: typeof ctx) => void;
  connect(ctx);
  connect(ctx);
  return {
    rows: [...inventory.iter()],
    survival: ctx.db.player_survival.identity.find(sender),
    migration: ctx.db.inventory_migration.identity.find(sender),
    cursor: cursor.identity.find(sender),
  };
}

describe('inventory preservation on reconnect', () => {
  it.each([false, true])('never replenishes spent, sold, or stored-away starter items (occupied=%s)', (occupied) => {
    const {rows} = runInventoryConnection(false, occupied);
    expect(rows).toHaveLength(INVENTORY_SLOT_COUNT);
    expect(rows.every((row) => row['itemKind'] === (occupied ? 'fiber' : 'empty'))).toBe(true);
    expect(rows.reduce((quantity, row) => quantity + Number(row['quantity']), 0)).toBe(occupied ? INVENTORY_SLOT_COUNT * 3 : 0);
  });

  it('creates the initial starter kit once for a new character, then preserves it on reconnect', () => {
    const {rows} = runInventoryConnection(true);
    expect(rows.filter((row) => row['itemKind'] === 'arrow')).toMatchObject([{ quantity: 32 }]);
    expect(rows.filter((row) => row['itemKind'] === 'bow')).toMatchObject([{ quantity: 1 }]);
    expect(rows).toHaveLength(INVENTORY_SLOT_COUNT);
  });

  it('persists arbitrary authored slots and selection without a starter-kind branch', () => {
    const authored: AuthoredLoadoutFixture = {
      selectedSlot: 3,
      equippedKind: 'survey_hatchet',
      slots: Array.from({ length: INVENTORY_SLOT_COUNT }, (_, slot) => slot === 3
        ? { slot, itemKind: 'survey_hatchet', quantity: 1, durability: 777, lit: false }
        : { slot, itemKind: 'empty', quantity: 0, durability: 0, lit: true }),
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
    const {rows,migration,cursor}=runInventoryConnection(false,false,{hotbarVersion,rows:oldRows});
    expect(rows).toHaveLength(49);
    const at=(slot:number)=>rows.find(row=>row['slot']===slot);
    expect(at(10)).toMatchObject({itemKind:'fiber',quantity:23});
    expect(at(33)).toMatchObject({itemKind:'sword',quantity:1,durability:17});
    expect(at(35)).toMatchObject({itemKind:'torch',quantity:1,durability:73,lit:false});
    expect(at(39)).toMatchObject({itemKind:'empty',quantity:0});
    expect(at(40)).toMatchObject({itemKind:'wood',quantity:7});
    expect(at(48)).toMatchObject({itemKind:'stone',quantity:11});
    expect(rows.filter(row=>Number(row['quantity'])>0)).toHaveLength(5);
    expect(cursor).toMatchObject({itemKind:'torch',quantity:1,durability:73,lit:false});
    expect(migration).toMatchObject({durabilityVersion:1,hotbarLayoutVersion:1,equipmentLayoutVersion:1});
  });
});
