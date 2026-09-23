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
  readonly compatibility: 'legacy_policy' | 'legacy_actor' | 'shadow' | 'active';
}
/** Immutable geometry and channels are cache identities; bounded ability variants
 * avoid rebuilding a whole terrain plane on each prediction frame. */
const projectionCache = new WeakMap<CollisionMap, Map<string, {
  readonly channels: MediumCollisionChannels;
  readonly policy: WorldRulesContentDefinition;
  readonly result: RuntimeTraversalProjection;
}>>();
export function runtimeTraversalProjection(
  registry: ContentRegistry,
  legacy: CollisionMap,
  channels: MediumCollisionChannels,
  actor: RuntimeTraversalActor,
  tick: bigint,
): RuntimeTraversalProjection {
  const policy = runtimeTraversalPolicy(registry);
  if (policy === null) return { collision: legacy, candidate: null, differences: [], compatibility: 'legacy_policy' };
  const abilities = runtimeTraversalAbilities(registry, policy, actor, tick);
  if (abilities === null) return { collision: legacy, candidate: null, differences: [], compatibility: 'legacy_actor' };
  const key = JSON.stringify([...abilities].sort());
  const cache = projectionCache.get(legacy) ?? new Map();
  projectionCache.set(legacy, cache);
  const cached = cache.get(key);
  if (cached?.channels === channels && cached.policy === policy) return cached.result;
  const candidate = mediumTraversalCollision(legacy, channels, abilities, policy.media);
  const result: RuntimeTraversalProjection = {
    collision: policy.mode === 'active' ? candidate : legacy,
    candidate,
    differences: compareTraversalCollision(legacy, candidate),
    compatibility: policy.mode,
  };
  if (cache.size >= 32) cache.delete(cache.keys().next().value!);
  cache.set(key, { channels, policy, result });
  return result;
}
