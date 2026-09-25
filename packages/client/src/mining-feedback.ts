import {
  runtimeResourceDefinition, runtimeResourceTargetVector, runtimeResourceToolAllowed, runtimeToolCanMineResource,
  runtimeToolDefinition, toolSwingContains, type ContentRegistry, type Direction, type Vec2Fixed,
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

/** Mine nodes inside the swing's sector that the held tool can't work, so the blow glances off them.
 * Mirrors the server's sector test (actor-anchored, reach point at the resource's contact vector). */
export function glancingSwingNodes<R extends MiningFeedbackResource>(
  registry: ContentRegistry, itemKind: string, position: Vec2Fixed, facing: Direction, resources: readonly R[],
): readonly R[] {
  const swing = runtimeToolDefinition(registry, itemKind)?.swing;
  if (swing === undefined) return [];
  return resources.filter((resource) => {
    if (resource.depleted || !mineNode(registry, resource) || toolCanMine(registry, itemKind, resource)) return false;
    const vector = runtimeResourceTargetVector(registry, resource, position.x, position.y, resource.tileX, resource.tileY);
    return vector !== null && toolSwingContains(position, facing, { x: position.x + vector.x, y: position.y + vector.y }, swing);
  });
}

/** A strike that advanced mining work but did not pay out yet; payouts already show as a richness drop. */
export function miningWorkAdvanced(previousYieldProgress: number, next: MiningFeedbackResource): boolean {
  return !next.depleted && next.yieldProgress > previousYieldProgress;
}

/** Hover-card line naming the first pickaxe able to work this node, or null when there is nothing to say:
 * the held tool can mine it, or the player isn't holding a pickaxe and the node needs only the starter tier. */
export function miningToolNeeded(
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
