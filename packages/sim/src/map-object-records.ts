/** Record-level helpers for authored map objects.
 *
 * These take plain object, prefab and layer lists rather than a whole map
 * document so presentation code can later be fed from chunk records. This
 * module is a leaf: it must not import (other than as types) the map document
 * module, the island generator or the map compiler, which would pull the
 * whole-map generator into any bundle that draws objects. `map-document-v3`
 * re-exports everything here, so existing callers are unchanged. */
import type {
  AuthoredMapContentKind,
  MapContentLayerDefinition,
  MapContentLayerId,
  MapObjectInstance,
  MapObjectLayer,
} from './map-document-v3.js';
import { transformMapPrefabCollisionMask, type MapPrefabDocumentV2 } from './map-prefab.js';
import { floorDiv, floorMod } from './world-coordinates.js';

/** The persisted layer stack; a whole map document satisfies this. */
export interface MapContentLayerRecords {
  readonly layers: readonly Pick<MapContentLayerDefinition, 'id' | 'order'>[];
}

/** The prefab revisions objects refer to; a whole map document satisfies this. */
export interface MapPrefabRecords {
  readonly prefabs: readonly MapPrefabDocumentV2[];
}

const contentLayerRanks = new WeakMap<MapContentLayerRecords, ReadonlyMap<MapContentLayerId, number>>();

/** Zero-based back-to-front rank from the document's persisted layer stack.
 * Runtime drawing and editor hit testing use this only as the final tie-break
 * after elevation and foot-Y; it is deliberately not a global z-index. */
export function mapContentLayerRank(
  document: MapContentLayerRecords,
  layer: MapContentLayerId,
): number {
  let ranks = contentLayerRanks.get(document);
  if (ranks === undefined) {
    ranks = new Map([...document.layers]
      .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id))
      .map(({ id }, index) => [id, index] as const));
    contentLayerRanks.set(document, ranks);
  }
  return ranks.get(layer) ?? -1;
}

/** Stable shared final-tie key for persisted authored content. Keeping the
 * `live-map` namespace preserves its existing relationship with dynamic
 * player/NPC/placeable ties while allowing layer reorder within equal depth. */
export function authoredMapContentPainterTie(
  document: MapContentLayerRecords,
  layer: MapObjectLayer,
  kind: AuthoredMapContentKind,
  id: string,
  partId?: string,
): string {
  const rank = String(Math.max(0, mapContentLayerRank(document, layer))).padStart(2, '0');
  return `live-map:${rank}:${kind}:${id}${partId === undefined ? '' : `:${partId}`}`;
}

export function mapObjectPrefab(
  document: MapPrefabRecords,
  object: MapObjectInstance,
): MapPrefabDocumentV2 | null {
  return document.prefabs.find((prefab) => (
    prefab.id === object.prefabId && prefab.revision === object.prefabRevision
  )) ?? null;
}

export function mapObjectCollisionCells(
  document: MapPrefabRecords,
  object: MapObjectInstance,
): readonly { readonly tileX: number; readonly tileY: number; readonly elevation: number; readonly collisionMask: number }[] {
  const prefab = mapObjectPrefab(document, object);
  if (prefab === null || !object.enabled) return [];
  const transformedCells = prefab.cells.map((cell) => {
    let deltaX = cell.tileX - prefab.pivot.tileX;
    const deltaY = cell.tileY - prefab.pivot.tileY;
    if (object.flipX) deltaX = -deltaX;
    const transformed = object.quarterTurns === 0 ? { tileX: deltaX, tileY: deltaY }
      : object.quarterTurns === 1 ? { tileX: -deltaY, tileY: deltaX }
        : object.quarterTurns === 2 ? { tileX: -deltaX, tileY: -deltaY }
          : { tileX: deltaY, tileY: -deltaX };
    return {
      tileX: object.tileX + transformed.tileX,
      tileY: object.tileY + transformed.tileY,
      elevation: object.elevation + cell.elevation,
      collisionMask: transformMapPrefabCollisionMask(
        cell.collisionMask,
        object.quarterTurns,
        object.flipX,
      ),
    };
  });
  const scale = object.scale ?? 1;
  if (scale === 1) return transformedCells;
  const scaled = new Map<string, {
    tileX: number; tileY: number; elevation: number; collisionMask: number;
  }>();
  for (const cell of transformedCells) {
    for (let bit = 0; bit < 16; bit += 1) {
      if ((cell.collisionMask & (1 << bit)) === 0) continue;
      const sourceQuarterX = (cell.tileX - object.tileX) * 4 + bit % 4;
      const sourceQuarterY = (cell.tileY - object.tileY) * 4 + Math.floor(bit / 4);
      for (let scaleY = 0; scaleY < scale; scaleY += 1) {
        for (let scaleX = 0; scaleX < scale; scaleX += 1) {
          const quarterX = sourceQuarterX * scale + scaleX;
          const quarterY = sourceQuarterY * scale + scaleY;
          const tileX = object.tileX + floorDiv(quarterX, 4);
          const tileY = object.tileY + floorDiv(quarterY, 4);
          const localX = floorMod(quarterX, 4);
          const localY = floorMod(quarterY, 4);
          const key = `${tileX},${tileY},${cell.elevation}`;
          const previous = scaled.get(key);
          scaled.set(key, {
            tileX,
            tileY,
            elevation: cell.elevation,
            collisionMask: (previous?.collisionMask ?? 0) | (1 << (localY * 4 + localX)),
          });
        }
      }
    }
  }
  return [...scaled.values()].sort((left, right) => (
    left.elevation - right.elevation || left.tileY - right.tileY || left.tileX - right.tileX
  ));
}
