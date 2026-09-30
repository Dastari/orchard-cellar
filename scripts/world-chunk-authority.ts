import { spawn } from 'node:child_process';
import { lstat, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chunkAuthorityModeFromFlagsJson, type ChunkAuthorityMode } from '../packages/world/src/chunk-authority-setting.js';
import { CHUNK_RESOURCE_GENERATOR } from '../packages/world/src/content/chunk-authority-runtime.js';
import { summarizeHostLog, type HostLogSummary } from './chunk-authority-soak.js';
import { EXIT, PipelineError, PRODUCTION_DATABASE, PRODUCTION_HOST, readTokenFile, redact, sha256Hex } from './world-chunks-publish.js';

/**
 * Static-world S5c operator tool (runbook gaps G1 and G11): read and switch the server's
 * `chunkAuthority`, run the `auditChunkAuthority` procedure, dump the published manifest and
 * heads, and summarise the shadow events in the module log, as the release credential.
 *
 *   WORLD_CHUNKS_TOKEN_FILE=/private/rejoin.json WORLD_CHUNKS_TOKEN_LABEL=orchard-agent-dev \
 *   npm run world:chunks:authority -- <command> --host URL --database NAME [--refresh] [--report FILE]
 *
 * - `status`: mode, publication (revision, manifest hash, heads), resource-generator stamp
 *   against this checkout's, and the live map revision. Read only.
 * - `audit --report FILE`: runs the owner/admin procedure (6-8 s on the island), writes its
 *   full JSON to FILE and prints a summary. Exit 1 unless the audit says `ok`.
 * - `set <off|shadow|on>`: needs WORLD_CHUNK_AUTHORITY_CONFIRM=set:<mode>:<database>, calls
 *   `setChunkAuthority` and waits until the public row says the new mode (exit 1 if not).
 * - `dump <dir>`: creates <dir> (0700, must not exist) with the exact published
 *   `manifest.json` and `heads.txt` (`<space> <hash> <bytes>` per head at the published
 *   revision, the format `CLIENT_VALIDATE_WORLD_CHUNK_HEADS` reads).
 * - `logs --log-dir DIR [--since ISO] [--until ISO]`: no credential or connection. Reads the
 *   module's daily `module_logs/YYYY-MM-DD.log` files (JSON lines whose `message` is the
 *   module's `console.*` text), keeps lines in the window and runs the soak's
 *   `summarizeHostLog` on the messages, with the S5c shadow pass rules. Exit 1 on a failed rule.
 *
 * The token comes only from the private WORLD_CHUNKS_TOKEN_FILE (readTokenFile: bare token or
 * rejoin file, label WORLD_CHUNKS_TOKEN_LABEL); it is never printed. `--refresh` first runs
 * the rejoin refresh (`npm run world:rejoin-smoke -- refresh`) on that file, as the release
 * lane's chunk hook does. The production database is only accepted on its canonical host.
 * Reports are written 0600 with `wx` (never overwritten), with tokens redacted.
 * Every connection is a full sign-in of the credential's account (client_connected runs).
 */

export const USAGE = [
  'usage: WORLD_CHUNKS_TOKEN_FILE=PATH [WORLD_CHUNKS_TOKEN_LABEL=LABEL] world-chunk-authority',
  '  status | audit | set <off|shadow|on> | dump <dir>   --host URL --database NAME [--refresh] [--report FILE]',
  '  logs --log-dir DIR [--since ISO] [--until ISO] [--report FILE]',
].join('\n');

export type Command =
  | { readonly kind: 'status' }
  | { readonly kind: 'audit' }
  | { readonly kind: 'set'; readonly mode: ChunkAuthorityMode }
  | { readonly kind: 'dump'; readonly dir: string }
  | { readonly kind: 'logs' };

