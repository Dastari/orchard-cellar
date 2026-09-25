import type {ConnectedObjectFamily,RuleCatalogue} from '@orchard/sim';
import {connectedObjectAsset,connectedObjectResolvedFrame} from '@orchard/sim/connected-objects';
import {loadGeneratedAsset,type LoadedAsset} from '@orchard/ui';
import {drawAuthoredOverworldObject} from './overworld-art.js';

// Cache by authored asset, not family id: a published catalogue can change art.
const assets=new Map<string,LoadedAsset>();
const retryAfter=new Map<string,number>();
const pending=new Map<string,Promise<void>>();
export function connectedObjectArtReady(family:ConnectedObjectFamily,catalogue?:RuleCatalogue):boolean { return assets.has(connectedObjectAsset(family,catalogue)); }
function preloadAsset(name:string):Promise<void> {
  if(!name||assets.has(name))return Promise.resolve();
  if((retryAfter.get(name)??0)>Date.now())return Promise.resolve();
  const loading=pending.get(name);if(loading)return loading;
  const promise=loadGeneratedAsset(name,'summer').then(asset=>{assets.set(name,asset);retryAfter.delete(name);}).catch(error=>{retryAfter.set(name,Date.now()+5000);throw error;})
    .finally(()=>pending.delete(name));
  pending.set(name,promise);return promise;
}
export function preloadConnectedObjectArt(family:ConnectedObjectFamily,catalogue?:RuleCatalogue):Promise<void> {
  return preloadAsset(connectedObjectAsset(family,catalogue));
}
/** Shared live-player/Studio rendering from the active authored catalogue. */
export function drawConnectedObject(context:CanvasRenderingContext2D,family:ConnectedObjectFamily,mask:number,
  x:number,y:number,cameraX:number,cameraY:number,zoom:number,catalogue?:RuleCatalogue):boolean {
  const resolved=connectedObjectResolvedFrame(family,mask,catalogue,Math.imul(x,73856093)^Math.imul(y,19349663),'summer');
  if(!resolved)return false;
  const asset=assets.get(resolved.assetId);
  if(!asset){void preloadAsset(resolved.assetId).catch(()=>undefined);return false;}
  if(!resolved.transform)return drawAuthoredOverworldObject(context,asset,'base',resolved.frame,x,y,cameraX,cameraY,zoom);
  context.save();
  // Join sheets are one 16px cell. Rotate about its centre, not its foot.
  context.translate((x-cameraX)*zoom,(y-8-cameraY)*zoom);
  if(resolved.transform==='flipX')context.scale(-1,1);else context.rotate(resolved.transform*Math.PI/2);
  const drawn=drawAuthoredOverworldObject(context,asset,'base',resolved.frame,0,8,0,0,zoom);
  context.restore();return drawn;
}
