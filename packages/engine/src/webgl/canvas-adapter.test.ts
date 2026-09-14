import { describe, expect, it, vi } from 'vitest';
import { canvasColor, multiplyMatrix, WebGLCanvasAdapter } from './canvas-adapter.js';
function setup() {
  const sink={canvas:{} as HTMLCanvasElement,image:vi.fn(),fill:vi.fn(),clear:vi.fn(),valid:vi.fn()};
  return {sink,adapter:new WebGLCanvasAdapter(sink)};
}
describe('WebGL Canvas compatibility submission',()=>{
  it('preserves painter transform/alpha/clip through nested state scopes',()=>{
    const {sink,adapter}=setup(),c=adapter.context;
    c.translate(4,5); c.save(); c.scale(-2,3); c.globalAlpha=.3;
    c.beginPath(); c.rect(1,2,3,4); c.clip(); c.fillStyle='#ff8040'; c.fillRect(0,0,1,1);
    const state=sink.fill.mock.calls[0]![2];
    expect(state.matrix).toEqual([-2,0,0,3,4,5]); expect(state.alpha).toBe(.3); expect(state.clip).toEqual([-4,11,2,23]);
    c.restore(); expect(adapter.snapshot().matrix).toEqual([1,0,0,1,4,5]); expect(c.globalAlpha).toBe(1); expect(adapter.snapshot().clip).toBeNull();
  });
  it('expands drawImage overloads without changing source rectangle identity',()=>{
    const {sink,adapter}=setup(),image={width:8,height:12} as HTMLCanvasElement;
    adapter.context.drawImage(image,2,3); expect(sink.image.mock.calls[0]![1]).toEqual([0,0,8,12,2,3,8,12]);
    adapter.context.drawImage(image,1,2,3,4,5,6,7,8); expect(sink.image.mock.calls[1]![1]).toEqual([1,2,3,4,5,6,7,8]);
  });
  it('fails unsupported drawing explicitly and clears all state between frames',()=>{
    const {adapter}=setup(); expect(()=>adapter.context.arc(1,2,3,0,1)).toThrow('webgl_unsupported_canvas:arc');
    expect(()=>{adapter.context.filter='brightness(42%)';}).toThrow('webgl_unsupported_canvas_property:filter');
    adapter.context.save(); adapter.context.globalAlpha=.2; adapter.reset(); adapter.context.restore(); expect(adapter.context.globalAlpha).toBe(1);
  });
  it('parses alpha colors and composes affine transforms',()=>{
    expect(canvasColor('#f008')).toEqual([1,0,0,136/255]); expect(canvasColor('rgba(32,64,128,0.5)')).toEqual([32/255,64/255,128/255,.5]);
    expect(multiplyMatrix([2,0,0,3,4,5],[1,0,0,1,6,7])).toEqual([2,0,0,3,16,26]);
    expect(()=>canvasColor('url(secret)')).toThrow('webgl_unsupported_color');
  });
});
