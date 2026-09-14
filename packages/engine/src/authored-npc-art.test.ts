import { bootstrapContentRegistry } from '@orchard/sim';
import type { LoadedAsset } from '@orchard/ui';
import { describe, expect, it } from 'vitest';
import { authoredNpcArt, loadAuthoredNpcArt } from './authored-npc-art.js';

const supplier = bootstrapContentRegistry().npcs.get('npc:marlow')!;
const runtimeKind = supplier.runtimeKind!;

describe('authored NPC artwork', () => {
  it('uses the authored sprite under the runtime kind and removes retired mappings', async () => {
    const owner = {};
    const asset = {} as LoadedAsset;
    const names: string[] = [];
    await loadAuthoredNpcArt(owner, [supplier], async (name) => {
      names.push(name);
      return asset;
    });
    expect(names).toEqual(['npc_cf_bartender_bruno']);
    expect(authoredNpcArt(owner, runtimeKind)).toBe(asset);
    await loadAuthoredNpcArt(owner, [{ ...supplier, retired: true }], async () => asset);
    expect(authoredNpcArt(owner, runtimeKind)).toBeUndefined();
  });

  it('retries transient failures with bounded backoff and retains successful assets', async () => {
    const owner = {};
    const asset = {} as LoadedAsset;
    const delays: number[] = [];
    let calls = 0;
    await loadAuthoredNpcArt(owner, [supplier], async () => {
      if (++calls < 3) throw new Error('temporary');
      return asset;
    }, async (ms) => { delays.push(ms); });
    expect(calls).toBe(3);
    expect(delays).toEqual([250, 1000]);
    expect(authoredNpcArt(owner, runtimeKind)).toBe(asset);
    calls = 0;
    await expect(loadAuthoredNpcArt(owner, [supplier], async () => {
      calls += 1;
      throw new Error('offline');
    }, async () => undefined)).rejects.toThrow('offline');
    expect(calls).toBe(3);
    expect(authoredNpcArt(owner, runtimeKind)).toBe(asset);
  });

  it('cancels an obsolete retry without replacing the current head', async () => {
    const owner = {};
    const asset = {} as LoadedAsset;
    let calls = 0;
    let resume!: () => void;
    const old = loadAuthoredNpcArt(owner, [supplier], async () => {
      calls += 1;
      throw new Error('temporary');
    }, () => new Promise((resolve) => { resume = resolve; }));
    while (!resume) await Promise.resolve();
    await loadAuthoredNpcArt(owner, [supplier], async () => asset);
    resume();
    await old;
    expect(calls).toBe(1);
    expect(authoredNpcArt(owner, runtimeKind)).toBe(asset);
  });

  it('does not let an older content head overwrite a newer completed mapping', async () => {
    const owner = {};
    const oldAsset = {} as LoadedAsset;
    const newAsset = {} as LoadedAsset;
    let resolveOld!: (asset: LoadedAsset) => void;
    const old = loadAuthoredNpcArt(owner, [supplier], () => new Promise((resolve) => {
      resolveOld = resolve;
    }));
    await loadAuthoredNpcArt(owner, [{ ...supplier, actorAsset: 'replacement' }], async () => newAsset);
    resolveOld(oldAsset);
    await old;
    expect(authoredNpcArt(owner, runtimeKind)).toBe(newAsset);
  });
});
