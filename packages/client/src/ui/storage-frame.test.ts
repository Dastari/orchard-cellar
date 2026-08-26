import { describe, expect, it } from 'vitest';
import {
  StorageFrameResizeController,
  layoutStorageFrame,
  type StorageFrameSpec,
} from './storage-frame.js';

const CHEST_SPEC: StorageFrameSpec = {
  title: 'CHEST',
  style: 'wood_parchment',
  preferredWidth: 380,
  resizable: true,
  panes: [
    { id: 'chest', label: 'CHEST', columns: 4, rows: 4 },
    { id: 'backpack', label: 'INVENTORY', columns: 5, rows: 4, columnGap: 3 },
  ],
  hotbar: { label: 'HOT BAR', columns: 9 },
};

describe('storage frame composition', () => {
  it('centers a single fixed inventory above a wider hotbar', () => {
    const layout = layoutStorageFrame({ width: 480, height: 270 }, {
      title: 'BARREL', style: 'wood', panes: [{ id: 'barrel', label: 'BARREL', columns: 4, rows: 2 }],
      hotbar: { columns: 9 },
    });
    expect(layout.frame.width).toBeGreaterThanOrEqual(layout.hotbar!.region.width + 34);
    expect(layout.panes[0]!.grid.x + layout.panes[0]!.grid.width / 2)
      .toBe(layout.frame.x + layout.frame.width / 2);
  });

  it('gives fixed panes equal outer and inter-pane gutters', () => {
    const layout = layoutStorageFrame({ width: 480, height: 270 }, CHEST_SPEC);
    const [chest, backpack] = layout.panes;
    const innerLeft = layout.frame.x + 17;
    const innerRight = layout.frame.x + layout.frame.width - 17;
    const gutters = [
      chest!.grid.x - innerLeft,
      backpack!.grid.x - (chest!.grid.x + chest!.grid.width),
      innerRight - (backpack!.grid.x + backpack!.grid.width),
    ];
    expect(Math.max(...gutters) - Math.min(...gutters)).toBeLessThanOrEqual(1);
    expect(chest!.labelPosition.x).toBe(chest!.slots[0]!.x);
    expect(backpack!.labelPosition.x).toBe(backpack!.slots[0]!.x);
    expect(layout.hotbar!.labelPosition.x).toBe(layout.hotbar!.slots[0]!.x);
  });

  it('never allows a composed frame to become narrower than its hotbar', () => {
    const layout = layoutStorageFrame({ width: 480, height: 270 }, CHEST_SPEC, {
      x: 200, y: 100, width: 100, height: 80,
    });
    expect(layout.frame.width).toBe(layout.minimumSize.width);
    expect(layout.hotbar).not.toBeNull();
    expect(layout.hotbar!.region.x).toBeGreaterThanOrEqual(layout.frame.x + 17);
    expect(layout.hotbar!.region.x + layout.hotbar!.region.width)
      .toBeLessThanOrEqual(layout.frame.x + layout.frame.width - 17);
  });

  it('clamps an oversized requested frame back inside the viewport', () => {
    const layout = layoutStorageFrame({ width: 480, height: 270 }, CHEST_SPEC, {
      x: -200, y: -100, width: 900, height: 700,
    });
    expect(layout.frame).toEqual({ x: 4, y: 4, width: 472, height: 262 });
  });

  it('shares surplus width between flexible panes while fixed grids retain their size', () => {
    const layout = layoutStorageFrame({ width: 600, height: 300 }, {
      title: 'CRAFTING', style: 'parchment', preferredWidth: 520,
      panes: [
        { id: 'craft', label: 'CRAFTING', columns: 3, rows: 3 },
        { id: 'recipes', label: 'RECIPES', columns: 1, rows: 1, minWidth: 100, sizing: 'flex', alignment: 'start' },
        { id: 'pack', label: 'BACKPACK', columns: 5, rows: 4, columnGap: 3 },
      ],
      hotbar: { columns: 9 },
    });
    expect(layout.style).toBe('parchment');
    expect(layout.panes[0]!.grid.width).toBe(88);
    expect(layout.panes[1]!.region.width).toBeGreaterThan(100);
    expect(layout.panes[2]!.grid.width).toBe(152);
  });

  it.each(['wood_parchment', 'wood', 'parchment'] as const)('supports the %s frame skin', (style) => {
    expect(layoutStorageFrame({ width: 480, height: 270 }, { ...CHEST_SPEC, style }).style).toBe(style);
  });
});

describe('storage frame corner resizing', () => {
  it('keeps the opposite corner anchored and clamps to the composition minimum', () => {
    const layout = layoutStorageFrame({ width: 640, height: 400 }, CHEST_SPEC);
    const controller = new StorageFrameResizeController();
    const handle = layout.resizeHandles.north_west;
    const point = { x: handle.x + 4, y: handle.y + 4 };
    expect(controller.pointerDown(point, 0, layout)).toBe(true);
    const resized = controller.pointerMove({ x: point.x + 500, y: point.y + 500 }, { width: 640, height: 400 });
    expect(resized).not.toBeNull();
    expect(resized!.x + resized!.width).toBe(layout.frame.x + layout.frame.width);
    expect(resized!.y + resized!.height).toBe(layout.frame.y + layout.frame.height);
    expect(resized!.width).toBe(layout.minimumSize.width);
    expect(resized!.height).toBe(layout.minimumSize.height);
    expect(controller.pointerUp()).toBe(true);
    expect(controller.active).toBe(false);
  });

  it('expands a south-east corner without moving the north-west anchor', () => {
    const layout = layoutStorageFrame({ width: 640, height: 400 }, CHEST_SPEC);
    const controller = new StorageFrameResizeController();
    const handle = layout.resizeHandles.south_east;
    const point = { x: handle.x + 4, y: handle.y + 4 };
    controller.pointerDown(point, 0, layout);
    const resized = controller.pointerMove({ x: point.x + 30, y: point.y + 20 }, { width: 640, height: 400 });
    expect(resized).toMatchObject({ x: layout.frame.x, y: layout.frame.y });
    expect(resized!.width).toBe(layout.frame.width + 30);
    expect(resized!.height).toBe(layout.frame.height + 20);
  });
});
