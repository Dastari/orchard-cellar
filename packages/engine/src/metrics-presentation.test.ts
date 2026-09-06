import { describe, expect, it } from 'vitest';
import { countDrawImageSource } from '@orchard/ui';
import { RenderMetrics, RENDER_STAGE_IDS } from './metrics.js';

describe('protocol attribution with skipped presentation frames', () => {
  it('retains skipped rAF update and source work until the next submission', () => {
    const metrics = new RenderMetrics();
    const frames: { update: number; draws: number; sources: number }[] = [];
    metrics.observeFrames((frame) => frames.push({ update: frame.stages[RENDER_STAGE_IDS.indexOf('fixedUpdate')]!,
      draws: frame.counters.drawImageCalls, sources: frame.counters.distinctDrawImageSources }));
    const source = {};
    metrics.recordRafTimestamp(0); metrics.record(0, 1);
    metrics.recordRafTimestamp(16); metrics.recordFixedUpdate(2); countDrawImageSource(source);
    metrics.recordRafTimestamp(32); metrics.recordFixedUpdate(3); countDrawImageSource(source); metrics.record(4, 1);
    metrics.recordRafTimestamp(48); metrics.recordFixedUpdate(1); metrics.record(2, 1);
    expect(frames).toEqual([{ update: 0, draws: 0, sources: 0 }, { update: 5, draws: 2, sources: 1 }, { update: 1, draws: 0, sources: 0 }]);
    expect(metrics.snapshot().pacing.sampleCount).toBe(3);
  });
});
