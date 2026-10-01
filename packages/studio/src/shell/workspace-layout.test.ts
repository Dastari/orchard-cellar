import { describe, expect, it } from 'vitest';
import { clampStudioDrawerWidth, normalizeStudioWorkspaceView, persistStudioWorkspaceView, restoreStudioWorkspaceView, studioWorkspaceLayoutDocks, studioWorkspaceViewFromDocks } from './workspace-layout.js';
import { defaultStudioLayout, StudioLayoutManager } from './layouts.js';

describe('Studio workspace preferences', () => {
  it('retains an independent panel view for each route', () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
    persistStudioWorkspaceView(storage, '/author/items', 'inspector');
    persistStudioWorkspaceView(storage, '/build/map', 'none');
    expect(restoreStudioWorkspaceView(storage, '/author/items')).toBe('inspector');
    expect(restoreStudioWorkspaceView(storage, '/build/map')).toBe('none');
    expect(restoreStudioWorkspaceView(storage, '/observe/console')).toBe('both');
  });

  it('recovers invalid or unavailable storage without hiding the default panels', () => {
    expect(normalizeStudioWorkspaceView('bad')).toBe('both');
    expect(restoreStudioWorkspaceView({ getItem: () => { throw Error('denied'); }, setItem: () => undefined }, '/build/map')).toBe('both');
    expect(() => persistStudioWorkspaceView({ getItem: () => null, setItem: () => { throw Error('denied'); } }, '/build/map', 'none')).not.toThrow();
  });

  it('normalizes physical widths before logical layout consumes them', () => {
    expect(clampStudioDrawerWidth(Infinity, 286)).toBe(286);
    expect(clampStudioDrawerWidth(NaN, 286)).toBe(286);
    expect(clampStudioDrawerWidth('900', 270)).toBe(270);
    expect(clampStudioDrawerWidth(-200, 270)).toBe(236);
    expect(clampStudioDrawerWidth(10000, 270)).toBe(960);
    expect(clampStudioDrawerWidth(300.5, 270)).toBe(301);
  });

  it.each(['both', 'controls', 'inspector', 'none'] as const)('restores %s panels through persisted named layouts for every mode', view => {
    for (const mode of ['build', 'author', 'operate', 'observe'] as const) {
      const values = new Map<string, string>();
      const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
      const current = defaultStudioLayout(mode);
      const docks = studioWorkspaceLayoutDocks(current.docks, { left: 320, right: 360 }, view);
      new StudioLayoutManager(storage).save({ ...current, name: 'Review', docks });
      const restored = new StudioLayoutManager(storage).load('Review', mode);
      expect(studioWorkspaceViewFromDocks(restored.docks)).toBe(view);
      expect(restored.docks.find(dock => dock.placement === 'left')!.size).toBe(320);
      expect(restored.docks.find(dock => dock.placement === 'right')!.size).toBe(360);
      expect(restored.docks.find(dock => dock.placement === 'bottom')).toEqual(current.docks.find(dock => dock.placement === 'bottom'));
    }
  });
});
