import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  acceptancePatch, AcceptancePatchError, assertAcceptanceBuildEnvironment, GATE_ANCHOR, GATE_FIX, LOCAL_PROFILES_ANCHOR, PROBE_ANCHOR, SEAM_ANCHOR, SEAM_HOOK,
} from './chunk-runtime-acceptance-patch.js';
import {
  AcceptanceUsageError, diffRgba, drillPhaseFailures, evictionsFrom, movementWhileWaiting, nearestWalkableIn, notServingReason, occupancyVerdict, parityVerdict, parseAcceptanceArgs, pinCoverage, sweepPlan,
  type PixelDiff, type StepRecord,
} from './chunk-runtime-browser-acceptance.js';

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

describe('S4g acceptance build patches', () => {
  const environment = {
    S4G_OUT_DIR: '/tmp/orchard-s4g-acceptance.x/dist-on', S4G_PREVIEW_PORT: '4272', S4G_WORLD_HOST: 'http://127.0.0.1:3471',
    VITE_SPACETIMEDB_DATABASE: 'orchard-chunk-soak-s4g01', S4G_CHUNK_AUTHORITY: 'on',
  };

  it('finds every anchor exactly once in the current client sources', () => {
    const files = { auth: 'packages/auth/src/oidc.ts', connection: 'packages/client/src/net/overworld-connection.ts', main: 'packages/client/src/overworld-main.ts' };
    for (const [path, anchor] of [[files.auth, LOCAL_PROFILES_ANCHOR], [files.main, PROBE_ANCHOR]] as const) {
      const text = source(path);
      expect(text.split(anchor).length - 1, `${path} anchor`).toBe(1);
      const patched = acceptancePatch(`/repo/${path}`, text, { chunkAuthority: 'on' });
      expect(patched).not.toBeNull();
      expect(patched).not.toBe(text);
    }
    expect(acceptancePatch(`/repo/${files.auth}`, source(files.auth), { chunkAuthority: null }))
      .toContain("export const localProfilesEnabled = true\n  && (import.meta.env['VITE_ENABLE_LOCAL_PROFILES']");
    // The bug workarounds apply while main still has the bugs (BUG-053, BUG-055), and never twice.
    const connection = source(files.connection);
    for (const [anchor, patched] of [[SEAM_ANCHOR, `${SEAM_ANCHOR} ${SEAM_HOOK}`], [GATE_ANCHOR, `${GATE_FIX}${GATE_ANCHOR}`]] as const) {
      expect(connection.split(anchor).length - 1).toBeLessThanOrEqual(1);
      if (connection.includes(anchor)) expect(acceptancePatch(`/repo/${files.connection}`, connection, { chunkAuthority: 'on' })).toContain(patched);
    }
    const fixed = connection.replace(SEAM_ANCHOR, 'SEAM_FIXED').replace(GATE_ANCHOR, 'GATE_FIXED');
    expect(acceptancePatch(`/repo/${files.connection}`, fixed, { chunkAuthority: 'on' })).toBe(fixed);
    // A legacy build leaves the seam alone.
    expect(acceptancePatch(`/repo/${files.connection}`, source(files.connection), { chunkAuthority: null })).toBeNull();
    expect(acceptancePatch(`/repo/${files.main}`, source(files.main), { chunkAuthority: null })).toContain('s4gChunkStore: (() => {');
    expect(acceptancePatch('/repo/packages/client/src/main.ts', 'x', { chunkAuthority: 'on' })).toBeNull();
  });

  it('fails the build when an anchor is missing or repeated', () => {
    expect(() => acceptancePatch('/repo/packages/auth/src/oidc.ts', 'nothing here', { chunkAuthority: 'on' })).toThrow(AcceptancePatchError);
    expect(() => acceptancePatch('/repo/packages/client/src/overworld-main.ts', `${PROBE_ANCHOR}${PROBE_ANCHOR}`, { chunkAuthority: 'on' }))
      .toThrow(/not_unique/u);
  });

  it('accepts only a disposable loopback world, an absolute non-dist output and the preview proxy', () => {
    expect(assertAcceptanceBuildEnvironment(environment)).toEqual({ outDir: environment.S4G_OUT_DIR, previewPort: 4272,
      worldHost: 'http://127.0.0.1:3471', database: 'orchard-chunk-soak-s4g01', chunkAuthority: 'on' });
    const refused = (patch: Record<string, string>) => () => assertAcceptanceBuildEnvironment({ ...environment, ...patch });
    expect(refused({ S4G_WORLD_HOST: 'http://127.0.0.1:3000' })).toThrow('s4g_world_host_must_be_disposable_loopback');
    expect(refused({ S4G_WORLD_HOST: 'https://orchard.dastari.net' })).toThrow('s4g_world_host_must_be_disposable_loopback');
    expect(refused({ VITE_SPACETIMEDB_DATABASE: 'orchard-cellar-world' })).toThrow('s4g_database_must_be_disposable');
    expect(refused({ S4G_OUT_DIR: 'relative/dist' })).toThrow('s4g_out_dir_must_be_absolute');
    expect(refused({ S4G_OUT_DIR: '/home/toby/projects/orchard-cellar/packages/client/dist' })).toThrow('s4g_out_dir_must_not_be_a_client_dist');
    expect(refused({ S4G_PREVIEW_PORT: '5173' })).toThrow('s4g_preview_port_invalid');
    expect(refused({ VITE_SPACETIMEDB_URI: 'http://127.0.0.1:3000' })).toThrow('s4g_client_must_use_the_preview_proxy');
    expect(refused({ VITE_OIDC_CLIENT_ID: 'orchard-web' })).toThrow('s4g_oidc_must_be_off');
    expect(refused({ S4G_CHUNK_AUTHORITY: 'maybe' })).toThrow('s4g_chunk_authority_invalid');
    expect(assertAcceptanceBuildEnvironment({ ...environment, S4G_CHUNK_AUTHORITY: '' }).chunkAuthority).toBeNull();
  });
});

