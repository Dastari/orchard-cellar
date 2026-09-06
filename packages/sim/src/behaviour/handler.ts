import type { InteractionVerb, LifecycleEvent } from './events.js';
import {
  conditionSupportedByEngine,
  effectSupportedByEngine,
  type Condition,
  type Effect,
  type ItemMatch,
} from './effects.js';
import type { ReadOnlySnapshot } from './snapshot.js';

/** Hard contract shared by validation and the authority effect applier. */
export const MAX_EFFECTS_PER_HANDLER_RESULT = 64 as const;

export interface InteractionDefinition {
  readonly id: string;
  readonly verb: InteractionVerb;
  readonly with?: ItemMatch;
  readonly prompt?: string | Readonly<Record<string, string>>;
  readonly conditions: readonly Condition[];
  readonly effects: readonly Effect[];
  readonly cooldownTicks?: number;
  readonly priority?: number;
}

export interface HandlerEffectsResult {
  readonly effects: readonly Effect[];
  readonly continue?: boolean;
}

export interface HandlerBlockedResult {
  readonly blocked: string;
}

export type HandlerResult = HandlerEffectsResult | HandlerBlockedResult;

export type Handler<TEvent extends LifecycleEvent = LifecycleEvent> = (
  event: TEvent,
  view: ReadOnlySnapshot,
) => HandlerResult;

export function effectsResult(
  effects: readonly Effect[],
  options: { readonly continue?: boolean } = {},
): HandlerEffectsResult {
  return options.continue === undefined
    ? { effects }
    : { effects, continue: options.continue };
}

export function blockedResult(message: string): HandlerBlockedResult {
  return { blocked: message };
}

export function isBlockedHandlerResult(result: HandlerResult): result is HandlerBlockedResult {
  return 'blocked' in result;
}

export function handlerResultWithinEffectCap(result: HandlerResult): boolean {
  return isBlockedHandlerResult(result) || result.effects.length <= MAX_EFFECTS_PER_HANDLER_RESULT;
}

export function interactionSupportedByEngine(
  interaction: InteractionDefinition,
  engineVersion: number,
): boolean {
  return interaction.conditions.every((condition) => conditionSupportedByEngine(condition, engineVersion))
    && interaction.effects.every((effect) => effectSupportedByEngine(effect, engineVersion));
}
