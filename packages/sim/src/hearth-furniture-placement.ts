import {positionCollides,movementPositionAllowed,collisionTileIsBlockedAtPlane,terrainPlaneAtPosition} from './movement.js';
import {FIXED_UNITS_PER_PIXEL,TILE_SIZE_FIXED,type CollisionMap,type CollisionObstacle,type Vec2Fixed} from './state.js';
import type {ObjectContentDefinition} from './content/object-definition.js';

export type HearthFurnitureLayer='floor'|'standing'|'tabletop'|'wall';
export interface HearthFurnitureShape {
  readonly id:string;readonly layer:HearthFurnitureLayer;
  readonly width:number;readonly height:number;
  /** Native lower physical base, in pixels; omitted on nonblocking decorations. */
  readonly base?:{readonly halfWidth:number;readonly depth:number};
  readonly tabletopSurface?:{readonly insetLeft:number;readonly insetTop:number;readonly width:number;readonly height:number;readonly liftPixels:number};
  readonly seatPoseOffsetPixels?:number;
}

/** Builds native furniture geometry exclusively from one active object. Grid
 * dimensions reuse placement footprint data; the compact tuple supplies only
 * physical/presentation details that the ordinary placeable schema lacks. */
export function hearthFurnitureShapeFromDefinition(
  definition:ObjectContentDefinition,
):HearthFurnitureShape|null {
  const placement=definition.components.placement,collision=definition.components.collision;
  if(definition.retired===true||!definition.components.identity?.tags.includes('furniture')
    ||!placement?.spaces.includes('residence')||!collision)return null;
  const footprint=placement.footprint??collision.footprint,height=footprint.length,width=footprint[0]?.length??0;
  if(width<1||height<1||footprint.some(row=>row.length!==width))return null;
  const authored=definition.components.furniture,itemKind=placement.item.slice('item:'.length);
  if(placement.layer==='object'){
    if(!authored||typeof authored[0]!=='number'||typeof authored[1]!=='number')return null;
    const detail=authored[2];
    return {id:itemKind,layer:'standing',width,height,
      base:{halfWidth:authored[0],depth:authored[1]},
      ...(typeof detail==='number'?{seatPoseOffsetPixels:detail}:{}),
      ...(Array.isArray(detail)?{tabletopSurface:{insetLeft:detail[0],insetTop:detail[1],width:detail[2],height:detail[3],liftPixels:detail[4]}}:{}),
    };
  }
  if(placement.layer==='ground'&&authored===undefined)return {id:itemKind,layer:'floor',width,height};
  if(placement.layer==='overlay'&&authored===undefined)return {id:itemKind,layer:'floor',width,height};
  if(placement.layer==='overlay'&&authored?.length===1&&(authored[0]==='t'||authored[0]==='w')){
    return {id:itemKind,layer:authored[0]==='t'?'tabletop':'wall',width,height};
  }
  return null;
}

export interface HearthFurniturePlacement {
  readonly id:string;readonly shape:HearthFurnitureShape;readonly tileX:number;readonly tileY:number;
  readonly supportId?:string;
}
export type HearthFurniturePlacementFailure='builder_required'|'invalid_placement'|'outside_residence'|'reserved_approach'
  |'furniture_overlap'|'wall_required'|'tabletop_support_required'|'occupant_blocked'|'escape_blocked';
export interface HearthFurniturePlacementContext {
  readonly canBuild:boolean;readonly collision:CollisionMap;
  readonly existing:readonly HearthFurniturePlacement[];
  readonly reserved:readonly {readonly tileX:number;readonly tileY:number}[];
  readonly exit:{readonly tileX:number;readonly tileY:number};
  readonly occupants:readonly Vec2Fixed[];
}
export function hearthFurnitureCells(item:HearthFurniturePlacement){
  const left=item.tileX-Math.floor((item.shape.width-1)/2),top=item.tileY-item.shape.height+1;
  return Array.from({length:item.shape.width*item.shape.height},(_,i)=>({tileX:left+i%item.shape.width,tileY:top+Math.floor(i/item.shape.width)}));
}
export function hearthFurnitureObstacle(item:HearthFurniturePlacement):CollisionObstacle|null{
  if(item.shape.layer!=='standing'||!item.shape.base)return null;
  const x=(item.tileX+(item.shape.width%2===0?1:.5))*16,y=(item.tileY+1)*16;
  return {left:(x-item.shape.base.halfWidth)*FIXED_UNITS_PER_PIXEL,right:(x+item.shape.base.halfWidth)*FIXED_UNITS_PER_PIXEL-1,
    top:(y-item.shape.base.depth)*FIXED_UNITS_PER_PIXEL,bottom:y*FIXED_UNITS_PER_PIXEL-1};
}
const key=(x:number,y:number)=>`${x},${y}`;
const center=(x:number,y:number)=>({x:(x+.5)*TILE_SIZE_FIXED,y:(y+.5)*TILE_SIZE_FIXED});
function reachableFloor(map:CollisionMap,exit:{tileX:number;tileY:number}):Set<string>{
  const seen=new Set<string>(),queue=[exit];
  if(positionCollides(center(exit.tileX,exit.tileY),map))return seen;
  seen.add(key(exit.tileX,exit.tileY));
  for(let i=0;i<queue.length;i++){
    const point=queue[i]!;
    for(const [dx,dy] of [[0,-1],[1,0],[0,1],[-1,0]] as const){
      const x=point.tileX+dx,y=point.tileY+dy,k=key(x,y);
      if(x<0||y<0||x>=map.width||y>=map.height||seen.has(k))continue;
      const start=center(point.tileX,point.tileY);let previous=start,clear=true;
      for(let step=1;step<=16;step++){
        const next={x:start.x+dx*step*FIXED_UNITS_PER_PIXEL,y:start.y+dy*step*FIXED_UNITS_PER_PIXEL};
        if(!movementPositionAllowed(previous,next,map)){clear=false;break;}previous=next;
      }
      if(clear){seen.add(k);queue.push({tileX:x,tileY:y});}
    }
  }
  return seen;
}

