import { describe, expect, it } from 'vitest';
import { layoutStudioShellRegions } from './canvas-shell-layout.js';

describe('canvas Studio retained regions', () => {
  it('uses a full-height global rail and a full route canvas with floating drawers', () => {
    const layout = layoutStudioShellRegions(1280, 720);
    expect(layout.compact).toBe(false);
    expect(layout.globalNav.width).toBe(76);
    expect(layout.globalNav.y).toBe(layout.workingCanvas.y);
    expect(layout.globalNav.height).toBe(layout.workingCanvas.height);
    expect(layout.workingCanvas.x).toBe(layout.globalNav.x + layout.globalNav.width);
    expect(layout.toolDrawer.x).toBeGreaterThan(layout.workingCanvas.x);
    expect(layout.inspectorDrawer.x + layout.inspectorDrawer.width)
      .toBeLessThan(layout.workingCanvas.x + layout.workingCanvas.width);
    expect(layout.toolDrawer.y).toBeGreaterThan(layout.workingCanvas.y);
    expect(layout.inspectorDrawer.y).toBe(layout.toolDrawer.y);
  });

  it('overlays invisible resize hit regions on drawer frame edges without layout bars', () => {
    const layout = layoutStudioShellRegions(1280, 720);
    expect(layout.leftResizeHandle.width).toBe(12);
    expect(layout.rightResizeHandle.width).toBe(12);
    expect(layout.leftResizeHandle.x + layout.leftResizeHandle.width / 2)
      .toBe(layout.toolDrawer.x + layout.toolDrawer.width);
    expect(layout.rightResizeHandle.x + layout.rightResizeHandle.width / 2)
      .toBe(layout.inspectorDrawer.x);
    expect(layout.workingCanvas.width).toBe(1280 - 12 - layout.globalNav.width);
  });

  it('retains all regions in a narrow viewport without removing the canvas', () => {
    const layout = layoutStudioShellRegions(720, 540, { left: 400, right: 400 });
    expect(layout.compact).toBe(true);
    expect(layout.globalNav.width).toBe(68);
    expect(layout.toolDrawer.width).toBe(220);
    expect(layout.inspectorDrawer.width).toBe(220);
    for (const region of [layout.globalNav, layout.toolDrawer, layout.workingCanvas, layout.inspectorDrawer]) {
      expect(region.width).toBeGreaterThan(0);
      expect(region.height).toBeGreaterThan(0);
    }
  });

  it('is deterministic and clamps unsafe viewport sizes', () => {
    expect(layoutStudioShellRegions(0, 0)).toEqual(layoutStudioShellRegions(560, 420));
  });

  it('retains requested drawer widths within the 180–420 pixel limits', () => {
    const wide = layoutStudioShellRegions(1600, 900, { left: 360, right: 390 });
    expect(wide.toolDrawer.width).toBe(360);
    expect(wide.inspectorDrawer.width).toBe(390);
    const clamped = layoutStudioShellRegions(1800, 900, { left: 20, right: 800 });
    expect(clamped.toolDrawer.width).toBe(180);
    expect(clamped.inspectorDrawer.width).toBe(420);
  });
});
