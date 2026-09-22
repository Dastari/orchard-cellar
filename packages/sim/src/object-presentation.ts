import type {ObjectStateDefinition} from './content/object-definition.js';
import {isMapStampPlacement,type MapStampPlacement} from './map-stamp.js';

export type ObjectPropertyValue=string|number|boolean;
export type ObjectPropertyState=Readonly<Record<string,ObjectPropertyValue>>;
export interface ObjectPresentationRule {
 readonly when:ObjectPropertyState;
 readonly placementId:string;
 readonly appearance:Pick<MapStampPlacement,'assetId'|'assetName'|'visual'>;
 readonly scalePermille?:number;
}
/** Shared declaration for authored scenery, growth, switches and visual variants.
 * Uses the same property vocabulary as functional content object definitions. */
export interface ObjectPresentation {
 readonly properties:Readonly<Record<string,ObjectStateDefinition>>;
 readonly rules:readonly ObjectPresentationRule[];
}
const keyPattern=/^[a-zA-Z][a-zA-Z0-9_.-]{0,63}$/u;
function record(value:unknown):Record<string,unknown> {
 if(!value||typeof value!=='object'||Array.isArray(value))throw new TypeError('object_state_invalid');
 return value as Record<string,unknown>;
}
export function objectPropertyMatches(value:unknown,schema:ObjectStateDefinition):value is ObjectPropertyValue {
 return schema.type==='bool'?typeof value==='boolean':schema.type==='enum'?typeof value==='string'&&schema.values.includes(value)
  :typeof value==='number'&&Number.isSafeInteger(value)&&value>=(schema.min??Number.MIN_SAFE_INTEGER)&&value<=(schema.max??Number.MAX_SAFE_INTEGER);
}
export function parseObjectPropertyState(value:unknown,properties?:ObjectPresentation['properties']):ObjectPropertyState {
 const entries=Object.entries(record(value));if(entries.length>32)throw new TypeError('object_state_too_large');
 for(const [key,value] of entries)if(!keyPattern.test(key)||!(typeof value==='boolean'||typeof value==='string'&&value.length<=128||typeof value==='number'&&Number.isSafeInteger(value))
  ||properties&&(!Object.prototype.hasOwnProperty.call(properties,key)||!objectPropertyMatches(value,properties[key]!)))throw new TypeError('object_state_value_invalid');
 return Object.fromEntries(entries.sort(([a],[b])=>a.localeCompare(b))) as ObjectPropertyState;
}
export function parseObjectPresentation(value:unknown,placementIds:readonly string[]):ObjectPresentation {
 const input=record(value),properties:Record<string,ObjectStateDefinition>={};
 const entries=Object.entries(record(input['properties']));if(!entries.length||entries.length>32)throw new TypeError('object_properties_invalid');
 for(const [key,value] of entries){const s=record(value);let schema:ObjectStateDefinition;
  if(!keyPattern.test(key))throw new TypeError('object_property_key_invalid');
  if(s['type']==='bool'&&typeof s['default']==='boolean')schema={type:'bool',default:s['default']};
  else if(s['type']==='enum'&&typeof s['default']==='string'&&Array.isArray(s['values'])&&s['values'].length>0&&s['values'].length<=256&&s['values'].every(v=>typeof v==='string'&&v.length<=128))schema={type:'enum',default:s['default'],values:s['values'] as string[]};
  else if(s['type']==='counter'&&typeof s['default']==='number'&&Number.isSafeInteger(s['default'])
   &&(s['min']===undefined||Number.isSafeInteger(s['min']))&&(s['max']===undefined||Number.isSafeInteger(s['max'])))schema={type:'counter',default:s['default'],...(s['min']===undefined?{}:{min:s['min'] as number}),...(s['max']===undefined?{}:{max:s['max'] as number})};
  else throw new TypeError('object_property_schema_invalid');
  if(!objectPropertyMatches(schema.default,schema))throw new TypeError('object_property_default_invalid');properties[key]=schema;
 }
 if(!Array.isArray(input['rules'])||input['rules'].length>512)throw new TypeError('object_visual_rules_invalid');
 const rules=input['rules'].map((value):ObjectPresentationRule=>{
  const r=record(value),appearance=record(r['appearance']);
  const probe={...appearance,id:'probe',tileX:0,tileY:0,elevation:0,layer:'object',quarterTurns:0,flipX:false};
  if(typeof r['placementId']!=='string'||!placementIds.includes(r['placementId'])||!isMapStampPlacement(probe,1,1)
   ||r['scalePermille']!==undefined&&(!Number.isInteger(r['scalePermille'])||Number(r['scalePermille'])<100||Number(r['scalePermille'])>4000))throw new TypeError('object_visual_rule_invalid');
  return {when:parseObjectPropertyState(r['when'],properties),placementId:r['placementId'],appearance:{assetId:probe.assetId,assetName:probe.assetName,visual:probe.visual},...(r['scalePermille']===undefined?{}:{scalePermille:r['scalePermille'] as number})};
 });
 return {properties:Object.fromEntries(Object.entries(properties).sort(([a],[b])=>a.localeCompare(b))),rules};
}
export function objectPropertyValues(presentation:ObjectPresentation,state:ObjectPropertyState={}):ObjectPropertyState {
 return {...Object.fromEntries(Object.entries(presentation.properties).map(([key,schema])=>[key,schema.default])),...state};
}
export function resolveObjectAppearance(placement:MapStampPlacement,presentation:ObjectPresentation|undefined,state:ObjectPropertyState={}) {
 let result={placement,scalePermille:1000};if(!presentation)return result;
 const values=objectPropertyValues(presentation,state);
 for(const rule of presentation.rules)if(rule.placementId===placement.id&&Object.entries(rule.when).every(([key,value])=>values[key]===value))result={placement:{...placement,...rule.appearance},scalePermille:rule.scalePermille??1000};
 return result;
}
