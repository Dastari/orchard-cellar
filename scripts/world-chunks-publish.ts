import { createHash, randomUUID } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import { chmod, link, lstat, mkdir, open, unlink, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliCompressSync, brotliDecompressSync, constants as zlibConstants, gunzipSync, gzipSync } from 'node:zlib';
import { CHUNK_RUNTIME_MAX_BLOB_BYTES, chunkBlobPath, validateRuntimeManifest, verifyRuntimeChunk } from '../packages/sim/src/chunk-runtime.js';
import { canonicalChunkJson, decodeWorldChunk, worldChunkHash, type WorldChunkManifest } from '../packages/sim/src/world-chunk.js';
import { parseStoredRejoinCredentials } from './world-rejoin-credentials.js';

/**
 * Static-world S5b: the chunk publish pipeline.
 *
 *   1. Materialise the chunks from the live map row and live content rows, read through a
 *      credentialed SDK connection (subscriptions only), with the atlas index the public
 *      origin serves (its hash is the client's asset revision).
 *   2. Prepare and install every blob (plus .br/.gz siblings) into the persistent
 *      ORCHARD_WORLD_CHUNK_DIR. Content addressed, written with no-clobber links, never
 *      rewritten or deleted.
 *   3. Verify every blob over the public origin: served, decodes, right hash and length.
 *   4. Stage every blob through `stageWorldChunkBlob` (the server keeps the first copy).
 *   5. CAS-publish the heads through `publishWorldChunkShadow` and confirm the new rows.
 *
 * Blob order is CDN, then stage, then heads, so a published head is always servable.
 * Every step is idempotent, so a failed run is recovered by running it again.
 *
 * `plan` (the default) is a dry run: it reads and materialises, then reports what it
 * would do, with no chunk-dir write and no reducer call. `publish` also requires
 * WORLD_CHUNKS_PUBLISH_CONFIRM=publish:<manifestHash>:<registryContentHash>:<database>,
 * where manifestHash is the SHA-256 of the exact manifestJson (the materializer's
 * manifest.json bytes) and registryContentHash is the parsed registry hash the server's
 * CAS compares (not content_head's raw rows hash).
 *
 * `check` is the release check: read only, it reports heads that do not match the live
 * map revision, the registry content hash or the served asset revision, or whose blobs
 * are not served, as stale (exit 3; errors are 1). Stale heads are never removed or
 * disabled: the client falls back, so they fail the check but never lock players out.
 *
 * --report FILE writes a 0600 JSON report on success and on failure (step, error code,
 * required confirmation); tokens are redacted from reports and logs.
 *
 * The connection signs in as the credential's identity (client_connected runs). Use an
 * owner or admin release credential, refreshed first (npm run world:rejoin-smoke --
 * refresh). The token comes only from the private file named by WORLD_CHUNKS_TOKEN_FILE
 * (and WORLD_CHUNKS_TOKEN_LABEL for a multi-entry rejoin file); it is never printed.
 *
 *   WORLD_CHUNKS_TOKEN_FILE=/private/tokens.json WORLD_CHUNKS_TOKEN_LABEL=owner \
 *   npm run world:chunks:publish -- [plan|publish|check] --host URL --database NAME \
 *     --origin URL [--chunk-dir DIR] [--report FILE]
 */

export const PRODUCTION_DATABASE = 'orchard-cellar-world';
export const PRODUCTION_HOST = 'http://127.0.0.1:3000';
export const PRODUCTION_ORIGIN = 'https://orchard.dastari.net';
export const LIVE_ISLAND_MAP_ID = 'live-island';
const LIVE_CONTENT_PACK_ID = 'live';
const TOPSIDE_SPACE_ID = 0;
const ATLAS_INDEX_PATH = '/generated/atlas.packs.json';
const MAX_ATLAS_INDEX_BYTES = 16 * 1024 * 1024;
const MISSING_BLOB_HASH = '0'.repeat(64);

/** 0 done/fresh, 1 failed, 3 stale heads (check), 64 usage, 70 unexpected, 75 lost a race (re-run), 77 confirmation. */
export const EXIT = { ok: 0, failed: 1, stale: 3, usage: 64, unexpected: 70, retry: 75, confirm: 77 } as const;

export class PipelineError extends Error {
  constructor(readonly code: string, readonly exitCode: number = EXIT.failed, detail?: string) {
    super(detail === undefined ? code : `${code}: ${detail}`);
  }
}

// ---------------------------------------------------------------------------
// Ports. The real adapters are at the bottom; the tests use fakes.

