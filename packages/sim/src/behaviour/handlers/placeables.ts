import { effectsResult } from '../handler.js';
import {
  createHandlerRegistry,
  type AnyHandlerRegistration,
  type BehaviourHandlerRegistry,
} from '../registry.js';

function booleanState(
  view: Parameters<AnyHandlerRegistration['handler']>[1],
  name: string,
): boolean {
  const target = view.target;
  const value = target !== undefined && 'entityType' in target ? target.state[name] : undefined;
  return typeof value === 'boolean' ? value : false;
}

function effectTile(tile: { readonly spaceId: string; readonly x: number; readonly y: number }) {
  return { spaceId: tile.spaceId, x: tile.x, y: tile.y };
}

/** Compiled migration bridge for docs/55 §11 placeable rows owned by 55-B1. */
export const PLACEABLE_HANDLER_REGISTRATIONS = Object.freeze([
  {
    id: 'placeable.place-carried',
    eventType: 'place',
    source: 'global',
    match: { kind: 'any' },
    priority: 90,
    handler: (event, view) => view.actor?.carriedEntityId === undefined
      ? effectsResult([], { continue: true })
      : effectsResult([{ placeCarried: { at: effectTile(event.tile) } }]),
  },
  {
    id: 'placeable.pickup-damageable',
    eventType: 'pickup',
    source: 'target',
    match: { kind: 'tag', tag: 'damageable' },
    handler: (event) => effectsResult([{
      carry: 'entityType' in event.subject ? { objectId: event.subject.id } : {},
    }]),
  },
  {
    id: 'placeable.pickup-carryable-fallback',
    eventType: 'pickup',
    source: 'global',
    match: { kind: 'any' },
    priority: 80,
    handler: (event) => effectsResult([{
      carry: 'entityType' in event.subject ? { objectId: event.subject.id } : {},
    }]),
  },
  {
    id: 'placeable.light-state-sync',
    eventType: 'spawn',
    source: 'target',
    match: { kind: 'tag', tag: 'emits.light' },
    handler: (_event, view) => effectsResult([{
      setLight: { enabled: booleanState(view, 'lit') },
    }]),
  },
] as const satisfies readonly AnyHandlerRegistration[]);

/** Canonical registry construction makes repeated wiring safe and deterministic. */
export function registerPlaceableHandlers(
  registry: BehaviourHandlerRegistry = createHandlerRegistry(),
): BehaviourHandlerRegistry {
  const existing = new Set(registry.registrations.map(({ id }) => id));
  return createHandlerRegistry([
    ...registry.registrations,
    ...PLACEABLE_HANDLER_REGISTRATIONS.filter(({ id }) => !existing.has(id)),
  ]);
}
