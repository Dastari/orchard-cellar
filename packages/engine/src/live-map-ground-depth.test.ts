import {expect,it,vi} from 'vitest';
import {createLiveIslandMapDocument,createMapPrefabDocument,type MapObjectInstance} from '@orchard/sim';
import {enqueueLiveMapObjects,preloadLiveMapObjectAssets} from './live-map-runtime.js';
import {sortWorldDepthItems,type WorldDepthItem} from './renderer.js';
vi.mock('@orchard/ui',async importOriginal=>{
  const actual=await importOriginal<typeof import('@orchard/ui')>();
  return {...actual,loadGeneratedAsset:async()=>({
    metadata:{image:'fixture.png',animations:{},states:{base:{x:0,y:0,width:16,height:16,durationTicks:1}}},
    anchor:[8,15],
  })};
});
it('queues authored ground below actors while retaining ordinary object and canopy depth',async()=>{
  const prefab={...createMapPrefabDocument({id:'depth-fixture',title:'Depth fixture'}),
    placements:[{id:'visual',assetId:1,assetName:'depth-fixture',
      visual:{kind:'state' as const,name:'base',frameIndex:0},tileX:0,tileY:0,elevation:0,
      layer:'object' as const,quarterTurns:0 as const,flipX:false}]};
  const objects:MapObjectInstance[]=(['ground','objects','canopy'] as const).map((layer,i)=>({
    id:`fixture-${layer}`,prefabId:prefab.id,prefabRevision:prefab.revision,
    tileX:5,tileY:10+i,elevation:0,layer,quarterTurns:0,flipX:false,enabled:true,
  }));
  const document={...createLiveIslandMapDocument(),prefabs:[prefab],objects};
  await preloadLiveMapObjectAssets(document);
  const queued:WorldDepthItem[]=[];
  expect(enqueueLiveMapObjects(document,{context:{} as CanvasRenderingContext2D,
    cameraX:0,cameraY:0,scale:1,timeMs:0,visible:()=>true,
    enqueue:(_x,_y,item)=>queued.push(item)})).toBe(3);
  expect(queued.map(item=>item.depthPhase)).toEqual(['surface','entity','entity']);
  const actor:WorldDepthItem={footY:160,depthPhase:'entity',tie:'player',draw:()=>{}};
  // The deck's lower sprite anchor must never paint over a player farther north.
  const sorted=sortWorldDepthItems([...queued,actor]);
  expect(sorted.indexOf(queued[0]!)).toBeLessThan(sorted.indexOf(actor));
  expect(sorted.indexOf(actor)).toBeLessThan(sorted.indexOf(queued[1]!));
  expect(sorted.indexOf(queued[1]!)).toBeLessThan(sorted.indexOf(queued[2]!));
});
