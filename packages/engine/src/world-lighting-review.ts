import { worldAtlasVariants } from '@orchard/ui';
import { FIXED_UNITS_PER_PIXEL } from '@orchard/sim';
import { loadOverworldArt, drawAuthoredOverworldObject } from './overworld-art.js';
import { celestialLightingAtCalendar } from './celestial-lighting.js';
import { WorldLightingRenderer, celestialCastersFromOcclusion } from './world-lighting-renderer.js';
import { setWorldAssetPresentation } from './world-asset-presentation.js';
import { setGroundLightSource } from './ground-light-source.js';
import { GroundChunkCache } from './ground-cache.js';
import { enqueueRaisedTerrainDepth } from './raised-terrain-depth.js';
import { sortWorldDepthItems, type WorldDepthItem } from './renderer.js';
import { createSpriteLightOccluder, createLightOcclusionMap, resetSpriteLightMasks } from './light-occlusion.js';
import { compositeBasicLighting } from './lighting-quality.js';
import { TileLightmap, LANTERN_LIGHT } from './lighting.js';
import { terrainElevationAtWorldFoot, terrainProjectedDepthAtFoot, type TerrainArray } from './terrain.js';

const yieldFrame = () => new Promise<void>((resolve) => { const channel = new MessageChannel(); channel.port1.onmessage = () => { channel.port1.close(); channel.port2.close(); resolve(); }; channel.port2.postMessage(null); });

/** Browser acceptance of production ground-cache, terrain painter, exact frame
 * policy, local solve and receiver renderer. No server mutations or test login. */
