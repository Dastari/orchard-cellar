import { AUTHORITY_HZ } from './net-timing.js';
import { bootstrapContentRegistry } from './content/bootstrap-registry.js';
import type { ContentRegistry } from './content/registry.js';
import { runtimeHearthResourceSite } from './hearth-resource-sites.js';
export const HEARTH_RESOURCE_COOLDOWN_TICKS = BigInt(10 * 60 * AUTHORITY_HZ);
export const HEARTH_RESOURCE_QUIET_TICKS = BigInt(30 * AUTHORITY_HZ);
export const HEARTH_RESOURCE_OBSERVATION_TICKS = BigInt(AUTHORITY_HZ);
const U64_MAX = (1n << 64n) - 1n;
const U32_MAX = 0xffff_ffff;
export interface HearthResourceDepletion {
  readonly resourceId: bigint;
  readonly activationOrdinal: number;
  readonly depletedAtTick: bigint;
  readonly lastObservedTick: bigint;
  readonly quietSinceTick: bigint | null;
}
export function beginHearthResourceDepletion(resourceId: bigint, activationOrdinal: number, tick: bigint,
  registry: ContentRegistry = bootstrapContentRegistry()): HearthResourceDepletion {
  if (!runtimeHearthResourceSite(registry, resourceId) || !Number.isSafeInteger(activationOrdinal)
    || activationOrdinal < 0 || activationOrdinal > U32_MAX || tick < 0n || tick > U64_MAX) throw new Error('hearth_depletion_invalid');
  return { resourceId, activationOrdinal, depletedAtTick: tick, lastObservedTick: tick, quietSinceTick: null };
}
/** Pure precommit plan. The caller loads the current resource and depletion row
 * in one transaction, and commits the new ordinal/refill plus tracker removal
 * atomically. No rewards are emitted by replenishment. */
export function planHearthResourceRespawn(state: HearthResourceDepletion, observation: {
  readonly tick: bigint; readonly activationOrdinal: number; readonly depleted: boolean;
  readonly siteEnabled: boolean; readonly playerInSight: boolean;
  readonly encounterEngaged: boolean; readonly footprintClear: boolean;
  /** False after a restart or an elapsed-wall-time observation gap, even if authority ticks resume contiguously. */
  readonly continuousObservation: boolean;
}, registry: ContentRegistry = bootstrapContentRegistry()) {
  const no = () => ({ state, respawn: false as const });
  if (!runtimeHearthResourceSite(registry, state.resourceId) || observation.activationOrdinal !== state.activationOrdinal
    || !observation.depleted || observation.tick <= state.lastObservedTick || observation.tick > U64_MAX
    || state.depletedAtTick < 0n || state.depletedAtTick > state.lastObservedTick
    || !Number.isSafeInteger(state.activationOrdinal) || state.activationOrdinal < 0 || state.activationOrdinal >= U32_MAX
    || (state.quietSinceTick !== null && (state.quietSinceTick < state.depletedAtTick || state.quietSinceTick > state.lastObservedTick))) return no();
  const uninterrupted = observation.continuousObservation
    && observation.tick - state.lastObservedTick <= HEARTH_RESOURCE_OBSERVATION_TICKS;
  const quiet = observation.siteEnabled && !observation.playerInSight && !observation.encounterEngaged && observation.footprintClear;
  const next: HearthResourceDepletion = { ...state, lastObservedTick: observation.tick,
    quietSinceTick: quiet ? uninterrupted && state.quietSinceTick !== null ? state.quietSinceTick : observation.tick : null };
  const respawn = next.quietSinceTick !== null
    && observation.tick - state.depletedAtTick >= HEARTH_RESOURCE_COOLDOWN_TICKS
    && observation.tick - next.quietSinceTick >= HEARTH_RESOURCE_QUIET_TICKS;
  return respawn ? { state: next, respawn: true as const, nextActivationOrdinal: state.activationOrdinal + 1 }
    : { state: next, respawn: false as const };
}
