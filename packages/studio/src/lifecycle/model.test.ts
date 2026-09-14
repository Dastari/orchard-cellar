import { describe, expect, it } from 'vitest';
import { parseLifecycleSourceBundle } from '@orchard/lifecycle-authoring';
import { validateLifecycleSourceBundleAst } from '@orchard/lifecycle-authoring/compiler';
import {
  acceptLifecycleSourceRevision,
  addLifecycleHandler,
  createLifecycleAuthoringState,
  deserializeLifecycleDraft,
  exportLifecycleSourceBundle,
  importLifecycleSourceBundle,
  lifecycleDraftStorageKey,
  persistLifecycleDraft,
  removeLifecycleHandlerAt,
  replaceLifecycleHandlerAt,
  restoreLifecycleDraft,
  serializeLifecycleDraft,
  type LifecycleDraftStorage,
  type StudioItemLifecycleSource,
} from './model.js';

const VALID_SOURCE = [
  "const recipes = ['recipe:wooden_pickaxe', 'recipe:wooden_sword'];",
  'for (const recipe of recipes) {',
  '  if (!context.player.findRecipe(recipe)) context.player.giveRecipe(recipe);',
  '}',
].join('\n');

function handler(overrides: Partial<StudioItemLifecycleSource> = {}): StudioItemLifecycleSource {
  return {
    itemId: 'item:fishing_handbook',
    id: 'item:fishing_handbook.on_use',
    event: 'onUse',
    prompt: 'Read handbook',
    source: VALID_SOURCE,
    triggers: ['secondary'],
    ...overrides,
  };
}

function validSourceJson(revision = 4): string {
  return JSON.stringify({
    format: 'orchard-lifecycle-source-v1',
    bundleId: 'orchard-items',
    revision,
    engineApiVersion: 1,
    handlers: [handler()],
  });
}

class MemoryStorage implements LifecycleDraftStorage {
  readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
  removeItem(key: string): void { this.values.delete(key); }
}

