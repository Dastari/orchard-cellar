import { balanceFieldsTuple } from './content/balance-fields.js';
import type { ResidenceConstructionBalanceTuple } from './content/balance-definition.js';
import {hearthDoorwayWindowConflicts} from './hearth-doorway-support.js';
import {residenceEnvelopeSize,residencePlayableTile} from './spaces.js';
import {composeHearthArchitecture,planHearthArchitecture,type HearthArchitectureCell} from './hearth-architecture.js';
import type {HearthFurniturePlacementContext} from './hearth-furniture-placement.js';
import type {ResidenceConstructionBalanceContentDefinition} from './content/balance-definition.js';
import type {ContentRegistry} from './content/registry.js';

type ResidenceConstructionPart='rustic'|'townhouse'|'wall'|'doorway'|'window';
export interface ResidenceConstructionMaterialProfile {
  readonly recipeVersion:number;
  readonly itemKinds:readonly string[];
  readonly recipes:Readonly<Record<ResidenceConstructionPart,Readonly<Record<string,number>>>>;
}
/** Resolve an immutable saved recipe version through active content. Future
 * versions may coexist; duplicate owners for one version fail closed. */
export function runtimeResidenceConstructionMaterials(
  registry:Pick<ContentRegistry,'balances'|'items'>,
  recipeVersion:number,
):ResidenceConstructionMaterialProfile|null {
  const matches=[...registry.balances.values()].filter(
    (definition):definition is ResidenceConstructionBalanceContentDefinition=>(
      definition.retired!==true&&'profile' in definition&&definition.profile==='residence_construction'
      &&definition.fields.recipeVersion===recipeVersion
    ),
  );
  if(matches.length!==1)return null;
  const values=balanceFieldsTuple('residence_construction', matches[0]!.fields) as ResidenceConstructionBalanceTuple;
  if(values.length!==12||!Number.isSafeInteger(recipeVersion)||recipeVersion<1)return null;
  const itemIds=[values[1],values[2],values[3]] as const;
  if(itemIds.some(id=>typeof id!=='string'||!/^item:[a-z0-9]+(?:_[a-z0-9]+)*$/u.test(id))
    ||new Set(itemIds).size!==3)return null;
  const items=itemIds.map(id=>registry.items.get(id));
  if(items.some((item,index)=>item===undefined||item.retired===true||item.id!==itemIds[index]))return null;
  const counts=[values[4],values[5],values[6],values[7],values[8],values[9],values[10],values[11]] as const;
  if(counts.some(count=>!Number.isSafeInteger(count)||count<1||count>8192))return null;
  const [wood,stone,copper]=itemIds.map(id=>id.slice('item:'.length)) as [string,string,string];
  return Object.freeze({recipeVersion,itemKinds:Object.freeze([wood,stone,copper]),recipes:Object.freeze({
    rustic:Object.freeze({[wood]:counts[0]!}),
    townhouse:Object.freeze({[wood]:counts[1]!,[stone]:counts[2]!}),
    wall:Object.freeze({[wood]:counts[3]!,[stone]:counts[4]!}),
    doorway:Object.freeze({[wood]:counts[5]!}),
    window:Object.freeze({[wood]:counts[6]!,[copper]:counts[7]!}),
  })});
}
export interface HearthArchitectureState {
  readonly recipeVersion: 1;
  readonly revision: bigint;
  readonly cells: readonly HearthArchitectureCell[];
}
export interface HearthArchitectureEdit {
  readonly tileX: number;
  readonly tileY: number;
  /** Omit to remove an authored cell. Implicit starter flooring has no refund. */
  readonly replacement?: HearthArchitectureCell;
}
export type HearthArchitectureEditResult = {readonly failure:string} | {
  readonly failure:null;
  readonly state:HearthArchitectureState;
  /** Signed inventory changes: negative consumes, positive returns materials.
   * Authority must prove all resulting stacks fit before committing any rows. */
  readonly materialDelta:Readonly<Record<string,number>>;
};
function materials(
  cells:readonly HearthArchitectureCell[],
  profile:ResidenceConstructionMaterialProfile,
):Record<string,number> {
  const totals:Record<string,number>={};
  for(const cell of cells) for(const kind of [cell.floor,cell.partition,cell.window?'window':undefined] as const) {
    if(kind===undefined)continue;
    for(const [item,count] of Object.entries(profile.recipes[kind])) totals[item]=(totals[item]??0)+count;
  }
  return totals;
}
/** Pure authoritative edit plan. Coordinates and replacements describe intent;
 * prices/refunds come only from persisted v1 construction and native components.
 * Caller owns role/reach checks and the final atomic inventory/state transaction. */
