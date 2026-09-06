import {
  createReadOnlySnapshot,
  facedTileTarget,
  isBlockedHandlerResult,
  raiseEvent,
  type ActorRef,
  type BehaviourHandlerRegistry,
  type BehaviourItemSnapshot,
  type BehaviourNpcSnapshot,
  type BehaviourObjectSnapshot,
  type BehaviourTargetSnapshot,
  type Direction,
  type Effect,
  type ItemRef,
  type NpcRef,
  type ObjectRef,
  type ReadOnlySnapshot,
  type ReadOnlySnapshotInput,
} from '@orchard/sim';

import type { WorldReducerContext } from '../index.js';

export interface ResolvedBehaviourTarget {
  readonly kind: BehaviourTargetKind;
  readonly ref: ObjectRef | NpcRef;
  readonly snapshot: BehaviourObjectSnapshot | BehaviourNpcSnapshot;
  /** Present only when the spatial target is itself an inventory item entity.
   * This lets the item's authored lifecycle own use without pretending that
   * the player's selected hotbar slot supplied the capability. */
  readonly item?: {
    readonly ref: ItemRef;
    readonly snapshot: BehaviourItemSnapshot;
  };
}

export const BEHAVIOUR_TARGET_KINDS = [
  'placeable',
  'chest',
  'combat_target',
  'world_item',
  'resource',
  'landmark',
  'npc',
] as const;

export type BehaviourTargetKind = typeof BEHAVIOUR_TARGET_KINDS[number];

/**
 * The legacy placeable reducers and the client both target the exact tile in
 * front of the player. Keep the generic behaviour authority on that contract;
 * a one-tile radial check rejects valid diagonal and off-centre interactions.
 */
export function placeableTargetMatchesFacingTile(
  position: {
    readonly x: number;
    readonly y: number;
    readonly facing: Direction;
    readonly spaceId: string;
  },
  target: { readonly spaceId: string; readonly x: number; readonly y: number },
): boolean {
  const faced = facedTileTarget(position.x, position.y, position.facing);
  return target.spaceId === position.spaceId
    && target.x === faced.tileX
    && target.y === faced.tileY;
}

export function isBehaviourTargetKind(value: string): value is BehaviourTargetKind {
  return (BEHAVIOUR_TARGET_KINDS as readonly string[]).includes(value);
}

export interface BehaviourActionAuthority {
  readonly reject: (message: string) => never;
  readonly authorize: (ctx: WorldReducerContext) => void;
  readonly resolveTarget: (
    ctx: WorldReducerContext,
    targetKind: BehaviourTargetKind,
    entityId: bigint,
  ) => ResolvedBehaviourTarget | null;
  readonly assertTargetReach: (
    ctx: WorldReducerContext,
    target: ResolvedBehaviourTarget,
    verb: string,
  ) => void;
  readonly actorRef: (ctx: WorldReducerContext) => ActorRef;
  readonly selectedItem: (ctx: WorldReducerContext) => {
    readonly ref: ItemRef;
    readonly snapshot: BehaviourItemSnapshot;
  } | null;
  readonly snapshot: (
    ctx: WorldReducerContext,
    target?: BehaviourTargetSnapshot,
    selectedItem?: BehaviourItemSnapshot,
  ) => ReadOnlySnapshot;
  /** Resolve against the current durable content head inside this transaction. */
  readonly handlers: (ctx: WorldReducerContext) => BehaviourHandlerRegistry;
  readonly apply: (
    ctx: WorldReducerContext,
    effects: readonly Effect[],
    target?: ResolvedBehaviourTarget,
    subjectItem?: ItemRef,
  ) => void;
}

function sortedStrings(values: readonly string[]): readonly string[] {
  return Object.freeze([...values].sort((left, right) => left.localeCompare(right)));
}

function sortedRecord<T>(values: Readonly<Record<string, T>>): Readonly<Record<string, T>> {
  return Object.freeze(Object.fromEntries(
    Object.entries(values).sort(([left], [right]) => left.localeCompare(right)),
  ));
}

function canonicalItem(item: BehaviourItemSnapshot): BehaviourItemSnapshot {
  return {
    ...item,
    tags: sortedStrings(item.tags),
    ...(item.state === undefined ? {} : { state: sortedRecord(item.state) }),
  };
}

function canonicalTarget(target: BehaviourTargetSnapshot): BehaviourTargetSnapshot {
  if (!('entityType' in target)) return { ...target, tags: sortedStrings(target.tags) };
  return {
    ...target,
    tags: sortedStrings(target.tags),
    tile: { ...target.tile, tags: sortedStrings(target.tile.tags) },
    state: sortedRecord(target.state),
  };
}

