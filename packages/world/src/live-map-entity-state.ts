import {parseMapEntityStates,parseObjectPropertyState,resourceEditableProperties,type MapDocumentV3,type ResourceContentDefinition} from '@orchard/sim';
export interface EditableResourceRow {readonly id:bigint;readonly spaceId:number;readonly health:number;readonly depleted:boolean;readonly growthStage:number}
export interface ResourceStateChange {readonly id:bigint;readonly state:{readonly health?:number;readonly depleted?:boolean;readonly growthStage?:number}}

/** Validate the complete edit set before writes. Subsequent ordinary game ticks
 * own these values again; unchanged map records never replay a state edit. */
export function planLiveMapEntityStates(previous:MapDocumentV3|null,next:MapDocumentV3,
 find:(id:bigint)=>EditableResourceRow|null,definition:(row:EditableResourceRow)=>ResourceContentDefinition|null):readonly ResourceStateChange[] {
 const before=new Map(parseMapEntityStates(previous?.entityStates??[]).map(e=>[e.id,e]));const after=new Map(parseMapEntityStates(next.entityStates??[]).map(e=>[e.id,e]));
 const changes:ResourceStateChange[]=[];
 for(const key of new Set([...before.keys(),...after.keys()])){
  const prior=before.get(key),edit=after.get(key);if(JSON.stringify(prior)===JSON.stringify(edit))continue;
  const target=edit??prior!,row=find(BigInt(target.entityId)),schema=row&&definition(row);
  if(!row||row.spaceId!==0||!schema||next.id!=='live-island')throw new Error('map_entity_state_target_unavailable');
  const expected=edit?.baseState??prior!.state,state=edit?.state??prior!.baseState;
  const properties=resourceEditableProperties(schema);
  parseObjectPropertyState(expected,properties);parseObjectPropertyState(state,properties);
  for(const [property,value] of Object.entries(expected))if(row[property as keyof EditableResourceRow]!==value)throw new Error('map_entity_state_conflict');
  const nextState={...row,...state};
  const maxHealth=schema.health.followsGrowthStage?nextState.growthStage:schema.health.initial;
  if(nextState.health>maxHealth||nextState.depleted!==(nextState.health===0))throw new Error('map_resource_health_state_invalid');
  changes.push({id:row.id,state});
 }
 return changes;
}
