/// <reference types="node" />
import { createCanvas } from '@napi-rs/canvas';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { ui, type UiKitArt } from '../components/index.js';
import { createUiRecordingCanvas } from '../runtime/recording-canvas.js';
import { UiRoot } from '../runtime/root.js';
import { uiFixed } from '../layout/box.js';
import { UiLabCamera } from './camera.js';
import { furnaceSpecimen } from './specimens/furnace.js';
import { uiTestAsset, uiTestArt } from './testing/art.js';
let art: UiKitArt;
beforeAll(async () => { art = await uiTestArt(); }); afterAll(() => vi.unstubAllGlobals());
it('remeasures furnace columns after allocation and repacks slots at three widths and scales', () => {
  for (const scale of [1, 2, 3] as const) {
    const counts: number[] = [];
    for (const width of [320, 640, 960]) {
      const root = new UiRoot({ scale }); root.resize(width * scale, 640 * scale);
      root.mount(furnaceSpecimen.build(ui, {}, { activate() {} })); root.arrange();
      const entries = root.entries().map(entry => entry.element);
      for (const heading of entries.filter(node => node.label === 'Input' || node.label === 'Output')) expect(heading.rect.height).toBeGreaterThanOrEqual(16);
      const slots = entries.filter(node => node.kind === 'slot' && node.label.startsWith('press.input/'));
      expect(slots).toHaveLength(6);
      for (const slot of slots) expect(slot.rect.height % 31).toBe(0);
      counts.push(new Set(slots.map(slot => slot.rect.x)).size); root.dispose();
    }
    expect(counts[2]).toBeGreaterThan(counts[0]!);
  }
});
it('paints the registered inventory window under 4ms at 2x', () => {
  const root = new UiRoot({ art, scale: 2 }); root.resize(720, 520); root.mount(furnaceSpecimen.build(ui, {}, { activate() {} }));
  const canvas = createCanvas(720, 520), context = canvas.getContext('2d') as unknown as CanvasRenderingContext2D;
  for (let i = 0; i < 8; i++) root.draw(context, 0);
  const samples = Array.from({ length: 21 }, () => { const start = performance.now(); root.draw(context, 0); return performance.now() - start; }).sort((a, b) => a - b);
  console.info(`Inventory paint at 2x: ${samples[10]!.toFixed(3)}ms`); expect(samples[10]).toBeLessThan(4); root.dispose();
});
it('keeps camera anchoring and bounded pan independent of UI scale', () => {
  const camera = new UiLabCamera(); camera.viewport = { x: 64, y: 64, width: 900, height: 700 }; camera.x = 1000; camera.y = 1000;
  const point = { x: 400, y: 300 }, anchor = camera.worldPoint(point); camera.zoomAt(point, 2);
  expect(camera.worldPoint(point)).toEqual(anchor); camera.pan(1e6, 1e6); expect(camera.x).toBe(0); expect(camera.y).toBe(0);
  camera.zoomAt(point, 100); expect(camera.zoom).toBe(3); camera.zoomAt(point, 0); expect(camera.zoom).toBe(0.2);
});
it('delays tooltip hover, shows it on keyboard focus, dismisses it and cancels unmounted timers', () => {
  vi.useFakeTimers(); const root = new UiRoot({ scale: 1 }); root.resize(400, 300);
  const button = ui.button({ label: 'Help' }), tooltip = ui.tooltip('A useful explanation', button, { width: uiFixed(80), height: uiFixed(24) }); root.mount(tooltip); root.arrange();
  const popup = tooltip.children[1]!;
  root.pointer({ type: 'move', point: { x: 4, y: 4 }, pointerId: 1, button: 0 });
  vi.advanceTimersByTime(499); expect(popup.visible).toBe(false); vi.advanceTimersByTime(1); expect(popup.visible).toBe(true);
  root.input.clearHover(); expect(popup.visible).toBe(false);
  root.key({ key: 'Tab' }); vi.runOnlyPendingTimers(); expect(popup.visible).toBe(true);
  root.key({ key: 'Escape' }); expect(popup.visible).toBe(false);
  root.dispose(); vi.runOnlyPendingTimers(); expect(vi.getTimerCount()).toBe(0); vi.useRealTimers();
});
it('preserves structural invalidation when a host owns the render scheduler', () => {
  const notify = vi.fn(), root = new UiRoot({ onInvalidate: notify, scale: 1 }); root.resize(320, 240);
  const container = ui.flex({}, [ui.button({ label: 'Old' })]); root.mount(container); root.arrange(); root.entries();
  const old = container.children[0]!; old.dispose(); const replacement = ui.button({ label: 'New' }); container.append(replacement);
  root.arrange(); expect(notify).toHaveBeenCalled(); expect(root.entries().some(entry => entry.element === replacement)).toBe(true);
  expect(root.entries().some(entry => entry.element === old)).toBe(false); root.dispose();
});
it('keeps text buttons inside explicit grid tracks and scrolls keyboard focus into view', () => {
  const root = new UiRoot({ scale: 1 }); root.resize(160, 80);
  const buttons = Array.from({ length: 20 }, (_, index) => ui.button({ label: `A very long label ${index}`, size: 'sm' }));
  const grid = ui.grid({ columns: 2, width: 'grow', gap: 4 }, buttons);
  const scroll = ui.scrollArea({ width: 'grow', height: 'grow' }, [grid]); root.mount(scroll); root.arrange();
  expect(buttons[0]!.rect.x + buttons[0]!.rect.width).toBeLessThanOrEqual(buttons[1]!.rect.x);
  root.focus.set(buttons.at(-1)!); root.arrange(); expect(scroll.scroll.y).toBeGreaterThan(0);
  expect(buttons.at(-1)!.clip.height).toBe(buttons.at(-1)!.rect.height); root.dispose();
});

