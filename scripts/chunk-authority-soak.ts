import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { tables } from '@orchard/world-bindings';
import {
  activeSurvivalLandmarks, bootstrapContentRegistry, buildContentRegistry, createLiveIslandMapDocument, serializeMapDocumentV3,
  TILE_SIZE_FIXED, TOPSIDE_SPACE_ID, type ContentDefinitionRow,
} from '../packages/sim/src/index.js';
import { WORLD_CHUNK_SIZE } from '../packages/sim/src/world-chunk.js';
import { assembleChunkLiveIslandRuntime } from '../packages/world/src/content/chunk-authority-runtime.js';
import type { ChunkAuthorityAuditReport } from '../packages/world/src/content/chunk-authority-audit.js';
import {
  assertSoakTarget, connectWorld, materializeLiveRows, readLiveRows, readTokenFile, subscribeChunkInputs, withTimeout,
  type LiveRows, type MaterializedChunks, type SoakTarget, type WorldConnection,
} from './chunk-authority-live-rows.js';

/**
 * Static-world S2c: the chunk-authority soak. LOCAL (disposable) WORLDS ONLY.
 *
 * 1. Materializes chunks from the world's own live map row and content rows
 *    (`materialize-world-chunks.ts`, which also checks oracle parity).
 * 2. Stages every blob through `stageWorldChunkBlob`, then CAS-publishes the heads
 *    through `publishWorldChunkShadow` (and checks a stale CAS is refused).
 * 3. Sets `chunkAuthority` to `shadow`, runs the owner `auditChunkAuthority`
 *    procedure and requires zero disagreements over a complete publication.
 * 4. Teleports its own character (owner `adminTeleportPlayer`) to the nearest
 *    walkable tile of every chunk centre, dwelling long enough for the shadow
 *    per-tick sampler, then reads the host log and requires that the sampler ran
 *    and logged no disagreement.
 * 5. Optionally (`--with-on`) switches `on`, re-audits and walks a few chunks.
 * 6. ALWAYS restores `off` (also on failure), and writes a JSON evidence report.
 *
 * `scripts/run-chunk-authority-soak.sh` starts the disposable host and runs this.
 */

const execFileAsync = promisify(execFile);
const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

export type ChunkAuthorityModeName = 'off' | 'shadow' | 'on';

export interface SoakOptions {
  readonly target: SoakTarget;
  readonly tokenFile: string;
  readonly evidencePath: string;
  readonly workDir: string;
  readonly allowRemoteHost: boolean;
  readonly withOn: boolean;
  /** Milliseconds at each chunk; the sampler runs every 20 ticks (1 s at 20 Hz). */
  readonly dwellMs: number;
  /** Walk only the first N chunks (quick runs). */
  readonly walkLimit: number | null;
  /** Run the disposable-host probes (reducers that exist only in the run script's patched module). */
  readonly probes: boolean;
  /** Publish this map document first when the world has no live map row (default: the bootstrap island). */
  readonly mapDocumentPath: string | null;
  /** Read the host log with `spacetime logs` (the CLI identity must own the disposable database). */
  readonly readLogs: boolean;
  /** The host process log (runtime errors are there, not in `spacetime logs`); appended to the database log. */
  readonly hostLogFile: string | null;
  /** Milliseconds to stay online after the walk: the sampler logs its summary when a 60 s window closes. */
  readonly settleMs: number;
}

export class SoakUsageError extends Error {}

function flagValue(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  if (index < 0) return undefined;
  const value = argv[index + 1];
  if (value === undefined || value.startsWith('--')) throw new SoakUsageError(`missing value for ${flag}`);
  return value;
}

const KNOWN_FLAGS = new Set(['--host', '--database', '--token-file', '--evidence', '--work-dir', '--allow-remote-host', '--with-on',
  '--dwell-ms', '--walk-limit', '--probes', '--map-document', '--no-logs', '--settle-ms', '--host-log']);
const VALUE_FLAGS = new Set(['--host', '--database', '--token-file', '--evidence', '--work-dir', '--dwell-ms', '--walk-limit', '--map-document', '--settle-ms', '--host-log']);