export interface LiveMapRow { readonly mapId: string; readonly revision: number; readonly contentHash: string; readonly documentJson: string }
export interface ContentRow { readonly id: string; readonly kind: string; readonly slug: string; readonly revision: string; readonly hash: string; readonly json: string }
export interface ShadowRow { readonly revision: number; readonly mapId: string; readonly contentHash: string; readonly manifestJson: string }
export interface HeadRow { readonly cx: number; readonly cy: number; readonly contentHash: string; readonly revision: number; readonly byteLength: number }
export interface LiveState {
  readonly mapRow: LiveMapRow | null;
  readonly contentHead: { readonly revision: string; readonly contentHash: string } | null;
  /** Null when there is no content head (the server then uses the bootstrap registry). */
  readonly contentRows: readonly ContentRow[] | null;
  readonly shadow: ShadowRow | null;
  readonly heads: readonly HeadRow[];
}
export interface ShadowPublication { readonly manifestJson: string; readonly mapId: string; readonly contentHash: string; readonly expectedRevision: number }
export interface WorldPort {
  /** The current subscription cache (topside only). */
  read(): LiveState;
  stageBlob(bytes: Uint8Array): Promise<void>;
  publishShadow(input: ShadowPublication): Promise<void>;
  /** Waits until `predicate` holds or `timeoutMs` passes; returns the last state either way. */
  settle(predicate: (state: LiveState) => boolean, timeoutMs: number): Promise<LiveState>;
  /**
   * Materialising blocks the event loop for about 40 s, longer than the server's 30 s
   * client timeout, so the connection is closed around it and then reopened.
   */
  suspend(): Promise<void>;
  resume(): Promise<void>;
}
export interface ServedBlob { readonly status: number; readonly contentType: string; readonly cacheControl: string; readonly encoding: string; readonly bytes: Uint8Array }
export interface OriginPort {
  readonly origin: string;
  atlasIndex(): Promise<Uint8Array>;
  blob(spaceId: number, hash: string): Promise<ServedBlob>;
}
export type BlobStatus = 'missing' | 'present' | 'incomplete';
export interface ChunkStorePort {
  /** Read only: whether the blob and both siblings are already installed. */
  status(spaceId: number, hash: string): Promise<BlobStatus>;
  /** Adds whatever is missing; verifies (never rewrites) whatever exists. */
  install(spaceId: number, hash: string, bytes: Uint8Array): Promise<'installed' | 'present'>;
}
export interface CandidateBlob { readonly cx: number; readonly cy: number; readonly contentHash: string; readonly bytes: Uint8Array }
export interface Candidate {
  readonly manifest: WorldChunkManifest;
  readonly manifestJson: string;
  /** What publishWorldChunkShadow compares: the server's `contentRegistry(ctx).contentHash`. */
  readonly registryContentHash: string;
  readonly blobs: readonly CandidateBlob[];
}
export type MaterializePort = (input: { readonly mapRow: LiveMapRow; readonly contentRows: readonly ContentRow[] | null; readonly atlasIndex: Uint8Array }) => Promise<Candidate>;

// ---------------------------------------------------------------------------
// Pure rules.

export function sha256Hex(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}
export function manifestHash(manifestJson: string): string { return sha256Hex(manifestJson); }
/** Binds the exact manifest, the registry content hash it is published under, and the database. */
export function publishConfirmation(manifestJson: string, registryContentHash: string, database: string): string {
  return `publish:${manifestHash(manifestJson)}:${registryContentHash}:${database}`;
}

/**
 * The content hash publishWorldChunkShadow compares: the server's parsed registry hash
 * (`contentRegistry(ctx).contentHash`), not the raw rows hash in content_head. They can
 * differ (for example a row spelling out a default). Null rows mean the bootstrap registry.
 */
export type RegistryContentHash = (rows: readonly ContentRow[] | null) => string | Promise<string>;
export async function liveRegistryContentHash(rows: readonly ContentRow[] | null): Promise<string> {
  const { bootstrapContentRegistry, buildContentRegistry } = await import('@orchard/sim');
  if (rows === null) return bootstrapContentRegistry().contentHash;
  const built = buildContentRegistry(rows.map(row => ({ id: row.id, kind: row.kind, slug: row.slug, json: row.json })));
  if (!built.report.valid) throw new PipelineError('live_content_registry_invalid', EXIT.failed, built.report.errors[0]?.code ?? 'unknown');
  return built.registry.contentHash;
}

export type StaleReason = 'unpublished' | 'map' | 'content' | 'asset' | 'heads' | 'manifest';

/** Why the published heads do not describe the live world. Empty means fresh. */
export function staleReasons(state: LiveState, expected: { readonly contentHash: string; readonly assetRevision: string }): { readonly reasons: StaleReason[]; readonly manifest: WorldChunkManifest | null } {
  const shadow = state.shadow;
  if (shadow === null) return { reasons: ['unpublished'], manifest: null };
  let manifest: WorldChunkManifest;
  try { manifest = validateRuntimeManifest(JSON.parse(shadow.manifestJson)); } catch { return { reasons: ['manifest'], manifest: null }; }
  const reasons: StaleReason[] = [];
  if (state.mapRow === null || shadow.mapId !== state.mapRow.mapId || manifest.sourceRevision !== state.mapRow.revision || manifest.sourceHash !== state.mapRow.contentHash) reasons.push('map');
  if (shadow.contentHash !== expected.contentHash) reasons.push('content');
  if (manifest.assetRevision !== expected.assetRevision) reasons.push('asset');
  if (!headsMatch(state.heads, manifest, shadow.revision)) reasons.push('heads');
  return { reasons, manifest };
}

/** The public regional heads are exactly the manifest's chunks at the shadow revision. */
export function headsMatch(heads: readonly HeadRow[], manifest: WorldChunkManifest, revision: number): boolean {
  if (heads.length !== manifest.chunks.length) return false;
  const expected = new Map(manifest.chunks.map(head => [`${head.cx}:${head.cy}`, head]));
  return heads.every(head => {
    const want = expected.get(`${head.cx}:${head.cy}`);
    return want !== undefined && head.revision === revision && want.contentHash === head.contentHash && want.byteLength === head.byteLength;
  });
}

/** The world already serves exactly this candidate (manifest, content hash and heads). */
export function isPublished(state: LiveState, candidate: Candidate): boolean {
  const shadow = state.shadow;
  if (shadow === null || shadow.mapId !== LIVE_ISLAND_MAP_ID || shadow.contentHash !== candidate.registryContentHash) return false;
  let published: unknown;
  try { published = JSON.parse(shadow.manifestJson); } catch { return false; }
  return canonicalChunkJson(published) === canonicalChunkJson(candidate.manifest) && headsMatch(state.heads, candidate.manifest, shadow.revision);
}

function sourceKey(state: LiveState): string {
  return JSON.stringify([state.mapRow?.mapId, state.mapRow?.revision, state.mapRow?.contentHash, state.contentHead?.contentHash ?? null]);
}

