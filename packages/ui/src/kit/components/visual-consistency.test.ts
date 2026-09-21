import { createCanvas } from '@napi-rs/canvas';
import { afterEach, expect, it, vi } from 'vitest';
import { ui, UiRoot } from '../index.js';
import { paintUiSkin, uiElementTextContrast } from './art.js';
import { uiTestArt } from '../lab/testing/art.js';
import { resolveUiTextContrast } from '../skin/contrast.js';
import { uiScrollThumb } from '../layout/scroll.js';
import { uiFixed } from '../layout/box.js';

afterEach(() => vi.unstubAllGlobals());
it('keeps tiled faces opaque at fractional device scales without stretching the source tiles', async () => {
  vi.stubGlobal('OffscreenCanvas', class { constructor(width: number, height: number) { return createCanvas(width, height); } });
  const art = await uiTestArt();
  for (const scale of [1, 1.25, 1.5, 2.5]) {
    const canvas = createCanvas(400, 100), context = canvas.getContext('2d'); context.scale(scale, scale);
    paintUiSkin(context as unknown as CanvasRenderingContext2D, art.skin.button, 'primary.md.chamfered.idle', { x: 0, y: 0, width: 140, height: 24 });
    const pixels = context.getImageData(Math.ceil(6 * scale), Math.ceil(6 * scale), Math.floor(120 * scale), Math.floor(10 * scale)).data;
    for (let index = 3; index < pixels.length; index += 4) expect(pixels[index]).toBe(255);
  }
});
it('leaves an empty input centre transparent while retaining the authored border', async () => {
  const canvas = createCanvas(200, 40), context = canvas.getContext('2d');
  const root = new UiRoot({ scale: 1, art: await uiTestArt() }); root.resize(200, 40);
  root.mount(ui.input({ label: 'Name' })); root.draw(context as unknown as CanvasRenderingContext2D);
  expect(context.getImageData(20, 8, 1, 1).data[3]).toBe(0);
  expect([...context.getImageData(0, 0, 200, 24).data].some((value, index) => index % 4 === 3 && value > 0)).toBe(true);
  root.dispose();
});
it('uses the same button-face contrast for nested symbols and labels in each state', () => {
  const icon = ui.icon({ lucide: 'copy' }), label = ui.text('Create');
  const button = ui.button({ label: '', tone: 'success', children: [icon, label] });
  for (const disabled of [false, true]) {
    button.disabled = disabled;
    const expected = resolveUiTextContrast(disabled ? 'muted' : 'success', 'label', disabled ? 'button_disabled' : 'button_idle');
    expect(uiElementTextContrast(icon)).toEqual(expected); expect(uiElementTextContrast(label)).toEqual(expected);
  }
});
it('reserves the padded scroll gutter outside the field bounds', () => {
  const field = ui.input({ label: 'Name' });
  const scroll = ui.scrollArea({ width: uiFixed(120), height: uiFixed(60), padding: { right: 8 } }, [field, ui.spacer().setStyle({height:uiFixed(64),shrink:0})]);
  const root = new UiRoot({ scale: 1 }); root.resize(120, 60); root.mount(scroll); root.arrange();
  expect(field.rect.x + field.rect.width).toBeLessThanOrEqual(uiScrollThumb(scroll, 'y')!.track.x); root.dispose();
});
