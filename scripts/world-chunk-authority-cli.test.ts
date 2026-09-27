import { mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CHUNK_RESOURCE_GENERATOR } from '../packages/world/src/content/chunk-authority-runtime.js';
import {
  auditSummary, headsFile, moduleLogFiles, moduleLogMessages, parseCli, run, setConfirmation, statusReport,
  type AuthorityHead, type AuthorityShadow, type AuthorityWorld, type CliOptions, type RunDeps,
} from './world-chunk-authority.js';
import { EXIT, PipelineError, sha256Hex } from './world-chunks-publish.js';

const TOKEN = 'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJkZXYifQ.c2lnbmF0dXJlLXNlY3JldA';
const ENV = { WORLD_CHUNKS_TOKEN_FILE: '/private/rejoin.json', WORLD_CHUNKS_TOKEN_LABEL: 'orchard-agent-dev' };
const LOCAL = ['--host', 'http://127.0.0.1:3100', '--database', 'orchard-s5c-disposable'];
const dirs: string[] = [];
function temp(): string { const dir = mkdtempSync(join(tmpdir(), 'world-chunk-authority-')); dirs.push(dir); return dir; }
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

/** `null`: an unstamped manifest. */
function manifestJson(stamp: unknown = CHUNK_RESOURCE_GENERATOR, chunks = 2): string {
  return JSON.stringify({ schema: 1, sourceRevision: 12, sourceHash: 'map-12', chunks: Array.from({ length: chunks }, (_, i) => ({ cx: i, cy: 0 })),
    metadata: { authority: { schema: 1, ...(stamp === null ? {} : { resourceGenerator: stamp }) } } });
}
const HASH = (n: number) => n.toString(16).padStart(64, '0');

class FakeWorld implements AuthorityWorld {
  identityHex = 'c2005884';
  flags: string | undefined = undefined;
  publication: AuthorityShadow | null = { revision: 4, contentHash: 'content-1', manifestJson: manifestJson() };
  rows: AuthorityHead[] = [
    { cx: 1, cy: 0, revision: 4, contentHash: HASH(2), byteLength: 2000 },
    { cx: 0, cy: 0, revision: 4, contentHash: HASH(1), byteLength: 1000 },
    { cx: 0, cy: 1, revision: 3, contentHash: HASH(3), byteLength: 3000 },
  ];
  map: { revision: number; contentHash: string } | null = { revision: 12, contentHash: 'map-12' };
  auditText = JSON.stringify({ ok: true, mode: 'off', servable: { ok: true }, completeness: { complete: true, expectedChunks: 169, heads: 169, blobs: { missing: 0 } },
    disagreements: { compared: true, count: 0, fields: {} }, keys: { chunks: 'k' }, timings: { totalMs: 6500 } });
  applies = true;
  closed = 0;
  readonly calls: string[] = [];
  flagsJson() { return this.flags; }
  shadow() { return this.publication; }
  heads() { return this.rows; }
  liveMap() { return this.map; }
  async setChunkAuthority(mode: string) { this.calls.push(`set:${mode}`); if (this.applies) this.flags = JSON.stringify({ weather: 'auto', chunkAuthority: mode }); }
  async audit() { this.calls.push('audit'); return this.auditText; }
  async waitFor(predicate: () => boolean) { return predicate(); }
  close() { this.closed++; }
}

function deps(world: FakeWorld, overrides: Partial<RunDeps> = {}) {
  const out: string[] = [], err: string[] = [], order: string[] = [];
  const value: RunDeps = {
    connect: vi.fn(async () => { order.push('connect'); return world; }),
    readToken: vi.fn(async () => { order.push('token'); return TOKEN; }),
    refresh: vi.fn(async () => { order.push('refresh'); }),
    stdout: line => out.push(line), stderr: line => err.push(line), now: () => new Date('2026-09-28T01:02:03Z'),
    ...overrides,
  };
  return { deps: value, out, err, order };
}
const options = (argv: string[], env: Record<string, string> = ENV): CliOptions => parseCli(argv, env);

