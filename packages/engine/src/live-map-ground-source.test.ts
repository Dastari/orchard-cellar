import {expect,it,vi} from 'vitest';
import {createLiveIslandMapDocument,createMapPrefabDocument,type MapObjectInstance} from '@orchard/sim';
import {enqueueLiveMapObjects,preloadLiveMapObjectAssets} from './live-map-runtime.js';
import {withGroundSpriteSource} from './ground-light-source.js';
import type {WorldDepthItem} from './renderer.js';
import type {AssetFrameSource} from '@orchard/ui';
vi.mock('@orchard/ui',async original=>({...await original<typeof import('@orchard/ui')>(),loadGeneratedAsset:async()=>({
  metadata:{image:'fixture.png',animations:{},states:{base:{x:0,y:0,width:16,height:16,durationTicks:1}}},anchor:[8,15]})}));
vi.mock('./world-asset-presentation.js',()=>({worldAssetFrameSource:(_context:unknown,_asset:unknown,_frame:unknown,transform?:(source:AssetFrameSource)=>AssetFrameSource)=>{
  const source={image:{} as CanvasImageSource,x:0,y:0,width:16,height:16};return transform?.(source)??source;
}}));
it('passes transformed native top-left and basis from the actual map draw, independent of camera zoom',async()=>{
  const prefab={...createMapPrefabDocument({id:'ground-source',title:'Ground source'}),width:2,placements:[{
    id:'visual',assetId:1,assetName:'ground-source',tileX:1,tileY:0,elevation:0,layer:'ground' as const,
    quarterTurns:0 as const,flipX:false,visual:{kind:'state' as const,name:'base',frameIndex:0}}]};
  const object:MapObjectInstance={id:'ground',prefabId:prefab.id,prefabRevision:prefab.revision,
    tileX:5,tileY:10,elevation:0,layer:'ground',quarterTurns:1,flipX:true,scale:2,enabled:true};
  const document={...createLiveIslandMapDocument(),prefabs:[prefab],objects:[object]};await preloadLiveMapObjectAssets(document);
  const context={save:vi.fn(),restore:vi.fn(),translate:vi.fn(),rotate:vi.fn(),scale:vi.fn(),drawImage:vi.fn()} as unknown as CanvasRenderingContext2D;
  const queued:WorldDepthItem[]=[],source=vi.fn((frame:AssetFrameSource)=>frame);
  enqueueLiveMapObjects(document,{context,cameraX:20,cameraY:30,scale:3,timeMs:0,visible:()=>true,enqueue:(_x,_y,item)=>queued.push(item)});
  withGroundSpriteSource(context,source,()=>queued[0]!.draw());
  expect(source).toHaveBeenCalledWith(expect.anything(),118,160,{a:-0,b:-2,c:-2,d:-0});
  expect(context.drawImage).toHaveBeenCalledOnce();expect(context.restore).toHaveBeenCalledOnce();
});
