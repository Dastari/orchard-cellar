import type {SpaceLandmarkDefinition,SpaceTileRectangle} from './content/world-definition.js';
import {generateSurvivalLandmarkDecorations,type SurvivalLandmarkRegistry} from './survival-world.js';

export interface LandmarkGroundWalkableTile {
  readonly tileX:number;
  readonly tileY:number;
}

export interface PersistedLandmarkGroundAnchor {
  readonly sourceDecorationId:number;
  readonly tileX:number;
  readonly tileY:number;
  readonly enabled:boolean;
}

function tileInArea(area:SpaceTileRectangle,tileX:number,tileY:number):boolean {
  return tileX>=area.minimumTileX&&tileX<=area.maximumTileX
    &&tileY>=area.minimumTileY&&tileY<=area.maximumTileY;
}

function appendArea(tiles:Map<string,LandmarkGroundWalkableTile>,area:SpaceTileRectangle,
  deltaX=0,deltaY=0):void {
  for(let tileY=area.minimumTileY;tileY<=area.maximumTileY;tileY++){
    for(let tileX=area.minimumTileX;tileX<=area.maximumTileX;tileX++){
      const translated=Object.freeze({tileX:tileX+deltaX,tileY:tileY+deltaY});
      tiles.set(`${translated.tileX}:${translated.tileY}`,translated);
    }
  }
}

/** Projects authored ground-walkable rectangles. Persisted maps translate an
 * area only through its unique stable source decoration; editor-facing names
 * and decoration kinds never participate in authority. */
export function landmarkGroundWalkableTiles(
  landmarks:readonly SpaceLandmarkDefinition[],
  instances?:readonly PersistedLandmarkGroundAnchor[],
):readonly LandmarkGroundWalkableTile[] {
  const tiles=new Map<string,LandmarkGroundWalkableTile>();
  if(instances===undefined){
    for(const landmark of landmarks)for(const area of landmark.groundWalkableAreas??[])appendArea(tiles,area);
    return Object.freeze([...tiles.values()]);
  }
  const bindings:{sourceDecorationId:number;tileX:number;tileY:number;area:SpaceTileRectangle}[]=[];
  for(const landmark of landmarks){
    const areas=landmark.groundWalkableAreas;
    if(areas===undefined||areas.length===0)continue;
    const decorations=generateSurvivalLandmarkDecorations([landmark]);
    for(const area of areas){
      const anchors=decorations.filter(decoration=>decoration.layer==='ground'
        &&tileInArea(area,decoration.tileX,decoration.tileY));
      if(anchors.length!==1)continue;
      const anchor=anchors[0]!;
      bindings.push({sourceDecorationId:anchor.id,tileX:anchor.tileX,tileY:anchor.tileY,area});
    }
  }
  const bindingCounts=new Map<number,number>();
  for(const binding of bindings)bindingCounts.set(binding.sourceDecorationId,
    (bindingCounts.get(binding.sourceDecorationId)??0)+1);
  const instancesBySource=new Map<number,PersistedLandmarkGroundAnchor[]>();
  for(const instance of instances){
    const matches=instancesBySource.get(instance.sourceDecorationId)??[];
    matches.push(instance);instancesBySource.set(instance.sourceDecorationId,matches);
  }
  for(const binding of bindings){
    if(bindingCounts.get(binding.sourceDecorationId)!==1)continue;
    const matches=instancesBySource.get(binding.sourceDecorationId);
    if(matches?.length!==1||matches[0]!.enabled!==true)continue;
    const instance=matches[0]!;
    appendArea(tiles,binding.area,instance.tileX-binding.tileX,instance.tileY-binding.tileY);
  }
  return Object.freeze([...tiles.values()]);
}

/** Resolves one active space by durable numeric identity. Missing, retired or
 * ambiguous active space definitions fail neutral with no terrain overrides. */
export function activeSpaceGroundWalkableTiles(
  registry:SurvivalLandmarkRegistry,
  spaceId:number,
  instances?:readonly PersistedLandmarkGroundAnchor[],
):readonly LandmarkGroundWalkableTile[] {
  const spaces=[...registry.spaces.values()].filter(space=>space.retired!==true&&space.spaceId===spaceId);
  if(spaces.length!==1)return Object.freeze([]);
  return landmarkGroundWalkableTiles(spaces[0]!.landmarks??[],instances);
}