export async function runWorldLightingReview() {
  const art = await loadOverworldArt();
  const terrain: TerrainArray = { spaceId:58,seed:58,version:1,width:32,height:24,
    biomes:new Uint8Array(768).fill(4),blocked:Array<boolean>(768).fill(false),horseJumpableTerrain:Array<boolean>(768).fill(false),
    elevations:new Int16Array(768),dirtCliffRoles:new Uint8Array(768),dirtTerraces:new Uint8Array(768),baseDatum:0 };
  for(let y=7;y<15;y++) for(let x=12;x<20;x++) terrain.elevations[y*32+x]=1;
  for(let y=8;y<12;y++) for(let x=16;x<19;x++) terrain.elevations[y*32+x]=2;
  const cache = new GroundChunkCache(), frames = worldAtlasVariants, lightmap = new TileLightmap();
  const lighting = new WorldLightingRenderer(terrain);
  const canvas = document.createElement('canvas');canvas.width=640;canvas.height=384;
  const ctx=canvas.getContext('2d')!;
  const board=document.createElement('canvas');board.width=1920;board.height=1680;
  const out=board.getContext('2d')!;
  const objects=[
    {asset:art.treeOak,x:80,y:118,animation:'base'},
    {asset:art.treeBirch,x:140,y:145,animation:'base'},
    {asset:art.treeStump,x:48,y:174,animation:'base'},
    {asset:art.treeOakYoung,x:180,y:184,animation:'base'},
    {asset:art.treeOak,x:270,y:198,animation:'base'},
    {asset:art.chest,x:225,y:195,animation:'chest'},
    {asset:art.avatar,x:216,y:250,animation:'idle_down'},
  ];
  const panels=[
    {label:'SPRING SUNRISE',hour:7,day:3.5},{label:'SPRING NOON',hour:12,day:3.5},{label:'SPRING SUNSET',hour:17,day:3.5},
    {label:'FULL MOON RISE',hour:20,day:3.5},{label:'FULL MOON MIDNIGHT',hour:0,day:3.5},{label:'FULL MOON SET',hour:4,day:3.5},
    {label:'MOON + WARM LANTERN',hour:0,day:3.5,lantern:true},{label:'BASIC / BAKED SHADOWS',hour:0,day:3.5,basic:true},{label:'NEW MOON',hour:0,day:3.5,newMoon:true},
    {label:'SUMMER EVENING',hour:19,day:10.5},{label:'WINTER EVENING',hour:19,day:24.5},{label:'OVERCAST FULL MOON',hour:0,day:3.5,clouds:1},
  ];
  const evidence=[];
  for(const [index,panel] of panels.entries()) {
    await yieldFrame();
    const sky=celestialLightingAtCalendar({continuousDay:panel.day,clockHours:panel.hour,lunarProgress:panel.newMoon?0.5:0,lunarIllumination:panel.newMoon?0:1,cloudCover:panel.clouds??0});
    if(panel.basic) { frames.reset();lighting.reset();lightmap.reset();resetSpriteLightMasks(); }
    else {
      if(!await frames.prepare() || !frames.commit()) throw new Error(frames.failure ?? 'review_omit_pages_not_ready');
    }
    setWorldAssetPresentation(ctx,panel.basic?undefined:frames,panel.basic?'original':'omit-baked-shadow');
    setGroundLightSource(ctx,panel.basic?undefined:(source,x,y,level)=>lighting.groundSource(source,x,y,level));
    const occlusion=panel.basic?undefined:createLightOcclusionMap(terrain,[],[],objects.map((object)=>{
      const projection=terrainProjectedDepthAtFoot(terrain,object.x,object.y);
      return {footX:object.x,footY:object.y-projection,elevationLayer:terrainElevationAtWorldFoot(terrain,object.x,object.y),
        receiver:createSpriteLightOccluder(object.asset,object.animation,0,object.x,object.y-projection),
        obstacle:{left:(object.x-4)*FIXED_UNITS_PER_PIXEL,right:(object.x+4)*FIXED_UNITS_PER_PIXEL,top:(object.y-projection-2)*FIXED_UNITS_PER_PIXEL,bottom:(object.y-projection+1)*FIXED_UNITS_PER_PIXEL}};
    }),art.cliff);
    const lights=panel.lantern?[{worldX:100,worldY:148,radiusTiles:6,color:LANTERN_LIGHT,elevationLayer:0}]:[];
    if(!panel.basic) {
      lightmap.prepare(terrain,0,0,2,640,384,sky.combined,lights,occlusion,'unified',true);
      lighting.begin(sky,celestialCastersFromOcclusion(occlusion,lighting.mapper,0,0,320,384),[],lightmap,0,0,320,192);
    }
    const start=performance.now();
    ctx.clearRect(0,0,640,384);ctx.imageSmoothingEnabled=false;
    cache.draw(ctx,art,terrain,0,0,2,640,384);
    if(!panel.basic)lighting.compositeGround(ctx,2);
    const queue:WorldDepthItem[]=[];
    enqueueRaisedTerrainDepth(queue,ctx,art,terrain,cache,0,0,2,320,192,undefined,
      (x,y,level,face,draw)=>{if(panel.basic)draw();else lighting.drawReceiver(ctx,x,y,level,face,draw);});
    for(const [i,object]of objects.entries()) {
      const level=terrainElevationAtWorldFoot(terrain,object.x,object.y),projection=terrainProjectedDepthAtFoot(terrain,object.x,object.y);
      const draw=()=>drawAuthoredOverworldObject(ctx,object.asset,object.animation,0,object.x,object.y-projection,0,0,2);
      queue.push({footY:object.y-projection,elevationLayer:level,depthPhase:'entity',tie:`object:${i}`,
        draw:()=>{if(panel.basic)draw();else lighting.drawReceiver(ctx,object.x,object.y,level,'south',draw);}});
    }
    for(const item of sortWorldDepthItems(queue))item.draw();
    if(panel.basic)compositeBasicLighting(ctx,640,384,sky.combined);
    const milliseconds=performance.now()-start;
    // UI witness is deliberately drawn after world lighting, identical each panel.
    ctx.fillStyle='#ffffff';ctx.fillRect(8,8,16,8);
    const x=index%3*640,y=Math.floor(index/3)*420;
    out.fillStyle='#101728';out.fillRect(x,y,640,420);out.fillStyle='#ffffff';out.font='16px monospace';out.fillText(panel.label,x+12,y+24);out.drawImage(canvas,x,y+36);
    evidence.push({label:panel.label,milliseconds,bytes:lighting.bytes+(frames.diagnostics().decodedPageBytes+frames.diagnostics().recoloredSurfaceBytes)+lightmap.retainedSurfaceBytes,omitPages:frames.diagnostics().pageCount,
      uiPixel:[...ctx.getImageData(10,10,1,1).data],shadowBuilds:lighting.scene.cache.builds});
  }
  frames.reset();lighting.reset();lightmap.reset();resetSpriteLightMasks();
  return {image:board.toDataURL(),evidence,releasedBytes:lighting.bytes+(frames.diagnostics().decodedPageBytes+frames.diagnostics().recoloredSurfaceBytes)+lightmap.retainedSurfaceBytes,
    description:'Actual production painter on deterministic nested terrain; desktop browser CPU submission timing, not an authenticated player session.'};
}
