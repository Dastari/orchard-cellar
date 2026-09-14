import { describe, expect, it, vi } from 'vitest';
import { beginPainterItem, endPainterItem, saveSpriteTransform, restoreSpriteTransform } from './painter-context.js';
describe('painter context ownership', () => {
  it('uses one native state pair per item for layered ordinary and transformed sprites', () => {
    const matrix = {} as DOMMatrix;
    const context = { save: vi.fn(), restore: vi.fn(), getTransform: vi.fn(() => matrix), setTransform: vi.fn() };
    const ctx = context as unknown as CanvasRenderingContext2D;
    for (let item = 0; item < 283; item++) {
      const nested = beginPainterItem(ctx);
      try {
        for (let layer = 0; layer < 8; layer++) {
          const saved = saveSpriteTransform(ctx, layer % 2 === 0);
          restoreSpriteTransform(ctx, saved);
        }
      } finally { endPainterItem(ctx, nested); }
    }
    expect(context.save).toHaveBeenCalledTimes(283);
    expect(context.restore).toHaveBeenCalledTimes(283);
    expect(context.setTransform).toHaveBeenCalledTimes(283 * 4);
    expect(context.setTransform).toHaveBeenCalledWith(matrix);
  });
  it('retains native isolation outside the painter and releases ownership after errors', () => {
    const context = { save: vi.fn(), restore: vi.fn() };
    const ctx = context as unknown as CanvasRenderingContext2D;
    const saved = saveSpriteTransform(ctx, false);
    expect(saved).toBeNull(); restoreSpriteTransform(ctx, saved);
    expect(() => {
      const nested = beginPainterItem(ctx);
      try { throw new Error('draw failure'); } finally { endPainterItem(ctx, nested); }
    }).toThrow('draw failure');
    expect(saveSpriteTransform(ctx, false)).toBeNull();
    restoreSpriteTransform(ctx, null);
    expect(context.save).toHaveBeenCalledTimes(3);
    expect(context.restore).toHaveBeenCalledTimes(3);
  });
});
