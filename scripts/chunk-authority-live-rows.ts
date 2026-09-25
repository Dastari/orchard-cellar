import { execFile } from 'node:child_process';
import { chmod, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { DbConnection, tables } from '@orchard/world-bindings';
import type { Identity } from 'spacetimedb';
import { validateRuntimeManifest } from '../packages/sim/src/chunk-runtime.js';
import type { WorldChunkManifest } from '../packages/sim/src/world-chunk.js';

/**
 * Static-world S2c shared plumbing for the chunk-authority soak and the live-row
 * parity gate: target guards, token files, the SDK connection, reading the live map
 * row and content rows, and running `materialize-world-chunks.ts` on them.
 */

const execFileAsync = promisify(execFile);
const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

export const PRODUCTION_DATABASE = 'orchard-cellar-world';
/** The production world host listens on loopback port 3000 on this machine. */
export const PRODUCTION_HOST_PORT = '3000';
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);
const DATABASE_NAME = /^[a-z0-9][a-z0-9-]{2,62}$/u;

export interface SoakTarget {
  readonly host: string;
  readonly database: string;
}

export class SoakTargetError extends Error {}

/**
 * The soak writes (stages blobs, publishes heads, flips the switch, teleports a bot),
 * so it only runs against a disposable local world:
 *
 * - never the production database name, on any host (no override);
 * - never the production host port on loopback (no override);
 * - never a non-loopback host unless `allowRemoteHost` (a staging world, by explicit flag).
 */
export function assertSoakTarget(target: SoakTarget, options: { readonly allowRemoteHost?: boolean } = {}): URL {
  let url: URL;
  try {
    url = new URL(target.host);
  } catch {
    throw new SoakTargetError('soak_invalid_host');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new SoakTargetError('soak_invalid_host');
  if (!DATABASE_NAME.test(target.database)) throw new SoakTargetError('soak_invalid_database');
  if (target.database === PRODUCTION_DATABASE) throw new SoakTargetError('soak_refuses_production_database');
  const loopback = LOOPBACK_HOSTS.has(url.hostname);
  if (loopback && url.port === PRODUCTION_HOST_PORT) throw new SoakTargetError('soak_refuses_production_host_port');
  if (!loopback && options.allowRemoteHost !== true) throw new SoakTargetError('soak_refuses_non_local_host');
  return url;
}

/**
 * Reads one SpaceTimeDB token from a private file. Accepts a bare token, or the
 * rejoin credential file (`{label: token}` or `[{label, token}]`), selecting `label`
 * or the only entry. Refuses group/world-readable files. Never returns the file
 * contents in an error.
 */
export async function readTokenFile(path: string, label?: string): Promise<string> {
  const info = await stat(path);
  if ((info.mode & 0o077) !== 0) throw new Error('token_file_permissions_too_open');
  const text = (await readFile(path, 'utf8')).trim();
  if (text.length === 0) throw new Error('token_file_empty');
  if (!text.startsWith('{') && !text.startsWith('[')) return text;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('token_file_invalid');
  }
  const entries: { label: string; token?: unknown; refreshToken?: unknown }[] = Array.isArray(parsed)
    ? parsed.filter((entry): entry is { label: string } => typeof entry === 'object' && entry !== null && typeof (entry as { label?: unknown }).label === 'string')
    : typeof parsed === 'object' && parsed !== null
      ? Object.entries(parsed as Record<string, unknown>).map(([key, token]) => ({ label: key, token }))
      : [];
  const chosen = label === undefined ? (entries.length === 1 ? entries[0] : undefined) : entries.find(entry => entry.label === label);
  if (chosen === undefined) throw new Error(label === undefined ? 'token_file_label_required' : 'token_file_label_missing');
  if (typeof chosen.token !== 'string' || chosen.token.length === 0) {
    throw new Error(chosen.refreshToken === undefined ? 'token_file_token_missing' : 'token_file_needs_refresh');
  }
  return chosen.token;
}

export interface WorldConnection {
  readonly connection: DbConnection;
  readonly identity: Identity;
  readonly identityHex: string;
}

