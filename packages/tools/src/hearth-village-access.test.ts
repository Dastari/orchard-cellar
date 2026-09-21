import {WILLOW_BRIDGES} from './hearth-archipelago-authoring.js';
import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
import {bootstrapContentRegistry,runtimeSpacePortalPlans,
  createLiveIslandMapDocument,terrainDocumentForMapV3,compileMapDocument,collisionMapForCompiledMapDocument,
  mapObjectCollisionCells,positionCollides,movementPositionAllowed,TILE_SIZE_FIXED,PLAYER_HITBOX_FOOT_OFFSET,
  PLAYER_HITBOX_TOP,type CollisionMap,type CollisionObstacle} from '@orchard/sim';
import {WILLOWHARBOUR_PLOTS,composeHearthArchipelago} from './hearth-archipelago-authoring.js';
import {buildHearthVillageFacades,buildHearthVillageScenery} from './hearth-village.js';

function village(){
  let id=1;
  const assetFor=(name:string)=>{
    const category=name.startsWith('wildlife_')?'characters':name.startsWith('building_')?'buildings':name.startsWith('tree_')?'trees':name.startsWith('crop_')?'crops':'props';
    const asset=JSON.parse(readFileSync(new URL(`../../assets/${category}/${name}.sprite.json`,import.meta.url),'utf8')) as {
      size:[number,number];anchor:[number,number]};
    return {id:id++,width:asset.size[0],height:asset.size[1],anchor:asset.anchor};
  };
  const base=composeHearthArchipelago(createLiveIslandMapDocument()).document;
  const facades=buildHearthVillageFacades(assetFor,'native-source-fixture');
  const scenery=buildHearthVillageScenery(base.cells,assetFor,'native-source-fixture');
  const document={...base,prefabs:[...base.prefabs,...facades.prefabs,...scenery.prefabs],objects:[...base.objects,...facades.objects,...scenery.objects]};
  const collision=collisionMapForCompiledMapDocument(compileMapDocument(terrainDocumentForMapV3(document)));
  const obstacles:CollisionObstacle[]=[],cells=document.objects.flatMap(object=>mapObjectCollisionCells(document,object));
  for(const cell of cells)for(let bit=0;bit<16;bit++){
    if((cell.collisionMask&(1<<bit))===0)continue;
    const left=cell.tileX*TILE_SIZE_FIXED+bit%4*TILE_SIZE_FIXED/4;
    const top=cell.tileY*TILE_SIZE_FIXED+Math.floor(bit/4)*TILE_SIZE_FIXED/4;
    obstacles.push({left,top,right:left+TILE_SIZE_FIXED/4-1,bottom:top+TILE_SIZE_FIXED/4-1});
  }
  return {...collision,obstacles};
}
const center=(x:number,y:number)=>({x:(x+.5)*TILE_SIZE_FIXED,y:(y+.5)*TILE_SIZE_FIXED});
function reachable(map:CollisionMap,target:{tileX:number;tileY:number},centerPhysicalFeet=false):boolean{
  const start={x:204,y:400},queue=[start],seen=new Set(['204,400']);
  for(let count=0;queue.length&&count<15000;count++){
    queue.sort((a,b)=>(Math.abs(b.x-target.tileX)+Math.abs(b.y-target.tileY))-(Math.abs(a.x-target.tileX)+Math.abs(a.y-target.tileY)));
    const current=queue.pop()!;
    if(current.x===target.tileX&&current.y===target.tileY)return true;
    for(const [dx,dy] of [[0,-1],[1,0],[0,1],[-1,0]] as const){
      const next={x:current.x+dx,y:current.y+dy},key=`${next.x},${next.y}`;
      if(seen.has(key)||next.x<64||next.x>223||next.y<320||next.y>479)continue;
      const from=center(current.x,current.y);
      if(centerPhysicalFeet) from.y+=PLAYER_HITBOX_FOOT_OFFSET+PLAYER_HITBOX_TOP/2;
      let previous=from,clear=true;
      for(let step=1;step<=16;step++){
        const position={x:from.x+dx*step*TILE_SIZE_FIXED/16,y:from.y+dy*step*TILE_SIZE_FIXED/16};
        if(!movementPositionAllowed(previous,position,map)){clear=false;break;}previous=position;
      }
      if(clear){seen.add(key);queue.push(next);}
    }
  }
  return false;
}
describe('decorated Willowharbour public NPC access',()=>{
  it('reaches every public threshold through the decorated frontage',()=>{
    const map=village(),portals=runtimeSpacePortalPlans(bootstrapContentRegistry());
    for(const plot of WILLOWHARBOUR_PLOTS.filter(p=>p.enterable)) {
      expect(reachable(map,plot.door,true),plot.id).toBe(true);
      const entry=portals.find(portal=>portal.fromSpaceId===0&&portal.fromTileX===plot.door.tileX&&portal.fromTileY===plot.door.tileY);
      expect(entry,`${plot.id} entry portal`).toBeDefined();
      const exit=portals.find(portal=>portal.fromSpaceId===entry!.toSpaceId&&portal.toSpaceId===0)!;
      expect(positionCollides(center(exit.toTileX,exit.toTileY),map),`${plot.id} return landing`).toBe(false);
    }
  });
  it('reaches farm beds, pen and both agricultural doors without passing through fences',()=>{
    const map=village();
    for(const [tileX,tileY] of [[142,440],[138,436],[146,436],[126,447],[117,454],[142,454]]) {
      expect(reachable(map,{tileX:tileX!,tileY:tileY!},true),`farm approach ${tileX},${tileY}`).toBe(true);
    }
    for(const [x,y] of [[121,447],[127,445],[124,451]]) {
      expect(positionCollides(center(x!,y!),map),`farm fence ${x},${y}`).toBe(true);
    }
  },30000);
  it('crosses both bridge deck lanes bank to bank while blocking the rails',()=>{
    const map=village();
    for(const [left,right,north] of WILLOW_BRIDGES) {
    for(const y of [north+1,north+2]) for(const direction of [1,-1]) {
      const bank=center(direction===1?left-1:right+1,y);
      // Position is a sprite anchor; centre its raised physical foot box on the lane.
      let previous={x:bank.x,y:bank.y+PLAYER_HITBOX_FOOT_OFFSET+PLAYER_HITBOX_TOP/2};
      for(let step=1;step<=(right-left+2)*16;step++) {
        const position={x:previous.x+direction*TILE_SIZE_FIXED/16,y:previous.y};
        expect(movementPositionAllowed(previous,position,map),`bridge lane ${y} step ${step}`).toBe(true);
        previous=position;
      }
    }
    for(let x=left;x<=right;x++) for(const y of [north,north+3]) {
      expect(positionCollides(center(x,y),map),`bridge rail ${x},${y}`).toBe(true);
    }
    }
  });
  it('walks to the quay tip and back without permitting entry into the surrounding sea',()=>{
    const map=village();
    const physicalCenter=(x:number,y:number)=>{const point=center(x,y);return {...point,y:point.y+PLAYER_HITBOX_FOOT_OFFSET+PLAYER_HITBOX_TOP/2};};
    for(const y of [400,401]) for(const direction of [1,-1]) {
      let previous=physicalCenter(direction===1?210:219,y);
      for(let step=1;step<=9*16;step++) {
        const position={x:previous.x+direction*TILE_SIZE_FIXED/16,y:previous.y};
        expect(movementPositionAllowed(previous,position,map),`quay ${y} direction ${direction} step ${step}`).toBe(true);
        previous=position;
      }
      expect(positionCollides(physicalCenter(220,y),map),`sea beyond tip ${y}`).toBe(true);
    }
    for(let x=212;x<=219;x++) for(const y of [399,402])
      expect(positionCollides(physicalCenter(x,y),map),`quay rail ${x},${y}`).toBe(true);
  });
  it('keeps the guide and all four residents clear and reachable from the ferry with a full body',()=>{
    const map=village();
    // Cargo and guide frontage must preserve the complete arrival/return corridor.
    for(let y=398;y<=403;y++) for(let x=202;x<=211;x++) {
      expect(positionCollides(center(x,y),map),`ferry corridor ${x},${y}`).toBe(false);
    }
    const residents=[...bootstrapContentRegistry().npcs.values()].filter(npc=>npc.id.startsWith('npc:willow_')&&npc.home.spaceId===0);
    expect(residents).toHaveLength(5);
    for(const npc of residents){
      expect(positionCollides(center(npc.home.tileX,npc.home.tileY),map),npc.id).toBe(false);
      expect(reachable(map,npc.home),npc.id).toBe(true);
    }
  },30000);
});
