import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { assertSoakTarget, compareHeads, readTokenFile, type LiveRows, type MaterializedChunks } from './chunk-authority-live-rows.js';
import {
  chunkWalkTargets, parseSoakArgs, runSoak, summarizeHostLog, withChunkAuthorityRestoredOff,
  type ChunkAuthorityModeName, type SoakApi, type SoakEvidence,
} from './chunk-authority-soak.js';
import { parityGateReport, parseParityGateArgs } from './chunk-authority-parity-gate.js';

const LOCAL = ['--host', 'http://127.0.0.1:3470', '--database', 'orchard-chunk-soak-local01', '--token-file', '/tmp/token'];

describe('chunk-authority soak: target guards', () => {
  it('accepts a disposable loopback world', () => {
    for (const host of ['http://127.0.0.1:3470', 'http://localhost:3401', 'http://[::1]:3470']) {
      expect(() => assertSoakTarget({ host, database: 'orchard-chunk-soak-local01' })).not.toThrow();
    }
    expect(parseSoakArgs(LOCAL)).toMatchObject({ target: { host: 'http://127.0.0.1:3470', database: 'orchard-chunk-soak-local01' },
      allowRemoteHost: false, withOn: false, dwellMs: 1_300, walkLimit: null });
  });

  it('refuses a non-local host unless explicitly allowed', () => {
    const remote = ['--host', 'https://staging.example.net', '--database', 'orchard-staging', '--token-file', '/tmp/token'];
    expect(() => parseSoakArgs(remote)).toThrow('soak_refuses_non_local_host');
    expect(() => parseSoakArgs(['--host', 'http://10.0.0.5:3470', '--database', 'orchard-chunk-soak-a1', '--token-file', '/t'])).toThrow('soak_refuses_non_local_host');
    expect(parseSoakArgs([...remote, '--allow-remote-host']).allowRemoteHost).toBe(true);
  });

  it('never targets production: the database name or the loopback production port, with or without the flag', () => {
    for (const flag of [[], ['--allow-remote-host']]) {
      expect(() => parseSoakArgs(['--host', 'http://127.0.0.1:3470', '--database', 'orchard-cellar-world', '--token-file', '/t', ...flag]))
        .toThrow('soak_refuses_production_database');
      expect(() => parseSoakArgs(['--host', 'https://orchard.dastari.net', '--database', 'orchard-cellar-world', '--token-file', '/t', ...flag]))
        .toThrow('soak_refuses_production_database');
      for (const host of ['http://127.0.0.1:3000', 'http://localhost:3000', 'http://[::1]:3000']) {
        expect(() => parseSoakArgs(['--host', host, '--database', 'orchard-cellar-dev', '--token-file', '/t', ...flag])).toThrow('soak_refuses_production_host_port');
      }
    }
  });

  it('refuses unknown arguments, missing values and malformed targets', () => {
    expect(() => parseSoakArgs([...LOCAL, '--token', 'secret'])).toThrow('unknown argument --token');
    expect(() => parseSoakArgs(['--host', 'http://127.0.0.1:3470', '--database', 'orchard-chunk-soak-local01'])).toThrow(/Usage/u);
    expect(() => parseSoakArgs([...LOCAL, '--dwell-ms'])).toThrow('missing value for --dwell-ms');
    expect(() => parseSoakArgs([...LOCAL, '--dwell-ms', '500'])).toThrow('invalid --dwell-ms');
    expect(() => parseSoakArgs(['--host', 'ftp://127.0.0.1:3470', '--database', 'orchard-chunk-soak-local01', '--token-file', '/t'])).toThrow('soak_invalid_host');
    expect(() => parseSoakArgs(['--host', 'http://127.0.0.1:3470', '--database', 'Bad Name', '--token-file', '/t'])).toThrow('soak_invalid_database');
  });

  it('reads the target from the environment with the same guards', () => {
    expect(() => parseSoakArgs([], { SPACETIMEDB_HOST: 'http://127.0.0.1:3000', SPACETIMEDB_DATABASE: 'orchard-cellar-world', CHUNK_SOAK_TOKEN_FILE: '/t' }))
      .toThrow('soak_refuses_production_database');
    expect(parseSoakArgs([], { SPACETIMEDB_HOST: 'http://127.0.0.1:3470', SPACETIMEDB_DATABASE: 'orchard-chunk-soak-x1', CHUNK_SOAK_TOKEN_FILE: '/t' }).tokenFile).toBe('/t');
  });

  it('the disposable runner never uses port 3000 or a non-disposable database', async () => {
    const script = await readFile(new URL('./run-chunk-authority-soak.sh', import.meta.url), 'utf8');
    expect(script).toContain('listen_port == 3000');
    expect(script).toContain('^orchard-chunk-soak-');
    expect(script).toContain('--listen-addr "127.0.0.1:${listen_port}"');
    expect(script).toContain('--in-memory');
    expect(script).not.toMatch(/pkill|killall/u);
    expect(script).toContain('kill "${host_pid}"');
  });
});

