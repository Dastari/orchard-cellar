import {describe,it,expect} from 'vitest';
import {bootstrapContentRegistry,bootstrapContentRows} from './content/bootstrap-registry.js';
import {buildContentRegistry} from './content/registry.js';
import {HEARTH_INTERIORS,HEARTH_INTERIOR_ARRIVAL,HEARTH_INTERIOR_EXIT,hearthInteriorCollision,hearthInteriorNativePlacements,hearthInteriorFurnitureObstacles,runtimeHearthInteriorForSpace} from './hearth-interiors.js';
import {hearthFurnitureCells,hearthFurniturePresentationAnchor} from './hearth-furniture-placement.js';
import {positionCollides} from './movement.js';
import {TILE_SIZE_FIXED} from './state.js';
import {runtimeSpacePortalPlans} from './content/runtime.js';
import {parseSpaceContentDefinition} from './content/world-definition.js';

describe('Willowharbour service interiors',()=>{
  it.each(HEARTH_INTERIORS)('$kind keeps entry, exit and service frontage connected with a full player body',interior=>{
    const collision=hearthInteriorCollision(interior.spaceId),unit=TILE_SIZE_FIXED;
    const center=(x:number,y:number)=>({x:(x+.5)*unit,y:(y+.5)*unit});
    const queue=[HEARTH_INTERIOR_ARRIVAL as {tileX:number;tileY:number}],seen=new Set([`${queue[0]!.tileX},${queue[0]!.tileY}`]);
    expect(positionCollides(center(queue[0]!.tileX,queue[0]!.tileY),collision)).toBe(false);
    for(let i=0;i<queue.length;i++){
      const current=queue[i]!;
      for(const [dx,dy] of [[0,-1],[1,0],[0,1],[-1,0]] as const){
        const x=current.tileX+dx,y=current.tileY+dy,key=`${x},${y}`;
        if(seen.has(key)||x<0||y<0||x>=32||y>=32)continue;
        const start=center(current.tileX,current.tileY);let clear=true;
        for(let step=0;step<=unit;step++)if(positionCollides({x:start.x+dx*step,y:start.y+dy*step},collision)){clear=false;break;}
        if(clear){seen.add(key);queue.push({tileX:x,tileY:y});}
      }
    }
    for(const target of [HEARTH_INTERIOR_EXIT,interior.approach,interior.service])
      expect(seen.has(`${target.tileX},${target.tileY}`),JSON.stringify(target)).toBe(true);
    // An entire two-tile central route remains clear, including the south door.
    for(let y=11;y<=27;y++)for(const x of [15,16])expect(seen.has(`${x},${y}`)).toBe(true);
    const dx=interior.approach.tileX-interior.service.tileX,dy=interior.approach.tileY-interior.service.tileY;
    expect(dx*dx+dy*dy).toBeLessThanOrEqual(9);
    // Every carved room has a reachable point; disconnected furnished alcoves fail.
    for(const [left,top,right,bottom] of interior.rooms){
      expect([...seen].some(key=>{const [x,y]=key.split(',').map(Number);return x!>=left&&x!<=right&&y!>=top&&y!<=bottom;}),JSON.stringify([left,top,right,bottom])).toBe(true);
    }
  });
  it.each(HEARTH_INTERIORS)('$kind keeps three-course wall panels off playable floors',interior=>{
    const collision=hearthInteriorCollision(interior.spaceId);
    for(let y=0;y<31;y++)for(let x=0;x<32;x++){
      if(!collision.blocked[y*32+x]||collision.blocked[(y+1)*32+x])continue;
      for(let offset=0;offset<3;offset++){
        expect(y-offset).toBeGreaterThanOrEqual(0);
        expect(collision.blocked[(y-offset)*32+x],`wall at ${x},${y} over floor ${y-offset}`).toBe(1);
      }
    }
  });
  it.each(HEARTH_INTERIORS)('$kind places native furniture on room floors with supported tabletop decorations',interior=>{
    const map=hearthInteriorCollision(interior.spaceId),placements=hearthInteriorNativePlacements(interior);
    expect(new Set(interior.furniture.map(item=>item.id)).size).toBe(interior.furniture.length);
    for(const item of placements){
      for(const cell of hearthFurnitureCells(item))expect(map.blocked[cell.tileY*32+cell.tileX],item.id).toBe(0);
      expect(hearthFurniturePresentationAnchor(item,placements),item.id).not.toBeNull();
      if(item.shape.layer==='tabletop'){
        const parent=placements.find(candidate=>candidate.id===item.supportId)!;
        expect(parent.shape.tabletopSurface,item.id).toBeDefined();
        const surface=parent.shape.tabletopSurface!;
        const left=parent.tileX-Math.floor((parent.shape.width-1)/2)+surface.insetLeft;
        const top=parent.tileY-parent.shape.height+1+surface.insetTop;
        for(const cell of hearthFurnitureCells(item)){
          expect(cell.tileX).toBeGreaterThanOrEqual(left);expect(cell.tileX).toBeLessThan(left+surface.width);
          expect(cell.tileY).toBeGreaterThanOrEqual(top);expect(cell.tileY).toBeLessThan(top+surface.height);
        }
      }
    }
  });
  it.each(HEARTH_INTERIORS)('$kind keeps every fixed fixture base inside its room envelope',interior=>{
    const map=hearthInteriorCollision(interior.spaceId);
    for(const obstacle of hearthInteriorFurnitureObstacles(interior)){
      expect(obstacle).not.toBeNull();if(obstacle===null)continue;
      for(let y=Math.floor(obstacle.top/TILE_SIZE_FIXED);y<=Math.floor(obstacle.bottom/TILE_SIZE_FIXED);y++)
        for(let x=Math.floor(obstacle.left/TILE_SIZE_FIXED);x<=Math.floor(obstacle.right/TILE_SIZE_FIXED);x++)
          expect(map.blocked[y*map.width+x],`${interior.kind} fixture base ${x},${y}`).toBe(0);
    }
  });
  it('provides ten distinct town spaces and refuses unknown geometry',()=>{
    expect(new Set(HEARTH_INTERIORS.map(row=>row.spaceId)).size).toBe(10);
    expect(()=>hearthInteriorCollision(0)).toThrow('Unknown village interior');
  });
  it('preserves stable layout when the authored space and furniture object are renamed',()=>{
    const rows=bootstrapContentRows(),spaceRow=rows.find(row=>row.id==='space:willow_inn')!;
    const objectRow=rows.find(row=>row.id==='object:furniture_rustic_dining_table')!;
    const space=JSON.parse(String(spaceRow.json)) as {id:string;portals:{fromSpace:string;toSpace:string}[]},object=JSON.parse(String(objectRow.json)) as {id:string};
    space.id='space:lantern_house';
    for(const portal of space.portals){
      if(portal.fromSpace==='space:willow_inn')portal.fromSpace=space.id;
      if(portal.toSpace==='space:willow_inn')portal.toSpace=space.id;
    }
    object.id='object:long_oak_table';
    const built=buildContentRegistry(rows.filter(row=>row.id!==spaceRow.id&&row.id!==objectRow.id).concat([
      {id:space.id,kind:'space',slug:'lantern_house',json:space},
      {id:object.id,kind:'object',slug:'long_oak_table',json:object},
    ]));
    expect(built.report.errors).toEqual([]);
    const interior=runtimeHearthInteriorForSpace(built.registry,65520);
    expect(interior).toMatchObject({name:'The Willow Lantern',spaceId:65520,kind:'inn'});
    expect(interior?.furniture.find(item=>item.kind==='furniture_rustic_dining_table')?.definitionId)
      .toBe('object:long_oak_table');
    expect(hearthInteriorCollision(built.registry,65520)?.blocked).toEqual(hearthInteriorCollision(65520).blocked);
  });
  it('fails neutral for missing, retired, or ambiguous authored furniture',()=>{
    const base=bootstrapContentRegistry(),original=base.objects.get('object:furniture_rustic_dining_table')!;
    const missingObjects=new Map(base.objects);missingObjects.delete(original.id);
    expect(runtimeHearthInteriorForSpace({...base,objects:missingObjects},65520)).toBeNull();
    expect(hearthInteriorCollision({...base,objects:missingObjects},65520)).toBeNull();
    const retiredObjects=new Map(base.objects);retiredObjects.set(original.id,{...original,retired:true});
    expect(runtimeHearthInteriorForSpace({...base,objects:retiredObjects},65520)).toBeNull();
    const ambiguousObjects=new Map(base.objects);ambiguousObjects.set('object:duplicate_table',{...original,id:'object:duplicate_table'});
    expect(runtimeHearthInteriorForSpace({...base,objects:ambiguousObjects},65520)).toBeNull();
  });
});


