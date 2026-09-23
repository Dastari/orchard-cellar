import type { ObjectContentDefinition } from '../content/object-definition.js';
import { stateMatches } from '../content/stateful-components.js';
import { compileDataGraphInteraction } from './data-graph.js';
import type { Effect, StateValue } from './effects.js';
import type { LifecycleEvent, LifecycleEventByType, LifecycleEventType } from './events.js';
import { blockedResult, effectsResult, MAX_EFFECTS_PER_HANDLER_RESULT, type HandlerResult } from './handler.js';
import type { AnyHandlerRegistration } from './registry.js';
import type { ReadOnlySnapshot } from './snapshot.js';
import type { StateTransitionFiring } from '../content/stateful-components.js';

export const AUTHORED_HOOK_API_VERSION = 2 as const;
export const AUTHORED_HOOK_EVENTS = {
  onSpawn: 'spawn', onDespawn: 'despawn', onInteract: 'use', onBreak: 'break',
  onStateEnter: 'stateEnter', onStateExit: 'stateExit', onTransition: 'transition',
  onDialogueChoice: 'dialogueChoice', onQuestState: 'questState', onObjective: 'questObjective',
} as const satisfies Readonly<Record<string, LifecycleEventType>>;
export type AuthoredHook = keyof typeof AUTHORED_HOOK_EVENTS;
export type AuthoredHookKind = 'object' | 'npc' | 'dialogue' | 'quest';
export const AUTHORED_KIND_HOOKS = {
  object: ['onSpawn', 'onDespawn', 'onInteract', 'onBreak', 'onStateEnter', 'onStateExit', 'onTransition'],
  npc: ['onSpawn', 'onDespawn', 'onInteract'],
  dialogue: ['onDialogueChoice'],
  quest: ['onQuestState', 'onObjective'],
} as const satisfies Readonly<Record<AuthoredHookKind, readonly AuthoredHook[]>>;
/** Reserved until an encounter authority adapter supplies immutable inputs. */
export const RESERVED_ENCOUNTER_HOOKS = ['onEncounterStart', 'onEncounterEnd'] as const;
export type AuthoredHookEvent<H extends AuthoredHook> = LifecycleEventByType[typeof AUTHORED_HOOK_EVENTS[H]];
export interface AuthoredHookContext<H extends AuthoredHook> {
  readonly apiVersion: typeof AUTHORED_HOOK_API_VERSION;
  readonly event: AuthoredHookEvent<H>;
  readonly snapshot: ReadOnlySnapshot;
  readonly emit: (effect: Effect) => void;
  readonly block: (reason: string) => never;
  readonly pass: () => never;
}
export interface AuthoredLifecycleDefinition<H extends AuthoredHook = AuthoredHook> {
  readonly id: string;
  readonly definitionId: string;
  readonly kind: AuthoredHookKind;
  readonly hook: H;
  run(context: AuthoredHookContext<H>): void;
}
export interface AuthoredHookReview {
  readonly artifactHash: string;
  readonly author: string;
  readonly approvedBy?: string;
  readonly approved: boolean;
}
export function authoredHookApproved(hash: string, review: AuthoredHookReview | null): boolean {
  return /^[a-f0-9]{64}$/u.test(hash) && review !== null && review.artifactHash === hash
    && review.approved && review.author.length > 0 && review.approvedBy !== undefined
    && review.approvedBy.length > 0 && review.approvedBy !== review.author;
}
export function defineAuthoredLifecycle<H extends AuthoredHook>(definition: AuthoredLifecycleDefinition<H>): AuthoredLifecycleDefinition<H> {
  if (!(AUTHORED_KIND_HOOKS[definition.kind] as readonly string[]).includes(definition.hook)
    || !definition.definitionId.startsWith(`${definition.kind}:`)) throw new Error('authored_hook_kind_mismatch');
  return Object.freeze(definition);
}
class HookStop {
  constructor(readonly reason: string | null) {}
}
function immutable<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return Object.freeze(value.map(immutable)) as T;
  return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, immutable(entry)]))) as T;
}
export function executeAuthoredHook<H extends AuthoredHook>(
  definition: AuthoredLifecycleDefinition<H>, event: AuthoredHookEvent<H>, snapshot: ReadOnlySnapshot,
): HandlerResult {
  const effects: Effect[] = [];
  try {
    definition.run(Object.freeze({ apiVersion: AUTHORED_HOOK_API_VERSION,
      event: immutable(event), snapshot: immutable(snapshot),
      emit: (effect: Effect) => {
        if (effects.length >= MAX_EFFECTS_PER_HANDLER_RESULT) throw new HookStop('behaviour_effect_cap_exceeded');
        effects.push(immutable(effect));
      },
      block: (reason: string): never => { throw new HookStop(reason.slice(0, 256) || 'authored_hook_blocked'); },
      pass: (): never => { throw new HookStop(null); },
    }));
  } catch (error) {
    if (!(error instanceof HookStop)) return blockedResult('authored_hook_failed');
    if (error.reason !== null) return blockedResult(error.reason);
  }
  return effectsResult(effects, { continue: true });
}
export function authoredHookMatches(definition: AuthoredLifecycleDefinition, event: LifecycleEvent, view: ReadOnlySnapshot): boolean {
  if (event.type !== AUTHORED_HOOK_EVENTS[definition.hook]) return false;
  if (event.type === 'transition') return event.callbackId === definition.id && event.object.definitionId === definition.definitionId;
  if (event.type === 'questState' || event.type === 'questObjective') return (event.questId.startsWith('quest:') ? event.questId : `quest:${event.questId}`) === definition.definitionId;
  if (event.type === 'dialogueChoice') return event.dialogueId !== undefined && (event.dialogueId.startsWith('dialogue:') ? event.dialogueId : `dialogue:${event.dialogueId}`) === definition.definitionId;
  return view.target !== undefined && 'entityType' in view.target
    && view.target.entityType === (definition.kind === 'npc' ? 'npc' : 'object')
    && view.target.definitionId === definition.definitionId;
}
export interface AuthoredHookAuthority {
  readonly approved: () => boolean;
  /** Shared across nested raises in a reducer. False rejects the whole reducer. */
  readonly consume: () => boolean;
  readonly audit: (id: string, event: LifecycleEventType, effects: number) => void;
}
export function authoredHookRegistrations(
  definitions: readonly AuthoredLifecycleDefinition[], authority: AuthoredHookAuthority,
): readonly AnyHandlerRegistration[] {
  return definitions.map(definition => ({
    id: `authored-v2:${definition.id}`, eventType: AUTHORED_HOOK_EVENTS[definition.hook],
    source: definition.kind === 'quest' ? 'global' : 'target',
    match: definition.kind === 'quest' || definition.kind === 'dialogue'
      ? { kind: 'any' } : { kind: 'definition', definitionId: definition.definitionId },
    priority: 1000,
    handler: (event: LifecycleEvent, view: ReadOnlySnapshot) => {
      if (!authoredHookMatches(definition, event, view)) return effectsResult([], { continue: true });
      if (!authority.approved()) return blockedResult('authored_hook_approval_required');
      if (!authority.consume()) return blockedResult('authored_hook_invocation_limit');
      const result = executeAuthoredHook(definition, event as AuthoredHookEvent<AuthoredHook>, view);
      if (!('blocked' in result) && result.effects.length > 0) authority.audit(definition.id, event.type, result.effects.length);
      return result;
    },
  } as AnyHandlerRegistration));
}
/** Bind the already bounded #65 settlement result to a concrete definition. */
export function transitionCallbackEvent(
  object: { readonly entityType: 'object'; readonly id: string; readonly definitionId: string },
  firing: StateTransitionFiring,
): LifecycleEventByType['transition'] | null {
  return firing.run !== undefined && 'callback' in firing.run ? {
    type: 'transition', object, callbackId: firing.run.callback, transitionId: firing.transitionId,
    from: firing.from, to: firing.to,
  } : null;
}
export function objectStateEvents(
  object: { readonly entityType: 'object'; readonly id: string; readonly definitionId: string },
  from: Readonly<Record<string, StateValue>>, to: Readonly<Record<string, StateValue>>,
): readonly (LifecycleEventByType['stateExit'] | LifecycleEventByType['stateEnter'])[] {
  if (Object.keys({ ...from, ...to }).every(key => from[key] === to[key])) return [];
  return [{ type: 'stateExit', object, from, to }, { type: 'stateEnter', object, from, to }];
}

