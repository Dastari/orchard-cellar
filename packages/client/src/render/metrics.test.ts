import { describe, expect, it } from 'vitest';
import { RenderMetrics } from './metrics.js';

describe('render metrics', () => {
  it('reports average and worst over only the latest 60 frames', () => {
    const metrics = new RenderMetrics();
    metrics.record(1, 10);
    metrics.record(3, 20);
    expect(metrics.snapshot()).toEqual({
      averageFrameMs: 2,
      worstFrameMs: 3,
      drawCalls: 20,
      sampleCount: 2,
    });
    for (let value = 0; value < 60; value += 1) metrics.record(2, value);
    expect(metrics.snapshot()).toMatchObject({ averageFrameMs: 2, worstFrameMs: 2, drawCalls: 59, sampleCount: 60 });
  });
});
