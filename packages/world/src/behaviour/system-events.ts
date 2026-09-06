import {
  isBlockedHandlerResult,
  raiseEvent,
  type BehaviourHandlerRegistry,
  type Effect,
  type LifecycleEvent,
  type ReadOnlySnapshot,
} from '@orchard/sim';

import {
  applyBehaviourEffects,
  createBehaviourEffectWriter,
  rejectingBehaviourEffectAdapters,
  type BehaviourErrorFactory,
} from './applier.js';

/** System-owned movement and expiry reducers cannot safely impersonate the
 * player whose row they settle. Until effect adapters accept an explicit actor
 * identity, these hooks permit presentation effects only and fail closed on
 * every durable opcode before the caller performs its engine-owned mutation. */
export function raiseSystemLifecycleEvent(
  registry: BehaviourHandlerRegistry,
  event: LifecycleEvent,
  snapshot: ReadOnlySnapshot,
  error: BehaviourErrorFactory = (message) => new Error(message),
): readonly Effect[] {
  const result = raiseEvent(registry, event, snapshot);
  if (isBlockedHandlerResult(result)) throw error(result.blocked);
  applyBehaviourEffects(result.effects, createBehaviourEffectWriter({
    ...rejectingBehaviourEffectAdapters((kind) => {
      throw error(`system_lifecycle_effect_unavailable:${kind}`);
    }),
    sfx: () => undefined,
    animation: () => undefined,
  }), error);
  return result.effects;
}
