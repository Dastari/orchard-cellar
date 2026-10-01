/** v1.0.0 — Actual terrain-plane, cliff receiver and lava emission evidence. */
import { createEmptyMapDocument,migrateMapDocumentV2,terrainDocumentForMapV3 } from '../packages/sim/src/index.js';
import { selectAtlasFrame,emissiveFrameSpans,type LoadedAsset } from '../packages/ui/src/index.js';
import { terrainArrayForMapDocument } from '../packages/engine/src/editor-terrain.js';
import { GroundChunkCache } from '../packages/engine/src/ground-cache.js';
import { enqueueRaisedTerrainDepth } from '../packages/engine/src/raised-terrain-depth.js';
import { sortWorldDepthItems,type WorldDepthItem } from '../packages/engine/src/renderer.js';
import { createLightOcclusionMap,createSpriteLightOccluder } from '../packages/engine/src/light-occlusion.js';
import { WorldLightingRenderer,celestialCastersFromOcclusion } from '../packages/engine/src/world-lighting-renderer.js';
import { celestialLightingAtCalendar,maximumLight } from '../packages/engine/src/celestial-lighting.js';
import { TileLightmap,type PointLight } from '../packages/engine/src/lighting.js';
import { setGroundLightSource } from '../packages/engine/src/ground-light-source.js';
import type { OverworldArt } from '../packages/engine/src/overworld-art.js';

export function lavaLightProof(art:OverworldArt,assets:Map<string,LoadedAsset>) {
  const width=24*16,height=18*16;
  const initial=migrateMapDocumentV2(createEmptyMapDocument({id:'lava-receiver-proof',title:'Lava receiver proof',width:24,height:18}));
  const cells:Record<string,{elevation:number}>={};
  for(let y=4;y<=10;y++)for(let x=14;x<=20;x++)cells[`${x},${y}`]={elevation:1};
  const document={...initial,baseBiome:'volcanic_ash' as const,defaultCliffFamily:'volcanic' as const,cells};
  const terrain=terrainArrayForMapDocument(terrainDocumentForMapV3(document),undefined,document);
  const native=assets.get('tile_cf_volcano_design_sheet')!,wallFrame=3*29+12;
  const barriers=Array.from({length:18},(_,y)=>createSpriteLightOccluder(native,'base',wallFrame,10*16+8,y*16+15)!).filter(Boolean);
  const occlusion=createLightOcclusionMap(terrain,[],barriers,[],art.terrainAssets?.['tile_cf_volcanic_cliff']??art.cliff);
  const lights:PointLight[]=[{worldX:8*16,worldY:12*16,radiusTiles:10,color:{r:251,g:107,b:29},strengthPerMille:900,elevationLayer:0}];
  const sky=celestialLightingAtCalendar({continuousDay:3.5,clockHours:0,lunarProgress:.5,lunarIllumination:0});
  const panels:HTMLCanvasElement[]=[],stats:unknown[]=[];
  for(const mode of ['off','surface','surface-and-cast'] as const){
    const c=globalThis.document.createElement('canvas');c.width=width;c.height=height;
    const ctx=c.getContext('2d')!;ctx.imageSmoothingEnabled=false;
    const map=new TileLightmap(),lighting=new WorldLightingRenderer(terrain);
    map.prepare(terrain,0,0,1,width,height,sky.diffuse,mode==='surface-and-cast'?lights:[],occlusion,'unified',true);
    lighting.begin(sky,celestialCastersFromOcclusion(occlusion,lighting.mapper,0,0,width,height),[],map,0,0,width,height);
    setGroundLightSource(ctx,(source,x,y,level)=>lighting.groundSource(source,x,y,level));
    const ground=new GroundChunkCache();ground.draw(ctx,art,terrain,0,0,1,width,height);
    lighting.compositeGround(ctx,1);
    const queue:WorldDepthItem[]=[];
    enqueueRaisedTerrainDepth(queue,ctx,art,terrain,ground,0,0,1,width,height,undefined,(x,y,level,face,draw)=>lighting.drawReceiver(ctx,x,y,level,face,draw));
    sortWorldDepthItems(queue);for(const item of queue)item.draw();
    const drawTile=(frameIndex:number,x:number,y:number,emission:boolean)=>{
      const frame=selectAtlasFrame(native.metadata,'base',frameIndex)!;
      const local=map.sampleReceiverLight(x+8,y+8,0,'flat');
      const source=lighting.frames.source({image:native.image,...frame,...(emission?{emissiveSpans:emissiveFrameSpans(native,frame)}:{})},maximumLight(sky.diffuse,local));
      ctx.drawImage(source.image,source.x,source.y,source.width,source.height,x,y,16,16);
    };
    for(let y=10;y<=14;y++)for(let x=4;x<=8;x++){
      const col=x===4?7:x===8?9:8,row=y===10?6:y===14?8:7;
      drawTile(row*29+col,x*16,y*16,mode!=='off');
    }
    for(let y=0;y<18;y++)drawTile(wallFrame,10*16,y*16,false);
    const read=(x:number,y:number)=>[...ctx.getImageData(x,y,1,1).data];
    const open=map.sampleReceiverLight(9*16,12*16,0);
    const behind=map.sampleReceiverLight(12*16,12*16,0);
    const upper=map.sampleReceiverLight(16*16,lighting.mapper.projectedY(8*16,1),1);
    const raw=selectAtlasFrame(native.metadata,'base',7*29+8)!;
    const groundSource=lighting.groundSource({image:native.image,...raw,emissiveSpans:emissiveFrameSpans(native,raw)},6*16,12*16,0);
    const probe=globalThis.document.createElement('canvas');probe.width=probe.height=16;
    const probeContext=probe.getContext('2d')!;
    probeContext.drawImage(groundSource.image,groundSource.x,groundSource.y,16,16,0,0,16,16);
    const groundRoutePixel=[...probeContext.getImageData(8,8,1,1).data];
    stats.push({mode,corePixel:read(6*16+8,12*16+8),openReceiver:open,behindWallReceiver:behind,upperPlaneReceiver:upper,
      groundRoutePixel,groundPathEmissivePreserved:groundRoutePixel.slice(0,3).join(',')==='251,107,29'});
    if(mode==='surface-and-cast' && (open.r<=0 || behind.r!==0 || upper.r!==0))throw new Error('Lava terrain occlusion or plane isolation failed');
    panels.push(c);
    setGroundLightSource(ctx);lighting.frames.reset();map.reset();
  }
  const board=globalThis.document.createElement('canvas');board.width=width*2*3;board.height=height*2+42;
  const ctx=board.getContext('2d')!;ctx.fillStyle='#101a20';ctx.fillRect(0,0,board.width,board.height);ctx.imageSmoothingEnabled=false;
  const labels=['EMISSION OFF','LAVA SURFACE ONLY','LAVA SURFACE + LOCAL LIGHT'];
  panels.forEach((panel,i)=>{ctx.drawImage(panel,i*width*2,42,width*2,height*2);ctx.fillStyle='#e8debf';ctx.font='16px monospace';ctx.fillText(labels[i]!,i*width*2+15,27);});
  return {board,stats,note:'Integer elevated plateau, native opaque wall barrier, real engine point-light solver and emissive receiver cache. The two island layouts remain visual drafts.'};
}
