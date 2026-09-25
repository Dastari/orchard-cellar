import {describe,expect,it} from 'vitest';
import {residencePlayableTile} from './spaces.js';
import {planHearthArchitectureInventory,planHearthConstructionTransaction} from './hearth-architecture-inventory.js';
import {type ContainerSnapshot,type ItemContainerContentResolver} from './item-containers.js';
import {bootstrapContentRegistry} from './content/bootstrap-registry.js';
import { cellFlags } from './cell-flags.js';
const content:ItemContainerContentResolver={maxStackFor:item=>['wood','stone','copper_piece'].includes(item)?10:null,hasTag:()=>false};
const materialKinds=new Set(['wood','stone','copper_piece']),registry=bootstrapContentRegistry();
function bags():Record<string,ContainerSnapshot>{return {
  hotbar:{id:'hotbar',capacity:2,slots:[{itemKind:'wood',quantity:2},null]},
  backpack:{id:'backpack',capacity:2,slots:[{itemKind:'wood',quantity:4},null]},
  equipment:{id:'equipment',capacity:1,slots:[{itemKind:'copper_piece',quantity:10}]},
};}
describe('construction inventory planning',()=>{
  it('consumes across carried bags and inserts refunds without touching inputs or equipment',()=>{
    const input=bags(),before=JSON.stringify(input),result=planHearthArchitectureInventory(input,{wood:-6,stone:12},content,materialKinds);
    expect(result.failure).toBeNull();if(result.failure!==null)return;
    expect(result.containers.hotbar!.slots).toEqual([{itemKind:'stone',quantity:10},{itemKind:'stone',quantity:2}]);
    expect(result.containers.backpack!.slots).toEqual([null,null]);
    expect(result.containers.equipment).toBe(input.equipment);expect(JSON.stringify(input)).toBe(before);
  });
  it('cannot fund construction from equipment or incompatible metadata',()=>{
    expect(planHearthArchitectureInventory(bags(),{copper_piece:-1},content,materialKinds).failure).toBe('construction_materials_missing');
    const input=bags();input.hotbar={...input.hotbar!,slots:[{itemKind:'wood',quantity:2,lit:false},null]};
    expect(planHearthArchitectureInventory(input,{wood:-6},content,materialKinds).failure).toBe('construction_materials_missing');
  });
  it('rejects full refunds without returning partial consumption or insertion',()=>{
    const input=bags();input.hotbar={id:'hotbar',capacity:1,slots:[{itemKind:'wood',quantity:10}]};
    input.backpack={id:'backpack',capacity:1,slots:[{itemKind:'wood',quantity:10}]};
    const before=JSON.stringify(input);
    expect(planHearthArchitectureInventory(input,{wood:-1,stone:1},content,materialKinds)).toEqual({failure:'construction_refund_inventory_full'});
    expect(JSON.stringify(input)).toBe(before);
  });
  it('uses the live stack limit and respects read-only slots',()=>{
    const input=bags();input.hotbar={...input.hotbar!,restrictions:{0:{readOnly:true},1:{readOnly:true}}};
    expect(planHearthArchitectureInventory(input,{wood:-6},content,materialKinds).failure).toBe('construction_materials_missing');
    const result=planHearthArchitectureInventory(bags(),{stone:6},{...content,maxStackFor:()=>3},materialKinds);
    expect(result.failure).toBeNull();if(result.failure!==null)return;
    expect(result.containers.hotbar!.slots[1]).toEqual({itemKind:'stone',quantity:3});
    expect(result.containers.backpack!.slots[1]).toEqual({itemKind:'stone',quantity:3});
  });
  it('rejects invalid deltas before touching inventory',()=>{
    for(const delta of [{wood:NaN},{wood:1.5},{wood:9000},{bottles:1}])expect(planHearthArchitectureInventory(bags(),delta,content,materialKinds).failure).toBe('invalid_material_delta');
  });
  it('rejects nonempty rows beyond active capacity instead of truncating their contents',()=>{
    const input=bags();input.backpack={...input.backpack!,capacity:1,slots:[null,{itemKind:'stone',quantity:2}]};
    const before=JSON.stringify(input);
    expect(planHearthArchitectureInventory(input,{wood:-1},content,materialKinds).failure).toBe('invalid_inventory');
    expect(JSON.stringify(input)).toBe(before);
  });

  it('returns construction and inventory together or rejects the whole decision',()=>{
    const context={canBuild:true,existing:[],occupants:[],collision:{width:16,height:16,
      blocked:cellFlags(Array.from({length:256},(_,i)=>!residencePlayableTile(i%16,Math.floor(i/16))))}};
    const state={recipeVersion:1 as const,revision:0n,cells:[]};
    const edits=[{tileX:6,tileY:8,replacement:{tileX:6,tileY:8,floor:'rustic' as const}}];
    const built=planHearthConstructionTransaction(registry,{rank:0,state,expectedRevision:0n,edits,context},bags(),content);
    expect(built.failure).toBeNull();if(built.failure!==null)return;
    expect(built.state.revision).toBe(1n);expect(built.containers.hotbar!.slots[0]).toBeNull();
    const full=bags();
    for(const id of ['hotbar','backpack'])full[id]={id,capacity:1,slots:[{itemKind:'stone',quantity:10}]};
    const before=JSON.stringify(built.state.cells);
    const removal=planHearthConstructionTransaction(registry,{rank:0,state:built.state,expectedRevision:1n,
      edits:[{tileX:6,tileY:8}],context},full,content);
    expect(removal).toEqual({failure:'construction_refund_inventory_full'});
    expect(built.state.revision).toBe(1n);expect(JSON.stringify(built.state.cells)).toBe(before);
  });

  it('rejects an unavailable authored recipe before exposing inventory or state changes',()=>{
    const context={canBuild:true,existing:[],occupants:[],collision:{width:16,height:16,
      blocked:cellFlags(Array.from({length:256},(_,i)=>!residencePlayableTile(i%16,Math.floor(i/16))))}},input=bags();
    const before=JSON.stringify(input),missing={...registry,balances:new Map()};
    expect(planHearthConstructionTransaction(missing,{rank:0,state:{recipeVersion:1,revision:0n,cells:[]},expectedRevision:0n,
      edits:[{tileX:6,tileY:8,replacement:{tileX:6,tileY:8,floor:'rustic'}}],context},input,content))
      .toEqual({failure:'construction_material_profile_unavailable'});
    expect(JSON.stringify(input)).toBe(before);
  });

  it('rejects malformed occupied quantities even when they are not being spent',()=>{
    for(const quantity of [0,-1,NaN,1.5]) {
      const input=bags();input.backpack={...input.backpack!,slots:[{itemKind:'stone',quantity},null]};
      expect(planHearthArchitectureInventory(input,{wood:-1},content,materialKinds)).toEqual({failure:'invalid_inventory'});
    }
  });

});