/** Refuses a candidate that does not describe exactly these live rows and served assets. */
export function assertCandidate(candidate: Candidate, state: LiveState, assetRevision: string, registryContentHash: string): void {
  const map = state.mapRow;
  if (map === null) throw new PipelineError('live_map_row_missing');
  const manifest = validateRuntimeManifest(JSON.parse(candidate.manifestJson));
  if (canonicalChunkJson(manifest) !== canonicalChunkJson(candidate.manifest)) throw new PipelineError('candidate_manifest_json_mismatch');
  if (manifest.spaceId !== TOPSIDE_SPACE_ID) throw new PipelineError('candidate_space_not_supported');
  if (manifest.sourceRevision !== map.revision || manifest.sourceHash !== map.contentHash) throw new PipelineError('candidate_map_source_mismatch');
  if (candidate.registryContentHash !== registryContentHash) throw new PipelineError('candidate_content_hash_mismatch');
  if (manifest.assetRevision !== assetRevision) throw new PipelineError('candidate_asset_revision_mismatch');
  if (candidate.blobs.length !== manifest.chunks.length) throw new PipelineError('candidate_blob_count_mismatch');
  for (const blob of candidate.blobs) {
    const head = manifest.chunks.find(entry => entry.cx === blob.cx && entry.cy === blob.cy);
    if (head === undefined || head.contentHash !== blob.contentHash) throw new PipelineError('candidate_blob_head_mismatch', EXIT.failed, `${blob.cx},${blob.cy}`);
    verifyRuntimeChunk(blob.bytes, manifest, blob.cx, blob.cy);
  }
}

/** One served blob: 200, octet-stream, immutable, exact length, decodes to the address hash. */
export function checkServedBlob(served: ServedBlob, spaceId: number, head: { readonly contentHash: string; readonly byteLength: number }): string | null {
  if (served.status !== 200) return `status ${served.status}`;
  if (served.contentType.split(';')[0]!.trim().toLowerCase() !== 'application/octet-stream') return `content type ${served.contentType}`;
  if (!/\bimmutable\b/u.test(served.cacheControl)) return 'not immutable';
  if (served.bytes.byteLength !== head.byteLength) return `length ${served.bytes.byteLength} != ${head.byteLength}`;
  try {
    const chunk = decodeWorldChunk(served.bytes, head.contentHash);
    if (chunk.spaceId !== spaceId) return 'space mismatch';
  } catch (error) {
    return `decode: ${error instanceof Error ? error.message : String(error)}`;
  }
  return null;
}

async function mapLimit<T, R>(items: readonly T[], limit: number, task: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const index = next++; results[index] = await task(items[index]!); }
  });
  await Promise.all(workers);
  return results;
}

export interface ServedReport { readonly served: number; readonly encodings: Readonly<Record<string, number>> }

/** Every head is served and correct over the public origin, and a missing blob is a real 404. */
export async function verifyServed(origin: OriginPort, spaceId: number, heads: readonly { readonly cx: number; readonly cy: number; readonly contentHash: string; readonly byteLength: number }[], concurrency = 4): Promise<ServedReport> {
  const encodings: Record<string, number> = {};
  const failures: string[] = [];
  await mapLimit(heads, concurrency, async head => {
    let problem: string | null;
    try {
      const served = await origin.blob(spaceId, head.contentHash);
      problem = checkServedBlob(served, spaceId, head);
      if (problem === null) encodings[served.encoding] = (encodings[served.encoding] ?? 0) + 1;
    } catch (error) {
      problem = error instanceof Error ? error.message : String(error);
    }
    if (problem !== null) failures.push(`${head.cx},${head.cy} ${head.contentHash.slice(0, 12)}: ${problem}`);
  });
  if (failures.length > 0) throw new PipelineError('origin_blob_not_served', EXIT.failed, `${failures.length} of ${heads.length}; ${failures.sort().slice(0, 4).join('; ')}`);
  const missing = await origin.blob(spaceId, MISSING_BLOB_HASH);
  if (missing.status !== 404) throw new PipelineError('origin_missing_blob_not_404', EXIT.failed, `status ${missing.status}`);
  return { served: heads.length, encodings };
}

// ---------------------------------------------------------------------------
// The pipeline.

export interface PipelineDeps {
  readonly world: WorldPort;
  readonly origin: OriginPort;
  readonly store: ChunkStorePort;
  readonly materialize: MaterializePort;
  readonly registryContentHash: RegistryContentHash;
  readonly log?: (line: string) => void;
  /** How long to wait for the published rows to appear (default 60 s). */
  readonly observeTimeoutMs?: number;
}
/** Where a run got to, for the failure report. Never holds a secret. */
export interface PipelineTrace {
  step: 'token' | 'connect' | 'read' | 'materialise' | 'confirm' | 'install' | 'verify' | 'stage' | 'publish' | 'observe' | 'check' | 'done';
  manifestHash?: string;
  registryContentHash?: string;
  /** The value WORLD_CHUNKS_PUBLISH_CONFIRM must have, once known. */
  confirmation?: string;
}
export interface PipelineOptions {
  readonly mode: 'plan' | 'publish';
  readonly database: string;
  /** WORLD_CHUNKS_PUBLISH_CONFIRM. Required for `publish`. */
  readonly confirm?: string | undefined;
}
export interface PublishReport {
  readonly schema: 1;
  readonly mode: 'plan' | 'publish';
  readonly outcome: 'planned' | 'published' | 'unchanged';
  readonly database: string;
  readonly origin: string;
  readonly manifestHash: string;
  /** The value WORLD_CHUNKS_PUBLISH_CONFIRM must have to publish this manifest. */
  readonly confirmation: string;
  readonly source: { readonly mapRevision: number; readonly mapHash: string; readonly contentHash: string; readonly assetRevision: string };
  readonly chunks: number;
  readonly bytes: number;
  readonly before: { readonly shadowRevision: number | null; readonly stale: readonly StaleReason[]; readonly alreadyPublished: boolean };
  readonly install: { readonly installed: number; readonly present: number; readonly incomplete: number; readonly missing: number };
  readonly verify: ServedReport | null;
  readonly stage: { readonly staged: number; readonly skipped: boolean };
  readonly publish: { readonly expectedRevision: number; readonly revision: number; readonly recovered: boolean } | null;
}

