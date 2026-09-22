import {parseObjectPropertyState,type ObjectPropertyState} from './object-presentation.js';
import type {ObjectStateDefinition} from './content/object-definition.js';
import type {ResourceContentDefinition} from './content/resource-definition.js';

/** One-shot state edit, compared against live values at atomic publication.
 * Published intent never pins a growing/harvested resource to an old state. */
export interface MapEntityStateEdit {
 readonly id:string;
 readonly entityKind:'resource';
 readonly entityId:string;
 readonly baseState:ObjectPropertyState;
 readonly state:ObjectPropertyState;
}
export function resourceEditableProperties(definition:ResourceContentDefinition):Readonly<Record<string,ObjectStateDefinition>> {
 return {health:{type:'counter',default:definition.health.initial,min:0,max:Math.max(definition.health.initial,definition.health.followsGrowthStage?3:0)},
  depleted:{type:'bool',default:false},...(definition.visual.kind==='tree'?{growthStage:{type:'counter' as const,default:3,min:1,max:3}}:{})};
}
export function parseMapEntityStates(value:unknown):readonly MapEntityStateEdit[] {
 if(!Array.isArray(value)||value.length>100000)throw new TypeError('map_entity_states_invalid');
 const ids=new Set<string>();
 return value.map((value):MapEntityStateEdit=>{
  if(!value||typeof value!=='object'||Array.isArray(value))throw new TypeError('map_entity_state_invalid');
  const r=value as Record<string,unknown>;
  if(r['entityKind']!=='resource'||typeof r['entityId']!=='string'||!/^[1-9][0-9]{0,19}$/u.test(r['entityId'])||BigInt(r['entityId'])>0xffffffffffffffffn
   ||r['id']!==`resource:${r['entityId']}`||ids.has(r['id']))throw new TypeError('map_entity_state_target_invalid');
  ids.add(r['id']);const baseState=parseObjectPropertyState(r['baseState']),state=parseObjectPropertyState(r['state']);
  if(!Object.keys(state).length||Object.keys(state).join('|')!==Object.keys(baseState).join('|'))throw new TypeError('map_entity_state_base_invalid');
  return {id:r['id'],entityKind:'resource',entityId:r['entityId'],baseState,state};
 }).sort((a,b)=>a.id.localeCompare(b.id));
}
