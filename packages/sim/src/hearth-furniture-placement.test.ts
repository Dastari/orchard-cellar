import {describe,it,expect} from 'vitest';
import {hearthFurniturePlacementFailure,hearthFurnitureHasAttachments,hearthFurnitureObstacle,hearthFurnitureCells,hearthFurniturePresentationAnchor,type HearthFurniturePlacement,type HearthFurniturePlacementContext} from './hearth-furniture-placement.js';
import {TILE_SIZE_FIXED} from './state.js';
import { cellFlags } from './cell-flags.js';
const table:HearthFurniturePlacement={id:'table',tileX:5,tileY:5,shape:{id:'table',layer:'standing',width:3,height:2,base:{halfWidth:22,depth:16},tabletopSurface:{insetLeft:0,insetTop:0,width:3,height:1,liftPixels:20}}};
function room():HearthFurniturePlacementContext{
  return {canBuild:true,collision:{width:12,height:12,blocked:cellFlags(Array.from({length:144},(_,i)=>i%12===0||i%12===11||i<12||i>=132))},
    existing:[],reserved:[{tileX:6,tileY:10}],exit:{tileX:6,tileY:10},occupants:[{x:6.5*TILE_SIZE_FIXED,y:8.5*TILE_SIZE_FIXED}]};
}
describe('shared interior furniture placement',()=>{
  it('allows normal furniture with a clear central escape route',()=>{
    expect(hearthFurniturePlacementFailure(room(),table)).toBeNull();
  });
  it('allows a rug under a table but rejects a second standing object there',()=>{
    const context={...room(),existing:[table]};
    expect(hearthFurniturePlacementFailure(context,{...table,id:'rug',shape:{id:'rug',layer:'floor',width:3,height:3}})).toBeNull();
    expect(hearthFurniturePlacementFailure(context,{...table,id:'second'})).toBe('furniture_overlap');
  });
  it('requires a real containing tabletop support and preserves attachment dependency',()=>{
    const context={...room(),existing:[table]};
    const lamp:HearthFurniturePlacement={id:'lamp',tileX:5,tileY:4,shape:{id:'lamp',layer:'tabletop',width:1,height:1},supportId:'table'};
    expect(hearthFurniturePlacementFailure(context,lamp)).toBeNull();
    expect(hearthFurniturePresentationAnchor(lamp,[table])).toEqual({x:88,y:76});
    expect(hearthFurniturePresentationAnchor(lamp,[])).toBeNull();
    expect(hearthFurniturePlacementFailure(room(),lamp)).toBe('tabletop_support_required');
    expect(hearthFurniturePlacementFailure(context,{...lamp,tileY:5})).toBe('tabletop_support_required');
    expect(hearthFurniturePlacementFailure(context,{...lamp,tileX:8})).toBe('tabletop_support_required');
    expect(hearthFurnitureHasAttachments('table',[table,lamp])).toBe(true);
    expect(hearthFurnitureHasAttachments('lamp',[table,lamp])).toBe(false);
  });
  it('allows the wall mirror only on actual wall cells',()=>{
    const context=room(),blocked=context.collision.blocked.slice();
    for(let i=0;i<36;i++)blocked[i] = 1;
    const walls={...context,collision:{...context.collision,blocked}};
    const mirror:HearthFurniturePlacement={id:'mirror',tileX:5,tileY:2,shape:{id:'mirror',layer:'wall',width:1,height:2}};
    expect(hearthFurniturePlacementFailure(walls,mirror)).toBeNull();
    expect(hearthFurniturePlacementFailure(walls,{...mirror,tileY:5})).toBe('wall_required');
    expect(hearthFurniturePlacementFailure(walls,{...mirror,tileX:0,tileY:5})).toBe('wall_required');
  });
  it('rejects non-builders, bounds, portals, current occupants and unsupported coordinates before placement',()=>{
    expect(hearthFurniturePlacementFailure({...room(),canBuild:false},table)).toBe('builder_required');
    expect(hearthFurniturePlacementFailure(room(),{...table,tileX:0})).toBe('outside_residence');
    expect(hearthFurniturePlacementFailure(room(),{...table,tileX:6,tileY:10})).toBe('reserved_approach');
    expect(hearthFurniturePlacementFailure(room(),{...table,tileX:6,tileY:8})).toBe('occupant_blocked');
    expect(hearthFurniturePlacementFailure(room(),{...table,tileX:NaN})).toBe('invalid_placement');
  });
  it('rejects projected wall cells and fixed counter bases even when ordinary floor is clear',()=>{
    const context=room(),terrainPlaneBlocked=new Uint8Array(144);terrainPlaneBlocked[5*12+5]=1;
    expect(hearthFurniturePlacementFailure({...context,collision:{...context.collision,terrainPlaneBlocked}},table)).toBe('outside_residence');
    const obstacle=hearthFurnitureObstacle(table)!;
    expect(hearthFurniturePlacementFailure({...context,collision:{...context.collision,obstacles:[obstacle]}},table)).toBe('furniture_overlap');
    const rug={...table,shape:{id:'rug',layer:'floor' as const,width:3,height:3}};
    expect(hearthFurniturePlacementFailure({...context,collision:{...context.collision,terrainPlaneBlocked}},rug)).toBe('outside_residence');
  });
  it('centres even-width bases inside their reserved cells and rejects oversized or nonfinite bases',()=>{
    const item={...table,shape:{...table.shape,width:2,tabletopSurface:{insetLeft:0,insetTop:0,width:2,height:1,liftPixels:20},base:{halfWidth:16,depth:16}}};
    const cells=hearthFurnitureCells(item),base=hearthFurnitureObstacle(item)!;
    expect(base.left).toBe(Math.min(...cells.map(cell=>cell.tileX))*TILE_SIZE_FIXED);
    expect(base.right).toBe((Math.max(...cells.map(cell=>cell.tileX))+1)*TILE_SIZE_FIXED-1);
    for(const halfWidth of [17,NaN,Infinity,-1])expect(hearthFurniturePlacementFailure(room(),{
      ...item,shape:{...item.shape,base:{halfWidth,depth:16}},
    })).toBe('invalid_placement');
  });
  it('refuses sealing an empty accessible room as well as trapping its current occupants',()=>{
    const context=room(),blocked=context.collision.blocked.slice();
    for(let x=1;x<11;x++)if(x!==6)blocked[6*12+x] = 1;
    const doorway={...table,tileX:6,tileY:6,shape:{...table.shape,width:1,height:1,tabletopSurface:{insetLeft:0,insetTop:0,width:1,height:1,liftPixels:20},base:{halfWidth:8,depth:16}}};
    expect(hearthFurniturePlacementFailure({...context,collision:{...context.collision,blocked},occupants:[]},doorway)).toBe('escape_blocked');
  });
});
