import type { CollisionMap } from './state.js';
import { bootstrapContentRegistry } from './content/bootstrap-registry.js';
import type { ContentRegistry } from './content/registry.js';
import { runtimeResourceTargetVector } from './content/runtime.js';
import { TILE_SIZE_FIXED } from './state.js';
import { playerInteractionOrigin, positionCollides } from './movement.js';
import { combatSegmentObstructed } from './combat-actions.js';
import { runtimeHearthResourceSite } from './hearth-resource-sites.js';

/** Collision must omit only this resource's own obstacle. Authority additionally
 * validates site identity, active policy, maturity, tool and cost/claim state. */
export function hearthResourceGeometryAllows(position: { readonly x: number; readonly y: number },
  resourceId: bigint, collision: CollisionMap, registry: ContentRegistry = bootstrapContentRegistry()): boolean {
  const site = runtimeHearthResourceSite(registry, resourceId);
  if (site === null) return false;
  const elevation = (x: number, y: number) => {
    const tx = Math.floor(x / TILE_SIZE_FIXED), ty = Math.floor(y / TILE_SIZE_FIXED);
    return tx < 0 || ty < 0 || tx >= collision.width || ty >= collision.height ? -32768
      : collision.elevations?.[ty * collision.width + tx] ?? 0;
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
