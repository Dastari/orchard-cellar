import {
  mapObjectCollisionCells,
  mapObjectPrefab,
  type MapDocumentV3,
  type MapObjectInstance,
} from '@orchard/sim';
import { mapEditorJoinedPrefab } from './connected-object-footprint.js';

export interface MapEditorSelectionFootprintCell {
  readonly tileX: number;
  readonly tileY: number;
  readonly elevation: number;
  readonly collisionMask: number;
}

/** Exact transformed visual/collision footprint for one authored instance. */
export function mapEditorAuthoredObjectFootprint(
  document: MapDocumentV3,
  object: MapObjectInstance,
): readonly MapEditorSelectionFootprintCell[] {
  const joined = mapEditorJoinedPrefab(document, object);
  if (joined) return [{ tileX: object.tileX, tileY: object.tileY, elevation: object.elevation,
    collisionMask: joined.cells.some(cell => cell.collisionMask !== 0) ? 65535 : 0 }];
  const enabledObject = object.enabled ? object : { ...object, enabled: true };
  const collision = mapObjectCollisionCells(document, enabledObject);
  if (collision.length > 0) return collision;
  const prefab = mapObjectPrefab(document, object);
  if (prefab === null) return [{
    tileX: object.tileX, tileY: object.tileY, elevation: object.elevation, collisionMask: 0,
  }];
  const footprintPrefab = {
    ...prefab,
    cells: prefab.cells.map((cell) => ({ ...cell, collisionMask: 0xffff })),
  };
  const footprintDocument = {
    ...document,
    prefabs: document.prefabs.map((candidate) => candidate === prefab ? footprintPrefab : candidate),
  };
  const footprint = mapObjectCollisionCells(footprintDocument, enabledObject)
    .map((cell) => ({ ...cell, collisionMask: 0 }));
  return footprint.length > 0 ? footprint : [{
    tileX: object.tileX, tileY: object.tileY, elevation: object.elevation, collisionMask: 0,
  }];
}

export function mapEditorAuthoredDragFootprint(
  document: MapDocumentV3,
  object: MapObjectInstance,
  destination: { readonly tileX: number; readonly tileY: number; readonly elevation: number },
): readonly MapEditorSelectionFootprintCell[] {
  return mapEditorAuthoredObjectFootprint(document, { ...object, ...destination });
}

/** Keep every transformed prefab cell inside the finite authored document. */
export function clampMapEditorObjectDrag(
  document: MapDocumentV3,
  object: MapObjectInstance,
  tileX: number,
  tileY: number,
  elevation: number,
): { readonly tileX: number; readonly tileY: number; readonly elevation: number } {
  const cells = mapEditorAuthoredObjectFootprint(document, { ...object, tileX, tileY, elevation });
  const minimumX = Math.min(...cells.map((cell) => cell.tileX));
  const maximumX = Math.max(...cells.map((cell) => cell.tileX));
  const minimumY = Math.min(...cells.map((cell) => cell.tileY));
  const maximumY = Math.max(...cells.map((cell) => cell.tileY));
  const correctedX = tileX + (minimumX < 0 ? -minimumX
    : maximumX >= document.width ? document.width - 1 - maximumX : 0);
  const correctedY = tileY + (minimumY < 0 ? -minimumY
    : maximumY >= document.height ? document.height - 1 - maximumY : 0);
  return {
    tileX: Math.max(0, Math.min(document.width - 1, correctedX)),
    tileY: Math.max(0, Math.min(document.height - 1, correctedY)),
    elevation,
  };
}
