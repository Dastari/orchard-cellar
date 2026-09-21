import {HEARTH_ISLANDS,type MapDocumentV3,type MapObjectInstance,type TerrainTransition} from '@orchard/sim';

const canonical=(value:unknown):string=>{
  if(Array.isArray(value))return `[${value.map(canonical).join(',')}]`;
  if(value!==null&&typeof value==='object')return `{${Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  return JSON.stringify(value)??'null';
};
const island=HEARTH_ISLANDS.willowharbour;
const inside=(x:number,y:number)=>x>=island.minX&&x<=island.maxX&&y>=island.minY&&y<=island.maxY;
const cellInside=(key:string)=>{const [x,y]=key.split(',').map(Number);return inside(x!,y!);};
const objectInside=(row:MapObjectInstance)=>inside(row.tileX,row.tileY);
const transitionInside=(row:TerrainTransition)=>inside(row.lowerTileX,row.lowerTileY)||inside(row.upperTileX,row.upperTileY);

/** An explicit offline upgrade against the operator's reviewed prior export.
 * Every prior village cell/object/prefab must still match; independently authored
 * edits are conflicts, never silently cleared. The ordinary composer then checks
 * foreign overhang, scenery, anchors, policy and new assets as usual. */
export function prepareWillowharbourUpgrade(input:MapDocumentV3,reviewedBaseline:MapDocumentV3):MapDocumentV3 {
  if(input.id!==reviewedBaseline.id||input.width!==reviewedBaseline.width||input.height!==reviewedBaseline.height
    ||canonical(input.provenance)!==canonical(reviewedBaseline.provenance))throw new Error('willow_upgrade_baseline_mismatch');
  const cells=(map:MapDocumentV3)=>Object.fromEntries(Object.entries(map.cells).filter(([key])=>cellInside(key)));
  const objects=(map:MapDocumentV3)=>map.objects.filter(objectInside).sort((a,b)=>a.id.localeCompare(b.id));
  const previousObjects=objects(reviewedBaseline);
  if(previousObjects.length===0||Object.keys(cells(reviewedBaseline)).length===0)throw new Error('willow_upgrade_baseline_empty');
  const prefabIds=new Set(previousObjects.map(row=>row.prefabId));
  const prefabs=(map:MapDocumentV3)=>map.prefabs.filter(row=>prefabIds.has(row.id)).sort((a,b)=>a.id.localeCompare(b.id));
  if(canonical(cells(input))!==canonical(cells(reviewedBaseline)))throw new Error('willow_upgrade_cell_conflict');
  if(canonical(objects(input))!==canonical(previousObjects))throw new Error('willow_upgrade_object_conflict');
  if(canonical(prefabs(input))!==canonical(prefabs(reviewedBaseline)))throw new Error('willow_upgrade_prefab_conflict');
  if(canonical(input.transitions.filter(transitionInside))!==canonical(reviewedBaseline.transitions.filter(transitionInside)))
    throw new Error('willow_upgrade_transition_conflict');
  const sharedPrefabIds=new Set(input.objects.filter(row=>!objectInside(row)).map(row=>row.prefabId));
  return {...input,cells:Object.fromEntries(Object.entries(input.cells).filter(([key])=>!cellInside(key))),
    objects:input.objects.filter(row=>!objectInside(row)),prefabs:input.prefabs.filter(row=>!prefabIds.has(row.id)||sharedPrefabIds.has(row.id)),
    transitions:input.transitions.filter(row=>!transitionInside(row))};
}
