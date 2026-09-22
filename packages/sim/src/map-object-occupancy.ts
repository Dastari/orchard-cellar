import {mapObjectCollisionCells,mapObjectPrefab,type MapDocumentV3,type MapObjectInstance} from './map-document-v3.js';

/** Occupancy is authoring intent, including decorative cells with no collision. */
export function mapObjectOccupiedCells(document:MapDocumentV3,object:MapObjectInstance) {
 const prefab=mapObjectPrefab(document,object);
 if(!prefab)return [{tileX:object.tileX,tileY:object.tileY,elevation:object.elevation,collisionMask:0}];
 const solid={...prefab,cells:prefab.cells.map(cell=>({...cell,collisionMask:65535}))};
 return mapObjectCollisionCells({...document,prefabs:[solid]}, {...object,enabled:true});
}
export function mapObjectPlacementConflict(document:MapDocumentV3,object:MapObjectInstance):string|null {
 if(!object.enabled)return null;
 const cells=mapObjectOccupiedCells(document,object);
 const keys=new Set(cells.map(cell=>`${cell.tileX},${cell.tileY},${cell.elevation}`));
 if(cells.some(cell=>cell.tileX<0||cell.tileY<0||cell.tileX>=document.width||cell.tileY>=document.height))return 'outside-map';
 for(const other of document.objects)if(other.id!==object.id&&other.enabled&&other.layer===object.layer
  &&mapObjectOccupiedCells(document,other).some(cell=>keys.has(`${cell.tileX},${cell.tileY},${cell.elevation}`)))return other.id;
 for(const other of document.landmarks)if(other.id!==object.id&&other.enabled&&other.layer===object.layer
  &&keys.has(`${other.tileX},${other.tileY},${other.elevation}`))return other.id;
 return null;
}
