import { effectKind, type Effect } from './effects.js';
import { blockedResult, effectsResult, MAX_EFFECTS_PER_HANDLER_RESULT, type HandlerResult } from './handler.js';
import type {
  InteractionTargetRef,
  ItemRef,
  LifecycleEventByType,
  LifecycleEventType,
  TileRef,
} from './events.js';
import type { AnyHandlerRegistration, HandlerRegistration } from './registry.js';
import type { BehaviourActorSnapshot, BehaviourItemSnapshot, ReadOnlySnapshot } from './snapshot.js';

/** Runtime events that may invoke an item's authored `onUse` callback. */
export const ITEM_ON_USE_EVENT_TYPES = [
  'secondary', 'equipmentUse', 'worldItemUse', 'useWith', 'useAt', 'aimedUse', 'place',
] as const satisfies readonly LifecycleEventType[];

export type ItemOnUseEventType = typeof ITEM_ON_USE_EVENT_TYPES[number];
export type ItemOnUseEvent = LifecycleEventByType[ItemOnUseEventType];

export interface ItemOnUseInputDispatchMetadata {
  readonly eventType: ItemOnUseEventType;
  /** Property carrying the item reference in the public lifecycle event. */
  readonly itemRef: 'selectedItem' | 'equipmentItem' | 'worldItem' | 'subject';
  readonly target: 'none' | 'optional' | 'required';
  readonly tile: 'none' | 'required';
}

/** Stable metadata used by input adapters without coupling them to callbacks. */
export const ITEM_ON_USE_INPUT_DISPATCH = Object.freeze({
  secondary: Object.freeze({
    eventType: 'secondary', itemRef: 'selectedItem', target: 'optional', tile: 'none',
  }),
  equipmentUse: Object.freeze({
    eventType: 'equipmentUse', itemRef: 'equipmentItem', target: 'none', tile: 'none',
  }),
  worldItemUse: Object.freeze({
    eventType: 'worldItemUse', itemRef: 'worldItem', target: 'required', tile: 'none',
  }),
  useWith: Object.freeze({
    eventType: 'useWith', itemRef: 'selectedItem', target: 'required', tile: 'none',
  }),
  useAt: Object.freeze({
    eventType: 'useAt', itemRef: 'selectedItem', target: 'none', tile: 'required',
  }),
  aimedUse: Object.freeze({
    eventType: 'aimedUse', itemRef: 'selectedItem', target: 'none', tile: 'none',
  }),
  place: Object.freeze({
    eventType: 'place', itemRef: 'subject', target: 'none', tile: 'required',
  }),
} as const satisfies Readonly<Record<ItemOnUseEventType, ItemOnUseInputDispatchMetadata>>);

const ITEM_ON_USE_EVENT_TYPE_SET: ReadonlySet<string> = new Set(ITEM_ON_USE_EVENT_TYPES);

export function isItemOnUseEventType(value: unknown): value is ItemOnUseEventType {
  return typeof value === 'string' && ITEM_ON_USE_EVENT_TYPE_SET.has(value);
}

export function itemOnUseEventTarget(event: ItemOnUseEvent): InteractionTargetRef | undefined {
  return event.type === 'secondary' || event.type === 'worldItemUse' || event.type === 'useWith'
    ? event.target
    : undefined;
}

function isTileRef(value: InteractionTargetRef | undefined): value is TileRef {
  return value !== undefined && 'spaceId' in value;
}

export function itemOnUseEventTile(event: ItemOnUseEvent): TileRef | undefined {
  if (event.type === 'place' || event.type === 'useAt') return event.tile;
  const target = itemOnUseEventTarget(event);
  return isTileRef(target) ? target : undefined;
}

/** Returns the event's selected item, rejecting object placement subjects. */
export function itemOnUseEventItem(event: ItemOnUseEvent): ItemRef | null {
  if (event.type === 'equipmentUse') return event.equipmentItem;
  if (event.type === 'worldItemUse') return event.worldItem;
  if (event.type !== 'place') return event.selectedItem;
  return 'entityType' in event.subject ? null : event.subject;
}

export interface LifecycleDefinitionRef {
  readonly id: string;
}

export type LifecycleRecipeRef = string | LifecycleDefinitionRef;

export interface ItemOnUsePlayerContext {
  readonly snapshot: BehaviourActorSnapshot;
  findRecipe(recipe: LifecycleRecipeRef): boolean;
  giveRecipe(recipe: LifecycleRecipeRef): void;
  hasItem(kind: string, count?: number): boolean;
  giveItem(kind: string, count?: number): void;
  consumeItem(kind: string, count?: number): void;
}

