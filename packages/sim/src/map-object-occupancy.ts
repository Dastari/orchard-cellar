import {mapObjectCollisionCells,mapObjectPrefab,type MapDocumentV3,type MapObjectInstance} from './map-document-v3.js';

/** Occupancy is authoring intent, including decorative cells with no collision. */
export function mapObjectOccupiedCells(document:MapDocumentV3,object:MapObjectInstance) {
 const prefab=mapObjectPrefab(document,object);
 if(!prefab)return [{tileX:object.tileX,tileY:object.tileY,elevation:object.elevation,collisionMask:0}];
 const solid={...prefab,cells:prefab.cells.map(cell=>({...cell,collisionMask:65535}))};
 return mapObjectCollisionCells({...document,prefabs:[solid]}, {...object,enabled:true});
}

/** An object blocks movement when any authored prefab cell carries collision.
 * Unresolved prefabs are treated as solid so unknown content never loosens
 * the occupancy policy. */
export function mapObjectIsSolid(document:MapDocumentV3,object:MapObjectInstance):boolean {
 const prefab=mapObjectPrefab(document,object);
 return prefab===null||prefab.cells.some(cell=>cell.collisionMask!==0);
}

/** A flat ground-band decal (door mat, paving piece, rug) never blocks movement.
 * Standing bands keep strict occupancy until per-object ordering exists. */
export function mapObjectIsGroundDecal(document:MapDocumentV3,object:MapObjectInstance):boolean {
 return object.layer==='ground'&&!mapObjectIsSolid(document,object);
}

/** Same definition, anchor cell and transform: stacking it adds nothing visible
 * and is always rejected, whatever the solidity. */
export function mapObjectsAreExactDuplicates(left:MapObjectInstance,right:MapObjectInstance):boolean {
 return left.prefabId===right.prefabId&&left.prefabRevision===right.prefabRevision
  &&left.tileX===right.tileX&&left.tileY===right.tileY&&left.elevation===right.elevation
  &&left.layer===right.layer&&left.quarterTurns===right.quarterTurns&&left.flipX===right.flipX
  &&(left.scale??1)===(right.scale??1);
}

/** Overlap policy (wiki: Studio/Map Editor) for two objects that share an occupied cell on
 * the same layer and height. Two solid objects conflict; a non-solid ground
 * decal may sit over (or under) anything in its band; exact duplicates are
 * always rejected. Non-ground bands keep one-object-per-cell occupancy. */
export function mapObjectOverlapAllowed(document:MapDocumentV3,object:MapObjectInstance,other:MapObjectInstance):boolean {
 if(mapObjectsAreExactDuplicates(object,other))return false;
 return mapObjectIsGroundDecal(document,object)||mapObjectIsGroundDecal(document,other);
}

export function mapObjectPlacementConflict(document:MapDocumentV3,object:MapObjectInstance):string|null {
 if(!object.enabled)return null;
 const cells=mapObjectOccupiedCells(document,object);
 const keys=new Set(cells.map(cell=>`${cell.tileX},${cell.tileY},${cell.elevation}`));
 if(cells.some(cell=>cell.tileX<0||cell.tileY<0||cell.tileX>=document.width||cell.tileY>=document.height))return 'outside-map';
 for(const other of document.objects)if(other.id!==object.id&&other.enabled&&other.layer===object.layer
  &&!mapObjectOverlapAllowed(document,object,other)
  &&mapObjectOccupiedCells(document,other).some(cell=>keys.has(`${cell.tileX},${cell.tileY},${cell.elevation}`)))return other.id;
 if(mapObjectIsGroundDecal(document,object))return null;
 for(const other of document.landmarks)if(other.id!==object.id&&other.enabled&&other.layer===object.layer
  &&keys.has(`${other.tileX},${other.tileY},${other.elevation}`))return other.id;
 return null;
}