describe('world-chunk-authority CLI parsing', () => {
  it('parses every command and refuses bad targets, flags and secrets on the command line', () => {
    expect(options(['status', ...LOCAL]).command).toEqual({ kind: 'status' });
    expect(options(['set', 'shadow', ...LOCAL, '--refresh']).command).toEqual({ kind: 'set', mode: 'shadow' });
    expect(options(['set', 'shadow', ...LOCAL, '--refresh']).refresh).toBe(true);
    expect(options(['dump', '/tmp/x', ...LOCAL]).command).toEqual({ kind: 'dump', dir: '/tmp/x' });
    expect(options(['logs', '--log-dir', '/data/replicas/8000000/module_logs', '--since', '2026-09-28T00:00:00Z'], {}).sinceMs).toBe(Date.parse('2026-09-28T00:00:00Z'));
    const refused: [string[], Record<string, string>, string][] = [
      [['set', 'sideways', ...LOCAL], ENV, 'usage'],
      [['audit', ...LOCAL], ENV, 'audit_needs_report'],
      [['status', ...LOCAL, '--token', TOKEN], ENV, 'secrets_and_confirmations_come_from_the_environment'],
      [['status', '--host', 'http://127.0.0.1:3100', '--database', 'orchard-cellar-world'], ENV, 'production_target_must_be_canonical'],
      [['status', '--host', 'https://orchard.dastari.net', '--database', 'orchard-cellar-world'], ENV, 'production_target_must_be_canonical'],
      [['status', ...LOCAL], {}, 'usage'],
      [['status', ...LOCAL, '--report', 'relative.json'], ENV, 'report_path_must_be_absolute'],
      [['dump', 'relative', ...LOCAL], ENV, 'dump_dir_must_be_absolute'],
      [['logs', '--log-dir', '/d', ...LOCAL], {}, 'logs_reads_files_only'],
      [['logs', '--log-dir', '/d', '--since', 'yesterday'], {}, 'invalid_time'],
      [['status', ...LOCAL, '--log-dir', '/d'], ENV, 'usage'],
    ];
    for (const [argv, env, code] of refused) {
      let error: unknown;
      try { parseCli(argv, env); } catch (caught) { error = caught; }
      expect(error, argv.join(' ')).toBeInstanceOf(PipelineError);
      expect((error as PipelineError).code, argv.join(' ')).toBe(code);
      expect((error as PipelineError).exitCode).toBe(EXIT.usage);
    }
    // The canonical production target is accepted.
    expect(options(['status', '--host', 'http://127.0.0.1:3000', '--database', 'orchard-cellar-world']).host).toBe('http://127.0.0.1:3000');
  });
});

describe('set', () => {
  it('refuses without the exact confirmation, before refreshing, reading the token or connecting', async () => {
    for (const confirm of [undefined, 'set:on:orchard-s5c-disposable', 'set:shadow:orchard-cellar-world']) {
      const world = new FakeWorld(), d = deps(world);
      const env = { ...ENV, ...(confirm === undefined ? {} : { WORLD_CHUNK_AUTHORITY_CONFIRM: confirm }) };
      expect(await run(options(['set', 'shadow', ...LOCAL, '--refresh'], env), d.deps)).toBe(EXIT.confirm);
      expect(d.order).toEqual([]);
      expect(world.calls).toEqual([]);
      expect(d.err.join('\n')).toContain(`WORLD_CHUNK_AUTHORITY_CONFIRM=${setConfirmation('shadow', 'orchard-s5c-disposable')}`);
    }
  });

  it('switches with the confirmation, refreshing first, and waits for the public row', async () => {
    const world = new FakeWorld(), d = deps(world), report = join(temp(), 'set.json');
    const env = { ...ENV, WORLD_CHUNK_AUTHORITY_CONFIRM: 'set:shadow:orchard-s5c-disposable' };
    expect(await run(options(['set', 'shadow', ...LOCAL, '--refresh', '--report', report], env), d.deps)).toBe(EXIT.ok);
    expect(d.order).toEqual(['refresh', 'token', 'connect']);
    expect(d.deps.refresh).toHaveBeenCalledWith('/private/rejoin.json', { host: 'http://127.0.0.1:3100', database: 'orchard-s5c-disposable' });
    expect(world.calls).toEqual(['set:shadow']);
    const written = JSON.parse(readFileSync(report, 'utf8'));
    expect(written).toMatchObject({ command: 'set', before: 'off', requested: 'shadow', after: 'shadow', reached: true, at: '2026-09-28T01:02:03.000Z' });
    expect(statSync(report).mode & 0o777).toBe(0o600);
    expect(world.closed).toBe(1);
  });

  it('fails (exit 1) when the row never reaches the mode', async () => {
    const world = new FakeWorld(); world.applies = false;
    const d = deps(world);
    expect(await run(options(['set', 'on', ...LOCAL], { ...ENV, WORLD_CHUNK_AUTHORITY_CONFIRM: 'set:on:orchard-s5c-disposable' }), d.deps)).toBe(EXIT.failed);
    expect(JSON.parse(d.out[0]!)).toMatchObject({ before: 'off', requested: 'on', after: 'off', reached: false });
    // No refresh unless asked.
    expect(d.deps.refresh).not.toHaveBeenCalled();
  });
});

