import { describe, expect, it } from 'vitest';
import {
  closeStudioCanvasSplit,
  defaultStudioCanvasLayoutState,
  openStudioCanvasSplit,
  persistStudioCanvasLayoutState,
  resizeStudioCanvasSplit,
  restoreStudioCanvasLayoutState,
  rotateStudioCanvasSplit,
  selectStudioCanvasSecondary,
  studioCanvasLayoutSessionKey,
  studioCanvasNamedLayoutName,
  studioCanvasStateFromWorkspace,
  studioCanvasWorkspaceLayout,
} from './canvas-layout-state.js';

class MemoryStorage {
  readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
  removeItem(key: string): void { this.values.delete(key); }
}

describe('retained Canvas layout state', () => {
  it('keeps the first route visit full-canvas and scopes sessions by route document', () => {
    const storage = new MemoryStorage();
    const live = openStudioCanvasSplit(defaultStudioCanvasLayoutState(), '/build/tiles');
    expect(persistStudioCanvasLayoutState(storage, '/build/map', live)).toBe(true);
    expect(restoreStudioCanvasLayoutState(storage, '/build/map')).toEqual(live);
    expect(restoreStudioCanvasLayoutState(storage, '/build/map/terrain-lab'))
      .toEqual(defaultStudioCanvasLayoutState());
    expect(studioCanvasLayoutSessionKey('/build/map')).not
      .toBe(studioCanvasLayoutSessionKey('/build/map/terrain-lab'));
  });

  it('closes and reopens the same secondary route, ratio, and orientation', () => {
    const open = resizeStudioCanvasSplit(
      rotateStudioCanvasSplit(openStudioCanvasSplit(defaultStudioCanvasLayoutState(), '/build/tiles')),
      0.67,
    );
    const closed = closeStudioCanvasSplit(open);
    expect(closed).toMatchObject({
      splitOpen: false, secondaryPath: '/build/tiles', direction: 'column', ratio: 0.67,
    });
    expect(openStudioCanvasSplit(closed, closed.secondaryPath!)).toEqual(open);
  });

  it('clamps hostile ratios and ignores malformed secondary routes', () => {
    expect(resizeStudioCanvasSplit(defaultStudioCanvasLayoutState(), 10).ratio).toBe(0.75);
    expect(resizeStudioCanvasSplit(defaultStudioCanvasLayoutState(), -10).ratio).toBe(0.25);
    expect(openStudioCanvasSplit(defaultStudioCanvasLayoutState(), 'javascript:alert(1)'))
      .toEqual(defaultStudioCanvasLayoutState());
    expect(selectStudioCanvasSecondary(defaultStudioCanvasLayoutState(), '../author/items'))
      .toEqual(defaultStudioCanvasLayoutState());
  });

  it('round-trips a named workspace only for its exact primary route', () => {
    const state = resizeStudioCanvasSplit(
      openStudioCanvasSplit(defaultStudioCanvasLayoutState(), '/build/object'),
      0.6,
    );
    const workspace = studioCanvasWorkspaceLayout(state, '/build/map');
    expect(workspace).toEqual({
      direction: 'horizontal', primaryRoute: '/build/map', secondaryRoute: '/build/object', ratio: 0.6,
    });
    expect(studioCanvasStateFromWorkspace(workspace, '/build/map')).toEqual(state);
    expect(studioCanvasStateFromWorkspace(workspace, '/build/map/terrain-lab')).toBeNull();
  });

  it('fails soft from corrupt session storage and removes only that scoped record', () => {
    const storage = new MemoryStorage();
    const key = studioCanvasLayoutSessionKey('/build/map');
    storage.setItem(key, '{broken');
    storage.setItem(studioCanvasLayoutSessionKey('/build/tiles'), '{}');
    expect(restoreStudioCanvasLayoutState(storage, '/build/map')).toEqual(defaultStudioCanvasLayoutState());
    expect(storage.getItem(key)).toBeNull();
    expect(storage.getItem(studioCanvasLayoutSessionKey('/build/tiles'))).toBe('{}');
    storage.setItem(key, JSON.stringify({ version: 99, splitOpen: true,
      direction: 'column', ratio: 0.7, secondaryPath: '/build/tiles' }));
    expect(restoreStudioCanvasLayoutState(storage, '/build/map'))
      .toEqual(defaultStudioCanvasLayoutState());
  });

  it('derives a bounded deterministic human name from the tool and document route', () => {
    expect(studioCanvasNamedLayoutName('  Map   Editor ', '/build/map/terrain-lab'))
      .toBe('Map Editor · terrain-lab');
    expect(studioCanvasNamedLayoutName('x'.repeat(100), 'not-a-route'))
      .toBe(`${'x'.repeat(40)} · workspace`);
  });
});