/** Pure shared preflight. Authority supplies ownership, layout and persisted rows;
 * previews use the same physical rules. Inventory mutation follows successful validation. */
export function hearthFurniturePlacementFailure(context:HearthFurniturePlacementContext,candidate:HearthFurniturePlacement):HearthFurniturePlacementFailure|null{
  if(!context.canBuild)return 'builder_required';
  // Residence collision only: a whole map (no origin, at most 64 x 64), never a chunk window (S4d).
  const {shape}=candidate,{collision}=context;
  if(!Number.isInteger(candidate.tileX)||!Number.isInteger(candidate.tileY)||!Number.isInteger(shape.width)||!Number.isInteger(shape.height)
    ||shape.width<1||shape.height<1||shape.width>8||shape.height>8||collision.width<1||collision.height<1||collision.width>64||collision.height>64||collision.originX!==undefined||collision.originY!==undefined
    ||context.existing.some(item=>item.id===candidate.id)
    ||(shape.base!==undefined&&(!Number.isFinite(shape.base.halfWidth)||!Number.isFinite(shape.base.depth)
      ||shape.base.halfWidth<=0||shape.base.depth<=0||shape.base.halfWidth>shape.width*8||shape.base.depth>shape.height*16)))return 'invalid_placement';
  const surface=shape.tabletopSurface;
  if(surface&&(![surface.insetLeft,surface.insetTop,surface.width,surface.height,surface.liftPixels].every(Number.isInteger)
    ||shape.layer!=='standing'||surface.insetLeft<0||surface.insetTop<0||surface.width<1||surface.height<1||surface.liftPixels<1
    ||surface.insetLeft+surface.width>shape.width||surface.insetTop+surface.height>shape.height))return 'invalid_placement';
  const cells=hearthFurnitureCells(candidate),keys=new Set(cells.map(cell=>key(cell.tileX,cell.tileY)));
  if(cells.some(cell=>cell.tileX<0||cell.tileY<0||cell.tileX>=collision.width||cell.tileY>=collision.height))return 'outside_residence';
  if(context.reserved.some(cell=>keys.has(key(cell.tileX,cell.tileY))))return 'reserved_approach';
  if(shape.layer==='wall'){
    if(cells.some(cell=>!collision.blocked[cell.tileY*collision.width+cell.tileX]))return 'wall_required';
    // The native mirror faces south; solid rock or a side wall is not support.
    if(candidate.tileY+1>=collision.height||cells.filter(cell=>cell.tileY===candidate.tileY)
      .some(cell=>collision.blocked[(cell.tileY+1)*collision.width+cell.tileX]))return 'wall_required';
  }else {
    const plane=terrainPlaneAtPosition(center(candidate.tileX,candidate.tileY),collision);
    if(cells.some(cell=>collisionTileIsBlockedAtPlane(collision,cell.tileX,cell.tileY,plane)))return 'outside_residence';
  }
  const support=context.existing.find(item=>item.id===candidate.supportId);
  if(shape.layer==='tabletop'){
    if(!support||support.shape.layer!=='standing'||!support.shape.tabletopSurface)return 'tabletop_support_required';
    const surface=support.shape.tabletopSurface,left=support.tileX-Math.floor((support.shape.width-1)/2)+surface.insetLeft,
      top=support.tileY-support.shape.height+1+surface.insetTop;
    const supportCells=new Set(Array.from({length:surface.width*surface.height},(_,i)=>key(left+i%surface.width,top+Math.floor(i/surface.width))));
    if(cells.some(cell=>!supportCells.has(key(cell.tileX,cell.tileY))))return 'tabletop_support_required';
  }else if(candidate.supportId!==undefined)return 'invalid_placement';
  for(const item of context.existing){
    // Rugs, standing furniture and supported tabletop objects can share a grid cell.
    if(item.shape.layer!==shape.layer)continue;
    if(hearthFurnitureCells(item).some(cell=>keys.has(key(cell.tileX,cell.tileY))))return 'furniture_overlap';
  }
  const before={...collision,obstacles:[...(collision.obstacles??[]),...context.existing.flatMap(item=>{const obstacle=hearthFurnitureObstacle(item);return obstacle?[obstacle]:[];})]};
  const obstacle=hearthFurnitureObstacle(candidate);
  if(obstacle&&(collision.obstacles??[]).some(fixed=>obstacle.left<=fixed.right&&obstacle.right>=fixed.left
    &&obstacle.top<=fixed.bottom&&obstacle.bottom>=fixed.top))return 'furniture_overlap';
  const after={...before,obstacles:[...before.obstacles,...(obstacle?[obstacle]:[])]};
  if(context.occupants.some(position=>positionCollides(position,after)))return 'occupant_blocked';
  const reachable=reachableFloor(after,context.exit);
  if(!reachable.size)return 'escape_blocked';
  const oldReachable=reachableFloor(before,context.exit);
  for(const cell of oldReachable){
    const [x,y]=cell.split(',').map(Number) as [number,number];
    if(!positionCollides(center(x,y),after)&&!reachable.has(cell))return 'escape_blocked';
  }
  for(const position of context.occupants){
    const x=Math.floor(position.x/TILE_SIZE_FIXED),y=Math.floor(position.y/TILE_SIZE_FIXED);
    if(!reachable.has(key(x,y)))return 'escape_blocked';
    // The occupant's exact current anchor must be able to reach the tested grid.
    const target=center(x,y);let previous=position;
    for(let step=1;step<=16;step++){
      const next={x:Math.round(position.x+(target.x-position.x)*step/16),y:Math.round(position.y+(target.y-position.y)*step/16)};
      if(!movementPositionAllowed(previous,next,after))return 'escape_blocked';previous=next;
    }
  }
  return null;
}