export async function runPublishPipeline(deps: PipelineDeps, options: PipelineOptions, trace: PipelineTrace = { step: 'read' }): Promise<PublishReport> {
  const log = deps.log ?? (() => undefined);
  const observeMs = deps.observeTimeoutMs ?? 60_000;

  // 1. Materialise from the live rows and the served atlas index.
  trace.step = 'read';
  await deps.world.resume();
  const initial = deps.world.read();
  if (initial.mapRow === null) throw new PipelineError('live_map_row_missing');
  const registryContentHash = await deps.registryContentHash(initial.contentRows);
  trace.registryContentHash = registryContentHash;
  const atlasIndex = await deps.origin.atlasIndex();
  const assetRevision = worldChunkHash(atlasIndex);
  log(`materialising map revision ${initial.mapRow.revision} with asset revision ${assetRevision.slice(0, 12)}`);
  trace.step = 'materialise';
  await deps.world.suspend();
  const candidate = await deps.materialize({ mapRow: initial.mapRow, contentRows: initial.contentRows, atlasIndex });
  assertCandidate(candidate, initial, assetRevision, registryContentHash);
  const spaceId = candidate.manifest.spaceId;
  const confirmation = publishConfirmation(candidate.manifestJson, registryContentHash, options.database);
  trace.manifestHash = manifestHash(candidate.manifestJson);
  trace.confirmation = confirmation;
  const alreadyPublished = isPublished(initial, candidate);
  const before = {
    shadowRevision: initial.shadow?.revision ?? null,
    stale: staleReasons(initial, { contentHash: registryContentHash, assetRevision }).reasons,
    alreadyPublished,
  };
  const base = {
    schema: 1 as const, mode: options.mode, database: options.database, origin: deps.origin.origin,
    manifestHash: manifestHash(candidate.manifestJson), confirmation,
    source: { mapRevision: initial.mapRow.revision, mapHash: initial.mapRow.contentHash, contentHash: candidate.registryContentHash, assetRevision },
    chunks: candidate.blobs.length, bytes: candidate.blobs.reduce((total, blob) => total + blob.bytes.byteLength, 0), before,
  };

  // 2 (dry run). Report only: read-only store inspection, no writes, no reducers.
  if (options.mode === 'plan') {
    const counts = { installed: 0, present: 0, incomplete: 0, missing: 0 };
    for (const blob of candidate.blobs) counts[await deps.store.status(spaceId, blob.contentHash)] += 1;
    trace.step = 'done';
    return { ...base, outcome: 'planned', install: counts, verify: null, stage: { staged: 0, skipped: true }, publish: null };
  }
  trace.step = 'confirm';
  if (options.confirm !== confirmation) throw new PipelineError('world_chunks_confirmation_required', EXIT.confirm, `set WORLD_CHUNKS_PUBLISH_CONFIRM=${confirmation}`);
  await deps.world.resume();
  if (sourceKey(deps.world.read()) !== sourceKey(initial)) throw new PipelineError('source_changed', EXIT.retry, 'the live map or content changed while materialising; run again');

  // 2. Install (content addressed, additive).
  trace.step = 'install';
  const install = { installed: 0, present: 0, incomplete: 0, missing: 0 };
  for (const blob of candidate.blobs) install[await deps.store.install(spaceId, blob.contentHash, blob.bytes)] += 1;
  log(`installed ${install.installed} blob(s), ${install.present} already present`);

  // 3. Verify over the public origin, and that it still serves the same atlas index.
  trace.step = 'verify';
  const verify = await verifyServed(deps.origin, spaceId, candidate.manifest.chunks);
  if (worldChunkHash(await deps.origin.atlasIndex()) !== assetRevision) throw new PipelineError('origin_asset_revision_changed', EXIT.retry);
  log(`verified ${verify.served} blob(s) over ${deps.origin.origin}: ${JSON.stringify(verify.encodings)}`);

  // 4. Stage (the server keeps the first copy of each hash, so re-staging is harmless).
  trace.step = 'stage';
  let staged = 0;
  if (!alreadyPublished) {
    for (const blob of candidate.blobs) {
      try { await deps.world.stageBlob(blob.bytes); }
      catch (error) { throw new PipelineError('stage_failed', EXIT.failed, `${blob.cx},${blob.cy}: ${errorText(error)}`); }
      staged += 1;
    }
    log(`staged ${staged} blob(s)`);
  }

  // 5. CAS-publish the heads against the rows the candidate was built from.
  trace.step = 'publish';
  const current = deps.world.read();
  if (sourceKey(current) !== sourceKey(initial)) throw new PipelineError('source_changed', EXIT.retry, 'the live map or content changed while publishing; run again');
  if (isPublished(current, candidate)) {
    trace.step = 'done';
    return { ...base, outcome: 'unchanged', install, verify, stage: { staged, skipped: alreadyPublished }, publish: null };
  }
  const expectedRevision = current.shadow?.revision ?? 0;
  let recovered = false;
  try {
    await deps.world.publishShadow({ manifestJson: candidate.manifestJson, mapId: LIVE_ISLAND_MAP_ID, contentHash: candidate.registryContentHash, expectedRevision });
  } catch (error) {
    // Production reducers throw plain Errors (clients see no code), so classify by state.
    const after = await deps.world.settle(state => isPublished(state, candidate) || (state.shadow?.revision ?? 0) !== expectedRevision, 5_000);
    if (isPublished(after, candidate)) recovered = true;
    else if (sourceKey(after) !== sourceKey(initial)) throw new PipelineError('source_changed', EXIT.retry, 'the live map or content changed at publish; run again');
    else if ((after.shadow?.revision ?? 0) !== expectedRevision) throw new PipelineError('cas_conflict', EXIT.retry, `shadow revision moved from ${expectedRevision} to ${after.shadow?.revision ?? 0}; run again`);
    else throw new PipelineError('publish_rejected', EXIT.failed, errorText(error));
  }
  trace.step = 'observe';
  const after = await deps.world.settle(state => isPublished(state, candidate), observeMs);
  if (!isPublished(after, candidate)) throw new PipelineError('publish_not_observed', EXIT.failed, `expected revision ${expectedRevision + 1}`);
  log(`published heads at shadow revision ${after.shadow!.revision}`);
  trace.step = 'done';
  return { ...base, outcome: 'published', install, verify, stage: { staged, skipped: false }, publish: { expectedRevision, revision: after.shadow!.revision, recovered } };
}

