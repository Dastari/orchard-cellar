import {HEARTH_LOBBY_SIZE,HEARTH_LOBBY_POINTS,HEARTH_LOBBY_TORCHES,
  activeHearthLobbyDefinition,type ContentRegistry} from '@orchard/sim';
import {drawOverworldChest,drawHearthDescentDoor,drawHearthOutsideDoor,drawOverworldPlaceable,drawOverworldPoiDecoration,type OverworldArt} from './overworld-art.js';
import {placeablePointLight} from './light-sources.js';
import type {WorldDepthItem} from './renderer.js';
import {resolveHearthFixtureRenderer} from './hearth-fixture-presentation.js';

/** Used by both the playable scene and offline native-art review. */
export function enqueueHearthLobbyFurniture(context:CanvasRenderingContext2D,art:OverworldArt,
  registry:ContentRegistry,cameraX:number,cameraY:number,scale:number,enqueue:(x:number,y:number,item:WorldDepthItem)=>void,torchFrame=0):void{
  const lobby=activeHearthLobbyDefinition(registry);
  if(lobby===null)return;
  const point=lobby.points.descent,x=(point.tileX+.5)*16,y=point.tileY*16;
  enqueue(x,y,{footY:y,elevationLayer:0,depthPhase:'entity',tie:'hearth-lobby:door:descent',
    draw:()=>drawHearthDescentDoor(context,art,x,y,cameraX,cameraY,scale)});
  for(const torch of lobby.torches){
    const x=torch.tileX*16+8,y=(torch.tileY+1)*16;
    enqueue(x,y,{footY:y,elevationLayer:0,depthPhase:'entity',tie:`hearth-lobby:torch:${torch.id}`,
      draw:()=>drawOverworldPlaceable(context,art,torch.kind,false,0,torchFrame,x,y,cameraX,cameraY,scale)});
  }
  for(const item of lobby.furniture){
    const objectTag='objectTag' in item?item.objectTag:undefined;
    const rendererKind=objectTag===undefined?null:resolveHearthFixtureRenderer(registry,objectTag);
    if(objectTag!==undefined&&rendererKind===null)continue;
    const x=item.tileX*16+8,y=item.tileY*16;
    enqueue(x,y,{footY:y,elevationLayer:0,depthPhase:'entity',tie:`hearth-lobby:${item.id}`,
      draw:()=>rendererKind==='chest' ? drawOverworldChest(context,art,x,y,cameraX,cameraY,scale)
        : drawOverworldPoiDecoration(context,art,item.kind,x,y,cameraX,cameraY,scale)});
  }
}

/** Uses the same flame profile and anchors as player-placed standing torches. */
export function hearthLobbyPointLights(authorityTick:bigint,registry?:ContentRegistry){
  const torches=registry===undefined?HEARTH_LOBBY_TORCHES
    : activeHearthLobbyDefinition(registry)?.torches??[];
  return torches.flatMap(torch=>{
    const light=placeablePointLight(torch,authorityTick);
    return light===null?[]:[light];
  });
}

/** The outside opening is mounted on the southern wall's cap, not the actor
 * floor plane. Submit alongside raised terrain so the cap cannot cover it. */
export function hearthLobbyOutsideDoor(context:CanvasRenderingContext2D,art:OverworldArt,
  cameraX:number,cameraY:number,scale:number):WorldDepthItem;
export function hearthLobbyOutsideDoor(context:CanvasRenderingContext2D,art:OverworldArt,
  cameraX:number,cameraY:number,scale:number,registry:ContentRegistry):WorldDepthItem|null;
export function hearthLobbyOutsideDoor(context:CanvasRenderingContext2D,art:OverworldArt,
  cameraX:number,cameraY:number,scale:number,registry?:ContentRegistry):WorldDepthItem|null{
  const lobby=registry===undefined?{points:HEARTH_LOBBY_POINTS,sizeTiles:HEARTH_LOBBY_SIZE}
    : activeHearthLobbyDefinition(registry);
  if(lobby===null)return null;
  const point=lobby.points.exit,x=(point.tileX+.5)*16,y=(lobby.sizeTiles-2)*16-1;
  return {footY:y,elevationLayer:1,depthPhase:'entity',tie:'hearth-lobby:door:outside',
    draw:()=>drawHearthOutsideDoor(context,art,x,y,cameraX,cameraY,scale)};
}