/** Parses and guards the command line. Refuses any unsafe target before anything connects. */
export function parseSoakArgs(argv: readonly string[], env: Readonly<Record<string, string | undefined>> = {}): SoakOptions {
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]!;
    if (!KNOWN_FLAGS.has(arg)) throw new SoakUsageError(`unknown argument ${arg}`);
    if (VALUE_FLAGS.has(arg)) index += 1;
  }
  const host = flagValue(argv, '--host') ?? env['SPACETIMEDB_HOST'];
  const database = flagValue(argv, '--database') ?? env['SPACETIMEDB_DATABASE'];
  const tokenFile = flagValue(argv, '--token-file') ?? env['CHUNK_SOAK_TOKEN_FILE'];
  if (host === undefined || database === undefined || tokenFile === undefined) {
    throw new SoakUsageError('Usage: tsx scripts/chunk-authority-soak.ts --host http://127.0.0.1:PORT --database NAME --token-file PATH [--evidence PATH] [--with-on] [--allow-remote-host]');
  }
  const allowRemoteHost = argv.includes('--allow-remote-host');
  const target = { host, database };
  assertSoakTarget(target, { allowRemoteHost });
  const number = (flag: string, fallback: number | null, minimum: number): number | null => {
    const raw = flagValue(argv, flag);
    if (raw === undefined) return fallback;
    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value < minimum) throw new SoakUsageError(`invalid ${flag}`);
    return value;
  };
  const stamp = new Date().toISOString().replace(/[:.]/gu, '-');
  const workDir = flagValue(argv, '--work-dir') ?? resolve(REPO_ROOT, 'output', `chunk-authority-soak-${stamp}`);
  return {
    target,
    tokenFile,
    evidencePath: flagValue(argv, '--evidence') ?? resolve(workDir, 'evidence.json'),
    workDir,
    allowRemoteHost,
    withOn: argv.includes('--with-on'),
    dwellMs: number('--dwell-ms', 1_300, 1_050)!,
    walkLimit: number('--walk-limit', null, 1),
    probes: argv.includes('--probes'),
    mapDocumentPath: flagValue(argv, '--map-document') ?? null,
    readLogs: !argv.includes('--no-logs'),
    settleMs: number('--settle-ms', 62_000, 0)!,
    hostLogFile: flagValue(argv, '--host-log') ?? null,
  };
}

// --- Walk targets --------------------------------------------------------------------------------

export interface WalkTarget {
  readonly cx: number;
  readonly cy: number;
  /** Walkable ground tiles of the chunk, nearest the chunk centre first (at most 8). */
  readonly candidates: readonly { readonly tileX: number; readonly tileY: number }[];
}

/** For every chunk, the walkable (chunk-channel) ground tiles nearest its centre. */
export function chunkWalkTargets(width: number, height: number, blocked: ArrayLike<boolean | number>, perChunk = 8): WalkTarget[] {
  const targets: WalkTarget[] = [];
  for (let cy = 0; cy * WORLD_CHUNK_SIZE < height; cy++) for (let cx = 0; cx * WORLD_CHUNK_SIZE < width; cx++) {
    const left = cx * WORLD_CHUNK_SIZE, top = cy * WORLD_CHUNK_SIZE;
    const right = Math.min(width, left + WORLD_CHUNK_SIZE), bottom = Math.min(height, top + WORLD_CHUNK_SIZE);
    const centreX = (left + right - 1) / 2, centreY = (top + bottom - 1) / 2;
    const open: { tileX: number; tileY: number; distance: number }[] = [];
    // Leave a one-tile margin so a teleport never straddles a chunk edge.
    for (let tileY = top + 1; tileY < bottom - 1; tileY++) for (let tileX = left + 1; tileX < right - 1; tileX++) {
      if (!blocked[tileY * width + tileX]) open.push({ tileX, tileY, distance: (tileX - centreX) ** 2 + (tileY - centreY) ** 2 });
    }
    open.sort((a, b) => a.distance - b.distance || a.tileY - b.tileY || a.tileX - b.tileX);
    targets.push({ cx, cy, candidates: open.slice(0, perChunk).map(({ tileX, tileY }) => ({ tileX, tileY })) });
  }
  return targets;
}

// --- Host log analysis ---------------------------------------------------------------------------

export interface HostLogSummary {
  readonly lines: number;
  readonly events: Readonly<Record<string, number>>;
  readonly sampleWindows: readonly Record<string, unknown>[];
  readonly sampledTicks: number;
  readonly sampledPositions: number;
  readonly sampleDisagreements: number;
  readonly compares: readonly { readonly key: unknown; readonly equal: unknown; readonly total: unknown }[];
  readonly fallbacks: readonly Record<string, unknown>[];
  readonly errors: readonly Record<string, unknown>[];
  readonly timings: { readonly assembleMs: readonly number[]; readonly compareMs: readonly number[] };
  readonly probes: readonly Record<string, unknown>[];
  /** Host lines mentioning a time or energy budget, a heap limit or a cancelled call. */
  readonly limitLines: readonly string[];
  /** `reducer "name" runtime error: Uncaught Error: code` lines (the code a client only sees as a fatal error). */
  readonly reducerErrors: readonly { readonly reducer: string; readonly error: string }[];
}

