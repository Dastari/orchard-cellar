import type {HearthArchitectureCell} from './hearth-architecture.js';
import type {HearthArchitectureEdit,HearthArchitectureState} from './hearth-architecture-edits.js';

export const HEARTH_CONSTRUCTION_TOOLS = [
  {id:'rustic',label:'Rustic floor'}, {id:'townhouse',label:'Townhouse floor'},
  {id:'wall',label:'Wall'}, {id:'doorway_ns',label:'Doorway north / south'},
  {id:'doorway_ew',label:'Doorway east / west'}, {id:'window',label:'Window'},
  {id:'remove_floor',label:'Remove floor'}, {id:'remove_partition',label:'Remove wall / doorway'},
  {id:'remove_window',label:'Remove window'},
] as const;
export type HearthConstructionTool=typeof HEARTH_CONSTRUCTION_TOOLS[number]['id'];
/** A tool changes exactly one component; unrelated paid construction survives.
 * The authority still validates the full layout, reach, materials and revision. */
function componentEdit(state:HearthArchitectureState,tool:Exclude<HearthConstructionTool,'doorway_ns'|'doorway_ew'>|'doorway',tileX:number,tileY:number):
  {failure:string}|{failure:null;edit:HearthArchitectureEdit} {
  const previous=state.cells.find(cell=>cell.tileX===tileX&&cell.tileY===tileY);
  const cell:{-readonly[K in keyof HearthArchitectureCell]:HearthArchitectureCell[K]}={...previous,tileX,tileY};
  if((tool==='remove_partition'||tool==='doorway')&&cell.window)return {failure:'remove_window_first'};
  switch(tool){
    case 'rustic':case 'townhouse':cell.floor=tool;break;
    case 'wall':case 'doorway':cell.partition=tool;break;
    case 'window':if(cell.partition!=='wall')return {failure:'window_requires_wall'};cell.window=true;break;
    case 'remove_floor':delete cell.floor;break;
    case 'remove_partition':delete cell.partition;break;
    case 'remove_window':delete cell.window;break;
  }
  const components=(value:HearthArchitectureCell|undefined)=>[value?.floor,value?.partition,value?.window===true];
  if(JSON.stringify(components(previous))===JSON.stringify(components(cell)))return {failure:'architecture_unchanged'};
  const empty=cell.floor===undefined&&cell.partition===undefined&&cell.window!==true;
  return {failure:null,edit:{tileX,tileY,...(empty?{}:{replacement:cell})}};
}

/** Door stamps include both supporting jamb cells. East/west movement needs a
 * two-cell-high opening for the avatar's full body. The whole stamp commits or
 * fails together, including every preserved floor and window-support guard. */
function toolIntents(state:HearthArchitectureState,tool:HearthConstructionTool,tileX:number,tileY:number) {
  const intents:Array<{x:number;y:number;tool:Parameters<typeof componentEdit>[1]}>=[];
  if(tool==='doorway_ns')intents.push({x:tileX-1,y:tileY,tool:'wall'},{x:tileX,y:tileY,tool:'doorway'},{x:tileX+1,y:tileY,tool:'wall'});
  else if(tool==='doorway_ew')intents.push({x:tileX,y:tileY-1,tool:'wall'},{x:tileX,y:tileY,tool:'doorway'},
    {x:tileX,y:tileY+1,tool:'doorway'},{x:tileX,y:tileY+2,tool:'wall'});
  else if(tool==='remove_partition'&&state.cells.some(cell=>cell.tileX===tileX&&cell.tileY===tileY&&cell.partition==='doorway')) {
    const remaining=new Map(state.cells.filter(cell=>cell.partition==='doorway').map(cell=>[`${cell.tileX},${cell.tileY}`,cell]));
    const queue=[{tileX,tileY}];
    for(let i=0;i<queue.length;i++){
      const cell=queue[i]!,key=`${cell.tileX},${cell.tileY}`;
      if(!remaining.delete(key))continue;
      intents.push({x:cell.tileX,y:cell.tileY,tool:'remove_partition'});
      if(intents.length>32)return intents;
      for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]])queue.push({tileX:cell.tileX+dx!,tileY:cell.tileY+dy!});
    }
  }else intents.push({x:tileX,y:tileY,tool});
  return intents;
}
export function hearthConstructionToolFootprint(state:HearthArchitectureState,tool:HearthConstructionTool,tileX:number,tileY:number) {
  return toolIntents(state,tool,tileX,tileY).map(({x,y})=>({tileX:x,tileY:y}));
}
export function hearthConstructionToolEdits(state:HearthArchitectureState,tool:HearthConstructionTool,tileX:number,tileY:number):
  {failure:string}|{failure:null;edits:readonly HearthArchitectureEdit[]} {
  const intents=toolIntents(state,tool,tileX,tileY);
  if(intents.length>32)return {failure:'architecture_edit_limit'};
  const edits:HearthArchitectureEdit[]=[];
  for(const intent of intents){
    const result=componentEdit(state,intent.tool,intent.x,intent.y);
    if(result.failure==='architecture_unchanged')continue;
    if(result.failure!==null)return result;
    edits.push(result.edit);
  }
  return edits.length===0?{failure:'architecture_unchanged'}:{failure:null,edits};
}
