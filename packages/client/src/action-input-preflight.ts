import { tileToolTargetInReach } from '@orchard/sim';
import type { RuntimeToolDefinition, TileTarget } from '@orchard/sim';

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
): boolean {
  const learned = new Set([...ranks].filter(({ rank }) => rank > 0).map(({ nodeId }) => nodeId));
  if (!mounted) return learned.has('surefooted') || learned.has('cliff_climber');
  if (mount?.adapter !== 'horse') return false;
  return mount.jumpSkill === undefined || learned.has(mount.jumpSkill);
}
