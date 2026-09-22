import {connectedObjectFamily} from './connected-objects.js';
import type {MapPrefabDocumentV2} from './map-prefab.js';
import type {ObjectPresentationRule} from './object-presentation.js';

export function mapPrefabPresentationFamily(prefab:MapPrefabDocumentV2):string|null {
 if(!prefab.id.startsWith('asset-')||prefab.placements.length!==1)return null;
 const asset=prefab.placements[0]!.assetName;if(connectedObjectFamily(asset))return null;
 return asset.replace(/_(?:mature|sapling|young|stump(?:_small|_medium)?)$/u,'');
}
function visualKey(prefab:MapPrefabDocumentV2):string {const visual=prefab.placements[0]!.visual;return `${prefab.placements[0]!.assetName}:${visual.kind}:${visual.name}:${visual.frameIndex}`;}
export function smartObjectPresentationPrefabs(prefabs:readonly MapPrefabDocumentV2[]):readonly MapPrefabDocumentV2[] {
 const groups=new Map<string,MapPrefabDocumentV2[]>();
 for(const prefab of prefabs){const key=mapPrefabPresentationFamily(prefab);if(key){const group=groups.get(key)??[];group.push(prefab);groups.set(key,group);}}
 const result:MapPrefabDocumentV2[]=[];
 for(const [family,group] of groups){
  const mature=group.find(p=>p.placements[0]!.assetName===`${family}_mature`);
  const sapling=group.find(p=>p.placements[0]!.assetName===`${family}_sapling`);
  const young=group.find(p=>p.placements[0]!.assetName===`${family}_young`);
  const base=mature??group.find(p=>p.placements[0]!.visual.name==='base')??group[0]!;
  const appearance=(p:MapPrefabDocumentV2)=>{const {assetId,assetName,visual}=p.placements[0]!;return {assetId,assetName,visual};};
  const common={...base,id:`state-${family.replaceAll('_','-')}`.slice(0,64),tags:[...base.tags,'studio.smart-state',`studio.state-family.${family}`]};
  if(mature&&sapling&&young){
   const hasStump=group.some(p=>p.placements[0]!.assetName.startsWith(`${family}_stump`));
   const rules:ObjectPresentationRule[]=[sapling,young,mature].map((p,index)=>({placementId:base.placements[0]!.id,when:{growthStage:index+1,...(hasStump?{depleted:false}:{})},appearance:appearance(p)}));
   for(const [index,suffix] of ['stump_small','stump_medium','stump'].entries()){
    const stump=group.find(p=>p.placements[0]!.assetName===`${family}_${suffix}`)??group.find(p=>p.placements[0]!.assetName===`${family}_stump`);
    if(stump)rules.push({placementId:base.placements[0]!.id,when:{growthStage:index+1,depleted:true},appearance:appearance(stump)});
   }
   result.push({...common,title:base.title.replace(/\s+mature$/iu,''),presentation:{properties:{growthStage:{type:'counter',default:3,min:1,max:3},...(rules.length>3?{depleted:{type:'bool' as const,default:false}}:{})},rules}});
  } else {
   const variants=[...new Map(group.map(p=>[visualKey(p),p])).values()];if(variants.length<2)continue;
   result.push({...common,presentation:{properties:{appearance:{type:'enum',default:visualKey(base),values:variants.map(visualKey)}},rules:variants.map(p=>({placementId:base.placements[0]!.id,when:{appearance:visualKey(p)},appearance:appearance(p)}))}});
  }
 }
 return result;
}
