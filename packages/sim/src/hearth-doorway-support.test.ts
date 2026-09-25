import {describe,it,expect} from 'vitest';
import {planHearthArchitecture,composeHearthArchitecture,type HearthArchitectureCell} from './hearth-architecture.js';
import {planHearthArchitectureEdits,type HearthArchitectureState} from './hearth-architecture-edits.js';
import {hearthDoorwayWallAttachmentFailure,hearthDoorwayWindowConflicts} from './hearth-doorway-support.js';
import {HEARTH_FURNITURE_SHAPES} from './hearth-furniture-state.js';
import {residencePlayableTile} from './spaces.js';
import {bootstrapContentRegistry} from './content/bootstrap-registry.js';
import { cellFlags } from './cell-flags.js';
const registry=bootstrapContentRegistry();
const context={canBuild:true,existing:[],occupants:[],collision:{width:16,height:16,
  blocked:cellFlags(Array.from({length:256},(_,i)=>!residencePlayableTile(i%16,Math.floor(i/16),0)))}};
const opening=(y=8):HearthArchitectureCell[]=>[{tileX:6,tileY:y,partition:'wall'},
  {tileX:7,tileY:y,partition:'doorway'},{tileX:8,tileY:y,partition:'wall'}];
describe('doorway hardware support reservations',()=>{
  it('rejects window hardware on either jamb but keeps physical collision usable for legacy repair',()=>{
    const cells=opening().map(cell=>({...cell,...(cell.partition==='wall'?{window:true}:{})}));
    expect([...hearthDoorwayWindowConflicts(cells)]).toEqual(['6,8','8,8']);
    expect(composeHearthArchitecture(0,context.collision,cells).failure).toBeNull();
    expect(planHearthArchitecture(0,context,cells).failure).toBe('doorway_support_occupied');
  });
  it('rejects wall ornaments on support cells in construction and later furniture placement',()=>{
    const cells=[...opening(),{tileX:6,tileY:7,partition:'wall' as const}];
    const mirror={id:'mirror',tileX:6,tileY:8,shape:HEARTH_FURNITURE_SHAPES.furniture_townhouse_wall_mirror!};
    expect(planHearthArchitecture(0,{...context,existing:[mirror]},cells).failure).toBe('doorway_support_occupied');
    expect(hearthDoorwayWallAttachmentFailure(cells,[mirror])).toBe('doorway_support_occupied');
    expect(hearthDoorwayWallAttachmentFailure(cells,[{...mirror,tileX:4}])).toBeNull();
  });
  it('repairs paid windows one at a time with exact refunds, while rejecting unrelated edits',()=>{
    let state:HearthArchitectureState={recipeVersion:1,revision:0n,cells:opening().map(cell=>({...cell,...(cell.partition==='wall'?{window:true}:{})}))};
    expect(planHearthArchitectureEdits(registry,{rank:0,state,expectedRevision:0n,context,
      edits:[{tileX:4,tileY:4,replacement:{tileX:4,tileY:4,floor:'rustic'}}]}).failure).toBe('doorway_support_occupied');
    for(const x of [6,8]){
      const result=planHearthArchitectureEdits(registry,{rank:0,state,expectedRevision:state.revision,context,
        edits:[{tileX:x,tileY:8,replacement:{tileX:x,tileY:8,partition:'wall'}}]});
      expect(result.failure).toBeNull();if(result.failure!==null)return;
      expect(result.materialDelta).toEqual({wood:2,copper_piece:2});state=result.state;
    }
    expect(hearthDoorwayWindowConflicts(state.cells).size).toBe(0);expect(state.revision).toBe(2n);
  });
  it('cannot trade old conflicts for a new one even when their total decreases',()=>{
    const state:HearthArchitectureState={recipeVersion:1,revision:0n,cells:[...opening().map(cell=>({...cell,...(cell.partition==='wall'?{window:true}:{})})),...opening(5)]};
    const edits=[6,8].map(x=>({tileX:x,tileY:8,replacement:{tileX:x,tileY:8,partition:'wall' as const}}));
    const result=planHearthArchitectureEdits(registry,{rank:0,state,expectedRevision:0n,context,edits:[...edits,
      {tileX:6,tileY:5,replacement:{tileX:6,tileY:5,partition:'wall',window:true}}]});
    expect(result.failure).toBe('doorway_support_occupied');
  });
});
