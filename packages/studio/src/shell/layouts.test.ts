import { describe, expect, it } from 'vitest';
import { STUDIO_LAYOUT_STORAGE_KEY, StudioLayoutManager, defaultStudioLayout } from './layouts.js';

class MemoryStorage {
  readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

describe('Studio saved layouts', () => {
  it('saves and restores named versioned layouts per mode', () => {
    const storage = new MemoryStorage();
    const first = new StudioLayoutManager(storage);
    first.save({ ...defaultStudioLayout('build'), name: 'Wide map' });
    const restored = new StudioLayoutManager(storage).load('Wide map', 'build');
    expect(restored).toMatchObject({ version: 1, name: 'Wide map', mode: 'build' });
    expect(restored.docks.map(({ id }) => id)).toContain('world_outliner');
  });

  it('migrates the version-zero dock-id list and persists version one', () => {
    const storage = new MemoryStorage();
    storage.setItem(STUDIO_LAYOUT_STORAGE_KEY, JSON.stringify([{
      version: 0, name: 'Old author', mode: 'author', docks: ['content_browser', 'inspector', 'validation'],
    }]));
    const migrated = new StudioLayoutManager(storage).load('Old author', 'author');
    expect(migrated.version).toBe(1);
    expect(migrated.docks).toEqual([
      expect.objectContaining({ id: 'content_browser', placement: 'left' }),
      expect.objectContaining({ id: 'inspector', placement: 'right' }),
      expect.objectContaining({ id: 'validation', placement: 'bottom' }),
    ]);
    expect(storage.getItem(STUDIO_LAYOUT_STORAGE_KEY)).toContain('"version":1');
  });

  it('persists a bounded two-pane workspace and migrates old layouts to one pane', () => {
    const storage = new MemoryStorage();
    const layouts = new StudioLayoutManager(storage);
    const split = layouts.saveWorkspace('Terrain review', 'build', {
      direction: 'vertical', primaryRoute: '/build/map', secondaryRoute: '/build/tiles', ratio: 0.9,
    });
    expect(split.workspace).toEqual({
      direction: 'vertical', primaryRoute: '/build/map', secondaryRoute: '/build/tiles', ratio: 0.8,
    });
    expect(new StudioLayoutManager(storage).load('Terrain review', 'build').workspace).toEqual(split.workspace);

    storage.setItem(STUDIO_LAYOUT_STORAGE_KEY, JSON.stringify([{
      version: 1, name: 'Pre-split', mode: 'author', docks: [],
    }]));
    expect(new StudioLayoutManager(storage).load('Pre-split', 'author').workspace)
      .toEqual({ direction: 'horizontal', primaryRoute: null, secondaryRoute: null, ratio: 0.5 });
  });

  it('falls back safely from corrupt session state', () => {
    const storage = new MemoryStorage(); storage.setItem(STUDIO_LAYOUT_STORAGE_KEY, '{broken');
    expect(new StudioLayoutManager(storage).load('missing', 'observe')).toEqual(defaultStudioLayout('observe'));
  });

  it('normalizes bounded names and rejects blank or oversized named layouts', () => {
    const layouts = new StudioLayoutManager(new MemoryStorage());
    layouts.save({ ...defaultStudioLayout('build'), name: '  Map   Review  ' });
    expect(layouts.layouts('build').map(({ name }) => name)).toEqual(['Map Review']);
    expect(() => layouts.save({ ...defaultStudioLayout('build'), name: ' ' }))
      .toThrow('Invalid Studio layout');
    expect(() => layouts.save({ ...defaultStudioLayout('build'), name: 'x'.repeat(65) }))
      .toThrow('Invalid Studio layout');
  });
});
