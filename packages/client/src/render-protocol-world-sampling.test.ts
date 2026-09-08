import { afterEach, expect, it } from 'vitest';
import { worldSamplingProbe, resetWorldSamplingCounters } from '@orchard/ui';
import { ProtocolWorldSamplingBuffer } from './render-protocol-world-sampling.js';
afterEach(() => { worldSamplingProbe.enabled = false; worldSamplingProbe.overflow = false; worldSamplingProbe.producers.clear(); });
it('reports totals and includes zero frames before a streamed producer first appears', () => {
  const buffer = new ProtocolWorldSamplingBuffer(3); worldSamplingProbe.enabled = true;
  buffer.record();
  worldSamplingProbe.producers.set('cliff', { draws: 10, nonInteger: 2, nearestNonInteger: 2, smoothed: 0, nonAxisAligned: 0 });
  buffer.record(); resetWorldSamplingCounters(); buffer.record();
  const report = buffer.report(); expect(report.frameCount).toBe(3);
  expect(report.producers['cliff']?.['nonInteger']).toMatchObject({ total: 2, p50: 0, p95: 2, p99: 2 });
  expect(() => buffer.record()).toThrow('buffer_overflow');
});
it('rejects incomplete producer coverage', () => {
  const buffer = new ProtocolWorldSamplingBuffer(1); worldSamplingProbe.overflow = true;
  expect(() => buffer.record()).toThrow('world_sampling_overflow');
});