export interface CliOptions {
  readonly command: Command;
  readonly host: string | null;
  readonly database: string | null;
  readonly report: string | null;
  readonly refresh: boolean;
  readonly logDir: string | null;
  readonly sinceMs: number | null;
  readonly untilMs: number | null;
  readonly tokenFile: string | null;
  readonly tokenLabel: string | undefined;
  readonly confirm: string | undefined;
}

const MODES: readonly ChunkAuthorityMode[] = ['off', 'shadow', 'on'];
const DATABASE = /^[a-z0-9][a-z0-9-]{2,62}$/u;

function absolute(path: string, code: string): string {
  if (!isAbsolute(path)) throw new PipelineError(code, EXIT.usage);
  return path;
}
function time(value: string, flag: string): number {
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) throw new PipelineError('invalid_time', EXIT.usage, flag);
  return ms;
}

export function parseCli(argv: readonly string[], env: Readonly<Record<string, string | undefined>>): CliOptions {
  const args = [...argv];
  const name = args.shift();
  let command: Command;
  if (name === 'status' || name === 'audit' || name === 'logs') command = { kind: name };
  else if (name === 'set') {
    const mode = args.shift();
    if (!MODES.includes(mode as ChunkAuthorityMode)) throw new PipelineError('usage', EXIT.usage, USAGE);
    command = { kind: 'set', mode: mode as ChunkAuthorityMode };
  } else if (name === 'dump') {
    const dir = args.shift();
    if (dir === undefined || dir.startsWith('--')) throw new PipelineError('usage', EXIT.usage, USAGE);
    command = { kind: 'dump', dir: absolute(dir, 'dump_dir_must_be_absolute') };
  } else throw new PipelineError('usage', EXIT.usage, USAGE);
  const values = new Map<string, string>();
  let refresh = false;
  while (args.length > 0) {
    const flag = args.shift()!;
    if (/token|confirm/iu.test(flag)) throw new PipelineError('secrets_and_confirmations_come_from_the_environment', EXIT.usage);
    if (flag === '--refresh') { refresh = true; continue; }
    const value = args.shift();
    if (!['--host', '--database', '--report', '--log-dir', '--since', '--until'].includes(flag) || value === undefined || value.startsWith('--') || values.has(flag)) {
      throw new PipelineError('usage', EXIT.usage, USAGE);
    }
    values.set(flag, value);
  }
  const report = values.has('--report') ? absolute(values.get('--report')!, 'report_path_must_be_absolute') : null;
  if (command.kind === 'logs') {
    if (values.has('--host') || values.has('--database') || refresh) throw new PipelineError('logs_reads_files_only', EXIT.usage, USAGE);
    const logDir = values.get('--log-dir');
    if (logDir === undefined) throw new PipelineError('usage', EXIT.usage, USAGE);
    const sinceMs = values.has('--since') ? time(values.get('--since')!, '--since') : null;
    const untilMs = values.has('--until') ? time(values.get('--until')!, '--until') : null;
    if (sinceMs !== null && untilMs !== null && untilMs < sinceMs) throw new PipelineError('invalid_time', EXIT.usage, '--until before --since');
    return { command, host: null, database: null, report, refresh, logDir: absolute(logDir, 'log_dir_must_be_absolute'), sinceMs, untilMs,
      tokenFile: null, tokenLabel: undefined, confirm: undefined };
  }
  if (values.has('--log-dir') || values.has('--since') || values.has('--until')) throw new PipelineError('usage', EXIT.usage, USAGE);
  const host = values.get('--host'), database = values.get('--database'), tokenFile = env['WORLD_CHUNKS_TOKEN_FILE'];
  if (host === undefined || database === undefined || tokenFile === undefined || tokenFile === '') throw new PipelineError('usage', EXIT.usage, USAGE);
  let url: URL;
  try { url = new URL(host); } catch { throw new PipelineError('invalid_url', EXIT.usage, host); }
  if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.pathname !== '/' || url.search !== '' || url.username !== '' || url.password !== '') {
    throw new PipelineError('invalid_url', EXIT.usage, host);
  }
  if (!DATABASE.test(database)) throw new PipelineError('invalid_database', EXIT.usage);
  // The production database is only ever reached on its canonical host (as world-chunks-publish).
  if (database === PRODUCTION_DATABASE && url.origin !== PRODUCTION_HOST) {
    throw new PipelineError('production_target_must_be_canonical', EXIT.usage, PRODUCTION_HOST);
  }
  if (command.kind === 'audit' && report === null) throw new PipelineError('audit_needs_report', EXIT.usage, 'pass --report FILE');
  return { command, host: url.origin, database, report, refresh, logDir: null, sinceMs: null, untilMs: null,
    tokenFile: absolute(tokenFile, 'token_file_path_must_be_absolute'), tokenLabel: env['WORLD_CHUNKS_TOKEN_LABEL'] || undefined,
    confirm: env['WORLD_CHUNK_AUTHORITY_CONFIRM'] || undefined };
}

