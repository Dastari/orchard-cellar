import {describe,it,expect} from 'vitest';
import {hearthConstructionToolEdits,hearthConstructionToolFootprint} from './hearth-construction-tools.js';
import {planHearthArchitectureEdits,type HearthArchitectureState} from './hearth-architecture-edits.js';
import {residencePlayableTile} from './spaces.js';
import {bootstrapContentRegistry} from './content/bootstrap-registry.js';
const registry=bootstrapContentRegistry();
const state:HearthArchitectureState={recipeVersion:1,revision:7n,cells:[{tileX:5,tileY:6,floor:'townhouse',partition:'wall',window:true}]};
describe('construction component tools',()=>{
  it('changes flooring without deleting paid wall or window',()=>{
    expect(hearthConstructionToolEdits(state,'rustic',5,6)).toEqual({failure:null,edits:[{tileX:5,tileY:6,replacement:{tileX:5,tileY:6,floor:'rustic',partition:'wall',window:true}}]});
    expect(state.cells[0]?.floor).toBe('townhouse');
  });
  it('requires explicit window removal before replacing its support',()=>{
    expect(hearthConstructionToolEdits(state,'doorway_ns',5,6)).toEqual({failure:'remove_window_first'});
    expect(hearthConstructionToolEdits(state,'remove_partition',5,6)).toEqual({failure:'remove_window_first'});
    expect(hearthConstructionToolEdits(state,'remove_window',5,6)).toEqual({failure:null,edits:[{tileX:5,tileY:6,replacement:{tileX:5,tileY:6,floor:'townhouse',partition:'wall'}}]});
  });
  it('removes only the selected component, deleting a record only when empty',()=>{
    expect(hearthConstructionToolEdits(state,'remove_floor',5,6)).toMatchObject({edits:[{replacement:{partition:'wall',window:true}}]});
    const result=hearthConstructionToolEdits({...state,cells:[{tileX:5,tileY:6,floor:'rustic'}]},'remove_floor',5,6);
    expect(result).toEqual({failure:null,edits:[{tileX:5,tileY:6}]});
  });
  it('keeps the entire preview footprint when a window support rejects the stamp',()=>{
    expect(hearthConstructionToolEdits(state,'doorway_ns',5,6).failure).toBe('remove_window_first');
    expect(hearthConstructionToolFootprint(state,'doorway_ns',5,6)).toEqual([{tileX:4,tileY:6},{tileX:5,tileY:6},{tileX:6,tileY:6}]);
    expect(hearthConstructionToolFootprint(state,'doorway_ew',5,6)).toEqual([{tileX:5,tileY:5},{tileX:5,tileY:6},{tileX:5,tileY:7},{tileX:5,tileY:8}]);
  });
  it('rejects empty repeated edits and unsupported windows',()=>{
    expect(hearthConstructionToolEdits(state,'townhouse',5,6)).toEqual({failure:'architecture_unchanged'});
    expect(hearthConstructionToolEdits(state,'remove_floor',3,3)).toEqual({failure:'architecture_unchanged'});
    expect(hearthConstructionToolEdits(state,'window',3,3)).toEqual({failure:'window_requires_wall'});
  });
  it.each(['doorway_ns','doorway_ew'] as const)('creates and removes an entire %s opening through the real planner',tool=>{
    const context={canBuild:true,existing:[],occupants:[],collision:{width:16,height:16,
      blocked:Array.from({length:256},(_,i)=>!residencePlayableTile(i%16,Math.floor(i/16),0))}};
    const initial:HearthArchitectureState={recipeVersion:1,revision:0n,cells:[{tileX:6,tileY:8,floor:'townhouse'}]};
    const stamp=hearthConstructionToolEdits(initial,tool,6,8);
    expect(stamp.failure).toBeNull();if(stamp.failure!==null)return;
    expect(stamp.edits).toHaveLength(tool==='doorway_ns'?3:4);
    const built=planHearthArchitectureEdits(registry,{rank:0,state:initial,expectedRevision:0n,context,edits:stamp.edits});
    expect(built.failure).toBeNull();if(built.failure!==null)return;
    expect(built.state.cells.find(cell=>cell.tileX===6&&cell.tileY===8)?.floor).toBe('townhouse');
    expect(built.materialDelta).toEqual({wood:tool==='doorway_ns'?-12:-16,stone:-4});
    const removal=hearthConstructionToolEdits(built.state,'remove_partition',6,tool==='doorway_ns'?8:9);
    expect(removal.failure).toBeNull();if(removal.failure!==null)return;
    expect(removal.edits).toHaveLength(tool==='doorway_ns'?1:2);
    const removed=planHearthArchitectureEdits(registry,{rank:0,state:built.state,expectedRevision:1n,context,edits:removal.edits});
    expect(removed.failure).toBeNull();if(removed.failure!==null)return;
    expect(removed.state.cells.some(cell=>cell.partition==='doorway')).toBe(false);
    expect(removed.state.cells.find(cell=>cell.tileX===6&&cell.tileY===8)?.floor).toBe('townhouse');
    expect(removed.materialDelta).toEqual({wood:tool==='doorway_ns'?4:8});
  });

});
