import {composeHearthArchitecture} from './hearth-architecture.js';
import type {CollisionMap} from './state.js';
import type {HearthArchitectureCell} from './hearth-architecture.js';
import type {HearthArchitectureEdit,HearthArchitectureState} from './hearth-architecture-edits.js';
/** Strict storage boundary. Reject corrupt/future records rather than silently
 * dropping paid construction or interpreting a future material recipe as v1. */
export function parseHearthArchitectureState(json:string):HearthArchitectureState|null {
  if(json.length>65536)return null;
  let value:unknown;
  try{value=JSON.parse(json);}catch{return null;}
  const record=(input:unknown):input is Record<string,unknown>=>input!==null&&typeof input==='object'&&!Array.isArray(input);
  if(!record(value)||value.recipeVersion!==1||typeof value.revision!=='string'||!/^(0|[1-9][0-9]{0,19})$/.test(value.revision)
    ||!Array.isArray(value.cells)||value.cells.length>318||Object.keys(value).some(key=>!['recipeVersion','revision','cells'].includes(key)))return null;
  const revision=BigInt(value.revision);
  if(revision>0xffffffffffffffffn)return null;
  const cells:HearthArchitectureCell[]=[],seen=new Set<string>();
  for(const cell of value.cells) {
    if(!record(cell)||Object.keys(cell).some(key=>!['tileX','tileY','floor','partition','window'].includes(key)))return null;
    const {tileX,tileY,floor,partition,window}=cell;
    if(typeof tileX!=='number'||typeof tileY!=='number'||!Number.isInteger(tileX)||!Number.isInteger(tileY)
      ||tileX<0||tileY<0||tileX>=32||tileY>=32)return null;
    if(floor!==undefined&&floor!=='rustic'&&floor!=='townhouse')return null;
    if(partition!==undefined&&partition!=='wall'&&partition!=='doorway')return null;
    if(window!==undefined&&typeof window!=='boolean')return null;
    if(floor===undefined&&partition===undefined&&!window)return null;
    const key=`${tileX},${tileY}`;if(seen.has(key))return null;seen.add(key);
    cells.push({tileX,tileY,...(floor===undefined?{}:{floor}),...(partition===undefined?{}:{partition}),...(window===undefined?{}:{window})});
  }
  return {recipeVersion:1,revision,cells};
}
export function serializeHearthArchitectureState(state:HearthArchitectureState):string {
  const json=JSON.stringify({recipeVersion:state.recipeVersion,revision:state.revision.toString(),
    cells:[...state.cells].sort((a,b)=>a.tileY-b.tileY||a.tileX-b.tileX)});
  if(parseHearthArchitectureState(json)===null)throw new Error('invalid_architecture_state');
  return json;
}

export const EMPTY_HEARTH_ARCHITECTURE_JSON='{"recipeVersion":1,"revision":"0","cells":[]}';
/** Shared read path for persisted construction. Corrupt paid state closes the
 * affected home's collision instead of silently deleting walls or crashing a
 * world-wide authority tick. Authoring must surface/repair the invalid record. */
export function persistedHearthArchitectureCollision(rank:number,baseline:CollisionMap,json:string|undefined):CollisionMap {
  if(json===undefined||json===EMPTY_HEARTH_ARCHITECTURE_JSON)return baseline;
  const state=parseHearthArchitectureState(json);
  const result=state===null?null:composeHearthArchitecture(rank,baseline,state.cells);
  return result?.failure===null?result.collision:{...baseline,blocked:new Uint8Array(baseline.width*baseline.height).fill(1)};
}


export function parseHearthArchitectureEdits(json:string):readonly HearthArchitectureEdit[]|null {
  if(json.length>16384)return null;
  let input:unknown;try{input=JSON.parse(json);}catch{return null;}
  if(!Array.isArray(input)||input.length<1||input.length>32)return null;
  const edits:HearthArchitectureEdit[]=[];
  for(const entry of input) {
    if(entry===null||typeof entry!=='object'||Array.isArray(entry))return null;
    const row=entry as Record<string,unknown>;
    if(Object.keys(row).some(key=>!['tileX','tileY','replacement'].includes(key)))return null;
    if(typeof row.tileX!=='number'||typeof row.tileY!=='number'||!Number.isInteger(row.tileX)||!Number.isInteger(row.tileY)
      ||row.tileX<0||row.tileX>=32||row.tileY<0||row.tileY>=32)return null;
    if(row.replacement===undefined){edits.push({tileX:row.tileX,tileY:row.tileY});continue;}
    const decoded=parseHearthArchitectureState(JSON.stringify({recipeVersion:1,revision:'0',cells:[row.replacement]}));
    const replacement=decoded?.cells[0];
    if(!replacement||replacement.tileX!==row.tileX||replacement.tileY!==row.tileY)return null;
    edits.push({tileX:row.tileX,tileY:row.tileY,replacement});
  }
  return edits;
}
