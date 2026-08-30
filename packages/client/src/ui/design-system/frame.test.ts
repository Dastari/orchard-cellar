import { describe, expect, it } from 'vitest';
import {
  UiFrameResizeController,
  UI_BOOK_PAGE_REPEAT_SLICE,
  UI_FRAME_METRICS,
  layoutUiFrameSlots,
  uiBookPageRects,
  uiFrameBodyRect,
  uiFrameControlLayout,
  uiFrameContentRect,
  uiFrameResizeHandles,
} from './frame.js';

describe('design-system frames', () => {
  it('keeps content beyond each authored chrome slice', () => {
    const frame = { x: 10, y: 20, width: 200, height: 100 };
    expect(uiFrameContentRect(frame, 'wood')).toEqual({ x: 28, y: 38, width: 164, height: 64 });
    expect(uiFrameContentRect(frame, 'parchment')).toEqual({ x: 22, y: 32, width: 176, height: 76 });
    expect(uiFrameContentRect(frame, 'thin')).toEqual({ x: 18, y: 28, width: 184, height: 83 });
    expect(uiFrameContentRect(frame, 'wood_parchment')).toEqual({ x: 31, y: 41, width: 158, height: 58 });
  });

  it('lays named frame slots only inside the safe content rectangle', () => {
    const layout = layoutUiFrameSlots({ x: 0, y: 0, width: 180, height: 120 }, 'parchment', [
      { id: 'header', minSize: { width: 20, height: 14 } },
      { id: 'body', minSize: { width: 20, height: 20 }, grow: 1 },
      { id: 'footer', minSize: { width: 20, height: 18 } },
    ], { direction: 'column', gap: 4 });
    expect(layout.content).toEqual({ x: 12, y: 12, width: 156, height: 96 });
    expect(layout.slots.header).toEqual({ x: 12, y: 12, width: 156, height: 14 });
    expect(layout.slots.footer).toEqual({ x: 12, y: 90, width: 156, height: 18 });
    expect(layout.slots.body?.height).toBe(56);
  });

  it('protects the authored book gutter', () => {
    const [left, right] = uiBookPageRects({ x: 0, y: 0, width: 224, height: 133 });
    expect(left.x + left.width).toBeLessThan(right.x);
    expect(right.x - (left.x + left.width)).toBe(32);
    expect(left).toEqual({ x: 16, y: 16, width: 80, height: 101 });
    expect(right).toEqual({ x: 128, y: 16, width: 80, height: 101 });
  });

  it('mounts one consistent close control at each writable face top-left', () => {
    const frame = { x: 100, y: 80, width: 224, height: 133 };
    for (const style of ['wood', 'parchment', 'wood_parchment', 'thin', 'book', 'unframed'] as const) {
      const controls = uiFrameControlLayout(frame, style);
      const content = uiFrameContentRect(frame, style);
      expect(controls.close).toEqual({ x: content.x, y: content.y, width: 22, height: 22 });
      expect(controls.close.x + controls.close.width).toBeLessThanOrEqual(content.x + content.width);
      expect(controls.close.y + controls.close.height).toBeLessThanOrEqual(content.y + content.height);
    }
  });

  it('starts closable window flow below the shared control lane', () => {
    const frame = { x: 100, y: 80, width: 224, height: 160 };
    const close = uiFrameControlLayout(frame, 'wood_parchment').close;
    const body = uiFrameBodyRect(frame, 'wood_parchment', 6);
    expect(body.y).toBe(close.y + close.height + 4);
    expect(body.x).toBe(uiFrameContentRect(frame, 'wood_parchment', 6).x);
    expect(body.y + body.height).toBe(uiFrameContentRect(frame, 'wood_parchment', 6).y
      + uiFrameContentRect(frame, 'wood_parchment', 6).height);
  });

  it('allows the authored book proportions to reflow above their natural minimum', () => {
    expect(UI_FRAME_METRICS.book.minimumSize).toEqual({ width: 224, height: 133 });
    expect(UI_FRAME_METRICS.book.resizable).toBe(true);
    expect(UI_BOOK_PAGE_REPEAT_SLICE).toEqual([24, 24, 24, 24]);
  });

  it('keeps book paging actions on the lower outer corners', () => {
    const frame = { x: 10, y: 20, width: 224, height: 133 };
    const controls = uiFrameControlLayout(frame, 'book');
    expect(controls.firstPage?.x).toBe(18);
    expect(controls.previousPage?.x).toBe(46);
    expect(controls.nextPage?.x).toBe(174);
    expect(controls.lastPage?.x).toBe(202);
    expect(controls.firstPage?.y).toBe(157);
  });

  it('resizes from every corner while keeping the opposite one fixed', () => {
    const frame = { x: 100, y: 80, width: 200, height: 120 };
    const controller = new UiFrameResizeController();
    const handle = uiFrameResizeHandles(frame).north_west;
    const start = { x: handle.x + 6, y: handle.y + 6 };
    expect(controller.pointerDown(start, 0, frame, { width: 140, height: 90 })).toBe(true);
    expect(controller.pointerMove({ x: start.x + 90, y: start.y + 60 }, {
      x: 0, y: 0, width: 500, height: 400,
    })).toEqual({ x: 160, y: 110, width: 140, height: 90 });
    expect(controller.pointerUp()).toBe(true);
    expect(controller.active).toBe(false);
  });
});