export interface CheckReport {
  readonly schema: 1;
  readonly fresh: boolean;
  readonly stale: readonly StaleReason[];
  readonly shadowRevision: number | null;
  readonly heads: number;
  readonly live: { readonly mapRevision: number | null; readonly mapHash: string | null; readonly contentHash: string; readonly assetRevision: string };
  readonly verify: ServedReport | null;
  readonly verifyError: string | null;
}

/** The release check. Read only. Stale or unserved heads fail the check; nothing is changed. */
export async function checkPublishedHeads(deps: { readonly world: WorldPort; readonly origin: OriginPort; readonly registryContentHash: RegistryContentHash }): Promise<CheckReport> {
  const state = deps.world.read();
  const assetRevision = worldChunkHash(await deps.origin.atlasIndex());
  const contentHash = await deps.registryContentHash(state.contentRows);
  const { reasons, manifest } = staleReasons(state, { contentHash, assetRevision });
  let verify: ServedReport | null = null, verifyError: string | null = null;
  if (manifest !== null) {
    try { verify = await verifyServed(deps.origin, manifest.spaceId, manifest.chunks); }
    catch (error) { verifyError = errorText(error); if (!reasons.includes('heads')) reasons.push('heads'); }
  }
  return {
    schema: 1, fresh: reasons.length === 0, stale: reasons, shadowRevision: state.shadow?.revision ?? null, heads: state.heads.length,
    live: { mapRevision: state.mapRow?.revision ?? null, mapHash: state.mapRow?.contentHash ?? null, contentHash, assetRevision }, verify, verifyError,
  };
}

function errorText(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.split('\n')[0]!.slice(0, 300);
}

/** Removes the token, token query parameters and anything JWT-shaped from text bound for logs or reports. */
export function redact(text: string, token?: string): string {
  let result = token !== undefined && token.length >= 8 ? text.split(token).join('[redacted]') : text;
  result = result.replace(/([?&](?:access_)?token=)[^&\s"']+/giu, '$1[redacted]');
  return result.replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/gu, '[redacted]');
}

export interface FailureReport {
  readonly schema: 1;
  readonly ok: false;
  readonly command: CliOptions['command'];
  readonly target: { readonly host: string; readonly database: string; readonly origin: string };
  readonly step: PipelineTrace['step'];
  readonly error: { readonly code: string; readonly exitCode: number; readonly message: string };
  readonly manifestHash: string | null;
  readonly registryContentHash: string | null;
  readonly confirmation: string | null;
}

/** The evidence written when a run fails (including the expected exit 77). Never contains the token. */
export function failureReport(options: Pick<CliOptions, 'command' | 'host' | 'database' | 'origin'>, trace: PipelineTrace, error: unknown, token?: string): FailureReport {
  const code = error instanceof PipelineError ? error.code : 'unexpected';
  return {
    schema: 1, ok: false, command: options.command, target: { host: options.host, database: options.database, origin: options.origin },
    step: trace.step,
    error: { code, exitCode: error instanceof PipelineError ? error.exitCode : EXIT.unexpected, message: redact(errorText(error), token) },
    manifestHash: trace.manifestHash ?? null, registryContentHash: trace.registryContentHash ?? null, confirmation: trace.confirmation ?? null,
  };
}

// ---------------------------------------------------------------------------
// Token file.

const TOKEN = /^[A-Za-z0-9._~+/=-]+$/u;

/**
 * Reads one token from a private file: a bare token, or a rejoin credential file
 * (`{label: token}` or `[{label, token, ...}]`) selecting `label` or the only entry.
 * Refuses a symlink, a non-regular file, a file owned by another user, and any group or
 * other permission bit. No error ever contains the file contents.
 */
export async function readTokenFile(path: string, label?: string): Promise<string> {
  if (!isAbsolute(path)) throw new PipelineError('token_file_path_must_be_absolute', EXIT.usage);
  let handle;
  try {
    // O_NOFOLLOW refuses a symlink at open; every check then runs on the open descriptor.
    handle = await open(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW | fsConstants.O_NONBLOCK);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ELOOP') throw new PipelineError('token_file_symlink_refused', EXIT.usage);
    throw new PipelineError('token_file_unreadable', EXIT.usage, code ?? 'error');
  }
  let text: string;
  try {
    const info = await handle.stat();
    if (!info.isFile()) throw new PipelineError('token_file_not_regular', EXIT.usage);
    if (typeof process.getuid === 'function' && info.uid !== process.getuid()) throw new PipelineError('token_file_not_owned_by_user', EXIT.usage);
    if ((info.mode & 0o077) !== 0) throw new PipelineError('token_file_group_or_other_accessible', EXIT.usage);
    if (info.size > 1024 * 1024) throw new PipelineError('token_file_too_large', EXIT.usage);
    text = (await handle.readFile('utf8')).trim();
  } finally {
    await handle.close();
  }
  if (text.length === 0) throw new PipelineError('token_file_empty', EXIT.usage);
  if (!text.startsWith('{') && !text.startsWith('[')) {
    if (!TOKEN.test(text)) throw new PipelineError('token_file_invalid', EXIT.usage);
    return text;
  }
  let credentials;
  try { credentials = parseStoredRejoinCredentials(JSON.parse(text) as unknown); }
  catch { throw new PipelineError('token_file_invalid', EXIT.usage); } // JSON.parse messages quote the input
  const chosen = label === undefined ? (credentials.length === 1 ? credentials[0] : undefined) : credentials.find(entry => entry.label === label);
  if (chosen === undefined) throw new PipelineError(label === undefined ? 'token_file_label_required' : 'token_file_label_missing', EXIT.usage);
  if (chosen.token === undefined || chosen.token.length === 0) throw new PipelineError('token_file_token_missing_refresh_first', EXIT.usage);
  return chosen.token;
}

// ---------------------------------------------------------------------------
// Chunk directory (the persistent ORCHARD_WORLD_CHUNK_DIR the frontend serves).

type Sibling = { readonly suffix: '' | '.br' | '.gz'; readonly decode: (bytes: Uint8Array) => Uint8Array; readonly encode: (bytes: Uint8Array) => Uint8Array };
const SIBLINGS: readonly Sibling[] = [
  // Siblings first and the identity .bin last: the server serves nothing until .bin exists.
  { suffix: '.br', decode: bytes => brotliDecompressSync(bytes), encode: bytes => brotliCompressSync(bytes, { params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 5 } }) },
  { suffix: '.gz', decode: bytes => gunzipSync(bytes), encode: bytes => gzipSync(bytes, { level: 9 }) },
  { suffix: '', decode: bytes => bytes, encode: bytes => bytes },
];

