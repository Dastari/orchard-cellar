import {terrainPlaneCollisionBytesForElevationGrid} from './map-compiler.js';
import {combatSegmentObstructed} from './combat-actions.js';
import {positionCollides,playerInteractionOrigin} from './movement.js';
import {FIXED_UNITS_PER_PIXEL,TILE_SIZE_FIXED,type Vec2Fixed,type CollisionMap} from './state.js';
import {BOOTSTRAP_SPACE_DEFINITIONS} from './content/bootstrap-spaces.js';
import type {ContentRegistry} from './content/registry.js';
import type {HearthLobbyContentDefinition} from './content/world-definition.js';

export interface RuntimeHearthLobbyDefinition {
  readonly definitionId: string;
  readonly spaceId: number;
  readonly sizeTiles: number;
  readonly stashCapacity: number;
  readonly floorThresholdY: number;
  readonly points: Readonly<Record<keyof HearthLobbyContentDefinition['points'], {
    readonly tileX: number; readonly tileY: number;
  }>>;
  readonly carves: HearthLobbyContentDefinition['carves'];
  readonly practiceTarget: { readonly id: bigint; readonly definitionId: string;
    readonly kind: string; readonly tileX: number; readonly tileY: number };
  readonly torches: readonly { readonly id: bigint; readonly definitionId: string;
    readonly kind: string; readonly tileX: number; readonly tileY: number }[];
  readonly furniture: readonly { readonly id: string; readonly definitionId: string;
    readonly kind: string; readonly tileX: number; readonly tileY: number;
    readonly halfWidth: number; readonly depth: number; readonly objectTag?: string }[];
}
export interface HearthLobbyLayout {
  readonly width:number;
  readonly height:number;
  readonly blocked:boolean[];
  readonly elevations:Int16Array;
  readonly terrainPlaneBlocked:Uint8Array;
}

const pointRecord = (
  points: HearthLobbyContentDefinition['points'],
): RuntimeHearthLobbyDefinition['points'] => {
  const result = Object.fromEntries(Object.entries(points).map(
    ([name, [tileX, tileY]]) => [name, {tileX, tileY}],
  ));
  return result as unknown as RuntimeHearthLobbyDefinition['points'];
};

/** Resolves a complete active lobby from the supplied revision. Any missing or
 * retired object edge makes the layout inert rather than partially writable. */
export function runtimeHearthLobbyDefinition(
  registry: ContentRegistry, spaceId: number,
): RuntimeHearthLobbyDefinition | null {
  const space = [...registry.spaces.values()].find(candidate => candidate.spaceId === spaceId);
  const lobby = space?.hearthLobby;
  if (space === undefined || space.retired === true || space.generator !== 'delve_lobby' || lobby === undefined) return null;
  const object = (id: string) => {
    const definition = registry.objects.get(id);
    return definition === undefined || definition.retired === true ? null : definition;
  };
  const targetObject = object(lobby.practiceTarget[1]);
  if (targetObject?.components.damageable?.model !== 'health') return null;
  const torchIds = new Set<string>();
  const torches = lobby.torches.flatMap(([id, definitionId, kind, tileX, tileY]) => {
    const definition = object(definitionId);
    if (definition?.components.light === undefined || torchIds.has(id)) return [];
    torchIds.add(id);
    return [{id: BigInt(id), definitionId, kind, tileX, tileY}];
  });
  const fixtureIds = new Set<string>();
  const furniture = lobby.fixtures.flatMap(([
    id, definitionId, kind, tileX, tileY, halfWidth, depth, objectTag,
  ]) => {
    const definition = object(definitionId);
    if (definition === null || fixtureIds.has(id)
      || (objectTag !== undefined && !definition.components.identity?.tags.includes(objectTag))) return [];
    fixtureIds.add(id);
    return [{id, definitionId, kind, tileX, tileY, halfWidth, depth,
      ...(objectTag === undefined ? {} : {objectTag})}];
  });
  if (torches.length !== lobby.torches.length || furniture.length !== lobby.fixtures.length) return null;
  return Object.freeze({definitionId: space.id, spaceId: space.spaceId, sizeTiles: space.sizeTiles,
    stashCapacity: lobby.stashCapacity, floorThresholdY: lobby.floorThresholdY,
    points: pointRecord(lobby.points), carves: lobby.carves,
    practiceTarget: {id: BigInt(lobby.practiceTarget[0]), definitionId: lobby.practiceTarget[1],
      kind: lobby.practiceTarget[2], tileX: lobby.practiceTarget[3], tileY: lobby.practiceTarget[4]},
    torches: Object.freeze(torches), furniture: Object.freeze(furniture)});
}