/** Event transitions share declaration ordering with the #65 settlement kernel.
 * Timed firings are deliberately supplied by its lazy settlement adapter. */
export function objectTransitionHookRegistrations(
  objects: Iterable<ObjectContentDefinition>, callbacks: readonly AuthoredLifecycleDefinition[],
  authority: AuthoredHookAuthority, engineVersion: number,
): readonly AnyHandlerRegistration[] {
  const registrations: AnyHandlerRegistration[] = [];
  for (const object of objects) {
    if (object.retired === true) continue;
    const transitions = object.components.transitions ?? [];
    const events = [...new Set(transitions.flatMap(t => t.on === undefined ? [] : [t.on]))];
    for (const eventType of events) registrations.push({
      id: `${object.id}.transition.${eventType}`, eventType, source: 'target',
      match: { kind: 'definition', definitionId: object.id }, priority: 1100,
      handler: (event: LifecycleEvent, view: ReadOnlySnapshot) => {
        if (view.target === undefined || !('state' in view.target)) return effectsResult([], { continue: true });
        const candidates = transitions.filter(t => {
          if (t.on !== event.type) return false;
          if (event.type === 'stateEnter') return !stateMatches(t.from, event.from) && stateMatches(t.from, event.to);
          if (event.type === 'stateExit') return stateMatches(t.from, event.from) && !stateMatches(t.from, event.to);
          return stateMatches(t.from, view.target !== undefined && 'state' in view.target ? view.target.state : {});
        });
        const selected = event.type === 'stateEnter' || event.type === 'stateExit' ? candidates : candidates.slice(0, 1);
        const effects: Effect[] = [];
        for (const transition of selected) {
          if (!authority.consume()) return blockedResult('authored_hook_invocation_limit');
          const from = event.type === 'stateEnter' || event.type === 'stateExit' ? event.from : view.target.state;
          const to = { ...(event.type === 'stateEnter' || event.type === 'stateExit' ? event.to : from), ...transition.to };
          const run = transition.run;
          if (run !== undefined) {
            let result: HandlerResult;
            if ('callback' in run) {
              const callback = callbacks.find(c => c.id === run.callback && c.definitionId === object.id && c.hook === 'onTransition');
              if (callback === undefined) return blockedResult('authored_transition_callback_missing');
              if (!authority.approved()) return blockedResult('authored_hook_approval_required');
              result = executeAuthoredHook(callback, { type: 'transition', object: {
                entityType: 'object', id: view.target.id, definitionId: object.id,
              }, callbackId: callback.id, transitionId: transition.id, from, to }, view);
              if (!('blocked' in result)) authority.audit(callback.id, 'transition', result.effects.length);
            } else {
              const graph = object.components.interactions?.find(i => i.id === run.graph);
              if (graph === undefined) return blockedResult('authored_transition_graph_missing');
              const handler = compileDataGraphInteraction(object.id, graph, engineVersion).handler as (e: LifecycleEvent, v: ReadOnlySnapshot) => HandlerResult;
              result = handler(event, view);
            }
            if ('blocked' in result) return result;
            effects.push(...result.effects);
          }
          if (transition.to !== undefined && Object.entries(transition.to).some(([key, value]) => from[key] !== value)) {
            effects.push({ setState: transition.to });
          }
          if (effects.length > MAX_EFFECTS_PER_HANDLER_RESULT) return blockedResult('behaviour_effect_cap_exceeded');
        }
        return effectsResult(effects, { continue: true });
      },
    } as AnyHandlerRegistration);
  }
  return registrations;
}
