/** Offline terrain study for the Hearth archipelago; not release approval. No network connection or live player data.
 * Run: npx tsx packages/tools/src/render-hearth-study.ts
 * Requires the existing generated atlases and a Chrome/Chromium executable.
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { createServer } from 'vite';
import { decodePng } from './assets/png.js';

const root = resolve(import.meta.dirname, '../../..');
const shadowProbe=process.argv.includes('--tree-shadow-probe')?'tree':process.argv.includes('--facade-shadow-probe')?'facade':null;
const omittedShadowObject=process.argv.find(arg=>arg.startsWith('--omit-shadow-object='))?.split('=')[1]??null;
const onlyProbeShadow=process.argv.includes('--only-probe-shadow');
const noProbeShadow=process.argv.includes('--no-probe-shadow');
if(noProbeShadow&&!shadowProbe)throw new Error('--no-probe-shadow requires a shadow probe');
const noMapShadows=process.argv.includes('--no-map-shadows');
const groundCheck=process.argv.includes('--ground-light-check');
const warden=process.argv.includes('--warden');
const lobby=process.argv.includes('--lobby');
const architecture=process.argv.includes('--architecture');
const residence=process.argv.includes('--residence')||architecture;
const interiors=process.argv.includes('--interiors');
const noMapLights=process.argv.includes('--no-map-lights');
const noInteriorLights=process.argv.includes('--no-interior-lights');
const lobbyPlayer=process.argv.includes('--exit-player');
const lighting=process.argv.includes('--dynamic')?'dynamic':process.argv.includes('--basic')?'basic':'unlit';
const output = resolve(root, process.argv.slice(2).find(arg=>!arg.startsWith('--')) ?? (architecture?'output/doc60/residence-architecture.png':residence?'output/doc60/residence-expansion-walls.png':lobby?'output/doc60/delve-lobby.png':warden?'output/doc60/warden-arena.png':'output/doc60/willowharbour-terrain.png'));
const boundaryShot = process.argv.includes('--cinder-boundary-north')?'north':process.argv.includes('--cinder-boundary-east')?'east':null;
const cinderShot = boundaryShot ? 'boundary' : process.argv.includes('--cinder-caldera')?'caldera':process.argv.includes('--cinder-landing')?'landing':process.argv.includes('--cinder-shore')?'shore':process.argv.includes('--cinder-east')?'east':null;
const volcanic = process.argv.includes('--cinderwake')||warden||cinderShot!==null;
const farm=process.argv.includes('--farm');
const pond=process.argv.includes('--pond');
const harbour=process.argv.includes('--harbour');
const residents=process.argv.includes('--residents')||harbour;
const town = process.argv.includes('--town')||residents;
const settings = boundaryShot ? {width:1536,height:1152,centerTileX:boundaryShot==='north'?666:668,centerTileY:boundaryShot==='north'?194:207,zoom:3,frameMs:0,warden:false} : cinderShot ? {width:cinderShot==='caldera'?1536:1920,height:cinderShot==='caldera'?1920:1152,centerTileX:cinderShot==='caldera'?721:cinderShot==='landing'?656:cinderShot==='shore'?688:715,centerTileY:cinderShot==='caldera'?107:cinderShot==='landing'?204:213,zoom:3,frameMs:0,warden:cinderShot==='caldera'} : shadowProbe ? {width:1344,height:1152,centerTileX:0,centerTileY:0,zoom:3,frameMs:0,warden:false} : groundCheck ? {width:512,height:512,centerTileX:0,centerTileY:0,zoom:1,frameMs:0,warden:false} : farm ? {width:1920,height:1344,centerTileX:132,centerTileY:445,zoom:3,frameMs:0,warden:false} : pond ? {width:1344,height:864,centerTileX:140,centerTileY:379,zoom:3,frameMs:0,warden:false} : harbour ? {width:1344,height:1152,centerTileX:210,centerTileY:400,zoom:3,frameMs:0,warden:false} : residence ? {width:4096,height:1024,centerTileX:16,centerTileY:16,zoom:2,frameMs:0,warden:false} : interiors ? {width:3072,height:2048,centerTileX:16,centerTileY:16,zoom:2,frameMs:0,warden:false} : lobby ? {width:1152,height:1152,centerTileX:12,centerTileY:12,zoom:3,frameMs:0,warden:false} : { width: residents?3584:town ? 1792 : 1536, height: residents?3584:warden ? 1152 : town ? 1792 : 1536, centerTileX: warden ? 721 : volcanic ? 704 : residents?162:town ? 170 : 144, centerTileY: warden ? 117 : volcanic ? 144 : residents?410:town ? 398 : 400, zoom: warden ? 3 : town ? 2 : 0.5, frameMs: 0,warden };
const scene = groundCheck ? await readFile(resolve(root,'packages/tools/src/ground-light-transform-fixture.js'),'utf8') : residence ? `
import {terrainForSpace} from '/packages/engine/src/terrain.ts';
import {GroundChunkCache} from '/packages/engine/src/ground-cache.ts';
import {loadOverworldArt,drawOverworldAvatar} from '/packages/engine/src/overworld-art.ts';
import {createGameplayPainter,sortGameplayWorldDepthItems} from '/packages/client/src/gameplay-painter.ts';
import {spaceDefinitionFor,planHearthArchitecture} from '/packages/sim/src/index.ts';
import {enqueueHearthArchitectureFeatures} from '/packages/engine/src/hearth-architecture-scene.ts';
try {
 const art=await loadOverworldArt();
 const canvas=document.createElement('canvas');canvas.width=4096;canvas.height=1024;
 const context=canvas.getContext('2d');context.imageSmoothingEnabled=false;
 context.fillStyle='#211923';context.fillRect(0,0,canvas.width,canvas.height);
 let players=0;
 for(const rank of [0,1,2,3]) {
   const tile=document.createElement('canvas');tile.width=1024;tile.height=1024;
   const ctx=tile.getContext('2d');ctx.imageSmoothingEnabled=false;
   const definition=spaceDefinitionFor(30000,{spaceId:60000,residenceSpaceId:30000,residenceExpansionRank:Math.min(rank,2)});
   const cells=${architecture}?Array.from({length:49},(_,i)=>({tileX:4+i%7,tileY:4+Math.floor(i/7),floor:'townhouse',...(Math.floor(i/7)===2&&i%7>=1&&i%7<=5?{partition:i%7===3?'doorway':'wall',...(i%7===1?{window:true}:{})}:{})})):[];
   if(${architecture}&&rank>=1&&rank!==3)cells.push(...[4,5,6,7].map(y=>({tileX:20,tileY:y,partition:y===4||y===7?'wall':'doorway'})));
   const base=terrainForSpace(rank===3?definition:{...definition,residenceArchitectureJson:JSON.stringify({recipeVersion:1,revision:'1',cells})},1,1);
   if(${architecture}&&rank!==3){
     const validated=planHearthArchitecture(rank,{canBuild:true,existing:[],occupants:[],collision:{width:base.width,height:base.height,blocked:base.residenceEnvelopeBlocked??base.blocked}},cells);
     if(validated.failure!==null)throw new Error('Invalid architectural study '+validated.failure);
   }
   const terrain=rank===3?{...base,spaceId:30002,residenceEnvelopeBlocked:undefined,blocked:Array.from({length:1024},(_,i)=>!(i%32>=3&&i%32<=12&&Math.floor(i/32)>=17&&Math.floor(i/32)<=26))}:base;
   new GroundChunkCache().draw(ctx,art,terrain,0,0,2,1024,1024);
   if(${architecture}&&rank!==3) {
     const actors=new Map();
     const {worldDepthItems,enqueueWorldDepth}=createGameplayPainter({terrain,context:ctx,scale:2,seasonalDynamic:false,
       projectionAt:()=>0,drawWorldReceiver:(_x,_y,draw)=>draw()});
     enqueueHearthArchitectureFeatures(ctx,art,cells,0,0,2,()=>actors.values(),enqueueWorldDepth);
     if(rank!==0){
       const x=120,y=rank===1?94:130;
       actors.set('fixture',{x,y});
       enqueueWorldDepth(x,y,{footY:y,elevationLayer:0,depthPhase:'entity',tie:'player:window',
         draw:()=>drawOverworldAvatar(ctx,art,x,y,'down',false,0,0,0,2,null)});
     }
     if(rank===2){
       const x=328,y=104;actors.set('east-west',{x,y});
       enqueueWorldDepth(x,y,{footY:y,elevationLayer:0,depthPhase:'entity',tie:'player:side-doorway',
         draw:()=>drawOverworldAvatar(ctx,art,x,y,'right',false,0,0,0,2,null)});
     }
     sortGameplayWorldDepthItems(worldDepthItems);for(const item of worldDepthItems)item.draw();
     players+=actors.size;
   }
   ctx.font='20px monospace';ctx.fillStyle='#f7d5ac';ctx.fillText(rank===3?'Synthetic wall across chunk16':'Residence expansion '+rank,48,990);
   context.drawImage(tile,rank*1024,0);
 }
 await fetch('/__login-result',{method:'POST',body:JSON.stringify({png:canvas.toDataURL('image/png'),seed:1,resources:0,decorations:0,draws:4,players})});
}catch(error){await fetch('/__login-result',{method:'POST',body:JSON.stringify({error:String(error),stack:error?.stack})});}
` : interiors ? `
import {TileLightmap} from '/packages/engine/src/lighting.ts';
import {WorldLightingRenderer} from '/packages/engine/src/world-lighting-renderer.ts';
import {celestialLightingAtTick} from '/packages/engine/src/celestial-lighting.ts';
import {createLightOcclusionMap} from '/packages/engine/src/light-occlusion.ts';
import {compositeBasicLighting} from '/packages/engine/src/lighting-quality.ts';
import {setGroundLightSource} from '/packages/engine/src/ground-light-source.ts';
import {setWorldAssetPresentation} from '/packages/engine/src/world-asset-presentation.ts';
import {worldAtlasVariants} from '/packages/ui/src/index.ts';
import {HEARTH_INTERIORS,HEARTH_INTERIOR_EXIT} from '/packages/sim/src/hearth-interiors.ts';
import {terrainForSpace,terrainProjectedDepthAtFoot} from '/packages/engine/src/terrain.ts';
import {GroundChunkCache} from '/packages/engine/src/ground-cache.ts';
import {loadOverworldArt,drawOverworldMerchant,drawOverworldAvatar} from '/packages/engine/src/overworld-art.ts';
import {bootstrapContentRegistry} from '/packages/sim/src/index.ts';
import {loadAuthoredNpcArt} from '/packages/engine/src/authored-npc-art.ts';
import {enqueueHearthInteriorFurniture,hearthInteriorPointLights} from '/packages/engine/src/hearth-interior-scene.ts';
import {createGameplayPainter,sortGameplayWorldDepthItems} from '/packages/client/src/gameplay-painter.ts';
try{
 const art=await loadOverworldArt();
 const registry=bootstrapContentRegistry();await loadAuthoredNpcArt(art,registry.npcs.values());
 const canvas=document.createElement('canvas');canvas.width=3072;canvas.height=2048;
 const context=canvas.getContext('2d');context.imageSmoothingEnabled=false;
 context.fillStyle='#211923';context.fillRect(0,0,canvas.width,canvas.height);
 let draws=0;
 for(const [i,interior] of HEARTH_INTERIORS.entries()){
   const tile=document.createElement('canvas');tile.width=1024;tile.height=1024;
   const ctx=tile.getContext('2d');ctx.imageSmoothingEnabled=false;
   ctx.fillStyle='#211923';ctx.fillRect(0,0,1024,1024);
   const terrain=terrainForSpace({spaceId:interior.spaceId,name:interior.name,sizeTiles:32,generator:'village_interior',
     environment:'indoor',ambient:{r:194,g:158,b:122},weather:false,audioBed:'homestead'},1,1);
   const dynamic=${JSON.stringify(lighting)}==='dynamic',basic=${JSON.stringify(lighting)}==='basic';
   const ambient={r:194,g:158,b:122},baseSky=celestialLightingAtTick(0n);
   const sky={...baseSky,diffuse:ambient,combined:ambient,
     sun:{...baseSky.sun,intensity:0,illumination:{r:0,g:0,b:0}},moon:{...baseSky.moon,intensity:0,illumination:{r:0,g:0,b:0}}};
   const lightmap=new TileLightmap(),lighting=new WorldLightingRenderer(terrain);
   const lights=(${noInteriorLights}?[]:hearthInteriorPointLights(interior.spaceId,registry,art,0n)).map(light=>({...light,elevationLayer:0}));
   if(dynamic){
     if(!await worldAtlasVariants.prepare()||!worldAtlasVariants.commit())throw new Error('Lighting atlas unavailable');
     setWorldAssetPresentation(ctx,worldAtlasVariants,'omit-baked-shadow');
     setGroundLightSource(ctx,(source,x,y,level)=>lighting.groundSource(source,x,y,level));
     lightmap.prepare(terrain,0,0,2,1024,1024,ambient,lights,createLightOcclusionMap(terrain,[],[],[],art.cliff),'unified',true);
     lighting.begin(sky,[],[],lightmap,0,0,512,512);
   }
   const ground=new GroundChunkCache();ground.draw(ctx,art,terrain,0,0,2,1024,1024);
   if(dynamic){lighting.compositeGround(ctx,2);lighting.compositeFlameGlows(ctx,lights,2);}
   const {worldDepthItems,enqueueWorldDepth}=createGameplayPainter({terrain,context:ctx,scale:2,seasonalDynamic:dynamic,
     projectionAt:(x,y)=>terrainProjectedDepthAtFoot(terrain,x,y),drawWorldReceiver:(x,y,draw,face='south')=>dynamic?lighting.drawReceiver(ctx,x,y,0,face,draw):draw()});
   enqueueHearthInteriorFurniture(ctx,art,registry,interior.spaceId,0,0,2,enqueueWorldDepth);
   for(const npc of registry.npcs.values()){
     if(npc.home.spaceId!==interior.spaceId)continue;
     const x=(npc.home.tileX+.5)*16,y=(npc.home.tileY+.5)*16;
     enqueueWorldDepth(x,y,{footY:y,elevationLayer:0,depthPhase:'entity',tie:npc.id,
       draw:()=>drawOverworldMerchant(ctx,art,x,y,npc.facing,false,0,0,0,2,npc.runtimeKind??npc.id.slice(4))});
   }
   const x=(HEARTH_INTERIOR_EXIT.tileX+.5)*16,y=(HEARTH_INTERIOR_EXIT.tileY+.5)*16;
   enqueueWorldDepth(x,y,{footY:y,elevationLayer:0,depthPhase:'entity',tie:'player:exit',
     draw:()=>drawOverworldAvatar(ctx,art,x,y,'down',false,0,0,0,2,null)});
   sortGameplayWorldDepthItems(worldDepthItems);for(const item of worldDepthItems)item.draw();
   if(basic)compositeBasicLighting(ctx,1024,1024,ambient);
   draws+=worldDepthItems.length;
   ctx.font='20px monospace';ctx.fillStyle='#f7d5ac';ctx.fillText(interior.name,48,24);
   context.drawImage(tile,(i%3)*1024,Math.floor(i/3)*1024);
 }
 await fetch('/__login-result',{method:'POST',body:JSON.stringify({png:canvas.toDataURL('image/png'),seed:1,resources:0,decorations:draws,draws})});
}catch(error){await fetch('/__login-result',{method:'POST',body:JSON.stringify({error:String(error),stack:error?.stack})});}
` : lobby ? `
import {terrainForSpace,terrainProjectedDepthAtFoot,terrainElevationAtWorldFoot} from '/packages/engine/src/terrain.ts';
import {enqueueHearthLobbyFurniture,hearthLobbyPointLights,hearthLobbyOutsideDoor} from '/packages/engine/src/hearth-lobby-scene.ts';
import {GroundChunkCache} from '/packages/engine/src/ground-cache.ts';
import {enqueueRaisedTerrainDepth} from '/packages/engine/src/raised-terrain-depth.ts';
import {sortWorldDepthItems} from '/packages/engine/src/renderer.ts';
import {loadOverworldArt,drawOverworldArcheryTarget,drawOverworldMerchant,drawOverworldAvatar} from '/packages/engine/src/overworld-art.ts';
import {HEARTH_LOBBY_POINTS,HEARTH_LOBBY_FURNITURE,HEARTH_LOBBY_TORCHES,HEARTH_LOBBY_PRACTICE_TARGET} from '/packages/sim/src/hearth-lobby.ts';
import {bootstrapContentRegistry} from '/packages/sim/src/index.ts';
import {loadAuthoredNpcArt} from '/packages/engine/src/authored-npc-art.ts';
import {createGameplayPainter,sortGameplayWorldDepthItems} from '/packages/client/src/gameplay-painter.ts';
import {TileLightmap} from '/packages/engine/src/lighting.ts';
import {WorldLightingRenderer} from '/packages/engine/src/world-lighting-renderer.ts';
import {celestialLightingAtTick} from '/packages/engine/src/celestial-lighting.ts';
import {createLightOcclusionMap} from '/packages/engine/src/light-occlusion.ts';
import {compositeBasicLighting} from '/packages/engine/src/lighting-quality.ts';
import {setGroundLightSource} from '/packages/engine/src/ground-light-source.ts';
import {setWorldAssetPresentation} from '/packages/engine/src/world-asset-presentation.ts';
import {worldAtlasVariants} from '/packages/ui/src/index.ts';
try {
 const art=await loadOverworldArt();
 const registry=bootstrapContentRegistry();await loadAuthoredNpcArt(art,registry.npcs.values());
 const terrain=terrainForSpace({spaceId:65532,name:'Delve lobby study',sizeTiles:24,generator:'delve_lobby',
  environment:'underground',ambient:{r:155,g:149,b:165},weather:false,audioBed:'cave'},1,1);
 const canvas=document.createElement('canvas');canvas.width=1152;canvas.height=1152;
 const context=canvas.getContext('2d');context.imageSmoothingEnabled=false;
 context.fillStyle='#100d17';context.fillRect(0,0,1152,1152);
 const dynamic=${JSON.stringify(lighting)}==='dynamic',basic=${JSON.stringify(lighting)}==='basic';
 const ambient={r:155,g:149,b:165},baseSky=celestialLightingAtTick(0n);
 const sky={...baseSky,diffuse:ambient,combined:ambient,
   sun:{...baseSky.sun,intensity:0,illumination:{r:0,g:0,b:0}},
   moon:{...baseSky.moon,intensity:0,illumination:{r:0,g:0,b:0}}};
 const lightmap=new TileLightmap(),lighting=new WorldLightingRenderer(terrain);
 const lights=hearthLobbyPointLights(0n).map(light=>({...light,color:{r:255,g:142,b:62},elevationLayer:0}));
 if(dynamic){
   if(!await worldAtlasVariants.prepare()||!worldAtlasVariants.commit())throw new Error('Lighting atlas unavailable');
   setWorldAssetPresentation(context,worldAtlasVariants,'omit-baked-shadow');
   setGroundLightSource(context,(source,x,y,level)=>lighting.groundSource(source,x,y,level));
   lightmap.prepare(terrain,0,0,3,1152,1152,ambient,lights,createLightOcclusionMap(terrain,[],[],[],art.cliff),'unified',true);
   lighting.begin(sky,[],[],lightmap,0,0,384,384);
 }
 const receive=(x,y,draw,face='south')=>dynamic?lighting.drawReceiver(context,x,y,terrainElevationAtWorldFoot(terrain,x,y),face,draw):draw();
 const {worldDepthItems:queue,enqueueWorldDepth}=createGameplayPainter({terrain,context,scale:3,seasonalDynamic:dynamic,
   projectionAt:(x,y)=>terrainProjectedDepthAtFoot(terrain,x,y),drawWorldReceiver:receive});
 const ground=new GroundChunkCache();ground.draw(context,art,terrain,0,0,3,1152,1152);
 if(dynamic){lighting.compositeGround(context,3);lighting.compositeFlameGlows(context,lights,3);}
 enqueueRaisedTerrainDepth(queue,context,art,terrain,ground,0,0,3,384,384,undefined,
   (x,y,level,face,draw)=>dynamic?lighting.drawReceiver(context,x,y,level,face,draw):draw());
 enqueueHearthLobbyFurniture(context,art,registry,0,0,3,enqueueWorldDepth);
 const outside=hearthLobbyOutsideDoor(context,art,0,0,3);
 queue.push({...outside,draw:()=>receive((HEARTH_LOBBY_POINTS.exit.tileX+.5)*16,(HEARTH_LOBBY_POINTS.exit.tileY+.5)*16,outside.draw)});
 const supplier=registry.npcs.get('npc:delve_quartermaster');
 const npcX=(supplier.home.tileX+.5)*16,npcY=(supplier.home.tileY+.5)*16;
 enqueueWorldDepth(npcX,npcY,{footY:npcY,elevationLayer:0,depthPhase:'entity',tie:'lobby-supplier',
  draw:()=>drawOverworldMerchant(context,art,npcX,npcY,'down',false,0,0,0,3,supplier.runtimeKind??supplier.id.slice(4))});
 const targetX=(HEARTH_LOBBY_PRACTICE_TARGET.tileX+.5)*16,targetY=(HEARTH_LOBBY_PRACTICE_TARGET.tileY+1)*16;
 enqueueWorldDepth(targetX,targetY,{footY:targetY,elevationLayer:0,depthPhase:'entity',tie:'lobby-practice-target',
  draw:()=>drawOverworldArcheryTarget(context,art,targetX,targetY,0,0,3)});
 if(${lobbyPlayer}){
   const p=HEARTH_LOBBY_POINTS.exit,x=(p.tileX+.5)*16,y=(p.tileY+.5)*16;
   enqueueWorldDepth(x,y,{footY:y,elevationLayer:0,depthPhase:'entity',tie:'player:exit-fixture',
     draw:()=>drawOverworldAvatar(context,art,x,y,'down',false,0,0,0,3,null)});
 }
 for(const item of sortGameplayWorldDepthItems(queue))item.draw();
 if(basic)compositeBasicLighting(context,1152,1152,ambient);
 await fetch('/__login-result',{method:'POST',body:JSON.stringify({png:canvas.toDataURL('image/png'),seed:1,resources:0,decorations:HEARTH_LOBBY_FURNITURE.length+HEARTH_LOBBY_TORCHES.length+2,draws:queue.length})});
} catch(error){await fetch('/__login-result',{method:'POST',body:JSON.stringify({error:String(error),stack:error?.stack})});}
` : `
import { commitEnemyAttack,hearthWardenAttack,FIXED_UNITS_PER_PIXEL,SURVIVAL_WORLD_SEED, generateSurvivalResources, generateSurvivalDecorations,
 generateMarlowCampPathTiles, isMineableOreKind } from '/packages/sim/src/index.ts';
import { HEARTH_RESOURCE_SITES, HEARTH_ENCOUNTERS, HEARTH_ENEMY_PROFILES, createLiveIslandMapDocument, terrainDocumentForMapV3, compileMapDocument } from '/packages/sim/src/index.ts';
import {composeHearthArchipelago} from '/packages/tools/src/hearth-archipelago-authoring.ts';
import {hearthSceneryVisual,HEARTH_SCENERY_ASSETS} from '/packages/tools/src/hearth-village.ts';
import {HEARTH_CINDER_SCENERY_ASSETS} from '/packages/tools/src/hearth-cinder-scenery.ts';
import {composeHearthContentMap} from '/packages/tools/src/hearth-map-composition.ts';
import {bootstrapContentRegistry} from '/packages/sim/src/index.ts';
import {loadAuthoredNpcArt} from '/packages/engine/src/authored-npc-art.ts';
import {drawEnemyAttackTelegraph,drawWardenCrest,drawOutdoorSummonMark} from '/packages/engine/src/combat-telegraph.ts';
import {terrainProjectedDepthAtFoot,terrainElevationAtWorldFoot} from '/packages/engine/src/terrain.ts';
import { terrainArrayForMapDocument } from '/packages/engine/src/editor-terrain.ts';
import { enqueueRaisedTerrainDepth } from '/packages/engine/src/raised-terrain-depth.ts';
import { sortWorldDepthItems } from '/packages/engine/src/renderer.ts';
import { loadGeneratedAsset } from '/packages/ui/src/assets.ts';
import { selectAtlasFrame } from '/packages/ui/src/sprite.ts';
import { preloadLiveMapObjectAssets, enqueueLiveMapObjects,liveMapObjectPointLights,liveMapObjectLightOccluders,liveMapObjectLightFrameKey } from '/packages/engine/src/live-map-runtime.ts';
import {TileLightmap} from '/packages/engine/src/lighting.ts';
import {WorldLightingRenderer} from '/packages/engine/src/world-lighting-renderer.ts';
import {celestialLightingAtTick} from '/packages/engine/src/celestial-lighting.ts';
import {createLightOcclusionMap} from '/packages/engine/src/light-occlusion.ts';
import {compositeBasicLighting} from '/packages/engine/src/lighting-quality.ts';
import {setGroundLightSource} from '/packages/engine/src/ground-light-source.ts';
import {setWorldAssetPresentation} from '/packages/engine/src/world-asset-presentation.ts';
import {worldAtlasVariants} from '/packages/ui/src/index.ts';

import { GroundChunkCache } from '/packages/engine/src/ground-cache.ts';
import { drawAnimatedTerrain } from '/packages/engine/src/animated-terrain.ts';
import { drawInsetGround } from '/packages/engine/src/farmland.ts';
import { loadOverworldArt, drawOverworldAvatar, drawOverworldMerchant, drawOverworldRogueEnemy, drawOverworldTree, drawOverworldOreNode, drawOverworldRock,
 drawOverworldPoiDecoration, overworldPoiDecorationDepthY } from '/packages/engine/src/overworld-art.ts';
const options = ${JSON.stringify(settings)};
try {
 const art = await loadOverworldArt();
 const registry=bootstrapContentRegistry();await loadAuthoredNpcArt(art,registry.npcs.values());
 let document = composeHearthArchipelago(createLiveIslandMapDocument()).document;
 const meta = await (await fetch('/generated/atlas.meta.json')).json();
 const names = Object.entries(meta.assetsById).filter(([,name]) => String(name).startsWith('building_cf_hearth_') || HEARTH_SCENERY_ASSETS.includes(name) || HEARTH_CINDER_SCENERY_ASSETS.includes(name));
 const buildings = new Map(await Promise.all(names.map(async ([id,name]) => {
   const asset = await loadGeneratedAsset(name, 'summer');
   if(asset.assetId!==Number(id))throw new Error('Placeholder or mismatched map asset '+name);
   const frame = selectAtlasFrame(asset.metadata, hearthSceneryVisual(name).name, 0);
   return [name, { id: Number(id), width: frame.width, height: frame.height, anchor: asset.anchor }];
 })));
 const composed = composeHearthContentMap(createLiveIslandMapDocument(), name => { const asset=buildings.get(name); if(!asset)throw new Error('missing '+name); return asset; }, meta.revision);
 if(!composed.document)throw new Error(composed.conflicts.join(','));
 document=composed.document;
 await preloadLiveMapObjectAssets(document);
 let probe=null;
 if(${JSON.stringify(shadowProbe)}){
   const candidates=document.objects.filter(object=>{
     const prefab=document.prefabs.find(p=>p.id===object.prefabId);
     return prefab?.placements.some(p=>p.assetName.startsWith(${JSON.stringify(shadowProbe==='tree'?'tree_':'building_cf_hearth_')}));
   }).sort((a,b)=>(a.tileX-207)**2+(a.tileY-391)**2-((b.tileX-207)**2+(b.tileY-391)**2));
   const target=candidates[0];if(!target)throw new Error('missing shadow probe target');
   const prefab=document.prefabs.find(p=>p.id===target.prefabId),asset=buildings.get(prefab.placements[0].assetName);
   options.centerTileX=target.tileX+.5;options.centerTileY=target.tileY-2;
   probe={kind:${JSON.stringify(shadowProbe)},objectId:target.id,asset:prefab.placements[0].assetName,
     footX:target.tileX*16+8,footY:(target.tileY+1)*16,
     lightX:target.tileX*16+8-(${shadowProbe==='tree'?32:0}||asset.anchor[0]+24),lightY:(target.tileY+1)*16+12};
 }
 const base = terrainDocumentForMapV3(document);
 const terrain = terrainArrayForMapDocument(base, compileMapDocument(base), document, { includeTerrainPlaneCollision: false });
 const canvas = globalThis.document.createElement('canvas');
 canvas.width = options.width; canvas.height = options.height;
 const context = canvas.getContext('2d', { alpha: false });
 if (!context) throw new Error('canvas context unavailable');
 context.imageSmoothingEnabled = false;
 const scale = options.zoom;
 const cameraX = options.centerTileX * 16 - options.width / scale / 2;
 const cameraY = options.centerTileY * 16 - options.height / scale / 2;
 const visible = row => row.tileX * 16 > cameraX - 160 && row.tileX * 16 < cameraX + options.width / scale + 160
  && row.tileY * 16 > cameraY - 160 && row.tileY * 16 < cameraY + options.height / scale + 160;
 const dynamic=${JSON.stringify(lighting)}==='dynamic',basic=${JSON.stringify(lighting)}==='basic';
 const ambient={r:100,g:105,b:130},baseSky=celestialLightingAtTick(0n);
 const sky={...baseSky,diffuse:ambient,combined:ambient,
   sun:{...baseSky.sun,intensity:0,illumination:{r:0,g:0,b:0}},
   moon:{...baseSky.moon,intensity:0,illumination:{r:0,g:0,b:0}}};
 const lightmap=new TileLightmap(),lightingRenderer=new WorldLightingRenderer(terrain);
 const lights=probe?[{worldX:probe.lightX,worldY:probe.lightY,receiverDirectionWorldY:probe.lightY,radiusTiles:10,color:{r:255,g:170,b:90},strengthPerMille:1000,profile:'flame',elevationLayer:0}]:(${noMapLights}?[]:liveMapObjectPointLights(document,registry,0n)).map(light=>({...light,elevationLayer:0}));
 let shadowStudy=null;
 if(dynamic){
   if(${volcanic})throw new Error('Outdoor light study currently supports flat Willowharbour only');
   if(!await worldAtlasVariants.prepare()||!worldAtlasVariants.commit())throw new Error('Lighting atlas unavailable');
   setWorldAssetPresentation(context,worldAtlasVariants,'omit-baked-shadow');
   setGroundLightSource(context,(source,x,y,level)=>lightingRenderer.groundSource(source,x,y,level));
   const coldStart=performance.now();
   const authoredShadows=liveMapObjectLightOccluders(document,terrain,registry,options.frameMs);
   const coldMs=performance.now()-coldStart;
   const renderedShadows=authoredShadows.filter(item=>{
     const tie=String(item.painterOrder?.tie);
     if(${JSON.stringify(omittedShadowObject)}&&tie.includes(':object:'+${JSON.stringify(omittedShadowObject)}+':'))return false;
     if(${onlyProbeShadow}&&probe&&!tie.includes(':object:'+probe.objectId+':'))return false;
     return true;
   });
   const timings=[],keys=new Set(),rebuiltCasters=[];
   let previousCasters=new Set(authoredShadows);
   for(let sample=0;sample<24;sample++){
     const start=performance.now(),timeMs=sample*125;
     keys.add(liveMapObjectLightFrameKey(document,registry,timeMs));
     const sampled=liveMapObjectLightOccluders(document,terrain,registry,timeMs);
     timings.push(performance.now()-start);
     rebuiltCasters.push(sampled.filter(caster=>!previousCasters.has(caster)).length);
     previousCasters=new Set(sampled);
   }
   shadowStudy={objects:document.objects.length,casters:authoredShadows.length,
     columns:authoredShadows.filter(item=>item.shadowMode==='column').length,
     coldMs,samples:timings.length,frameKeys:keys.size,
     rebuiltCasters,meanMs:timings.reduce((a,b)=>a+b,0)/timings.length,maxMs:Math.max(...timings),timings};
   lightmap.prepare(terrain,cameraX,cameraY,scale,options.width,options.height,ambient,lights,
     createLightOcclusionMap(terrain,[],[],${noMapShadows}?[]:${noProbeShadow}?renderedShadows.filter(item=>!String(item.painterOrder?.tie).includes(':object:'+probe.objectId+':')):renderedShadows,art.cliff),'unified',true);
   lightingRenderer.begin(sky,[],[],lightmap,cameraX,cameraY,options.width/scale,options.height/scale);
   if(probe){probe.southLight=lightmap.sampleReceiverLight(probe.footX,probe.footY,0,'south');probe.flatLight=lightmap.sampleReceiverLight(probe.footX,probe.footY,0,'flat');}
 }
 const ground = new GroundChunkCache();
 ground.draw(context, art, terrain, cameraX, cameraY, scale, options.width, options.height);
 drawAnimatedTerrain(context, art, terrain, cameraX, cameraY, scale, options.width / scale, options.height / scale, options.frameMs, 0, 1);
 drawInsetGround(context, art.dirtTerrace, art.farmlandGrassInset, generateMarlowCampPathTiles(), cameraX, cameraY, scale, options.width, options.height);
 if(dynamic){lightingRenderer.compositeGround(context,scale);lightingRenderer.compositeFlameGlows(context,lights,scale);}
 const depthQueue = [];
 enqueueRaisedTerrainDepth(depthQueue, context, art, terrain, ground, cameraX, cameraY, scale, options.width / scale, options.height / scale);
 enqueueLiveMapObjects(document, { context, cameraX, cameraY, scale, timeMs: 0,
   visible: () => true, enqueue: (x,y,item) => {
     const projection=terrainProjectedDepthAtFoot(terrain,x,y),level=terrainElevationAtWorldFoot(terrain,x,y);
     const draw=()=>{context.save();try{context.translate(0,-projection*scale);item.draw();}finally{context.restore();}};
     depthQueue.push({...item,footY:y-projection,elevationLayer:level,
       draw:dynamic?()=>lightingRenderer.drawReceiver(context,x,y,level,item.depthPhase==='surface'?'flat':'south',draw):draw});
   } });
 for(const npc of registry.npcs.values()){
   if(!npc.id.startsWith('npc:willow_')||npc.home.spaceId!==0)continue;
   const x=(npc.home.tileX+.5)*16,y=(npc.home.tileY+.5)*16;
   const depth=y-terrainProjectedDepthAtFoot(terrain,x,y);
   depthQueue.push({footY:depth,elevationLayer:0,depthPhase:'entity',tie:npc.id,
     draw:()=>{const draw=()=>drawOverworldMerchant(context,art,x,depth,npc.facing,false,0,cameraX,cameraY,scale,npc.runtimeKind);if(dynamic)lightingRenderer.drawReceiver(context,x,y,0,'south',draw);else draw();}});
 }
 if(${pond}) {
   const x=140.5*16,y=380*16;
   depthQueue.push({footY:y,depthPhase:'entity',tie:'pond-player',
     draw:()=>drawOverworldAvatar(context,art,x,y,'right',false,0,cameraX,cameraY,scale,null)});
 }
 if(${volcanic}) {
   for(const [kind,name] of Object.entries({rock_basalt:'resource_cf_hearth_basalt',ore_cinder:'resource_cf_hearth_cinder',ore_emberglass:'resource_cf_hearth_emberglass',tree_ashwood:'resource_cf_hearth_ashwood'})) {
     const id=Object.entries(meta.assetsById).find(([,value])=>value===name)?.[0];
     if(id===undefined||art.hearthResources?.[kind]?.assetId!==Number(id))throw new Error('Missing exact gathering asset '+name);
   }
   const project=(x,y)=>y-terrainProjectedDepthAtFoot(terrain,x,y);
   for(const site of HEARTH_RESOURCE_SITES) {
     const x=(site.tileX+.5)*16,y=(site.tileY+1)*16,depth=project(x,y);
     depthQueue.push({footY:depth,elevationLayer:site.elevation,depthPhase:'entity',tie:'gathering-'+site.id,
       draw:()=>site.kind==='tree_ashwood'?drawOverworldTree(context,art,x,depth,false,cameraX,cameraY,scale,site.kind)
         :drawOverworldOreNode(context,art,site.kind,x,depth,cameraX,cameraY,scale)});
   }
   const artKinds={ember_slime:'slime_small_red',ember_cowling:'cowling',cowling_pyromancer:'cowling_mage',cinder_skull:'flying_skull'};
   for(const camp of HEARTH_ENCOUNTERS)for(const member of camp.members) {
     if(member.kind==='caldera_warden')continue;
     const x=(member.tileX+.5)*16,y=(member.tileY+.5)*16,profile=HEARTH_ENEMY_PROFILES[member.kind];
     const attack=commitEnemyAttack(profile.pattern,1n,0n,{x:x*FIXED_UNITS_PER_PIXEL,y:y*FIXED_UNITS_PER_PIXEL},
       {x:(x+24)*FIXED_UNITS_PER_PIXEL,y:(y+12)*FIXED_UNITS_PER_PIXEL},profile.rangeTiles*16*FIXED_UNITS_PER_PIXEL);
     depthQueue.push({footY:project(x,y),elevationLayer:camp.elevation,depthPhase:'entity',tie:'encounter-'+member.kind+'-'+member.tileX,
       draw:()=>drawOverworldRogueEnemy(context,art,artKinds[member.kind],'tell',x,project(x,y),'right',false,1,cameraX,cameraY,scale,false)});
     depthQueue.push({footY:terrain.height*16+16,elevationLayer:camp.elevation,depthPhase:'surface',tie:'tell-'+member.tileX,
       draw:()=>drawEnemyAttackTelegraph(context,attack,8n,cameraX,cameraY,scale,project)});
   }
   const x=(${boundaryShot==='north'?665.5:boundaryShot==='east'?667.5:cinderShot==='caldera'?723.5:cinderShot==='east'?710.5:cinderShot==='landing'?650.5:673.5})*16,y=(${boundaryShot==='north'?194.5:boundaryShot==='east'?206.5:cinderShot==='caldera'?120:cinderShot==='east'?213:cinderShot==='landing'?204.5:207})*16;
   depthQueue.push({footY:project(x,y),elevationLayer:terrainElevationAtWorldFoot(terrain,x,y),depthPhase:'entity',tie:'cinder-player',
     draw:()=>drawOverworldAvatar(context,art,x,project(x,y),'right',false,0,cameraX,cameraY,scale,null)});
 }
 if(options.warden){
   const x=721.5*16,y=117.5*16,project=(x,y)=>y-terrainProjectedDepthAtFoot(terrain,x,y);
   const tuning=hearthWardenAttack(3,1);
   const attack={...commitEnemyAttack('burst',1n,0n,{x:x*FIXED_UNITS_PER_PIXEL,y:y*FIXED_UNITS_PER_PIXEL},
     {x:724.5*16*FIXED_UNITS_PER_PIXEL,y:120.5*16*FIXED_UNITS_PER_PIXEL},7*16*FIXED_UNITS_PER_PIXEL),
     tellTicks:tuning.tellTicks,activeTicks:tuning.activeTicks,recoveryTicks:tuning.recoveryTicks};
   depthQueue.push({footY:terrain.height*16+16,elevationLayer:3,depthPhase:'surface',tie:'warden-marks',draw:()=>{
     drawEnemyAttackTelegraph(context,attack,10n,cameraX,cameraY,scale,project);
     drawWardenCrest(context,x,project(x,y),3,20n,10n,cameraX,cameraY,scale);
     for(const tileX of [715.5,727.5])drawOutdoorSummonMark(context,tileX*16,project(tileX*16,116.5*16),10n,0n,cameraX,cameraY,scale);
   }});
   depthQueue.push({footY:project(x,y),elevationLayer:3,depthPhase:'entity',tie:'warden',
     draw:()=>drawOverworldRogueEnemy(context,art,'cowling','tell',x,project(x,y),'down',false,1,cameraX,cameraY,scale,false)});
 }
 for (const item of sortWorldDepthItems(depthQueue)) {
   item.draw();
 }
 const decorations = generateSurvivalDecorations(SURVIVAL_WORLD_SEED).filter(visible);
 const resources = generateSurvivalResources(SURVIVAL_WORLD_SEED).filter(visible);
 const draws = decorations.map(row => ({ depth: overworldPoiDecorationDepthY(row.kind, (row.tileY + 1) * 16),
  draw: () => drawOverworldPoiDecoration(context, art, row.kind, row.tileX * 16 + 8, (row.tileY + 1) * 16,
    cameraX, cameraY, scale, row.variant, 0, true) }));
 for (const row of resources) {
  const x = row.tileX * 16 + 8, y = (row.tileY + 1) * 16;
  if (row.kind.startsWith('tree_')) draws.push({ depth: y,
   draw: () => drawOverworldTree(context, art, x, y - 4, false, cameraX, cameraY, scale, row.kind, 0, 0) });
  else if (isMineableOreKind(row.kind)) draws.push({ depth: y,
   draw: () => drawOverworldOreNode(context, art, row.kind, x, y, cameraX, cameraY, scale, row.nodeClass, row.richness) });
  else if (row.kind === 'rock' || row.kind === 'rock_large') draws.push({ depth: y,
   draw: () => drawOverworldRock(context, art, x, y, cameraX, cameraY, scale) });
 }
 draws.sort((a, b) => a.depth - b.depth).forEach(row => row.draw());
 if(basic)compositeBasicLighting(context,options.width,options.height,ambient);
 await fetch('/__login-result', { method: 'POST', body: JSON.stringify({ png: canvas.toDataURL('image/png'),
  shadowProbe:probe?{...probe,cameraX,cameraY}:null,shadowStudy,mapLights:liveMapObjectPointLights(document,registry,0n).length,seed: SURVIVAL_WORLD_SEED, players: ${pond||volcanic}?1:0, decorations: decorations.length, resources: resources.length+(${volcanic}?6:0), draws: draws.length + document.objects.length+(${volcanic}?19:0) }) });
} catch (error) {
 await fetch('/__login-result', { method: 'POST', body: JSON.stringify({ error: String(error), stack: error?.stack }) });
}
`;
let finish: (value: string) => void = () => undefined;
const result = new Promise<string>((resolveResult) => { finish = resolveResult; });
const server = await createServer({
 root, configFile: false, publicDir: resolve(root, 'packages/client/public'),
 server: { host: '127.0.0.1', port: 0, strictPort: false }, logLevel: 'error',
 plugins: [{ name: 'offline-login-island', configureServer(server) {
  server.middlewares.use((request, response, next) => {
   if (request.url === '/__login-island') {
    response.setHeader('Content-Type', 'text/html');
    response.end('<!doctype html><html><body><script type="module" src="/__login-scene.js"></script></body></html>');
   } else if (request.url === '/__login-scene.js') {
    response.setHeader('Content-Type', 'text/javascript'); response.end(scene);
   } else if (request.url === '/__login-result' && request.method === 'POST') {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => { finish(Buffer.concat(chunks).toString('utf8')); response.end('ok'); });
   } else next();
  });
 } }],
});
const profile = await mkdtemp(resolve(tmpdir(), 'orchard-login-art-'));
await server.listen();
const address = server.httpServer?.address();
if (address === null || address === undefined || typeof address === 'string') throw new Error('preview address unavailable');
const chrome = spawn(process.env['CHROME_BIN'] ?? '/usr/bin/google-chrome', [
 '--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--disable-background-networking',
 `--user-data-dir=${profile}`, `http://127.0.0.1:${address.port}/__login-island`,
], { stdio: 'ignore' });
let timer: ReturnType<typeof setTimeout> | undefined;
try {
 const payload = JSON.parse(await Promise.race([result, new Promise<never>((_resolve, reject) => {
  timer = setTimeout(() => reject(new Error('Offline render timed out')), 120_000);
 })])) as { png?: string; error?: string; stack?: string; seed: number; resources: number; decorations: number; draws: number; players?:number;mapLights?:number;checks?:number;shadowStudy?:unknown;shadowProbe?:unknown };
 if (payload.error !== undefined || payload.png === undefined) throw new Error(payload.stack ?? payload.error ?? 'render missing');
 const png = Buffer.from(payload.png.slice('data:image/png;base64,'.length), 'base64');
 const decoded = decodePng(png);
 let residenceSeamPixels: number | undefined;
 if (residence) {
   let differences=0;
   for(let y=0;y<96;y++)for(let x=0;x<320;x++)for(let channel=0;channel<4;channel++) {
     const normal=(y*decoded.width+96+x)*4+channel;
     const crossing=((448+y)*decoded.width+3072+96+x)*4+channel;
     if(decoded.rgba[normal]!==decoded.rgba[crossing])differences++;
   }
   if(differences)throw new Error('Residence cache-seam wall differs from uninterrupted wall: '+differences+' channels');
   residenceSeamPixels=320*96;
 }

 if (decoded.width !== settings.width || decoded.height !== settings.height) throw new Error('render dimensions invalid');
 await mkdir(dirname(output), { recursive: true });
 await writeFile(output, png);
 const atlas = JSON.parse(await readFile(resolve(root, 'packages/client/public/generated/atlas.meta.json'), 'utf8')) as { revision: string };
 const sourcePaths = ['packages/engine/src/hearth-architecture-scene.ts', 'packages/engine/src/hearth-doorway.ts', 'packages/assets/props/prop_cf_hearth_doorway_frame.sprite.json', 'packages/assets/props/prop_cf_hearth_doorway_jamb_left.sprite.json', 'packages/assets/props/prop_cf_hearth_doorway_jamb_right.sprite.json', 'packages/assets/tiles/tile_cf_hearth_townhouse_floor.tile.json', 'packages/assets/props/prop_cf_hearth_partition_window.sprite.json', 'packages/tools/src/hearth-architecture-crops.json', 'packages/engine/src/residence-wall.ts', 'packages/sim/src/spaces.ts', 'packages/assets/props/prop_cf_hearth_plaster_wall.sprite.json', 'packages/sim/src/hearth-interiors.ts', 'packages/engine/src/hearth-interior-scene.ts', 'packages/tools/src/render-hearth-study.ts', 'packages/sim/src/hearth-archipelago.ts', 'packages/tools/src/hearth-archipelago-authoring.ts', 'packages/sim/src/hearth-lobby.ts', 'packages/engine/src/hearth-lobby-scene.ts', 'packages/client/src/gameplay-painter.ts', 'packages/client/src/gameplay-painter-setup.ts', 'packages/client/src/gameplay-painter-decorations.ts', 'packages/assets/props/prop_cf_dungeon_door_closed.sprite.json', 'packages/engine/src/light-sources.ts', 'packages/engine/src/lighting.ts', 'packages/engine/src/world-lighting-renderer.ts', 'packages/engine/src/authored-npc-art.ts', 'packages/assets/content/npcs.json', 'packages/assets/content/shops.json', 'packages/assets/content/dialogues.json', 'packages/tools/src/hearth-village.ts', 'packages/sim/src/survival-world.ts',
  'packages/sim/src/content/bootstrap-spaces.ts','packages/sim/src/hearth-warden.ts','packages/engine/src/combat-telegraph.ts', 'packages/engine/src/terrain.ts',
  'packages/engine/src/ground-cache.ts', 'packages/engine/src/animated-terrain.ts',
  'packages/engine/src/overworld-art.ts', 'packages/client/public/generated/atlas.meta.json'];
 sourcePaths.push('packages/assets/content/objects.json','packages/engine/src/light-occlusion.ts','packages/engine/src/map-shadow-contacts.ts','packages/engine/src/transformed-light-sprite.ts');
 sourcePaths.push('packages/engine/src/ground-light-source.ts','packages/engine/src/webgl/geometry.ts','packages/engine/src/webgl/world-pass-webgl.ts','packages/tools/src/ground-light-transform-fixture.js');
 sourcePaths.push('packages/assets/props/prop_cf_standing_torch.sprite.json','packages/engine/src/live-map-runtime.ts','packages/engine/src/light-projection.ts');
 sourcePaths.push(...['prop_cf_furniture_rustic_runner','prop_cf_chest','prop_cf_furniture_rustic_bookshelf','prop_cf_furniture_rustic_standing_lamp'].map(name=>`packages/assets/props/${name}.sprite.json`));
 if(farm) sourcePaths.push(...['prop_cf_fence_horizontal','prop_cf_fence_vertical','prop_cf_farm_hay_bale','prop_cf_farm_hay_stack'].map(name=>`packages/assets/props/${name}.sprite.json`),
   ...['crop_cf_carrot_mature','crop_cf_wheat_mature'].map(name=>`packages/assets/crops/${name}.sprite.json`));
 if(harbour) sourcePaths.push('packages/assets/props/vehicle_cf_boat.sprite.json',
   'packages/assets/props/prop_cf_hearth_harbour_sign.sprite.json','packages/tools/src/import-hearth-harbour.ts');
 if(pond||harbour) {
   sourcePaths.push('packages/engine/src/live-map-runtime.ts','packages/tools/src/import-hearth-bridge.ts',
     'references/art/kenmi/cute-fantasy/core/Tiles/Bridge/Bridge_Stone_Horizontal.png');
   for(const end of ['left','middle','right']) for(const part of ['north','deck','south'])
     sourcePaths.push(`packages/assets/props/prop_cf_hearth_bridge_${end}_${part}.sprite.json`);
 }
 sourcePaths.push('packages/sim/src/hearth-danger-notice.ts','packages/ui/src/overworld-ui.ts');
 sourcePaths.push('packages/tools/src/hearth-cinder-scenery.ts','packages/tools/src/hearth-map-composition.ts');
 const sourceSha256 = Object.fromEntries(await Promise.all(sourcePaths.map(async (path) => [
  path, createHash('sha256').update(await readFile(resolve(root, path))).digest('hex'),
 ])));
 const provenance = { format: 'orchard-hearth-terrain-study-v1', ...settings, lighting, cinderShot, boundaryShot, encounterFixture: volcanic, releaseReady: false, noInteriorLights, noMapLights,noMapShadows,noProbeShadow,onlyProbeShadow,omittedShadowObject, seed: payload.seed,
  ...(residenceSeamPixels===undefined?{}:{residenceSeamPixels, residenceSeamDifferences:0}),
  generator: groundCheck ? 'synthetic nonuniform world light field and native-pixel source; real CPU groundSource' : residence ? 'residence expansion ranks0,1,2 through terrainForSpace' : interiors ? 'hearthInteriorCollision + native terrainForSpace' : lobby ? 'generateHearthLobbyLayout + native terrainForSpace' : 'composeHearthContentMap + shared map terrain compiler',
  renderer: groundCheck ? 'Seven CPU affine sampling cases;987 RGB assertions, alpha preservation, transform reset and invalid-basis rejection' : architecture ? 'GroundChunkCache saved construction floor/low wall band + native window enqueue + three standing avatar fixtures through sorted gameplay painter; unlit architectural fixture only' : residence ? 'GroundChunkCache native residence floor and three-course walls; architectural fixture only' : interiors ? 'GroundChunkCache + shared native interior furniture through gameplay painter; optional Basic/Dynamic authored furniture lights, authored service NPCs and southern-exit player fixtures' : lobby ? 'GroundChunkCache + native raised terrain, furniture, torches, closed descent, supplier and practice-target fixtures through gameplay painter; optional Basic/Dynamic lighting' : 'GroundChunkCache + drawAnimatedTerrain + native object/resource drawing',
  atlasRevision: atlas.revision, sourceSha256, decorations: payload.decorations, resources: payload.resources, draws: payload.draws,
  shadowProbe:payload.shadowProbe??null,shadowStudy:payload.shadowStudy??null,checks:payload.checks??0,mapLights:payload.mapLights??0, outdoorLightingLimitations:!interiors&&!lobby&&lighting!=='unlit'?'Controlled ambient, flat Willowharbour; map object/NPC receivers and native authored sprite occlusion, empty soft obstacles matching live setup; collector timings are local headless CPU measurements only; celestial/tree-shadow, raised-map parity and live receiver acceptance remain open':null, players: payload.players??(interiors?6:lobby&&lobbyPlayer?1:0), liveData: false, imageSha256: createHash('sha256').update(png).digest('hex'),
  rgbaSha256: createHash('sha256').update(decoded.rgba).digest('hex'),
  reproduce: `npx tsx packages/tools/src/render-hearth-study.ts${shadowProbe?' --'+shadowProbe+'-shadow-probe':groundCheck?' --ground-light-check':architecture?' --architecture':residence?' --residence':interiors?' --interiors'+(lighting==='unlit'?'':' --'+lighting)+(noInteriorLights?' --no-interior-lights':''):lobby?' --lobby'+(lighting==='unlit'?'':' --'+lighting)+(lobbyPlayer?' --exit-player':''):warden?' --warden':boundaryShot?' --cinder-boundary-'+boundaryShot:cinderShot?' --cinder-'+cinderShot:farm?' --farm':pond?' --pond':harbour?' --harbour':residents?' --residents':town?' --town':volcanic?' --cinderwake':''}${!interiors&&!lobby&&lighting!=='unlit'?' --'+lighting:''}${noMapLights?' --no-map-lights':''}${noMapShadows?' --no-map-shadows':''}${noProbeShadow?' --no-probe-shadow':''}${onlyProbeShadow?' --only-probe-shadow':''}${omittedShadowObject?' --omit-shadow-object='+omittedShadowObject:''}`,
 };
 const provenancePath = output.replace(/\.png$/, '.provenance.json');
 await mkdir(dirname(provenancePath), { recursive: true });
 await writeFile(provenancePath, `${JSON.stringify(provenance, null, 2)}\n`);
 console.log(JSON.stringify({ output, ...provenance }, null, 2));
} finally {
 if (timer !== undefined) clearTimeout(timer);
 chrome.kill(); await server.close(); await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
