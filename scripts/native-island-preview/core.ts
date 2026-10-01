import { selectAtlasFrame, emissiveFrameSpans, type LoadedAsset } from '../../packages/ui/src/index.js';
import { terrainDocumentForMapV3, type MapPrefabDocumentV2, type MapDocumentV3, serializeMapDocumentV3, parseMapDocumentV3 } from '../../packages/sim/src/index.js';
import { terrainArrayForMapDocument } from '../../packages/engine/src/editor-terrain.js';
import { GroundChunkCache } from '../../packages/engine/src/ground-cache.js';
import { drawAuthoredOverworldObject } from '../../packages/engine/src/overworld-art.js';
import { ReceiverFrameCache } from '../../packages/engine/src/receiver-frame-source.js';
import { TileLightmap, type PointLight } from '../../packages/engine/src/lighting.js';
import { createLightOcclusionMap, createSpriteLightOccluder } from '../../packages/engine/src/light-occlusion.js';
import { type NativeIslandScene, type NativePlacement } from '../native-island-scenes.js';
import { maximumLight } from '../../packages/engine/src/celestial-lighting.js';
import { compositeBasicLighting } from '../../packages/engine/src/lighting-quality.js';

export type Mode='day'|'night-off'|'night-self'|'night-glow';
export function createNativeIslandRenderer(art:Parameters<GroundChunkCache['draw']>[1],assets:Map<string,LoadedAsset>,registryRevision:string) {
const cache=new Map<string,HTMLCanvasElement>();
const receiverFrames=new ReceiverFrameCache(16*1024*1024);
function context(surface:HTMLCanvasElement){const ctx=surface.getContext('2d')!;ctx.imageSmoothingEnabled=false;return ctx;}
function surface(width:number,height:number){const c=document.createElement('canvas');c.width=width;c.height=height;return c;}
function sprite(p:NativePlacement){const asset=assets.get(p.asset)!;
  if(!asset)throw new Error(`Missing registered asset ${p.asset}`);
  const group=asset.metadata.variants?.base||asset.metadata.states?.base||asset.metadata.animations.base?'base':Object.keys(asset.metadata.animations)[0]??Object.keys(asset.metadata.variants??{})[0]??Object.keys(asset.metadata.states??{})[0];
  const frame=selectAtlasFrame(asset.metadata,group!,p.frame??0);if(!frame)throw new Error(`Missing frame ${p.asset}:${p.frame}`);return {asset,frame,group:group!};}
function isTile(p:NativePlacement){return p.asset.startsWith('tile_');}
function emitters(scene:NativeIslandScene):PointLight[]{
  const unique=new Map<string,PointLight>();
  for(const p of scene.placements)if(p.material==='lava'){
    const {asset,frame}=sprite(p);if(!emissiveFrameSpans(asset,frame)?.length)continue;
    const x=Math.floor(p.x/48),y=Math.floor(p.y/48),key=`${x},${y}`;
    if(!unique.has(key))unique.set(key,{worldX:p.x+8,worldY:p.y+8,radiusTiles:3.8,color:{r:251,g:107,b:29},strengthPerMille:720,elevationLayer:0});
  }
  return [...unique.values()];
}
function render(scene:NativeIslandScene,mode:Mode):HTMLCanvasElement{
  const key=`${scene.id}:${mode}`,existing=cache.get(key);if(existing)return existing;
  const width=scene.document.width*16,height=scene.document.height*16,c=surface(width,height),ctx=context(c);
  const background=scene.id==='cinderwake'?{...scene.document,cells:{}}:scene.document;
  const terrain=terrainArrayForMapDocument(terrainDocumentForMapV3(background),undefined,background,{includeTerrainPlaneCollision:false});
  new GroundChunkCache().draw(ctx,art,terrain,0,0,1,width,height);
  const night=mode!=='day',ambient={r:44,g:51,b:68};
  const lightmap=new TileLightmap();
  if(night){
    const blockers=scene.placements.filter(p=>p.layer==='wall'&&p.material!=='lava').map(p=>{
      const {asset}=sprite(p);return createSpriteLightOccluder(asset,'base',p.frame??0,p.x+asset.anchor[0],p.y+asset.anchor[1]);
    }).filter(p=>p!==null);
    lightmap.prepare(terrain,0,0,1,width,height,ambient,mode==='night-glow'?emitters(scene):[],createLightOcclusionMap(terrain,[],blockers,[],art.cliff),'unified',true);
    compositeBasicLighting(ctx,width,height,ambient);
  }
  const draw=(p:NativePlacement)=>{
    const {asset,frame,group}=sprite(p);
    if(!night&&!isTile(p)){drawAuthoredOverworldObject(ctx,asset,group,p.frame??0,p.x,p.y,0,0,1);return;}
    const x=isTile(p)?p.x:p.x-asset.anchor[0],y=isTile(p)?p.y+1:p.y-asset.anchor[1];
    const local=lightmap.sampleReceiverLight(p.x+8,p.y+8,0,p.layer==='wall'&&p.material!=='lava'?'south':'flat');
    const color=night?maximumLight(ambient,local):{r:255,g:255,b:255};
    const source=receiverFrames.source({image:asset.image,...frame,
      ...(mode==='night-self'||mode==='night-glow'?{emissiveSpans:emissiveFrameSpans(asset,frame)}:{})},color);
    ctx.drawImage(source.image,source.x,source.y,source.width,source.height,x,y,frame.width,frame.height);
  };
  // Structural tiles retain the authored paint order; upright scenery shares the usual foot sort.
  for(const p of scene.placements.filter(isTile))draw(p);
  for(const p of scene.placements.filter(p=>!isTile(p)).sort((a,b)=>a.y-b.y||a.x-b.x))draw(p);
  cache.set(key,c);return c;
}
function editable(scene:NativeIslandScene):MapDocumentV3{
  const prefabs=new Map<string,MapPrefabDocumentV2>();
  const objects=scene.placements.map(p=>{
    const {asset,frame,group}=sprite(p),id=`native-${asset.assetId}-${p.frame??0}`;
    const pivot={tileX:Math.floor(asset.anchor[0]/16),tileY:Math.floor(asset.anchor[1]/16)};
    if(!prefabs.has(id))prefabs.set(id,{schemaVersion:2,kind:'map_prefab',id,title:asset.name,width:Math.ceil(frame.width/16),height:Math.ceil(frame.height/16),tileSize:16,pivot,
      revision:1,assetRegistryRevision:registryRevision,tags:['review.native-island'],collection:null,behaviors:[{kind:'static'}],cells:[],
      placements:[{id:'art',assetId:asset.assetId,assetName:asset.name,visual:{kind:asset.metadata.variants?.[group]?'variant':asset.metadata.animations[group]?'animation':'state',name:group,frameIndex:p.frame??0},tileX:pivot.tileX,tileY:pivot.tileY,elevation:0,layer:isTile(p)?'ground':'object',quarterTurns:0,flipX:false}]});
    return {id:p.id,prefabId:id,prefabRevision:1,tileX:Math.round((p.x-(isTile(p)?0:8))/16),tileY:Math.round((p.y-(isTile(p)?0:16))/16),elevation:0,layer:isTile(p)||p.layer==='ground'?'ground' as const:'objects' as const,quarterTurns:0 as const,flipX:false,enabled:true};
  });
  const document={...scene.document,prefabs:[...prefabs.values()],objects};
  // Use the real Studio document parser to reject invalid exports before offering a download.
  return parseMapDocumentV3(serializeMapDocumentV3(document));
}
return {render,editable,emitters};
}
