import { beforeEach, describe, expect, it, vi } from 'vitest';

const draw = vi.hoisted(() => ({ frame: vi.fn(), button: vi.fn(), text: vi.fn() }));
vi.mock('../design-system/frame.js', async (original) => ({
  ...await original<typeof import('../design-system/frame.js')>(),
  drawUiFrame: draw.frame,
}));
vi.mock('../design-system/fantasy-controls.js', () => ({ drawFantasyButton: draw.button }));
vi.mock('../pixel-ui.js', () => ({ drawPixelTextInRect: draw.text }));

import {
  drawStudioCanvasTable,
  hitStudioCanvasTable,
  layoutStudioCanvasTable,
  scrollStudioCanvasTable,
} from './canvas-table.js';
import type { StudioCanvasShellArt } from './canvas-shell.js';

const model = {
  columns: [{ id: 'name', label: 'Name', width: 100 }, { id: 'kind', label: 'Kind', minWidth: 50 }],
  rows: Array.from({ length: 9 }, (_, index) => ({ id: `row-${index}`, cells: [`Name ${index}`, `Kind ${index}`],
    selected: index === 3, disabled: index === 4 })),
  scrollRow: 3,
  focusedCell: { rowId: 'row-3', columnId: 'kind' },
  rowHeight: 20,
  headerHeight: 20,
};

function context(): CanvasRenderingContext2D {
  const value = { save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), rect: vi.fn(), clip: vi.fn(), globalAlpha: 1 };
  return value as unknown as CanvasRenderingContext2D;
}

describe('canvas-native Studio table', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lays out a clipped bounded row window and stable cell hits', () => {
    const layout = layoutStudioCanvasTable(model, { x: 0, y: 0, width: 300, height: 138 });
    expect(layout.firstRow).toBe(3);
    expect(layout.visibleRowCount).toBe(4);
    expect(layout.rows.map(({ id }) => id)).toEqual(['row-3', 'row-4', 'row-5', 'row-6']);
    const cell = layout.rows[0]!.cells[1]!;
    expect(hitStudioCanvasTable(layout, { x: cell.bounds.x + 1, y: cell.bounds.y + 1 })).toEqual({
      kind: 'cell', rowId: 'row-3', rowIndex: 3, columnId: 'kind', columnIndex: 1,
    });
    expect(scrollStudioCanvasTable(layout, 'page_down')).toBe(5);
    expect(scrollStudioCanvasTable(layout, 'home')).toBe(0);
    expect(scrollStudioCanvasTable(layout, 'end')).toBe(5);
  });

  it('renders headers, rows, focus, and text only through shared authored primitives', () => {
    const layout = layoutStudioCanvasTable(model, { x: 0, y: 0, width: 300, height: 138 });
    const ctx = context();
    drawStudioCanvasTable(ctx, {} as StudioCanvasShellArt, layout);
    expect(draw.button).toHaveBeenCalledTimes(2);
    expect(draw.frame).toHaveBeenCalledWith(ctx, undefined, layout.bounds, 'wood_parchment');
    expect(draw.frame.mock.calls.some((call) => call[3] === 'wood')).toBe(true);
    expect(draw.text).toHaveBeenCalledTimes(8);
    expect(ctx.rect).toHaveBeenCalledWith(layout.viewport.x, layout.viewport.y,
      layout.viewport.width, layout.viewport.height);
  });

  it('supports a thin nested-workspace frame without changing the standalone default', () => {
    const layout = layoutStudioCanvasTable({ ...model, frameStyle: 'thin' },
      { x: 0, y: 0, width: 300, height: 138 });
    const ctx = context();
    drawStudioCanvasTable(ctx, {} as StudioCanvasShellArt, layout);
    expect(layout.frameStyle).toBe('thin');
    expect(draw.frame).toHaveBeenCalledWith(ctx, undefined, layout.bounds, 'thin');
  });

  it('rejects ambiguous rows and columns before layout', () => {
    expect(() => layoutStudioCanvasTable({ ...model,
      columns: [{ id: 'same', label: 'A' }, { id: 'same', label: 'B' }] },
    { x: 0, y: 0, width: 200, height: 100 })).toThrow('studio_canvas_table_columns_invalid');
    expect(() => layoutStudioCanvasTable({ ...model,
      rows: [{ id: '', cells: [] }] }, { x: 0, y: 0, width: 200, height: 100 }))
      .toThrow('studio_canvas_table_rows_invalid');
  });

  it('defaults to the enlarged Studio interaction scale', () => {
    const layout = layoutStudioCanvasTable({ ...model, rowHeight: undefined, headerHeight: undefined },
      { x: 0, y: 0, width: 300, height: 260 });
    expect(layout.rowHeight).toBe(40);
    expect(layout.header.height).toBe(40);
  });
});