/** The confirmation `set` requires: the mode and the database, so a paste into the wrong shell fails. */
export function setConfirmation(mode: ChunkAuthorityMode, database: string): string {
  return `set:${mode}:${database}`;
}

// ---------------------------------------------------------------------------
// The world, as the tool sees it (the real one is the SDK; tests pass a fake).

export interface AuthorityShadow { readonly revision: number; readonly contentHash: string; readonly manifestJson: string }
export interface AuthorityHead { readonly cx: number; readonly cy: number; readonly revision: number; readonly contentHash: string; readonly byteLength: number }
export interface AuthorityWorld {
  readonly identityHex: string;
  /** The space-0 `space_admin_flag.flagsJson`, or undefined without a row. */
  flagsJson(): string | undefined;
  shadow(): AuthorityShadow | null;
  heads(): readonly AuthorityHead[];
  liveMap(): { readonly revision: number; readonly contentHash: string } | null;
  setChunkAuthority(mode: ChunkAuthorityMode): Promise<void>;
  /** The `auditChunkAuthority` procedure's JSON text. */
  audit(): Promise<string>;
  /** Waits until `predicate` holds or `timeoutMs` passes; returns whether it held. */
  waitFor(predicate: () => boolean, timeoutMs: number): Promise<boolean>;
  /**
   * Rejects when the connection drops (or errors), and never resolves. A dropped SDK 2.8.2
   * connection never settles a pending reducer or procedure call, so every call races this
   * (#240 review): a lost call must fail, never let Node exit 0 with no output.
   */
  readonly lost: Promise<never>;
  close(): void;
}

/** Call deadlines: the reducer, the procedure (6-8 s of procedure time, plus queueing) and the row wait. */
export const CALL_TIMEOUTS_MS = { set: 30_000, audit: 120_000, row: 10_000 } as const;

/** `promise`, or a PipelineError when the connection is lost or `ms` passes first. */
export async function settleWithin<T>(label: string, promise: Promise<T>, lost: Promise<never>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new PipelineError(`${label}_timeout`, EXIT.failed, `no answer in ${ms} ms; the call may still have committed`)), ms);
  });
  try {
    return await Promise.race([promise, lost, deadline]);
  } finally {
    clearTimeout(timer);
  }
}

