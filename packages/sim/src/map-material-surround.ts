import {resolvedMapCellAt} from './map-document.js';
import type {MapPoint} from './map-editing.js';
import {resolvedMapBiomeAt,terrainDocumentForMapV3,type MapDocumentV3,type MapDocumentV3CellOverride} from './map-document-v3.js';
import {planLocalTerrainInsets} from './local-terrain-insets.js';

const grassBiomes=new Set(['plains','meadow','forest','valley','highland','ridge']);
const cardinal=[[0,-1],[1,0],[0,1],[-1,0]] as const;

/** Close competing inset corners on both sides of a material boundary. Original
 * brush cells and other height levels stay untouched. Copy only terrain art
 * semantics from an adjacent member of the filled region, never collision or
 * object state. Exact placement does not call this helper. */
export function surroundMapMaterialGeometry(after:MapDocumentV3,points:readonly MapPoint[]):
  Readonly<Record<string,MapDocumentV3CellOverride>> | null {
 const cells:Record<string,MapDocumentV3CellOverride>={...after.cells};
 const updatedKeys=new Set<string>();
 const interim={...terrainDocumentForMapV3(after),cells};
 const inside=(x:number,y:number)=>x>=0&&y>=0&&x<after.width&&y<after.height;
 const at=(x:number,y:number)=>resolvedMapCellAt(interim,x,y);
 const material=(x:number,y:number):string=>{const cell=at(x,y);const family=cell.surface==='grass'?(cell.surfaceFamily??after.defaultSurfaceFamily??'grass_1'):'';return `${cell.surface}/${cell.feature}/${family}`;};
 const protectedKeys=new Set(points.map(p=>`${p.tileX},${p.tileY}`));
 const groups=new Map<string,MapPoint[]>();
 for(const point of points){
   if(!inside(point.tileX,point.tileY))continue;
   const cell=at(point.tileX,point.tileY),key=`${cell.elevation}/${material(point.tileX,point.tileY)}`;
   const group=groups.get(key)??[];group.push(point);groups.set(key,group);
 }
 for(const group of groups.values()){
   const sample=at(group[0]!.tileX,group[0]!.tileY);
   const selectedMaterial=material(group[0]!.tileX,group[0]!.tileY);
   const same=(x:number,y:number)=>material(x,y)===selectedMaterial;
   // The inverse region also owns inset blocks (for example water banks when
   // a grass stroke narrows a river), so protect the stroke while closing it.
   for(const inverse of [false,true]){
     const occupiedAt=(x:number,y:number)=>inside(x,y)&&at(x,y).elevation===sample.elevation&&same(x,y)!==inverse;
     const plan=planLocalTerrainInsets({points:group,occupiedAt,canFillAt:(x,y)=>
       inside(x,y)&&at(x,y).elevation===sample.elevation&&!protectedKeys.has(`${x},${y}`)});
     if(plan.unresolved.length>0)return null;
     const pending=[...plan.added];
     while(pending.length>0){
       let copied=false;
       for(let i=pending.length-1;i>=0;i--){
         const point=pending[i]!;
         const donors=cardinal.map(([dx,dy])=>({tileX:point.tileX+dx,tileY:point.tileY+dy}));
         const eligible=donors.filter(p=>occupiedAt(p.tileX,p.tileY));
         // A three-material junction has no unambiguous inverse fill. Ask for
         // a wider/explicit brush instead of choosing a compass-biased donor.
         if(new Set(eligible.map(p=>material(p.tileX,p.tileY))).size>1)return null;
         const donor=eligible[0];
         if(!donor)continue;
         const source=at(donor.tileX,donor.tileY),sourceKey=`${donor.tileX},${donor.tileY}`;
         const replacement={...cells[`${point.tileX},${point.tileY}`],
           surface:source.surface,feature:source.feature,surfaceFamily:source.surfaceFamily,
           cliffFamily:source.cliffFamily,
           biome:cells[sourceKey]?.biome??resolvedMapBiomeAt(after,donor.tileX,donor.tileY)};
         delete replacement.terrainOverride;
         cells[`${point.tileX},${point.tileY}`]=replacement;
         updatedKeys.add(`${point.tileX},${point.tileY}`);
         pending.splice(i,1);copied=true;
       }
       if(!copied)return null;
     }
   }
   for(const inverse of [false,true])if(planLocalTerrainInsets({points:group,
     occupiedAt:(x,y)=>inside(x,y)&&at(x,y).elevation===sample.elevation&&same(x,y)!==inverse,
     canFillAt:()=>false}).unresolved.length>0)return null;
 }
 return Object.fromEntries([...updatedKeys].filter(key=>JSON.stringify(cells[key])!==JSON.stringify(after.cells[key])).map(key=>[key,cells[key]!]));
}

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