// --- Always restores off ---------------------------------------------------------------------------

interface FakeWorld {
  readonly api: SoakApi;
  readonly modes: ChunkAuthorityModeName[];
  current: ChunkAuthorityModeName;
}

function okReport(extra: Record<string, unknown> = {}): string {
  return JSON.stringify({ schema: 1, ok: true, servable: { ok: true }, completeness: { complete: true }, disagreements: { count: 0 }, instance: { auditCalls: 1 }, ...extra });
}

const CLEAN_LOG = [
  'INFO {"event":"chunk_authority_assembled","key":"k"}',
  'INFO chunk_authority.assemble: 180.5ms',
  'INFO {"event":"chunk_authority_shadow_compare","key":"k|c","equal":true,"total":0}',
  'INFO {"event":"chunk_authority_sample_window","window":"0","sampledTicks":50,"sampledPositions":50,"disagreements":0,"logged":0,"suppressed":0}',
].join('\n');

function fakeWorld(overrides: Partial<SoakApi> & { failOffAttempts?: number } = {}): FakeWorld {
  let failOff = overrides.failOffAttempts ?? 0;
  let shadowRevision: number | null = null;
  const world: FakeWorld = {
    modes: [],
    current: 'off',
    api: {
      identityHex: 'aa'.repeat(32),
      liveRows: (): LiveRows => ({
        mapRow: { mapId: 'live-island', revision: 1, documentJson: '{}', contentHash: 'map-1' },
        contentRows: null, contentHead: null,
        published: { shadow: shadowRevision === null ? null : { revision: shadowRevision, mapId: 'live-island', contentHash: 'c', manifestJson: '{}' }, heads: [] },
      }),
      chunkAuthorityMode: () => world.current,
      waitFor: async (label, condition) => { if (!condition()) throw new Error(`${label}_timeout`); },
      publishLiveMap: async () => {},
      stageBlob: async () => {},
      publishShadow: async ({ expectedRevision }) => {
        if ((shadowRevision ?? 0) !== expectedRevision) throw new Error('chunk_shadow_revision_conflict');
        shadowRevision = expectedRevision + 1;
      },
      setChunkAuthority: async mode => {
        world.modes.push(mode);
        if (mode === 'off' && world.modes.length > 1 && failOff > 0) { failOff -= 1; throw new Error('transport_closed'); }
        world.current = mode;
      },
      audit: async () => okReport(),
      teleport: async () => null,
      heartbeat: async () => {},
      sleep: async () => {},
      now: () => 1_790_000_000_000,
      hostLog: async () => CLEAN_LOG,
      probe: async () => ({ ok: true, ms: 1 }),
      ...overrides,
    },
  };
  return world;
}

const materialized = {
  summary: { chunks: 1, contentHash: 'content-1', sourceHash: 'map-1', parity: 'passed' },
  manifest: { schema: 1, chunkSize: 64, spaceId: 0, width: 64, height: 64, assetRevision: 'a', sourceRevision: 1, sourceHash: 'map-1', metadata: {}, chunks: [] },
  manifestJson: '{}\n',
  blobs: [{ cx: 0, cy: 0, contentHash: 'h', bytes: new Uint8Array(10) }],
  materializeMs: 5,
} as unknown as MaterializedChunks;

const deps = {
  materialize: async () => materialized,
  bootstrapDocument: async () => '{}',
  log: () => {},
  walkTargets: () => [{ cx: 0, cy: 0, candidates: [{ tileX: 32, tileY: 32 }] }],
};
const soakOptions = { target: { host: 'http://127.0.0.1:3470', database: 'orchard-chunk-soak-local01' }, withOn: false, dwellMs: 1_300, walkLimit: null, probes: false, readLogs: true };

