import { parseLifecycleSourceBundle } from '@orchard/lifecycle-authoring';
import { describe, expect, it } from 'vitest';
import { ITEMS_LIFECYCLE_BUNDLE_ID, ItemsLifecycleDraft } from './lifecycle.js';
import type { LifecycleDraftStorage } from '../../lifecycle/model.js';

const RECIPE_BOOK_SOURCE = [
  "const recipes = ['recipe:wooden_pickaxe', 'recipe:wooden_sword'];",
  'for (const recipe of recipes) {',
  '  if (!context.player.findRecipe(recipe)) context.player.giveRecipe(recipe);',
  '}',
].join('\n');

class MemoryStorage implements LifecycleDraftStorage {
  readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
  removeItem(key: string): void { this.values.delete(key); }
}

describe('Items lifecycle draft integration', () => {
  it('attaches recipe-book code to an item and exports a compiler-valid deterministic bundle', async () => {
    const storage = new MemoryStorage();
    const draft = new ItemsLifecycleDraft({ storage });
    const created = draft.create('item:marlow_book');
    draft.update(created.id, {
      prompt: 'READ RECIPE BOOK',
      source: RECIPE_BOOK_SOURCE,
      triggers: ['secondary'],
    });

    expect(draft.snapshot()).toMatchObject({ valid: true, dirty: true });
    expect(draft.handlers('item:marlow_book')).toEqual([
      expect.objectContaining({ prompt: 'READ RECIPE BOOK', source: RECIPE_BOOK_SOURCE, triggers: ['secondary'] }),
    ]);
    const first = draft.export();
    const second = draft.export();
    expect(second).toEqual(first);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(() => parseLifecycleSourceBundle(JSON.parse(first.value))).not.toThrow();

    const download = draft.download();
    expect(download.ok).toBe(true);
    if (!download.ok) return;
    expect(download.value).toMatchObject({
      filename: `${ITEMS_LIFECYCLE_BUNDLE_ID}-r1.lifecycle.json`,
      json: first.value,
    });
    expect(await download.value.blob.text()).toBe(first.value);

    const restored = new ItemsLifecycleDraft({ storage });
    expect(restored.handlers('item:marlow_book')[0]?.source).toBe(RECIPE_BOOK_SOURCE);
  });

  it('keeps invalid edits as local drafts while refusing warm-release export', () => {
    const draft = new ItemsLifecycleDraft();
    const created = draft.create('item:marlow_book');
    draft.update(created.id, { source: "fetch('https://example.invalid');", triggers: [] });
    expect(draft.snapshot().valid).toBe(false);
    expect(draft.snapshot().diagnostics.map(({ code }) => code)).toEqual(expect.arrayContaining([
      'ast_invalid', 'trigger_invalid',
    ]));
    expect(draft.export().ok).toBe(false);
  });

  it('cannot create a second callback for an item', () => {
    const draft = new ItemsLifecycleDraft();
    const created = draft.create('item:marlow_book');
    const before = draft.snapshot();
    expect(() => draft.create('item:marlow_book'))
      .toThrow('duplicate_item_lifecycle:item:marlow_book');
    expect(draft.snapshot()).toBe(before);
    expect(draft.handlers('item:marlow_book')).toEqual([created]);
  });

  it('imports atomically and supports canonical trigger toggles and removal', () => {
    const source = new ItemsLifecycleDraft();
    const created = source.create('item:marlow_book');
    source.toggleTrigger(created.id, 'place');
    const exported = source.export();
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;

    const target = new ItemsLifecycleDraft();
    expect(target.import(exported.value).ok).toBe(true);
    expect(target.handlers('item:marlow_book')[0]?.triggers).toEqual(['secondary', 'place']);
    expect(target.remove(created.id).bundle.handlers).toEqual([]);
    expect(target.snapshot().valid).toBe(false);
  });
});