describe('status and dump', () => {
  it('reports mode, publication, heads and the generator stamp against this checkout', () => {
    const world = new FakeWorld();
    world.flags = JSON.stringify({ chunkAuthority: 'shadow' });
    const report = statusReport(world);
    expect(report).toMatchObject({ chunkAuthority: 'shadow', liveMap: { revision: 12 },
      publication: { shadowRevision: 4, manifestHash: sha256Hex(world.publication!.manifestJson), sourceRevision: 12, mapMatches: true,
        heads: 3, headsAtRevision: 2, manifestChunks: 2 },
      resourceGenerator: { published: CHUNK_RESOURCE_GENERATOR, expected: CHUNK_RESOURCE_GENERATOR, matches: true } });
    for (const stamp of [null, { ...CHUNK_RESOURCE_GENERATOR, version: CHUNK_RESOURCE_GENERATOR.version - 1 }]) {
      world.publication = { revision: 4, contentHash: 'content-1', manifestJson: manifestJson(stamp) };
      expect(statusReport(world).resourceGenerator.matches).toBe(false);
    }
    world.map = { revision: 13, contentHash: 'map-13' };
    expect(statusReport(world).publication?.mapMatches).toBe(false);
    world.publication = null; world.flags = 'not json';
    expect(statusReport(world)).toMatchObject({ chunkAuthority: 'off', publication: null, resourceGenerator: { published: null, matches: false } });
  });

  it('dumps the exact manifest and a validator heads file (published revision only), refusing an existing directory', async () => {
    const world = new FakeWorld(), d = deps(world), dir = join(temp(), 'published');
    expect(await run(options(['dump', dir, ...LOCAL]), d.deps)).toBe(EXIT.ok);
    expect(readFileSync(join(dir, 'manifest.json'), 'utf8')).toBe(world.publication!.manifestJson);
    expect(readFileSync(join(dir, 'heads.txt'), 'utf8')).toBe(`0 ${HASH(1)} 1000\n0 ${HASH(2)} 2000\n`);
    expect(statSync(dir).mode & 0o777).toBe(0o700);
    expect(statSync(join(dir, 'heads.txt')).mode & 0o777).toBe(0o600);
    expect(JSON.parse(d.out[0]!)).toMatchObject({ command: 'dump', shadowRevision: 4, heads: 2 });
    const again = deps(new FakeWorld());
    expect(await run(options(['dump', dir, ...LOCAL]), again.deps)).toBe(EXIT.usage);
    expect(again.order).toEqual([]);
    const none = new FakeWorld(); none.publication = null;
    expect(await run(options(['dump', join(temp(), 'none'), ...LOCAL]), deps(none).deps)).toBe(EXIT.failed);
    expect(headsFile({ revision: 9, contentHash: 'c', manifestJson: '{}' }, world.rows)).toBe('');
  });
});

describe('audit', () => {
  it('writes the procedure JSON (0600, never overwritten) and exits by its ok', async () => {
    const world = new FakeWorld(), d = deps(world), report = join(temp(), 'audit.json');
    expect(await run(options(['audit', ...LOCAL, '--report', report]), d.deps)).toBe(EXIT.ok);
    expect(readFileSync(report, 'utf8')).toBe(`${world.auditText}\n`);
    expect(JSON.parse(d.out[0]!)).toMatchObject({ command: 'audit', ok: true, complete: true, expectedChunks: 169, missingBlobs: 0, disagreements: 0, totalMs: 6500 });
    // An existing report is refused before connecting.
    const again = deps(new FakeWorld());
    expect(await run(options(['audit', ...LOCAL, '--report', report]), again.deps)).toBe(EXIT.usage);
    expect(again.order).toEqual([]);
    const failing = new FakeWorld();
    failing.auditText = JSON.stringify({ ok: false, servable: { ok: false, reason: 'stale_generator' }, disagreements: { compared: false, count: 0 } });
    expect(await run(options(['audit', ...LOCAL, '--report', join(temp(), 'a.json')]), deps(failing).deps)).toBe(EXIT.failed);
    expect(auditSummary(failing.auditText).summary).toMatchObject({ ok: false, servable: { reason: 'stale_generator' } });
  });

  it('redacts the token from errors and failure reports', async () => {
    const world = new FakeWorld();
    world.audit = async () => { throw new Error(`procedure rejected for token ${TOKEN}`); };
    const d = deps(world), report = join(temp(), 'failed.json');
    expect(await run(options(['audit', ...LOCAL, '--report', report]), d.deps)).toBe(EXIT.unexpected);
    const text = readFileSync(report, 'utf8') + d.err.join('\n');
    expect(text).not.toContain(TOKEN);
    expect(text).toContain('[redacted]');
    expect(JSON.parse(readFileSync(report, 'utf8'))).toMatchObject({ ok: false, command: 'audit', error: { code: 'unexpected' } });
  });
});