/** Canonicalizes collection order before the pure resolver observes authority rows. */
export function createAuthorityBehaviourSnapshot(
  input: ReadOnlySnapshotInput,
): ReadOnlySnapshot {
  const definitions = Object.fromEntries(
    Object.entries(input.registry.definitions)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([id, definition]) => [id, {
        ...definition,
        tags: sortedStrings(definition.tags),
      }]),
  );
  return createReadOnlySnapshot({
    ...input,
    registry: { ...input.registry, definitions: Object.freeze(definitions) },
    space: { ...input.space, tags: sortedStrings(input.space.tags) },
    ...(input.actor === undefined ? {} : { actor: {
      ...input.actor,
      tags: sortedStrings(input.actor.tags),
      tile: { ...input.actor.tile, tags: sortedStrings(input.actor.tile.tags) },
      inventory: Object.freeze([...input.actor.inventory].sort((left, right) => (
        (left.containerId ?? '').localeCompare(right.containerId ?? '')
        || (left.slot ?? -1) - (right.slot ?? -1)
        || left.kind.localeCompare(right.kind)
      )).map(canonicalItem)),
      worldRoles: sortedStrings(input.actor.worldRoles),
      homesteadRoles: sortedRecord(input.actor.homesteadRoles),
      questStates: sortedRecord(input.actor.questStates),
      statistics: sortedRecord(input.actor.statistics),
      skillRanks: sortedRecord(input.actor.skillRanks),
    } }),
    ...(input.target === undefined ? {} : { target: canonicalTarget(input.target) }),
    ...(input.selectedItem === undefined ? {} : { selectedItem: canonicalItem(input.selectedItem) }),
    ...(input.container === undefined ? {} : { container: {
      ...input.container,
      slots: Object.freeze(input.container.slots.map((item) => (
        item === null ? null : canonicalItem(item)
      ))),
      ...(input.container.roles === undefined ? {} : {
        roles: sortedRecord(Object.fromEntries(Object.entries(input.container.roles).map(
          ([role, slots]) => [role, Object.freeze([...slots].sort((left, right) => left - right))],
        ))),
      }),
    } }),
    nearbyObjects: Object.freeze([...input.nearbyObjects]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((object) => canonicalTarget(object) as BehaviourObjectSnapshot)),
  });
}

export function interactEntityBehaviour(
  ctx: WorldReducerContext,
  request: { readonly targetKind: string; readonly entityId: bigint; readonly verb: string },
  authority: BehaviourActionAuthority,
): void {
  authority.authorize(ctx);
  if (!isBehaviourTargetKind(request.targetKind)) {
    authority.reject('behaviour_target_kind_invalid');
  }
  if (request.verb !== 'use' && request.verb !== 'pickup' && request.verb !== 'break') {
    authority.reject('behaviour_verb_invalid');
  }
  const target = authority.resolveTarget(ctx, request.targetKind, request.entityId);
  if (target === null) authority.reject('behaviour_target_not_found');
  authority.assertTargetReach(ctx, target, request.verb);
  const actor = authority.actorRef(ctx);
  if (request.verb === 'use' && target.kind === 'world_item') {
    if (target.item === undefined) authority.reject('behaviour_world_item_context_required');
    const result = raiseEvent(
      authority.handlers(ctx),
      { type: 'worldItemUse', actor, worldItem: target.item.ref, target: target.ref as ObjectRef },
      authority.snapshot(ctx, target.snapshot, target.item.snapshot),
    );
    if (isBlockedHandlerResult(result)) authority.reject(result.blocked);
    authority.apply(ctx, result.effects, target, target.item.ref);
    return;
  }
  const selected = request.verb === 'break' ? authority.selectedItem(ctx) : null;
  if (request.verb === 'break' && selected === null) {
    authority.reject('behaviour_selected_item_required');
  }
  if (request.verb !== 'use' && target.ref.entityType !== 'object') {
    authority.reject('behaviour_object_required');
  }
  const event = request.verb === 'use'
    ? { type: 'use' as const, actor, target: target.ref }
    : request.verb === 'pickup'
      ? { type: 'pickup' as const, actor, tile: target.snapshot.tile, subject: target.ref as ObjectRef }
      : {
          type: 'break' as const,
          actor,
          object: target.ref as ObjectRef,
          tool: selected!.ref,
        };
  const result = raiseEvent(
    authority.handlers(ctx),
    event,
    authority.snapshot(ctx, target.snapshot, selected?.snapshot),
  );
  if (isBlockedHandlerResult(result)) authority.reject(result.blocked);
  authority.apply(ctx, result.effects, target);
}
