import {authorityDayProgress,clockMinutesAtDayProgress} from './time.js';
import type {MapDocumentV3} from './map-document-v3.js';
export const STREETLAMP_DEFINITION='object:hearth_streetlamp';
export type StreetlampMode='auto'|'on'|'off';
/** Reserved world_placeable identity range for map-materialized town lamps. */
export const STREETLAMP_ID_BASE=3_400_000_000n;
const STREETLAMP_GRID=512;
/** True for the reserved identities `settleTownStreetlamps` inserts under world authority. */
export function isMaterializedStreetlampId(id:bigint):boolean{
 return id>=STREETLAMP_ID_BASE&&id<STREETLAMP_ID_BASE+BigInt(STREETLAMP_GRID*STREETLAMP_GRID);
}
export function streetlampState(stateJson:string,calendarTick:bigint):{lit:boolean;stateJson:string}{
 const state=JSON.parse(stateJson) as {mode?:unknown};
 const mode=state.mode??'auto';
 if(!['auto','on','off'].includes(String(mode)))throw new Error('Invalid streetlamp mode');
 const minutes=clockMinutesAtDayProgress(authorityDayProgress(calendarTick));
 const lit=mode==='on'||(mode==='auto'&&(minutes>=18*60||minutes<6*60));
 return {lit,stateJson:JSON.stringify({mode,lit})};
}
export interface StreetlampPlan {readonly id:bigint;readonly tileX:number;readonly tileY:number;readonly objectId:string}
const plansCache=new WeakMap<MapDocumentV3,readonly StreetlampPlan[]>();
/** Stable reserved coordinate identities; lamp locations are authored on the map. */
export function mapStreetlampPlans(document:MapDocumentV3):readonly StreetlampPlan[]{
 const cached=plansCache.get(document);if(cached)return cached;
 const prefabs=new Map(document.prefabs.map(p=>[p.id,p]));
 const plans:StreetlampPlan[]=[];
 for(const object of document.objects){
  if(!object.enabled)continue;
  const prefab=prefabs.get(object.prefabId);
  if(!prefab?.placements.some(p=>p.assetName==='prop_cf_hearth_streetlamp'))continue;
  // Town lamp prefabs contain one unrotated, pivot-aligned native fixture.
  if(object.quarterTurns!==0||object.flipX||(object.scale??1)!==1||prefab.revision!==object.prefabRevision||prefab.placements.length!==1)throw new Error(`Unsupported streetlamp transform: ${object.id}`);
  const p=prefab.placements[0]!;
  if(p.quarterTurns!==0||p.flipX)throw new Error(`Unsupported streetlamp placement transform: ${object.id}`);
  const tileX=object.tileX+p.tileX-prefab.pivot.tileX,tileY=object.tileY+p.tileY-prefab.pivot.tileY;
  if(tileX<0||tileY<0||tileX>=STREETLAMP_GRID||tileY>=STREETLAMP_GRID||!Number.isInteger(tileX)||!Number.isInteger(tileY))throw new Error('Streetlamp outside reserved map grid');
  plans.push({id:STREETLAMP_ID_BASE+BigInt(tileY*STREETLAMP_GRID+tileX),tileX,tileY,objectId:object.id});
 }
 if(new Set(plans.map(p=>p.id)).size!==plans.length)throw new Error('Duplicate streetlamp position');
 plansCache.set(document,plans);return plans;
}
