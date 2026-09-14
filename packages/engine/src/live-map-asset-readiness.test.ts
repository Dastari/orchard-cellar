import {expect,it,vi} from 'vitest';
import {createLiveIslandMapDocument,createMapPrefabDocument} from '@orchard/sim';
import type {LoadedAsset} from '@orchard/ui';
import {liveMapObjectAssetReadinessRevision,liveMapObjectAssetsReady,preloadLiveMapObjectAssets} from './live-map-runtime.js';

const loader=vi.hoisted(()=>({load:vi.fn()}));
vi.mock('@orchard/ui',async original=>({...await original<typeof import('@orchard/ui')>(),loadGeneratedAsset:loader.load}));

it('invalidates retained alpha only after successful availability, deduplicating concurrent and repeated requests',async()=>{
  let resolveAsset!:(asset:LoadedAsset)=>void;
  loader.load.mockImplementation(()=>new Promise<LoadedAsset>(resolve=>{resolveAsset=resolve;}));
  const prefab={...createMapPrefabDocument({id:'readiness',title:'Readiness'}),placements:[{
    id:'visual',assetId:1,assetName:'readiness-tree',tileX:0,tileY:0,elevation:0,layer:'object' as const,
    quarterTurns:0 as const,flipX:false,visual:{kind:'state' as const,name:'base',frameIndex:0}}]};
  const document={...createLiveIslandMapDocument(),prefabs:[prefab],objects:[{
    id:'tree',prefabId:prefab.id,prefabRevision:prefab.revision,tileX:5,tileY:10,elevation:0,
    layer:'objects' as const,quarterTurns:0 as const,flipX:false,scale:1 as const,enabled:true}]};
  const before=liveMapObjectAssetReadinessRevision();
  const first=preloadLiveMapObjectAssets(document),second=preloadLiveMapObjectAssets(document);
  expect(loader.load).toHaveBeenCalledTimes(1);
  expect(liveMapObjectAssetsReady(document)).toBe(false);
  expect(liveMapObjectAssetReadinessRevision()).toBe(before);
  resolveAsset({} as LoadedAsset);
  await Promise.all([first,second]);
  expect(liveMapObjectAssetsReady(document)).toBe(true);
  expect(liveMapObjectAssetReadinessRevision()).toBe(before+1);
  await preloadLiveMapObjectAssets(document);
  expect(loader.load).toHaveBeenCalledTimes(1);
  expect(liveMapObjectAssetReadinessRevision()).toBe(before+1);

  const warning=vi.spyOn(console,'warn').mockImplementation(()=>{});
  loader.load.mockRejectedValueOnce(new Error('missing image'));
  const missing={...document,prefabs:[{...prefab,placements:[{...prefab.placements[0]!,assetName:'missing-readiness-tree'}]}]};
  await preloadLiveMapObjectAssets(missing);
  expect(liveMapObjectAssetsReady(missing)).toBe(false);
  expect(liveMapObjectAssetReadinessRevision()).toBe(before+1);
  expect(warning).toHaveBeenCalledOnce();
  warning.mockRestore();
});