export function planHearthArchitectureEdits(registry:Pick<ContentRegistry,'balances'|'items'>,input:{
  readonly rank:number;
  readonly state:HearthArchitectureState;
  readonly expectedRevision:bigint;
  readonly edits:readonly HearthArchitectureEdit[];
  readonly context:Omit<HearthFurniturePlacementContext,'reserved'|'exit'>;
}):HearthArchitectureEditResult {
  const {state,context}=input;
  if(!context.canBuild)return {failure:'builder_required'};
  if(state.recipeVersion!==1 || state.revision<0n || state.revision>=0xffffffffffffffffn)return {failure:'invalid_architecture_state'};
  const materialProfile=runtimeResidenceConstructionMaterials(registry,state.recipeVersion);
  if(materialProfile===null)return {failure:'construction_material_profile_unavailable'};
  if(input.expectedRevision!==state.revision)return {failure:'architecture_stale'};
  if(input.edits.length<1 || input.edits.length>32)return {failure:'architecture_edit_limit'};
  // Validate persisted components before computing their refundable value.
  // Refund provenance must not depend on today's furniture or occupants:
  // otherwise a newly obstructed doorway could never be removed to repair it.
  const size=residenceEnvelopeSize(input.rank);
  const prior=composeHearthArchitecture(input.rank,{width:size,height:size,
    blocked:Array.from({length:size*size},(_,i)=>!residencePlayableTile(i%size,Math.floor(i/size),input.rank)),
  },state.cells);
  if(prior.failure!==null)return {failure:'architecture_state_'+prior.failure};
  const key=(cell:{tileX:number;tileY:number})=>`${cell.tileX},${cell.tileY}`;
  const next=new Map(state.cells.map(cell=>[key(cell),cell]));
  const touched=new Set<string>();
  for(const edit of input.edits) {
    if(!Number.isInteger(edit.tileX)||!Number.isInteger(edit.tileY))return {failure:'invalid_architecture_edit'};
    const id=key(edit);
    if(touched.has(id))return {failure:'duplicate_architecture_edit'};
    touched.add(id);
    const previous=next.get(id),replacement=edit.replacement;
    if(replacement!==undefined && key(replacement)!==id)return {failure:'invalid_architecture_edit'};
    if(previous?.window && replacement?.partition!=='wall')return {failure:'remove_window_first'};
    if(replacement===undefined)next.delete(id);else next.set(id,{...replacement});
  }
  const cells=[...next.values()].sort((a,b)=>a.tileY-b.tileY||a.tileX-b.tileX);
  // Paid legacy hardware conflicts remain physically traversable. Permit only
  // a strict reduction of the same conflict set, so windows can be removed one
  // at a time with their original refunds; unrelated/new conflicts cannot pass.
  const beforeConflicts=hearthDoorwayWindowConflicts(state.cells),afterConflicts=hearthDoorwayWindowConflicts(cells);
  const repair=afterConflicts.size<beforeConflicts.size&&[...afterConflicts].every(key=>beforeConflicts.has(key));
  const result=planHearthArchitecture(input.rank,context,cells,repair?afterConflicts:undefined);
  if(result.failure!==null)return {failure:result.failure};
  const before=materials(state.cells,materialProfile),after=materials(cells,materialProfile),delta:Record<string,number>={};
  for(const item of new Set([...Object.keys(before),...Object.keys(after)])) {
    const quantity=(before[item]??0)-(after[item]??0);
    if(quantity!==0)delta[item]=quantity;
  }
  const canonical=(rows:readonly HearthArchitectureCell[])=>JSON.stringify([...rows]
    .sort((a,b)=>a.tileY-b.tileY||a.tileX-b.tileX).map(cell=>[cell.tileX,cell.tileY,cell.floor??null,cell.partition??null,cell.window===true]));
  if(canonical(state.cells)===canonical(cells))return {failure:'architecture_unchanged'};
  return {failure:null,state:{recipeVersion:1,revision:state.revision+1n,cells:result.cells},materialDelta:delta};
}
