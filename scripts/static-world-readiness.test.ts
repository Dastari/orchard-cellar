import { describe, expect, it } from 'vitest';
import { blockingProbes, MANUAL_GATES, READINESS_PROBES, runProbe, type ProbeResult } from './static-world-readiness.js';

describe('static-world readiness', () => {
  it('finds the whole-map dependencies the migration still has to remove', () => {
    const byId = new Map(READINESS_PROBES.map((probe) => [probe.id, runProbe(probe, process.cwd())]));
    // These fall to zero as steps 4-6 land; this test then flips to assert zero.
    expect(byId.get('server.whole-map-compile')!.files).toContain('packages/world/src/index.ts');
    expect(byId.get('client.live-map-document')!.count).toBeGreaterThan(0);
    expect(byId.get('studio.document-json')!.count).toBeGreaterThan(0);
  });

  it('blocks a step on its own probes and every earlier step', () => {
    const result = (id: string, step: ProbeResult['step'], count: number): ProbeResult => ({ id, step, description: id, count, files: [] });
    const results = [result('a', 'step4', 2), result('b', 'step5', 0), result('c', 'step6', 1)];
    expect(blockingProbes(results, 'step4').map((r) => r.id)).toEqual(['a']);
    expect(blockingProbes(results, 'step5').map((r) => r.id)).toEqual(['a']);
    expect(blockingProbes(results, 'step6').map((r) => r.id)).toEqual(['a', 'c']);
  });

  it('keeps probe and manual gate ids unique', () => {
    const ids = [...READINESS_PROBES.map((probe) => probe.id), ...MANUAL_GATES.map((gate) => gate.id)];
    expect(new Set(ids).size).toBe(ids.length);
  });
});
