import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import * as sim from '@orchard/sim';
import { PLAYER_CELL_HELPER_NAMES, currentContainerLayout, legacySlotCellTable, playerCellDependencies } from './player-cells.fixture.js';

// Real reducer and inventory adapters, with in-memory row storage. Merchant
// admission, authentication and stat settlement are boundaries covered elsewhere.
const source = ts.createSourceFile('index.ts', readFileSync(new URL('./index.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
function declaration(name: string): string {
  for (const node of source.statements) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) return node.getText(source);
    if (ts.isVariableStatement(node)) for (const row of node.declarationList.declarations) {
      if (row.name.getText(source) !== name || !row.initializer || !ts.isCallExpression(row.initializer)) continue;
      const callback = row.initializer.arguments.find(ts.isArrowFunction);
      if (callback) return `const ${name}=${callback.getText(source)};`;
    }
  }
  throw new Error(`missing production declaration:${name}`);
}
const names = ['inventoryContainerCapacity', 'accessibleInventoryContainerCapacity',
  'storedStack', 'storedDurability', 'storedLit', 'sameStoredStack', 'loadPlayerInventory',
  'writePlayerInventory', 'unlockHearthLegendaryRecipe', ...PLAYER_CELL_HELPER_NAMES];
const code = ts.transpileModule(names.map(declaration).join('\n') + '\nreturn unlockHearthLegendaryRecipe;', {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
const registry = sim.bootstrapContentRegistry();
function fixture() {
  const sender = { toHexString: () => 'alice' };
  type Row = { id: string; identity: typeof sender; slot: number; itemKind: string; quantity: number; durability: number; lit: boolean };
  const rows = new Map<number, Row>();
  const writes: string[] = [];
  const overflow: Array<{ itemKind: string; quantity: number; durability: number; lit: boolean }> = [];
  const known = new Map<string, { id: string; recipeId: string }>();
  const put = (slot: number, itemKind: string, quantity: number, durability = 0, lit = false) => {
    rows.set(slot, { id: `alice:${slot}`, identity: sender, slot, itemKind, quantity, durability, lit });
  };
  const hidden = sim.BACKPACK_SLOT_OFFSET + sim.BASE_BACKPACK_CAPACITY;
  put(0, 'guardian_seal', 1, 0, false);
  put(1, 'wood', 5, 0, true);
  put(sim.BACKPACK_SLOT_OFFSET, 'guardian_seal', 5, 0, false);
  put(hidden, 'guardian_seal', 99, 9, true);
  put(sim.CRAFTING_SLOT_OFFSET, 'guardian_seal', 99, 0, true);
  // Every stored cell write is logged by its legacy slot: a vacated cell is now a delete, not an 'empty' row update.
  const cells = legacySlotCellTable(rows, sender);
  const slotOfId = (id: string) => {
    const cell = sim.parsePlayerContainerCellKey(id)!;
    return sim.cellToLegacyGlobalSlot({ container: cell.container, index: cell.index });
  };
  // The fixture serves only occupied cells; a stored seal row with quantity 0 (malformed raw metadata, which the
  // production build keeps as a vacant stored row) is served too, so its validation stays under test.
  const zeroQuantityCells = () => [...rows.values()].filter(row => row.itemKind !== 'empty' && row.quantity === 0).map(row => {
    const cell = sim.legacyGlobalSlotToCell(row.slot)!;
    return { ...row, id: sim.playerContainerCellKey('alice', cell), container: cell.container, index: cell.index };
  });
  const { filter: byIdentity } = cells.by_identity, { filter: byContainer } = cells.by_identity_container, find = cells.id.find;
  cells.by_identity.filter = who => [...byIdentity(who), ...zeroQuantityCells()];
  cells.by_identity_container.filter = ([who, container]) => [...byContainer([who, container]),
    ...zeroQuantityCells().filter(cell => cell.container === container)];
  cells.id.find = id => find(id) ?? zeroQuantityCells().find(cell => cell.id === id) ?? null;
  const { update, delete: remove } = cells.id, insert = cells.insert;
  cells.id.update = row => { writes.push(`update:${slotOfId(row.id)}`); return update(row); };
  cells.id.delete = id => { writes.push(`delete:${slotOfId(id)}`); return remove(id); };
  cells.insert = row => { writes.push(`insert:${slotOfId(row.id)}`); return insert(row); };
  const ctx = { sender, senderAuth: { jwt: null }, db: {
    membership: { identity: { find: () => null } },
    world_clock: { id: { find: () => ({ authorityTick: 42n }) } },
    player_container_cell: cells, inventory_migration: currentContainerLayout(sender),
    inventory_overflow: { insert: (row: typeof overflow[number]) => { overflow.push(row); writes.push(`overflow:${row.itemKind}`); return row; } },
    inventory_overflow_retry: { identity: { find: () => null } },
    player_known_recipe: {
      id: { find: (id: string) => known.get(id) ?? null },
      insert: (row: { id: string; recipeId: string }) => { known.set(row.id, row); writes.push('knowledge'); },
    },
  } };
  const dependencies = { ...sim, ...playerCellDependencies, SenderError: Error, DEFAULT_BACKPACK_CAPACITY: sim.BASE_BACKPACK_CAPACITY,
    contentRegistry: () => registry, requireAuthorizedSender: () => {}, requirePersistentInventoryAvailable: () => {},
    activeMerchantSession: () => ({ active: { npcId: BigInt(registry.npcs.get('npc:willow_archivist')!.runtimeId) } }),
    advancePlayerStats: () => ({ healthCenti: 100 }), mountedNpcFor: () => null, handsOccupiedFor: () => false,
    equippedInventoryCapacity: () => sim.BASE_BACKPACK_CAPACITY, playerDebugBackpackSlots: () => 0,
    updateEquippedFromInventory: () => {}, refreshSenderQuestsFromInventory: () => {}, recordPlayerStatistic: () => {},
  };
  const unlock = new Function(...Object.keys(dependencies), code)(...Object.values(dependencies));
  return { rows, writes, known, put, hidden, overflow,
    snapshot: () => [...rows].map(([slot, row]) => [slot, { ...row }]),
    use: () => unlock(ctx, { recipeId: 'hearth_legendary_sword', expectedContentHash: registry.contentHash, expectedSeals: 3 }),
  };
}

describe('guardian-seal exchange production inventory adapters', () => {
  it('consumes exact accessible split stacks, preserves lit and unrelated rows, moves hidden rows intact to overflow, and cannot charge a retry', () => {
    const f = fixture(), hidden = { ...f.rows.get(f.hidden)! }, crafting = { ...f.rows.get(sim.CRAFTING_SLOT_OFFSET)! };
    f.use();
    expect(f.rows.get(0)).toMatchObject({ itemKind: 'empty', quantity: 0, durability: 0 });
    expect(f.rows.get(sim.BACKPACK_SLOT_OFFSET)).toMatchObject({ itemKind: 'guardian_seal', quantity: 3, durability: 0, lit: false });
    expect(f.rows.get(1)).toMatchObject({ itemKind: 'wood', quantity: 5, lit: true });
    // A backpack cell past the accessible capacity is never paid from; the write spills it, with its exact stored
    // columns, to overflow custody (the drain returns it as space opens) instead of leaving it stranded in the cell.
    expect(f.rows.get(f.hidden)).toMatchObject({ itemKind: 'empty', quantity: 0 });
    expect(f.overflow).toEqual([{ id: 0n, identity: hidden.identity, itemKind: hidden.itemKind, quantity: hidden.quantity,
      durability: hidden.durability, lit: hidden.lit }]);
    expect(f.rows.get(sim.CRAFTING_SLOT_OFFSET)).toEqual(crafting);
    expect(f.writes).toEqual(['delete:0', `update:${sim.BACKPACK_SLOT_OFFSET}`, `delete:${f.hidden}`, 'overflow:guardian_seal', 'knowledge']);
    const before = f.snapshot();
    expect(() => f.use()).toThrow('recipe_already_known');
    expect(f.snapshot()).toEqual(before);
    expect(f.known.size).toBe(1);
  });
  it('rejects malformed raw accessible seal metadata before normalization can hide it', () => {
    for (const [quantity, durability] of [[3, 1], [0, 0], [100, 0]]) {
      const f = fixture(); f.put(0, 'guardian_seal', quantity!, durability!);
      const before = f.snapshot();
      expect(() => f.use(), `quantity=${quantity},durability=${durability}`).toThrow('seal_inventory_invalid');
      expect(f.snapshot()).toEqual(before); expect(f.writes).toEqual([]); expect(f.known.size).toBe(0);
    }
  });
  it('does not pay from hidden backpack overflow or the crafting grid when accessible seals are short', () => {
    const f = fixture(); f.put(sim.BACKPACK_SLOT_OFFSET, 'guardian_seal', 1);
    const before = f.snapshot();
    expect(() => f.use()).toThrow('guardian_seals_missing');
    expect(f.snapshot()).toEqual(before); expect(f.writes).toEqual([]); expect(f.known.size).toBe(0);
  });
});
