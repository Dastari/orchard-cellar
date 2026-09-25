import { compareTraversalCollision, mediumTraversalCollision, resolveTraversalAbilities,
  type MediumCollisionChannels, type TraversalShadowDifference } from '../traversal.js';
import type { CollisionMap } from '../state.js';
import { runtimeNpcMount, type NpcContentReference } from './npc-runtime.js';
import type { ContentRegistry } from './registry.js';
import type { WorldRulesContentDefinition } from './world-rules-definition.js';

/** Unique semantic ownership, independent of a particular definition id. */
export function runtimeTraversalPolicy(registry: ContentRegistry): WorldRulesContentDefinition | null {
  const policies = [...registry.worldRules.values()].filter(row => row.retired !== true && row.profile === 'traversal');
  if (policies.length > 1) throw new Error('ambiguous_traversal_policy');
  return policies[0] ?? null;
}
export interface RuntimeTraversalEffect {
  readonly effectKind: string;
  readonly expiresTick: bigint;
}
export type RuntimeTraversalActor =
  | { readonly kind: 'player'; readonly mount?: NpcContentReference | null; readonly effects?: readonly RuntimeTraversalEffect[] }
  | { readonly kind: 'projectile' }
  | { readonly kind: 'placement'; readonly medium: 'ground' | 'water' }
  | { readonly kind: 'definition'; readonly definitionId: string };

/** null denotes a legacy definition that has not yet been backfilled, while an
 * explicitly empty grant set is authoritative and must never fall back. */
export function runtimeTraversalAbilities(
  registry: ContentRegistry,
  policy: WorldRulesContentDefinition,
  actor: RuntimeTraversalActor,
  tick: bigint,
): ReadonlySet<string> | null {
  if (actor.kind === 'projectile') return new Set(policy.projectileAbilities);
  if (actor.kind === 'placement') return new Set(actor.medium === 'water' ? policy.boatPlacementAbilities : policy.placementAbilities);
  if (actor.kind === 'definition') {
    const definition = registry.definitions.get(actor.definitionId);
    if (definition === undefined || definition.retired === true || !('traversalAbilities' in definition)
      || definition.traversalAbilities === undefined) return null;
    return new Set(definition.traversalAbilities);
  }
  const mount = actor.mount == null ? null : runtimeNpcMount(registry, actor.mount);
  if (actor.mount != null && (mount === null || mount.traversalAbilities === undefined || mount.replacesAbilities === undefined)) return null;
  const effects = (actor.effects ?? []).filter(effect => effect.expiresTick > tick).flatMap(effect => {
    const definition = registry.effects.get(effect.effectKind.startsWith('effect:') ? effect.effectKind : `effect:${effect.effectKind}`);
    if (definition === undefined || definition.retired === true || definition.traversalAbilities === undefined) return [];
    // bigint lifetime comparison above avoids lossy authority tick conversion.
    return [{ traversalAbilities: definition.traversalAbilities, expiresAtTick: 1 }];
  });
  return resolveTraversalAbilities({ traversalAbilities: policy.playerAbilities }, mount === null ? null : {
    traversalAbilities: mount.traversalAbilities!, replacesAbilities: mount.replacesAbilities!,
  }, effects, 0);
}

export interface RuntimeTraversalProjection {
  readonly collision: CollisionMap;
  readonly candidate: CollisionMap | null;
  readonly differences: readonly TraversalShadowDifference[];
  readonly compatibility: 'legacy_policy' | 'legacy_actor' | 'legacy_channels' | 'shadow' | 'active';
}
/** Immutable geometry and channels are cache identities; bounded ability variants
 * avoid rebuilding a whole terrain plane on each prediction frame. */