describe('logs (module log files, G11)', () => {
  const line = (ts: string, message: string) => JSON.stringify({ level: 'Info', ts: Date.parse(ts) * 1000, function: 'step_world', message });
  const event = (value: Record<string, unknown>) => JSON.stringify(value);

  it('selects the daily files and the window, unescapes messages and applies the shadow rules', async () => {
    const dir = temp();
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, '2026-09-27.log'), [
      line('2026-09-27T23:00:00Z', event({ event: 'chunk_authority_shadow_compare', key: 'old', equal: false, total: 3 })),
    ].join('\n'));
    writeFileSync(join(dir, '2026-09-28.log'), [
      line('2026-09-28T00:10:00Z', 'Timing span "step_world.expiry": 33µs'),
      line('2026-09-28T00:10:01Z', event({ event: 'chunk_authority_assembled', key: 'k', complete: true })),
      line('2026-09-28T00:10:02Z', event({ event: 'chunk_authority_shadow_compare', key: 'k', equal: true, total: 0 })),
      line('2026-09-28T00:11:00Z', event({ event: 'chunk_authority_sample_window', window: '1', sampledTicks: 60, sampledPositions: 60, disagreements: 0, logged: 0, suppressed: 0 })),
      'not json',
    ].join('\n'));
    writeFileSync(join(dir, 'notes.txt'), 'ignored');
    const since = Date.parse('2026-09-28T00:00:00Z');
    expect(moduleLogFiles(['2026-09-28.log', 'notes.txt', '2026-09-27.log'], { sinceMs: since, untilMs: null })).toEqual(['2026-09-28.log']);
    expect(moduleLogFiles(['2026-09-28.log', '2026-09-27.log'], { sinceMs: null, untilMs: null })).toEqual(['2026-09-27.log', '2026-09-28.log']);
    const pass = deps(new FakeWorld()), report = join(temp(), 'logs.json');
    expect(await run(options(['logs', '--log-dir', dir, '--since', '2026-09-28T00:00:00Z', '--report', report], {}), pass.deps)).toBe(EXIT.ok);
    expect(pass.order).toEqual([]);
    const summary = JSON.parse(pass.out[0]!);
    expect(summary).toMatchObject({ files: ['2026-09-28.log'], lines: 5, compares: 1, sampledTicks: 60, sampleDisagreements: 0, failures: [] });
    expect(JSON.parse(readFileSync(report, 'utf8')).summary.events).toEqual({ chunk_authority_assembled: 1, chunk_authority_shadow_compare: 1, chunk_authority_sample_window: 1 });
    // Over both days the old disagreeing compare counts, and the run fails.
    const fail = deps(new FakeWorld());
    expect(await run(options(['logs', '--log-dir', dir], {}), fail.deps)).toBe(EXIT.failed);
    expect(JSON.parse(fail.out[0]!).failures).toEqual(['a shadow full compare disagreed']);
    // An --until before the sampler window drops it.
    const early = moduleLogMessages(readFileSync(join(dir, '2026-09-28.log'), 'utf8'), { sinceMs: since, untilMs: Date.parse('2026-09-28T00:10:30Z') });
    expect(early.messages).toHaveLength(3);
    expect(early.skipped).toBe(1);
  });

  it('fails on sampler disagreements, errors or no evidence at all', async () => {
    const dir = temp();
    writeFileSync(join(dir, '2026-09-28.log'), [
      line('2026-09-28T00:10:02Z', event({ event: 'chunk_authority_sample_disagreement', tick: '20', samples: [] })),
      line('2026-09-28T00:10:03Z', event({ event: 'chunk_authority_shadow_error', detail: 'x' })),
    ].join('\n'));
    const d = deps(new FakeWorld());
    expect(await run(options(['logs', '--log-dir', dir], {}), d.deps)).toBe(EXIT.failed);
    expect(JSON.parse(d.out[0]!).failures).toEqual([
      'no chunk_authority_shadow_compare was logged', 'the shadow sampler logged no sample window',
      'the shadow sampler logged disagreements: 0', 'logged chunk_authority_shadow_error x1',
    ]);
    const empty = temp();
    expect(await run(options(['logs', '--log-dir', empty], {}), deps(new FakeWorld()).deps)).toBe(EXIT.failed);
  });
});
