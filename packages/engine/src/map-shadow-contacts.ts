import type {CollisionObstacle} from '@orchard/sim';
import {FIXED_UNITS_PER_PIXEL} from '@orchard/sim/state';

export interface MapShadowPlacement {
  readonly id:string;
  readonly tie:string;
  readonly footX:number;
  readonly footY:number;
  readonly elevation:number;
  readonly left:number;
  readonly right:number;
}
interface CollisionCell {readonly tileX:number;readonly tileY:number;readonly elevation:number;readonly collisionMask:number}
interface Bit {readonly x:number;readonly y:number}
export interface MapShadowContact {
  /** One contiguous run for the small contact ellipse, never a gap-spanning box. */
  readonly contact:CollisionObstacle;
  /** Exact full base only when all owned bits fill one rectangle. */
  readonly rectangularBase:CollisionObstacle|null;
}
const obstacle=(left:number,top:number,right:number,bottom:number):CollisionObstacle=>({
  left:left*FIXED_UNITS_PER_PIXEL,top:top*FIXED_UNITS_PER_PIXEL,
  right:right*FIXED_UNITS_PER_PIXEL-1,bottom:bottom*FIXED_UNITS_PER_PIXEL-1,
});

/** Assign exact 4px movement subcells once to eligible visual placements.
 * Alpha remains independent: a visual without an assigned base still casts its
 * silhouette, but must disable its approximate contact ellipse. */
export function mapShadowContacts(cells:readonly CollisionCell[],placements:readonly MapShadowPlacement[]):ReadonlyMap<string,MapShadowContact>{
  const assigned=new Map(placements.map(p=>[p.id,new Map<string,Bit>()]));
  const ordered=[...placements].sort((a,b)=>a.tie.localeCompare(b.tie)||a.id.localeCompare(b.id));
  for(const cell of cells)for(let bit=0;bit<16;bit++){
    if(!(cell.collisionMask&(1<<bit)))continue;
    const x=cell.tileX*16+(bit%4)*4,y=cell.tileY*16+Math.floor(bit/4)*4;
    let owner:MapShadowPlacement|undefined,distance=Infinity;
    for(const placement of ordered){
      if(placement.elevation!==cell.elevation||placement.right<=x||placement.left>=x+4)continue;
      const next=(placement.footX-x-2)**2+(placement.footY-y-2)**2;
      if(next<distance){distance=next;owner=placement;}
    }
    if(owner)assigned.get(owner.id)!.set(`${x}:${y}`,{x,y});
  }
  const result=new Map<string,MapShadowContact>();
  for(const placement of placements){
    const bits=[...assigned.get(placement.id)!.values()];
    if(!bits.length)continue;
    bits.sort((a,b)=>a.y-b.y||a.x-b.x);
    const runs:{left:number;right:number;top:number}[]=[];
    for(const bit of bits){
      const previous=runs.at(-1);
      if(previous&&previous.top===bit.y&&previous.right===bit.x)previous.right+=4;
      else runs.push({left:bit.x,right:bit.x+4,top:bit.y});
    }
    runs.sort((a,b)=>Math.abs(a.top+4-placement.footY)-Math.abs(b.top+4-placement.footY)
      ||Math.abs((a.left+a.right)/2-placement.footX)-Math.abs((b.left+b.right)/2-placement.footX)
      ||a.top-b.top||a.left-b.left);
    const run=runs[0]!;
    let left=Infinity,right=-Infinity;
    for(const bit of bits){left=Math.min(left,bit.x);right=Math.max(right,bit.x+4);}
    const top=bits[0]!.y,bottom=bits.at(-1)!.y+4;
    result.set(placement.id,{contact:obstacle(run.left,run.top,run.right,run.top+4),
      rectangularBase:(right-left)*(bottom-top)===bits.length*16?obstacle(left,top,right,bottom):null});
  }
  return result;
}
