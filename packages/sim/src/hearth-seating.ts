import {hearthFurnitureObstacle,hearthFurniturePresentationAnchor,type HearthFurniturePlacement} from './hearth-furniture-placement.js';
import {movementPositionAllowed,playerHitboxBounds,positionCollides,PLAYER_HITBOX_FOOT_OFFSET} from './movement.js';
import {FIXED_UNITS_PER_PIXEL,TILE_SIZE_FIXED,type CollisionMap,type Vec2Fixed} from './state.js';

/** One occupant per authored seat. Facing remains south because current
 * furniture definitions contain no rotated seat art. */
export type HearthSeatingFailure='not_a_seat'|'seat_occupied'|'seat_out_of_reach'|'seat_blocked'|'stand_blocked';
export type HearthSeatingPlan={readonly failure:HearthSeatingFailure}|{
  readonly failure:null;readonly seated:Vec2Fixed;readonly stand:Vec2Fixed;readonly facing:'down';
};
function occupied(point:Vec2Fixed,occupants:readonly Vec2Fixed[]):boolean{
  const a=playerHitboxBounds(point);
  return occupants.some(other=>{const b=playerHitboxBounds(other);return a.left<=b.right&&a.right>=b.left&&a.top<=b.bottom&&a.bottom>=b.top;});
}
/** Baseline collision must exclude ALL movable furniture, as in placement.
 * Both seated and standing checks reconstruct every other physical base. The
 * standing point also includes this seat, so leaving cannot land inside it. */
export function planHearthSeating(input:{readonly seat:HearthFurniturePlacement;readonly furniture:readonly HearthFurniturePlacement[];
  readonly collision:CollisionMap;readonly actor:Vec2Fixed;readonly occupants:readonly Vec2Fixed[];readonly seatOccupied:boolean}):HearthSeatingPlan{
  const {seat,actor,occupants}=input;
  if(seat.shape.seatPoseOffsetPixels===undefined)return {failure:'not_a_seat'};
  if(input.seatOccupied)return {failure:'seat_occupied'};
  const anchor=hearthFurniturePresentationAnchor(seat,[]);
  if(!anchor)return {failure:'not_a_seat'};
  const seated={x:anchor.x*FIXED_UNITS_PER_PIXEL,y:anchor.y*FIXED_UNITS_PER_PIXEL+PLAYER_HITBOX_FOOT_OFFSET};
  const dx=actor.x-seated.x,dy=actor.y-seated.y;
  if(dx*dx+dy*dy>(3*TILE_SIZE_FIXED)**2)return {failure:'seat_out_of_reach'};
  const bases=(items:readonly HearthFurniturePlacement[])=>items.flatMap(item=>{const base=hearthFurnitureObstacle(item);return base?[base]:[];});
  const withoutSeat={...input.collision,obstacles:[...(input.collision.obstacles??[]),...bases(input.furniture.filter(item=>item.id!==seat.id))]};
  if(positionCollides(actor,withoutSeat)||positionCollides(seated,withoutSeat)||occupied(seated,occupants))return {failure:'seat_blocked'};
  // Sample the complete short approach; corners, walls and other furniture may
  // not be skipped by the seating snap.
  const steps=Math.max(1,Math.ceil(Math.max(Math.abs(dx),Math.abs(dy))/FIXED_UNITS_PER_PIXEL));
  let previous=actor;
  for(let i=1;i<=steps;i++){
    const next={x:Math.round(actor.x-dx*i/steps),y:Math.round(actor.y-dy*i/steps)};
    if(!movementPositionAllowed(previous,next,withoutSeat)||occupied(next,occupants))return {failure:'seat_blocked'};
    previous=next;
  }
  const withSeat={...withoutSeat,obstacles:[...withoutSeat.obstacles,...bases([seat])]};
  for(const [x,y] of [[0,1],[1,1],[-1,1],[1,0],[-1,0],[0,-1]] as const){
    const stand={x:seated.x+x*TILE_SIZE_FIXED,y:seated.y+y*TILE_SIZE_FIXED};
    if(positionCollides(stand,withSeat)||occupied(stand,occupants))continue;
    let clear=true,from=seated;
    for(let step=1;step<=16;step++){
      const to={x:seated.x+x*step*FIXED_UNITS_PER_PIXEL,y:seated.y+y*step*FIXED_UNITS_PER_PIXEL};
      if(!movementPositionAllowed(from,to,withoutSeat)||occupied(to,occupants)){clear=false;break;}
      from=to;
    }
    if(clear)return {failure:null,seated,stand,facing:'down'};
  }
  return {failure:'stand_blocked'};
}