it('plays one-shots from mount time and repeats them only when the actor preview requests a loop', () => {
  const original = uiTestAsset('npc_cf_desert_person_01', 'characters');
  const asset = { ...original, metadata: { ...original.metadata, animationMeta: { defeat: { fps: 8, loop: false } } } };
  const root = new UiRoot({ scale: 1 }); root.resize(80, 80);
  root.mount(ui.sprite(asset, { animation: 'defeat', label: 'One-shot' }));
  root.mount(ui.sprite(asset, { animation: 'defeat', label: 'Preview loop', loop: true }));
  const recorder = createUiRecordingCanvas(80, 80), draw = vi.spyOn(recorder.context, 'drawImage');
  root.draw(recorder.context, 10_000); draw.mockClear(); root.draw(recorder.context, 10_625);
  const frames = asset.metadata.animations['defeat']!;
  expect(draw.mock.calls[0]![2]).toBe(frames[3]!.y);
  expect(draw.mock.calls[1]![2]).toBe(frames[1]!.y);
  expect(root.tree.children[0]!.hooks.animated).toBe(false); expect(root.tree.children[1]!.hooks.animated).toBe(true);
  root.reducedMotion = true; draw.mockClear(); root.draw(recorder.context, 11_000);
  expect(draw.mock.calls.every(call => call[2] === frames[0]!.y)).toBe(true); root.dispose();
});

