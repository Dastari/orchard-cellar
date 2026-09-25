import {
  combatSegmentObstructed, playerInteractionOrigin, runtimeResourceDefinition, runtimeResourceTargetVector,
  runtimeResourceToolAllowed, runtimeToolCanMineResource, runtimeToolDefinition, toolSwingContains, TILE_SIZE_FIXED,
  type CollisionMap, type ContentRegistry, type Direction, type Vec2Fixed,
} from '@orchard/sim';

export interface MiningFeedbackResource {
  readonly id: bigint;
  readonly kind: string;
  readonly definitionId?: string;
  readonly tileX: number;
  readonly tileY: number;
  readonly depleted: boolean;
  readonly health: number;
  readonly yieldProgress: number;
}

/** Ticks a glancing strike's sparks stay on screen. */
export const MINING_GLANCE_TICKS = 12;

function mineNode(registry: ContentRegistry, resource: MiningFeedbackResource): boolean {
  return runtimeResourceDefinition(registry, resource)?.interaction.mode === 'mine';
}

/** The same two gates the server applies: the authored tier and the tool's own permission list. */
export function toolCanMine(registry: ContentRegistry, itemKind: string, resource: MiningFeedbackResource): boolean {
  return runtimeResourceToolAllowed(registry, resource, runtimeToolDefinition(registry, itemKind))
    && runtimeToolCanMineResource(registry, itemKind, resource.kind);
}

function elevationAt(collision: CollisionMap, x: number, y: number): number {
  const tileX = Math.floor(x / TILE_SIZE_FIXED), tileY = Math.floor(y / TILE_SIZE_FIXED);
  if (tileX < 0 || tileY < 0 || tileX >= collision.width || tileY >= collision.height) return -32768;
  return collision.elevations?.[tileY * collision.width + tileX] ?? 0;
}

/** Mine nodes a swing glances off: it met veins the held tool can't work and landed no mining hit.
 * Mirrors the server's contact test: the actor-anchored sector at the reach point, then the same
 * elevation and terrain line-of-sight checks from the feet to the interaction contact point. */
export function glancingSwingNodes<R extends MiningFeedbackResource>(
  registry: ContentRegistry, itemKind: string, position: Vec2Fixed, facing: Direction, resources: readonly R[],
  collision?: CollisionMap,
): readonly R[] {
  const swing = runtimeToolDefinition(registry, itemKind)?.swing;
  if (swing === undefined) return [];
  const origin = playerInteractionOrigin(position), terrain = collision === undefined ? undefined : { ...collision, obstacles: [] };
  const struck = resources.filter((resource) => {
    if (resource.depleted || !mineNode(registry, resource)) return false;
    const vector = runtimeResourceTargetVector(registry, resource, position.x, position.y, resource.tileX, resource.tileY);
    if (vector === null || !toolSwingContains(position, facing, { x: position.x + vector.x, y: position.y + vector.y }, swing)) return false;
    if (terrain === undefined) return true;
    const point = { x: origin.x + vector.x, y: origin.y + vector.y };
    return elevationAt(terrain, position.x, position.y) === elevationAt(terrain, point.x, point.y)
      && !combatSegmentObstructed(position, point, terrain);
  });
  if (struck.some((resource) => toolCanMine(registry, itemKind, resource))) return [];
  return struck.filter((resource) => !toolCanMine(registry, itemKind, resource));
}

/** A strike that advanced mining work but did not pay out yet; payouts already show as a richness drop. */
export function miningWorkAdvanced(previousYieldProgress: number, next: MiningFeedbackResource): boolean {
  return !next.depleted && next.yieldProgress > previousYieldProgress;
}

/** Hover-card line naming the first pickaxe able to work this node, or null when there is nothing to say:
 * the held tool can mine it, or the player isn't holding a pickaxe and the node needs only the starter tier. */
// Hover cards ask every frame; the answer only changes with the content registry, node and held item.
const neededCache = new WeakMap<ContentRegistry, Map<string, string | null>>();
export function miningToolNeeded(
  registry: ContentRegistry, resource: MiningFeedbackResource, heldItemKind: string | null,
): string | null {
  let cache = neededCache.get(registry);
  if (cache === undefined) { cache = new Map(); neededCache.set(registry, cache); }
  const key = `${resource.definitionId ?? ''}|${resource.kind}|${heldItemKind ?? ''}`;
  if (!cache.has(key)) cache.set(key, resolveMiningToolNeeded(registry, resource, heldItemKind));
  return cache.get(key)!;
}

function resolveMiningToolNeeded(
  registry: ContentRegistry, resource: MiningFeedbackResource, heldItemKind: string | null,
): string | null {
  const requirement = runtimeResourceDefinition(registry, resource)?.interaction;
  if (requirement?.mode !== 'mine' || requirement.tool === undefined) return null;
  if (heldItemKind !== null && toolCanMine(registry, heldItemKind, resource)) return null;
  const holdingPickaxe = heldItemKind !== null
    && runtimeToolDefinition(registry, heldItemKind)?.specialization === requirement.tool.specialization;
  if (!holdingPickaxe && requirement.tool.minimumTier <= 1) return null;
  const candidates = [...registry.items.values()].flatMap((item) => {
    const kind = item.id.replace(/^item:/, '');
    const tool = runtimeToolDefinition(registry, kind);
    return item.retired !== true && tool !== null && toolCanMine(registry, kind, resource)
      ? [{ name: item.displayName, tier: tool.tier }] : [];
  }).sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name));
  return candidates[0] === undefined ? null : `NEEDS ${candidates[0].name.toUpperCase()}`;
}
