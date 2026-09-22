import {resolvedMapCellAt} from './map-document.js';
import type {MapPoint} from './map-editing.js';
import {resolvedMapBiomeAt,terrainDocumentForMapV3,type MapDocumentV3,type MapDocumentV3CellOverride} from './map-document-v3.js';

const grassBiomes=new Set(['plains','meadow','forest','valley','highland','ridge']);
const cardinal=[[0,-1],[1,0],[0,1],[-1,0]] as const;

/** Persist the existing bank family around a material stroke. Geometry and
 * collision remain semantic surfaces; no hand-picked transition frame is stored. */
export function surroundMapMaterial(after:MapDocumentV3,points:readonly MapPoint[]):Readonly<Record<string,MapDocumentV3CellOverride>> {
 const terrain=terrainDocumentForMapV3(after);
 const cells:Record<string,MapDocumentV3CellOverride>={};
 const inside=(x:number,y:number)=>x>=0&&y>=0&&x<after.width&&y<after.height;
 const at=(x:number,y:number)=>resolvedMapCellAt(terrain,x,y);
 const water=(x:number,y:number)=>inside(x,y)&&(at(x,y).surface==='water'||at(x,y).feature==='river');
 const grass=(x:number,y:number)=>inside(x,y)&&at(x,y).surface==='grass'&&at(x,y).feature==='none';
 const neighbors=(x:number,y:number,predicate:(x:number,y:number)=>boolean)=>cardinal.some(([dx,dy])=>inside(x+dx,y+dy)&&at(x+dx,y+dy).elevation===at(x,y).elevation&&predicate(x+dx,y+dy));
 const affected=new Map<string,MapPoint>();
 for(const point of points) {
   if(!inside(point.tileX,point.tileY))continue;
   const {tileX:x,tileY:y}=point,key=`${x},${y}`;
   if(grass(x,y)&&grassBiomes.has(resolvedMapBiomeAt(after,x,y))
     &&neighbors(x,y,water)&&neighbors(x,y,grass))cells[key]={...after.cells[key],biome:'freshwater'};
   for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(inside(x+dx,y+dy))affected.set(`${x+dx},${y+dy}`,{tileX:x+dx,tileY:y+dy});
 }
 for(const [key,{tileX:x,tileY:y}] of affected) {
   const biome=resolvedMapBiomeAt(after,x,y);
   if(grass(x,y)&&biome==='freshwater'&&!neighbors(x,y,water))cells[key]={...after.cells[key],biome:'plains'};
   if(water(x,y)&&(biome==='water'||biome==='freshwater')&&neighbors(x,y,grass))cells[key]={...after.cells[key],biome:'freshwater'};
 }
 return cells;
}
