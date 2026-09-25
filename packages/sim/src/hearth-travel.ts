import type {ContentRegistry} from './content/registry.js';
import {type CollisionMap,TILE_SIZE_FIXED} from './state.js';
import {collisionCellIndex,collisionTileIsBlockedAtPlane,playerHitboxBounds,positionCollides} from './movement.js';

export type HearthFerryDock=string;
export interface HearthFerryDestination {
  readonly id:HearthFerryDock;
  readonly name:string;
  readonly threshold:{readonly tileX:number;readonly tileY:number};
  readonly arrival:{readonly tileX:number;readonly tileY:number};
  readonly availabilityRegion:string;
  readonly home:boolean;
  readonly dangerous:boolean;
  readonly requiresOutdoorEncounters:boolean;
}
export interface HearthFerryNetwork {
  readonly spaceId:number;
  readonly destinations:readonly HearthFerryDestination[];
  readonly byId:ReadonlyMap<string,HearthFerryDestination>;
}
export type HearthFerryRegistry=Pick<ContentRegistry,'spaces'>;
const NETWORKS=new WeakMap<object,HearthFerryNetwork|null>();

/** Exactly one active space may own the ferry network. Authored ids and the
 * owning space definition may be renamed without changing runtime behavior. */
export function runtimeHearthFerryNetwork(registry:HearthFerryRegistry):HearthFerryNetwork|null {
  const cached=NETWORKS.get(registry);if(cached!==undefined)return cached;
  const providers=[...registry.spaces.values()].filter(space=>space.retired!==true&&space.ferry!==undefined);
  if(providers.length!==1){NETWORKS.set(registry,null);return null;}
  const provider=providers[0]!,byId=new Map<string,HearthFerryDestination>();
  const destinations=provider.ferry!.map(([id,name,thresholdX,thresholdY,arrivalX,arrivalY,availabilityRegion,flags])=>{
    const destination=Object.freeze({id,name,threshold:{tileX:thresholdX,tileY:thresholdY},
      arrival:{tileX:arrivalX,tileY:arrivalY},availabilityRegion,home:(flags&1)!==0,
      dangerous:(flags&2)!==0,requiresOutdoorEncounters:(flags&4)!==0});
    byId.set(id,destination);return destination;
  });
  if(byId.size!==destinations.length||destinations.filter(({home})=>home).length!==1){NETWORKS.set(registry,null);return null;}
  const result=Object.freeze({spaceId:provider.spaceId,destinations:Object.freeze(destinations),byId});
  NETWORKS.set(registry,result);return result;
}
export function isHearthFerryDock(network:HearthFerryNetwork,value:string):value is HearthFerryDock {
  return network.byId.has(value);
}
export function hearthFerryDestinations(
  network:HearthFerryNetwork,source:HearthFerryDock,
):readonly HearthFerryDestination[]{
  return network.destinations.filter(({id})=>id!==source);
}
/** A blocked arrival may use a nearby tile on the same dock plane, never a
 * remote fallback or a hostile landing. Every result has a body-clear route
 * back to the destination ferry threshold. */
export function hearthFerryLanding(destination:HearthFerryDestination,collision:CollisionMap,
  safe:(tileX:number,tileY:number)=>boolean):{tileX:number;tileY:number}|null {
  const origin=destination.arrival;
  const threshold=destination.threshold;
  // World tiles through the shared addressing (whole maps on the server; any window is blocked outside).
  const elevationAt=(tileX:number,tileY:number)=>{const cell=collisionCellIndex(collision,tileX,tileY);return cell<0?undefined:collision.elevations?.[cell]??0;};
  const elevation=elevationAt(origin.tileX,origin.tileY)??0;
  const point=(tileX:number,tileY:number)=>({x:(tileX+.5)*TILE_SIZE_FIXED,y:(tileY+.5)*TILE_SIZE_FIXED});
  const clear=(tileX:number,tileY:number)=>collisionCellIndex(collision,tileX,tileY)>=0
    &&safe(tileX,tileY)&&elevationAt(tileX,tileY)===elevation
    &&!positionCollides(point(tileX,tileY),collision);
  // Every edge is cardinal: the union of endpoint bodies is the exact swept
  // rectangle, including thin obstacles that an anchor ray would miss.
  const edgeBlocked=(fromX:number,fromY:number,toX:number,toY:number)=>{
    const a=playerHitboxBounds(point(fromX,fromY)),b=playerHitboxBounds(point(toX,toY));
    const left=Math.min(a.left,b.left),right=Math.max(a.right,b.right);
    const top=Math.min(a.top,b.top),bottom=Math.max(a.bottom,b.bottom);
    if(collision.obstacles?.some(o=>left<=o.right&&right>=o.left&&top<=o.bottom&&bottom>=o.top))return true;
    for(let y=Math.floor(top/TILE_SIZE_FIXED);y<=Math.floor(bottom/TILE_SIZE_FIXED);y++)
      for(let x=Math.floor(left/TILE_SIZE_FIXED);x<=Math.floor(right/TILE_SIZE_FIXED);x++)
        if(collisionTileIsBlockedAtPlane(collision,x,y,elevation))return true;
    return false;
  };
  if(!clear(threshold.tileX,threshold.tileY))return null;
  const key=(x:number,y:number)=>`${x},${y}`;
  const queue=[{tileX:threshold.tileX as number,tileY:threshold.tileY as number}],reachable=new Set([key(threshold.tileX,threshold.tileY)]);
  const minX=Math.min(origin.tileX,threshold.tileX)-3,maxX=Math.max(origin.tileX,threshold.tileX)+3;
  const minY=Math.min(origin.tileY,threshold.tileY)-3,maxY=Math.max(origin.tileY,threshold.tileY)+3;
  for(let index=0;index<queue.length&&index<1024;index++){
    const current=queue[index]!;
    for(const [dx,dy] of [[0,-1],[-1,0],[1,0],[0,1]] as const){
      const x=current.tileX+dx,y=current.tileY+dy,id=key(x,y);
      if(x<minX||x>maxX||y<minY||y>maxY||reachable.has(id)||!clear(x,y)
        ||edgeBlocked(current.tileX,current.tileY,x,y))continue;
      reachable.add(id);queue.push({tileX:x,tileY:y});
    }
  }
  for(let radius=0;radius<=2;radius++)for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++){
    if(Math.max(Math.abs(dx),Math.abs(dy))!==radius)continue;
    const tileX=origin.tileX+dx,tileY=origin.tileY+dy;
    if(reachable.has(key(tileX,tileY)))return {tileX,tileY};
  }
  return null;
}