describe('chunk-authority soak: always restores off', () => {
  it('passes a clean run and ends off after shadow (and on)', async () => {
    for (const withOn of [false, true]) {
      const log = withOn ? `${CLEAN_LOG}\nINFO {"event":"chunk_authority_serving","key":"k"}` : CLEAN_LOG;
      const world = fakeWorld({ hostLog: async () => log });
      const evidence = await runSoak(world.api, { ...soakOptions, withOn }, deps);
      expect(evidence.failures).toEqual([]);
      expect(evidence.result).toBe('passed');
      expect(world.modes).toEqual(withOn ? ['off', 'shadow', 'on', 'off'] : ['off', 'shadow', 'off']);
      expect(world.current).toBe('off');
      expect(evidence.restore).toEqual({ restoredOff: true, attempts: 1, finalMode: 'off' });
      expect(evidence.publish).toMatchObject({ expectedRevision: 0, staleCasRefusal: 'chunk_shadow_revision_conflict' });
    }
  });

  it.each([
    ['a failed blob stage (before the switch moves)', { stageBlob: async () => { throw new Error('chunk_blob_too_large'); } }],
    ['a thrown audit while shadow is on', { audit: async () => { throw new Error('procedure_failed'); } }],
    ['a teleport that throws mid-walk', { teleport: async () => { throw new Error('socket closed'); } }],
    ['an unreadable host log', { hostLog: async () => { throw new Error('logs_failed'); } }],
  ])('restores off after %s', async (_label, override) => {
    const world = fakeWorld(override as Partial<SoakApi>);
    const evidence = await runSoak(world.api, soakOptions, deps);
    expect(evidence.result).toBe('failed');
    expect(evidence.failures.some(failure => failure.startsWith('aborted:'))).toBe(true);
    expect(world.modes.at(-1)).toBe('off');
    expect(world.current).toBe('off');
    expect(evidence.restore.restoredOff).toBe(true);
  });

  it('fails when the audit disagrees or the sampler logged a disagreement, and still restores off', async () => {
    const disagreeing = fakeWorld({ audit: async () => okReport({ ok: false, disagreements: { count: 3 } }) });
    const first = await runSoak(disagreeing.api, soakOptions, deps);
    expect(first.failures).toEqual(expect.arrayContaining(['shadow audit disagreements: 3']));
    expect(disagreeing.current).toBe('off');
    const sampled = fakeWorld({ hostLog: async () => `${CLEAN_LOG}\nWARN {"event":"chunk_authority_sample_disagreement","tick":"40","samples":[]}\n`
      + 'WARN {"event":"chunk_authority_sample_window","window":"1","sampledTicks":3,"sampledPositions":3,"disagreements":2,"logged":2,"suppressed":0}' });
    const second = await runSoak(sampled.api, soakOptions, deps);
    expect(second.failures).toEqual(expect.arrayContaining(['the shadow sampler logged disagreements: 2']));
    expect(sampled.current).toBe('off');
  });

  it('fails when the sampler never ran', async () => {
    const world = fakeWorld({ hostLog: async () => 'INFO {"event":"chunk_authority_shadow_compare","key":"k","equal":true,"total":0}' });
    const evidence = await runSoak(world.api, soakOptions, deps);
    expect(evidence.failures).toContain('the shadow per-tick sampler logged no sample window');
  });

  it('retries the restore and reports loudly when off cannot be restored', async () => {
    const retried = fakeWorld({ failOffAttempts: 2 });
    const recovered = await runSoak(retried.api, soakOptions, deps);
    expect(recovered.restore).toEqual({ restoredOff: true, attempts: 3, finalMode: 'off' });
    expect(recovered.result).toBe('passed');
    const stuck = fakeWorld({ failOffAttempts: 5 });
    const evidence = await runSoak(stuck.api, soakOptions, deps);
    expect(evidence.restore).toMatchObject({ restoredOff: false, attempts: 3, finalMode: 'shadow', error: 'transport_closed' });
    expect(evidence.result).toBe('failed');
    expect(evidence.failures).toContain('chunkAuthority not restored to off: transport_closed');
  });

  it('withChunkAuthorityRestoredOff rethrows the body error after restoring', async () => {
    const world = fakeWorld();
    world.current = 'on';
    const restore: SoakEvidence['restore'] = { restoredOff: false, attempts: 0, finalMode: null };
    await expect(withChunkAuthorityRestoredOff(world.api, restore, async () => { throw new Error('body failed'); })).rejects.toThrow('body failed');
    expect(world.current).toBe('off');
    expect(restore.restoredOff).toBe(true);
  });
});

