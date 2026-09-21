import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import * as sim from '@orchard/sim';
const source = ts.createSourceFile('index.ts', readFileSync(new URL('./index.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
const statement = source.statements.filter(ts.isVariableStatement).flatMap(node => node.declarationList.declarations)
  .find(node => node.name.getText(source) === 'craftInventoryRecipe')!;
if (!statement.initializer || !ts.isCallExpression(statement.initializer)) throw new Error('missing reducer');
const callback = statement.initializer.arguments.find(ts.isArrowFunction)!;
const code = ts.transpileModule(`return (${callback.getText(source)});`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
function fixture(recipeId: string) {
  const registry=sim.bootstrapContentRegistry();
  const recipe=sim.runtimeRecipeDefinition(registry,recipeId)!;
  if(recipe.kind!=='shapeless')throw new Error('fixture requires shapeless recipe');
  const ingredients=Object.keys(recipe.inputs);
  let learned=false;
  type Row = { id: number; slot: number; itemKind: string; quantity: number; durability: number; lit: boolean };
  const rows = new Map<number, Row>();
  for (const slot of [0, 1, 10, 11, ...Array.from({ length: 9 }, (_, i) => 40 + i)]) rows.set(slot, {
    id: slot, slot, itemKind: ingredients[slot-40]??'empty',
    quantity: ingredients[slot-40]?2:0, durability: 0, lit: false,
  });
  let cursor: sim.ItemStack | null = null, station = true;
  const updates: Row[] = [];
  const empty = { find: () => null };
  const ctx = { sender: {toHexString:()=> 'alice'}, senderAuth: { jwt: null }, db: {
    player_known_recipe:{id:{find:(id:string)=>learned&&id===`alice:${recipeId}`?{id}:null}},
    membership: { identity: empty }, world_clock: { id: empty },
    inventory_slot: { by_identity: { filter: () => [...rows.values()] }, id: { update: (row: Row) => { rows.set(row.id, row); updates.push(row); } } },
    player_position: { identity: { find: () => ({ spaceId: 1, x: 5 * sim.TILE_SIZE_FIXED, y: 5 * sim.TILE_SIZE_FIXED }) } },
    world_placeable: { by_chunk: { filter: () => station ? [{ spaceId: 1, tileX: 5, tileY: 5, kind: 'workbench' }] : [] } },
  } };
  const dependencies = { ...sim, SenderError: Error, requireAuthorizedSender: () => {}, requirePersistentInventoryAvailable: () => {},
    contentRegistry: () => registry, activeWorldPolicyBalance: () => sim.runtimeWorldPolicyBalance(registry), equippedInventoryCapacity: () => 2,
    accessibleInventoryContainerCapacity: (id: string) => id === 'crafting' ? 9 : 2,
    inventorySlotOffset: (id: string) => id === 'crafting' ? 40 : id === 'backpack' ? 10 : 0,
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