const LIMIT_PATTERN = /energy|budget|heap limit|timed out|timeout|exceeded|too long|cancel/iu;

/** Parses the host log text: JSON events the module logs plus console.time lines. */
export function summarizeHostLog(text: string): HostLogSummary {
  const events: Record<string, number> = {};
  const sampleWindows: Record<string, unknown>[] = [], fallbacks: Record<string, unknown>[] = [], errors: Record<string, unknown>[] = [];
  const probes: Record<string, unknown>[] = [], limitLines: string[] = [];
  const reducerErrors: { reducer: string; error: string }[] = [];
  const compares: { key: unknown; equal: unknown; total: unknown }[] = [];
  const assembleMs: number[] = [], compareMs: number[] = [];
  const lines = text.split('\n').filter(line => line.trim().length > 0);
  for (const line of lines) {
    const start = line.indexOf('{"event":');
    if (start >= 0) {
      let event: Record<string, unknown> | null;
      try {
        event = JSON.parse(line.slice(start)) as Record<string, unknown>;
      } catch {
        event = null;
      }
      const name = typeof event?.['event'] === 'string' ? event['event'] : null;
      if (event !== null && name !== null) {
        events[name] = (events[name] ?? 0) + 1;
        if (name === 'chunk_authority_sample_window') sampleWindows.push(event);
        if (name === 'chunk_authority_shadow_compare') compares.push({ key: event['key'], equal: event['equal'], total: event['total'] });
        if (name === 'chunk_authority_fallback') fallbacks.push(event);
        if (/_(error|unavailable)$/u.test(name) || name === 'chunk_authority_sample_disagreement') errors.push(event);
        if (name.startsWith('soak_probe_')) probes.push(event);
        continue;
      }
    }
    const runtimeError = /(?:reducer|procedure) "([^"]+)" runtime error: (.*)$/u.exec(line);
    if (runtimeError !== null) {
      if (reducerErrors.length < 64) reducerErrors.push({ reducer: runtimeError[1]!, error: runtimeError[2]!.slice(0, 200) });
      continue;
    }
    const timer = /chunk_authority\.(assemble|compare)\D*?(\d+(?:\.\d+)?)\s*(ms|s|µs|us)\b/u.exec(line);
    if (timer !== null) {
      const value = Number(timer[2]) * (timer[3] === 's' ? 1000 : timer[3] === 'ms' ? 1 : 0.001);
      (timer[1] === 'assemble' ? assembleMs : compareMs).push(Math.round(value * 100) / 100);
      continue;
    }
    if (LIMIT_PATTERN.test(line) && limitLines.length < 32) limitLines.push(line.slice(0, 400));
  }
  const sum = (field: string) => sampleWindows.reduce((total, window) => total + (typeof window[field] === 'number' ? window[field] as number : 0), 0);
  return {
    lines: lines.length, events, sampleWindows,
    sampledTicks: sum('sampledTicks'), sampledPositions: sum('sampledPositions'),
    sampleDisagreements: sum('disagreements'),
    compares, fallbacks, errors, timings: { assembleMs, compareMs }, probes, limitLines, reducerErrors,
  };
}

// --- The orchestration (injectable for tests) ----------------------------------------------------

export interface SoakApi {
  readonly identityHex: string;
  liveRows(): LiveRows;
  chunkAuthorityMode(): string;
  waitFor(label: string, condition: () => boolean, timeoutMs?: number): Promise<void>;
  publishLiveMap(documentJson: string, expectedRevision: number): Promise<void>;
  stageBlob(bytes: Uint8Array): Promise<void>;
  publishShadow(input: { manifestJson: string; mapId: string; contentHash: string; expectedRevision: number }): Promise<void>;
  setChunkAuthority(mode: ChunkAuthorityModeName): Promise<void>;
  audit(): Promise<string>;
  /** Owner teleport of the soak's own character; resolves to null on success or the refusal code. */
  teleport(tileX: number, tileY: number): Promise<string | null>;
  heartbeat(): Promise<void>;
  sleep(ms: number): Promise<void>;
  now(): number;
  hostLog(): Promise<string | null>;
  probe(name: string, args: readonly string[]): Promise<{ ok: boolean; ms: number; error?: string }>;
}

