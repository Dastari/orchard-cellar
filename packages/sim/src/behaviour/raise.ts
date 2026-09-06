import type { LifecycleEvent } from './events.js';
import {
  MAX_EFFECTS_PER_HANDLER_RESULT,
  blockedResult,
  effectsResult,
  isBlockedHandlerResult,
  type HandlerResult,
} from './handler.js';
import {
  resolveHandlers,
  type BehaviourHandlerRegistry,
} from './registry.js';
import type { ReadOnlySnapshot } from './snapshot.js';

export const EFFECT_CAP_EXCEEDED_BLOCK = 'behaviour_effect_cap_exceeded' as const;

/**
 * Runs matching handlers purely and deterministically. A successful handler
 * wins unless it explicitly continues; continued effects remain in order.
 */
export function raiseEvent(
  registry: BehaviourHandlerRegistry,
  event: LifecycleEvent,
  view: ReadOnlySnapshot,
): HandlerResult {
  const effects = [];
  for (const resolved of resolveHandlers(registry, event, view)) {
    const result = resolved.handler(event, view);
    if (isBlockedHandlerResult(result)) return result;
    if (result.effects.length > MAX_EFFECTS_PER_HANDLER_RESULT
      || effects.length + result.effects.length > MAX_EFFECTS_PER_HANDLER_RESULT) {
      return blockedResult(EFFECT_CAP_EXCEEDED_BLOCK);
    }
    effects.push(...result.effects);
    if (result.continue !== true) return effectsResult(effects);
  }
  return effectsResult(effects);
}
