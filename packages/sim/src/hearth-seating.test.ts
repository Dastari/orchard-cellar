import {describe,it,expect} from 'vitest';
import {planHearthSeating} from './hearth-seating.js';
import {type HearthFurniturePlacement} from './hearth-furniture-placement.js';
import {HEARTH_FURNITURE_SHAPES} from './hearth-furniture-state.js';
import {TILE_SIZE_FIXED as U,FIXED_UNITS_PER_PIXEL as P} from './state.js';
const collision={width:16,height:16,blocked:new Uint8Array(256),elevations:new Int16Array(256)};
const chair:HearthFurniturePlacement={id:'1',shape:HEARTH_FURNITURE_SHAPES.furniture_rustic_chair!,tileX:7,tileY:7};
const input={seat:chair,furniture:[chair],collision,actor:{x:7.5*U,y:9*U},occupants:[],seatOccupied:false};
describe('furniture seating admission geometry',()=>{
  it.each(Object.values(HEARTH_FURNITURE_SHAPES).filter(shape=>shape.seatPoseOffsetPixels!==undefined).map(shape=>shape.id))('%s admits an unobstructed approach and safe stand destination',kind=>{
    const seat={...chair,shape:HEARTH_FURNITURE_SHAPES[kind]!};
    const plan=planHearthSeating({...input,seat,furniture:[seat]});
    expect(plan.failure).toBeNull();
    if(plan.failure===null){expect(plan.facing).toBe('down');expect(plan.stand.y).toBeGreaterThan(plan.seated.y);}
  });
  it('rejects another occupant and non-seat furniture before snapping',()=>{
    expect(planHearthSeating({...input,seatOccupied:true}).failure).toBe('seat_occupied');
    expect(planHearthSeating({...input,seat:{...chair,shape:HEARTH_FURNITURE_SHAPES.furniture_rustic_dining_table!}}).failure).toBe('not_a_seat');
    expect(planHearthSeating({...input,occupants:[{x:7.5*U,y:8*U+6*P}]}).failure).toBe('seat_blocked');
  });
  it('cannot snap through walls or other furniture',()=>{
    const blocked=collision.blocked.slice();blocked[8*16+7] = 1;
    expect(planHearthSeating({...input,collision:{...collision,blocked}}).failure).toBe('seat_blocked');
    const table={...chair,id:'2',shape:HEARTH_FURNITURE_SHAPES.furniture_rustic_dining_table!,tileY:8};
    expect(planHearthSeating({...input,furniture:[chair,table]}).failure).toBe('seat_blocked');
    expect(planHearthSeating({...input,actor:{x:0,y:0}}).failure).toBe('seat_out_of_reach');
  });
  it('refuses a seat without a clear full-body standing destination',()=>{
    const blocked=new Uint8Array(256).fill(1);blocked[7*16+7] = 0;
    expect(planHearthSeating({...input,actor:{x:7.5*U,y:8*U+6*P},collision:{...collision,blocked}}).failure).toBe('stand_blocked');
  });
  it('finds a different stand destination if the southern spot becomes occupied',()=>{
    const first=planHearthSeating(input);expect(first.failure).toBeNull();
    if(first.failure!==null)return;
    const plan=planHearthSeating({...input,actor:first.seated,occupants:[first.stand]});
    expect(plan.failure).toBeNull();if(plan.failure===null)expect(plan.stand).not.toEqual(first.stand);
  });
});
