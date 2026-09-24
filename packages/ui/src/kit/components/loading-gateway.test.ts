import { createCanvas } from '@napi-rs/canvas';
import { expect, it } from 'vitest';
import { UiRoot } from '../runtime/root.js';
import { uiTestArt } from '../lab/testing/art.js';
import { uiLoadingGateway } from './loading-gateway.js';
it('paints loading and failure with the startup art subset and retains stage controls', async () => {
  const all = await uiTestArt();
  const art = { ...all, icons: {}, skin: { ...Object.fromEntries(Object.keys(all.skin).map(key => [key, {}])), frame: all.skin.frame, feedback: all.skin.feedback, meter: all.skin.meter } } as typeof all;
  const root = new UiRoot({ art, scale: 1 }); root.resize(480,270);
  const frame = uiLoadingGateway({ model: { title: 'CONNECTING', detail: 'Finding your island', progress: 58 } }); root.mount(frame);
  const canvas = createCanvas(480,270), context = canvas.getContext('2d') as unknown as CanvasRenderingContext2D;
  root.draw(context,0);
  const meter = root.entries().find(entry => entry.element.id === 'gateway.loading.progress')!.element;
  expect(meter.props['value']).toBe(.58);
  const before = canvas.toBuffer('image/png');
  // A failed stage keeps the same frame and retitles it CONNECTION LOST with the stage as a dark error notice.
  frame.updateLoading({title:'CONNECTION FAILED',detail:'Refresh to try again',progress:120,error:true}); root.draw(context,0);
  expect(meter.props).toMatchObject({value:1,tone:'danger'});
  expect(root.entries().find(entry => entry.element.id === 'gateway.loading.error')?.element.props['text']).toBe('Connection failed');
  expect(root.entries().some(entry => entry.element.kind === 'window-ribbon' && entry.element.props['text'] === 'CONNECTION LOST')).toBe(true);
  expect(canvas.toBuffer('image/png')).not.toEqual(before);
  frame.updateLoading({title:'WAITING',detail:'Retrying',progress:NaN}); root.arrange();expect(meter.props['value']).toBe(0);
  expect(root.entries().find(entry => entry.element.id === meter.id)?.element).toBe(meter);
  root.dispose();
});
