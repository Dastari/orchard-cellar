import {
  isBlockedHandlerResult,
  raiseEvent,
  type BehaviourHandlerRegistry,
  type BehaviourObjectSnapshot,
  type Effect,
  type ObjectRef,
  type ReadOnlySnapshot,
} from '@orchard/sim';

import type { WorldReducerContext } from '../index.js';

export const MAX_ENTITY_TIMER_ID_LENGTH = 96 as const;

export interface EntityTimerMessage {
  readonly entityId: bigint;
  readonly timerId: string;
  readonly expectedTick: bigint;
}

export interface EntityTimerAuthority {
  readonly reject: (message: string) => never;
  readonly currentTick: (ctx: WorldReducerContext) => bigint;
  readonly reschedule: (
    ctx: WorldReducerContext,
    message: EntityTimerMessage,
    currentTick: bigint,
  ) => void;
  readonly resolveObject: (
    ctx: WorldReducerContext,
    entityId: bigint,
  ) => { readonly ref: ObjectRef; readonly snapshot: BehaviourObjectSnapshot } | null;
  readonly snapshot: (
    ctx: WorldReducerContext,
    target: BehaviourObjectSnapshot,
  ) => ReadOnlySnapshot;
  /** Scheduled events resolve against the current durable content head. */
  readonly handlers: (ctx: WorldReducerContext) => BehaviourHandlerRegistry;
  readonly apply: (
    ctx: WorldReducerContext,
    effects: readonly Effect[],
    entityId: bigint,
  ) => void;
}

/** Scheduled reducers have no client sender; the durable timer row is authority. */
export function entityTimerFireBehaviour(
  ctx: WorldReducerContext,
  message: EntityTimerMessage,
  authority: EntityTimerAuthority,
): void {
  if (message.timerId.length < 1 || message.timerId.length > MAX_ENTITY_TIMER_ID_LENGTH) {
    authority.reject('behaviour_timer_id_invalid');
  }
  const currentTick = authority.currentTick(ctx);
  if (message.expectedTick > currentTick) {
    // A wall-clock schedule may wake before the authority clock catches up.
    // Preserve the durable intent instead of consuming the one-shot timer.
    authority.reschedule(ctx, message, currentTick);
    return;
  }
  const target = authority.resolveObject(ctx, message.entityId);
  if (target === null) return;
  const result = raiseEvent(authority.handlers(ctx), {
    type: 'timer',
    object: target.ref,
    timerId: message.timerId,
  }, authority.snapshot(ctx, target.snapshot));
  if (isBlockedHandlerResult(result)) authority.reject(result.blocked);
  authority.apply(ctx, result.effects, message.entityId);
}