it('clips image fitting and selects atlas subframes without stretching tiled cells', () => {
  const cases = { contain: [32, 16], cover: [48, 24], none: [16, 8], tile: [16, 8] } as const;
  for (const [fit, expected] of Object.entries(cases)) {
    const root = new UiRoot({ scale: 1 }); root.resize(32, 24);
    root.mount(ui.image(art.icons.box.image, { x: 2, y: 3, width: 16, height: 8 }, { label: fit, fit: fit as keyof typeof cases, layout: { width: 'grow', height: 'grow' } }));
    const recorder = createUiRecordingCanvas(32, 24), draw = vi.spyOn(recorder.context, 'drawImage'); root.draw(recorder.context, 0);
    expect(draw.mock.calls[0]!.slice(1, 5)).toEqual([2, 3, 16, 8]);
    expect(draw.mock.calls[0]!.slice(7, 9)).toEqual(expected);
    expect(draw.mock.calls.length).toBe(fit === 'tile' ? 6 : 1);
    for (const { rect } of recorder.records) { expect(rect.x).toBeGreaterThanOrEqual(0); expect(rect.x + rect.width).toBeLessThanOrEqual(32); }
    root.dispose();
  }
});
it('resizes from every edge while keeping the opposite edge fixed and respecting bounds', () => {
  for (const edge of ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']) {
    const root = new UiRoot({ scale: 1 }); root.resize(500, 400);
    const frame = ui.frame({ style: 'unframed', resizable: { handles: 'all', min: { width: 80, height: 60 }, max: { width: 240, height: 200 } },
      layout: { position: 'absolute', inset: { left: uiFixed(60), top: uiFixed(60) }, width: uiFixed(200), height: uiFixed(160) } });
    root.mount(frame); root.arrange(); const before = frame.rect;
    const handle = frame.children.find(node => node.props['edge'] === edge)!; root.focus.set(handle);
    root.key({ key: edge.includes('w') ? 'ArrowLeft' : 'ArrowRight' }); root.key({ key: edge.includes('n') ? 'ArrowUp' : 'ArrowDown' }); root.arrange();
    expect(frame.rect.width).toBe(edge === 'n' || edge === 's' ? 200 : 208);
    expect(frame.rect.height).toBe(edge === 'e' || edge === 'w' ? 160 : 168);
    if (edge.includes('w')) expect(frame.rect.x + frame.rect.width).toBe(before.x + before.width);
    if (edge.includes('n')) expect(frame.rect.y + frame.rect.height).toBe(before.y + before.height);
    for (let i = 0; i < 50; i++) { root.key({ key: edge.includes('w') ? 'ArrowLeft' : 'ArrowRight' }); root.arrange(); }
    expect(frame.rect.width).toBeLessThanOrEqual(240); root.dispose();
  }
});
it('blocks loading actions and keeps adornments clear of the label lane', () => {
  const activate = vi.fn(), root = new UiRoot({ art, scale: 1 }); root.resize(240, 120);
  const loading = ui.button({ label: 'Saving', loading: true, onPress: activate, layout: { width: uiFixed(120) } });
  const adorned = ui.button({ label: 'Continue', leading: ui.icon({ cf: 'heart' }), trailing: ui.text('+'), onPress: activate });
  root.mount(ui.flex({ direction: 'column', gap: 4 }, [loading, adorned])); root.arrange();
  root.key({ key: 'Tab' }); expect(root.focus.current).toBe(adorned); root.key({ key: 'Enter' }); expect(activate).toHaveBeenCalledTimes(1);
  const spinner = loading.children[0]!.children[0]!; expect(spinner.hooks.animated).toBe(true);
  const recorder = createUiRecordingCanvas(240, 120); root.draw(recorder.context, 0);
  expect(adorned.children[0]!.rect.x + adorned.children[0]!.rect.width).toBeLessThan(adorned.children[1]!.rect.x);
  root.dispose();
});

it('places measured tooltips inside small viewports instead of assuming a fixed height', () => {
  vi.useFakeTimers(); const root = new UiRoot({ scale: 1 }); root.resize(140, 120);
  const tooltip = ui.tooltip('A longer explanation that wraps to several lines near the lower viewport edge.', ui.button({ label: 'Help' }),
    { position: 'absolute', inset: { left: uiFixed(80), top: uiFixed(90) }, width: uiFixed(60), height: uiFixed(24) });
  root.mount(tooltip); root.arrange(); root.key({ key: 'Tab' }); vi.runOnlyPendingTimers(); root.arrange();
  const popup = tooltip.children[1]!; expect(popup.visible).toBe(true);
  expect(popup.rect.x).toBeGreaterThanOrEqual(0); expect(popup.rect.y).toBeGreaterThanOrEqual(0);
  expect(popup.rect.x + popup.rect.width).toBeLessThanOrEqual(140); expect(popup.rect.y + popup.rect.height).toBeLessThanOrEqual(120);
  expect(popup.rect.height).toBeGreaterThan(32);
  const text=popup.children[0]!.children[0]!.children[0]!.children[0]!;
  expect(popup.rect.height).toBeGreaterThanOrEqual(text.measured.preferred.height+16); root.dispose(); vi.useRealTimers();
});
