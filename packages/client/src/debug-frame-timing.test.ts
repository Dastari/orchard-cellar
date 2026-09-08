import { expect, it } from 'vitest';
import { RenderMetrics } from '@orchard/engine/metrics';
import { createDebugMetricsReader, frameTimingRows } from './debug-frame-timing.js';

it('labels delivered FPS, recent frame gaps and CPU work separately', () => {
  const metrics = new RenderMetrics();
  expect(frameTimingRows(metrics.snapshot())[0]).toBe('FPS -- (1S)');
  for (let i = 0; i <= 60; i++) { metrics.recordRafTimestamp(i * 1000 / 60); metrics.record(2, 1); }
  expect(frameTimingRows(metrics.snapshot())).toEqual([
    'FPS 60.0 (1S)', 'FRAME GAP 16.7ms / 16.7ms MAX 5S', 'CPU 2.00ms AVG 2.00ms WORST',
  ]);
});

it('refreshes expensive debug distributions four times per second', () => {
  const metrics = new RenderMetrics(); let now = 0, reads = 0;
  const read = createDebugMetricsReader(() => { reads++; return metrics.snapshot(); }, () => now);
  const first = read();
  for (now = 1; now < 250; now++) expect(read()).toBe(first);
  expect(reads).toBe(1);
  read(); expect(reads).toBe(2);
  now = 0; read(); expect(reads).toBe(3);
});
