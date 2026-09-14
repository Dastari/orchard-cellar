import { expect, it } from 'vitest';
import { RENDER_STAGE_IDS, type CompletedRenderFrame } from '@orchard/engine/metrics';
import { RENDER_COUNTER_IDS } from '@orchard/ui';
import { ProtocolSkySteps } from './render-protocol-sky-steps.js';

function frame(timestamp: number, duration: number): CompletedRenderFrame {
  return { timestamp, frameMs: duration, renderItems: 300,
    stages: Float64Array.from(RENDER_STAGE_IDS, (id) => id === 'lightingReceiver' ? duration : 0),
    counters: Object.fromEntries(RENDER_COUNTER_IDS.map((id) => [id, id === 'tintBuilds' ? 17 : 0])) as CompletedRenderFrame['counters'] };
}
it('isolates the first RGB-step frame and its successor without including warm-up or first preparation', () => {
  const steps = new ProtocolSkySteps();
  steps.observe(frame(0, 100), 1, false);
  steps.observe(frame(100, 100), 2, false);
  steps.observe(frame(5_000, 1), 2, true);
  steps.observe(frame(6_000, 12), 3, true);
  steps.observe(frame(6_016, 4), 3, true);
  steps.observe(frame(6_032, 1), 3, true);
  const report = steps.report();
  expect(report.observed).toBe(true);
  expect(report.firstFrame.frame).toMatchObject({ count: 1, p95: 12 });
  expect(report.firstFrame.stages.find(({ id }) => id === 'lightingReceiver')).toMatchObject({ p95: 12 });
  expect(report.followingFrame.frame).toMatchObject({ count: 1, p95: 4 });
});
it('reports consecutive changes individually and does not invent a burst for a constant sky', () => {
  const steps = new ProtocolSkySteps();
  steps.observe(frame(0, 1), 1, true);
  expect(steps.report().observed).toBe(false);
  steps.observe(frame(16, 8), 2, true);
  steps.observe(frame(32, 9), 3, true);
  steps.observe(frame(48, 2), 3, true);
  expect(steps.report().firstFrame.frameCount).toBe(2);
  expect(steps.report().followingFrame.frameCount).toBe(2);
});
