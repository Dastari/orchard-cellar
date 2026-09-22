import {
  MANUAL_OBJECT_CONNECTION_TAG, mapObjectConnectionFamily, mapObjectOccupiedCells,
  mapObjectPrefab, smartConnectedObjectPrefabs,
  type MapDocumentV3, type MapObjectInstance, type MapPrefabDocumentV2,
} from '@orchard/sim';

/** Match the renderer's automatic joins, including pre-Smart-Placement prefabs.
 * Exact pieces, gates, scaled objects and compound prefabs keep their geometry. */
export function mapEditorJoinedPrefab(document: MapDocumentV3, object: MapObjectInstance): MapPrefabDocumentV2 | null {
  const prefab = mapObjectPrefab(document, object);
  if (!prefab || !mapObjectConnectionFamily(prefab, object)
    || prefab.tags.includes(MANUAL_OBJECT_CONNECTION_TAG)
    || prefab.placements[0]!.assetName.endsWith('_gate')) return null;
  return prefab;
}

export function mapEditorObjectOccupiedCells(document: MapDocumentV3, object: MapObjectInstance) {
  return mapEditorJoinedPrefab(document, object)
    ? [{ tileX: object.tileX, tileY: object.tileY, elevation: object.elevation, collisionMask: 65535 }]
    : mapObjectOccupiedCells(document, object);
}

export function mapEditorObjectPlacementConflict(document: MapDocumentV3, object: MapObjectInstance): string | null {
  if (!object.enabled) return null;
  const cells = mapEditorObjectOccupiedCells(document, object);
  const keys = new Set(cells.map(cell => `${cell.tileX},${cell.tileY},${cell.elevation}`));
  if (cells.some(cell => cell.tileX < 0 || cell.tileY < 0 || cell.tileX >= document.width || cell.tileY >= document.height)) return 'outside-map';
  for (const other of document.objects) {
    if (other.id !== object.id && other.enabled && other.layer === object.layer
      && mapEditorObjectOccupiedCells(document, other).some(cell => keys.has(`${cell.tileX},${cell.tileY},${cell.elevation}`))) return other.id;
  }
  for (const other of document.landmarks) {
    if (other.id !== object.id && other.enabled && other.layer === object.layer
      && keys.has(`${other.tileX},${other.tileY},${other.elevation}`)) return other.id;
  }
  return null;
}

/** Persist correct geometry only for the edited instance. Never rewrite the
 * shared legacy prefab (other objects may use its Exact or scaled geometry). */
export function mapEditorJoinedPrefabForEdit(document: MapDocumentV3, object: MapObjectInstance): MapPrefabDocumentV2 | null {
  const source = mapEditorJoinedPrefab(document, object);
  if (!source || (source.width === 1 && source.height === 1
    && source.pivot.tileX === 0 && source.pivot.tileY === 0
    && source.cells.length === 1 && source.cells[0]!.tileX === 0
    && source.cells[0]!.tileY === 0 && source.cells[0]!.elevation === 0)) return null;
  const canonical = smartConnectedObjectPrefabs([source])[0]!;
  const stem = `joined-${object.id}`.slice(0, 54);
  let id = stem;
  for (let suffix = 1; document.prefabs.some(prefab => prefab.id === id); suffix += 1) id = `${stem}-${suffix}`;
  return { ...canonical, id };
}