async function readExisting(path: string): Promise<Uint8Array | null> {
  let handle;
  try { handle = await open(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW | fsConstants.O_NONBLOCK); }
  catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return null;
    if (code === 'ELOOP') throw new PipelineError('chunk_dir_symlink_refused', EXIT.failed, path);
    throw error;
  }
  try {
    const info = await handle.stat();
    if (!info.isFile()) throw new PipelineError('chunk_dir_not_regular_file', EXIT.failed, path);
    if (info.size > 4 * CHUNK_RUNTIME_MAX_BLOB_BYTES) throw new PipelineError('chunk_dir_file_too_large', EXIT.failed, path);
    return new Uint8Array(await handle.readFile());
  } finally { await handle.close(); }
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.byteLength === right.byteLength && Buffer.from(left.buffer, left.byteOffset, left.byteLength).equals(right);
}

function decodesTo(sibling: Sibling, existing: Uint8Array, bytes: Uint8Array): boolean {
  try { return sameBytes(sibling.decode(existing), bytes); } catch { return false; }
}

/**
 * Creates a missing directory chain as 0755, whatever the umask (the release runs under
 * umask 077). Existing directories are left exactly as they are.
 */
async function ensureServedDirectory(directory: string): Promise<void> {
  const created = await mkdir(directory, { recursive: true, mode: 0o755 });
  if (created === undefined) return;
  let path = created;
  await chmod(path, 0o755);
  for (const part of relative(created, directory).split(sep).filter(Boolean)) {
    path = join(path, part);
    await chmod(path, 0o755);
  }
}

export function fileChunkStore(root: string): ChunkStorePort {
  if (!isAbsolute(root)) throw new PipelineError('chunk_dir_must_be_absolute', EXIT.usage);
  const blobPath = (spaceId: number, hash: string, suffix: string): string => join(root, chunkBlobPath(spaceId, hash).slice('/world/'.length) + suffix);
  return {
    async status(spaceId, hash) {
      let found = 0;
      for (const sibling of SIBLINGS) {
        try { const info = await lstat(blobPath(spaceId, hash, sibling.suffix)); if (info.isFile()) found += 1; }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      }
      return found === SIBLINGS.length ? 'present' : found === 0 ? 'missing' : 'incomplete';
    },
    async install(spaceId, hash, bytes) {
      if (worldChunkHash(bytes.subarray(40)) !== hash) throw new PipelineError('chunk_hash_mismatch', EXIT.failed, hash);
      const directory = join(root, String(spaceId));
      await ensureServedDirectory(directory);
      let wrote = false;
      for (const sibling of SIBLINGS) {
        const path = blobPath(spaceId, hash, sibling.suffix);
        const existing = await readExisting(path);
        if (existing !== null) {
          // Content addressed and immutable: never overwrite. A mismatch needs a person.
          if (!decodesTo(sibling, existing, bytes)) throw new PipelineError('chunk_dir_blob_conflict', EXIT.failed, path);
          continue;
        }
        const temporary = join(directory, `.${hash}${sibling.suffix}.${process.pid}.${randomUUID()}.tmp`);
        const handle = await open(temporary, 'wx', 0o644);
        try {
          await handle.writeFile(sibling.encode(bytes));
          await handle.sync();
          await handle.chmod(0o644);
        } finally { await handle.close(); }
        try {
          await link(temporary, path); // no-clobber: fails if another writer got there first
          wrote = true;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
          const raced = await readExisting(path);
          if (raced === null || !decodesTo(sibling, raced, bytes)) throw new PipelineError('chunk_dir_blob_conflict', EXIT.failed, path);
        } finally {
          await unlink(temporary).catch(() => undefined);
        }
      }
      if (wrote) {
        const handle = await open(directory, 'r');
        try { await handle.sync(); } finally { await handle.close(); }
      }
      return wrote ? 'installed' : 'present';
    },
  };
}

// ---------------------------------------------------------------------------
// Public origin.

async function boundedBytes(response: Response, limit: number): Promise<Uint8Array> {
  if (response.body === null) return new Uint8Array();
  const parts: Uint8Array[] = [];
  let length = 0;
  for await (const part of response.body) {
    length += (part as Uint8Array).byteLength;
    if (length > limit) throw new Error('response_too_large');
    parts.push(part as Uint8Array);
  }
  return new Uint8Array(Buffer.concat(parts));
}