export function withTimeout<T>(label: string, promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolvePromise, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label}_timeout`)), ms);
    promise.then(value => { clearTimeout(timer); resolvePromise(value); }, (error: unknown) => { clearTimeout(timer); reject(error); });
  });
}

export function connectWorld(target: SoakTarget, token: string, timeoutMs = 30_000): Promise<WorldConnection> {
  return withTimeout('connect', new Promise((resolvePromise, reject) => {
    DbConnection.builder()
      .withUri(target.host)
      .withDatabaseName(target.database)
      .withToken(token)
      .onConnect((connection, identity) => resolvePromise({ connection, identity, identityHex: identity.toHexString() }))
      .onConnectError((_context, error) => reject(error))
      .build();
  }), timeoutMs);
}

/** Subscribes to the public tables the chunk publication depends on. */
export function subscribeChunkInputs(world: WorldConnection, timeoutMs = 60_000): Promise<void> {
  return withTimeout('subscription', new Promise((resolvePromise, reject) => {
    world.connection.subscriptionBuilder()
      .onApplied(() => resolvePromise())
      .onError(context => reject(new Error(String(context.event))))
      .subscribe([tables.liveMapDocument, tables.contentDefinition, tables.contentHead, tables.worldChunkShadow, tables.worldChunkHead, tables.spaceAdminFlag]);
  }), timeoutMs);
}

export interface LiveMapRowJson {
  readonly mapId: string;
  readonly revision: number;
  readonly documentJson: string;
  readonly contentHash: string;
}
export interface ContentRowJson {
  readonly id: string;
  readonly kind: string;
  readonly slug: string;
  readonly revision: string;
  readonly hash: string;
  readonly json: string;
}
export interface PublishedHeads {
  readonly shadow: { readonly revision: number; readonly mapId: string; readonly contentHash: string; readonly manifestJson: string } | null;
  readonly heads: readonly { readonly cx: number; readonly cy: number; readonly contentHash: string; readonly revision: number }[];
}
export interface LiveRows {
  readonly mapRow: LiveMapRowJson | null;
  /** Null when the world has no content head (the server then uses the bootstrap registry). */
  readonly contentRows: readonly ContentRowJson[] | null;
  readonly contentHead: { readonly revision: string; readonly contentHash: string } | null;
  readonly published: PublishedHeads;
}

const LIVE_ISLAND_MAP_ID = 'live-island';
const LIVE_CONTENT_PACK_ID = 'live';

/** Reads the live map row, content rows and published chunk heads from the subscription cache. */
export function readLiveRows(world: WorldConnection): LiveRows {
  const db = world.connection.db;
  const map = db.liveMapDocument.mapId.find(LIVE_ISLAND_MAP_ID);
  const head = [...db.contentHead.iter()].find(row => row.packId === LIVE_CONTENT_PACK_ID) ?? null;
  const shadow = [...db.worldChunkShadow.iter()].find(row => row.spaceId === 0n) ?? null;
  return {
    mapRow: map === null ? null : { mapId: map.mapId, revision: map.revision, documentJson: map.documentJson, contentHash: map.contentHash },
    contentRows: head === null ? null : [...db.contentDefinition.iter()]
      .map(row => ({ id: row.id, kind: row.kind, slug: row.slug, revision: row.revision.toString(), hash: row.hash, json: row.json }))
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
    contentHead: head === null ? null : { revision: head.revision.toString(), contentHash: head.contentHash },
    published: {
      shadow: shadow === null ? null : { revision: shadow.revision, mapId: shadow.mapId, contentHash: shadow.contentHash, manifestJson: shadow.manifestJson },
      heads: [...db.worldChunkHead.iter()].filter(row => row.spaceId === 0n)
        .map(row => ({ cx: row.cx, cy: row.cy, contentHash: row.contentHash, revision: row.revision }))
        .sort((a, b) => a.cy - b.cy || a.cx - b.cx),
    },
  };
}

export interface MaterializedChunks {
  /** The materializer's one-line JSON summary (includes `parity: 'passed'` and the registry `contentHash`). */
  readonly summary: { readonly chunks: number; readonly contentHash: string; readonly sourceHash: string; readonly parity: string } & Record<string, unknown>;
  readonly manifest: WorldChunkManifest;
  /** Exactly the bytes the materializer wrote (canonical JSON plus a newline): the publication's `manifestJson`. */
  readonly manifestJson: string;
  readonly blobs: readonly { readonly cx: number; readonly cy: number; readonly contentHash: string; readonly bytes: Uint8Array }[];
  readonly materializeMs: number;
}

/**
 * Writes the rows to a private directory and runs
 * `materialize-world-chunks.ts --input <row> [--content-rows <rows>] --output <dir>`
 * (which also verifies chunk and authority parity against the server oracle), then
 * loads the manifest and blobs it wrote.
 */
export async function materializeLiveRows(rows: Pick<LiveRows, 'mapRow' | 'contentRows'>, workDir: string): Promise<MaterializedChunks> {
  if (rows.mapRow === null) throw new Error('live_map_row_missing');
  await mkdir(workDir, { recursive: true, mode: 0o700 });
  await chmod(workDir, 0o700);
  const rowPath = resolve(workDir, 'live-map-row.json');
  const contentPath = resolve(workDir, 'content-rows.json');
  const output = resolve(workDir, 'chunks');
  await writeFile(rowPath, `${JSON.stringify(rows.mapRow)}\n`, { mode: 0o600 });
  const args = [resolve(REPO_ROOT, 'node_modules/tsx/dist/cli.mjs'), resolve(REPO_ROOT, 'scripts/materialize-world-chunks.ts'), '--input', rowPath, '--output', output];
  if (rows.contentRows !== null) {
    await writeFile(contentPath, `${JSON.stringify(rows.contentRows)}\n`, { mode: 0o600 });
    args.push('--content-rows', contentPath);
  }
  const started = performance.now();
  const { stdout } = await execFileAsync(process.execPath, args, { cwd: REPO_ROOT, maxBuffer: 16 * 1024 * 1024 });
  const materializeMs = Math.round(performance.now() - started);
  const line = stdout.trim().split('\n').reverse().find(entry => entry.startsWith('{'));
  if (line === undefined) throw new Error('materializer_summary_missing');
  const summary = JSON.parse(line) as MaterializedChunks['summary'];
  if (summary.parity !== 'passed') throw new Error('materializer_parity_failed');
  return { summary, materializeMs, ...await loadMaterialized(output) };
}

export async function loadMaterialized(directory: string): Promise<Pick<MaterializedChunks, 'manifest' | 'manifestJson' | 'blobs'>> {
  const manifestJson = await readFile(resolve(directory, 'manifest.json'), 'utf8');
  const manifest = validateRuntimeManifest(JSON.parse(manifestJson));
  const blobs = [];
  for (const head of manifest.chunks) {
    const bytes = new Uint8Array(await readFile(resolve(directory, `${head.contentHash}.bin`)));
    if (bytes.byteLength !== head.byteLength) throw new Error(`materialized_blob_length_mismatch:${head.cx},${head.cy}`);
    blobs.push({ cx: head.cx, cy: head.cy, contentHash: head.contentHash, bytes });
  }
  return { manifest, manifestJson, blobs };
}

export interface HeadComparison {
  readonly equal: boolean;
  readonly expectedChunks: number;
  readonly actualChunks: number;
  readonly source: { readonly equal: boolean; readonly expected: string; readonly actual: string };
  readonly differences: readonly { readonly cx: number; readonly cy: number; readonly expected: string | null; readonly actual: string | null }[];
}

/** Compares two head sets (and their map source) chunk by chunk. At most `limit` differences are listed. */
export function compareHeads(
  expected: Pick<WorldChunkManifest, 'sourceRevision' | 'sourceHash' | 'chunks'>,
  actual: Pick<WorldChunkManifest, 'sourceRevision' | 'sourceHash' | 'chunks'>,
  limit = 32,
): HeadComparison {
  const key = (head: { cx: number; cy: number }) => `${head.cx}:${head.cy}`;
  const left = new Map(expected.chunks.map(head => [key(head), head.contentHash]));
  const right = new Map(actual.chunks.map(head => [key(head), head.contentHash]));
  const differences: { cx: number; cy: number; expected: string | null; actual: string | null }[] = [];
  let count = 0;
  for (const cell of [...new Set([...left.keys(), ...right.keys()])].sort()) {
    const a = left.get(cell) ?? null, b = right.get(cell) ?? null;
    if (a === b) continue;
    count += 1;
    const [cx, cy] = cell.split(':').map(Number) as [number, number];
    if (differences.length < limit) differences.push({ cx, cy, expected: a, actual: b });
  }
  const sourceExpected = `${expected.sourceRevision}:${expected.sourceHash}`, sourceActual = `${actual.sourceRevision}:${actual.sourceHash}`;
  return {
    equal: count === 0 && sourceExpected === sourceActual,
    expectedChunks: left.size,
    actualChunks: right.size,
    source: { equal: sourceExpected === sourceActual, expected: sourceExpected, actual: sourceActual },
    differences,
  };
}
