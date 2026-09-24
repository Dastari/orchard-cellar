import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  blockingProbes, main, MANUAL_GATES, parseReadinessArgs, READINESS_PROBES, requirementFailures, runProbe, validClientBuildAudit,
  type ProbeResult,
} from './static-world-readiness.js';
import { chunkRuntimeBuildAudit } from '../packages/client/src/chunk-shadow-build-gate.js';

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

  it('rejects a missing, invalid, repeated or unknown requirement instead of passing', () => {
    expect(parseReadinessArgs([])).toEqual({ json: false, required: null });
    expect(parseReadinessArgs(['--json', '--require', 'step5'])).toEqual({ json: true, required: 'step5' });
    expect(parseReadinessArgs(['--require'])).toHaveProperty('error');
    expect(parseReadinessArgs(['--require', '--json'])).toHaveProperty('error');
    expect(parseReadinessArgs(['--require', 'step7'])).toHaveProperty('error');
    expect(parseReadinessArgs(['--require', 'step4', '--require', 'step6'])).toHaveProperty('error');
    expect(parseReadinessArgs(['--requires', 'step4'])).toHaveProperty('error');
  });

  it('requires a valid client build audit for steps 5 and 6', () => {
    expect(requirementFailures([], null, 'step4')).toEqual([]);
    expect(requirementFailures([], null, 'step5')).toEqual(['no valid client build audit (run npm run build -w @orchard/client)']);
    expect(requirementFailures([], ['packages/engine/src/terrain.ts'], 'step6')).toEqual(['client build still bundles 1 legacy module(s)']);
    expect(requirementFailures([], [], 'step6')).toEqual([]);
  });

  // Exactly what chunkRuntimeBuildAudit emits for a generator-free shadow build.
  const emitted = { schema: 1, mode: 'shadow', legacyModules: [], activationAllowed: false };

  it('accepts only the envelope the client build gate emits', () => {
    expect(validClientBuildAudit(emitted)).toBe(true);
    expect(validClientBuildAudit({ ...emitted, mode: 'off' })).toBe(true);
    // Stays in lockstep with the real emitter.
    for (const mode of ['off', 'shadow']) expect(validClientBuildAudit(chunkRuntimeBuildAudit(mode, []))).toBe(true);
    for (const bad of [
      null, [], { legacyModules: [] }, { ...emitted, schema: 2 }, { ...emitted, mode: 'on' }, { ...emitted, mode: 'banana' },
      { ...emitted, activationAllowed: true }, { ...emitted, legacyModules: null }, { ...emitted, legacyModules: [1] },
    ]) expect(validClientBuildAudit(bad)).toBe(false);
  });

  describe('CLI exit codes on a zero-probe fixture', () => {
    let root = '';
    afterEach(() => { vi.restoreAllMocks(); if (root) rmSync(root, { recursive: true, force: true }); });
    const run = (argv: string[]) => {
      vi.spyOn(console, 'log').mockImplementation(() => {});
      vi.spyOn(console, 'error').mockImplementation(() => {});
      return main(argv, root);
    };
    const audit = (text: string) => {
      mkdirSync(join(root, 'packages/client/dist'), { recursive: true });
      writeFileSync(join(root, 'packages/client/dist/chunk-runtime-audit.json'), text);
    };

    it('fails steps 5 and 6 without a valid audit and passes only with an empty one', () => {
      root = mkdtempSync(join(tmpdir(), 'static-world-readiness-'));
      expect(run(['--require'])).toBe(2);
      expect(run(['--require', 'step4'])).toBe(0);
      expect(run(['--require', 'step5'])).toBe(1);
      expect(run(['--require', 'step6'])).toBe(1);
      audit('not json');
      expect(run(['--require', 'step5'])).toBe(1);
      audit(JSON.stringify({ ...emitted, legacyModules: ['packages/sim/src/map-compiler.ts'] }));
      expect(run(['--require', 'step5'])).toBe(1);
      audit(JSON.stringify({ legacyModules: [] }));
      expect(run(['--require', 'step5'])).toBe(1);
      audit(JSON.stringify({ schema: 999, mode: 'banana', activationAllowed: true, legacyModules: [] }));
      expect(run(['--require', 'step6'])).toBe(1);
      audit(JSON.stringify(emitted));
      expect(run(['--require', 'step6'])).toBe(0);
    });
  });
});
