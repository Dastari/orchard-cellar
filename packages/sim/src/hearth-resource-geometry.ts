import type { CollisionMap } from './state.js';
import { bootstrapContentRegistry } from './content/bootstrap-registry.js';
import type { ContentRegistry } from './content/registry.js';
import { runtimeResourceTargetVector } from './content/runtime.js';
import { TILE_SIZE_FIXED } from './state.js';
import { collisionCellIndex, playerInteractionOrigin, positionCollides } from './movement.js';
import { combatSegmentObstructed } from './combat-actions.js';
import { runtimeHearthResourceSite } from './hearth-resource-sites.js';

/** Collision must omit only this resource's own obstacle. Authority additionally
 * validates site identity, active policy, maturity, tool and cost/claim state. */
export function hearthResourceGeometryAllows(position: { readonly x: number; readonly y: number },
  resourceId: bigint, collision: CollisionMap, registry: ContentRegistry = bootstrapContentRegistry()): boolean {
  const site = runtimeHearthResourceSite(registry, resourceId);
  if (site === null) return false;
  // World tiles through the shared addressing (a client chunk window has an origin, S4d).
  const elevation = (x: number, y: number) => {
    const cell = collisionCellIndex(collision, Math.floor(x / TILE_SIZE_FIXED), Math.floor(y / TILE_SIZE_FIXED));
    return cell < 0 ? -32768 : collision.elevations?.[cell] ?? 0;
  };
  const origin = playerInteractionOrigin(position);
  const vector = runtimeResourceTargetVector(registry, {
    kind: site.kind, definitionId: site.definitionId,
  }, position.x, position.y, site.tileX, site.tileY);
  if (vector === null) return false;
  const target = { x: origin.x + vector.x, y: origin.y + vector.y };
  return !positionCollides(position, collision) && elevation(position.x, position.y) === site.elevation
    && elevation(target.x, target.y) === site.elevation && !combatSegmentObstructed(origin, target, collision);
}
