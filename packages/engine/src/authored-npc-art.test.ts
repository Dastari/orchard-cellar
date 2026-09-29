import {describe,it,expect,vi} from 'vitest';
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

describe('lazily bound authored NPC art (static world S6)', () => {
  it('loads an NPC sprite only when first drawn, and follows rebinding at once', async () => {
    const lazy = await import('./lazy-art.js');
    const { bindAuthoredNpcArt, authoredNpcArt } = await import('./authored-npc-art.js');
    const requested: string[] = [];
    lazy.setLazyArtLoaderForTests(async name => { requested.push(name); return { name } as never; });
    try {
      const owner = {};
      const npc = (id: string, actorAsset: string, extra: object = {}) => ({ id: `npc:${id}`, actorAsset, ...extra }) as never;
      bindAuthoredNpcArt(owner, [npc('bruno', 'npc_cf_bruno'), npc('retired', 'npc_cf_old', { retired: true })]);
      expect(requested).toEqual([]);
      expect(authoredNpcArt(owner, 'bruno')).toBeUndefined();
      await vi.waitFor(() => expect(authoredNpcArt(owner, 'bruno')?.name).toBe('npc_cf_bruno'));
      expect(authoredNpcArt(owner, 'retired')).toBeUndefined();
      bindAuthoredNpcArt(owner, [npc('bruno', 'npc_cf_bruno_2')]);
      expect(authoredNpcArt(owner, 'bruno')).toBeUndefined();
      await vi.waitFor(() => expect(authoredNpcArt(owner, 'bruno')?.name).toBe('npc_cf_bruno_2'));
      expect(requested).toEqual(['npc_cf_bruno', 'npc_cf_bruno_2']);
    } finally { lazy.setLazyArtLoaderForTests(null); }
  });
});
