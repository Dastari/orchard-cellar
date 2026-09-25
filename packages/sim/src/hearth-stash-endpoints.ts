import { CombatRegionPolicy } from './combat-regions.js';
import { LIVE_ISLAND_MAP_ID } from './live-island-map-id.js';
import type { MapDocumentV3 } from './map-document-v3.js';
import { combatSegmentObstructed } from './combat-actions.js';
import { collisionCellIndex, playerInteractionOrigin, positionCollides } from './movement.js';
import { TILE_SIZE_FIXED, type CollisionMap } from './state.js';
import type { ContentRegistry } from './content/registry.js';

export interface HearthSupplyCacheDefinition {
  readonly endpointId: string;
  readonly spaceId: number;
  readonly objectDefinitionId: string;
  readonly objectId: string;
  readonly prefabId: string;
  readonly assetId: number;
  readonly assetName: string;
  readonly visualState: string;
  readonly tileX: number;
  readonly tileY: number;
  readonly frontage: { readonly tileX: number; readonly tileY: number };
}

/** Resolves the one active authored cache and its active object art. Multiple
 * owners, retired references, or incomplete object definitions fail closed. */
export function runtimeHearthSupplyCache(
  registry: ContentRegistry,
  endpointId?: string,
  spaceId?: number,
): HearthSupplyCacheDefinition | null {
  const candidates = [...registry.spaces.values()].filter(space => space.retired !== true
    && space.supplyCache !== undefined
    && (endpointId === undefined || space.supplyCache[0] === endpointId)
    && (spaceId === undefined || space.spaceId === spaceId));
  if (candidates.length !== 1) return null;
  const space = candidates[0]!, cache = space.supplyCache!;
  const object = registry.objects.get(cache[1]);
  const assetName = object?.components.sprite?.asset;
  const visualState = object?.components.sprite?.animationByState?.default;
  if (object === undefined || object.retired === true || object.components.container === undefined
    || assetName === undefined || visualState === undefined) return null;
  return { endpointId: cache[0], spaceId: space.spaceId, objectDefinitionId: cache[1],
    objectId: cache[2], prefabId: cache[3], assetId: cache[4], assetName, visualState,
    tileX: cache[5], tileY: cache[6], frontage: { tileX: cache[7], tileY: cache[8] } };
}

/** A named object is insufficient: require the reviewed chest visual, physical
 * base and untransformed placement. No arbitrary map object grants storage. */
export function hearthSupplyCacheInstalled(cache: HearthSupplyCacheDefinition, document: MapDocumentV3 | null): boolean {
  if (document === null || document.id !== LIVE_ISLAND_MAP_ID) return false;
  const matches = document.objects.filter(object => object.id === cache.objectId);
  const object = matches[0];
  if (matches.length !== 1 || object === undefined || !object.enabled || object.prefabId !== cache.prefabId
    || object.prefabRevision !== 1 || object.tileX !== cache.tileX || object.tileY !== cache.tileY || object.elevation !== 0
    || object.layer !== 'objects' || object.quarterTurns !== 0 || object.flipX || (object.scale ?? 1) !== 1) return false;
  const prefabs = document.prefabs.filter(prefab => prefab.id === object.prefabId), prefab = prefabs[0];
  if (prefabs.length !== 1 || prefab === undefined || prefab.revision !== 1 || prefab.width !== 1 || prefab.height !== 1
    || prefab.pivot.tileX !== 0 || prefab.pivot.tileY !== 0 || prefab.placements.length !== 1 || prefab.cells.length !== 1
    || prefab.behaviors.length !== 1 || prefab.behaviors[0]?.kind !== 'static') return false;
  const visual = prefab.placements[0]!, cell = prefab.cells[0]!;
  if (visual.assetId !== cache.assetId || visual.assetName !== cache.assetName
    || visual.tileX !== 0 || visual.tileY !== 0 || visual.elevation !== 0 || visual.layer !== 'object'
    || visual.quarterTurns !== 0 || visual.flipX || visual.visual.kind !== 'state'
    || visual.visual.name !== cache.visualState || visual.visual.frameIndex !== 0
    || cell.tileX !== 0 || cell.tileY !== 0 || cell.elevation !== 0 || cell.collisionMask !== 0xffff) return false;
  const policy = new CombatRegionPolicy(document.combatRegions ?? []);
  return [cache, cache.frontage].every(point => policy.regionAt({
    spaceId: cache.spaceId, tileX: point.tileX + .5, tileY: point.tileY + .5 })?.policy === 'sanctuary');
}

export function hearthSupplyCacheApproachClear(cache: HearthSupplyCacheDefinition,
  position: { readonly x: number; readonly y: number }, collision: CollisionMap): boolean {
  const point = { x: (cache.frontage.tileX + .5) * TILE_SIZE_FIXED,
    y: (cache.frontage.tileY + .5) * TILE_SIZE_FIXED };
  // Stop immediately outside the exact chest's southern collision edge. Keep
  // every obstacle, so a foreign fence between the frontage and chest blocks.
  const contact = { x: (cache.tileX + .5) * TILE_SIZE_FIXED,
    y: (cache.tileY + 1) * TILE_SIZE_FIXED + 1 };
  // World tiles through the shared addressing (a client chunk window has an origin, S4d).
  const elevation = (x: number, y: number) => {
    const cell = collisionCellIndex(collision, Math.floor(x / TILE_SIZE_FIXED), Math.floor(y / TILE_SIZE_FIXED));
    return cell < 0 ? 0 : collision.elevations?.[cell] ?? 0;
  };
  return Math.hypot(position.x - point.x, position.y - point.y) <= 1.5 * TILE_SIZE_FIXED
    && elevation(position.x, position.y) === 0 && elevation(point.x, point.y) === 0
    && !positionCollides(position, collision) && !positionCollides(point, collision)
    && !combatSegmentObstructed(playerInteractionOrigin(position), playerInteractionOrigin(point), collision)
    && !combatSegmentObstructed(playerInteractionOrigin(position), contact, collision);
}