export function httpOrigin(origin: string, fetchImpl: typeof fetch = fetch, timeoutMs = 30_000): OriginPort {
  const base = origin.replace(/\/+$/u, '');
  return {
    origin: base,
    async atlasIndex() {
      const response = await fetchImpl(`${base}${ATLAS_INDEX_PATH}`, { cache: 'no-store', signal: AbortSignal.timeout(timeoutMs) });
      if (!response.ok) throw new PipelineError('origin_atlas_index_unavailable', EXIT.failed, `status ${response.status}`);
      return boundedBytes(response, MAX_ATLAS_INDEX_BYTES);
    },
    async blob(spaceId, hash) {
      // fetch decodes br/gzip itself; Content-Encoding still says which variant was served.
      const response = await fetchImpl(`${base}${chunkBlobPath(spaceId, hash)}`, {
        headers: { 'accept-encoding': 'br, gzip' }, signal: AbortSignal.timeout(timeoutMs),
      });
      const bytes = response.ok ? await boundedBytes(response, CHUNK_RUNTIME_MAX_BLOB_BYTES) : new Uint8Array();
      if (!response.ok) await response.body?.cancel().catch(() => undefined);
      return {
        status: response.status, bytes,
        contentType: response.headers.get('content-type') ?? '',
        cacheControl: response.headers.get('cache-control') ?? '',
        encoding: response.headers.get('content-encoding') ?? 'identity',
      };
    },
  };
}

// ---------------------------------------------------------------------------
// SDK world connection (subscriptions plus the two existing reducers).

function withTimeout<T>(label: string, promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolvePromise, reject) => {
    const timer = setTimeout(() => reject(new PipelineError(`${label}_timeout`)), ms);
    promise.then(value => { clearTimeout(timer); resolvePromise(value); }, (error: unknown) => { clearTimeout(timer); reject(error); });
  });
}

export async function connectWorld(target: { readonly host: string; readonly database: string }, token: string): Promise<WorldPort & { close(): void }> {
  const { DbConnection, tables } = await import('@orchard/world-bindings');
  // The SDK logs connection chatter on stdout; keep stdout for the one JSON summary line.
  (await import('spacetimedb')).setGlobalLogLevel('warn');
  type Connection = InstanceType<typeof DbConnection>;
  const open = async (): Promise<Connection> => {
    const built = await withTimeout('connect', new Promise<Connection>((resolvePromise, reject) => {
      DbConnection.builder().withUri(target.host).withDatabaseName(target.database).withToken(token)
        .onConnect(ready => resolvePromise(ready))
        .onConnectError((_context, error) => reject(new PipelineError('connect_failed', EXIT.failed, errorText(error))))
        .build();
    }), 30_000);
    try {
      await withTimeout('subscription', new Promise<void>((resolvePromise, reject) => {
        built.subscriptionBuilder()
          .onApplied(() => resolvePromise())
          .onError(context => reject(new PipelineError('subscription_failed', EXIT.failed, String(context.event))))
          .subscribe([tables.liveMapDocument, tables.contentHead, tables.contentDefinition, tables.worldChunkShadow, tables.worldChunkHead]);
      }), 120_000);
    } catch (error) { built.disconnect(); throw error; }
    return built;
  };
  let current: Connection | null = await open();
  const live = (): Connection => {
    if (current === null) throw new PipelineError('world_connection_suspended');
    return current;
  };
  const read = (): LiveState => {
    const db = live().db;
    const map = db.liveMapDocument.mapId.find(LIVE_ISLAND_MAP_ID);
    const head = db.contentHead.packId.find(LIVE_CONTENT_PACK_ID);
    const shadow = db.worldChunkShadow.spaceId.find(BigInt(TOPSIDE_SPACE_ID));
    return {
      mapRow: map === null || map === undefined ? null : { mapId: map.mapId, revision: map.revision, contentHash: map.contentHash, documentJson: map.documentJson },
      contentHead: head === null || head === undefined ? null : { revision: head.revision.toString(), contentHash: head.contentHash },
      contentRows: head === null || head === undefined ? null : [...db.contentDefinition.iter()]
        .map(row => ({ id: row.id, kind: row.kind, slug: row.slug, revision: row.revision.toString(), hash: row.hash, json: row.json }))
        .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
      shadow: shadow === null || shadow === undefined ? null : { revision: shadow.revision, mapId: shadow.mapId, contentHash: shadow.contentHash, manifestJson: shadow.manifestJson },
      heads: [...db.worldChunkHead.iter()].filter(row => row.spaceId === BigInt(TOPSIDE_SPACE_ID))
        .map(row => ({ cx: row.cx, cy: row.cy, contentHash: row.contentHash, revision: row.revision, byteLength: row.byteLength })),
    };
  };
  return {
    read,
    stageBlob: bytes => withTimeout('stage', live().reducers.stageWorldChunkBlob({ bytes }), 120_000),
    publishShadow: input => withTimeout('publish', live().reducers.publishWorldChunkShadow(input), 300_000),
    async settle(predicate, timeoutMs) {
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        const state = read();
        if (predicate(state) || Date.now() >= deadline) return state;
        await new Promise(resolvePromise => setTimeout(resolvePromise, 50));
      }
    },
    async suspend() { current?.disconnect(); current = null; },
    async resume() { current ??= await open(); },
    close: () => { current?.disconnect(); current = null; },
  };
}

export async function materializeInProcess(input: Parameters<MaterializePort>[0]): Promise<Candidate> {
  const { materializeWorldChunksFromRows } = await import('./materialize-world-chunks.js');
  const materialized = materializeWorldChunksFromRows({
    row: input.mapRow, contentRows: input.contentRows,
    atlasIndexSource: new TextDecoder('utf-8', { fatal: true }).decode(input.atlasIndex),
    assetRevision: worldChunkHash(input.atlasIndex),
  });
  const { manifest, blobs } = materialized.result;
  return {
    manifest, manifestJson: materialized.manifestJson, registryContentHash: materialized.registryContentHash,
    blobs: blobs.map((bytes, index) => ({ cx: manifest.chunks[index]!.cx, cy: manifest.chunks[index]!.cy, contentHash: manifest.chunks[index]!.contentHash, bytes })),
  };
}

// ---------------------------------------------------------------------------
// Command line.

export interface CliOptions {
  readonly command: 'plan' | 'publish' | 'check';
  readonly host: string;
  readonly database: string;
  readonly origin: string;
  readonly chunkDir: string | null;
  readonly report: string | null;
  readonly tokenFile: string;
  readonly tokenLabel: string | undefined;
  readonly confirm: string | undefined;
}

