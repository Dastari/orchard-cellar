import { afterEach, expect, it, vi } from 'vitest';
import { RenderMetrics } from '@orchard/engine/metrics';
import { FixedStepLoop } from './loop.js';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it('measures capped game submissions and resets across loop stop/start', () => {
  let now = 0, next: FrameRequestCallback | undefined;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { next = callback; return 1; });
  vi.stubGlobal('cancelAnimationFrame', () => { next = undefined; });
  const metrics = new RenderMetrics();
  const loop = new FixedStepLoop({ update: () => {}, render: () => { metrics.record(1, 1); } }, metrics);
  loop.setPresentationRate(30); loop.start();
  for (let i = 1; i <= 360; i++) { now = i * 1000 / 120; next?.(now); }
  expect(metrics.snapshot().presentation.fps).toBeCloseTo(30);
  loop.stop(); now = 60_000; loop.start();
  expect(metrics.snapshot().presentation.sampleCount).toBe(0);
  for (let i = 1; i <= 120; i++) { now = 60_000 + i * 1000 / 120; next?.(now); }
  expect(metrics.snapshot().presentation.fps).toBeCloseTo(30);
  expect(metrics.snapshot().presentation.worstFrameMs).toBeLessThan(40);
  loop.stop();
});
