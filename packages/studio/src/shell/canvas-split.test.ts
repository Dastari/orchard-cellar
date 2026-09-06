import { describe, expect, it } from 'vitest';
import type { StudioToolRoute } from './tool-registry.js';
import {
  layoutStudioCanvasSplit,
  nextStudioSecondaryRoute,
  studioCanvasSplitRatioAtPoint,
} from './canvas-split.js';

const route = (id: string, path: string): StudioToolRoute => ({
  path, access: 'write', tool: { id, label: id, mode: 'build', icon: id, routes: [path], docks: [], commands: [] },
});

describe('one-canvas split workspace', () => {
  it('lays out bounded adjacent panes with an overlapping invisible hit band', () => {
    const bounds = { x: 10, y: 20, width: 800, height: 520 };
    const row = layoutStudioCanvasSplit(bounds, 'row', 0.5);
    expect(row.primary.x + row.primary.width).toBe(row.secondary.x);
    expect(row.primary.width + row.secondary.width).toBe(bounds.width);
    expect(row.handle.width).toBe(12);
    expect(row.handle.x + row.handle.width / 2).toBe(row.secondary.x);
    const column = layoutStudioCanvasSplit(bounds, 'column', 0.9);
    expect(column.primary.y + column.primary.height).toBe(column.secondary.y);
    expect(column.primary.height + column.secondary.height).toBe(bounds.height);
    expect(column.handle.height).toBe(12);
    expect(column.handle.y + column.handle.height / 2).toBe(column.secondary.y);
    expect(column.primary.height).toBeLessThanOrEqual(Math.round(bounds.height * 0.75));
  });

  it('enforces useful minimum panes and clamps pointer resize deterministically', () => {
    const bounds = { x: 10, y: 20, width: 800, height: 600 };
    expect(layoutStudioCanvasSplit(bounds, 'row', 0.1)).toMatchObject({
      primary: { width: 240 }, secondary: { width: 560 },
    });
    expect(layoutStudioCanvasSplit(bounds, 'row', 0.9)).toMatchObject({
      primary: { width: 560 }, secondary: { width: 240 },
    });
    expect(studioCanvasSplitRatioAtPoint(bounds, 'row', { x: -100, y: 40 })).toBe(0.3);
    expect(studioCanvasSplitRatioAtPoint(bounds, 'row', { x: 710, y: 40 })).toBe(0.7);
    expect(studioCanvasSplitRatioAtPoint(bounds, 'column', { x: 12, y: 320 })).toBe(0.5);
  });

  it('cycles permitted secondary routes with a distinct tool id', () => {
    const routes = [route('map', '/build/map'), route('object', '/build/object'), route('tiles', '/build/tiles')];
    expect(nextStudioSecondaryRoute(routes, 'map', null)?.path).toBe('/build/object');
    expect(nextStudioSecondaryRoute(routes, 'map', '/build/object')?.path).toBe('/build/tiles');
    expect(nextStudioSecondaryRoute(routes, 'map', '/build/tiles')?.path).toBe('/build/object');
    expect(nextStudioSecondaryRoute([routes[0]!], 'map', null)).toBeNull();
  });
});
