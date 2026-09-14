import {hearthFurniturePresentationAnchor,type HearthFurniturePlacement} from '@orchard/sim';
import {actionVisualForDirection,drawAuthoredOverworldObject,drawOverworldAvatar,type OverworldArt,type PlayerAppearanceVisual} from './overworld-art.js';

/** Draw as one parent-owned depth/lighting group at the furniture floor contact.
 * Offsets align the reviewed native straddle pose with each seat's cushion; they
 * never alter the authority's physical body position or stand destination. */
export function drawHearthSeatedGroup(context:CanvasRenderingContext2D,art:OverworldArt,seat:HearthFurniturePlacement,
  appearance:PlayerAppearanceVisual,cameraX:number,cameraY:number,scale:number,frame:number):boolean{
  if(seat.shape.seatPoseOffsetPixels===undefined)return false;
  const asset=art.itemIcons[seat.shape.id],anchor=hearthFurniturePresentationAnchor(seat,[]);
  const pose=actionVisualForDirection(art,'sitting','down');
  if(!asset||!anchor||!pose)return false;
  drawAuthoredOverworldObject(context,asset,'base',0,anchor.x,anchor.y,cameraX,cameraY,scale);
  drawOverworldAvatar(context,art,anchor.x,anchor.y+seat.shape.seatPoseOffsetPixels,
    'down',false,0,cameraX,cameraY,scale,frame,pose,appearance);
  return true;
}
