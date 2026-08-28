import { describe, expect, it } from 'vitest';
import { layoutUiFlex, layoutUiGrid, uiContainerVariant } from './layout.js';

describe('canvas design-system layout', () => {
  it('grows flex items, aligns their cross axis, and distributes remaining space', () => {
    expect(layoutUiFlex({ x: 10, y: 20, width: 101, height: 30 }, [
      { minSize: { width: 20, height: 10 }, grow: 1 },
      { minSize: { width: 20, height: 14 }, grow: 2 },
    ], { gap: 5, align: 'center' })).toEqual([
      { x: 10, y: 30, width: 38, height: 10 },
      { x: 53, y: 28, width: 58, height: 14 },
    ]);

    expect(layoutUiFlex({ x: 0, y: 0, width: 100, height: 12 }, [
      { minSize: { width: 10, height: 12 } },
      { minSize: { width: 10, height: 12 } },
      { minSize: { width: 10, height: 12 } },
    ], { justify: 'space_between' }).map((rect) => rect.x)).toEqual([0, 45, 90]);
  });

  it('wraps flex items without changing returned item order', () => {
    expect(layoutUiFlex({ x: 0, y: 0, width: 50, height: 40 }, [
      { minSize: { width: 22, height: 10 } },
      { minSize: { width: 22, height: 10 } },
      { minSize: { width: 22, height: 12 } },
    ], { gap: 4, wrap: true })).toEqual([
      { x: 0, y: 0, width: 22, height: 10 },
      { x: 26, y: 0, width: 22, height: 10 },
      { x: 0, y: 14, width: 22, height: 12 },
    ]);
  });

  it('shrinks preferred button widths to their visual minimum without escaping the container', () => {
    const bounds = { x: 10, y: 20, width: 240, height: 22 };
    const rects = layoutUiFlex(bounds, [
      { minSize: { width: 32, height: 22 }, basis: 76, grow: 1 },
      { minSize: { width: 32, height: 22 }, basis: 106, grow: 1 },
      { minSize: { width: 32, height: 22 }, basis: 132, grow: 1 },
    ], { gap: 6, align: 'center' });
    expect(rects[0]?.width).toBeLessThan(76);
    expect(rects.at(-1)!.x + rects.at(-1)!.width).toBe(bounds.x + bounds.width);
    expect(rects.every((rect) => rect.x >= bounds.x
      && rect.x + rect.width <= bounds.x + bounds.width)).toBe(true);
  });

  it('creates automatic grid tracks and aligns fixed-size children inside them', () => {
    const layout = layoutUiGrid({ x: 0, y: 0, width: 100, height: 80 }, [
      { width: 12, height: 8 }, { width: 12, height: 8 }, { width: 12, height: 8 },
    ], {
      columns: 'auto', minColumnWidth: 30, columnGap: 4, rowHeight: 20,
      justifyItems: 'center', alignItems: 'end',
    });
    expect(layout.columns).toBe(3);
    expect(layout.cells.map((cell) => cell.width)).toEqual([31, 31, 30]);
    expect(layout.items).toEqual([
      { x: 10, y: 12, width: 12, height: 8 },
      { x: 45, y: 12, width: 12, height: 8 },
      { x: 79, y: 12, width: 12, height: 8 },
    ]);
  });

  it('selects variants from a component width rather than the viewport', () => {
    expect(uiContainerVariant(239)).toBe('compact');
    expect(uiContainerVariant(240)).toBe('regular');
    expect(uiContainerVariant(419)).toBe('regular');
    expect(uiContainerVariant(420)).toBe('wide');
  });
});
