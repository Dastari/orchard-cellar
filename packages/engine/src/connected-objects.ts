import {connectedObjectAsset,connectedObjectFrame,type ConnectedObjectFamily} from '@orchard/sim';
import {loadGeneratedAsset,type LoadedAsset} from '@orchard/ui';
import {drawAuthoredOverworldObject} from './overworld-art.js';

const assets=new Map<ConnectedObjectFamily,LoadedAsset>();
const retryAfter=new Map<ConnectedObjectFamily,number>();
const pending=new Map<ConnectedObjectFamily,Promise<void>>();
export function connectedObjectArtReady(family:ConnectedObjectFamily):boolean { return assets.has(family); }
export function preloadConnectedObjectArt(family:ConnectedObjectFamily):Promise<void> {
  if(assets.has(family))return Promise.resolve();
  if((retryAfter.get(family)??0)>Date.now())return Promise.resolve();
  const loading=pending.get(family);if(loading)return loading;
  const promise=loadGeneratedAsset(connectedObjectAsset(family),'summer').then(asset=>{assets.set(family,asset);retryAfter.delete(family);}).catch(error=>{retryAfter.set(family,Date.now()+5000);throw error;})
    .finally(()=>pending.delete(family));
  pending.set(family,promise);return promise;
}
/** Shared live-player/Studio rendering. A mask selects a native topology frame,
 * never an animation index on the unrelated single-frame authored sprite. */
export function drawConnectedObject(context:CanvasRenderingContext2D,family:ConnectedObjectFamily,mask:number,
  x:number,y:number,cameraX:number,cameraY:number,zoom:number):boolean {
  const asset=assets.get(family);
  if(!asset){void preloadConnectedObjectArt(family).catch(()=>undefined);return false;}
  return drawAuthoredOverworldObject(context,asset,'base',connectedObjectFrame(family,mask),x,y,cameraX,cameraY,zoom);
}
