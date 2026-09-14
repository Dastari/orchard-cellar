import {TILE_SIZE_FIXED} from './state.js';
import {describe,expect,it} from 'vitest';
import {planHearthArchitectureEdits,runtimeResidenceConstructionMaterials,type HearthArchitectureEdit,type HearthArchitectureState} from './hearth-architecture-edits.js';
import {residencePlayableTile} from './spaces.js';
import {bootstrapContentRegistry} from './content/bootstrap-registry.js';
import type {ContentRegistry} from './content/registry.js';
import type {ResidenceConstructionBalanceContentDefinition} from './content/balance-definition.js';
const registry=bootstrapContentRegistry();
const context={canBuild:true,existing:[],occupants:[],collision:{width:16,height:16,
  blocked:Array.from({length:256},(_,i)=>!residencePlayableTile(i%16,Math.floor(i/16)))}};
const initial:HearthArchitectureState={recipeVersion:1,revision:0n,cells:[]};
const floor={tileX:6,tileY:8,floor:'rustic' as const};
function plan(state=initial,edits:readonly HearthArchitectureEdit[]=[{...floor,replacement:floor}],expectedRevision=state.revision,
  content:Pick<ContentRegistry,'balances'|'items'>=registry){
  return planHearthArchitectureEdits(content,{rank:0,state,edits,expectedRevision,context});
}
describe('revisioned construction materials',()=>{
  it('projects all immutable v1 recipes from the active authored profile',()=>{
    expect(runtimeResidenceConstructionMaterials(registry,1)).toEqual({recipeVersion:1,
      itemKinds:['wood','stone','copper_piece'],recipes:{rustic:{wood:2},townhouse:{wood:2,stone:1},
        wall:{wood:4,stone:2},doorway:{wood:4},window:{wood:2,copper_piece:2}}});
  });
  it('charges authored flooring once and does not refund implicit starter floor',()=>{
    const built=plan();expect(built.failure).toBeNull();if(built.failure!==null)return;
    expect(built.materialDelta).toEqual({wood:-2});expect(initial.cells).toEqual([]);
    expect(plan(built.state).failure).toBe('architecture_unchanged');
    expect(planHearthArchitectureEdits(registry,{rank:0,state:initial,expectedRevision:0n,context,edits:[{tileX:6,tileY:8}]}).failure).toBe('architecture_unchanged');
  });
  it('refunds the same materials on removal and rejects repeated removal',()=>{
    const built=plan();if(built.failure!==null)throw new Error(built.failure);
    const removed=planHearthArchitectureEdits(registry,{rank:0,state:built.state,expectedRevision:1n,context,edits:[{tileX:6,tileY:8}]});
    expect(removed.failure).toBeNull();if(removed.failure!==null)return;
    expect(removed.materialDelta).toEqual({wood:2});expect(removed.state.cells).toEqual([]);
    expect(planHearthArchitectureEdits(registry,{rank:0,state:removed.state,expectedRevision:2n,context,edits:[{tileX:6,tileY:8}]}).failure).toBe('architecture_unchanged');
  });
  it('rejects a second builder using the old revision before calculating a debit',()=>{
    const built=plan();if(built.failure!==null)throw new Error(built.failure);
    expect(plan(built.state,[{...floor,replacement:{...floor,floor:'rustic'}}],0n)).toEqual({failure:'architecture_stale'});
  });
  it('nets a finish replacement against its original material value',()=>{
    const built=plan();if(built.failure!==null)throw new Error(built.failure);
    const changed=planHearthArchitectureEdits(registry,{rank:0,state:built.state,expectedRevision:1n,context,
      edits:[{tileX:6,tileY:8,replacement:{...floor,floor:'townhouse'}}]});
    expect(changed.failure).toBeNull();if(changed.failure!==null)return;
    expect(changed.materialDelta).toEqual({stone:-1});
  });
  it('requires window removal before demolishing its supporting wall',()=>{
    const state:HearthArchitectureState={recipeVersion:1,revision:9n,cells:[{tileX:6,tileY:8,partition:'wall',window:true}]};
    expect(planHearthArchitectureEdits(registry,{rank:0,state,expectedRevision:9n,context,edits:[{tileX:6,tileY:8}]}).failure).toBe('remove_window_first');
    const removed=planHearthArchitectureEdits(registry,{rank:0,state,expectedRevision:9n,context,
      edits:[{tileX:6,tileY:8,replacement:{tileX:6,tileY:8,partition:'wall'}}]});
    expect(removed.failure).toBeNull();if(removed.failure!==null)return;
    expect(removed.materialDelta).toEqual({wood:2,copper_piece:2});
  });
  it('rejects duplicate coordinates and an edit that attempts to move its replacement elsewhere',()=>{
    expect(plan(initial,[{...floor,replacement:floor},{...floor,replacement:floor}]).failure).toBe('duplicate_architecture_edit');
    expect(plan(initial,[{...floor,replacement:{...floor,tileX:7}}]).failure).toBe('invalid_architecture_edit');
  });
  it('allows safe removal of an old doorway obstructed by a later fixed counter',()=>{
    const cells=[{tileX:6,tileY:8,partition:'wall' as const},{tileX:7,tileY:8,partition:'doorway' as const},
      {tileX:8,tileY:8,partition:'wall' as const}];
    const state:HearthArchitectureState={recipeVersion:1,revision:4n,cells};
    const unit=TILE_SIZE_FIXED;
    const obstructed={...context,collision:{...context.collision,obstacles:[{
      left:7*unit,top:9*unit,right:8*unit-1,bottom:10*unit-1,
    }]}};
    const result=planHearthArchitectureEdits(registry,{rank:0,state,expectedRevision:4n,context:obstructed,
      edits:cells.map(cell=>({tileX:cell.tileX,tileY:cell.tileY}))});
    expect(result.failure).toBeNull();if(result.failure!==null)return;
    expect(result.materialDelta).toEqual({wood:12,stone:4});
    expect(result.state.cells).toEqual([]);
  });

  it('uses renamed active material item ids without changing recipe quantities',()=>{
    const profile=[...registry.balances.values()].find((definition):definition is ResidenceConstructionBalanceContentDefinition=>(
      'profile' in definition&&definition.profile==='residence_construction'))!;
    const balances=new Map(registry.balances),items=new Map(registry.items);
    const renamedValues=([1,'item:timber','item:masonry','item:metal_piece',...profile.values.slice(4)] as unknown) as ResidenceConstructionBalanceContentDefinition['values'];
    balances.set(profile.id,{...profile,values:renamedValues});
    for(const [from,to] of [['item:wood','item:timber'],['item:stone','item:masonry'],['item:copper_piece','item:metal_piece']] as const){
      const item=items.get(from)!;items.delete(from);items.set(to,{...item,id:to});
    }
    const renamed={...registry,balances,items};
    expect(runtimeResidenceConstructionMaterials(renamed,1)?.recipes.window).toEqual({timber:2,metal_piece:2});
    expect(plan(initial,[{tileX:6,tileY:8,replacement:{tileX:6,tileY:8,partition:'wall',window:true}}],0n,renamed))
      .toMatchObject({failure:null,materialDelta:{timber:-6,masonry:-2,metal_piece:-2}});
  });

  it('fails closed for missing, retired, duplicate, malformed, or unresolved v1 profiles',()=>{
    const profile=[...registry.balances.values()].find((definition):definition is ResidenceConstructionBalanceContentDefinition=>(
      'profile' in definition&&definition.profile==='residence_construction'))!;
    const without=new Map(registry.balances);without.delete(profile.id);
    const cases:Pick<ContentRegistry,'balances'|'items'>[]=[
      {...registry,balances:without},
      {...registry,balances:new Map(registry.balances).set(profile.id,{...profile,retired:true})},
      {...registry,balances:new Map(registry.balances).set('balance:duplicate_recipe',{...profile,id:'balance:duplicate_recipe'})},
      {...registry,balances:new Map(registry.balances).set(profile.id,{...profile,values:[...profile.values.slice(0,4),0,...profile.values.slice(5)] as unknown as typeof profile.values})},
      {...registry,items:new Map([...registry.items].filter(([id])=>id!==profile.values[1]))},
    ];
    for(const content of cases){
      expect(runtimeResidenceConstructionMaterials(content,1)).toBeNull();
      expect(plan(initial,undefined,0n,content)).toEqual({failure:'construction_material_profile_unavailable'});
      expect(initial).toEqual({recipeVersion:1,revision:0n,cells:[]});
    }
  });

});
