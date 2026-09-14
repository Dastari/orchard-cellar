import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { HOTBAR_SLOT_COUNT, INVENTORY_SLOT_COUNT } from '@orchard/sim';

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
function runInventoryConnection(newCharacter: boolean, occupied = false) {
  const sender = { toHexString: () => 'fixture-player' };
  const inventoryRows = newCharacter ? [] : Array.from({ length: INVENTORY_SLOT_COUNT }, (_, slot) => ({
    id: `fixture-player:${slot}`, identity: sender, slot,
    itemKind: occupied ? 'fiber' : 'empty', quantity: occupied ? 3 : 0, durability: 0, lit: true,
  }));
  const inventory = table(inventoryRows, 'id');
  const ctx = { sender, db: {
    player_survival: table(newCharacter ? [] : [{ identity: sender }]),
    player_spawn: table(newCharacter ? [] : [{ identity: sender, tileX: 1, tileY: 1, spaceId: 0 }]),
    player_survival_migration: table(newCharacter ? [] : [{ identity: sender, hungerVersion: 1 }]),
    inventory_migration: table(newCharacter ? [] : [{ identity: sender, hotbarLayoutVersion: 1, durabilityVersion: 1 }]),
    inventory_slot: inventory,
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
    HOTBAR_SLOT_COUNT, INVENTORY_SLOT_COUNT, CURRENT_HOTBAR_LAYOUT_VERSION: 1,
    STARTER_HOTBAR_ITEMS: ['axe', 'pickaxe', 'hoe', 'watering_can', 'bow', 'arrow'],
    STARTER_ITEM_QUANTITIES: { arrow: 32 }, HUNGER_MAX_CENTI: 10000, TOPSIDE_SPACE_ID: 0,
    findSurvivalSpawnTile: () => ({ tileX: 1, tileY: 1 }), storedDurability: () => 0,
    storedLit: () => true, contentRegistry: () => ({}), runtimeDurabilityDefinition: () => null,
  };
  const javascript = ts.transpileModule(`(ctx) => { ${body} }`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  const connect = new Function(...Object.keys(dependencies), `return ${javascript}`)(...Object.values(dependencies)) as (context: typeof ctx) => void;
  connect(ctx);
  connect(ctx);
  return [...inventory.iter()];
}

describe('inventory preservation on reconnect', () => {
  it.each([false, true])('never replenishes spent, sold, or stored-away starter items (occupied=%s)', (occupied) => {
    const rows = runInventoryConnection(false, occupied);
    expect(rows).toHaveLength(INVENTORY_SLOT_COUNT);
    expect(rows.every((row) => row['itemKind'] === (occupied ? 'fiber' : 'empty'))).toBe(true);
    expect(rows.reduce((quantity, row) => quantity + Number(row['quantity']), 0)).toBe(occupied ? INVENTORY_SLOT_COUNT * 3 : 0);
  });

  it('creates the initial starter kit once for a new character, then preserves it on reconnect', () => {
    const rows = runInventoryConnection(true);
    expect(rows.filter((row) => row['itemKind'] === 'arrow')).toMatchObject([{ quantity: 32 }]);
    expect(rows.filter((row) => row['itemKind'] === 'bow')).toMatchObject([{ quantity: 1 }]);
    expect(rows).toHaveLength(INVENTORY_SLOT_COUNT);
  });
});
