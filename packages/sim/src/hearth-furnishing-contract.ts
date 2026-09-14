import type {ContentRegistry} from './content/registry.js';
import {hearthFurnitureCells} from './hearth-furniture-placement.js';
import {hearthFurnitureDefinition,hearthFurniturePlacementFromRow,hearthFurnitureStateIsValid} from './hearth-furniture-state.js';

import type {HearthFurnishingCategory} from './hearth-furnishing-categories.js';
export * from './hearth-furnishing-categories.js';
/** Caller supplies only the owner's residence rows. Counts describe current
 * placements, never lifetime placement events or the contents of carried bags. */
export function hearthFurnishingCounts(registry:ContentRegistry,rows:readonly Parameters<typeof hearthFurniturePlacementFromRow>[1][]):Record<HearthFurnishingCategory,number>{
  const counts:Record<HearthFurnishingCategory,number>={seat:0,table:0,lamp:0,rug:0};
  const items=rows.flatMap(row=>{
    try {
      const item=hearthFurniturePlacementFromRow(registry,row);
      if(!item||!Number.isInteger(item.tileX)||!Number.isInteger(item.tileY))return [];
      if(item.shape.layer!=='tabletop'&&item.supportId!==undefined)return [];
      const eligible=hearthFurnitureDefinition(registry,item.shape.id);
      if(!eligible||eligible.definition.retired===true)return [];
      if(!hearthFurnitureStateIsValid(row.stateJson,eligible.definition.components.states??{}))return [];
      if(hearthFurnitureCells(item).some(cell=>cell.tileX<3||cell.tileX>12||cell.tileY<3||cell.tileY>12))return [];
      return [item];
    }catch{return [];}
  });
  const seen=new Set<string>();
  for(const item of items){
    if(seen.has(item.id))continue;seen.add(item.id);
    if(item.shape.layer==='tabletop'){
      const support=items.find(other=>other.id===item.supportId),surface=support?.shape.tabletopSurface;
      if(!support||!surface)continue;
      const left=support.tileX-Math.floor((support.shape.width-1)/2)+surface.insetLeft;
      const top=support.tileY-support.shape.height+1+surface.insetTop;
      if(hearthFurnitureCells(item).some(cell=>cell.tileX<left||cell.tileX>=left+surface.width||cell.tileY<top||cell.tileY>=top+surface.height))continue;
    }else if(item.supportId!==undefined)continue;
    const definition=hearthFurnitureDefinition(registry,item.shape.id)?.definition;
    if(item.shape.seatPoseOffsetPixels!==undefined)counts.seat++;
    if(item.shape.tabletopSurface!==undefined)counts.table++;
    if(definition?.components.light!==undefined)counts.lamp++;
    if(item.shape.layer==='floor')counts.rug++;
  }
  return counts;
}