describe('S4g acceptance driver', () => {
  const args = ['--host', 'http://127.0.0.1:3471', '--database', 'orchard-chunk-soak-s4g01', '--token-file', '/tmp/t', '--legacy-url', 'http://127.0.0.1:4271',
    '--on-url', 'http://127.0.0.1:4272', '--chunk-dir', '/tmp/c', '--evidence', '/tmp/e', '--playwright', '/tmp/p'];

  it('parses arguments and refuses production targets', () => {
    const options = parseAcceptanceArgs(args);
    expect(options).toMatchObject({ database: 'orchard-chunk-soak-s4g01', limit: null, pixelThreshold: 24, maxDiffRatio: 0.002, steadyBudgetMiB: 24 });
    const replace = (flag: string, value: string) => args.map((entry, index) => (args[index - 1] === flag ? value : entry));
    expect(() => parseAcceptanceArgs(replace('--host', 'http://127.0.0.1:3000'))).toThrow();
    expect(() => parseAcceptanceArgs(replace('--database', 'orchard-cellar-world'))).toThrow();
    expect(() => parseAcceptanceArgs(replace('--on-url', 'https://orchard.dastari.net'))).toThrow(AcceptanceUsageError);
    expect(() => parseAcceptanceArgs(replace('--legacy-url', 'http://127.0.0.1:5173'))).toThrow(AcceptanceUsageError);
    expect(() => parseAcceptanceArgs(replace('--chunk-dir', 'relative'))).toThrow(AcceptanceUsageError);
    expect(() => parseAcceptanceArgs([...args, '--unknown', 'x'])).toThrow(AcceptanceUsageError);
    expect(parseAcceptanceArgs([...args, '--limit', '12']).limit).toBe(12);
    expect(parseAcceptanceArgs(args)).toMatchObject({ rollbackDrill: null, skip: new Set() });
    expect(() => parseAcceptanceArgs([...args, '--skip', 'sweep'])).toThrow(AcceptanceUsageError);
    expect(parseAcceptanceArgs([...args, '--skip', 'invalidation,prefetch']).skip).toEqual(new Set(['invalidation', 'prefetch']));
  });

  it('parses the rollback drill (G5a) and guards its preview port and swap directory', () => {
    const drill = [...args, '--rollback-drill', '--swap-port', '4273', '--dist-on', '/tmp/w/dist-on', '--dist-legacy', '/tmp/w/dist-legacy', '--swap-dir', '/tmp/w/dist-swap'];
    expect(parseAcceptanceArgs(drill).rollbackDrill).toEqual({ swapPort: 4273, distOn: '/tmp/w/dist-on', distLegacy: '/tmp/w/dist-legacy', swapDir: '/tmp/w/dist-swap' });
    // The drill arguments alone (always passed by the run script) do not enable it.
    expect(parseAcceptanceArgs(drill.filter(entry => entry !== '--rollback-drill')).rollbackDrill).toBeNull();
    const replace = (flag: string, value: string) => drill.map((entry, index) => (drill[index - 1] === flag ? value : entry));
    expect(() => parseAcceptanceArgs(replace('--swap-port', '3000'))).toThrow(AcceptanceUsageError);
    expect(() => parseAcceptanceArgs(replace('--swap-dir', '/tmp/w/dist-on'))).toThrow('swap_dir_must_be_its_own_directory');
    expect(() => parseAcceptanceArgs(replace('--swap-dir', '/home/toby/projects/orchard-cellar/packages/client/dist'))).toThrow('swap_dir_must_be_its_own_directory');
    expect(() => parseAcceptanceArgs([...args, '--rollback-drill'])).toThrow('missing --swap-port');
    expect(() => parseAcceptanceArgs([...drill, '--rollback-drill'])).toThrow(AcceptanceUsageError);
  });

  it('judges each rollback drill phase', () => {
    const quiet = { pixels: 100, anyChange: 0, changed: 0, ratio: 0, maxDelta: 0, bbox: null };
    const base = { followMs: 400, worldRequests: 0, terrain: quiet, noise: quiet, collisionFallback: null };
    expect(drillPhaseFailures({ ...base, phase: 'on', buildMode: 'on', effectiveMode: 'on', servingStore: true }, 0.002)).toEqual([]);
    expect(drillPhaseFailures({ ...base, phase: 'server-off', buildMode: 'on', effectiveMode: 'off', servingStore: false }, 0.002)).toEqual([]);
    expect(drillPhaseFailures({ ...base, phase: 'previous-build', buildMode: 'off', effectiveMode: null, servingStore: false }, 0.002)).toEqual([]);
    expect(drillPhaseFailures({ ...base, phase: 'on-again', buildMode: 'on', effectiveMode: 'on', servingStore: true }, 0.002)).toEqual([]);
    expect(drillPhaseFailures({ ...base, phase: 'server-off', buildMode: 'on', effectiveMode: 'on', servingStore: true }, 0.002))
      .toEqual(['server-off: still on the chunk runtime (mode on)']);
    expect(drillPhaseFailures({ ...base, phase: 'previous-build', buildMode: 'on', effectiveMode: null, servingStore: false }, 0.002))
      .toEqual(['previous-build: served build mode on']);
    expect(drillPhaseFailures({ ...base, phase: 'on-again', buildMode: 'on', effectiveMode: 'on', servingStore: true, collisionFallback: 'not_on', followMs: null }, 0.002))
      .toEqual(['on-again: the page never reached the expected mode', 'on-again: not serving from chunks (mode on, fallback not_on)']);
    expect(drillPhaseFailures({ ...base, phase: 'on', buildMode: 'on', effectiveMode: 'on', servingStore: true, terrain: { ...quiet, ratio: 0.01 } }, 0.002))
      .toEqual(['on: frames differ on 1.000% of pixels']);
    expect(drillPhaseFailures({ ...base, phase: 'on', buildMode: 'on', effectiveMode: 'on', servingStore: true, terrain: { ...quiet, ratio: 0.004 }, noise: { ...quiet, ratio: 0.003 } }, 0.002)).toEqual([]);
  });

  it('plans one row-major step per chunk and stands in the nearest walkable tiles for a chunk without ground', () => {
    const plan = sweepPlan([
      { cx: 1, cy: 0, candidates: [{ tileX: 90, tileY: 30 }] },
      { cx: 0, cy: 0, candidates: [{ tileX: 30, tileY: 31 }, { tileX: 31, tileY: 31 }] },
      { cx: 0, cy: 1, candidates: [] },
    ]);
    expect(plan.map(step => [step.cx, step.cy, step.tileX, step.tileY, step.inChunk])).toEqual([
      [0, 0, 30, 31, true], [1, 0, 90, 30, true], [0, 1, 31, 31, false]]);
    expect(plan[0]!.alternatives).toEqual([{ tileX: 30, tileY: 31 }, { tileX: 31, tileY: 31 }]);
    expect(plan[2]!.alternatives!.map(tile => `${tile.tileX},${tile.tileY}`)).toEqual(['31,31', '30,31', '90,30']);
    expect(plan.map(step => step.index)).toEqual([0, 1, 2]);
    expect(() => sweepPlan([{ cx: 0, cy: 0, candidates: [] }])).toThrow('sweep_has_no_walkable_tile');
    // With the whole ground grid, the nearest interior walkable tiles (all eight neighbours walkable) stand in.
    const blocked = new Uint8Array(6 * 6).fill(1);
    for (const [x, y] of [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1], [0, 2], [1, 2], [2, 2], [3, 3], [4, 4]]) blocked[y! * 6 + x!] = 0;
    const nearest = nearestWalkableIn(6, 6, blocked);
    // (1,1) is the only tile whose whole neighbourhood is walkable; (3,3), (4,4) and the edges are not.
    expect(nearest(4, 4, 3)).toEqual([{ tileX: 1, tileY: 1 }]);
    blocked.fill(0);
    expect(nearest(0, 0, 2)).toEqual([{ tileX: 1, tileY: 1 }, { tileX: 2, tileY: 1 }]);
    expect(nearestWalkableIn(1, 1, [1])(0, 0, 3)).toEqual([]);
    expect(sweepPlan([{ cx: 0, cy: 0, candidates: [{ tileX: 5, tileY: 5 }] }, { cx: 0, cy: 1, candidates: [] }], () => [{ tileX: 7, tileY: 70 }])[1])
      .toMatchObject({ tileX: 7, tileY: 70, inChunk: false });
  });

  it('reports which chunks the sweep pinned', () => {
    const at = (keys: string[]) => ({ store: { id: 1, residentCount: 1, residentBytes: 1, installs: 1, pinned: keys.length, pinnedKeys: keys, maxChunks: 25, maxBytes: 1 } });
    expect(pinCoverage([at(['0:0', '1:0']), { store: null }, at(['1:0', '2:0'])], ['0:0', '1:0', '2:0', '3:0']))
      .toEqual({ pinned: 3, of: 4, never: ['3:0'] });
  });

  it('diffs RGBA frames with a threshold and masks', () => {
    const a = new Uint8Array(4 * 4 * 4).fill(10), b = a.slice();
    b[0] = 12; // pixel (0,0): below the threshold
    b[(1 * 4 + 2) * 4 + 1] = 200; // pixel (2,1): above
    b[(3 * 4 + 3) * 4 + 2] = 100; // pixel (3,3): above, masked below
    const heat = new Uint8Array(16);
    expect(diffRgba(a, b, 4, 4, 8, [], heat)).toEqual({ pixels: 16, anyChange: 3, changed: 2, ratio: 2 / 16, maxDelta: 190,
      bbox: { x: 2, y: 1, width: 2, height: 3 } });
    expect(heat[0]).toBe(2);
    expect(diffRgba(a, b, 4, 4, 8, [{ x: 3, y: 3, width: 1, height: 1 }])).toMatchObject({ pixels: 15, changed: 1, bbox: { x: 2, y: 1, width: 1, height: 1 } });
    expect(diffRgba(a, a, 4, 4, 0).bbox).toBeNull();
    expect(() => diffRgba(a, b.slice(4), 4, 4, 0)).toThrow('diff_size_mismatch');
  });

  const store = (id: number, residentCount: number, installs: number, residentBytes = 1_000_000) =>
    ({ id, residentCount, residentBytes, installs, pinned: Math.min(residentCount, 25), maxChunks: 25, maxBytes: 16 * 1024 * 1024 });
  const diff = (ratio: number): PixelDiff => ({ pixels: 100, anyChange: ratio === 0 ? 0 : 1, changed: Math.round(ratio * 100), ratio, maxDelta: 0, bbox: null });
  const record = (index: number, patch: Partial<StepRecord> = {}): StepRecord => ({
    step: { index, cx: index, cy: 0, tileX: 1, tileY: 1, inChunk: true }, arrivedMs: 10, readyMs: 100, store: store(1, 20, 20 + index),
    runtimeState: 'on', readiness: 'resident', memory: { legacy: { usedBytes: 100 * 1024 * 1024, backingBytes: 0 }, on: { usedBytes: 118 * 1024 * 1024, backingBytes: 2 * 1024 * 1024 } },
    terrain: diff(0), full: diff(0.001), noise: null, notServing: null, ...patch });

  it('counts evictions per store instance', () => {
    expect(evictionsFrom([store(1, 9, 9), store(1, 25, 40), null, store(2, 25, 30)])).toBe(15 + 5);
  });

  it('judges occupancy and memory', () => {
    const records = [record(0), record(1), record(2)];
    const passed = occupancyVerdict(records, 3, 24);
    expect(passed).toMatchObject({ pass: true, peakResident: 20, evictions: 2, steadyDeltaMiB: 20, peakDeltaMiB: 20 });
    expect(occupancyVerdict(records, 4, 24).reasons).toContain('swept 3 of 4 chunk centres');
    expect(occupancyVerdict([record(0, { store: store(1, 26, 26) })], 1, 24).pass).toBe(false);
    expect(occupancyVerdict([record(0, { readyMs: null })], 1, 24).reasons).toContain('1 step(s) never became ready');
    expect(occupancyVerdict(records, 3, 16).reasons[0]).toMatch(/steady chunk-runtime heap 20.0 MiB over the 16 MiB budget/u);
  });

  it('judges visual parity', () => {
    expect(parityVerdict([record(0), record(1)], 0.002)).toMatchObject({ pass: true, exactTerrain: 2, worstFull: 0.001 });
    const failed = parityVerdict([record(0, { terrain: diff(0.01) }), record(1, { full: diff(0.5) })], 0.002);
    expect(failed.pass).toBe(false);
    expect(failed).toMatchObject({ terrainOver: 1, fullOver: 1, reviewFull: [1] });
    // A terrain frame within 1.5x its own noise floor (animated water out of phase) passes.
    expect(parityVerdict([record(0, { terrain: diff(0.004), noise: diff(0.003) })], 0.002)).toMatchObject({ pass: true, terrainOver: 0, terrainOverNoise: 1 });
    // Full-scene frames between the two bounds pass but are listed for review.
    expect(parityVerdict([record(0, { full: diff(0.005) })], 0.002)).toMatchObject({ pass: true, fullOver: 0, reviewFull: [0] });
    expect(parityVerdict([record(0, { notServing: 'mode_shadow' })], 0.002).reasons).toEqual(["1 step(s) where the on build was not serving from chunks (mode_shadow)"]);
  });

  it('knows when the on build serves from chunks', () => {
    const value = { runtime: { mode: 'on', state: 'on', stale: false }, collision: { fallbackReason: null, failures: 0 },
      windowStatus: { fallback: false, failures: 0 }, records: { failures: 0 } };
    expect(notServingReason(value)).toBeNull();
    expect(notServingReason(null)).toBe('no_runtime');
    expect(notServingReason({ ...value, runtime: { mode: 'shadow', state: 'shadow', stale: false } })).toBe('mode_shadow');
    expect(notServingReason({ ...value, runtime: { mode: 'on', state: 'stale', stale: true } })).toBe('state_stale_stale');
    expect(notServingReason({ ...value, collision: { fallbackReason: 'stale_map', failures: 0 } })).toBe('collision_stale_map');
    expect(notServingReason({ ...value, windowStatus: { fallback: true, failures: 1 } })).toBe('window_fallback');
  });

  it('detects movement before the spawn ring is resident', () => {
    const sample = (t: number, ready: boolean, tileX: number) => ({ t, ready, reason: ready ? 'resident' : 'awaiting_chunks', state: 'on', tileX, tileY: 5, keyHeld: true });
    expect(movementWhileWaiting([sample(0, false, 5), sample(50, false, 5), sample(100, true, 5), sample(150, true, 6)], null))
      .toEqual({ waitedMs: 50, movedWhileWaiting: false, movedAfterReady: true, firstReadyAt: 100 });
    expect(movementWhileWaiting([sample(0, false, 5), sample(50, false, 6)], { tileX: 5, tileY: 5 }).movedWhileWaiting).toBe(true);
  });
});
