import { bootstrapContentRegistry } from './content/bootstrap-registry.js';
import type { ContentRegistry } from './content/registry.js';
import { runtimeResourceObstacle } from './content/runtime.js';
import type { CombatRegion } from './combat-regions.js';
import { runtimeHearthResourceSite } from './hearth-resource-sites.js';
import { hearthResourceGeometryAllows } from './hearth-resource-geometry.js';
import { collisionCellIndex, collisionTileIsBlockedAtPlane, movementPositionAllowed, positionCollides, PLAYER_HITBOX_FOOT_OFFSET } from './movement.js';
import { TREE_REGROWTH_PROGRESS_MAX } from './tree-regrowth.js';
import { TILE_SIZE_FIXED, type CollisionMap, type CollisionObstacle } from './state.js';

const HEARTH_RESOURCE_ROUTE_MAX_TILES = 65_536;

export interface HearthResourceRouteAuthority {
  readonly spaceId: number;
  readonly regions: readonly CombatRegion[];
}

const overlaps = (a: CollisionObstacle, b: CollisionObstacle) =>
  a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top;
/** Preflight only: no rows, claims, timers or map objects are mutated. The caller
 * supplies current authority collision, including all existing resources, and
 * IDs of missing, identity/custody-checked sites. New bases are checked together.
 * Native canopy pixels deliberately do not enlarge the physical trunk. */
export function hearthResourceInstallationGeometry(
  collision: CollisionMap,
  missingIds: readonly bigint[],
  registry: ContentRegistry = bootstrapContentRegistry(),
): CollisionMap | null {
  if (new Set(missingIds).size !== missingIds.length) return null;
  const sites = missingIds.map((id) => runtimeHearthResourceSite(registry, id));
  if (sites.some(site => site === null)) return null;
  const additions: CollisionObstacle[] = [];
  for (const site of sites) {
    if (site === null) return null;
    const base = runtimeResourceObstacle(registry, {
      kind: site.kind, definitionId: site.definitionId,
    }, site.tileX, site.tileY);
    if (base === null) return null;
    for (let y = Math.floor(base.top / TILE_SIZE_FIXED); y <= Math.floor(base.bottom / TILE_SIZE_FIXED); y++) {
      for (let x = Math.floor(base.left / TILE_SIZE_FIXED); x <= Math.floor(base.right / TILE_SIZE_FIXED); x++) {
        if (collisionTileIsBlockedAtPlane(collision, x, y, site.elevation)
          || (collision.elevations?.[collisionCellIndex(collision, x, y)] ?? 0) !== site.elevation) return null;
      }
    }
    if ([...(collision.obstacles ?? []), ...additions].some(obstacle => overlaps(base, obstacle))) return null;
    additions.push(base);
  }
  const combined = { ...collision, obstacles: [...(collision.obstacles ?? []), ...additions] };
  const ring = [[-1,-1],[0,-1],[1,-1],[1,0],[1,1],[0,1],[-1,1],[-1,0]] as const;
  for (const [index, site] of sites.entries()) {
    if (site === null) return null;
    const withoutOwn = { ...combined, obstacles: combined.obstacles.filter(obstacle => obstacle !== additions[index]) };
    const points = ring.map(([dx, dy]) => ({ x: (site.tileX + dx + .5) * TILE_SIZE_FIXED,
      y: (site.tileY + dy + .5) * TILE_SIZE_FIXED + PLAYER_HITBOX_FOOT_OFFSET + 1 }));
    // Every adjacent stance remains usable and connected in both directions.
    // One-pixel movement checks prevent a thin fence between stance samples
    // from being skipped by a tile-sized probe.
    if (points.some(point => !hearthResourceGeometryAllows(point, site.id, withoutOwn, registry)
      || positionCollides(point, combined))) return null;
    for (const [i, from] of points.entries()) {
      const to = points[(i + 1) % points.length]!;
      let previous = from;
      for (let pixel = 1; pixel <= 16; pixel++) {
        const next = { x: from.x + (to.x - from.x) * pixel / 16, y: from.y + (to.y - from.y) * pixel / 16 };
        if (!movementPositionAllowed(previous, next, combined) || !movementPositionAllowed(next, previous, combined)) return null;
        previous = next;
      }
    }
  }
  return combined;
}

/** Stable explicit initial state; never run this over a matching persisted row. */
export function initialHearthResourceState(
  id: bigint,
  registry: ContentRegistry = bootstrapContentRegistry(),
) {
  const site = runtimeHearthResourceSite(registry, id);
  if (site === null) return null;
  const mining = site.nodeClass !== '';
  const growthStage = site.maturityGrowthStage ?? 3;
  return { id: site.id, kind: site.kind, spaceId: 0, tileX: site.tileX, tileY: site.tileY,
    chunkX: Math.floor(site.tileX / 16), chunkY: Math.floor(site.tileY / 16), spawnSiteId: site.id,
    depleted: false, growthStage, regrowthProgress: site.regrowthProgress || TREE_REGROWTH_PROGRESS_MAX,
    health: site.health, richness: mining ? site.richness : 0,
    maximumRichness: mining ? site.richness : 0, yieldProgress: 0, yieldsProduced: 0,
    producedOre: false, activationOrdinal: 1, respawnAtTick: 0n,
    miningClass: site.nodeClass,
    miningClaimedBy: undefined, miningPartyId: undefined, miningClaimUntilTick: 0n,
    definitionId: site.definitionId };
}

