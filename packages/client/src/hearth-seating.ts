import type { ContentRegistry } from '@orchard/sim';
import { hearthFurnitureCells, hearthFurniturePresentationAnchor } from '@orchard/sim/hearth-furniture-placement';
import { hearthFurnitureDefinition, hearthFurniturePlacementFromRow } from '@orchard/sim/hearth-furniture-state';
import { PLAYER_HITBOX_FOOT_OFFSET } from '@orchard/sim/movement';
import { AUTHORITY_HZ } from '@orchard/sim/net-timing';
import { FIXED_UNITS_PER_PIXEL } from '@orchard/sim/state';
interface SeatRow {readonly id:bigint;readonly kind:string;readonly definitionId?:string;readonly spaceId:number;readonly tileX:number;readonly tileY:number;readonly stateJson:string;readonly carriedBy?:unknown;}

/** Public player pose/contact identifies the seat without exposing private
 * custody. Never use interpolated/predicted coordinates to choose a parent. */
export function seatedFurnitureForPlayer(player:{readonly actionKind:string;readonly spaceId:number;readonly x:number;readonly y:number},
  rows:Iterable<SeatRow>,registry:ContentRegistry){
  if(player.actionKind!=='sitting')return null;
  for(const row of rows){
    if(row.spaceId!==player.spaceId||row.carriedBy!==undefined)continue;
    try{const state:unknown=JSON.parse(row.stateJson);if(state===null||typeof state!=='object'||Array.isArray(state))continue;}catch{continue;}
    const placement=hearthFurniturePlacementFromRow(registry,row);
    if(!placement||placement.shape.seatPoseOffsetPixels===undefined)continue;
    const eligible=hearthFurnitureDefinition(registry,placement.shape.id);
    if(!eligible||eligible.definition.id!==`object:${placement.shape.id}`)continue;
    const anchor=hearthFurniturePresentationAnchor(placement,[])!;
    if(player.x===anchor.x*FIXED_UNITS_PER_PIXEL&&player.y===anchor.y*FIXED_UNITS_PER_PIXEL+PLAYER_HITBOX_FOOT_OFFSET)
      return {row,placement,anchor};
  }
  return null;
}
export function hearthSeatedFrame(renderTick:number,startedTick:bigint,reducedMotion=false):number{
  if(reducedMotion)return 0;
  return Math.floor(Math.max(0,renderTick-Number(startedTick))*2/AUTHORITY_HZ)%2;
}

export function facedHearthSeat<Row extends SeatRow>(rows:Iterable<Row>,registry:ContentRegistry,spaceId:number,tile:{tileX:number;tileY:number}):Row|null{
  for(const row of rows){
    if(row.spaceId!==spaceId||row.carriedBy!==undefined)continue;
    const placement=hearthFurniturePlacementFromRow(registry,row);
    if(!placement||placement.shape.seatPoseOffsetPixels===undefined
      ||!hearthFurnitureDefinition(registry,placement.shape.id))continue;
    if(hearthFurnitureCells(placement).some(cell=>cell.tileX===tile.tileX&&cell.tileY===tile.tileY))return row;
  }
  return null;
}