describe('complete Willowharbour interior catalogue',()=>{
  it.each(HEARTH_INTERIORS)('$kind has a bidirectional authored exterior door and safe arrival',interior=>{
    const registry=bootstrapContentRegistry(),portals=runtimeSpacePortalPlans(registry);
    const incoming=portals.filter(portal=>portal.toSpaceId===interior.spaceId);
    const outgoing=portals.filter(portal=>portal.fromSpaceId===interior.spaceId);
    expect(incoming).toHaveLength(1);expect(outgoing).toHaveLength(1);
    const entrance=incoming[0]!,exit=outgoing[0]!;
    expect(entrance.fromSpaceId).toBe(exit.toSpaceId);
    expect([entrance.toTileX,entrance.toTileY]).toEqual([interior.arrival.tileX,interior.arrival.tileY]);
    expect([exit.fromTileX,exit.fromTileY]).toEqual([interior.exit.tileX,interior.exit.tileY]);
    expect([exit.toTileX,exit.toTileY]).toEqual([entrance.fromTileX,entrance.fromTileY+1]);
    expect(positionCollides({x:(entrance.toTileX+.5)*TILE_SIZE_FIXED,y:(entrance.toTileY+.5)*TILE_SIZE_FIXED},hearthInteriorCollision(interior.spaceId))).toBe(false);
  });
  it('gives compact houses domestic rooms and a broad conservatory its own planted floor',()=>{
    const registry=bootstrapContentRegistry();
    for(const kind of ['garden-cottage','orchard-cottage']){
      const interior=HEARTH_INTERIORS.find(room=>room.kind===kind)!;
      expect(interior.rooms.length).toBeGreaterThanOrEqual(5);
      for(const role of ['bed','bath','cooking_range','dining_table'])
        expect(interior.furniture.some(item=>item.kind.endsWith(`_${role}`)),`${kind}: ${role}`).toBe(true);
      const footprint=hearthInteriorCollision(interior.spaceId).blocked.filter(blocked=>!blocked).length;
      const inn=hearthInteriorCollision(HEARTH_INTERIORS.find(room=>room.kind==='inn')!.spaceId);
      expect(footprint).toBeLessThan(inn.blocked.filter(blocked=>!blocked).length);
    }
    const conservatory=[...registry.spaces.values()].find(space=>space.hearthInterior?.[0]==='p')!;
    expect(conservatory.hearthInteriorFloors?.filter(region=>region.style==='soil')).toHaveLength(2);
  });
  it('resolves explicit native barrel art when its compact fingerprint collides, but rejects duplicate native art',()=>{
    const base=bootstrapContentRegistry(),barn=HEARTH_INTERIORS.find(room=>room.kind==='barn')!;
    expect(barn.furniture.some(item=>item.definitionId==='object:barrel'&&item.objectTag==='container.barrel')).toBe(true);
    const barrel=base.objects.get('object:barrel')!,objects=new Map(base.objects);
    objects.set('object:duplicate_barrel',{...barrel,id:'object:duplicate_barrel'});
    expect(runtimeHearthInteriorForSpace({...base,objects},barn.spaceId)).toBeNull();
  });
  it('rejects unknown materials and invalid floor-region bounds',()=>{
    const rows=bootstrapContentRows(),row=rows.find(entry=>entry.id==='space:willow_garden_cottage')!;
    const space=JSON.parse(String(row.json));
    expect(()=>parseSpaceContentDefinition({...space,hearthInteriorFloors:[{bounds:[1,1,2,2],style:'unknown'}]})).toThrow('unknown interior floor style');
    const changed={...space,hearthInteriorFloors:[{bounds:[1,1,33,2],style:'stone'}]};
    expect(buildContentRegistry(rows.map(entry=>entry.id===row.id?{...entry,json:changed}:entry)).report.errors)
      .toContainEqual(expect.objectContaining({path:'hearthInteriorFloors[0]',code:'invalid_world_definition'}));
  });
});