describe('Studio lifecycle authoring model', () => {
  it('uses the public compiler entry point for the current lifecycle package', () => {
    const bundle = parseLifecycleSourceBundle(JSON.parse(validSourceJson()));
    expect(() => validateLifecycleSourceBundleAst(bundle)).not.toThrow();
  });

  it('starts as an editable invalid draft and becomes valid through the real AST gate', () => {
    const empty = createLifecycleAuthoringState('orchard-items');
    expect(empty).toMatchObject({ dirty: true, valid: false });
    expect(empty.diagnostics.map((entry) => entry.code)).toContain('handler_count_invalid');

    const authored = addLifecycleHandler(empty, handler());
    expect(authored).toMatchObject({ dirty: true, valid: true });
    expect(authored.diagnostics).toEqual([]);
  });

  it('reports capability and syntax violations as source-scoped compiler diagnostics', () => {
    const unsafe = addLifecycleHandler(createLifecycleAuthoringState('orchard-items'), handler({
      source: "fetch('https://example.com/private');",
    }));
    expect(unsafe.valid).toBe(false);
    expect(unsafe.diagnostics).toContainEqual(expect.objectContaining({
      code: 'ast_invalid',
      path: 'handlers[0].source',
    }));
    expect(unsafe.diagnostics.find((entry) => entry.code === 'ast_invalid')?.message)
      .toContain('outside the lifecycle capability API');
  });

  it('increments exactly one revision for a change and returns to clean when reverted', () => {
    const imported = importLifecycleSourceBundle(validSourceJson());
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;

    const changed = replaceLifecycleHandlerAt(imported.value, 0, { prompt: 'Study handbook' });
    expect(changed).toMatchObject({ dirty: true, valid: true });
    expect(changed.bundle.revision).toBe(5);
    const changedAgain = replaceLifecycleHandlerAt(changed, 0, { source: `${VALID_SOURCE}\ncontext.item.consume(1);` });
    expect(changedAgain.bundle.revision).toBe(5);

    const revertedSource = replaceLifecycleHandlerAt(changedAgain, 0, { source: VALID_SOURCE });
    const reverted = replaceLifecycleHandlerAt(revertedSource, 0, { prompt: 'Read handbook' });
    expect(reverted).toMatchObject({ dirty: false, valid: true });
    expect(reverted.bundle.revision).toBe(4);
  });

  it('normalizes handler and trigger order into deterministic source exports', () => {
    let state = createLifecycleAuthoringState('orchard-items');
    state = addLifecycleHandler(state, handler({
      itemId: 'item:tea', id: 'item:tea.on_use', triggers: ['place', 'secondary', 'useAt', 'useWith'],
    }));
    state = addLifecycleHandler(state, handler());
    const first = exportLifecycleSourceBundle(state);
    const second = exportLifecycleSourceBundle(state);
    expect(first).toEqual(second);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.value.endsWith('\n')).toBe(true);
    const parsed = JSON.parse(first.value) as {
      handlers: Array<{ itemId: string; triggers: string[] }>;
    };
    expect(parsed.handlers.map((entry) => entry.itemId)).toEqual([
      'item:fishing_handbook', 'item:tea',
    ]);
    expect(parsed.handlers[1]?.triggers).toEqual(['secondary', 'useWith', 'useAt', 'place']);
    expect(() => parseLifecycleSourceBundle(parsed)).not.toThrow();
  });

  it('diagnoses every second callback for an item even when triggers are disjoint', () => {
    let state = addLifecycleHandler(createLifecycleAuthoringState('orchard-items'), handler({
      triggers: ['secondary'],
    }));
    state = addLifecycleHandler(state, handler({
      id: 'item:fishing_handbook.place',
      prompt: 'Place handbook',
      triggers: ['place'],
    }));
    expect(state.valid).toBe(false);
    expect(state.diagnostics).toContainEqual(expect.objectContaining({
      code: 'duplicate_item_lifecycle',
      path: 'handlers[1].itemId',
    }));
  });

  it('persists invalid or dirty work deterministically without using a browser global', () => {
    const imported = importLifecycleSourceBundle(validSourceJson());
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;
    const dirty = replaceLifecycleHandlerAt(imported.value, 0, { source: 'while (true) {}' });
    expect(dirty).toMatchObject({ dirty: true, valid: false });
    expect(serializeLifecycleDraft(dirty)).toBe(serializeLifecycleDraft(dirty));

    const storage = new MemoryStorage();
    expect(persistLifecycleDraft(storage, dirty)).toBe(true);
    const restored = restoreLifecycleDraft(storage, 'orchard-items');
    expect(restored.status).toBe('restored');
    if (restored.status !== 'restored') return;
    expect(restored.state).toEqual(dirty);
  });

  it('removes only a corrupt scoped draft and reports the import error', () => {
    const storage = new MemoryStorage();
    const key = lifecycleDraftStorageKey('orchard-items');
    storage.setItem(key, '{broken');
    storage.setItem(lifecycleDraftStorageKey('another-bundle'), '{}');

    const restored = restoreLifecycleDraft(storage, 'orchard-items');
    expect(restored.status).toBe('invalid');
    expect(storage.getItem(key)).toBeNull();
    expect(storage.getItem(lifecycleDraftStorageKey('another-bundle'))).toBe('{}');
  });

  it('accepts only valid revisions and keeps deletion as an editable invalid draft', () => {
    const imported = importLifecycleSourceBundle(validSourceJson());
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;
    const changed = replaceLifecycleHandlerAt(imported.value, 0, { prompt: 'Study handbook' });
    const accepted = acceptLifecycleSourceRevision(changed);
    expect(accepted).toMatchObject({ dirty: false, valid: true });
    expect(accepted.bundle.revision).toBe(5);

    const deleted = removeLifecycleHandlerAt(accepted, 0);
    expect(deleted).toMatchObject({ dirty: true, valid: false });
    expect(acceptLifecycleSourceRevision(deleted)).toBe(deleted);
    expect(exportLifecycleSourceBundle(deleted)).toEqual({
      ok: false,
      diagnostics: deleted.diagnostics,
    });
  });

  it('round-trips deterministic draft text independently of storage', () => {
    const imported = importLifecycleSourceBundle(validSourceJson());
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;
    const serialized = serializeLifecycleDraft(imported.value);
    const restored = deserializeLifecycleDraft(serialized);
    expect(restored).toEqual(imported);
  });
});