export interface SoakDeps {
  readonly materialize: (rows: LiveRows) => Promise<MaterializedChunks>;
  readonly bootstrapDocument: (rows: LiveRows) => Promise<string>;
  readonly log: (line: string) => void;
  /** Defaults to the walkable ground of the assembled chunk runtime. */
  readonly walkTargets?: (materialized: MaterializedChunks) => WalkTarget[];
}

/** Walk targets from the published chunks themselves (the chunk ground channel). */
export function materializedWalkTargets(materialized: Pick<MaterializedChunks, 'manifest' | 'blobs' | 'summary'>): WalkTarget[] {
  const store = new Map(materialized.blobs.map(blob => [blob.contentHash, blob.bytes]));
  const runtime = assembleChunkLiveIslandRuntime(materialized.manifest, hash => store.get(hash), { contentHash: materialized.summary.contentHash });
  return chunkWalkTargets(materialized.manifest.width, materialized.manifest.height, runtime.ground.blocked);
}

export interface SoakEvidence {
  readonly schema: 1;
  result: 'passed' | 'failed';
  readonly failures: string[];
  readonly target: SoakTarget;
  readonly soakIdentity: string;
  readonly startedAt: string;
  finishedAt?: string;
  liveMap?: Record<string, unknown>;
  materialize?: Record<string, unknown>;
  stage?: Record<string, unknown>;
  publish?: Record<string, unknown>;
  audits: Record<string, unknown>;
  walk?: Record<string, unknown>;
  onMode?: Record<string, unknown>;
  hostLog?: HostLogSummary | { readonly unavailable: true };
  probes?: Record<string, unknown>;
  restore: { restoredOff: boolean; attempts: number; finalMode: string | null; error?: string };
}

