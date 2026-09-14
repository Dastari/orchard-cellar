import { describe, expect, it, vi } from 'vitest';
import { bootstrapContentRegistry } from '@orchard/sim';
import { HearthSealFlow } from './hearth-seal-flow.js';
const registry = bootstrapContentRegistry(), npcId = BigInt(registry.npcs.get('npc:willow_archivist')!.runtimeId);
function fixture() {
  const flow = new HearthSealFlow();
  const update = (known = new Set<string>(), scope: string | null = 'alice:1', node = 'shop') => flow.update(scope, npcId, node, registry, known);
  update(); return { flow, update };
}
describe('legendary seal review and acknowledgement', () => {
  it('offers all eight missing recipes only in the current Iona shop session', () => {
    const { flow, update } = fixture(); expect(flow.offers).toHaveLength(8);
    update(new Set(['hearth_legendary_sword'])); expect(flow.offers).toHaveLength(7);
    update(new Set(), 'alice:1', 'greeting'); expect(flow.offers).toEqual([]);
    flow.update('alice:1', 1n, 'shop', registry, new Set()); expect(flow.offers).toEqual([]);
  });
  it('waits for owner knowledge rather than the promise and prevents double submission', async () => {
    const { flow, update } = fixture(); flow.select('hearth_legendary_sword');
    const send = vi.fn(async () => {}); await flow.unlock(send);
    expect(flow.pending).toBe(true); expect(flow.notice).toContain('Waiting');
    expect(await flow.unlock(send)).toBe(false); expect(send).toHaveBeenCalledTimes(1);
    expect(flow.cancel()).toBe(false);
    update(new Set(['hearth_legendary_sword'])); expect(flow.pending).toBe(false); expect(flow.review).toBeNull();
    expect(flow.notice).toContain('Recipe learned');
  });
  it('ignores late callbacks after reconnect or an authoritative acknowledgement', async () => {
    const { flow, update } = fixture(); flow.select('hearth_legendary_sword');
    let reject!: (error: Error) => void;
    const task = flow.unlock(() => new Promise<void>((_resolve, fail) => { reject = fail; }));
    update(new Set(), 'alice:2'); reject(new Error('guardian_seals_missing')); await task;
    expect(flow.notice).toBe(''); expect(flow.pending).toBe(false);
    flow.select('hearth_legendary_sword');
    const task2 = flow.unlock(() => new Promise<void>((_resolve, fail) => { reject = fail; }));
    update(new Set(['hearth_legendary_sword']), 'alice:2'); reject(new Error('late')); await task2;
    expect(flow.notice).toContain('Recipe learned');
  });
  it('invalidates changed quotes and requires explicit review after a rejection', async () => {
    const { flow } = fixture(); flow.select('hearth_legendary_sword');
    flow.update('alice:1', npcId, 'shop', { ...registry, contentHash: 'changed' }, new Set());
    expect(flow.review).toBeNull(); expect(flow.notice).toContain('changed');
    flow.select('hearth_legendary_sword');
    const send = vi.fn(async () => { throw new Error('guardian_seals_missing'); });
    await flow.unlock(send); expect(flow.notice).toContain('hotbar or backpack');
    expect(await flow.unlock(send)).toBe(false); expect(send).toHaveBeenCalledTimes(1);
  });
});