export function activeHearthLobbyDefinition(registry: ContentRegistry): RuntimeHearthLobbyDefinition | null {
  const candidates = [...registry.spaces.values()].filter(space => space.retired !== true
    && space.generator === 'delve_lobby' && space.hearthLobby !== undefined);
  if (candidates.length !== 1) return null;
  return runtimeHearthLobbyDefinition(registry, candidates[0]!.spaceId);
}

/** Recognizes durable authored target IDs even after a lobby definition retires. */
export function isAuthoredHearthLobbyPracticeTargetId(registry: ContentRegistry, id: bigint): boolean {
  return [...registry.spaces.values()].some(space => space.hearthLobby?.practiceTarget[0] === id.toString());
}

const BOOTSTRAP_LOBBY_SPACE=BOOTSTRAP_SPACE_DEFINITIONS.find(space=>space.retired!==true
  &&space.generator==='delve_lobby'&&space.hearthLobby!==undefined);
if(BOOTSTRAP_LOBBY_SPACE?.hearthLobby===undefined)throw new Error('bootstrap_hearth_lobby_invalid');
const BOOTSTRAP_LOBBY_CONTENT=BOOTSTRAP_LOBBY_SPACE.hearthLobby;
export const HEARTH_LOBBY_SPACE_ID=BOOTSTRAP_LOBBY_SPACE.spaceId;
export const HEARTH_LOBBY_SIZE=BOOTSTRAP_LOBBY_SPACE.sizeTiles;
export const HEARTH_LOBBY_STASH_CAPACITY=BOOTSTRAP_LOBBY_CONTENT.stashCapacity;
export const HEARTH_LOBBY_FLOOR_THRESHOLD_Y=BOOTSTRAP_LOBBY_CONTENT.floorThresholdY;
export const HEARTH_LOBBY_PRACTICE_TARGET=Object.freeze({
  id:BigInt(BOOTSTRAP_LOBBY_CONTENT.practiceTarget[0]),
  definitionId:BOOTSTRAP_LOBBY_CONTENT.practiceTarget[1],kind:BOOTSTRAP_LOBBY_CONTENT.practiceTarget[2],
  tileX:BOOTSTRAP_LOBBY_CONTENT.practiceTarget[3],tileY:BOOTSTRAP_LOBBY_CONTENT.practiceTarget[4],
});
export const HEARTH_LOBBY_POINTS=Object.freeze(pointRecord(BOOTSTRAP_LOBBY_CONTENT.points));


/** Permanent, non-blocking torches. Coordinates follow placed-item tile anchors.
 * IDs seed presentation only; these are not mutable world placeable rows. */
export const HEARTH_LOBBY_TORCHES=Object.freeze(BOOTSTRAP_LOBBY_CONTENT.torches.map(
  ([id,definitionId,kind,tileX,tileY])=>Object.freeze({id:BigInt(id),definitionId,kind,tileX,tileY}),
));

/** Native fixed furniture; interaction services are authored separately. Bounds
 * describe the lower physical footprint, not the sprite's taller artwork. */
export const HEARTH_LOBBY_FURNITURE=Object.freeze(BOOTSTRAP_LOBBY_CONTENT.fixtures.map(([
  id,definitionId,kind,tileX,tileY,halfWidth,depth,objectTag,
])=>Object.freeze({id,definitionId,kind,tileX,tileY,halfWidth,depth,
  ...(objectTag===undefined?{}:{objectTag})})));

