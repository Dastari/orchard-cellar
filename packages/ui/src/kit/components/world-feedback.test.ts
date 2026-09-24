import { describe, expect, it } from 'vitest';
import { UiRoot } from '../runtime/root.js';
import { uiWorldFeedback } from './world-feedback.js';
import { uiTestAsset, uiTestArt } from '../lab/testing/art.js';
import { createUiRecordingCanvas } from '../runtime/recording-canvas.js';
import { createCanvas } from '@napi-rs/canvas';

describe('world marker and damage feedback', () => {
  it('keeps the production damage amount and critical palette without specimen punctuation', async () => {
    const root = new UiRoot({ scale: 1, art: await uiTestArt() }); root.resize(100,100);
    const node = root.mount(uiWorldFeedback({ entries: [{ id: 'hit', kind: 'damage', x: 50, y: 20, amount: 10,
      progress: .8, critical: true, presentation: 'combat' }] }));
    const canvas = createUiRecordingCanvas(100,100); root.draw(canvas.context, 0);
    expect(node.children[0]!.label).toBe('-10'); expect(canvas.records.length).toBeGreaterThan(0);
    expect(canvas.balanced).toBe(true); expect(canvas.context.globalAlpha).toBe(1);
    node.setProps({ entries: [{ id: 'hit', kind: 'damage', x: 50, y: 20, amount: 10,
      progress: .3, critical: true, presentation: 'combat' }] });
    const bitmap = createCanvas(100,100), context = bitmap.getContext('2d');
    root.draw(context as unknown as CanvasRenderingContext2D, 0);
    const pixels = context.getImageData(0,0,100,100).data;
    const colors = new Set<string>();
    for (let i = 0; i < pixels.length; i += 4) if (pixels[i + 3]! > 0) colors.add(`${pixels[i]},${pixels[i + 1]},${pixels[i + 2]}`);
    expect(colors.has('255,211,78')).toBe(true); expect(colors.has('63,40,50')).toBe(true); root.dispose();
  });
  it('snaps moving entries once, retains identity and removes expired numbers', () => {
    const root = new UiRoot({ scale: 1 }); root.resize(100,100);
    const entry = { id: 'hit', kind: 'damage' as const, x: 50.3, y: 20.7, amount: 12, critical: true, progress: .2 };
    const layer = root.mount(uiWorldFeedback({ entries: [entry] })); root.arrange(); const node = layer.children[0]!;
    expect(node.label).toBe('-12!'); expect(Object.values(node.rect).every(Number.isInteger)).toBe(true);
    layer.setProps({ entries: [{ ...entry, x: -2, progress: .8 }] }); root.arrange(); expect(layer.children[0]).toBe(node);
    expect(node.clip.x).toBe(0); expect(node.clip.width).toBeLessThan(node.rect.width);
    layer.setProps({ entries: [{ ...entry, progress: 1 }] }); root.arrange(); expect(layer.children).toHaveLength(0); root.dispose();
  });
  it('keeps the authored marker inside its clipped bobbing envelope and stops bobbing for reduced motion', () => {
    const asset = uiTestAsset('icon_cf_quest_offer', 'ui'), root = new UiRoot({ scale: 1 }); root.resize(100,100);
    root.mount(uiWorldFeedback({ entries: [{ id: 'quest', kind: 'quest', x: 50, y: 30, artwork: asset }] })); root.arrange();
    const draw = (now: number, reducedMotion: boolean) => { root.reducedMotion = reducedMotion; const canvas = createUiRecordingCanvas(100,100); root.draw(canvas.context, now); return canvas.records; };
    const a = draw(0,false), b = draw(410,false), c = draw(410,true);
    expect(a).not.toEqual(b); expect(a).toEqual(c);
    for (const record of b) { expect(record.rect.y).toBeGreaterThanOrEqual(record.clip.y); expect(record.rect.y + record.rect.height).toBeLessThanOrEqual(record.clip.y + record.clip.height); }
    root.dispose();
  });
  it('paints damage with scoped opacity without leaking it into later UI', async () => {
    const root = new UiRoot({ scale: 1, art: await uiTestArt() }); root.resize(100,100);
    root.mount(uiWorldFeedback({ entries: [{ id: 'hit', kind: 'damage', x: 50, y: 20, amount: 10, progress: .8 }] }));
    const canvas = createUiRecordingCanvas(100,100); root.draw(canvas.context, 0);
    expect(canvas.records.length).toBeGreaterThan(0); expect(canvas.balanced).toBe(true); expect(canvas.context.globalAlpha).toBe(1); root.dispose();
  });
});
