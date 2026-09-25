import { createCanvas } from '@napi-rs/canvas';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { ui, type UiKitArt } from '../components/index.js';
import { UiRoot } from '../runtime/root.js';
import { uiTestArt } from './testing/art.js';

let art: UiKitArt; beforeAll(async () => { art = await uiTestArt(); }); afterAll(() => vi.unstubAllGlobals());

// Owner UI fix item 1: at fractional device pixel ratios (Windows 125% / 150% display
// scaling) the book frame's nine-slice patches landed on fractional device pixels,
// leaving hairline seams where the 24px corner bands meet the page faces. Every patch
// must start and end on a device pixel.
it.each([[1, 1.25], [2, 1.25], [2, 1.5], [3, 1.25]] as const)('paints the book frame on whole device pixels at UI scale %s, DPR %s', (scale, dpr) => {
  const root = new UiRoot({ art, scale, dpr }); root.resize(700, 420);
  root.mount(ui.frame({ style: 'book', layout: { width: 'grow', height: 'grow' } })); root.arrange();
  const canvas = createCanvas(Math.ceil(700 * dpr), Math.ceil(420 * dpr));
  const context = canvas.getContext('2d') as unknown as CanvasRenderingContext2D;
  const bookImage = art.skin.book['book_open.base.0']!.asset.image;
  const edges: number[] = [];
  const drawImage = context.drawImage.bind(context) as (...args: unknown[]) => void;
  (context as unknown as { drawImage: (...args: unknown[]) => void }).drawImage = (...args: unknown[]) => {
    if (args[0] === bookImage && args.length === 9) {
      const [x, y, width, height] = args.slice(5) as number[];
      const m = context.getTransform();
      edges.push(x! * m.a + m.e, (x! + width!) * m.a + m.e, y! * m.d + m.f, (y! + height!) * m.d + m.f);
    }
    drawImage(...args);
  };
  root.draw(context);
  expect(edges.length).toBeGreaterThan(0);
  expect(edges.filter((edge) => Math.abs(edge - Math.round(edge)) > 1e-6)).toEqual([]);
  root.dispose();
});
