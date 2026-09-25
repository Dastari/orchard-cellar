import {HEARTH_FURNITURE_SHAPES} from './hearth-furniture-state.js';
import {describe,expect,it} from 'vitest';
import {composeHearthArchitecture,planHearthArchitecture,type HearthArchitectureCell} from './hearth-architecture.js';
import {residencePlayableTile,residenceEnvelopeSize} from './spaces.js';
import {positionCollides} from './movement.js';
import {TILE_SIZE_FIXED} from './state.js';
import { cellFlags } from './cell-flags.js';
function baseline(rank=0) {
  const size=residenceEnvelopeSize(rank);
  return {width:size,height:size,blocked:cellFlags(Array.from({length:size*size},(_,i)=>!residencePlayableTile(i%size,Math.floor(i/size),rank))),
    obstacles:[{left:4*TILE_SIZE_FIXED,top:5*TILE_SIZE_FIXED,right:5*TILE_SIZE_FIXED-1,bottom:6*TILE_SIZE_FIXED-1}]};
}
describe('modular residence architecture composition',()=>{
  it('changes floor finish without changing collision or mutating source records',()=>{
    const base=baseline(),cells:HearthArchitectureCell[]=[{tileX:8,tileY:11,floor:'townhouse'}];
    const result=composeHearthArchitecture(0,base,cells);expect(result.failure).toBeNull();
    if(result.failure!==null)return;
    expect(result.collision.blocked).toEqual(base.blocked);expect(result.collision.obstacles).toEqual(base.obstacles);
    expect(result.cells).toEqual(cells);expect(result.cells[0]).not.toBe(cells[0]);
  });
  it('gives a wall one physical tile and keeps a supported doorway passable',()=>{
    const cells:HearthArchitectureCell[]=[{tileX:6,tileY:8,partition:'wall',window:true},
      {tileX:7,tileY:8,partition:'doorway'},{tileX:8,tileY:8,partition:'wall'}];
    const base=baseline(),result=composeHearthArchitecture(0,base,cells);expect(result.failure).toBeNull();
    if(result.failure!==null)return;
    expect(positionCollides({x:6.5*TILE_SIZE_FIXED,y:8.5*TILE_SIZE_FIXED},result.collision)).toBe(true);
    expect(positionCollides({x:7.5*TILE_SIZE_FIXED,y:8.5*TILE_SIZE_FIXED},result.collision)).toBe(false);
    expect(base.blocked[8*16+6]).toBe(0);
  });
  it('rejects unpurchased rooms, protected approaches and unsupported attachments',()=>{
    expect(composeHearthArchitecture(0,baseline(),[{tileX:20,tileY:7,floor:'rustic'}]).failure).toBe('outside_purchased_room');
    expect(composeHearthArchitecture(1,baseline(1),[{tileX:14,tileY:9,partition:'wall'}]).failure).toBe('reserved_approach');
    expect(composeHearthArchitecture(0,baseline(),[{tileX:6,tileY:8,window:true}]).failure).toBe('window_requires_wall');
    expect(composeHearthArchitecture(0,baseline(),[{tileX:6,tileY:8,partition:'doorway'}]).failure).toBe('doorway_requires_jambs');
  });
  it('validates a whole replacement so removing window support or door jambs fails',()=>{
    const cells:HearthArchitectureCell[]=[{tileX:6,tileY:8,partition:'wall',window:true},
      {tileX:7,tileY:8,partition:'doorway'},{tileX:8,tileY:8,partition:'wall'}];
    expect(composeHearthArchitecture(0,baseline(),cells.slice(1)).failure).toBe('doorway_requires_jambs');
    expect(composeHearthArchitecture(0,baseline(),[{tileX:6,tileY:8,floor:'rustic',window:true}]).failure).toBe('window_requires_wall');
  });
  it('rejects duplicate and fractional cells without partially changing the baseline',()=>{
    const base=baseline(),before=base.blocked.slice(),cell:HearthArchitectureCell={tileX:6,tileY:8,partition:'wall'};
    expect(composeHearthArchitecture(0,base,[cell,cell]).failure).toBe('duplicate_architecture_cell');
    expect(composeHearthArchitecture(0,base,[{...cell,tileX:6.5}]).failure).toBe('outside_purchased_room');
    expect(base.blocked).toEqual(before);
  });
  it('rejects sealing an empty room and accepts a supported passage through the same partition',()=>{
    const context={canBuild:true,collision:baseline(),existing:[],occupants:[]};
    const wall:HearthArchitectureCell[]=Array.from({length:10},(_,i)=>({tileX:6,tileY:i+3,partition:'wall'}));
    expect(planHearthArchitecture(0,context,wall).failure).toBe('escape_blocked');
    const doorway=wall.map(cell=>(cell.tileY===8||cell.tileY===9)?{...cell,partition:'doorway' as const}:cell);
    expect(planHearthArchitecture(0,context,doorway).failure).toBeNull();
    expect(planHearthArchitecture(0,{...context,canBuild:false},doorway).failure).toBe('builder_required');
  });

  it('rejects physical partitions over immutable furniture and blocked doorway approaches',()=>{
    const base=baseline();
    expect(composeHearthArchitecture(0,base,[{tileX:4,tileY:5,partition:'wall'}]).failure).toBe('architecture_fixed_obstacle');
    const doorway:HearthArchitectureCell[]=[{tileX:3,tileY:5,partition:'wall'},
      {tileX:4,tileY:5,partition:'doorway'},{tileX:5,tileY:5,partition:'wall'}];
    expect(composeHearthArchitecture(0,base,doorway).failure).toBe('architecture_fixed_obstacle');
    const clear=doorway.map(cell=>({...cell,tileY:6}));
    expect(composeHearthArchitecture(0,base,clear).failure).toBe('doorway_approach_blocked');
    expect(composeHearthArchitecture(0,base,[{tileX:4,tileY:5,floor:'townhouse'}]).failure).toBeNull();
  });

  it('checks doorway approaches against movable furniture even if the room has another route',()=>{
    const cells:HearthArchitectureCell[]=[{tileX:6,tileY:8,partition:'wall'},
      {tileX:7,tileY:8,partition:'doorway'},{tileX:8,tileY:8,partition:'wall'}];
    const context={canBuild:true,collision:baseline(),occupants:[],existing:[{id:'cabinet',tileX:7,tileY:9,
      shape:HEARTH_FURNITURE_SHAPES.furniture_rustic_chest!}]};
    expect(planHearthArchitecture(0,context,cells).failure).toBe('doorway_approach_blocked');
  });

  it('keeps a wall attachment supported until it is moved or picked up',()=>{
    const cells:HearthArchitectureCell[]=[{tileX:6,tileY:5,partition:'wall'},{tileX:6,tileY:6,partition:'wall'}];
    const mirror={id:'mirror',tileX:6,tileY:6,shape:HEARTH_FURNITURE_SHAPES.furniture_townhouse_wall_mirror!};
    const context={canBuild:true,collision:baseline(),occupants:[],existing:[mirror]};
    expect(planHearthArchitecture(0,context,cells).failure).toBeNull();
    expect(planHearthArchitecture(0,context,cells.slice(1)).failure).toBe('wall_required');
    expect(planHearthArchitecture(0,context,[]).failure).toBe('wall_required');
    expect(planHearthArchitecture(0,{...context,existing:[]},[]).failure).toBeNull();
  });

});