/** Bounded install-time route proof on the combined authority collision. The
 * caller supplies the sanctuary recovery point. Every edge is traversable both
 * ways by a full player body; local stance rings alone cannot prove escape. */
export function hearthResourceInstallationRoutes(collision: CollisionMap, ids: readonly bigint[],
  start: { readonly x: number; readonly y: number }, authority: HearthResourceRouteAuthority,
  registry: ContentRegistry = bootstrapContentRegistry()): boolean {
  const sites = ids.map((id) => runtimeHearthResourceSite(registry, id));
  if (sites.some(site => site === null)) return false;
  if (ids.length === 0) return true;
  const at = (x: number, y: number) => ({ x: (x + .5) * TILE_SIZE_FIXED,
    y: (y + .5) * TILE_SIZE_FIXED + PLAYER_HITBOX_FOOT_OFFSET + 1 });
  const sx = Math.floor(start.x / TILE_SIZE_FIXED), sy = Math.floor((start.y - PLAYER_HITBOX_FOOT_OFFSET - 1) / TILE_SIZE_FIXED);
  const targetsByPosition = sites.map(site => ({ x: site!.tileX, y: site!.tileY + 1 }));
  const contains = (region: CombatRegion, x: number, y: number) => x >= region.minX && x <= region.maxX
    && y >= region.minY && y <= region.maxY;
  const candidates = authority.regions.filter(region => region.spaceId === authority.spaceId
    && region.policy === 'hostile'
    && [region.minX, region.minY, region.maxX, region.maxY].every(Number.isSafeInteger)
    && collisionCellIndex(collision, region.minX, region.minY) >= 0 && collisionCellIndex(collision, region.maxX, region.maxY) >= 0
    && region.minX <= region.maxX && region.minY <= region.maxY
    && (region.maxX - region.minX + 1) * (region.maxY - region.minY + 1) <= HEARTH_RESOURCE_ROUTE_MAX_TILES
    && contains(region, sx, sy) && targetsByPosition.every(target => contains(region, target.x, target.y)));
  if (candidates.length !== 1) return false;
  const { minX, maxX, minY, maxY } = candidates[0]!;
  if (sx < minX || sx > maxX || sy < minY || sy > maxY || positionCollides(start, collision)) return false;
  const buckets = new Map<number, CollisionObstacle[]>();
  // Spatial broadphase retains exact obstacle objects; a thin fence is never
  // replaced by tile occupancy. Padding covers the entire moving player body.
  for (const obstacle of collision.obstacles ?? []) {
    for (let y = Math.max(minY, Math.floor(obstacle.top / TILE_SIZE_FIXED) - 1); y <= Math.min(maxY, Math.floor(obstacle.bottom / TILE_SIZE_FIXED) + 1); y++) {
      for (let x = Math.max(minX, Math.floor(obstacle.left / TILE_SIZE_FIXED) - 1); x <= Math.min(maxX, Math.floor(obstacle.right / TILE_SIZE_FIXED) + 1); x++) {
        const key = y * collision.width + x, entries = buckets.get(key) ?? [];
        entries.push(obstacle); buckets.set(key, entries);
      }
    }
  }
  const edge = (from: { x: number; y: number }, to: { x: number; y: number }, local: CollisionMap) => {
    if (positionCollides(from, local) || positionCollides(to, local)) return false;
    const pixels = Math.max(1, Math.ceil(Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y)) / (TILE_SIZE_FIXED / 16)));
    let previous = from;
    for (let pixel = 1; pixel <= pixels; pixel++) {
      const next = { x: from.x + (to.x - from.x) * pixel / pixels, y: from.y + (to.y - from.y) * pixel / pixels };
      if (!movementPositionAllowed(previous, next, local) || !movementPositionAllowed(next, previous, local)) return false;
      previous = next;
    }
    return true;
  };
  if (!edge(start, at(sx, sy), collision)) return false;
  const targets = new Set(targetsByPosition.map(target => target.y * collision.width + target.x));
  const queue = [[sx, sy]], seen = new Set([sy * collision.width + sx]);
  for (let index = 0; index < queue.length && targets.size > 0; index++) {
    const [x, y] = queue[index]! as [number, number]; targets.delete(y * collision.width + x);
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]] as const) {
      const nx = x + dx, ny = y + dy, key = ny * collision.width + nx;
      if (nx < minX || nx > maxX || ny < minY || ny > maxY || seen.has(key)) continue;
      const local = { ...collision, obstacles: [...new Set([...(buckets.get(y * collision.width + x) ?? []), ...(buckets.get(key) ?? [])])] };
      if (!edge(at(x, y), at(nx, ny), local)) continue;
      seen.add(key); queue.push([nx, ny]);
    }
  }
  return targets.size === 0;
}
