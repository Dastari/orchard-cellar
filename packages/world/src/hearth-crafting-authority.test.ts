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
function fixture(wood: number, blocked = false, requiresKnowledge = false) {
  // Pins the craft reducer's authority (knowledge, station, batching, output room),
  // not content: the table is a synthetic shapeless 28-wood recipe here, whatever
  // the live shaped pattern is.
  const registry=sim.buildContentRegistry([...sim.bootstrapContentRegistry().definitions.values()].map(def=>def.id==='recipe:furniture_rustic_dining_table'?{id:def.id,kind:def.kind,schemaVersion:1,output:(def as sim.RecipeContentDefinition).output,stationRequirement:{objectTag:'station.workbench'},recipeKind:'shapeless',inputs:[{item:'item:wood',count:28}],...(requiresKnowledge?{requiresKnowledge}:{})}:def).map(def=>({id:def.id,kind:def.kind,json:JSON.stringify(def)}))).registry;
  let learned=false;
  type Row = { id: number; slot: number; itemKind: string; quantity: number; durability: number; lit: boolean };
  const rows = new Map<number, Row>();
  for (const slot of [0, 1, 10, 11, ...Array.from({ length: 9 }, (_, i) => 40 + i)]) rows.set(slot, {
    id: slot, slot, itemKind: slot === 40 ? 'wood' : blocked && slot < 40 ? 'stone' : 'empty',
    quantity: slot === 40 ? wood : blocked && slot < 40 ? 999 : 0, durability: 0, lit: false,
  });
  let cursor: sim.ItemStack | null = null, station = true;
  const updates: Row[] = [];
  const empty = { find: () => null };
  const ctx = { sender: {toHexString:()=> 'alice'}, senderAuth: { jwt: null }, db: {
    player_known_recipe:{id:{find:(id:string)=>learned&&id==='alice:furniture_rustic_dining_table'?{id}:null}},
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
describe('selected furniture crafting authority', () => {
  it('rejects opted-in unknown single and batch recipes without mutations, then accepts the learned bare ID',()=>{
    const f=fixture(57,false,true);
    for(const all of [false,true])expect(()=>f.craft('furniture_rustic_dining_table',all)).toThrow('recipe_knowledge_required');
    expect(f.updates).toEqual([]);expect(f.rows.get(40)?.quantity).toBe(57);expect(f.getCursor()).toBeNull();
    f.setLearned(true);f.craft('furniture_rustic_dining_table');
    expect(f.rows.get(40)?.quantity).toBe(1);
  });
  it('crafts only the requested table across a batch and leaves the spare wood', () => {
    const f = fixture(57); f.craft('furniture_rustic_dining_table');
    expect(f.rows.get(40)?.quantity).toBe(1);
    expect([...f.rows.values()].filter(row => row.itemKind === 'furniture_rustic_dining_table').reduce((n, row) => n + row.quantity, 0)).toBe(2);
    expect([...f.rows.values()].some(row => row.itemKind === 'plank')).toBe(false);
  });
  it('rejects mismatched ingredients and missing station before changing inventory', () => {
    const f = fixture(57);
    expect(() => f.craft('furniture_rustic_chest')).toThrow('recipe_inputs_missing');
    expect(() => f.craft('missing')).toThrow('recipe_inputs_missing');
    f.setStation(false);
    expect(() => f.craft('furniture_rustic_dining_table')).toThrow('station_required');
    expect(f.updates).toEqual([]); expect(f.rows.get(40)?.quantity).toBe(57);
  });
  it('preserves materials when the bag or cursor cannot accept the output', () => {
    const full = fixture(28, true);
    expect(() => full.craft('furniture_rustic_dining_table')).toThrow('recipe_output_blocked');
    expect(full.rows.get(40)?.quantity).toBe(28); expect(full.updates).toEqual([]);
    const cursor = fixture(28); cursor.setCursor({ itemKind: 'stone', quantity: 1 });
    expect(() => cursor.craft('furniture_rustic_dining_table', false)).toThrow('recipe_output_blocked');
    expect(cursor.rows.get(40)?.quantity).toBe(28); expect(cursor.getCursor()).toEqual({ itemKind: 'stone', quantity: 1 });
  });
});
