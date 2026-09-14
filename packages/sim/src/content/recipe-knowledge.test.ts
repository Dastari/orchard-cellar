import {expect,it} from 'vitest';
import {bootstrapContentRegistry,buildContentRegistry,parseRecipeDefinition,runtimeRecipeDefinition,runtimeMatchingRecipeId} from '../index.js';
const base=bootstrapContentRegistry();
const build=(definitions:readonly {id:string;kind:string}[])=>buildContentRegistry(definitions.map(def=>({id:def.id,kind:def.kind,json:JSON.stringify(def)}))).registry;
const recipe={id:'recipe:a_locked',kind:'recipe',schemaVersion:1,output:{item:'item:plank',count:1},recipeKind:'shapeless',inputs:[{item:'item:wood',count:1}]};
it('strictly parses the opt-in flag and retains it in the runtime recipe',()=>{
 expect(parseRecipeDefinition(recipe).requiresKnowledge).toBeUndefined();
 expect(parseRecipeDefinition({...recipe,requiresKnowledge:false}).requiresKnowledge).toBe(false);
 expect(()=>parseRecipeDefinition({...recipe,requiresKnowledge:'true'})).toThrow();
 const definition=parseRecipeDefinition({...recipe,requiresKnowledge:true});
 const registry=build([...base.definitions.values(),definition]);
 expect(runtimeRecipeDefinition(registry,'a_locked')?.requiresKnowledge).toBe(true);
});
it('does not let an unknown gated match mask a manually available recipe, while honoring explicit selection',()=>{
 const locked=parseRecipeDefinition({...recipe,requiresKnowledge:true});
 const available=parseRecipeDefinition({...recipe,id:'recipe:z_available'});
 const definitions=[...base.definitions.values()].filter(d=>d.kind!=='recipe');
 const registry=build([...definitions,locked,available]);
 const grid={id:'crafting',capacity:1,slots:[{itemKind:'wood',quantity:1}]};
 expect(runtimeMatchingRecipeId(registry,grid,1,null,[])).toBe('z_available');
 expect(runtimeMatchingRecipeId(registry,grid,1,'a_locked',[])).toBe('a_locked');
 expect(runtimeMatchingRecipeId(registry,grid,1,null,['a_locked'])).toBe('a_locked');
 const only=build([...definitions,locked]);
 expect(runtimeMatchingRecipeId(only,grid,1,null,[])).toBe('a_locked');
});
