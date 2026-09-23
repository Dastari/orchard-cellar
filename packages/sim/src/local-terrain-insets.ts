import type {MapPoint} from './map-editing.js';

export interface LocalTerrainInsetRequest {
  /** Original stroke cells; the writable area never grows beyond their halo. */
  readonly points: readonly MapPoint[];
  readonly occupiedAt: (tileX: number, tileY: number) => boolean;
  /** Bounds, protected brush cells, and other elevations can forbid filling. */
  readonly canFillAt?: (tileX: number, tileY: number) => boolean;
}

const corners = [[-1,-1],[1,-1],[-1,1],[1,1]] as const;
const key = (x: number, y: number): string => `${x},${y}`;

/** Placement assistance for banks with one inset block per cell. This is never
 * invoked by rendering, loading, or simulation. Missing corners are filled in
 * simultaneous rounds so rotating or reflecting a stroke rotates its result.
 * The original one-cell halo is fixed; an unrepairable boundary is reported to
 * the caller instead of silently repairing more of the existing map. */
export function planLocalTerrainInsets(request: LocalTerrainInsetRequest): {
  readonly added: readonly MapPoint[];
  readonly unresolved: readonly MapPoint[];
} {
  const halo = new Map<string,MapPoint>();
  for (const point of request.points) for (let dy=-1;dy<=1;dy++) for (let dx=-1;dx<=1;dx++) {
    const tileX=point.tileX+dx,tileY=point.tileY+dy;
    halo.set(key(tileX,tileY),{tileX,tileY});
  }
  const added = new Map<string,MapPoint>();
  const occupied = (x:number,y:number):boolean => added.has(key(x,y)) || request.occupiedAt(x,y);
  const missing = ({tileX:x,tileY:y}:MapPoint):readonly MapPoint[] => !occupied(x,y) ? [] : corners
    .filter(([dx,dy])=>occupied(x+dx,y)&&occupied(x,y+dy)&&!occupied(x+dx,y+dy))
    .map(([dx,dy])=>({tileX:x+dx,tileY:y+dy}));
  for (;;) {
    const round = new Map<string,MapPoint>();
    for (const point of halo.values()) {
      const gaps=missing(point);
      if(gaps.length<2)continue;
      for(const gap of gaps)if(halo.has(key(gap.tileX,gap.tileY))
        &&(request.canFillAt?.(gap.tileX,gap.tileY)??true))round.set(key(gap.tileX,gap.tileY),gap);
    }
    if(round.size===0)break;
    for(const [id,point] of round)added.set(id,point);
  }
  const ordered=(points:Iterable<MapPoint>):MapPoint[]=>[...points].sort((a,b)=>a.tileY-b.tileY||a.tileX-b.tileX);
  return {added:ordered(added.values()),unresolved:ordered([...halo.values()].filter(point=>missing(point).length>1))};
}
