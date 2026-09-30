import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  blockingProbes, main, MANUAL_GATES, parseReadinessArgs, READINESS_PROBES, requirementFailures, runProbe, validClientBuildAudit,
  type ProbeResult,
} from './static-world-readiness.js';
import { CHUNK_RUNTIME_ACTIVATION_RELEASE, chunkRuntimeBuildAudit } from '../packages/client/src/chunk-shadow-build-gate.js';

describe('static-world readiness', () => {
  it('finds the whole-map dependencies the migration still has to remove', () => {
    const byId = new Map(READINESS_PROBES.map((probe) => [probe.id, runProbe(probe, process.cwd())]));
    // Static world S3-final (step 4 done): the server neither compiles the map, reads the precomputed
    // generator collision, nor generates topside resources; the published chunks are its only source.
    for (const id of ['server.whole-map-compile', 'server.precomputed-generator-collision', 'server.generated-resources']) {
      expect(byId.get(id)!.count, id).toBe(0);
    }
    // Static world S6 (step 5): the client neither reads the whole map document nor builds the generated island.
    expect(byId.get('client.live-map-document')!.count).toBe(0);
    expect(byId.get('client.generator-terrain')!.count).toBe(0);
    expect(byId.get('studio.document-json')!.count).toBe(0);
    expect(byId.get('server.document-json')!.count).toBe(0);
    // Step-6 baseline: studio-connection.ts (3) and admin/live-services.ts (1). S7b/S7c drive it to zero.
    expect(byId.get('studio.live-map-document-table')!).toMatchObject({
      count: 0, files: [],
    });
  });

  it('allows a private server map base, detects renewed public exposure and blocks document-only Studio publishes', () => {
    const root = mkdtempSync(join(tmpdir(), 'static-world-privacy-'));
    try {
      mkdirSync(join(root, 'packages/world/src'), { recursive: true });
      mkdirSync(join(root, 'packages/studio/src'), { recursive: true });
      const server = READINESS_PROBES.find(probe => probe.id === 'server.document-json')!;
      writeFileSync(join(root, 'packages/world/src/index.ts'), "table({ name: 'live_map_document' }, { documentJson: t.string() });");
      expect(runProbe(server, root).count).toBe(0);
      writeFileSync(join(root, 'packages/world/src/index.ts'), "table({ name: 'live_map_document', public: true }, { documentJson: t.string() });");
      expect(runProbe(server, root).count).toBe(1);
      const studio = READINESS_PROBES.find(probe => probe.id === 'studio.document-json')!;
      writeFileSync(join(root, 'packages/studio/src/editor.ts'), 'const documentJson = rebuiltChunks();');
      expect(runProbe(studio, root).count).toBe(0);
      writeFileSync(join(root, 'packages/studio/src/editor.ts'), 'connection.reducers.publishLiveMapDocument({ documentJson });');
      expect(runProbe(studio, root).count).toBe(1);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('keeps every guard probe at zero', () => {
    const guards = READINESS_PROBES.filter((probe) => probe.guard === true);
    expect(guards.map((probe) => probe.id)).toEqual(['client.whole-world-chunk-store']);
    for (const probe of guards) expect(runProbe(probe, process.cwd())).toMatchObject({ count: 0, files: [] });
  });

  it('counts the whole-world chunk store but not the bounded client store', () => {
    const root = mkdtempSync(join(tmpdir(), 'static-world-readiness-probe-'));
    try {
      mkdirSync(join(root, 'packages/client/src'), { recursive: true });
      const probe = READINESS_PROBES.find((candidate) => candidate.id === 'client.whole-world-chunk-store')!;
      writeFileSync(join(root, 'packages/client/src/bounded.ts'),
        "import { BoundedChunkTerrainStore } from '@orchard/engine/bounded-chunk-terrain-store';\nnew BoundedChunkTerrainStore(m);\n");
      expect(runProbe(probe, root).count).toBe(0);
      writeFileSync(join(root, 'packages/client/src/whole.ts'),
        "import { ChunkTerrainStore } from '@orchard/engine/chunk-terrain-store';\nnew ChunkTerrainStore(m);\n");
      expect(runProbe(probe, root)).toMatchObject({ count: 3, files: ['packages/client/src/whole.ts'] });
    } finally { rmSync(root, { recursive: true, force: true }); }
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
  const emitted = { schema: 1, mode: 'shadow', legacyModules: [], activationAllowed: false, activationRelease: null };

  it('accepts only the envelope the client build gate emits', () => {
    expect(validClientBuildAudit(emitted)).toBe(true);
    expect(validClientBuildAudit({ ...emitted, mode: 'off' })).toBe(true);
    // dist is a production artifact: an unapproved `on` build is rejected there, and only
    // the preview path accepts it.
    expect(validClientBuildAudit({ ...emitted, mode: 'on' })).toBe(false);
    expect(validClientBuildAudit({ ...emitted, mode: 'on' }, 'preview')).toBe(true);
    // Audits written before S4a had no activationRelease field.
    expect(validClientBuildAudit({ schema: 1, mode: 'shadow', legacyModules: [], activationAllowed: false })).toBe(true);
    // Stays in lockstep with the real emitter.
    for (const mode of ['off', 'shadow']) expect(validClientBuildAudit(chunkRuntimeBuildAudit(mode, [], { production: true }))).toBe(true);
    expect(validClientBuildAudit(chunkRuntimeBuildAudit('on', [], { production: false }))).toBe(false);
    expect(validClientBuildAudit(chunkRuntimeBuildAudit('on', [], { production: false }), 'preview')).toBe(true);
    // The S5c activation build (the committed release id) is a releasable production artifact.
    const activation = chunkRuntimeBuildAudit('on', [], { production: true, activationRelease: CHUNK_RUNTIME_ACTIVATION_RELEASE! });
    expect(validClientBuildAudit(activation)).toBe(true);
    expect(validClientBuildAudit(activation, 'preview')).toBe(false);
    for (const bad of [
      null, [], { legacyModules: [] }, { ...emitted, schema: 2 }, { ...emitted, mode: 'banana' }, { ...emitted, mode: 'live' },
      { ...emitted, activationAllowed: true }, { ...emitted, mode: 'on', activationAllowed: true },
      // Only the committed CHUNK_RUNTIME_ACTIVATION_RELEASE makes activation valid; any other id does not.
      { ...emitted, mode: 'on', activationAllowed: true, activationRelease: 'static-world-s5c' },
      { ...emitted, activationRelease: 'static-world-s5c' }, { ...emitted, activationAllowed: 'false' },
      { ...emitted, legacyModules: null }, { ...emitted, legacyModules: [1] },
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
      audit(JSON.stringify({ ...emitted, mode: 'on' }));
      expect(run(['--require', 'step5'])).toBe(1);
      audit(JSON.stringify(emitted));
      expect(run(['--require', 'step6'])).toBe(0);
    });
  });
});
