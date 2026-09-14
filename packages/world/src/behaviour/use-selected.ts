import {
  isBlockedHandlerResult,
  raiseEvent,
  type AimedUseEvent,
  type BehaviourItemSnapshot,
  type BehaviourTargetSnapshot,
  type Effect,
  type ItemRef,
  type ObjectRef,
  type TileRef,
} from '@orchard/sim';

import type { WorldReducerContext } from '../index.js';
import {
  isBehaviourTargetKind,
  type BehaviourActionAuthority,
  type ResolvedBehaviourTarget,
} from './interact-entity.js';

export interface UseSelectedRequest {
  readonly verb: string;
  readonly targetKind: string;
  readonly entityId: bigint;
  readonly tileX: number;
  readonly tileY: number;
  readonly actionId?: string;
  readonly quantity?: number;
  readonly equipmentSlot?: number;
  readonly phase?: string;
  readonly aimX?: number;
  readonly aimY?: number;
  readonly chargeMs?: number;
}

export interface UseSelectedAuthority extends BehaviourActionAuthority {
  readonly tileTarget: (
    ctx: WorldReducerContext,
    tileX: number,
    tileY: number,
  ) => { readonly ref: TileRef; readonly snapshot: BehaviourTargetSnapshot };
  readonly assertTileReach: (
    ctx: WorldReducerContext,
    tile: TileRef,
    selectedItem?: BehaviourItemSnapshot,
    actionId?: string,
    effects?: readonly Effect[],
  ) => void;
  readonly equipmentItem: (
    ctx: WorldReducerContext,
    slot: number,
  ) => { readonly ref: ItemRef; readonly snapshot: BehaviourItemSnapshot } | null;
  readonly carriedObject: (ctx: WorldReducerContext) => ObjectRef | null;
  /** Authored frame controls cross one command boundary. The authority resolves
   * the active frame and dispatches only a semantic declared by that frame. */
  readonly performFrameAction?: (
    ctx: WorldReducerContext,
    actionId: string,
  ) => boolean;
}

function optionalTarget(
  ctx: WorldReducerContext,
  targetKind: string,
  entityId: bigint,
  verb: string,
  authority: UseSelectedAuthority,
): ResolvedBehaviourTarget | undefined {
  if (targetKind.length === 0) {
    if (entityId !== 0n) authority.reject('behaviour_target_kind_required');
    return undefined;
  }
  if (!isBehaviourTargetKind(targetKind)) authority.reject('behaviour_target_kind_invalid');
  const target = authority.resolveTarget(ctx, targetKind, entityId);
  if (target === null) authority.reject('behaviour_target_not_found');
  authority.assertTargetReach(ctx, target, verb);
  return target;
}

