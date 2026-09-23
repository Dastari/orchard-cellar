import { describe, expect, it } from 'vitest';
import { authoredHookApproved, authoredHookRegistrations, defineAuthoredLifecycle, executeAuthoredHook, objectStateEvents,
  objectTransitionHookRegistrations, transitionCallbackEvent, type AuthoredHookAuthority, type AuthoredLifecycleDefinition } from './authored-hooks.js';
import { createHandlerRegistry } from './registry.js';
import { raiseEvent } from './raise.js';
import type { ReadOnlySnapshot } from './snapshot.js';
import type { ObjectContentDefinition } from '../content/object-definition.js';
const object = { entityType: 'object', id: '42', definitionId: 'object:chest' } as const;
const tile = { spaceId: '1', x: 0, y: 0, tags: [] };
const snapshot: ReadOnlySnapshot = { tick: 1n, registry: { engineVersion: 1, revision: 1n, contentHash: 'test', definitions: {} },
  space: { id: '1', kind: 'world', tags: [] }, calendar: { minuteOfDay: 0, season: 'spring' }, nearbyObjects: [],
  target: { ...object, tags: [], tile, state: { open: false } } };
const actor = { entityType: 'player', id: 'actor' } as const;
const authority = (approved = true): AuthoredHookAuthority => ({ approved: () => approved, consume: () => true, audit: () => {} });
const hook = defineAuthoredLifecycle({ id: 'spawn', definitionId: object.definitionId, kind: 'object', hook: 'onSpawn', run(context) { context.emit({ setState: { open: true } }); } });
const erase = <H extends Parameters<typeof defineAuthoredLifecycle>[0]>(h: H): AuthoredLifecycleDefinition => h;
describe('authored lifecycle authority', () => {
  it('requires the exact approved hash and a different nonempty approver', () => {
    const hash = 'a'.repeat(64);
    const review = { artifactHash: hash, author: 'author', approvedBy: 'reviewer', approved: true };
    expect(authoredHookApproved(hash, review)).toBe(true);
    for (const invalid of [null, { ...review, artifactHash: 'b'.repeat(64) }, { ...review, approvedBy: 'author' }, { ...review, approved: false }, { ...review, approvedBy: '' }]) expect(authoredHookApproved(hash, invalid)).toBe(false);
  });
  it('routes matching callbacks, blocks unapproved ones and preserves other definitions', () => {
    const event = { type: 'spawn', subject: object } as const;
    const approved = createHandlerRegistry(authoredHookRegistrations([erase(hook)], authority()));
    expect(raiseEvent(approved, event, snapshot)).toEqual({ effects: [{ setState: { open: true } }] });
    const unapproved = createHandlerRegistry(authoredHookRegistrations([erase(hook)], authority(false)));
    expect(raiseEvent(unapproved, event, snapshot)).toEqual({ blocked: 'authored_hook_approval_required' });
    expect(raiseEvent(unapproved, event, { ...snapshot, target: { ...snapshot.target!, definitionId: 'object:other' } } as ReadOnlySnapshot)).toEqual({ effects: [] });
  });
  it('caps effects and rejects context mutation without exposing a mutable snapshot', () => {
    const cap = defineAuthoredLifecycle({ ...hook, run(context) { for (let i = 0; i < 65; i++) context.emit({ setState: { open: true } }); } });
    expect(executeAuthoredHook(cap, { type: 'spawn', subject: object }, snapshot)).toEqual({ blocked: 'behaviour_effect_cap_exceeded' });
    const mutator = defineAuthoredLifecycle({ ...hook, run(context) { (context.snapshot as { tick: bigint }).tick = 9n; } });
    expect(executeAuthoredHook(mutator, { type: 'spawn', subject: object }, snapshot)).toEqual({ blocked: 'authored_hook_failed' });
    expect(snapshot.tick).toBe(1n);
  });
  it('routes quest and dialogue ids without cross-definition invocation', () => {
    for (const [kind, hookName, event] of [
      ['quest', 'onQuestState', { type: 'questState', actor, questId: 'test', from: 'active', to: 'complete' }],
      ['quest', 'onObjective', { type: 'questObjective', actor, questId: 'test', objectiveId: 'talk', amount: 1 }],
      ['dialogue', 'onDialogueChoice', { type: 'dialogueChoice', actor, dialogueId: 'test', npc: { entityType: 'npc', id: '1' }, nodeId: 'hi', choiceId: 'bye' }],
    ] as const) {
      const definition = defineAuthoredLifecycle({ id: 'story', definitionId: `${kind}:test`, kind, hook: hookName, run(context) { context.block('story-hook'); } });
      const registry = createHandlerRegistry(authoredHookRegistrations([erase(definition)], authority()));
      expect(raiseEvent(registry, event, snapshot)).toEqual({ blocked: 'story-hook' });
      const wrong = createHandlerRegistry(authoredHookRegistrations([erase({ ...definition, definitionId: `${kind}:other` })], authority()));
      expect(raiseEvent(wrong, event, snapshot)).toEqual({ effects: [] });
    }
  });
  it('emits exit before enter only when state changes', () => {
    expect(objectStateEvents(object, { open: false }, { open: false })).toEqual([]);
    expect(objectStateEvents(object, { open: false }, { open: true }).map(e => e.type)).toEqual(['stateExit', 'stateEnter']);
  });
  it('binds transition callback references to the owning object and caps nested invocations', () => {
    const definition = { id: object.definitionId, kind: 'object', schemaVersion: 1, displayName: 'Chest', components: { transitions: [{ id: 'open', on: 'use', from: { open: false }, to: { open: true }, run: { callback: 'transition' } }] } } satisfies ObjectContentDefinition;
    const callback = defineAuthoredLifecycle({ id: 'transition', definitionId: object.definitionId, kind: 'object', hook: 'onTransition', run(context) { context.emit({ setLight: { enabled: true } }); } });
    const registry = createHandlerRegistry(objectTransitionHookRegistrations([definition], [erase(callback)], authority(), 1));
    expect(raiseEvent(registry, { type: 'use', actor, target: object }, snapshot)).toEqual({ effects: [{ setLight: { enabled: true } }, { setState: { open: true } }] });
    const missing = createHandlerRegistry(objectTransitionHookRegistrations([definition], [], authority(), 1));
    expect(raiseEvent(missing, { type: 'use', actor, target: object }, snapshot)).toEqual({ blocked: 'authored_transition_callback_missing' });
    const capped = createHandlerRegistry(authoredHookRegistrations([erase(hook)], { ...authority(), consume: () => false }));
    expect(raiseEvent(capped, { type: 'spawn', subject: object }, snapshot)).toEqual({ blocked: 'authored_hook_invocation_limit' });
    expect(transitionCallbackEvent(object, { transitionId: 'open', event: 'timed', atTick: 1n, from: {}, to: {}, run: { callback: 'transition' } })?.callbackId).toBe('transition');
  });
  it('executes graph references only when entering the matching state predicate', () => {
    const definition: ObjectContentDefinition = { id: object.definitionId, kind: 'object', schemaVersion: 1, displayName: 'Chest', components: {
      transitions: [{ id: 'opened', on: 'stateEnter', from: { open: true }, run: { graph: 'glow' } }],
      interactions: [{ id: 'glow', verb: 'stateEnter', conditions: [], effects: [{ setLight: { enabled: true } }] }],
    } };
    const registry = createHandlerRegistry(objectTransitionHookRegistrations([definition], [], authority(false), 1));
    const entered = { type: 'stateEnter', object, from: { open: false }, to: { open: true } } as const;
    expect(raiseEvent(registry, entered, snapshot)).toEqual({ effects: [{ setLight: { enabled: true } }] });
    expect(raiseEvent(registry, { ...entered, from: { open: true } }, snapshot)).toEqual({ effects: [] });
  });
  it('refuses a transition reference bound to another definition', () => {
    const definition: ObjectContentDefinition = { id: object.definitionId, kind: 'object', schemaVersion: 1, displayName: 'Chest', components: {
      transitions: [{ id: 'open', on: 'use', from: { open: false }, to: { open: true }, run: { callback: 'other' } }],
    } };
    const other = defineAuthoredLifecycle({ id: 'other', definitionId: 'object:other', kind: 'object', hook: 'onTransition', run(context) { context.pass(); } });
    const registry = createHandlerRegistry(objectTransitionHookRegistrations([definition], [other], authority(), 1));
    expect(raiseEvent(registry, { type: 'use', actor, target: object }, snapshot)).toEqual({ blocked: 'authored_transition_callback_missing' });
  });

});
