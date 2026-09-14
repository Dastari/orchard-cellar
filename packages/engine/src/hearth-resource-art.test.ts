import { expect, it, vi } from 'vitest';
import { bootstrapContentRegistry } from '@orchard/sim';
import type { LoadedAsset } from '@orchard/ui';
import { authoredResourceVisual, drawOverworldTree, drawOverworldStump, drawOverworldOreNode, treeRegrowthVisual, type OverworldArt } from './overworld-art.js';
function asset(name: string, width: number, height: number, anchor: readonly [number,number]): LoadedAsset {
  return { image: { name }, anchor, metadata: { animations: { base: [{ x:0,y:0,width,height,durationTicks:1 }] } } } as unknown as LoadedAsset;
}
const bank = {
  rock_basalt: asset('basalt',32,32,[16,23]), ore_cinder: asset('cinder',16,32,[8,29]),
  ore_emberglass: asset('emberglass',16,32,[8,29]), tree_ashwood: asset('ashwood',48,64,[25,52]),
  tree_ashwood_stump: asset('stump',16,16,[8,13]),
};
const art = { hearthResources: bank } as unknown as OverworldArt;
it('draws all mineral classes at their native contact without legacy ore substitution', () => {
  for (const kind of ['rock_basalt','ore_cinder','ore_emberglass'] as const) {
    for (const nodeClass of ['rock','mixed','pure','pristine'] as const) {
      const drawImage = vi.fn(), native = bank[kind];
      drawOverworldOreNode({ drawImage, save() {}, restore() {} } as unknown as CanvasRenderingContext2D, art, kind,100,100,0,0,1,nodeClass,2);
      expect(drawImage).toHaveBeenCalledOnce();
      expect(drawImage.mock.calls[0]![0]).toBe(native.image);
      expect(drawImage.mock.calls[0]!.slice(5,7)).toEqual([100-native.anchor[0],100-native.anchor[1]]);
    }
  }
});
it('keeps full ashwood and its stump on the same ground contact without the legacy four-pixel offset', () => {
  const drawImage=vi.fn(), context={drawImage,save(){},restore(){}} as unknown as CanvasRenderingContext2D;
  drawOverworldTree(context,art,100,100,false,0,0,1,'tree_ashwood');
  expect(drawImage.mock.calls[0]!.slice(5,7)).toEqual([75,48]);
  drawOverworldStump(context,art,100,100,0,0,1,'tree_ashwood');
  expect(drawImage.mock.calls[1]!.slice(5,7)).toEqual([92,87]);
  for (const stage of ['small','medium'] as const) expect(treeRegrowthVisual(art,'tree_ashwood',stage)).toEqual({asset:bank.tree_ashwood_stump,scale:1});
});
it('shows an explicit missing-art marker instead of invisible blocking nodes on an older atlas', () => {
  const drawImage=vi.fn(), context={drawImage,save(){},restore(){}} as unknown as CanvasRenderingContext2D;
  const missing = asset('missing',16,16,[8,15]);
  const old = { missingItem: missing } as OverworldArt;
  drawOverworldTree(context,old,100,100,false,0,0,1,'tree_ashwood');
  drawOverworldOreNode(context,old,'ore_cinder',100,100,0,0,1);
  expect(drawImage).toHaveBeenCalledTimes(2);
  for (const call of drawImage.mock.calls) expect(call[0]).toBe(missing.image);
});
it('selects fixed Hearth art and ashwood stages from authored resource metadata', () => {
  const registry = bootstrapContentRegistry();
  const ore = registry.resources.get('resource:ore_cinder')!;
  const ashwood = registry.resources.get('resource:tree_ashwood')!;
  expect(authoredResourceVisual(art, ore.visual, 'mature', 'pristine', 4))
    .toEqual({ asset: bank.ore_cinder, scale: 1 });
  expect(authoredResourceVisual(art, ashwood.visual, 'small'))
    .toEqual({ asset: bank.tree_ashwood_stump, scale: 1 });
  expect(authoredResourceVisual(art, ashwood.visual, 'depleted'))
    .toEqual({ asset: bank.tree_ashwood_stump, scale: 1 });
});
