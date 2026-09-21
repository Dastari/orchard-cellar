import { expect, it } from 'vitest';
import { uiFixed } from '../layout/box.js';
import { UiElement } from './element.js';
import { UiRoot } from './root.js';

it('arranges 2,000 nodes under 8ms and a changed leaf under 2ms', () => {
  const root = new UiRoot({ scale: 1 }); root.resize(1200, 1000);
  const leaves: UiElement[] = [];
  for (let row = 0; row < 20; row++) {
    const children = Array.from({ length: 99 }, () => new UiElement({ style: { width: uiFixed(8), height: uiFixed(8) } }));
    leaves.push(...children);
    root.mount(new UiElement({ style: { width: uiFixed(1000), height: uiFixed(40), gap: 2 }, children }));
  }
  // Warm JIT independently from the measured invalidated arrange.
  const invalidateAll = () => { for (const { element } of root.entries()) { element.layoutDirty = true; element.measureDirty = true; } };
  for (let i = 0; i < 12; i++) { invalidateAll(); root.arrange(); }
  const full: number[] = [], partial: number[] = [];
  for (let i = 0; i < 15; i++) {
    invalidateAll(); const start = performance.now(); const complete = root.arrange(); full.push(performance.now() - start);
    expect(complete.arranged).toBe(2001);
    leaves[900]!.setStyle({ width: uiFixed(i % 2 ? 8 : 10) });
    const change = performance.now(); const stats = root.arrange(); partial.push(performance.now() - change);
    expect(stats.arranged).toBeLessThan(105);
  }
  // Median excludes unrelated scheduler/GC outliers, without relaxing either budget.
  const median = (values: number[]) => values.sort((a, b) => a - b)[Math.floor(values.length / 2)]!;
  const fullMs = median(full), partialMs = median(partial);
  console.info(`Kit arrange: 2000 nodes ${fullMs.toFixed(3)}ms; leaf change ${partialMs.toFixed(3)}ms`);
  expect(fullMs).toBeLessThan(8); expect(partialMs).toBeLessThan(2);
});