describe('chunk-authority soak: helpers', () => {
  it('summarizes the host log: sampler windows, compares, timers and limit lines', () => {
    const log = summarizeHostLog(`${CLEAN_LOG}\nINFO chunk_authority.compare: 1.2s\nWARN reducer ran out of energy\nnot json {"event": broken`);
    expect(log).toMatchObject({
      sampledTicks: 50, sampledPositions: 50, sampleDisagreements: 0,
      compares: [{ key: 'k|c', equal: true, total: 0 }],
      timings: { assembleMs: [180.5], compareMs: [1200] },
      limitLines: ['WARN reducer ran out of energy'],
      events: { chunk_authority_assembled: 1, chunk_authority_shadow_compare: 1, chunk_authority_sample_window: 1 },
    });
  });

  it('picks the walkable tiles nearest each chunk centre, with a margin from the chunk edge', () => {
    const width = 100, height = 64;
    const blocked = Array.from({ length: width * height }, (_, index) => (index % width) < 64);
    const targets = chunkWalkTargets(width, height, blocked, 2);
    expect(targets.map(({ cx, cy }) => `${cx},${cy}`)).toEqual(['0,0', '1,0']);
    expect(targets[0]!.candidates).toEqual([]);
    // Chunk 1 is clipped to 36 columns (64-99): centre 81.5,31.5.
    expect(targets[1]!.candidates).toEqual([{ tileX: 81, tileY: 31 }, { tileX: 82, tileY: 31 }]);
  });

  it('compares head sets chunk by chunk and by map source', () => {
    const a = { sourceRevision: 1, sourceHash: 'm', chunks: [{ cx: 0, cy: 0, contentHash: 'x', byteLength: 1 }, { cx: 1, cy: 0, contentHash: 'y', byteLength: 1 }] };
    expect(compareHeads(a, a).equal).toBe(true);
    const moved = compareHeads(a, { ...a, sourceRevision: 2, chunks: [a.chunks[0]!, { ...a.chunks[1]!, contentHash: 'z' }] });
    expect(moved).toMatchObject({ equal: false, source: { equal: false, expected: '1:m', actual: '2:m' }, differences: [{ cx: 1, cy: 0, expected: 'y', actual: 'z' }] });
  });
});

describe('token files', () => {
  const directory = mkdtemp(join(tmpdir(), 'chunk-soak-token-'));
  afterAll(async () => rm(await directory, { recursive: true, force: true }));
  const file = async (name: string, content: string, mode = 0o600) => {
    const path = join(await directory, name);
    await writeFile(path, content);
    await chmod(path, mode);
    return path;
  };

  it('reads a bare token or a labelled credential, and refuses open permissions or refresh-only entries', async () => {
    expect(await readTokenFile(await file('bare', 'eyJ.token.sig\n'))).toBe('eyJ.token.sig');
    await expect(readTokenFile(await file('open', 'eyJ.token.sig', 0o644))).rejects.toThrow('token_file_permissions_too_open');
    const map = await file('map', JSON.stringify({ owner: 'eyJ.owner', other: 'eyJ.other' }));
    await expect(readTokenFile(map)).rejects.toThrow('token_file_label_required');
    expect(await readTokenFile(map, 'owner')).toBe('eyJ.owner');
    const refresh = await file('refresh', JSON.stringify([{ label: 'owner', clientId: 'orchard-web', refreshToken: 'r' }]));
    await expect(readTokenFile(refresh)).rejects.toThrow('token_file_needs_refresh');
  });
});

describe('live-row parity gate', () => {
  it('takes the token only from a file named in the environment', () => {
    const args = ['--host', 'https://orchard.example', '--database', 'orchard-cellar-world'];
    expect(() => parseParityGateArgs(args, {})).toThrow(/Usage/u);
    expect(() => parseParityGateArgs([...args, '--token', 'secret'], { CHUNK_PARITY_TOKEN_FILE: '/t' })).toThrow(/never on the command line/u);
    expect(() => parseParityGateArgs([...args, '--token-file', '/t'], { CHUNK_PARITY_TOKEN_FILE: '/t' })).toThrow(/never on the command line/u);
    expect(parseParityGateArgs([...args, '--candidate', '/c'], { CHUNK_PARITY_TOKEN_FILE: '/t' })).toMatchObject({ tokenFile: '/t', candidate: '/c' });
  });

  it('is read-only: no reducer or procedure call in the gate or its shared plumbing', async () => {
    for (const name of ['./chunk-authority-parity-gate.ts', './chunk-authority-live-rows.ts']) {
      const source = await readFile(new URL(name, import.meta.url), 'utf8');
      expect(source, name).not.toMatch(/\.reducers\b|\.procedures\b|callReducer|callProcedure/u);
    }
  });

  it('passes only when the live-row materialization equals the candidate heads', () => {
    const manifest = materialized.manifest;
    const rows = fakeWorld().api.liveRows();
    const base = { target: { host: 'h', database: 'd' }, readAt: 't', rows, materializeError: null };
    const live = { summary: materialized.summary, manifest: { ...manifest, chunks: [{ cx: 0, cy: 0, contentHash: 'x', byteLength: 1 }] }, materializeMs: 1 };
    expect(parityGateReport({ ...base, live, candidate: { manifest: live.manifest } })).toMatchObject({ passed: true, failures: [], candidate: { equal: true } });
    const stale = parityGateReport({ ...base, live, candidate: { manifest: { ...live.manifest, chunks: [{ cx: 0, cy: 0, contentHash: 'old', byteLength: 1 }] } } });
    expect(stale.passed).toBe(false);
    expect(stale.failures[0]).toMatch(/candidate heads differ/u);
    const broken = parityGateReport({ ...base, live: null, materializeError: 'Authority collision parity failed: ground', candidate: null });
    expect(broken).toMatchObject({ passed: false, failures: ['materialize: Authority collision parity failed: ground'] });
  });
});
