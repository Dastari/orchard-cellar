import type {NpcContentDefinition} from '@orchard/sim';
import {loadGeneratedAsset,type LoadedAsset} from '@orchard/ui';

const states=new WeakMap<object,{generation:number;assets:ReadonlyMap<string,LoadedAsset>}>();
export function authoredNpcArt(owner:object,kind:string):LoadedAsset|undefined{
  return states.get(owner)?.assets.get(kind);
}
/** Commit a complete asset mapping atomically; an older content head finishing
 * its downloads later must not replace the current head's character artwork. */
export async function loadAuthoredNpcArt(owner:object,definitions:Iterable<NpcContentDefinition>,
  load:(name:string,season:'summer')=>Promise<LoadedAsset>=loadGeneratedAsset,
  wait:(ms:number)=>Promise<void>=ms=>new Promise(resolve=>setTimeout(resolve,ms))):Promise<void>{
  const previous=states.get(owner),generation=(previous?.generation??0)+1;
  const state={generation,assets:previous?.assets??new Map<string,LoadedAsset>()};states.set(owner,state);
  const authored=[...definitions].filter(d=>d.retired!==true&&d.mount===undefined);
  const loaded=new Map<string,LoadedAsset>();
  for(let attempt=0;attempt<3;attempt++){
    if(states.get(owner)!==state)return;
    const results=await Promise.allSettled([...new Set(authored.map(d=>d.actorAsset))].map(async name=>{
      if(!loaded.has(name))loaded.set(name,await load(name,'summer'));
    }));
    if(states.get(owner)!==state)return;
    const failure=results.find(result=>result.status==='rejected');
    if(failure===undefined){
      states.set(owner,{generation,assets:new Map(authored.map(d=>[d.runtimeKind??d.id.slice('npc:'.length),loaded.get(d.actorAsset)!]))});
      return;
    }
    if(attempt===2)throw failure.reason;
    // Retry only failed assets, and only for this still-current content head.
    await wait(attempt===0?250:1000);
  }
}
