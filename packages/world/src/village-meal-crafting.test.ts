import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import * as sim from '@orchard/sim';
import { currentContainerLayout, legacySlotCellTable, playerCellDependencies } from './player-cells.fixture.js';
const source = ts.createSourceFile('index.ts', readFileSync(new URL('./index.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
const statement = source.statements.filter(ts.isVariableStatement).flatMap(node => node.declarationList.declarations)
  .find(node => node.name.getText(source) === 'craftInventoryRecipe')!;
if (!statement.initializer || !ts.isCallExpression(statement.initializer)) throw new Error('missing reducer');
const callback = statement.initializer.arguments.find(ts.isArrowFunction)!;
// The reducer reads and writes carried storage through the production sparse-cell helpers.
const helpers = ['loadPlayerInventory', 'writePlayerInventory', 'withSenderErrors', 'requirePlayerContainerCells'].map(name => {
  const node = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  if (!node) throw new Error(`Missing ${name}`);
  return node.getText(source);
}).join('\n');
const code = ts.transpileModule(`${helpers}\nreturn (${callback.getText(source)});`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
function fixture(recipeId: string) {
  const registry=sim.bootstrapContentRegistry();
  const recipe=sim.runtimeRecipeDefinition(registry,recipeId)!;
  if(recipe.kind!=='shapeless')throw new Error('fixture requires shapeless recipe');
  const ingredients=Object.keys(recipe.inputs);
  let learned=false;
  type Row = { id: string; slot: number; itemKind: string; quantity: number; durability: number; lit: boolean };
  const rows = new Map<number, Row>();
  for (const slot of [0, 1, 10, 11, ...Array.from({ length: 9 }, (_, i) => 40 + i)]) rows.set(slot, {
    id: `alice:${slot}`, slot, itemKind: ingredients[slot-40]??'empty',
    quantity: ingredients[slot-40]?2:0, durability: 0, lit: false,
  });
  let cursor: sim.ItemStack | null = null, station = true;
  const updates: unknown[] = [];
  const empty = { find: () => null };
  const sender = {toHexString:()=> 'alice'};
  // Every cell write (insert, update or delete) is recorded, as the legacy slot updates were.
  const cells = legacySlotCellTable(rows, sender);
  const recordedCells = { ...cells,
    insert: (row: Parameters<typeof cells.insert>[0]) => { updates.push(row); return cells.insert(row); },
    id: { ...cells.id,
      update: (row: Parameters<typeof cells.id.update>[0]) => { updates.push(row); return cells.id.update(row); },
      delete: (id: string) => { updates.push(id); return cells.id.delete(id); } } };
  const ctx = { sender, senderAuth: { jwt: null }, db: {
    player_known_recipe:{id:{find:(id:string)=>learned&&id===`alice:${recipeId}`?{id}:null}},
    membership: { identity: empty }, world_clock: { id: empty },
    player_container_cell: recordedCells, inventory_migration: currentContainerLayout(sender),
    inventory_overflow_retry: { identity: empty },
    player_position: { identity: { find: () => ({ spaceId: 1, x: 5 * sim.TILE_SIZE_FIXED, y: 5 * sim.TILE_SIZE_FIXED }) } },
    world_placeable: { by_chunk: { filter: () => station ? [{ spaceId: 1, tileX: 5, tileY: 5, kind: 'workbench' }] : [] } },
  } };
  const dependencies = { ...sim, ...playerCellDependencies, SenderError: Error, DEFAULT_BACKPACK_CAPACITY: sim.BASE_BACKPACK_CAPACITY, requireAuthorizedSender: () => {}, requirePersistentInventoryAvailable: () => {},
    contentRegistry: () => registry, activeWorldPolicyBalance: () => sim.runtimeWorldPolicyBalance(registry), equippedInventoryCapacity: () => 2,
    accessibleInventoryContainerCapacity: (id: string) => id === 'crafting' ? 9 : 2,
    playerDebugBackpackSlots: () => 0, playerSkillRanks: () => ({}),
    storedStack: (_ctx: unknown, itemKind: string, quantity: number) => itemKind === 'empty' ? null : { itemKind, quantity },
    storedDurability: () => 0, storedLit: () => false,
    playerInventoryCursor: () => cursor, writePlayerInventoryCursor: (_ctx: unknown, _identity: unknown, next: sim.ItemStack | null) => { cursor = next; },
    sameStoredStack: (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b),
    merchantContent: () => sim.BOOTSTRAP_ITEM_CONTAINER_CONTENT, updateEquippedForIdentity: () => {}, recordPlayerStatistic: () => {},
  };
  const craft = new Function(...Object.keys(dependencies), code)(...Object.values(dependencies));
  return { rows, updates, craft: (recipeId: string, craftAll = true) => craft(ctx, { recipeId, craftAll }),
    setLearned:(value:boolean)=>{learned=value;},
    setStation: (value: boolean) => { station = value; }, setCursor: (value: sim.ItemStack) => { cursor = value; }, getCursor: () => cursor };
}

describe('village milestone meal crafting authority',()=>{
  it('requires learned knowledge for both single and batch crafting, then consumes exact ingredients',()=>{
    for(const recipeId of ['pantry_lunch','cellar_supper'])for(const all of [false,true]){
      const f=fixture(recipeId);
      expect(()=>f.craft(recipeId,all)).toThrow('recipe_knowledge_required');
      expect(f.updates).toEqual([]);expect(f.rows.get(40)?.quantity).toBe(2);expect(f.rows.get(41)?.quantity).toBe(2);
      f.setLearned(true);f.craft(recipeId,all);
      if(all){
        expect(f.rows.get(40)?.quantity).toBe(0);expect(f.rows.get(41)?.quantity).toBe(0);
        expect([...f.rows.values()].filter(row=>row.itemKind===recipeId).reduce((sum,row)=>sum+row.quantity,0)).toBe(2);
      }else{
        expect(f.rows.get(40)?.quantity).toBe(1);expect(f.rows.get(41)?.quantity).toBe(1);
        expect(f.getCursor()).toEqual({itemKind:recipeId,quantity:1});
      }
    }
  });
});
