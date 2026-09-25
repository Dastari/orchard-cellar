import {hearthDoorwayWindowConflicts,hearthDoorwayWallAttachmentFailure} from './hearth-doorway-support.js';
import {hearthFurnitureObstacle,hearthFurnitureLayoutFailure, type HearthFurniturePlacementContext} from './hearth-furniture-placement.js';
import {RESIDENCE_EXIT_TILE, residencePlayableTile, residenceReservedTiles, residenceEnvelopeSize} from './spaces.js';
import {TILE_SIZE_FIXED,FIXED_UNITS_PER_PIXEL,type CollisionMap} from './state.js';
import {movementPositionAllowed,positionCollides,PLAYER_HITBOX_FOOT_OFFSET} from './movement.js';

export type HearthFloorFinish = 'rustic' | 'townhouse';
export type HearthPartitionKind = 'wall' | 'doorway';
export interface HearthArchitectureCell {
  readonly tileX: number;
  readonly tileY: number;
  readonly floor?: HearthFloorFinish;
  /** Physical single-tile base; visual wall height is handled by the renderer. */
  readonly partition?: HearthPartitionKind;
  readonly window?: boolean;
}
export type HearthArchitectureResult = {readonly failure: string} | {
  readonly failure: null;
  readonly collision: CollisionMap;
  readonly cells: readonly HearthArchitectureCell[];
};
/** Compose a complete persisted layout, never a client-supplied collision mask.
 * The caller supplies baseline residence terrain including fixed obstacles,
 * and subsequently validates furniture, occupants and full escape topology. */
export function composeHearthArchitecture(
  rank: number, baseline: CollisionMap, cells: readonly HearthArchitectureCell[],
): HearthArchitectureResult {
  if (![0,1,2].includes(rank)) return {failure:'invalid_residence_rank'};
  const size=residenceEnvelopeSize(rank);
  if (baseline.width!==size || baseline.height!==size || baseline.blocked.length!==size*size) return {failure:'invalid_residence_layout'};
  if (cells.length>318) return {failure:'architecture_limit'};
  const reserved=new Set(residenceReservedTiles(rank).map(cell=>`${cell.tileX},${cell.tileY}`));
  const byKey=new Map<string,HearthArchitectureCell>();
  for (const cell of cells) {
    const {tileX:x,tileY:y}=cell,key=`${x},${y}`;
    if (!residencePlayableTile(x,y,rank)) return {failure:'outside_purchased_room'};
    if (byKey.has(key)) return {failure:'duplicate_architecture_cell'};
    if (cell.floor!==undefined && cell.floor!=='rustic' && cell.floor!=='townhouse') return {failure:'unknown_floor_finish'};
    if (cell.partition!==undefined && cell.partition!=='wall' && cell.partition!=='doorway') return {failure:'unknown_partition'};
    if (cell.window!==undefined && typeof cell.window!=='boolean') return {failure:'invalid_window'};
    if (cell.floor===undefined && cell.partition===undefined && !cell.window) return {failure:'empty_architecture_cell'};
    // Floor finishes are safe on approaches; physical partitions and windows aren't.
    if ((cell.partition!==undefined || cell.window) && reserved.has(key)) return {failure:'reserved_approach'};
    if (cell.window && cell.partition!=='wall') return {failure:'window_requires_wall'};
    if (baseline.blocked[y*size+x]) return {failure:'architecture_base_blocked'};
    if (cell.partition && baseline.obstacles?.some(obstacle =>
      x*TILE_SIZE_FIXED<=obstacle.right && (x+1)*TILE_SIZE_FIXED-1>=obstacle.left
      && y*TILE_SIZE_FIXED<=obstacle.bottom && (y+1)*TILE_SIZE_FIXED-1>=obstacle.top)) return {failure:'architecture_fixed_obstacle'};
    byKey.set(key,cell);
  }
  for (const cell of cells) if (cell.partition==='doorway') {
    const jamb=(dx:number,dy:number)=>{
      for(let distance=1;distance<=3;distance++) {
        const kind=byKey.get(`${cell.tileX+dx*distance},${cell.tileY+dy*distance}`)?.partition;
        if(kind==='wall')return true;
        if(kind!=='doorway')return false;
      }
      return false;
    };
    // A contiguous opening needs jambs at both ends, never floating trim.
    if (!((jamb(-1,0)&&jamb(1,0)) || (jamb(0,-1)&&jamb(0,1)))) return {failure:'doorway_requires_jambs'};
  }
  const blocked=baseline.blocked.slice();
  for (const cell of cells) if (cell.partition==='wall') blocked[cell.tileY*size+cell.tileX]=1;
  const collision={...baseline,blocked};
  for (const cell of cells) if (cell.partition==='doorway') {
    const point={x:(cell.tileX+.5)*TILE_SIZE_FIXED,y:(cell.tileY+.5)*TILE_SIZE_FIXED+PLAYER_HITBOX_FOOT_OFFSET};
    const crossing=(dx:number,dy:number)=>{
      let previous={x:point.x-dx*TILE_SIZE_FIXED,y:point.y-dy*TILE_SIZE_FIXED};
      if(positionCollides(previous,collision))return false;
      for(let step=1;step<=32;step++) {
        const next={x:point.x-dx*TILE_SIZE_FIXED+dx*step*FIXED_UNITS_PER_PIXEL,
          y:point.y-dy*TILE_SIZE_FIXED+dy*step*FIXED_UNITS_PER_PIXEL};
        if(!movementPositionAllowed(previous,next,collision))return false;
        previous=next;
      }
      return true;
    };
    if(!crossing(1,0)&&!crossing(0,1))return {failure:'doorway_approach_blocked'};
  }
  return {failure:null,collision,cells:cells.map(cell=>({...cell}))};
}


/** Construction preflight for standing occupants. Authority must resolve seated
 * custody through its seating escape policy before passing virtual stand points.
 * No inventory, persistence or actor mutations are performed here. */
export function planHearthArchitecture(
  rank: number,
  context: Omit<HearthFurniturePlacementContext, 'reserved' | 'exit'>,
  cells: readonly HearthArchitectureCell[],
  permittedLegacyWindowConflicts:ReadonlySet<string>=new Set(),
): HearthArchitectureResult {
  if (!context.canBuild) return {failure:'builder_required'};
  const composed=composeHearthArchitecture(rank,context.collision,cells);
  if (composed.failure!==null) return composed;
  // Door approaches must remain usable with movable furniture too, even if
  // another route lets the room pass the global escape check.
  const furnished=composeHearthArchitecture(rank,{...context.collision,obstacles:[
    ...(context.collision.obstacles ?? []), ...context.existing.flatMap(item=>{
      const obstacle=hearthFurnitureObstacle(item);return obstacle?[obstacle]:[];
    }),
  ]},cells);
  if(furnished.failure!==null)return furnished;
  if([...hearthDoorwayWindowConflicts(cells)].some(key=>!permittedLegacyWindowConflicts.has(key))
    ||hearthDoorwayWallAttachmentFailure(cells,context.existing)!==null)return {failure:'doorway_support_occupied'};
  const reserved=residenceReservedTiles(rank);
  const failure=hearthFurnitureLayoutFailure({...context,collision:composed.collision,reserved,exit:RESIDENCE_EXIT_TILE},
    residenceReservedTiles(0),true);
  return failure===null?composed:{failure};
}