function errorCode(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function stats(values: readonly number[]): { count: number; totalMs: number; p50Ms: number | null; p95Ms: number | null; maxMs: number | null } {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (q: number) => (sorted.length === 0 ? null : sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!);
  return { count: values.length, totalMs: Math.round(values.reduce((a, b) => a + b, 0)), p50Ms: at(0.5), p95Ms: at(0.95), maxMs: sorted.at(-1) ?? null };
}

/**
 * Runs `body` with the switch possibly flipped and ALWAYS sets it back to `off`
 * afterwards (up to three attempts), recording the outcome in `restore`.
 */
export async function withChunkAuthorityRestoredOff<T>(api: Pick<SoakApi, 'setChunkAuthority' | 'chunkAuthorityMode' | 'waitFor'>,
  restore: SoakEvidence['restore'], body: () => Promise<T>): Promise<T> {
  try {
    return await body();
  } finally {
    let lastError: string | undefined;
    for (let attempt = 1; attempt <= 3 && !restore.restoredOff; attempt++) {
      restore.attempts = attempt;
      try {
        await api.setChunkAuthority('off');
        await api.waitFor('chunk_authority_off', () => api.chunkAuthorityMode() === 'off', 10_000);
        restore.restoredOff = true;
      } catch (error) {
        lastError = errorCode(error);
      }
    }
    restore.finalMode = (() => { try { return api.chunkAuthorityMode(); } catch { return null; } })();
    if (!restore.restoredOff) restore.error = lastError ?? 'soak_restore_off_failed';
  }
}

export async function runSoak(api: SoakApi, options: Pick<SoakOptions, 'withOn' | 'dwellMs' | 'walkLimit' | 'probes' | 'readLogs' | 'settleMs'> & { target: SoakTarget },
  deps: SoakDeps): Promise<SoakEvidence> {
  const evidence: SoakEvidence = {
    schema: 1, result: 'failed', failures: [], target: options.target, soakIdentity: api.identityHex,
    startedAt: new Date(api.now()).toISOString(), audits: {}, restore: { restoredOff: false, attempts: 0, finalMode: null },
  };
  const fail = (message: string): void => { evidence.failures.push(message); deps.log(`FAIL ${message}`); };
  try {
    await withChunkAuthorityRestoredOff(api, evidence.restore, async () => {
      // Owner check first: the idempotent `off` fails with owner_required for anyone else.
      await api.setChunkAuthority('off');
      await soakBody(api, options, deps, evidence, fail);
    });
  } catch (error) {
    fail(`aborted: ${errorCode(error)}`);
  }
  if (!evidence.restore.restoredOff) fail(`chunkAuthority not restored to off: ${evidence.restore.error ?? 'not attempted'}`);
  evidence.finishedAt = new Date(api.now()).toISOString();
  evidence.result = evidence.failures.length === 0 ? 'passed' : 'failed';
  return evidence;
}

async function soakBody(api: SoakApi, options: Parameters<typeof runSoak>[1], deps: SoakDeps, evidence: SoakEvidence,
  fail: (message: string) => void): Promise<void> {
  // 1. A live map row (a fresh world has none; the chunk publication pins one).
  let rows = api.liveRows();
  if (rows.mapRow === null) {
    deps.log('no live map row: publishing the bootstrap island document');
    await api.publishLiveMap(await deps.bootstrapDocument(rows), 0);
    await api.waitFor('live_map_row', () => api.liveRows().mapRow !== null, 30_000);
    rows = api.liveRows();
  }
  evidence.liveMap = { revision: rows.mapRow!.revision, contentHash: rows.mapRow!.contentHash, documentChars: rows.mapRow!.documentJson.length,
    contentHead: rows.contentHead, contentRows: rows.contentRows?.length ?? 'bootstrap' };

  // 2. Materialize from the world's own rows.
  deps.log('materializing chunks from the live rows');
  const materialized = await deps.materialize(rows);
  const sizes = materialized.blobs.map(blob => blob.bytes.byteLength);
  evidence.materialize = { ...materialized.summary, materializeMs: materialized.materializeMs, blobs: sizes.length,
    maxBlobBytes: Math.max(...sizes), totalBlobBytes: sizes.reduce((a, b) => a + b, 0), manifestBytes: materialized.manifestJson.length };

  // 3. Stage every blob (the real client path: BSATN over the SDK websocket).
  const stageMs: number[] = [], stageErrors: string[] = [];
  for (const blob of materialized.blobs) {
    const started = api.now();
    try {
      await api.stageBlob(blob.bytes);
      stageMs.push(api.now() - started);
    } catch (error) {
      stageErrors.push(`${blob.cx},${blob.cy} (${blob.bytes.byteLength} B): ${errorCode(error)}`);
    }
  }
  evidence.stage = { ...stats(stageMs), maxBytes: Math.max(...sizes), errors: stageErrors.slice(0, 8), failed: stageErrors.length };
  if (stageErrors.length > 0) throw new Error(`stage failed for ${stageErrors.length} blob(s)`);

  // 4. CAS-publish the heads; then prove a stale CAS is refused.
  const before = api.liveRows().published.shadow;
  const expectedRevision = before?.revision ?? 0;
  const publishStarted = api.now();
  await api.publishShadow({ manifestJson: materialized.manifestJson, mapId: 'live-island', contentHash: materialized.summary.contentHash, expectedRevision });
  const publishMs = api.now() - publishStarted;
  await api.waitFor('shadow_published', () => api.liveRows().published.shadow?.revision === expectedRevision + 1, 30_000);
  const published = api.liveRows().published;
  let staleCas: string | null = null;
  try {
    await api.publishShadow({ manifestJson: materialized.manifestJson, mapId: 'live-island', contentHash: materialized.summary.contentHash, expectedRevision });
  } catch (error) {
    staleCas = errorCode(error);
  }
  evidence.publish = { expectedRevision, revision: published.shadow?.revision, publishMs, heads: published.heads.length,
    headsAtRevision: published.heads.filter(head => head.revision === expectedRevision + 1).length, staleCasRefusal: staleCas };
  // The reducer throws a plain Error, which a 2.8.2 client only sees as a generic fatal error; the
  // host log carries the code (checked with the log below).
  if (staleCas === null) fail('a stale CAS publish was accepted');

  // 5. Shadow, then the audit must be clean and complete.
  await api.setChunkAuthority('shadow');
  await api.waitFor('chunk_authority_shadow', () => api.chunkAuthorityMode() === 'shadow', 10_000);
  const audit = async (label: string): Promise<ChunkAuthorityAuditReport> => {
    const started = api.now();
    const report = JSON.parse(await api.audit()) as ChunkAuthorityAuditReport;
    evidence.audits[label] = { wallMs: api.now() - started, report };
    return report;
  };
  const shadowAudit = await audit('shadow');
  if (!shadowAudit.ok) fail(`shadow audit not ok: servable=${JSON.stringify(shadowAudit.servable)} complete=${shadowAudit.completeness.complete} disagreements=${shadowAudit.disagreements.count}`);
  if (shadowAudit.disagreements.count !== 0) fail(`shadow audit disagreements: ${shadowAudit.disagreements.count}`);
  if (!shadowAudit.completeness.complete) fail('shadow audit: publication incomplete');
  // A second call: do procedure-instance globals persist (auditCalls increments)?
  const repeat = await audit('shadowRepeat');
  evidence.audits['procedureGlobalsPersist'] = (repeat.instance?.['auditCalls'] as number) > (shadowAudit.instance?.['auditCalls'] as number);

  // 6. Walk every chunk centre while the shadow sampler compares final collision at the bot.
  const targets = (deps.walkTargets ?? materializedWalkTargets)(materialized);
  const walk = options.walkLimit === null ? targets : targets.slice(0, options.walkLimit);
  const visited: string[] = [], unreachable: { chunk: string; refusals: string[] }[] = [], noGround: string[] = [];
  const walkStarted = api.now();
  let lastHeartbeat = 0;
  for (const target of walk) {
    const chunk = `${target.cx},${target.cy}`;
    if (target.candidates.length === 0) { noGround.push(chunk); continue; }
    const refusals: string[] = [];
    let arrived = false;
    for (const candidate of target.candidates) {
      const refusal = await api.teleport(candidate.tileX, candidate.tileY);
      if (refusal === null) { arrived = true; break; }
      refusals.push(`${candidate.tileX},${candidate.tileY}:${refusal}`);
    }
    if (!arrived) { unreachable.push({ chunk, refusals: refusals.slice(0, 3) }); continue; }
    visited.push(chunk);
    if (api.now() - lastHeartbeat > 4_000) { await api.heartbeat(); lastHeartbeat = api.now(); }
    await api.sleep(options.dwellMs);
  }
  evidence.walk = { chunks: walk.length, visited: visited.length, noWalkableGround: noGround, unreachable, walkMs: api.now() - walkStarted, dwellMs: options.dwellMs };
  if (visited.length === 0) fail('walk visited no chunk');
  // Stay online until the sampler window that covers the walk closes, so its summary is logged.
  const settleUntil = api.now() + options.settleMs;
  while (api.now() < settleUntil) {
    await api.heartbeat();
    await api.sleep(Math.min(4_000, Math.max(0, settleUntil - api.now())));
  }
  evidence.audits['afterWalk'] = { report: JSON.parse(await api.audit()) as ChunkAuthorityAuditReport };

  // 7. Optionally serve chunks briefly.
  if (options.withOn) {
    await api.setChunkAuthority('on');
    await api.waitFor('chunk_authority_on', () => api.chunkAuthorityMode() === 'on', 10_000);
    const onAudit = await audit('on');
    if (!onAudit.ok) fail(`on audit not ok: ${JSON.stringify(onAudit.servable)}`);
    const onVisited: string[] = [];
    for (const target of walk.filter(entry => entry.candidates.length > 0).slice(0, 8)) {
      for (const candidate of target.candidates) {
        if (await api.teleport(candidate.tileX, candidate.tileY) === null) { onVisited.push(`${target.cx},${target.cy}`); break; }
      }
      await api.sleep(500);
    }
    evidence.onMode = { visited: onVisited };
  }

  // 8. Disposable-host probes (reducers only the run script's patched module has).
  if (options.probes) evidence.probes = await runProbes(api);

  // 9. The host log: the sampler must have run and logged no disagreement.
  if (options.readLogs) {
    const text = await api.hostLog();
    if (text === null) {
      evidence.hostLog = { unavailable: true };
      fail('host log unavailable: the sampler cannot be verified');
    } else {
      const log = summarizeHostLog(text);
      evidence.hostLog = log;
      if (evidence.probes !== undefined) {
        // The probe reducers report through the log: the module-global counter sequence and busy-loop times.
        evidence.probes['globalsCounters'] = log.probes.filter(event => event['event'] === 'soak_probe_globals').map(event => event['counter']);
        evidence.probes['busyLogged'] = log.probes.filter(event => event['event'] === 'soak_probe_busy');
      }
      if (log.sampledTicks === 0) fail('the shadow per-tick sampler logged no sample window');
      if (log.sampleDisagreements !== 0 || (log.events['chunk_authority_sample_disagreement'] ?? 0) !== 0) fail(`the shadow sampler logged disagreements: ${log.sampleDisagreements}`);
      if (log.compares.some(compare => compare.equal !== true)) fail('a shadow full compare disagreed');
      if (log.compares.length === 0) fail('no shadow full compare was logged');
      if (!log.reducerErrors.some(entry => entry.reducer === 'publish_world_chunk_shadow' && entry.error.includes('chunk_shadow_revision_conflict'))) {
        fail('the stale CAS refusal was not logged as chunk_shadow_revision_conflict');
      }
      for (const event of ['chunk_authority_shadow_error', 'chunk_authority_sample_error', 'chunk_authority_shadow_unavailable'] as const) {
        if ((log.events[event] ?? 0) > 0) fail(`host logged ${event}`);
      }
      if (options.withOn) {
        if ((log.events['chunk_authority_serving'] ?? 0) === 0) fail('on: the dispatcher never logged chunk_authority_serving');
        if (log.fallbacks.length > 0) fail(`on: fallbacks logged: ${JSON.stringify(log.fallbacks.slice(0, 3))}`);
      }
    }
  }
}

async function runProbes(api: SoakApi): Promise<Record<string, unknown>> {
  const probes: Record<string, unknown> = {};
  // Module globals across reducer calls: the counter the module logs should climb 1, 2, 3.
  // Then a reducer that throws a plain Error (clients see "fatal error"): does the instance survive it?
  const globals = [];
  for (let index = 0; index < 2; index++) globals.push(await api.probe('soak_probe_globals', []));
  globals.push(await api.probe('soak_probe_throw', []));
  globals.push(await api.probe('soak_probe_globals', []));
  probes['globalsCalls'] = globals;
  // Per-reducer time limit: busy-loop for increasing times and see what the host allows.
  const busy: Record<string, unknown>[] = [];
  for (const millis of [1_000, 5_000, 15_000, 30_000]) {
    const result = await api.probe('soak_probe_busy', [String(millis)]);
    busy.push({ millis, ...result });
    if (!result.ok) break;
  }
  probes['busy'] = busy;
  // Argument size headroom for stageWorldChunkBlob: an oversized, invalid blob must reach
  // the reducer (which refuses it by size) rather than fail in transport.
  const oversize: Record<string, unknown>[] = [];
  for (const bytes of [1_100_000, 4 * 1024 * 1024, 16 * 1024 * 1024]) {
    const started = api.now();
    try {
      await api.stageBlob(new Uint8Array(bytes));
      oversize.push({ bytes, accepted: true, ms: api.now() - started });
    } catch (error) {
      oversize.push({ bytes, refusal: errorCode(error), ms: api.now() - started });
    }
  }
  probes['oversizeStage'] = oversize;
  return probes;
}

// --- The real SDK-backed API ---------------------------------------------------------------------

async function sdkApi(world: WorldConnection, options: SoakOptions): Promise<SoakApi & { close(): void }> {
  const { connection, identity } = world;
  await subscribeChunkInputs(world);
  await withTimeout('self_subscription', new Promise<void>((resolvePromise, reject) => {
    connection.subscriptionBuilder()
      .onApplied(() => resolvePromise())
      .onError(context => reject(new Error(String(context.event))))
      .subscribe([tables.playerPosition.where(row => row.identity.eq(identity)), tables.ownAdminMutationPreviews]);
  }), 60_000);
  const sleep = (ms: number) => new Promise<void>(resolvePromise => setTimeout(resolvePromise, ms));
  const waitFor = async (label: string, condition: () => boolean, timeoutMs = 30_000): Promise<void> => {
    const started = performance.now();
    while (!condition()) {
      if (performance.now() - started > timeoutMs) throw new Error(`${label}_timeout`);
      await sleep(25);
    }
  };
  let sequence = 0;
  const mode = (): string => {
    const row = connection.db.spaceAdminFlag.spaceId.find(0);
    if (row === null) return 'off';
    try {
      const value = (JSON.parse(row.flagsJson) as Record<string, unknown>)['chunkAuthority'];
      return typeof value === 'string' ? value : 'off';
    } catch {
      return 'off';
    }
  };
  const cli = async (args: readonly string[], timeoutMs: number): Promise<string> => {
    // --no-config and a neutral cwd: never pick up the repository's spacetime.json database.
    const { stdout } = await execFileAsync('spacetime', [...args], { cwd: tmpdir(), timeout: timeoutMs, maxBuffer: 256 * 1024 * 1024 });
    return stdout;
  };
  return {
    identityHex: world.identityHex,
    liveRows: () => readLiveRows(world),
    chunkAuthorityMode: mode,
    waitFor,
    publishLiveMap: async (documentJson, expectedRevision) => {
      await connection.reducers.publishLiveMapDocument({ mapId: 'live-island', expectedRevision, documentJson, clientMutationId: `soak-map-${Date.now()}` });
    },
    stageBlob: async bytes => { await connection.reducers.stageWorldChunkBlob({ bytes }); },
    publishShadow: async input => { await connection.reducers.publishWorldChunkShadow(input); },
    setChunkAuthority: async value => { await connection.reducers.setChunkAuthority({ mode: value }); },
    audit: () => connection.procedures.auditChunkAuthority({}),
    teleport: async (tileX, tileY) => {
      sequence += 1;
      const clientMutationId = `soak-walk-${Date.now()}-${sequence}`;
      const common = { identity, reason: 'chunk authority soak walk', clientMutationId, spaceId: TOPSIDE_SPACE_ID, tileX, tileY };
      try {
        await connection.reducers.adminTeleportPlayer({ ...common, dryRun: true, expectedBaseVersion: '', previewFingerprint: undefined });
        let preview: { baseVersion: string; fingerprint: string } | undefined;
        await waitFor('teleport_preview', () => {
          preview = [...connection.db.ownAdminMutationPreviews.iter()].find(row => row.clientMutationId === clientMutationId);
          return preview !== undefined;
        }, 10_000);
        await connection.reducers.adminTeleportPlayer({ ...common, dryRun: false, expectedBaseVersion: preview!.baseVersion, previewFingerprint: preview!.fingerprint });
        await waitFor('teleport_arrival', () => {
          const row = connection.db.playerPosition.identity.find(identity);
          return row !== null && row.spaceId === TOPSIDE_SPACE_ID && Math.floor(row.x / TILE_SIZE_FIXED) === tileX && Math.floor(row.y / TILE_SIZE_FIXED) === tileY;
        }, 10_000);
        return null;
      } catch (error) {
        return errorCode(error);
      }
    },
    heartbeat: async () => { await connection.reducers.heartbeat({ active: true }); },
    sleep,
    now: () => Date.now(),
    hostLog: async () => {
      let text: string;
      try {
        text = await cli(['logs', '--no-config', '--server', options.target.host, options.target.database], 120_000);
      } catch {
        return null;
      }
      if (options.hostLogFile !== null) {
        try {
          text += `\n${await readFile(options.hostLogFile, 'utf8')}`;
        } catch {
          // The database log alone still carries the module events.
        }
      }
      return text;
    },
    probe: async (name, args) => {
      const started = Date.now();
      try {
        await cli(['call', '--no-config', '--yes', '--server', options.target.host, options.target.database, name, ...args], 120_000);
        return { ok: true, ms: Date.now() - started };
      } catch (error) {
        const detail = error instanceof Error && 'stderr' in error ? String((error as { stderr: unknown }).stderr).trim().slice(-400) : errorCode(error);
        return { ok: false, ms: Date.now() - started, error: detail };
      }
    },
    close: () => connection.disconnect(),
  };
}

async function bootstrapDocument(rows: LiveRows, mapDocumentPath: string | null): Promise<string> {
  if (mapDocumentPath !== null) return (await readFile(mapDocumentPath, 'utf8')).trim();
  const registry = rows.contentRows === null ? bootstrapContentRegistry()
    : buildContentRegistry(rows.contentRows as unknown as ContentDefinitionRow[]).registry;
  return serializeMapDocumentV3(createLiveIslandMapDocument({ landmarks: activeSurvivalLandmarks(registry, TOPSIDE_SPACE_ID) }));
}

export async function main(argv: readonly string[] = process.argv.slice(2), env: NodeJS.ProcessEnv = process.env): Promise<number> {
  const options = parseSoakArgs(argv, env);
  const token = await readTokenFile(options.tokenFile);
  await mkdir(options.workDir, { recursive: true, mode: 0o700 });
  const world = await connectWorld(options.target, token);
  const api = await sdkApi(world, options);
  const log = (line: string) => console.log(`[chunk-soak] ${line}`);
  let evidence: SoakEvidence;
  try {
    evidence = await runSoak(api, options, {
      materialize: rows => materializeLiveRows(rows, resolve(options.workDir, 'materialized')),
      bootstrapDocument: rows => bootstrapDocument(rows, options.mapDocumentPath),
      log,
    });
  } finally {
    api.close();
  }
  await mkdir(dirname(options.evidencePath), { recursive: true });
  await writeFile(options.evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
  log(`${evidence.result}: evidence ${options.evidencePath}`);
  for (const failure of evidence.failures) log(`failure: ${failure}`);
  return evidence.result === 'passed' ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(code => process.exit(code), (error: unknown) => {
    console.error(`[chunk-soak] ${errorCode(error)}`);
    process.exit(2);
  });
}
