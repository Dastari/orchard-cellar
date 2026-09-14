import {describe,it,expect} from 'vitest';
import {bootstrapContentRegistry} from '@orchard/sim';
import type {LoadedAsset} from '@orchard/ui';
import {authoredNpcArt,loadAuthoredNpcArt} from './authored-npc-art.js';
const supplier=bootstrapContentRegistry().npcs.get('npc:delve_quartermaster')!;
describe('authored NPC artwork',()=>{
  it('uses the authored sprite under the runtime kind and removes retired mappings',async()=>{
    const owner={},asset={} as LoadedAsset,names:string[]=[];
    await loadAuthoredNpcArt(owner,[supplier],async name=>{names.push(name);return asset;});
    expect(names).toEqual(['npc_cf_miner_mike']);expect(authoredNpcArt(owner,'delve_quartermaster')).toBe(asset);
    await loadAuthoredNpcArt(owner,[{...supplier,retired:true}],async()=>asset);
    expect(authoredNpcArt(owner,'delve_quartermaster')).toBeUndefined();
  });
  it('retries transient failures with bounded backoff and retains successful assets',async()=>{
    const owner={},asset={} as LoadedAsset,delays:number[]=[];let calls=0;
    await loadAuthoredNpcArt(owner,[supplier],async()=>{if(++calls<3)throw new Error('temporary');return asset;},async ms=>{delays.push(ms);});
    expect(calls).toBe(3);expect(delays).toEqual([250,1000]);expect(authoredNpcArt(owner,'delve_quartermaster')).toBe(asset);
    calls=0;
    await expect(loadAuthoredNpcArt(owner,[supplier],async()=>{calls++;throw new Error('offline');},async()=>{})).rejects.toThrow('offline');
    expect(calls).toBe(3);expect(authoredNpcArt(owner,'delve_quartermaster')).toBe(asset);
  });
  it('cancels an obsolete retry without restarting or replacing the current head',async()=>{
    const owner={},asset={} as LoadedAsset;let calls=0,resume!:()=>void;
    const old=loadAuthoredNpcArt(owner,[supplier],async()=>{calls++;throw new Error('temporary');},()=>new Promise(resolve=>{resume=resolve;}));
    // Wait for the failed attempt to settle into its controlled backoff.
    while(!resume)await Promise.resolve();
    await loadAuthoredNpcArt(owner,[supplier],async()=>asset);resume();await old;
    expect(calls).toBe(1);expect(authoredNpcArt(owner,'delve_quartermaster')).toBe(asset);
  });
  it('does not let an older content head overwrite a newer completed mapping',async()=>{
    const owner={},oldAsset={} as LoadedAsset,newAsset={} as LoadedAsset;
    let resolveOld!:(asset:LoadedAsset)=>void;
    const old=loadAuthoredNpcArt(owner,[supplier],()=>new Promise(resolve=>{resolveOld=resolve;}));
    await loadAuthoredNpcArt(owner,[{...supplier,actorAsset:'replacement'}],async()=>newAsset);
    resolveOld(oldAsset);await old;expect(authoredNpcArt(owner,'delve_quartermaster')).toBe(newAsset);
  });
});
