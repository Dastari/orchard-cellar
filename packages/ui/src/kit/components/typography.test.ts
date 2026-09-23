/// <reference types="node" />
import { createCanvas } from '@napi-rs/canvas';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { fontMetrics, measurePixelText } from '../../pixel-ui.js';
import { UiRoot } from '../runtime/root.js';
import { uiFixed } from '../layout/box.js';
import { uiTestArt } from '../lab/testing/art.js';
import { UI_TEXT_METRICS } from '../tokens.js';
import { ui, type UiKitArt } from './index.js';
import { uiTextLines } from './text.js';
let art: UiKitArt;
beforeAll(async () => { art = await uiTestArt(); });
afterAll(() => vi.unstubAllGlobals());

it('measures and draws ordinary text roles with the loaded 5x7 glyphs', () => {
  for (const role of ['body', 'header', 'label', 'caption'] as const) for (const node of [ui.text('Harvest', { role }), ui.richText('Harvest', { role })]) {
    const root = new UiRoot({ art, scale: 1 }); root.resize(180, 40); root.mount(node);
    const context = createCanvas(180, 40).getContext('2d');
    const draw = vi.spyOn(context, 'drawImage'); root.draw(context as unknown as CanvasRenderingContext2D, 0);
    expect(art.pixel.font.name).toBe('font_5x7');
    expect(node.measured.preferred).toEqual({ width: measurePixelText('Harvest', 1, art.pixel.font), height: 10 });
    expect(draw.mock.calls).toHaveLength(7);
    for (const call of draw.mock.calls) expect(call.slice(3, 5)).toEqual([...art.pixel.font.font!.glyphSize]);
    expect(UI_TEXT_METRICS[role].glyphWidth).toBe(fontMetrics(art.pixel.font).glyphWidth);
    expect(UI_TEXT_METRICS[role].glyphHeight).toBe(fontMetrics(art.pixel.font).glyphHeight);
    expect(UI_TEXT_METRICS[role].glyphWidth + 1).toBe(fontMetrics(art.pixel.font).cellWidth);
    root.dispose();
  }
});

it('only draws the larger font for an explicit special heading, including rich links', () => {
  for (const node of [ui.text('Orchard', { role: 'special-heading' }), ui.richText('[[page:orchard|Orchard]]', { role: 'special-heading', onLink() {} })]) {
    const root = new UiRoot({ art, scale: 1 }); root.resize(180, 40); root.mount(node);
    const context = createCanvas(180, 40).getContext('2d'), draw = vi.spyOn(context, 'drawImage');
    root.draw(context as unknown as CanvasRenderingContext2D, 0);
    expect(node.measured.preferred).toEqual({ width: measurePixelText('Orchard', 1, art.pixel.headerFont), height: 16 });
    expect(draw.mock.calls).toHaveLength(7);
    for (const call of draw.mock.calls) expect(call.slice(3, 5)).toEqual([8, 12]);
    root.dispose();
  }
});

it('fits long ordinary headings to the same glyph widths at narrow and wide allocations', () => {
  for (const width of [0, 1, 4, 5, 11, 17, 35, 80, 400]) {
    const lines = uiTextLines('A particularly long preserving barrel title', width, 'header', false);
    for (const line of lines) expect(measurePixelText(line, 1, art.pixel.font)).toBeLessThanOrEqual(width);
  }
});

it('keeps window titles and buttons on 5x7 through resize, UI scales and fractional DPR', () => {
  for (const scale of [1, 2, 3] as const) for (const dpr of [1, 1.25, 1.5]) {
    const activate = vi.fn(), root = new UiRoot({ art, scale, dpr });
    const button = ui.button({ label: 'Transfer selected harvest into preserving barrel', onPress: activate, layout: { width: 'grow' } });
    const window = ui.frame({ header: { title: 'Inventory and preserving barrel', closable: true },
      layout: { width: 'grow', height: uiFixed(120) }, children: [button] }); root.mount(window);
    for (const width of [390, 768, 1366, 1920]) {
      root.resize(width, 844, dpr); root.arrange(); root.focus.set(button);
      const context = createCanvas(Math.round(width * dpr), Math.round(844 * dpr)).getContext('2d');
      const draw = vi.spyOn(context, 'drawImage'); root.draw(context as unknown as CanvasRenderingContext2D, 0);
      const glyphs = draw.mock.calls.filter(call => call.length === 9 && (call[3] === 5 && call[4] === 7 || call[3] === 8 && call[4] === 12));
      expect(glyphs.length).toBeGreaterThan(0);
      expect(glyphs.every(call => call[3] === 5 && call[4] === 7)).toBe(true);
      expect(root.focus.current).toBe(button);
      expect(button.clip.width).toBe(button.rect.width);
      expect(button.clip.height).toBe(button.rect.height);
      root.key({ key: 'Enter' });
    }
    expect(activate).toHaveBeenCalledTimes(4); root.dispose();
  }
});

it('keeps long-form book headings on their explicitly measured reading font', () => {
  const root = new UiRoot({ art, scale: 1 }); root.resize(640, 400);
  root.mount(ui.book({ source: '# Orchard Almanac\n\nA long-form reading example.' })); root.arrange();
  const heading = root.entries().find(({ element }) => element.label.trim() === 'Orchard');
  expect(heading?.element.props['role']).toBe('special-heading');
  const context = createCanvas(640, 400).getContext('2d'), draw = vi.spyOn(context, 'drawImage');
  root.draw(context as unknown as CanvasRenderingContext2D, 0);
  expect(draw.mock.calls.some(call => call[3] === 8 && call[4] === 12)).toBe(true);
  const next = root.entries().find(({ element }) => element.kind === 'button' && element.label === 'Next')!.element;
  draw.mockClear(); next.hooks.paint!(next, { art, context: context as unknown as CanvasRenderingContext2D, now: 0, focused: false, hovered: false, reducedMotion: false });
  const glyphs = draw.mock.calls.filter(call => call.length === 9 && (call[3] === 5 && call[4] === 7 || call[3] === 8 && call[4] === 12));
  expect(glyphs).toHaveLength(4);
  expect(glyphs.every(call => call[3] === 5 && call[4] === 7)).toBe(true);
  root.dispose();
});