const USAGE = 'usage: WORLD_CHUNKS_TOKEN_FILE=PATH [WORLD_CHUNKS_TOKEN_LABEL=LABEL] world-chunks-publish [plan|publish|check] --host URL --database NAME --origin URL [--chunk-dir DIR] [--report FILE]';

export function parseCli(argv: readonly string[], env: Readonly<Record<string, string | undefined>>): CliOptions {
  const args = [...argv];
  const command = args[0] === 'plan' || args[0] === 'publish' || args[0] === 'check' ? args.shift() as CliOptions['command'] : 'plan';
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index]!, value = args[index + 1];
    if (/token|confirm/iu.test(flag)) throw new PipelineError('secrets_and_confirmations_come_from_the_environment', EXIT.usage);
    if (!['--host', '--database', '--origin', '--chunk-dir', '--report'].includes(flag) || value === undefined || value.startsWith('--') || values.has(flag)) throw new PipelineError('usage', EXIT.usage, USAGE);
    values.set(flag, value);
  }
  const host = values.get('--host'), database = values.get('--database'), origin = values.get('--origin');
  const tokenFile = env['WORLD_CHUNKS_TOKEN_FILE'];
  if (host === undefined || database === undefined || origin === undefined || tokenFile === undefined || tokenFile === '') throw new PipelineError('usage', EXIT.usage, USAGE);
  for (const url of [host, origin]) {
    let parsed: URL;
    try { parsed = new URL(url); } catch { throw new PipelineError('invalid_url', EXIT.usage, url); }
    if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || parsed.pathname !== '/' || parsed.search !== '' || parsed.username !== '' || parsed.password !== '') throw new PipelineError('invalid_url', EXIT.usage, url);
  }
  if (!/^[a-z0-9][a-z0-9-]{2,62}$/u.test(database)) throw new PipelineError('invalid_database', EXIT.usage);
  // The production database is only ever published from its canonical host, to its public origin.
  if (database === PRODUCTION_DATABASE && (new URL(host).origin !== PRODUCTION_HOST || new URL(origin).origin !== PRODUCTION_ORIGIN)) {
    throw new PipelineError('production_target_must_be_canonical', EXIT.usage, `${PRODUCTION_HOST} and ${PRODUCTION_ORIGIN}`);
  }
  const chunkDir = values.get('--chunk-dir') ?? (env['ORCHARD_WORLD_CHUNK_DIR'] || undefined) ?? null;
  if (command !== 'check' && (chunkDir === null || !isAbsolute(chunkDir))) throw new PipelineError('chunk_dir_required', EXIT.usage, 'pass an absolute --chunk-dir or ORCHARD_WORLD_CHUNK_DIR');
  const report = values.get('--report') ?? null;
  if (report !== null && !isAbsolute(report)) throw new PipelineError('report_path_must_be_absolute', EXIT.usage);
  return {
    command, host: new URL(host).origin, database, origin: new URL(origin).origin, chunkDir, report, tokenFile,
    tokenLabel: env['WORLD_CHUNKS_TOKEN_LABEL'] || undefined, confirm: env['WORLD_CHUNKS_PUBLISH_CONFIRM'] || undefined,
  };
}

export async function main(argv: readonly string[] = process.argv.slice(2), env: NodeJS.ProcessEnv = process.env): Promise<number> {
  const options = parseCli(argv, env);
  if (options.report !== null) {
    // Refuse an existing report before touching anything, not after publishing.
    const exists = await lstat(options.report).then(() => true, (error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return false;
      throw error;
    });
    if (exists) throw new PipelineError('report_exists', EXIT.usage, options.report);
  }
  const writeReport = async (value: unknown): Promise<void> => {
    if (options.report !== null) await writeFile(options.report, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  };
  const trace: PipelineTrace = { step: 'token' };
  let token: string | undefined;
  const log = (line: string): void => { console.error(`[world-chunks] ${redact(line, token)}`); };
  try {
    token = await readTokenFile(options.tokenFile, options.tokenLabel);
    trace.step = 'connect';
    const world = await connectWorld({ host: options.host, database: options.database }, token);
    try {
      const origin = httpOrigin(options.origin);
      if (options.command === 'check') {
        trace.step = 'check';
        const report = await checkPublishedHeads({ world, origin, registryContentHash: liveRegistryContentHash });
        await writeReport(report);
        console.log(JSON.stringify({ command: 'check', fresh: report.fresh, stale: report.stale, shadowRevision: report.shadowRevision, heads: report.heads,
          served: report.verify?.served ?? null, encodings: report.verify?.encodings ?? null, verifyError: report.verifyError === null ? null : redact(report.verifyError, token) }));
        return report.fresh ? EXIT.ok : EXIT.stale;
      }
      const report = await runPublishPipeline({ world, origin, store: fileChunkStore(options.chunkDir!), materialize: materializeInProcess, registryContentHash: liveRegistryContentHash, log },
        { mode: options.command, database: options.database, confirm: options.confirm }, trace);
      await writeReport(report);
      console.log(JSON.stringify({ command: options.command, outcome: report.outcome, manifestHash: report.manifestHash, confirmation: report.confirmation,
        chunks: report.chunks, bytes: report.bytes, before: report.before, install: report.install, served: report.verify?.served ?? null,
        encodings: report.verify?.encodings ?? null, staged: report.stage.staged, publish: report.publish }));
      return EXIT.ok;
    } finally {
      world.close();
    }
  } catch (error) {
    const failure = failureReport(options, trace, error, token);
    await writeReport(failure);
    console.error(`[world-chunks] ${options.command} failed at ${failure.step}: ${failure.error.message}`);
    return failure.error.exitCode;
  }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(code => process.exit(code), (error: unknown) => {
    console.error(`[world-chunks] ${errorText(error)}`);
    process.exit(error instanceof PipelineError ? error.exitCode : EXIT.unexpected);
  });
}
