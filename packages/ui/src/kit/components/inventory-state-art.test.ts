import { createCanvas } from '@napi-rs/canvas';
import { expect, it } from 'vitest';
import { UiRoot } from '../runtime/root.js';
import { uiTestArt, uiTestAsset } from '../lab/testing/art.js';
import { uiSlot } from './inventory.js';
it('uses the authored closed state for a static item while preserving an explicit open preview', async () => {
  const source = uiTestAsset('prop_cf_fence_gate', 'props');
  const asset = { ...source, metadata: { image: source.metadata.image, animations: {}, states: {
    closed: source.metadata.animations['closed']![0]!, open: source.metadata.animations['open']![0]!,
  } } };
  const art = await uiTestArt();
  const render = (animation?: string) => {
    const root = new UiRoot({ art, scale: 1 }); root.resize(28, 31);
    root.mount(uiSlot({ stack: { itemKind: 'fence_gate', quantity: 1 }, artwork: { fence_gate: asset }, iconAnimation: animation ? () => animation : undefined }));
    const canvas = createCanvas(28, 31); root.draw(canvas.getContext('2d') as unknown as CanvasRenderingContext2D, 0);
    const pixels = canvas.toBuffer('image/png'); root.dispose(); return pixels;
  };
  expect(render()).toEqual(render('closed'));
  expect(render('open')).not.toEqual(render('closed'));
});
