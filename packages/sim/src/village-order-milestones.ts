import type {ContentRegistry} from './content/registry.js';

export interface VillageOrderProgress {
  readonly rawKinds:readonly string[];
  readonly preservedKinds:readonly string[];
  readonly bottleDelivered:boolean;
}
export const EMPTY_VILLAGE_ORDER_PROGRESS:VillageOrderProgress={rawKinds:[],preservedKinds:[],bottleDelivered:false};
const milestones=[
  {recipeId:'pantry_lunch',name:'Pantry Lunch',raw:2,preserved:1,bottle:0},
  {recipeId:'cellar_supper',name:'Cellar Supper',raw:2,preserved:2,bottle:1},
] as const;

export function villageOrderFamily(registry:ContentRegistry,itemKind:string):'raw'|'preserved'|'bottle'|null{
  const item=registry.items.get(`item:${itemKind}`);
  if(!item||item.retired===true)return null;
  if(item.tags?.includes('item.preserved'))return 'preserved';
  if([...registry.processes.values()].some(process=>process.retired!==true&&process.adapter==='fermentation'
    &&process.outputs.some(output=>output.item===item.id)))return 'bottle';
  return item.tags?.includes('item.crop')?'raw':null;
}

/** Treat persisted corruption as an error, never as fresh reward eligibility.
 * Removed content IDs remain valid historical credit and never grow the row. */
export function validateVillageOrderProgress(progress:VillageOrderProgress):void{
  const groups=[progress.rawKinds,progress.preservedKinds];
  if(typeof progress.bottleDelivered!=='boolean'||groups.some(group=>!Array.isArray(group)||group.length>3
    ||group.some(kind=>typeof kind!=='string'||!/^[a-z][a-z0-9_]{0,127}$/.test(kind))
    ||new Set(group).size!==group.length)
    ||progress.rawKinds.some(kind=>progress.preservedKinds.includes(kind)))throw new Error('order_progress_invalid');
}

export function advanceVillageOrderProgress(registry:ContentRegistry,progress:VillageOrderProgress,itemKind:string):VillageOrderProgress{
  validateVillageOrderProgress(progress);
  const family=villageOrderFamily(registry,itemKind);
  // A live-content reclassification cannot count an already delivered product twice.
  if(progress.rawKinds.includes(itemKind)||progress.preservedKinds.includes(itemKind))return progress;
  if(family==='bottle')return {...progress,bottleDelivered:true};
  if(family===null)return progress;
  const key=family==='raw'?'rawKinds':'preservedKinds';
  return progress[key].length>=3?progress:{...progress,[key]:[...progress[key],itemKind]};
}

function rewardAvailable(registry:ContentRegistry,recipeId:string):boolean{
  const recipe=registry.recipes.get(`recipe:${recipeId}`);
  const output=recipe?registry.items.get(recipe.output.item):undefined;
  return recipe!==undefined&&recipe.retired!==true&&recipe.requiresKnowledge===true&&recipe.output.item===`item:${recipeId}`&&recipe.output.count===1&&output!==undefined&&output.retired!==true;
}
export function villageOrderRewards(registry:ContentRegistry,progress:VillageOrderProgress,known:readonly string[]):readonly string[]{
  validateVillageOrderProgress(progress);
  return milestones.filter(m=>progress.rawKinds.length>=m.raw&&progress.preservedKinds.length>=m.preserved
    &&Number(progress.bottleDelivered)>=m.bottle&&!known.includes(m.recipeId)&&rewardAvailable(registry,m.recipeId)).map(m=>m.recipeId);
}
export function villageOrderMilestoneDisplay(registry:ContentRegistry,progress:VillageOrderProgress,known:readonly string[]){
  validateVillageOrderProgress(progress);
  const next=milestones.find(m=>!known.includes(m.recipeId));
  if(!next)return {milestoneTitle:'BOTH MEAL RECIPES LEARNED',milestoneProgress:'Prepare meals in your recipe book.'};
  const raw=Math.min(progress.rawKinds.length,next.raw),preserved=Math.min(progress.preservedKinds.length,next.preserved);
  const ready=raw===next.raw&&preserved===next.preserved&&Number(progress.bottleDelivered)>=next.bottle;
  return {milestoneTitle:`${next.name.toUpperCase()}${rewardAvailable(registry,next.recipeId)?ready?' - NEXT DELIVERY':'':' - UNAVAILABLE'}`,
    milestoneProgress:`Distinct raw ${raw}/${next.raw}  Preserved ${preserved}/${next.preserved}${next.bottle?`  Bottle ${Number(progress.bottleDelivered)}/1`:''}`};
}
