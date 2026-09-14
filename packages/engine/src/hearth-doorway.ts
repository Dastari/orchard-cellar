import {hearthDoorwayRuns,type HearthArchitectureCell} from '@orchard/sim';
export interface HearthDoorwayJamb {
  readonly tileX:number;readonly tileY:number;
  /** Native crop top-left, in world pixels, wholly inside a blocked support. */
  readonly x:number;readonly y:number;readonly side:'left'|'right';
}
/** Derive runs from persisted cells, including wider openings authored through
 * the batch API. Never stretch or rotate a front-facing source into a side arch. */
export function hearthDoorwayFeatures(cells:readonly HearthArchitectureCell[]) {
  const jambs:HearthDoorwayJamb[]=[],frames:Array<{x:number;y:number}>=[];
  for(const run of hearthDoorwayRuns(cells)){
    const {tileX:x,tileY:y}=run.first;
    if(run.axis==='north_south'){
      jambs.push({...run.before,x:x*16-8,y:y*16+8,side:'left'},
        {...run.after,x:run.after.tileX*16+3,y:y*16+8,side:'right'});
      if(run.first.tileX===run.last.tileX)frames.push({x:x*16+8,y:y*16+15});
    }else jambs.push({...run.before,x:x*16+6,y:y*16-8,side:'left'},
      {...run.after,x:x*16+6,y:run.after.tileY*16,side:'right'});
  }
  return {jambs,frames};
}
