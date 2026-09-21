import { createCanvas } from '@napi-rs/canvas';
import { expect, it } from 'vitest';
import { UiRoot } from '../runtime/root.js';
import { uiTestArt } from '../lab/testing/art.js';
import { uiSystemCursor } from './system-cursor.js';
it('keeps the hotspot at the pointer edge and expires the four-frame click cue', async () => {
  let point = { x: 30.6, y: 15.6 };
  const root = new UiRoot({ art: await uiTestArt(), scale: 1 }); root.resize(32, 32);
  const cursor = uiSystemCursor({ point: () => point, clickedAt: () => 100 }); root.mount(cursor); root.arrange();
  expect(cursor.props['hotspot']).toEqual({ x: 31, y: 16 });
  expect(root.pointer({ type: 'down', point: { x: 31, y: 16 }, button: 0, pointerId: 1 })).toBe(false);
  point = { x: 16, y: 16 };
  const canvas = createCanvas(32, 32), context = canvas.getContext('2d') as unknown as CanvasRenderingContext2D;
  const frames = [100, 170, 240, 310, 380].map(now => { root.draw(context, now); return canvas.toBuffer('image/png').toString('base64'); });
  expect(new Set(frames).size).toBe(5);
  root.draw(context, 1000); expect(canvas.toBuffer('image/png').toString('base64')).toBe(frames[4]);
  root.dispose();
});