/** Validate a changed room envelope without moving or recreating any furniture.
 * Collision excludes movable furniture, but retains architectural/fixed obstacles.
 * Required approaches make empty newly opened rooms part of the escape check. */
export function hearthFurnitureLayoutFailure(
  context: HearthFurniturePlacementContext,
  requiredApproaches: readonly {readonly tileX: number; readonly tileY: number}[],
  requireConnectedFloor = false,
): HearthFurniturePlacementFailure | null {
  if (!context.canBuild) return 'builder_required';
  const ids = new Set(context.existing.map(item => item.id));
  if (ids.size !== context.existing.length) return 'invalid_placement';
  for (const candidate of context.existing) {
    const failure = hearthFurniturePlacementFailure({
      ...context, existing: context.existing.filter(item => item.id !== candidate.id), occupants: [],
    }, candidate);
    if (failure !== null) return failure;
  }
  const collision = {...context.collision, obstacles: [
    ...(context.collision.obstacles ?? []),
    ...context.existing.flatMap(item => {const obstacle = hearthFurnitureObstacle(item); return obstacle ? [obstacle] : []; }),
  ]};
  if (context.occupants.some(position => positionCollides(position, collision))) return 'occupant_blocked';
  const reachable = reachableFloor(collision, context.exit);
  if (!reachable.size || requiredApproaches.some(cell => !reachable.has(key(cell.tileX, cell.tileY)))) return 'escape_blocked';
  if (requireConnectedFloor) for (let y = 0; y < collision.height; y++) for (let x = 0; x < collision.width; x++) {
    if (!positionCollides(center(x,y),collision) && !reachable.has(key(x,y))) return 'escape_blocked';
  }
  for (const position of context.occupants) {
    const x = Math.floor(position.x / TILE_SIZE_FIXED), y = Math.floor(position.y / TILE_SIZE_FIXED);
    if (!reachable.has(key(x, y))) return 'escape_blocked';
    const target = center(x, y);
    let previous = position;
    for (let step = 1; step <= 16; step++) {
      const next = {x: Math.round(position.x + (target.x - position.x) * step / 16),
        y: Math.round(position.y + (target.y - position.y) * step / 16)};
      if (!movementPositionAllowed(previous, next, collision)) return 'escape_blocked';
      previous = next;
    }
  }
  return null;
}

/** Moving/removing a support requires its attachments to be moved first. */
export function hearthFurnitureHasAttachments(id:string,items:readonly HearthFurniturePlacement[]):boolean{
  return items.some(item=>item.supportId===id);
}

/** Pixel-space native anchor. Surface lift is relative to the SUPPORT baseline,
 * so choosing its upper logical row never subtracts that row's height twice. */
export function hearthFurniturePresentationAnchor(item:HearthFurniturePlacement,items:readonly HearthFurniturePlacement[]):{x:number;y:number}|null{
  const x=(item.tileX+(item.shape.width%2===0?1:.5))*16;
  if(item.shape.layer!=='tabletop')return {x,y:(item.tileY+1)*16};
  const support=items.find(candidate=>candidate.id===item.supportId),surface=support?.shape.tabletopSurface;
  if(!support||!surface)return null;
  const surfaceBottom=support.tileY-support.shape.height+surface.insetTop+surface.height;
  return {x,y:(support.tileY+1)*16-surface.liftPixels+(item.tileY-surfaceBottom)*16};
}
