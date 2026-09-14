import type {HearthArchitectureCell} from './hearth-architecture.js';
import {hearthFurnitureCells,type HearthFurniturePlacement} from './hearth-furniture-placement.js';
type Tile={readonly tileX:number;readonly tileY:number};
export interface HearthDoorwayRun {
  readonly axis:'north_south'|'east_west';readonly first:Tile;readonly last:Tile;
  readonly before:Tile;readonly after:Tile;
}
/** Shared physical support identity for authoring and native doorway rendering. */
export function hearthDoorwayRuns(cells:readonly HearthArchitectureCell[]):readonly HearthDoorwayRun[]{
  const byKey=new Map(cells.map(cell=>[`${cell.tileX},${cell.tileY}`,cell.partition]));
  const kind=(x:number,y:number)=>byKey.get(`${x},${y}`),runs:HearthDoorwayRun[]=[];
  for(const cell of cells){
    if(cell.partition!=='doorway')continue;
    const {tileX:x,tileY:y}=cell;
    for(const [dx,dy,axis] of [[1,0,'north_south'],[0,1,'east_west']] as const){
      if(kind(x-dx,y-dy)!=='wall')continue;
      let length=1;while(length<32&&kind(x+dx*length,y+dy*length)==='doorway')length++;
      if(kind(x+dx*length,y+dy*length)!=='wall')continue;
      runs.push({axis,first:{tileX:x,tileY:y},last:{tileX:x+dx*(length-1),tileY:y+dy*(length-1)},
        before:{tileX:x-dx,tileY:y-dy},after:{tileX:x+dx*length,tileY:y+dy*length}});
    }
  }
  return runs;
}
function supports(cells:readonly HearthArchitectureCell[]):ReadonlySet<string>{
  return new Set(hearthDoorwayRuns(cells).flatMap(run=>[run.before,run.after]).map(tile=>`${tile.tileX},${tile.tileY}`));
}
export function hearthDoorwayWindowConflicts(cells:readonly HearthArchitectureCell[]):ReadonlySet<string>{
  const reserved=supports(cells);
  return new Set(cells.filter(cell=>cell.window&&reserved.has(`${cell.tileX},${cell.tileY}`)).map(cell=>`${cell.tileX},${cell.tileY}`));
}
export function hearthDoorwayWallAttachmentFailure(cells:readonly HearthArchitectureCell[],items:readonly HearthFurniturePlacement[]):'doorway_support_occupied'|null{
  const reserved=supports(cells);
  return items.some(item=>item.shape.layer==='wall'&&hearthFurnitureCells(item).some(tile=>reserved.has(`${tile.tileX},${tile.tileY}`)))
    ?'doorway_support_occupied':null;
}
