import { describe, expect, it, vi } from 'vitest';
import type { LoadedAsset } from '@orchard/ui';
import { actionVisualForDirection, type OverworldArt } from '@orchard/engine/overworld-art';
import { AuthoredActionArt } from './action-art.js';

describe('authored equipped tool artwork', () => {
  it('loads a registry-selected custom asset once and never shows the iron fallback while pending', async () => {
    const iron = { metadata: { animations: { axe_down: [] } } } as unknown as LoadedAsset;
    const wood = { metadata: { animations: { axe_down: [] } } } as unknown as LoadedAsset;
    const body = { metadata: { animations: { swing_axe_down: [] } } } as unknown as LoadedAsset;
    const art = { actionAssets: { swing_axe: iron }, playerRig: { base: { action: body } } } as unknown as OverworldArt;
    let finish!: (asset: LoadedAsset) => void;
    const load = vi.fn(() => new Promise<LoadedAsset>((resolve) => { finish = resolve; }));
    const ready = vi.fn();
    const cache = new AuthoredActionArt(ready, load);
    expect(actionVisualForDirection(art, 'swing_axe', 'down', cache.resolve('custom_oak_axe')))
      .toEqual({ asset: body, animation: 'swing_axe_down', toolAnimation: 'swing_axe_down', drawTool: false });
    cache.resolve('custom_oak_axe');
    expect(load).toHaveBeenCalledTimes(1);
    finish(wood);
    await Promise.resolve();
    expect(actionVisualForDirection(art, 'swing_axe', 'down', cache.resolve('custom_oak_axe'))?.asset).toBe(wood);
    expect(ready).toHaveBeenCalledOnce();
    expect(actionVisualForDirection(art, 'swing_axe', 'down', cache.resolve(undefined))?.asset).toBe(iron);
  });

  it('keeps a missing authored asset absent without retrying every rendered frame', async () => {
    const load = vi.fn(async () => { throw new Error('missing asset'); });
    const cache = new AuthoredActionArt(vi.fn(), load);
    expect(cache.resolve('unavailable')).toBeNull();
    await Promise.resolve();
    await Promise.resolve();
    expect(cache.resolve('unavailable')).toBeNull();
    expect(load).toHaveBeenCalledOnce();
  });
});
