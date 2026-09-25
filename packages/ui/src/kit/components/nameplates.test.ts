import { expect, it } from 'vitest';
import { createCanvas } from '@napi-rs/canvas';
import { uiNameplates } from './nameplates.js';
import { UiRoot } from '../runtime/root.js';
import { uiTestArt } from '../lab/testing/art.js';

it('restores the classic plate: white text on one semi-transparent black line, offline marked inline', async () => {
  const root = new UiRoot({ scale: 1, art: await uiTestArt() }); root.resize(200, 60);
  root.mount(uiNameplates({ labels: [{ id: 'bob', x: 60, y: 20, text: 'Farmer Bob' }, { id: 'toby', x: 120, y: 50, text: 'Toby', offline: true }] }));
  root.arrange();
  const plate = (id: string) => root.entries().find(({ element }) => element.id === `nameplate:${id}`)!.element;
  expect(plate('toby').label).toBe('Toby [offline]'); expect(plate('toby').rect.height).toBe(13); expect(plate('bob').rect.height).toBe(13);
  const canvas = createCanvas(200, 60), context = canvas.getContext('2d');
  context.fillStyle = '#ffffff'; context.fillRect(0, 0, 200, 60);
  root.drawInContext(context as unknown as CanvasRenderingContext2D, 0);
  const r = plate('bob').rect, pixels = context.getImageData(r.x, r.y, r.width, r.height).data;
  // Over white, 60% black leaves a grey backing; the name itself is pure white.
  expect([pixels[0], pixels[1], pixels[2]]).toEqual([102, 102, 102]);
  let white = 0; for (let i = 0; i < pixels.length; i += 4) if (pixels[i] === 255 && pixels[i + 1] === 255 && pixels[i + 2] === 255) white++;
  expect(white).toBeGreaterThan(20);
  root.dispose();
});
