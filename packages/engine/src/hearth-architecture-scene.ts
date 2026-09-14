import {hearthDoorwayFeatures} from './hearth-doorway.js';
import type {HearthArchitectureCell} from '@orchard/sim';
import {drawAuthoredOverworldObject,type OverworldArt} from './overworld-art.js';
import type {WorldDepthItem} from './renderer.js';
/** Conservative bounds cover a 64px avatar pose, equipment and seating offsets.
 * Anchors must be the player's final predicted/interpolated/projected draw anchor. */
export function hearthWindowOpacity(x:number,y:number,actors:Iterable<{readonly x:number;readonly y:number}>):number {
  return hearthFeatureOpacity(x,y,16,32,actors);
}
export function hearthFeatureOpacity(x:number,y:number,width:number,height:number,actors:Iterable<{readonly x:number;readonly y:number}>):number {
  for(const actor of actors) {
    if(actor.x+32>=x-width/2&&actor.x-32<=x+width/2&&actor.y+16>=y-height+1&&actor.y-64<=y+1)return .25;
  }
  return 1;
}
/** Windows remain separate from the always-visible low collision band. Actor
 * anchors are read at draw time, after every player producer has run. */
export function enqueueHearthArchitectureFeatures(context:CanvasRenderingContext2D,art:OverworldArt,
  cells:readonly HearthArchitectureCell[],cameraX:number,cameraY:number,scale:number,
  actors:()=>Iterable<{readonly x:number;readonly y:number}>,
  enqueue:(x:number,y:number,item:WorldDepthItem,terrainSampleY?:number,receiver?:'flat'|'south')=>void):void {
  for(const cell of cells) {
    if(cell.partition!=='wall'||!cell.window)continue;
    const x=(cell.tileX+.5)*16,y=(cell.tileY+1)*16;
    enqueue(x,y,{footY:y,elevationLayer:0,depthPhase:'entity',tie:`hearth-window:${cell.tileX},${cell.tileY}`,
      draw:()=>{
        context.save();
        context.globalAlpha*=hearthWindowOpacity(x,y,actors());
        drawAuthoredOverworldObject(context,art.hearthPartitionWindow,'base',0,x,y,cameraX,cameraY,scale);
        context.restore();
      }},y,'south');
  }
  for(const frame of hearthDoorwayFeatures(cells).frames){
    const {x,y}=frame;
    enqueue(x,y,{footY:y,elevationLayer:0,depthPhase:'entity',tie:`hearth-doorway:${x},${y}`,
      draw:()=>{
        context.save();context.globalAlpha*=hearthFeatureOpacity(x,y,32,26,actors());
        drawAuthoredOverworldObject(context,art.hearthDoorwayFrame,'base',0,x,y,cameraX,cameraY,scale);
        context.restore();
      }},y,'south');
  }

}
