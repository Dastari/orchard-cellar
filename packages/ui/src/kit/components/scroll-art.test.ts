import { beforeAll, expect, it } from 'vitest';
import { uiTestArt } from '../lab/testing/art.js';
import { uiFixed } from '../layout/box.js';
import { uiScrollThumb } from '../layout/scroll.js';
import { UiRoot } from '../runtime/root.js';
import type { UiElement } from '../runtime/element.js';
import { uiScrollArea } from './layout.js';
import { uiText } from './text.js';
import { paintUiScrollbar, uiScrollRail, UI_SCROLL_RAIL } from './scroll-art.js';
import type { UiKitArt } from './art.js';
import type { UiSpace } from '../tokens.js';

let art: UiKitArt;
beforeAll(async () => { art = await uiTestArt(); });

function area(rows: number, padding: UiSpace, scrollStyle?: 'wood'): UiElement {
  const root = new UiRoot({ art, scale: 1 }); root.resize(200, 200);
  const scroll = uiScrollArea({ height: uiFixed(120), width: uiFixed(120), padding: { right: padding }, scrollStyle },
    Array.from({ length: rows }, (_, i) => uiText(`ROW ${i}`, { layout: { height: uiFixed(16), shrink: 0 } })));
  root.mount(scroll); root.arrange(); return scroll;
}
function drawn(element: UiElement): { dx: number; dy: number; dw: number; dh: number }[] {
  const calls: { dx: number; dy: number; dw: number; dh: number }[] = [];
  const context = { drawImage: (...a: number[]) => { calls.push({ dx: a[5]!, dy: a[6]!, dw: a[7]!, dh: a[8]! }); }, fillRect() {}, set fillStyle(_: string) {} } as unknown as CanvasRenderingContext2D;
  paintUiScrollbar(element, context, art); return calls;
}

it('draws the whole 6px rail inside every track width instead of cropping the art', () => {
  for (const padding of [4, 8, 16, 24] as const) {
    const element = area(30, padding), track = uiScrollThumb(element, 'y')!.track, rail = uiScrollRail(track, true);
    expect(rail.width).toBe(UI_SCROLL_RAIL);
    expect(rail.x + rail.width).toBeLessThanOrEqual(element.rect.x + element.rect.width);
    const calls = drawn(element);
    expect(calls.length).toBeGreaterThanOrEqual(6);
    for (const call of calls) { expect(call.dw).toBe(UI_SCROLL_RAIL); expect(call.dx).toBe(rail.x); }
  }
});

it('sizes the thumb to the visible share of the content, with a 12px floor', () => {
  const short = uiScrollThumb(area(9, 16), 'y')!, long = uiScrollThumb(area(30, 16), 'y')!, huge = uiScrollThumb(area(400, 16), 'y')!;
  expect(short.thumb.height).toBeGreaterThan(long.thumb.height);
  expect(long.thumb.height).toBe(Math.floor(120 * 120 / (30 * 16)));
  expect(huge.thumb.height).toBe(12);
});

it('paints game and default scroll areas identically', () => {
  const wood = drawn(area(30, 16, 'wood')), plain = drawn(area(30, 16));
  expect(wood).toEqual(plain);
});
