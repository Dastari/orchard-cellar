import { describe, expect, it } from 'vitest';
import {
  CELLAR_WALL_OUTPUT_ITEM_TAG,
  SOIL_TILL_OUTPUT_ITEM_TAG,
  runtimeItemKindForUniqueTag,
} from './runtime.js';
import { bootstrapContentRegistry } from './bootstrap-registry.js';

const base = bootstrapContentRegistry();

describe('ambient output item authority', () => {
  it('resolves both canonical outputs by one active semantic claim', () => {
    expect(runtimeItemKindForUniqueTag(base, CELLAR_WALL_OUTPUT_ITEM_TAG)).toBe('pebble');
    expect(runtimeItemKindForUniqueTag(base, SOIL_TILL_OUTPUT_ITEM_TAG)).toBe('fiber');
  });

  it('follows a renamed item definition and fails closed for missing, retired or duplicate claims', () => {
    const source = base.items.get('item:pebble')!;
    const renamed = { ...source, id: 'item:renamed_wall_output' as typeof source.id };
    const renamedItems = new Map(base.items);
    renamedItems.delete(source.id);
    renamedItems.set(renamed.id, renamed);
    expect(runtimeItemKindForUniqueTag({ items: renamedItems }, CELLAR_WALL_OUTPUT_ITEM_TAG))
      .toBe('renamed_wall_output');

    const missing = new Map(renamedItems);
    missing.delete(renamed.id);
    expect(runtimeItemKindForUniqueTag({ items: missing }, CELLAR_WALL_OUTPUT_ITEM_TAG)).toBeNull();

    const retired = new Map(renamedItems);
    retired.set(renamed.id, { ...renamed, retired: true });
    expect(runtimeItemKindForUniqueTag({ items: retired }, CELLAR_WALL_OUTPUT_ITEM_TAG)).toBeNull();

    const duplicate = new Map(renamedItems);
    duplicate.set('item:duplicate_wall_output', {
      ...renamed,
      id: 'item:duplicate_wall_output' as typeof source.id,
    });
    expect(runtimeItemKindForUniqueTag({ items: duplicate }, CELLAR_WALL_OUTPUT_ITEM_TAG)).toBeNull();
  });
});