export interface ItemOnUseItemContext {
  readonly snapshot: BehaviourItemSnapshot;
  consume(count?: number): void;
  damage(amount?: number): void;
  applyEffect(effectId: string, stacks?: number): void;
}

/**
 * Capability-limited context supplied to Studio-authored item code. The code
 * cannot mutate database rows directly; it can only inspect the immutable
 * authority snapshot and emit effects that the world validates atomically.
 */
export interface ItemOnUseContext {
  readonly event: ItemOnUseEvent;
  readonly target?: InteractionTargetRef;
  readonly tile?: TileRef;
  readonly snapshot: ReadOnlySnapshot;
  readonly player: ItemOnUsePlayerContext;
  readonly item: ItemOnUseItemContext;
  emit(effect: Effect): void;
  block(reason: string): never;
  /** Declines this exact callback so the next matching lifecycle lane may run. */
  pass(): never;
}

export interface ItemOnUseLifecycleDefinition {
  readonly itemId: string;
  readonly id: string;
  readonly prompt: string;
  readonly priority?: number;
  /** Omitted by legacy bundles and therefore defaults to secondary/F use. */
  readonly triggers?: readonly ItemOnUseEventType[];
  readonly run: (context: ItemOnUseContext) => void;
}

class AuthoredLifecycleBlock extends Error {
  constructor(readonly reason: string) {
    super(reason);
  }
}

class AuthoredLifecyclePass extends Error {}

function definitionId(ref: LifecycleRecipeRef): string {
  const id = typeof ref === 'string' ? ref : ref.id;
  if (id.startsWith('recipe:') || id.startsWith('process:')) return id;
  throw new Error(`authored lifecycle recipe id must be a full recipe/process id: ${id}`);
}

function positiveCount(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`authored lifecycle ${label} must be a positive safe integer`);
  }
  return value;
}

export function normalizeItemOnUseTriggers(
  triggers: readonly ItemOnUseEventType[] | undefined,
): readonly ItemOnUseEventType[] {
  if (triggers === undefined) return Object.freeze(['secondary'] as const);
  if (triggers.length === 0) throw new Error('authored item lifecycle requires at least one trigger');
  const seen = new Set<ItemOnUseEventType>();
  let previousRank = -1;
  for (const trigger of triggers) {
    if (!isItemOnUseEventType(trigger)) {
      throw new Error(`unsupported authored item lifecycle trigger: ${String(trigger)}`);
    }
    if (seen.has(trigger)) throw new Error(`duplicate authored item lifecycle trigger: ${trigger}`);
    const rank = ITEM_ON_USE_EVENT_TYPES.indexOf(trigger);
    if (rank <= previousRank) {
      throw new Error('authored item lifecycle triggers must be in canonical secondary, equipmentUse, worldItemUse, useWith, useAt, aimedUse, place order');
    }
    seen.add(trigger);
    previousRank = rank;
  }
  return Object.freeze([...triggers]);
}

function assertLifecycleDefinition(definition: ItemOnUseLifecycleDefinition): void {
  if (!definition.itemId.startsWith('item:')) {
    throw new Error(`authored item lifecycle requires a full item id: ${definition.itemId}`);
  }
  if (definition.id.trim().length === 0) throw new Error('authored item lifecycle id must not be empty');
  if (definition.prompt.trim().length === 0) {
    throw new Error(`authored item lifecycle ${definition.id} prompt must not be empty`);
  }
}

