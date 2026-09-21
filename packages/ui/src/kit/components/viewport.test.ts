import { expect, it, vi } from 'vitest';
import { ui } from './index.js';
import type { UiRect } from '../../geometry.js';
import { UiRoot } from '../runtime/root.js';
import { uiFixed } from '../layout/box.js';
import { createUiRecordingCanvas } from '../runtime/recording-canvas.js';
it('maps spatial coordinates through the shared snapped viewport and retains its clip', () => {
  const root=new UiRoot({scale:2});root.resize(200,120);
  const render=vi.fn((context:CanvasRenderingContext2D, _bounds:UiRect, _now:number)=>{void _bounds;void _now;return context.fillRect(0,0,1000,1000);});
  const viewport=ui.viewport({label:'Map',coordinateScale:2,background:'checkerboard',render,
    layout:{position:'absolute',inset:{left:uiFixed(12),top:uiFixed(8)},width:uiFixed(50),height:uiFixed(30)}});
  root.mount(viewport);const recorder=createUiRecordingCanvas(200,120);root.draw(recorder.context,0);
  expect(render.mock.calls[0]?.[1]).toEqual({x:24,y:16,width:100,height:60});
  for(const record of recorder.records){expect(record.rect.x).toBeGreaterThanOrEqual(24);expect(record.rect.y).toBeGreaterThanOrEqual(16);expect(record.rect.x+record.rect.width).toBeLessThanOrEqual(124);expect(record.rect.y+record.rect.height).toBeLessThanOrEqual(76);}
  expect(recorder.balanced).toBe(true);root.dispose();
});

it('culls checkerboard work to the visible portion of a large scrolling scene',()=>{
  const root=new UiRoot({scale:1});root.resize(128,96);
  root.mount(ui.viewport({label:'Large scene',background:'checkerboard',layout:{width:uiFixed(4096),height:uiFixed(4096)},render:()=>{}}));
  const recorder=createUiRecordingCanvas(128,96),fill=vi.spyOn(recorder.context,'fillRect');root.draw(recorder.context,0);
  expect(fill.mock.calls.length).toBeLessThanOrEqual(49);expect(fill.mock.calls.length).toBeGreaterThan(0);root.dispose();
});