export function useSelectedBehaviour(
  ctx: WorldReducerContext,
  request: UseSelectedRequest,
  authority: UseSelectedAuthority,
): void {
  authority.authorize(ctx);
  if (request.verb !== 'secondary' && request.verb !== 'equipment_use'
    && request.verb !== 'use_with' && request.verb !== 'use_at'
    && request.verb !== 'aimed_use'
    && request.verb !== 'place'
    && request.verb !== 'frame_action') {
    authority.reject('behaviour_verb_invalid');
  }
  if (request.verb === 'frame_action') {
    const actionId = request.actionId ?? '';
    if (!/^[a-z0-9](?:[a-z0-9._-]{0,126}[a-z0-9])?$/u.test(actionId)
      || request.targetKind !== '' || request.entityId !== 0n) {
      authority.reject('behaviour_frame_action_invalid');
    }
    if (authority.performFrameAction?.(ctx, actionId) !== true) {
      authority.reject('behaviour_frame_action_unavailable');
    }
    return;
  }
  const actor = authority.actorRef(ctx);
  const target = request.verb === 'use_at' || request.verb === 'aimed_use'
    || request.verb === 'equipment_use' ? undefined : optionalTarget(
    ctx,
    request.targetKind,
    request.entityId,
    request.verb,
    authority,
  );
  if (request.verb === 'equipment_use') {
    if (request.targetKind.length > 0 || request.entityId !== 0n) {
      authority.reject('behaviour_equipment_target_invalid');
    }
    if (request.equipmentSlot === undefined) authority.reject('behaviour_equipment_slot_required');
    const equipment = authority.equipmentItem(ctx, request.equipmentSlot);
    if (equipment === null) authority.reject('behaviour_equipment_item_required');
    const result = raiseEvent(authority.handlers(ctx), {
      type: 'equipmentUse',
      actor,
      equipmentItem: equipment.ref,
      equipmentSlot: request.equipmentSlot,
    }, authority.snapshot(ctx, undefined, equipment.snapshot));
    if (isBlockedHandlerResult(result)) authority.reject(result.blocked);
    authority.apply(ctx, result.effects, undefined, equipment.ref);
    return;
  }
  const selected = authority.selectedItem(ctx);
  if (request.verb === 'secondary') {
    const result = raiseEvent(authority.handlers(ctx), {
      type: 'secondary',
      actor,
      selectedItem: selected?.ref ?? { kind: 'hands' },
      ...(target === undefined ? {} : { target: target.ref }),
    }, authority.snapshot(ctx, target?.snapshot, selected?.snapshot));
    if (isBlockedHandlerResult(result)) authority.reject(result.blocked);
    authority.apply(ctx, result.effects, target, selected?.ref);
    return;
  }
  if (request.verb === 'use_with') {
    if (selected === null) authority.reject('behaviour_selected_item_required');
    if (target === undefined) authority.reject('behaviour_target_required');
    const result = raiseEvent(authority.handlers(ctx), {
      type: 'useWith',
      actor,
      selectedItem: selected.ref,
      target: target.ref,
    }, authority.snapshot(ctx, target.snapshot, selected.snapshot));
    if (isBlockedHandlerResult(result)) authority.reject(result.blocked);
    authority.apply(ctx, result.effects, target, selected.ref);
    return;
  }
  if (request.verb === 'use_at') {
    if (request.targetKind.length > 0) authority.reject('behaviour_use_at_target_kind_invalid');
    if (selected === null) authority.reject('behaviour_selected_item_required');
    const tile = authority.tileTarget(ctx, request.tileX, request.tileY);
    const result = raiseEvent(authority.handlers(ctx), {
      type: 'useAt',
      actor,
      selectedItem: selected.ref,
      tile: tile.ref,
      actionId: request.actionId ?? '',
      targetId: request.entityId.toString(),
    }, authority.snapshot(ctx, tile.snapshot, selected.snapshot));
    if (isBlockedHandlerResult(result)) authority.reject(result.blocked);
    // Resolve an authored handler before accepting the tile as actionable.
    // This is only a coarse input bound; each emitted engine primitive must
    // revalidate its own exact legacy reach during the effect preflight pass.
    authority.assertTileReach(ctx, tile.ref, selected.snapshot, request.actionId, result.effects);
    authority.apply(ctx, result.effects, undefined, selected.ref);
    return;
  }
  if (request.verb === 'aimed_use') {
    if (request.targetKind.length > 0 || request.entityId !== 0n) {
      authority.reject('behaviour_aimed_use_target_invalid');
    }
    if (selected === null) authority.reject('behaviour_selected_item_required');
    const phase = request.phase ?? '';
    const aimX = request.aimX ?? 0;
    const aimY = request.aimY ?? 0;
    const chargeMs = request.chargeMs ?? 0;
    const event: AimedUseEvent = phase === 'begin'
      ? { type: 'aimedUse', actor, selectedItem: selected.ref, phase: 'begin' }
      : phase === 'cancel'
        ? { type: 'aimedUse', actor, selectedItem: selected.ref, phase: 'cancel', chargeMs }
        : phase === 'fire'
          ? { type: 'aimedUse', actor, selectedItem: selected.ref, phase: 'fire', aimX, aimY, chargeMs }
          : authority.reject('behaviour_aimed_use_phase_invalid');
    const result = raiseEvent(
      authority.handlers(ctx),
      event,
      authority.snapshot(ctx, undefined, selected.snapshot),
    );
    if (isBlockedHandlerResult(result)) authority.reject(result.blocked);
    authority.apply(ctx, result.effects, undefined, selected.ref);
    return;
  }
  if (request.verb === 'place') {
    if (target !== undefined) authority.reject('behaviour_place_target_invalid');
    const tile = authority.tileTarget(ctx, request.tileX, request.tileY);
    const carried = authority.carriedObject(ctx);
    if (selected === null && carried === null) {
      authority.reject('behaviour_selected_item_required');
    }
    const result = raiseEvent(authority.handlers(ctx), {
      type: 'place',
      actor,
      tile: tile.ref,
      subject: carried ?? selected!.ref as ItemRef,
      ...(request.actionId === undefined || request.actionId === ''
        ? {}
        : { actionId: request.actionId }),
    }, authority.snapshot(ctx, tile.snapshot, selected?.snapshot));
    if (isBlockedHandlerResult(result)) authority.reject(result.blocked);
    authority.assertTileReach(ctx, tile.ref, selected?.snapshot, request.actionId, result.effects);
    authority.apply(ctx, result.effects, undefined, carried === null ? selected?.ref : undefined);
    return;
  }
  authority.reject('behaviour_verb_invalid');
}
