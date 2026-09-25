import { bootstrapContentRegistry } from '@orchard/sim/content/bootstrap-registry';
import { runtimeSkillCapabilities, runtimeSkillNodeRank } from '@orchard/sim/skill-effects';
import { tileToolTargetInReach } from '@orchard/sim/tile-targeting';
import type { ContentRegistry, RuntimeToolDefinition, TileTarget } from '@orchard/sim';

/** Presentation-only preflight. Authoritative lifecycle callbacks still own
 * target validation, effects, costs and timing after a request is sent. */
export function tileToolInputOutOfReach(
  tool: RuntimeToolDefinition | null,
  position: { readonly x: number; readonly y: number } | null,
  target: TileTarget | null,
  authoritativePosition?: { readonly x: number; readonly y: number } | null,
): boolean {
  if (tool === null || position === null || target === null) return false;
  return !tileToolTargetInReach(tool, position, target)
    || (authoritativePosition != null && !tileToolTargetInReach(tool, authoritativePosition, target));
}

export function jumpInputSkillAvailable(
  ranks: Iterable<{ readonly nodeId: string; readonly rank: number }>,
  mount: { readonly adapter: string; readonly jumpSkill?: string } | null,
  mounted: boolean,
  registry: ContentRegistry = bootstrapContentRegistry(),
): boolean {
  const ownedRanks = Object.fromEntries([...ranks].map(({ nodeId, rank }) => [nodeId, rank]));
  if (!mounted) {
    const capabilities = runtimeSkillCapabilities(registry, ownedRanks);
    return capabilities.maximumFootGapTiles > 0 || capabilities.maximumFootCliffLevels > 0;
  }
  if (mount?.adapter !== 'horse') return false;
  return mount.jumpSkill === undefined || runtimeSkillNodeRank(registry, ownedRanks, mount.jumpSkill) > 0;
}
