import type { ContentRegistry } from './content/registry.js';
import { runtimeResourceDefinition } from './content/runtime.js';
import { normalizeTreeGrowthStage } from './tree-regrowth.js';
import { ITEM_PICKUP_REACH_FIXED } from './tile-targeting.js';
import { TILE_SIZE_FIXED } from './state.js';

export interface OrchardHarvestResource {
  readonly kind: string;
  readonly definitionId?: string;
  readonly tileX: number;
  readonly tileY: number;
  readonly depleted: boolean;
  readonly health: number;
  readonly growthStage: number;
  /** Optional for pre-migration snapshots and older clients. */
  readonly fruitReadyAtTick?: bigint;
}

export function orchardFruitStatus(resource: OrchardHarvestResource, authorityTick: bigint):
  'depleted' | 'tree_immature' | 'fruit_ripening' | 'ok' {
  if (resource.depleted || resource.health <= 0) return 'depleted';
  if (normalizeTreeGrowthStage(resource.growthStage) !== 3) return 'tree_immature';
  return (resource.fruitReadyAtTick ?? 0n) > authorityTick ? 'fruit_ripening' : 'ok';
}

export function orchardHarvestResult(
  registry: ContentRegistry, resource: OrchardHarvestResource,
  playerX: number, playerY: number, authorityTick: bigint,
): ReturnType<typeof orchardFruitStatus> | 'not_gatherable' | 'out_of_range' {
  if (runtimeResourceDefinition(registry, resource)?.fruitHarvest === undefined) return 'not_gatherable';
  const status = orchardFruitStatus(resource, authorityTick);
  if (status !== 'ok') return status;
  const dx = resource.tileX * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2 - playerX;
  const dy = resource.tileY * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2 - playerY;
  return dx * dx + dy * dy <= ITEM_PICKUP_REACH_FIXED ** 2 ? 'ok' : 'out_of_range';
}
