import { describe, expect, it } from 'vitest';
import { renderOperationCounters, countDrawImageSource, countCanvasSave, countCanvasRestore } from '@orchard/ui';
import { RenderMetrics, RENDER_STAGE_IDS } from './metrics.js';
import { RenderProtocolBuffer } from './render-protocol-buffer.js';

describe('complete-frame protocol attribution', () => {
  it('retains the complete sample beyond the diagnostic ring and sums repeated stages', () => {
    const metrics = new RenderMetrics(2), buffer = new RenderProtocolBuffer(100);
    const stop = metrics.observeFrames((frame) => buffer.record(frame));
    for (let i = 0; i < 100; i++) {
      metrics.recordRafTimestamp(i * 16);
      metrics.recordFixedUpdate(1); metrics.recordFixedUpdate(2);
      if (i === 0) metrics.recordStage('lightingSolve', 9);
      metrics.record(i + 1, 40);
    }
    stop();
    const report = buffer.report();
    expect(metrics.snapshot().frame.count).toBe(2);
    expect(report.frameCount).toBe(100);
    expect(report.frame).toMatchObject({ p50: 50, p95: 95, p99: 99 });
    expect(report.stages.map((stage) => stage.id)).toEqual([...RENDER_STAGE_IDS]);
    expect(report.stages.find((stage) => stage.id === 'fixedUpdate')?.p95).toBe(3);
    expect(report.stages.find((stage) => stage.id === 'lightingSolve')).toMatchObject({ p95: 0, maximum: 9 });
    metrics.recordRafTimestamp(1700); metrics.record(1, 40);
    expect(buffer.count).toBe(100);
  });
  it('counts distinct sources and matched context pairs per frame without stale counters', () => {
    const metrics = new RenderMetrics();
    const source = {}, first = {}, second = {};
    metrics.recordRafTimestamp(0);
    countDrawImageSource(source); countDrawImageSource(source); countDrawImageSource({});
    countCanvasSave(first); countCanvasRestore(second); countCanvasRestore(first);
    renderOperationCounters.tintBuilds++;
    metrics.record(4, 2);
    expect(metrics.snapshot().counters).toMatchObject({ distinctDrawImageSources: 2,
      drawImageCalls: 3, saveCalls: 1, restoreCalls: 2, saveRestorePairs: 1, tintBuilds: 1 });
    metrics.recordRafTimestamp(16);
    countDrawImageSource(source); countCanvasRestore(first);
    metrics.record(3, 2);
    expect(metrics.snapshot().counters).toMatchObject({ distinctDrawImageSources: 1,
      drawImageCalls: 1, saveRestorePairs: 0, tintBuilds: 0 });
  });
  it('rejects overflow rather than replacing the start of the sample', () => {
    const metrics = new RenderMetrics(), buffer = new RenderProtocolBuffer(1);
    metrics.observeFrames((frame) => buffer.record(frame));
    metrics.recordRafTimestamp(0); metrics.record(1, 1);
    metrics.recordRafTimestamp(16);
    expect(() => metrics.record(1, 1)).toThrow('render_protocol_buffer_overflow');
    expect(buffer.report().frameCount).toBe(1);
  });
});
