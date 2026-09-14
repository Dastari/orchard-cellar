import {
  LIFECYCLE_EVENT_TYPES,
  type LifecycleEvent,
  type LifecycleEventByType,
  type LifecycleEventType,
} from './events.js';
import type { Handler } from './handler.js';
import type {
  BehaviourItemSnapshot,
  BehaviourTargetSnapshot,
  BehaviourTileSnapshot,
  ReadOnlySnapshot,
} from './snapshot.js';

/** Fixed precedence for a player action, followed by engine-wide hooks. */
export const HANDLER_SOURCE_ORDER = ['selectedItem', 'target', 'tile', 'global'] as const;
export type HandlerSource = typeof HANDLER_SOURCE_ORDER[number];

export type HandlerMatcher =
  | { readonly kind: 'definition'; readonly definitionId: string }
  | { readonly kind: 'tag'; readonly tag: string }
  | { readonly kind: 'any' };

export interface HandlerRegistration<TType extends LifecycleEventType = LifecycleEventType> {
  readonly id: string;
  readonly eventType: TType;
  readonly source: HandlerSource;
  readonly match: HandlerMatcher;
  /** Higher values resolve first inside one source. Defaults to zero. */
  readonly priority?: number;
  readonly handler: Handler<LifecycleEventByType[TType]>;
}

export type AnyHandlerRegistration = {
  readonly [TType in LifecycleEventType]: HandlerRegistration<TType>;
}[LifecycleEventType];

export interface BehaviourHandlerRegistry {
  readonly registrations: readonly AnyHandlerRegistration[];
}

export interface ResolvedHandler {
  readonly registrationId: string;
  readonly source: HandlerSource;
  readonly priority: number;
  readonly handler: Handler;
}

interface MatchableSource {
  readonly definitionIds: readonly string[];
  readonly tags: readonly string[];
}

const SOURCE_RANK: Readonly<Record<HandlerSource, number>> = {
  selectedItem: 0,
  target: 1,
  tile: 2,
  global: 3,
};

const EVENT_RANK = new Map<LifecycleEventType, number>(
  LIFECYCLE_EVENT_TYPES.map((type, index) => [type, index]),
);

function priorityOf(registration: AnyHandlerRegistration): number {
  return registration.priority ?? 0;
}

function compareRegistrations(left: AnyHandlerRegistration, right: AnyHandlerRegistration): number {
  const eventOrder = (EVENT_RANK.get(left.eventType) ?? 0) - (EVENT_RANK.get(right.eventType) ?? 0);
  if (eventOrder !== 0) return eventOrder;
  const sourceOrder = SOURCE_RANK[left.source] - SOURCE_RANK[right.source];
  if (sourceOrder !== 0) return sourceOrder;
  const priorityOrder = priorityOf(right) - priorityOf(left);
  if (priorityOrder !== 0) return priorityOrder;
  if (left.id < right.id) return -1;
  if (left.id > right.id) return 1;
  return 0;
}

function assertRegistration(registration: AnyHandlerRegistration): void {
  if (registration.id.length === 0) throw new Error('behaviour handler id must not be empty');
  const priority = priorityOf(registration);
  if (!Number.isSafeInteger(priority)) {
    throw new Error(`behaviour handler ${registration.id} priority must be a safe integer`);
  }
  if (registration.match.kind === 'definition' && registration.match.definitionId.length === 0) {
    throw new Error(`behaviour handler ${registration.id} definition id must not be empty`);
  }
  if (registration.match.kind === 'tag' && registration.match.tag.length === 0) {
    throw new Error(`behaviour handler ${registration.id} tag must not be empty`);
  }
  if (registration.source === 'global' && registration.match.kind !== 'any') {
    throw new Error(`global behaviour handler ${registration.id} must use the any matcher`);
  }
}

function freezeRegistration(registration: AnyHandlerRegistration): AnyHandlerRegistration {
  return Object.freeze({
    ...registration,
    match: Object.freeze({ ...registration.match }),
  }) as AnyHandlerRegistration;
}

/** Builds an immutable registry whose order is independent of input insertion order. */
export function createHandlerRegistry(
  registrations: readonly AnyHandlerRegistration[] = [],
): BehaviourHandlerRegistry {
  const ids = new Set<string>();
  for (const registration of registrations) {
    assertRegistration(registration);
    if (ids.has(registration.id)) {
      throw new Error(`duplicate behaviour handler id: ${registration.id}`);
    }
    ids.add(registration.id);
  }
  const canonical = registrations.map(freezeRegistration).sort(compareRegistrations);
  return Object.freeze({ registrations: Object.freeze(canonical) });
}

/** Returns a new registry, leaving readers of the previous registry unaffected. */
export function registerHandler<TType extends LifecycleEventType>(
  registry: BehaviourHandlerRegistry,
  registration: HandlerRegistration<TType>,
): BehaviourHandlerRegistry {
  // Function variance makes the heterogeneous registration union opaque here;
  // the event-type equality check in resolveHandlers is its runtime counterpart.
  return createHandlerRegistry([
    ...registry.registrations,
    registration as unknown as AnyHandlerRegistration,
  ]);
}

function itemSource(item: BehaviourItemSnapshot | undefined): MatchableSource | null {
  if (item === undefined) return null;
  return {
    definitionIds: item.definitionId === undefined
      ? [item.kind]
      : [item.definitionId, item.kind],
    tags: item.tags,
  };
}

function isTileSnapshot(target: BehaviourTargetSnapshot): target is BehaviourTileSnapshot {
  return !('entityType' in target);
}

function targetSource(target: BehaviourTargetSnapshot | undefined): MatchableSource | null {
  if (target === undefined || isTileSnapshot(target)) return null;
  return { definitionIds: [target.definitionId], tags: target.tags };
}

function tileSource(target: BehaviourTargetSnapshot | undefined): MatchableSource | null {
  if (target === undefined) return null;
  const tile = isTileSnapshot(target) ? target : target.tile;
  return { definitionIds: [], tags: tile.tags };
}

function sourceFor(source: HandlerSource, view: ReadOnlySnapshot): MatchableSource | null {
  if (source === 'selectedItem') return itemSource(view.selectedItem);
  if (source === 'target') return targetSource(view.target);
  if (source === 'tile') return tileSource(view.target);
  return { definitionIds: [], tags: [] };
}

function matcherMatches(matcher: HandlerMatcher, source: MatchableSource): boolean {
  if (matcher.kind === 'any') return true;
  if (matcher.kind === 'definition') return source.definitionIds.includes(matcher.definitionId);
  return source.tags.includes(matcher.tag);
}

/** Resolves a canonical execution list without invoking any handlers. */
export function resolveHandlers(
  registry: BehaviourHandlerRegistry,
  event: LifecycleEvent,
  view: ReadOnlySnapshot,
): readonly ResolvedHandler[] {
  const resolved: ResolvedHandler[] = [];
  for (const registration of registry.registrations) {
    if (registration.eventType !== event.type) continue;
    const source = sourceFor(registration.source, view);
    if (source === null || !matcherMatches(registration.match, source)) continue;
    resolved.push({
      registrationId: registration.id,
      source: registration.source,
      priority: priorityOf(registration),
      handler: registration.handler as Handler,
    });
  }
  return Object.freeze(resolved);
}
