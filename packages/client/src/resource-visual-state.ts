import { treeGrowthStageName, type ResourceContentDefinition } from '@orchard/sim';
import type { AuthoredResourceVisualState } from '@orchard/engine/overworld-art';

/** Choose the standing tree artwork from replicated harvest state, never local actions. */
export function resourceVisualState(
  resource: { readonly growthStage: number; readonly depleted: boolean; readonly fruitReadyAtTick?: bigint },
  definition: ResourceContentDefinition,
  authorityTick: bigint,
): AuthoredResourceVisualState {
  const stage = treeGrowthStageName(resource.growthStage);
  if (resource.depleted) return stage === 'small' ? 'depleted_small'
    : stage === 'medium' ? 'depleted_medium' : 'depleted';
  if (stage !== 'big') return stage;
  return definition.visual.kind === 'tree' && definition.fruitHarvest !== undefined
    && (resource.fruitReadyAtTick ?? 0n) > authorityTick ? 'fruitless' : 'mature';
}