function executeItemOnUse(
  definition: ItemOnUseLifecycleDefinition,
  event: ItemOnUseEvent,
  snapshot: ReadOnlySnapshot,
): HandlerResult {
  const actor = snapshot.actor;
  const item = snapshot.selectedItem;
  // A carried object is the place-event subject even if an inventory slot is
  // selected. Item callbacks must decline that event so the generic carried
  // object placement lane remains authoritative.
  if (itemOnUseEventItem(event) === null) return effectsResult([], { continue: true });
  if (actor === undefined || actor.entityType !== 'player' || item === undefined) {
    return blockedResult('behaviour_item_on_use_context_unavailable');
  }
  const emitted: Effect[] = [];
  const recipesToLearn = new Set<string>();
  const knownRecipes = new Set(actor.knownRecipeIds ?? []);
  const emit = (effect: Effect): void => {
    if (effectKind(effect) === null) throw new Error(`authored lifecycle ${definition.id} emitted an invalid effect`);
    if (emitted.length + (recipesToLearn.size === 0 ? 0 : 1) >= MAX_EFFECTS_PER_HANDLER_RESULT) {
      throw new Error(`authored lifecycle ${definition.id} exceeded the effect limit`);
    }
    emitted.push(effect);
  };
  const target = itemOnUseEventTarget(event);
  const tile = itemOnUseEventTile(event);
  const context: ItemOnUseContext = Object.freeze({
    event,
    ...(target === undefined ? {} : { target }),
    ...(tile === undefined ? {} : { tile }),
    snapshot,
    player: Object.freeze({
      snapshot: actor,
      findRecipe: (recipe: LifecycleRecipeRef) => {
        const id = definitionId(recipe);
        return knownRecipes.has(id) || recipesToLearn.has(id);
      },
      giveRecipe: (recipe: LifecycleRecipeRef) => {
        const id = definitionId(recipe);
        if (!knownRecipes.has(id)) recipesToLearn.add(id);
      },
      hasItem: (kind: string, count = 1) => actor.inventory
        .filter((candidate) => candidate.kind === kind || candidate.definitionId === kind)
        .reduce((total, candidate) => total + candidate.count, 0)
          >= positiveCount(count, 'item count'),
      giveItem: (kind: string, count = 1) => emit({ giveItem: { kind, count: positiveCount(count, 'item count') } }),
      consumeItem: (kind: string, count = 1) => emit({ consumeItem: { kind, count: positiveCount(count, 'item count') } }),
    }),
    item: Object.freeze({
      snapshot: item,
      consume: (count = 1) => emit({ consumeSelected: positiveCount(count, 'consume count') }),
      damage: (amount = 1) => emit({ damageSelected: positiveCount(amount, 'damage amount') }),
      applyEffect: (effectId: string, stacks?: number) => emit({
        applyEffect: { effectId, ...(stacks === undefined ? {} : { stacks }) },
      }),
    }),
    emit,
    block: (reason: string): never => {
      if (reason.trim().length === 0) throw new Error('authored lifecycle block reason must not be empty');
      throw new AuthoredLifecycleBlock(reason);
    },
    pass: (): never => {
      throw new AuthoredLifecyclePass();
    },
  });
  try {
    definition.run(context);
  } catch (error) {
    if (error instanceof AuthoredLifecycleBlock) return blockedResult(error.reason);
    if (error instanceof AuthoredLifecyclePass) return effectsResult([], { continue: true });
    throw error;
  }
  if (emitted.length + (recipesToLearn.size === 0 ? 0 : 1) > MAX_EFFECTS_PER_HANDLER_RESULT) {
    throw new Error(`authored lifecycle ${definition.id} exceeded the effect limit`);
  }
  return effectsResult([
    ...(recipesToLearn.size === 0 ? [] : [{ learnRecipes: [...recipesToLearn] }] as const),
    ...emitted,
  ]);
}

function itemOnUseRegistration<TType extends ItemOnUseEventType>(
  definition: ItemOnUseLifecycleDefinition,
  eventType: TType,
): HandlerRegistration<TType> {
  return Object.freeze({
    id: `${definition.id}.${eventType}`,
    eventType,
    source: 'selectedItem',
    match: Object.freeze({ kind: 'definition', definitionId: definition.itemId }),
    priority: definition.priority ?? 0,
    handler: (event: LifecycleEventByType[TType], snapshot: ReadOnlySnapshot): HandlerResult => (
      executeItemOnUse(definition, event, snapshot)
    ),
  } satisfies HandlerRegistration<TType>);
}

/**
 * Compiles one callback into each explicitly authored selected-item event.
 * Registrations receive stable event-qualified ids so a single callback may
 * safely participate in more than one registry lane.
 */
export function defineItemOnUseHandlers(
  definition: ItemOnUseLifecycleDefinition,
): readonly AnyHandlerRegistration[] {
  assertLifecycleDefinition(definition);
  const triggers = normalizeItemOnUseTriggers(definition.triggers);
  return Object.freeze(triggers.map((trigger) => itemOnUseRegistration(definition, trigger)));
}

/**
 * Compiles one Studio-authored `onUse` callback into the deterministic
 * selected-item lifecycle registry. This is build-time code: deployed world
 * modules contain the callback, while runtime content only exposes metadata.
 */
export function defineItemOnUse(
  definition: ItemOnUseLifecycleDefinition,
): HandlerRegistration<'secondary'> {
  assertLifecycleDefinition(definition);
  const triggers = normalizeItemOnUseTriggers(definition.triggers);
  if (triggers.length !== 1 || triggers[0] !== 'secondary') {
    throw new Error('defineItemOnUse only supports the legacy secondary trigger; use defineItemOnUseHandlers');
  }
  return Object.freeze({
    id: definition.id,
    eventType: 'secondary',
    source: 'selectedItem',
    match: Object.freeze({ kind: 'definition', definitionId: definition.itemId }),
    priority: definition.priority ?? 0,
    handler: (event, snapshot): HandlerResult => executeItemOnUse(definition, event, snapshot),
  } satisfies HandlerRegistration<'secondary'>);
}
