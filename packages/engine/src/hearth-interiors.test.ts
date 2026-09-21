import {describe,it,expect} from 'vitest';
import {bootstrapContentRegistry,HEARTH_INTERIORS,hearthInteriorCollision} from '@orchard/sim';
import {enqueueHearthInteriorFurniture,hearthInteriorPointLights} from './hearth-interior-scene.js';
import type {OverworldArt} from './overworld-art.js';
import {terrainForSpace} from './terrain.js';

describe('village interior terrain parity',()=>{
  it('lights each service interior with authored emitters and lifts the showroom lamp with its table',()=>{
    const registry=bootstrapContentRegistry();
    const art={itemIcons:Object.fromEntries(HEARTH_INTERIORS.flatMap(room=>room.furniture.map(item=>[item.kind,{}])))} as unknown as OverworldArt;
    for(const room of HEARTH_INTERIORS){
      const lights=hearthInteriorPointLights(room.spaceId,registry,art,42n);
      expect(lights.length,room.kind).toBeGreaterThan(0);
      expect(lights.every(light=>Number.isFinite(light.worldY)&&light.radiusTiles>0)).toBe(true);
    }
    const lights=hearthInteriorPointLights(65523,registry,art,42n);
    const lamp=lights.find(light=>light.worldX===24.5*16)!;
    expect(lamp.worldY).toBe(11*16-20-20);
    expect(lamp.receiverDirectionWorldY).toBe(11*16);
    const missingParent={...art,itemIcons:{...art.itemIcons}};
    delete missingParent.itemIcons['furniture_townhouse_dining_table'];
    expect(hearthInteriorPointLights(65523,registry,missingParent,42n).some(light=>light.worldX===24.5*16)).toBe(false);
    expect(hearthInteriorPointLights(0,registry,art,42n)).toEqual([]);
  });
  it('submits showroom rugs as flat receivers and attachments only with their parent',()=>{
    const interior=HEARTH_INTERIORS.find(room=>room.kind==='furnisher')!;
    const art={itemIcons:Object.fromEntries(interior.furniture.map(item=>[item.kind,{}]))} as unknown as OverworldArt;
    const rows:{tie:string|number;phase:string|undefined;receiver:string|undefined}[]=[];
    enqueueHearthInteriorFurniture({} as CanvasRenderingContext2D,art,bootstrapContentRegistry(),interior.spaceId,0,0,1,(_x,_y,item,_sample,receiver)=>{
      rows.push({tie:item.tie,phase:item.depthPhase,receiver});
    });
    const rugs=rows.filter(row=>row.phase==='surface');
    expect(rugs.length).toBeGreaterThan(0);
    expect(rugs.every(row=>row.receiver==='flat')).toBe(true);
    expect(rows.some(row=>String(row.tie).includes('table_lamp'))).toBe(false);
    expect(rows.find(row=>String(row.tie).includes('townhouse_dining_table'))?.receiver).toBe('south');
  });
  it.each(HEARTH_INTERIORS)('$kind renders the same floor footprint as authority collision',interior=>{
    const terrain=terrainForSpace({spaceId:interior.spaceId,name:interior.name,sizeTiles:32,generator:'village_interior',
      environment:'indoor',ambient:{r:194,g:158,b:122},weather:false,audioBed:'homestead'},1,1);
    const collision=hearthInteriorCollision(interior.spaceId);
    expect(terrain.blocked).toEqual(collision.blocked);
    expect(terrain.elevations).toEqual(collision.elevations);
    expect(terrain.width).toBe(collision.width);expect(terrain.height).toBe(collision.height);
  });
});

it('paints authored room materials without making walls into floor or changing collision',()=>{
  const registry=bootstrapContentRegistry();
  for(const room of HEARTH_INTERIORS){
    const definition=[...registry.spaces.values()].find(space=>space.spaceId===room.spaceId)!;
    const terrain=terrainForSpace(definition,1,1,registry);
    const styles=terrain.hearthInteriorFloorStyles!;
    expect(styles.length).toBe(terrain.width*terrain.height);
    for(let i=0;i<styles.length;i++)if(terrain.blocked[i])expect(styles[i]).toBe(0);
    for(const {bounds:[left,top,right,bottom],style} of definition.hearthInteriorFloors??[]){
      // Later regions may intentionally overlay a broad room, e.g. nursery beds.
      const expected=style==='townhouse'?1:style==='stone'?2:3;
      expect(Array.from({length:(right-left+1)*(bottom-top+1)},(_,i)=>{
        const x=left+i%(right-left+1),y=top+Math.floor(i/(right-left+1));
        return styles[y*terrain.width+x];
      }).includes(expected),`${room.kind}: ${style}`).toBe(true);
    }
  }
});
