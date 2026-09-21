import {placeablePointLight} from './light-sources.js';
import {hearthInteriorForSpace,hearthInteriorNativePlacements,hearthFurniturePresentationAnchor,resolveObjectLight,type ContentRegistry} from '@orchard/sim';
import {drawAuthoredOverworldObject,drawOverworldPoiDecoration,drawOverworldPlaceable,type OverworldArt} from './overworld-art.js';
import type {WorldDepthItem} from './renderer.js';
import {resolveHearthFixtureRenderer} from './hearth-fixture-presentation.js';

/** Shared by the game painter and native interior review captures. */
export function enqueueHearthInteriorFurniture(context:CanvasRenderingContext2D,art:OverworldArt,
  registry:ContentRegistry,spaceId:number,cameraX:number,cameraY:number,scale:number,enqueue:(x:number,y:number,item:WorldDepthItem,terrainSampleY?:number,receiver?:'flat'|'south')=>void):void{
  const interior=hearthInteriorForSpace(registry,spaceId);
  if(!interior)return;
  const space=[...registry.spaces.values()].find(s=>s.spaceId===spaceId&&s.retired!==true);
  for(const [tileX,tileY] of space?.hearthInteriorWindows??[]){
    const floor=(x:number,y:number)=>interior.rooms.some(([l,t,r,b])=>x>=l&&x<=r&&y>=t&&y<=b);
    if(!floor(tileX,tileY)||[1,2,3].some(dy=>floor(tileX,tileY-dy)))continue;
    const x=tileX*16+8,y=tileY*16;
    if(art.hearthPartitionWindow)enqueue(x,y,{footY:y,depthPhase:'entity',tie:`hearth-window:${tileX}:${tileY}`,
      draw:()=>drawAuthoredOverworldObject(context,art.hearthPartitionWindow,'base',0,x,y,cameraX,cameraY,scale)});
  }
  const placements=hearthInteriorNativePlacements(registry,interior);
  for(const root of placements){
    if(root.shape.layer==='tabletop')continue;
    const base=hearthFurniturePresentationAnchor(root,placements)!;
    const contact={x:base.x,y:base.y-(root.shape.layer==='wall'?32:0)};
    const asset=art.itemIcons[root.shape.id];
    if(!asset)continue;
    const group=[root,...placements.filter(item=>item.supportId===root.id)];
    enqueue(contact.x,contact.y,{footY:contact.y,elevationLayer:0,
      depthPhase:root.shape.layer==='floor'?'surface':'entity',tie:`hearth-interior:${root.id}`,
      draw:()=>{for(const item of group){
        const native=art.itemIcons[item.shape.id],anchor=hearthFurniturePresentationAnchor(item,placements);
        if(native&&anchor)drawAuthoredOverworldObject(context,native,item.shape.id==='furniture_rustic_cooking_range'?'burn':'base',0,anchor.x,anchor.y-(item.shape.layer==='wall'?32:0),cameraX,cameraY,scale);
      }}},contact.y,root.shape.layer==='floor'?'flat':'south');
  }
  const objects=[...interior.furniture,{id:'outside-door',kind:'residence_door',
    tileX:interior.exit.tileX,tileY:28}];
  for(const item of objects){
    if(placements.some(placement=>placement.id===item.id))continue;
    const objectTag='objectTag' in item?item.objectTag:undefined;
    const rendererKind=objectTag===undefined?null:resolveHearthFixtureRenderer(registry,objectTag);
    if(objectTag!==undefined&&rendererKind===null)continue;
    const x=item.tileX*16+8,y=item.tileY*16;
    enqueue(x,y,{footY:y,elevationLayer:0,depthPhase:'entity',tie:`hearth-interior:${item.id}`,
      draw:()=>rendererKind!==null
        ?drawOverworldPlaceable(context,art,rendererKind,false,0,0,x,y,cameraX,cameraY,scale)
        :drawOverworldPoiDecoration(context,art,item.kind,x,y,cameraX,cameraY,scale)});
  }
}

/** Static shop lights use the catalogue component and the same contact/lift as
 * player furniture. These are permanent showroom fixtures, not mutable rows. */
export function hearthInteriorPointLights(spaceId:number,registry:ContentRegistry,art:OverworldArt,authorityTick:bigint){
  const interior=hearthInteriorForSpace(registry,spaceId);
  if(!interior)return [];
  const placements=hearthInteriorNativePlacements(registry,interior);
  return placements.flatMap((item,index)=>{
    const authored=interior.furniture.find(entry=>entry.id===item.id);
    const definition=authored===undefined?undefined:registry.objects.get(authored.definitionId);
    const component=definition?.retired===true?undefined:definition?.components.light;
    if(!component||!art.itemIcons[item.shape.id])return [];
    const parent=item.supportId?placements.find(root=>root.id===item.supportId):item;
    if(!parent||!art.itemIcons[parent.shape.id])return [];
    const anchor=hearthFurniturePresentationAnchor(item,placements),contact=hearthFurniturePresentationAnchor(parent,placements);
    if(!anchor||!contact)return [];
    const light=placeablePointLight({id:BigInt(spaceId)*65536n+BigInt(index),kind:item.shape.id,tileX:item.tileX,tileY:item.tileY},
      authorityTick,resolveObjectLight(component,{lit:true}));
    return light?[{...light,worldX:anchor.x,worldY:anchor.y+(component.offsetY??0),receiverDirectionWorldY:contact.y}]:[];
  });
}