export function hearthLobbyFurnitureObstacles(
  registry?:ContentRegistry,spaceId:number=HEARTH_LOBBY_SPACE_ID,
){
  const furniture=registry===undefined?HEARTH_LOBBY_FURNITURE
    :runtimeHearthLobbyDefinition(registry,spaceId)?.furniture;
  if(furniture===undefined)return [];
  return furniture.map(item=>{
    const x=item.tileX*16+8,y=item.tileY*16;
    return {left:(x-item.halfWidth)*FIXED_UNITS_PER_PIXEL,right:(x+item.halfWidth)*FIXED_UNITS_PER_PIXEL-1,
      top:(y-item.depth)*FIXED_UNITS_PER_PIXEL,bottom:y*FIXED_UNITS_PER_PIXEL-1};
  });
}

/** Shared authored excavation: a southern arrival neck opens into a gathering
 * hall, western supply alcove and eastern practice bay. Two-cell wall modules
 * match the imported cave/dungeon kit. No procedural hazards or enemies. */
export function generateHearthLobbyLayout():HearthLobbyLayout;
export function generateHearthLobbyLayout(registry:ContentRegistry,spaceId:number):HearthLobbyLayout|null;
export function generateHearthLobbyLayout(
  registry?:ContentRegistry,spaceId:number=HEARTH_LOBBY_SPACE_ID,
):HearthLobbyLayout|null{
  const lobby=registry===undefined?{
    sizeTiles:HEARTH_LOBBY_SIZE,carves:BOOTSTRAP_LOBBY_CONTENT.carves,
  }:runtimeHearthLobbyDefinition(registry,spaceId);
  if(lobby===null)return null;
  const width=lobby.sizeTiles,height=width;
  const blocked=Array<boolean>(width*height).fill(true);
  const carve=(left:number,top:number,right:number,bottom:number)=>{
    for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++)blocked[y*width+x]=false;
  };
  for(const rectangle of lobby.carves)carve(...rectangle);
  const elevations=Int16Array.from(blocked,value=>value?1:0);
  const terrainPlaneBlocked=terrainPlaneCollisionBytesForElevationGrid(width,height,elevations,[],'dungeon_1',{baseDatum:0});
  return {width,height,blocked,elevations,terrainPlaneBlocked};
}

export function hearthLobbyCollision():CollisionMap;
export function hearthLobbyCollision(registry:ContentRegistry,spaceId:number):CollisionMap|null;
export function hearthLobbyCollision(
  registry?:ContentRegistry,spaceId:number=HEARTH_LOBBY_SPACE_ID,
):CollisionMap|null{
  const layout=registry===undefined?generateHearthLobbyLayout()
    :generateHearthLobbyLayout(registry,spaceId);
  return layout===null?null:{...layout,terrainMinimumElevation:0,terrainTransitions:[],
    obstacles:registry===undefined?hearthLobbyFurnitureObstacles()
      :hearthLobbyFurnitureObstacles(registry,spaceId)};
}

/** The entrance keeps rough cave flooring; the prepared hall has masonry. */
export function hearthLobbyFloorTheme(tileY:number,floorThresholdY=HEARTH_LOBBY_FLOOR_THRESHOLD_Y):'cave'|'dungeon'{
  return tileY>=floorThresholdY?'cave':'dungeon';
}

/** One physical reach contract for the lobby prompt and portal authority. */
export function hearthLobbyPortalApproachClear(position:Vec2Fixed,portal:{fromTileX:number;fromTileY:number},collision:CollisionMap):boolean{
  const threshold={x:(portal.fromTileX+.5)*TILE_SIZE_FIXED,y:(portal.fromTileY+.5)*TILE_SIZE_FIXED};
  const dx=position.x-threshold.x,dy=position.y-threshold.y;
  if(dx*dx+dy*dy>(1.5*TILE_SIZE_FIXED)**2||positionCollides(position,collision)||positionCollides(threshold,collision))return false;
  const elevation=(point:Vec2Fixed)=>collision.elevations?.[(Math.floor(point.y/TILE_SIZE_FIXED)-(collision.originY??0))*collision.width
    +Math.floor(point.x/TILE_SIZE_FIXED)-(collision.originX??0)]??0;
  return elevation(position)===elevation(threshold)
    &&!combatSegmentObstructed(playerInteractionOrigin(position),playerInteractionOrigin(threshold),collision);
}