export function currentMode(world: Pick<AuthorityWorld, 'flagsJson'>): ChunkAuthorityMode {
  return chunkAuthorityModeFromFlagsJson(world.flagsJson());
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export interface StatusReport {
  readonly command: 'status';
  readonly identity: string;
  readonly chunkAuthority: ChunkAuthorityMode;
  readonly liveMap: { readonly revision: number; readonly contentHash: string } | null;
  readonly publication: null | {
    readonly shadowRevision: number;
    readonly manifestHash: string;
    readonly contentHash: string;
    readonly sourceRevision: unknown;
    readonly sourceHash: unknown;
    readonly mapMatches: boolean | null;
    readonly heads: number;
    readonly headsAtRevision: number;
    readonly manifestChunks: number | null;
  };
  /** The manifest's `metadata.authority.resourceGenerator` against this checkout's stamp. */
  readonly resourceGenerator: { readonly published: unknown; readonly expected: typeof CHUNK_RESOURCE_GENERATOR; readonly matches: boolean };
}

export function statusReport(world: AuthorityWorld): StatusReport {
  const shadow = world.shadow(), heads = world.heads(), liveMap = world.liveMap();
  let manifest: Record<string, unknown> | null = null;
  if (shadow !== null) {
    try { const parsed: unknown = JSON.parse(shadow.manifestJson); manifest = record(parsed) ? parsed : null; } catch { manifest = null; }
  }
  const metadata = manifest !== null && record(manifest['metadata']) ? manifest['metadata'] : null;
  const authority = metadata !== null && record(metadata['authority']) ? metadata['authority'] : null;
  const published = authority?.['resourceGenerator'] ?? null;
  const matches = record(published) && published['seed'] === CHUNK_RESOURCE_GENERATOR.seed && published['version'] === CHUNK_RESOURCE_GENERATOR.version;
  return {
    command: 'status', identity: world.identityHex, chunkAuthority: currentMode(world), liveMap,
    publication: shadow === null ? null : {
      shadowRevision: shadow.revision, manifestHash: sha256Hex(shadow.manifestJson), contentHash: shadow.contentHash,
      sourceRevision: manifest?.['sourceRevision'] ?? null, sourceHash: manifest?.['sourceHash'] ?? null,
      mapMatches: liveMap === null || manifest === null ? null
        : manifest['sourceRevision'] === liveMap.revision && manifest['sourceHash'] === liveMap.contentHash,
      heads: heads.length, headsAtRevision: heads.filter(head => head.revision === shadow.revision).length,
      manifestChunks: manifest !== null && Array.isArray(manifest['chunks']) ? manifest['chunks'].length : null,
    },
    resourceGenerator: { published, expected: CHUNK_RESOURCE_GENERATOR, matches },
  };
}

/** The audit's headline fields (the procedure's full JSON goes to the report). */
export function auditSummary(text: string): { readonly ok: boolean; readonly summary: Record<string, unknown> } {
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { throw new PipelineError('audit_invalid_json'); }
  if (!record(parsed)) throw new PipelineError('audit_invalid_json');
  const pick = (value: unknown, ...path: string[]): unknown => path.reduce<unknown>((current, key) => record(current) ? current[key] : undefined, value);
  const summary = {
    ok: parsed['ok'] === true, mode: parsed['mode'] ?? null, servable: parsed['servable'] ?? null,
    complete: pick(parsed, 'completeness', 'complete') ?? null, expectedChunks: pick(parsed, 'completeness', 'expectedChunks') ?? null,
    heads: pick(parsed, 'completeness', 'heads') ?? null, missingBlobs: pick(parsed, 'completeness', 'blobs', 'missing') ?? null,
    compared: pick(parsed, 'disagreements', 'compared') ?? null, disagreements: pick(parsed, 'disagreements', 'count') ?? null,
    fields: pick(parsed, 'disagreements', 'fields') ?? null, keys: parsed['keys'] ?? null, totalMs: pick(parsed, 'timings', 'totalMs') ?? null,
  };
  return { ok: summary.ok, summary };
}

/** `heads.txt` for the S5a validator: one `<space> <hash> <bytes>` line per head at the published revision. */
export function headsFile(shadow: AuthorityShadow, heads: readonly AuthorityHead[]): string {
  const current = heads.filter(head => head.revision === shadow.revision)
    .sort((a, b) => a.cy - b.cy || a.cx - b.cx);
  return current.map(head => `0 ${head.contentHash} ${head.byteLength}`).join('\n') + (current.length > 0 ? '\n' : '');
}

// ---------------------------------------------------------------------------
// Module log (G11): daily JSON-lines files under <data-dir>/replicas/<replica>/module_logs.

export interface ModuleLogWindow { readonly sinceMs: number | null; readonly untilMs: number | null }
const DAY_FILE = /^(\d{4}-\d{2}-\d{2})\.log$/u;

/** The module's messages in the window, in file order. Each file line is `{level, ts (µs), message, ...}`. */
export function moduleLogMessages(text: string, window: ModuleLogWindow): { readonly messages: string[]; readonly lines: number; readonly skipped: number } {
  const messages: string[] = [];
  let lines = 0, skipped = 0;
  for (const line of text.split('\n')) {
    if (line.trim().length === 0) continue;
    lines++;
    let entry: unknown;
    try { entry = JSON.parse(line); } catch { skipped++; continue; }
    // Without a message or a numeric ts a line cannot be placed in the window: counted, never let through.
    if (!record(entry) || typeof entry['message'] !== 'string' || typeof entry['ts'] !== 'number' || !Number.isFinite(entry['ts'])) { skipped++; continue; }
    const ts = entry['ts'] / 1000;
    if ((window.sinceMs !== null && ts < window.sinceMs) || (window.untilMs !== null && ts > window.untilMs)) continue;
    messages.push(entry['message']);
  }
  return { messages, lines, skipped };
}

/** The daily files that can hold lines in the window (by their UTC date), oldest first. */
export function moduleLogFiles(names: readonly string[], window: ModuleLogWindow): string[] {
  const day = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
  return names.filter(name => {
    const match = DAY_FILE.exec(name);
    if (match === null) return false;
    return (window.sinceMs === null || match[1]! >= day(window.sinceMs)) && (window.untilMs === null || match[1]! <= day(window.untilMs));
  }).sort();
}

export interface LogsReport {
  readonly command: 'logs';
  readonly logDir: string;
  readonly files: readonly string[];
  readonly window: { readonly since: string | null; readonly until: string | null };
  readonly lines: number;
  readonly skipped: number;
  readonly summary: HostLogSummary;
  /** The S5c shadow rules (runbook §3.4 items 2-4): failures, empty when all hold. */
  readonly failures: readonly string[];
}

/** S5c shadow pass rules over the summary; an empty list is a pass. */
export function shadowFailures(summary: HostLogSummary): string[] {
  const failures: string[] = [];
  if (summary.compares.length === 0) failures.push('no chunk_authority_shadow_compare was logged');
  if (summary.compares.some(compare => compare.equal !== true)) failures.push('a shadow full compare disagreed');
  if (summary.sampledTicks === 0) failures.push('the shadow sampler logged no sample window');
  if (summary.sampleDisagreements !== 0 || (summary.events['chunk_authority_sample_disagreement'] ?? 0) !== 0) {
    failures.push(`the shadow sampler logged disagreements: ${summary.sampleDisagreements}`);
  }
  for (const event of ['chunk_authority_shadow_error', 'chunk_authority_sample_error', 'chunk_authority_shadow_unavailable']) {
    if ((summary.events[event] ?? 0) > 0) failures.push(`logged ${event} x${summary.events[event]}`);
  }
  return failures;
}

export async function readModuleLogs(logDir: string, window: ModuleLogWindow): Promise<LogsReport> {
  const files = moduleLogFiles(await readdir(logDir), window);
  if (files.length === 0) throw new PipelineError('module_logs_missing', EXIT.failed, logDir);
  const messages: string[] = [];
  let lines = 0, skipped = 0;
  for (const file of files) {
    const read = moduleLogMessages(await readFile(join(logDir, file), 'utf8'), window);
    for (const message of read.messages) messages.push(message);
    lines += read.lines; skipped += read.skipped;
  }
  const summary = summarizeHostLog(messages.join('\n'));
  return { command: 'logs', logDir, files, window: { since: window.sinceMs === null ? null : new Date(window.sinceMs).toISOString(),
    until: window.untilMs === null ? null : new Date(window.untilMs).toISOString() }, lines, skipped, summary, failures: shadowFailures(summary) };
}

// ---------------------------------------------------------------------------
// Commands.

export interface RunDeps {
  readonly connect: (target: { readonly host: string; readonly database: string }, token: string) => Promise<AuthorityWorld>;
  readonly readToken: (path: string, label?: string) => Promise<string>;
  /** Runs the rejoin refresh on the token file (only with --refresh). */
  readonly refresh: (tokenFile: string, target: { readonly host: string; readonly database: string }) => Promise<void>;
  readonly stdout: (line: string) => void;
  readonly stderr: (line: string) => void;
  /** Overrides CALL_TIMEOUTS_MS (tests). */
  readonly timeouts?: Partial<Record<keyof typeof CALL_TIMEOUTS_MS, number>>;
  readonly now?: () => Date;
}

async function exists(path: string): Promise<boolean> {
  return lstat(path).then(() => true, (error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return false;
    throw error;
  });
}

export async function run(options: CliOptions, deps: RunDeps): Promise<number> {
  // Refuse an existing report or dump directory before connecting, not after switching
  // (and never write a failure report over the existing file).
  const refused = options.report !== null && await exists(options.report) ? new PipelineError('report_exists', EXIT.usage, options.report)
    : options.command.kind === 'dump' && await exists(options.command.dir) ? new PipelineError('dump_dir_exists', EXIT.usage, options.command.dir) : null;
  if (refused !== null) {
    deps.stderr(`[world-chunk-authority] ${options.command.kind} refused: ${refused.message}`);
    return refused.exitCode;
  }
  let token: string | undefined;
  const writeReport = async (value: unknown): Promise<void> => {
    if (options.report !== null) await writeFile(options.report, `${redact(JSON.stringify(value, null, 2), token)}\n`, { flag: 'wx', mode: 0o600 });
  };
  const print = (value: unknown): void => deps.stdout(redact(JSON.stringify(value), token));
  try {
    if (options.command.kind === 'logs') {
      const report = await readModuleLogs(options.logDir!, { sinceMs: options.sinceMs, untilMs: options.untilMs });
      await writeReport(report);
      print({ command: 'logs', files: report.files, lines: report.lines, skipped: report.skipped, events: report.summary.events, compares: report.summary.compares.length,
        sampledTicks: report.summary.sampledTicks, sampleDisagreements: report.summary.sampleDisagreements, fallbacks: report.summary.fallbacks.length,
        errors: report.summary.errors.length, failures: report.failures });
      return report.failures.length === 0 ? EXIT.ok : EXIT.failed;
    }
    const target = { host: options.host!, database: options.database! };
    if (options.command.kind === 'set' && options.confirm !== setConfirmation(options.command.mode, target.database)) {
      throw new PipelineError('confirmation_required', EXIT.confirm, `set WORLD_CHUNK_AUTHORITY_CONFIRM=${setConfirmation(options.command.mode, target.database)}`);
    }
    if (options.refresh) await deps.refresh(options.tokenFile!, target);
    token = await deps.readToken(options.tokenFile!, options.tokenLabel);
    const world = await deps.connect(target, token);
    try {
      const command = options.command;
      if (command.kind === 'status') {
        const report = statusReport(world);
        await writeReport(report); print(report);
        return EXIT.ok;
      }
      const timeout = (name: keyof typeof CALL_TIMEOUTS_MS): number => deps.timeouts?.[name] ?? CALL_TIMEOUTS_MS[name];
      if (command.kind === 'audit') {
        const text = await settleWithin('audit', world.audit(), world.lost, timeout('audit'));
        const { ok, summary } = auditSummary(text);
        // The procedure's own JSON, unchanged apart from redaction.
        if (options.report !== null) await writeFile(options.report, `${redact(text, token)}\n`, { flag: 'wx', mode: 0o600 });
        print({ command: 'audit', ...summary });
        return ok ? EXIT.ok : EXIT.failed;
      }
      if (command.kind === 'set') {
        const before = currentMode(world);
        try {
          await settleWithin('set', world.setChunkAuthority(command.mode), world.lost, timeout('set'));
        } catch (error) {
          deps.stderr(`[world-chunk-authority] set ${command.mode}: the reducer call did not complete. It may still have committed: `
            + 're-check the mode with `status` before retrying.');
          throw error;
        }
        const reached = await settleWithin('row', world.waitFor(() => currentMode(world) === command.mode, timeout('row')), world.lost, timeout('row') + 1_000);
        if (!reached) {
          deps.stderr(`[world-chunk-authority] set ${command.mode}: the reducer returned but the public row still says ${currentMode(world)} after `
            + `${timeout('row')} ms. The switch may have committed: re-check with \`status\` before retrying.`);
        }
        const report = { command: 'set', database: target.database, identity: world.identityHex, before, requested: command.mode,
          after: currentMode(world), reached, at: (deps.now ?? (() => new Date()))().toISOString() };
        await writeReport(report); print(report);
        return reached ? EXIT.ok : EXIT.failed;
      }
      const shadow = world.shadow();
      if (shadow === null) throw new PipelineError('no_publication');
      const heads = headsFile(shadow, world.heads());
      await mkdir(command.dir, { mode: 0o700 });
      await writeFile(join(command.dir, 'manifest.json'), shadow.manifestJson, { flag: 'wx', mode: 0o600 });
      await writeFile(join(command.dir, 'heads.txt'), heads, { flag: 'wx', mode: 0o600 });
      const report = { command: 'dump', dir: command.dir, shadowRevision: shadow.revision, manifestHash: sha256Hex(shadow.manifestJson),
        heads: heads.split('\n').filter(line => line.length > 0).length };
      await writeReport(report); print(report);
      return EXIT.ok;
    } finally {
      world.close();
    }
  } catch (error) {
    const code = error instanceof PipelineError ? error.code : 'unexpected';
    const exitCode = error instanceof PipelineError ? error.exitCode : EXIT.unexpected;
    const message = redact((error instanceof Error ? error.message : String(error)).split('\n')[0]!.slice(0, 300), token);
    await writeReport({ ok: false, command: options.command.kind, error: { code, exitCode, message } }).catch(() => undefined);
    deps.stderr(`[world-chunk-authority] ${options.command.kind} failed: ${message}`);
    return exitCode;
  }
}

// ---------------------------------------------------------------------------
// The real world (SDK), refresh and entry point.

export async function connectAuthorityWorld(target: { readonly host: string; readonly database: string }, token: string): Promise<AuthorityWorld> {
  const { DbConnection, tables } = await import('@orchard/world-bindings');
  (await import('spacetimedb')).setGlobalLogLevel('warn');
  type Connection = InstanceType<typeof DbConnection>;
  let loseConnection: (error: PipelineError) => void = () => undefined;
  const lost = new Promise<never>((_resolve, reject) => { loseConnection = reject; });
  lost.catch(() => undefined); // observed by each call's race; never an unhandled rejection
  let closing = false;
  const connection = await new Promise<Connection>((resolvePromise, reject) => {
    const timer = setTimeout(() => reject(new PipelineError('connect_timeout')), 30_000);
    DbConnection.builder().withUri(target.host).withDatabaseName(target.database).withToken(token)
      .onConnect(ready => { clearTimeout(timer); resolvePromise(ready); })
      .onConnectError((_context, error) => { clearTimeout(timer); reject(new PipelineError('connect_failed', EXIT.failed, String(error))); })
      // A dropped connection never settles pending calls in SDK 2.8.2: fail them instead.
      .onDisconnect((_context, error) => {
        if (!closing) loseConnection(new PipelineError('connection_lost', EXIT.failed, error === undefined ? 'disconnected' : String(error)));
      })
      .build();
  });
  try {
    await new Promise<void>((resolvePromise, reject) => {
      const timer = setTimeout(() => reject(new PipelineError('subscription_timeout')), 120_000);
      connection.subscriptionBuilder()
        .onApplied(() => { clearTimeout(timer); resolvePromise(); })
        .onError(context => { clearTimeout(timer); reject(new PipelineError('subscription_failed', EXIT.failed, String(context.event))); })
        .subscribe([tables.spaceAdminFlag, tables.worldChunkShadow, tables.worldChunkHead, tables.liveMapHead]);
    });
  } catch (error) { connection.disconnect(); throw error; }
  const identity = connection.identity?.toHexString() ?? 'unknown';
  return {
    identityHex: identity,
    flagsJson: () => connection.db.spaceAdminFlag.spaceId.find(0)?.flagsJson,
    shadow: () => {
      const row = connection.db.worldChunkShadow.spaceId.find(0n);
      return row === null || row === undefined ? null : { revision: row.revision, contentHash: row.contentHash, manifestJson: row.manifestJson };
    },
    heads: () => [...connection.db.worldChunkHead.iter()].filter(row => row.spaceId === 0n)
      .map(row => ({ cx: row.cx, cy: row.cy, revision: row.revision, contentHash: row.contentHash, byteLength: row.byteLength })),
    liveMap: () => {
      const row = [...connection.db.liveMapHead.iter()].find(row => row.mapId === 'live-island');
      return row === null || row === undefined ? null : { revision: row.revision, contentHash: row.contentHash };
    },
    setChunkAuthority: async mode => { await connection.reducers.setChunkAuthority({ mode }); },
    audit: () => connection.procedures.auditChunkAuthority({}),
    waitFor: async (predicate, timeoutMs) => {
      const deadline = Date.now() + timeoutMs;
      while (!predicate()) {
        if (Date.now() >= deadline) return false;
        await new Promise(resolvePromise => setTimeout(resolvePromise, 50));
      }
      return true;
    },
    lost,
    close: () => { closing = true; connection.disconnect(); },
  };
}

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

/** The rejoin refresh the release lane's chunk hook runs (world-release-chunks.sh): one writer only. */
export function rejoinRefresh(tokenFile: string, target: { readonly host: string; readonly database: string }): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn('npm', ['run', '--silent', 'world:rejoin-smoke', '--', 'refresh'], {
      cwd: REPO_ROOT, stdio: ['ignore', 'ignore', 'inherit'],
      env: { ...process.env, WORLD_REJOIN_TOKENS_FILE: tokenFile, WORLD_REJOIN_REQUIRE_REFRESH: '1',
        SPACETIMEDB_HOST: target.host, SPACETIMEDB_DATABASE: target.database },
    });
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolvePromise() : reject(new PipelineError('token_refresh_failed', EXIT.failed, `exit ${code}`)));
  });
}

export const REAL_DEPS: RunDeps = {
  connect: connectAuthorityWorld, readToken: readTokenFile, refresh: rejoinRefresh,
  stdout: line => console.log(line), stderr: line => console.error(line),
};

/**
 * Fails closed if Node ever exits before `run` settles (an empty event loop around a call the
 * SDK never settles): the exit code is `unexpected` until `run` returns (#240 review).
 */
export async function main(argv: readonly string[] = process.argv.slice(2), env: NodeJS.ProcessEnv = process.env, deps: RunDeps = REAL_DEPS): Promise<number> {
  process.exitCode = EXIT.unexpected;
  const code = await run(parseCli(argv, env), deps);
  process.exitCode = code;
  return code;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(code => process.exit(code), (error: unknown) => {
    console.error(`[world-chunk-authority] ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`);
    process.exit(error instanceof PipelineError ? error.exitCode : EXIT.unexpected);
  });
}
