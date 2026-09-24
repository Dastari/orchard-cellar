import { describe, expect, it } from 'vitest';
import { UiRoot } from '../runtime/root.js';
import { uiWorldHint, type UiWorldHint } from './world-hint.js';
const hint: UiWorldHint = { x: 160, y: 160, title: 'COPPER VEIN', lines: ['PURE CAVE VEIN', 'RICH 20/30 - 2 HITS TO YIELD', 'GUARANTEED FULL ORE CHUNK'], tone: 'primary', progress: .4 };
describe('world hover hint', () => {
  it('keeps title, paused timing and meter visible at the compact scale-three logical viewport', () => {
    const root = new UiRoot({ scale: 1 }); root.resize(106,60);
    root.mount(uiWorldHint({ hint: { x: 53, y: 60, title: 'APPLE TREE', lines: ['PAUSED', 'NEEDS WATER'], tone: 'warning', progress: .5 } }));
    root.arrange();
    for (const { element } of root.entries().filter(row => ['text', 'meter'].includes(row.element.kind))) {
      expect(element.rect).toEqual(element.clip); expect(element.rect.height).toBeGreaterThan(0);
    }
    root.dispose();
  });
  it.each([120, 240, 640])('wraps information inside the viewport at width %i', width => {
    const root = new UiRoot({ scale: 1 }); root.resize(width, 300); root.mount(uiWorldHint({ hint: { ...hint, x: width, y: 2 } })); root.arrange();
    const frame = root.entries().find(entry => entry.element.kind === 'frame')!.element;
    expect(frame.rect).toEqual(frame.clip);
    const texts = root.entries().filter(entry => entry.element.kind === 'text');
    expect(texts.map(entry => entry.element.label)).toEqual([hint.title, ...hint.lines]);
    for (const { element } of texts) expect(element.rect).toEqual(element.clip);
    root.dispose();
  });
  it('retains the frame and meter while moving or advancing progress, and hides on null', () => {
    const root = new UiRoot({ scale: 1 }); root.resize(640, 400); const node = root.mount(uiWorldHint({ hint })); root.arrange();
    const frame = node.children[0]!, meter = root.entries().find(entry => entry.element.kind === 'meter')!.element;
    node.setProps({ hint: { ...hint, x: 200, progress: .9 } }); root.arrange();
    expect(node.children[0]).toBe(frame); expect(meter.props['value']).toBe(.9);
    node.setProps({ hint: null }); root.arrange(); expect(frame.visible).toBe(false);
    node.setProps({ hint }); root.arrange(); expect(frame.visible).toBe(true); root.dispose();
  });
});
