import {createSurvivalAuthoredLandmarkInstances,HEARTH_ISLANDS,
  parseMapPrefabDocument,type HearthBuildingAsset,type MapDocumentV3,type MapObjectInstance} from '@orchard/sim';
import {buildHearthArchipelagoContribution,composeHearthArchipelago} from './hearth-archipelago-authoring.js';
import {buildHearthCinderScenery} from './hearth-cinder-scenery.js';
import {buildHearthVillageFacades,buildHearthVillageScenery} from './hearth-village.js';
import {legacyLandmarkBounds} from './legacy-landmark-bounds.js';

function canonical(value:unknown):string{
  if(Array.isArray(value))return `[${value.map(canonical).join(',')}]`;
  if(value!==null&&typeof value==='object')return `{${Object.entries(value).filter(([,v])=>v!==undefined)
    .sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  return JSON.stringify(value)??'null';
}
const intersects=(left:number,top:number,right:number,bottom:number)=>Object.values(HEARTH_ISLANDS)
  .some(island=>left<=island.maxX&&right>=island.minX&&top<=island.maxY&&bottom>=island.minY);
const intersectsContinuous=(left:number,top:number,right:number,bottom:number)=>Object.values(HEARTH_ISLANDS)
  .some(island=>left<island.maxX+1&&right>island.minX&&top<island.maxY+1&&bottom>island.minY);

/** Offline candidate composition only. A conflict returns no installable document. */
export function composeHearthContentMap(input:MapDocumentV3,assetFor:(name:string)=>HearthBuildingAsset,
  assetRegistryRevision:string):{readonly document:MapDocumentV3|null;readonly conflicts:readonly string[]}{
  const conflicts:string[]=[],terrain=composeHearthArchipelago(input);
  conflicts.push(...terrain.conflictingCells.map(key=>`cell:${key}`));
  const contribution=buildHearthArchipelagoContribution();
  for(const key of Object.keys(input.cells)){
    const [x,y]=key.split(',').map(Number);
    if(contribution.cells[key]===undefined&&x!==undefined&&y!==undefined&&intersects(x,y,x,y))conflicts.push(`cell:unreviewed:${key}`);
  }
  const facades=buildHearthVillageFacades(assetFor,assetRegistryRevision);
  const scenery=buildHearthVillageScenery(contribution.cells,assetFor,assetRegistryRevision);
  const cinder=buildHearthCinderScenery(assetFor,assetRegistryRevision);
  const merge=<T extends {readonly id:string}>(kind:string,old:readonly T[],added:readonly T[]):readonly T[]=>{
    const result=[...old],byId=new Map<string,T>();
    for(const row of old){if(byId.has(row.id))conflicts.push(`${kind}:duplicate:${row.id}`);byId.set(row.id,row);}
    for(const row of added){
      const existing=byId.get(row.id);
      if(existing===undefined){result.push(row);byId.set(row.id,row);}
      else if(canonical(existing)!==canonical(row))conflicts.push(`${kind}:changed:${row.id}`);
    }
    return result;
  };
  const prefabs=merge('prefab',input.prefabs,[...facades.prefabs,...scenery.prefabs,...cinder.prefabs]
    .map(row=>parseMapPrefabDocument(JSON.stringify(row))));
  const additions=[...facades.objects,...scenery.objects,...cinder.objects],objects=merge('object',input.objects,additions);
  const intended=new Map(additions.map(row=>[row.id,canonical(row)]));
  const overlapObject=(object:MapObjectInstance):void=>{
    if(intended.get(object.id)===canonical(object))return;
    const prefab=input.prefabs.find(row=>row.id===object.prefabId&&row.revision===object.prefabRevision);
    if(!prefab){conflicts.push(`object:unresolved:${object.id}`);return;}
    let radius=Math.max(prefab.width+Math.abs(prefab.pivot.tileX),prefab.height+Math.abs(prefab.pivot.tileY));
    try{
      for(const placement of prefab.placements){
        const asset=assetFor(placement.assetName);
        radius=Math.max(radius,Math.abs(placement.tileX-prefab.pivot.tileX)+Math.abs(placement.tileY-prefab.pivot.tileY)
          +(asset.width+asset.height+Math.abs(asset.anchor[0])+Math.abs(asset.anchor[1]))/16+2);
      }
    }catch{conflicts.push(`object:unresolved-visual:${object.id}`);return;}
    radius*=object.scale??1;
    if(intersectsContinuous(object.tileX-radius,object.tileY-radius,object.tileX+radius,object.tileY+radius))conflicts.push(`object:area:${object.id}`);
  };
  input.objects.forEach(overlapObject);
  for(const anchor of input.anchors)if(intersects(anchor.tileX,anchor.tileY,anchor.tileX,anchor.tileY))conflicts.push(`anchor:area:${anchor.id}`);
  for(const row of input.scenery){
    try{
      const asset=assetFor(row.assetId),radius=(asset.width+asset.height+Math.abs(asset.anchor[0])+Math.abs(asset.anchor[1]))/16+2;
      if(intersectsContinuous(row.tileX-radius,row.tileY-radius,row.tileX+radius,row.tileY+radius))conflicts.push(`scenery:area:${row.id}`);
    }catch{conflicts.push(`scenery:unresolved:${row.id}`);}
  }
  const originalLandmarks=new Map(createSurvivalAuthoredLandmarkInstances().map(row=>[row.id,canonical(row)]));
  for(const row of input.landmarks){
    if(originalLandmarks.get(row.id)===canonical(row))continue;
    try{
      const bounds=legacyLandmarkBounds(row,assetFor);
      if(bounds===null)conflicts.push(`landmark:visual-survey-required:${row.id}`);
      else if(intersectsContinuous(bounds.left,bounds.top,bounds.right,bounds.bottom))conflicts.push(`landmark:area:${row.id}`);
    }catch{conflicts.push(`landmark:unresolved-visual:${row.id}`);}
  }
  const knownTransitions=new Set(contribution.transitions.map(canonical));
  for(const [index,row] of input.transitions.entries()){
    if(!knownTransitions.has(canonical(row))&&intersects(Math.min(row.lowerTileX,row.upperTileX),Math.min(row.lowerTileY,row.upperTileY),
      Math.max(row.lowerTileX,row.upperTileX),Math.max(row.lowerTileY,row.upperTileY)))conflicts.push(`transition:area:${index}`);
  }
  for(const [index,row] of (input.stairRuns??[]).entries()){
    const radius=Math.abs(row.toLevel-row.fromLevel)+(row.width??2)+2;
    if(intersects(row.x-radius,row.y-radius,row.x+radius,row.y+radius))conflicts.push(`stairs:area:${index}`);
  }
  if(conflicts.length>0)return {document:null,conflicts};
  const document={...terrain.document,prefabs,objects},changed=canonical(document)!==canonical(input);
  if(changed&&(!Number.isSafeInteger(input.revision)||input.revision>=Number.MAX_SAFE_INTEGER))return {document:null,conflicts:['revision:exhausted']};
  return {document:changed?{...document,revision:input.revision+1}:input,conflicts:[]};
}
