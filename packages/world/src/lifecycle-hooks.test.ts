import { planObjectStateSettlement } from './content/object-state-runtime.js';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { authoredHookApproved, authoredHookRegistrations, defineAuthoredLifecycle, createHandlerRegistry, raiseEvent, isBlockedHandlerResult, type AuthoredHookAuthority } from '@orchard/sim';
const source = ts.createSourceFile('index.ts', readFileSync(new URL('./index.ts', import.meta.url), 'utf8'), ts.ScriptTarget.ESNext, true);
function load(names: readonly string[], dependencies: Record<string, unknown>): Record<string, (...args: unknown[]) => unknown> {
  const chunks = names.map(name => source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name)?.getText(source));
  if (chunks.some(c => c === undefined)) throw new Error('missing production function');
  const js = ts.transpileModule(chunks.join('\n') + `\nreturn {${names.join(',')}};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function(...Object.keys(dependencies), js)(...Object.values(dependencies)) as Record<string, (...args: unknown[]) => unknown>;
}
describe('production lifecycle bridge execution', () => {
  it('looks up the installed digest in trusted rows, shares the reducer budget and records hash audit', () => {
    const hash = 'a'.repeat(64); const lookedUp: string[] = []; const audits: unknown[] = [];
    const identity = (value: string) => ({ toHexString: () => value });
    let review: unknown = null;
    const ctx = { sender: identity('player'), timestamp: 123n, db: { studio_script_review: { artifactHash: { find: (key: string) => { lookedUp.push(key); return review; } } } } };
    const api = load(['authoredHookAuthority'], { AUTHORED_HOOK_BUNDLE_SHA256: hash, authoredHookInvocations: new WeakMap(), authoredHookApproved,
      insertLegacyAdminAudit: (_ctx: unknown, row: unknown) => audits.push(row) });
    const first = api['authoredHookAuthority']!(ctx) as AuthoredHookAuthority;
    expect(first.approved()).toBe(false);
    review = { artifactHash: hash, author: identity('author'), approvedBy: identity('reviewer'), approvedAt: 1n };
    expect(first.approved()).toBe(true); expect(lookedUp).toEqual([hash, hash]);
    const nested = api['authoredHookAuthority']!(ctx) as AuthoredHookAuthority;
    for (let i = 0; i < 32; i++) expect((i % 2 ? first : nested).consume()).toBe(true);
    expect(first.consume()).toBe(false);
    first.audit('object-open', 'stateEnter', 1);
    expect(audits).toEqual([expect.objectContaining({ action: 'authored_lifecycle_hook', value: JSON.stringify({ hash, id: 'object-open', event: 'stateEnter', effects: 1 }) })]);
    expect((api['authoredHookAuthority']!({ ...ctx }) as AuthoredHookAuthority).consume()).toBe(true);
  });
  it('persists changed state in exit/enter order, uses system snapshots and propagates blocked callbacks', () => {
    const raised: string[] = []; const applied: unknown[] = []; let blocked = false;
    let stored: unknown = null;
    const definition = { id: 'object:test', kind: 'object', schemaVersion: 1, displayName: 'Test',
      components: { states: { open: { type: 'bool', default: false } } } };
    const callbacks = (['onStateExit', 'onStateEnter'] as const).map(hook => defineAuthoredLifecycle({
      id: hook, definitionId: 'object:test', kind: 'object', hook,
      run(context) { raised.push(context.event.type); if (blocked) context.block('no'); context.emit({ setLight: { enabled: true } }); },
    }));
    const api = load(['raisePlaceableStateEvents'], {
      behaviourObjectSnapshot: (_ctx: unknown, row: unknown) => row,
      resolvePlaceableObject: (_registry: unknown, row: { state: unknown }) => ({ definition, state: row.state }),
      contentRegistry: () => ({}), objectGrowthTimeline: () => ({}), planObjectStateSettlement,
      AUTHORED_LIFECYCLE_HOOKS: callbacks, LIVE_CONTENT_PACK_ID: 'live', CONTENT_ENGINE_VERSION: 1,
      authoredHookAuthority: () => ({ approved: () => true, consume: () => true, audit: () => {} }),
      resolvedBehaviourTarget: () => ({ kind: 'placeable', id: 1n }), SenderError: Error,
      authorityBehaviourSnapshot: () => { throw new Error('must not use a player for system event'); },
      timerBehaviourSnapshot: (_ctx: unknown, target: unknown) => ({ target }),
      planPlaceableStateEffect: (_registry: unknown, _row: unknown, effect: { setState: unknown }) => ({ stateJson: JSON.stringify(effect.setState) }),
      applyWorldBehaviourEffects: (...args: unknown[]) => applied.push(args),
    });
    const ctx = { db: { object_lifecycle_state: { placeableId: { find: () => stored, update: (row: unknown) => { stored = row; } }, insert: (row: unknown) => { stored = row; } },
      world_clock: { id: { find: () => ({ authorityTick: 10n }) } }, content_head: { packId: { find: () => null } },
      world_placeable: { id: { update: () => {} } } } };
    const before = { id: '1', definitionId: 'object:test', state: { open: false } };
    api['raisePlaceableStateEvents']!(ctx, before, { ...before, state: { open: true } }, false);
    expect(raised).toEqual(['stateExit', 'stateEnter']); expect(applied).toHaveLength(1);
    expect(stored).toMatchObject({ definitionId: 'object:test', settledAtTick: 10n });
    blocked = true;
    expect(() => api['raisePlaceableStateEvents']!(ctx, before, { ...before, state: { open: true } }, false)).toThrow('no');
    expect(applied).toHaveLength(1);
  });
  it('routes production dialogue and quest notifications through their real authored registry', () => {
    const dialogue = defineAuthoredLifecycle({ id: 'dialogue', kind: 'dialogue', definitionId: 'dialogue:merchant', hook: 'onDialogueChoice', run(context) { context.block('dialogue-script'); } });
    const quest = defineAuthoredLifecycle({ id: 'quest', kind: 'quest', definitionId: 'quest:intro', hook: 'onQuestState', run(context) { context.block('quest-script'); } });
    const registry = createHandlerRegistry(authoredHookRegistrations([dialogue, quest], { approved: () => true, consume: () => true, audit: () => {} }));
    const ref = { entityType: 'npc', id: '1', definitionId: 'npc:merchant' };
    const target = { ref, snapshot: { ...ref, tags: [] } };
    const apply: unknown[] = [];
    const api = load(['raiseDialogueChoiceEvent', 'raiseSenderBehaviourEvent'], {
      resolvedBehaviourTarget: () => target, currentWorldBehaviourHandlers: () => registry,
      raiseEvent, isBlockedHandlerResult, SenderError: Error,
      authorityBehaviourSnapshot: (_ctx: unknown, snapshot?: unknown) => ({ target: snapshot }),
      applyWorldBehaviourEffects: (...args: unknown[]) => apply.push(args),
    });
    const ready = { identity: { find: () => ({}) } };
    const ctx = { sender: { toHexString: () => 'actor' }, db: {
      active_dialogue: { identity: { find: () => ({ dialogueId: 'merchant' }) } },
      player_position: ready, player_survival: ready, player_stats: ready, player_wallet: ready,
    } };
    expect(() => api['raiseDialogueChoiceEvent']!(ctx, 1n, 'hello', 'accept')).toThrow('dialogue-script');
    expect(() => api['raiseSenderBehaviourEvent']!(ctx, { type: 'questState', actor: { entityType: 'player', id: 'actor' }, questId: 'intro', from: 'active', to: 'complete' })).toThrow('quest-script');
    expect(apply).toEqual([]);
  });

});