const admissionCache = new WeakMap<MediumCollisionChannels, { readonly policy: WorldRulesContentDefinition; readonly variants: Map<string, Uint8Array> }>();
const differenceCache = new WeakMap<Uint8Array, WeakMap<Uint8Array, readonly TraversalShadowDifference[]>>();
const projectionCache = new WeakMap<CollisionMap, Map<string, {
  readonly channels: MediumCollisionChannels;
  readonly policy: WorldRulesContentDefinition;
  readonly geometry: CollisionMap;
  readonly result: RuntimeTraversalProjection;
}>>();
export function runtimeTraversalProjection(
  registry: ContentRegistry,
  legacy: CollisionMap,
  channels: MediumCollisionChannels | undefined,
  actor: RuntimeTraversalActor,
  tick: bigint,
  geometry: CollisionMap = legacy,
): RuntimeTraversalProjection {
  const policy = runtimeTraversalPolicy(registry);
  if (policy === null) return { collision: legacy, candidate: null, differences: [], compatibility: 'legacy_policy' };
  if (channels === undefined) return { collision: legacy, candidate: null, differences: [], compatibility: 'legacy_channels' };
  const abilities = runtimeTraversalAbilities(registry, policy, actor, tick);
  if (abilities === null) return { collision: legacy, candidate: null, differences: [], compatibility: 'legacy_actor' };
  const key = JSON.stringify([...abilities].sort());
  const cache = projectionCache.get(legacy) ?? new Map();
  projectionCache.set(legacy, cache);
  const cached = cache.get(key);
  if (cached?.channels === channels && cached.policy === policy && cached.geometry === geometry) return cached.result;
  let admissions = admissionCache.get(channels);
  if (admissions?.policy !== policy) { admissions = { policy, variants: new Map() }; admissionCache.set(channels, admissions); }
  let blocked = admissions.variants.get(key);
  if (blocked === undefined) {
    blocked = mediumTraversalCollision(geometry, channels, abilities, policy.media).blocked;
    if (admissions.variants.size >= 8) admissions.variants.delete(admissions.variants.keys().next().value!);
    admissions.variants.set(key, blocked);
  }
  const candidate: CollisionMap = { ...geometry, blocked, traversalChannels: channels,
    ...(geometry === legacy ? {} : { obstacles: [...new Set([...(geometry.obstacles ?? []), ...(legacy.obstacles ?? [])])] }),
  };
  let differences = differenceCache.get(legacy.blocked);
  if (differences === undefined) { differences = new WeakMap(); differenceCache.set(legacy.blocked, differences); }
  const byCandidate = differences, candidateBlocked = blocked;
  // compareTraversalCollision's own size check, kept eager so a mismatch still throws here.
  if (legacy.width !== candidate.width || legacy.height !== candidate.height) throw new RangeError('traversal_collision_size_mismatch');
  const result: RuntimeTraversalProjection = {
    collision: policy.mode === 'active' ? candidate : legacy,
    candidate,
    // Evidence only (shadow diagnostics): the same comparison and cache as before,
    // made on first read instead of on every collision rebuild (static world S4f).
    get differences(): readonly TraversalShadowDifference[] {
      let compared = byCandidate.get(candidateBlocked);
      if (compared === undefined) { compared = compareTraversalCollision(legacy, candidate); byCandidate.set(candidateBlocked, compared); }
      return compared;
    },
    compatibility: policy.mode,
  };
  if (cache.size >= 8) cache.delete(cache.keys().next().value!);
  cache.set(key, { channels, policy, geometry, result });
  return result;
}

/** Shared entrypoint for movement, AI, placement and projectiles. */
export function runtimeActorCollision(registry: ContentRegistry, legacy: CollisionMap, actor: RuntimeTraversalActor, tick: bigint, geometry: CollisionMap = legacy): CollisionMap {
  return runtimeTraversalProjection(registry, legacy, geometry.traversalChannels ?? legacy.traversalChannels, actor, tick, geometry).collision;
}

const solidGeometryCache = new WeakMap<CollisionMap, WeakMap<CollisionMap, CollisionMap>>();
/** Media never erase solid footprints previously projected on either legacy plane. */
export function traversalSolidGeometry(ground: CollisionMap, water: CollisionMap): CollisionMap {
  if (ground.width !== water.width || ground.height !== water.height) throw new RangeError('traversal_collision_size_mismatch');
  if (ground === water) return ground;
  let byWater = solidGeometryCache.get(ground);
  if (byWater === undefined) { byWater = new WeakMap(); solidGeometryCache.set(ground, byWater); }
  let result = byWater.get(water);
  if (result === undefined) { result = { ...ground, obstacles: [...new Set([...(ground.obstacles ?? []), ...(water.obstacles ?? [])])] }; byWater.set(water, result); }
  return result;
}
