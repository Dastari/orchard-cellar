import { expect, it, vi } from 'vitest';
import type { LoadedAsset } from '@orchard/ui';
const mocks = vi.hoisted(() => ({ registry: vi.fn(), load: vi.fn() }));
vi.mock('@orchard/ui', async original => ({ ...await original<typeof import('@orchard/ui')>(),
  loadGeneratedAssetRegistry: mocks.registry, loadGeneratedAsset: mocks.load }));
import { HEARTH_RESOURCE_ASSET_NAMES, loadHearthResourceArt } from './hearth-resource-art.js';
it('loads only assets in the current atlas and keeps old-atlas loading valid', async () => {
  mocks.registry.mockResolvedValue({ assetsById: {} }); mocks.load.mockClear();
  expect(await loadHearthResourceArt()).toEqual({}); expect(mocks.load).not.toHaveBeenCalled();
});
it('loads all named nodes and adjusts only the dedicated stump contact without mutating shared art', async () => {
  mocks.registry.mockResolvedValue({ assetsById: Object.fromEntries(Object.values(HEARTH_RESOURCE_ASSET_NAMES).map((name,index)=>[index,name])) });
  const original = { anchor: [8,15], image: {}, metadata: {} } as unknown as LoadedAsset;
  mocks.load.mockReset().mockResolvedValue(original);
  const bank = await loadHearthResourceArt();
  expect(Object.keys(bank).sort()).toEqual(Object.keys(HEARTH_RESOURCE_ASSET_NAMES).sort());
  expect(mocks.load).toHaveBeenCalledTimes(5);
  expect(bank.tree_ashwood).toBe(original); expect(bank.tree_ashwood_stump).not.toBe(original);
  expect(bank.tree_ashwood_stump?.anchor).toEqual([8,13]); expect(original.anchor).toEqual([8,15]);
});
