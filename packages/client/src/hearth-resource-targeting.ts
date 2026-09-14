import { activeHearthResourceSites, runtimeHearthResourceSite, runtimeHearthResourceRowMatchesSite,
  runtimeHearthResourceDefinition, hearthResourceGeometryAllows, type CollisionMap,
  isAuthoredHearthResourceSiteId, type CollisionObstacle, type CombatRegionPolicy,
  type ContentRegistry } from '@orchard/sim';
type Resource = Parameters<typeof runtimeHearthResourceRowMatchesSite>[1] & {
  readonly growthStage: number; readonly depleted: boolean;
};
/** Visible client geometry only. Private camp conflicts and claims remain
 * authoritative and can still reject a request after a valid local preview. */
export function hearthResourceTargetAllowed(resource: Resource,
  position: { readonly x: number; readonly y: number }, spaceId: number,
  collision: CollisionMap, resourceObstacles: ReadonlyMap<bigint, CollisionObstacle>,
  mineableResources: readonly string[] | undefined, policy: CombatRegionPolicy,
  gatheringContentReady: boolean, registry: ContentRegistry): boolean {
  const site = runtimeHearthResourceSite(registry, resource.id);
  const fixedDefinition = runtimeHearthResourceDefinition(registry, resource);
  if (site === null && !isAuthoredHearthResourceSiteId(registry, resource.id) && fixedDefinition === null
    && !activeHearthResourceSites(registry).some((candidate) => candidate.kind === resource.kind)) return true;
  if (!gatheringContentReady || !runtimeHearthResourceRowMatchesSite(registry, resource)
    || resource.spaceId !== spaceId || resource.depleted
    || (site?.maturityGrowthStage !== null && site?.maturityGrowthStage !== undefined
      ? resource.growthStage !== site.maturityGrowthStage
      : !mineableResources?.includes(resource.kind))) return false;
  if (!policy.allowsHostileDamage({ spaceId, tileX: resource.tileX + .5, tileY: resource.tileY + .5 })) return false;
  const own = resourceObstacles.get(resource.id);
  // Fail closed while resource data and the collision snapshot are out of sync.
  if (own === undefined || !collision.obstacles?.includes(own)) return false;
  const remaining = collision.obstacles.filter((obstacle) => obstacle !== own);
  if (remaining.some((obstacle) => obstacle.left === own.left && obstacle.right === own.right
    && obstacle.top === own.top && obstacle.bottom === own.bottom)) return false;
  return hearthResourceGeometryAllows(position, resource.id,
    { ...collision, obstacles: remaining }, registry);
}
