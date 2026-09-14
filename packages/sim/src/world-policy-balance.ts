import balanceJson from '../../assets/content/balance.json' with { type: 'json' };
import type {
  WorldPolicyBalanceContentDefinition,
  WorldPolicyBalanceTuple,
} from './content/balance-definition.js';
import type { ContentRegistry } from './content/registry.js';

export interface WorldPolicyBalanceProfile {
  readonly fiberTillDropPercent: number;
  readonly craftingStationReachTiles: number;
  readonly itemDespawnTicks: number;
  readonly survivalSpawnSearchRadiusTiles: number;
  readonly proceduralWorldChunkTiles: number;
  readonly proceduralWorldExtentTiles: number;
  readonly proceduralSpawnPregenRadiusChunks: number;
  readonly proceduralGenerationLookaheadChunks: number;
  readonly survivalTerrainMaxElevation: number;
  readonly survivalTerrainContourInsetTiles: number;
  readonly survivalTerrainMinimumSummitTiles: number;
}

export function worldPolicyBalanceFromTuple(
  values: WorldPolicyBalanceTuple,
): WorldPolicyBalanceProfile {
  return Object.freeze({
    fiberTillDropPercent: values[0], craftingStationReachTiles: values[1],
    itemDespawnTicks: values[2], survivalSpawnSearchRadiusTiles: values[3],
    proceduralWorldChunkTiles: values[4], proceduralWorldExtentTiles: values[5],
    proceduralSpawnPregenRadiusChunks: values[6], proceduralGenerationLookaheadChunks: values[7],
    survivalTerrainMaxElevation: values[8], survivalTerrainContourInsetTiles: values[9],
    survivalTerrainMinimumSummitTiles: values[10],
  });
}

export function runtimeWorldPolicyBalance(
  registry: Pick<ContentRegistry, 'balances'>,
): WorldPolicyBalanceProfile | null {
  const matches = [...registry.balances.values()].filter(
    (definition): definition is WorldPolicyBalanceContentDefinition => (
      definition.retired !== true && 'profile' in definition && definition.profile === 'world_policy'
    ),
  );
  return matches.length === 1 ? worldPolicyBalanceFromTuple(matches[0]!.values) : null;
}

function bootstrapDefinition(): WorldPolicyBalanceContentDefinition {
  const matches = (balanceJson as readonly Record<string, unknown>[]).filter((definition) => (
    definition.profile === 'world_policy' && definition.retired !== true
  ));
  if (matches.length !== 1) throw new Error('bootstrap_world_policy_balance_unavailable');
  const definition = matches[0]!;
  const values = definition.values;
  if (!Array.isArray(values) || values.length !== 11
    || values.some((value) => !Number.isSafeInteger(value) || Number(value) <= 0)) {
    throw new Error('bootstrap_world_policy_balance_invalid');
  }
  return definition as unknown as WorldPolicyBalanceContentDefinition;
}

/** Explicit compatibility for deterministic generators and isolated tooling. */
export const BOOTSTRAP_WORLD_POLICY_BALANCE = worldPolicyBalanceFromTuple(
  bootstrapDefinition().values,
);

export const FIBER_TILL_DROP_PERCENT = BOOTSTRAP_WORLD_POLICY_BALANCE.fiberTillDropPercent;
export const CRAFTING_STATION_REACH_TILES = BOOTSTRAP_WORLD_POLICY_BALANCE.craftingStationReachTiles;
export const ITEM_DESPAWN_TICKS = BOOTSTRAP_WORLD_POLICY_BALANCE.itemDespawnTicks;
export const SURVIVAL_SPAWN_SEARCH_RADIUS_TILES = BOOTSTRAP_WORLD_POLICY_BALANCE.survivalSpawnSearchRadiusTiles;
export const PROCEDURAL_WORLD_CHUNK_TILES = BOOTSTRAP_WORLD_POLICY_BALANCE.proceduralWorldChunkTiles;
export const PROCEDURAL_WORLD_EXTENT_TILES = BOOTSTRAP_WORLD_POLICY_BALANCE.proceduralWorldExtentTiles;
export const PROCEDURAL_SPAWN_PREGEN_RADIUS_CHUNKS = BOOTSTRAP_WORLD_POLICY_BALANCE.proceduralSpawnPregenRadiusChunks;
export const PROCEDURAL_GENERATION_LOOKAHEAD_CHUNKS = BOOTSTRAP_WORLD_POLICY_BALANCE.proceduralGenerationLookaheadChunks;
export const SURVIVAL_TERRAIN_MAX_ELEVATION = BOOTSTRAP_WORLD_POLICY_BALANCE.survivalTerrainMaxElevation;
export const SURVIVAL_TERRAIN_CONTOUR_INSET_TILES = BOOTSTRAP_WORLD_POLICY_BALANCE.survivalTerrainContourInsetTiles;
export const SURVIVAL_TERRAIN_MINIMUM_SUMMIT_TILES = BOOTSTRAP_WORLD_POLICY_BALANCE.survivalTerrainMinimumSummitTiles;
