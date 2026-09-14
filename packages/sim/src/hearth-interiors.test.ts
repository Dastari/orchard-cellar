import {describe,it,expect} from 'vitest';
import {bootstrapContentRegistry,bootstrapContentRows} from './content/bootstrap-registry.js';
import {buildContentRegistry} from './content/registry.js';
import {HEARTH_INTERIORS,HEARTH_INTERIOR_ARRIVAL,HEARTH_INTERIOR_EXIT,hearthInteriorCollision,hearthInteriorNativePlacements,runtimeHearthInteriorForSpace} from './hearth-interiors.js';
import {hearthFurnitureCells,hearthFurniturePresentationAnchor} from './hearth-furniture-placement.js';
import {positionCollides} from './movement.js';
import {TILE_SIZE_FIXED} from './state.js';

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
      expect([...seen].some(key=>{const [x,y]=key.split(',').map(Number);return x!>=left&&x!<=right&&y!>=top&&y!<=bottom;})).toBe(true);
    }
  });
  it.each(HEARTH_INTERIORS)('$kind keeps three-course wall panels off playable floors',interior=>{
    const collision=hearthInteriorCollision(interior.spaceId);
    for(let y=0;y<31;y++)for(let x=0;x<32;x++){
      if(!collision.blocked[y*32+x]||collision.blocked[(y+1)*32+x])continue;
      for(let offset=0;offset<3;offset++){
        expect(y-offset).toBeGreaterThanOrEqual(0);
        expect(collision.blocked[(y-offset)*32+x],`wall at ${x},${y} over floor ${y-offset}`).toBe(true);
      }
    }
  });
  it.each(HEARTH_INTERIORS)('$kind places native furniture on room floors with supported tabletop decorations',interior=>{
    const map=hearthInteriorCollision(interior.spaceId),placements=hearthInteriorNativePlacements(interior);
    expect(new Set(interior.furniture.map(item=>item.id)).size).toBe(interior.furniture.length);
    for(const item of placements){
      for(const cell of hearthFurnitureCells(item))expect(map.blocked[cell.tileY*32+cell.tileX],item.id).toBe(false);
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
  it('provides six distinct service spaces and refuses unknown geometry',()=>{
    expect(new Set(HEARTH_INTERIORS.map(row=>row.spaceId)).size).toBe(6);
    expect(()=>hearthInteriorCollision(0)).toThrow('Unknown village interior');
  });
  it('preserves stable layout when the authored space and furniture object are renamed',()=>{
    const rows=bootstrapContentRows(),spaceRow=rows.find(row=>row.id==='space:willow_inn')!;
    const objectRow=rows.find(row=>row.id==='object:furniture_rustic_dining_table')!;
    const space=JSON.parse(String(spaceRow.json)) as {id:string},object=JSON.parse(String(objectRow.json)) as {id:string};
    space.id='space:lantern_house';object.id='object:long_oak_table';
    const built=buildContentRegistry(rows.filter(row=>row.id!==spaceRow.id&&row.id!==objectRow.id).concat([
      {id:space.id,kind:'space',slug:'lantern_house',json:space},
      {id:object.id,kind:'object',slug:'long_oak_table',json:object},
    ]));
    expect(built.report.errors).toEqual([]);
    const interior=runtimeHearthInteriorForSpace(built.registry,65520);
    expect(interior).toMatchObject({name:'The Willow Lantern',spaceId:65520,kind:'inn'});
    expect(interior?.furniture.find(item=>item.id==='furniture_rustic_dining_table:16:9')?.definitionId)
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
