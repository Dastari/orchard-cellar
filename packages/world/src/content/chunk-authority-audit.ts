import { SURVIVAL_WORLD_SIZE } from '@orchard/sim';
import { validateRuntimeManifest } from '@orchard/sim/chunk-runtime';
import { WORLD_CHUNK_SIZE, type WorldChunkManifest } from '@orchard/sim/world-chunk';
import {
  ChunkAuthorityDispatcher, flattenDisagreementSamples,
  type ChunkAuthorityLogger, type ChunkAuthoritySource, type ChunkAuthorityUnavailableReason,
  type CompiledCollisionRuntime,
} from './chunk-authority-dispatch.js';
import {
  assembleChunkLiveIslandRuntime, compareLiveIslandRuntime,
  type ChunkLiveIslandRuntime, type LiveIslandRuntimeDisagreement,
} from './chunk-authority-runtime.js';

/**
 * Static-world S2c: the owner `auditChunkAuthority` report, as a pure function of
 * read-only accessors so it can be tested without a host.
 *
 * It answers, for the currently pinned shadow publication, the questions the soak
 * and the activation gate ask:
 *
 * - Would `on` serve it? A fresh `ChunkAuthorityDispatcher.resolve()` over the same
 *   source the live dispatcher reads (so every guard and staleness check is the
 *   real one), timed as the cold chunk build.
 * - Is it complete? Every expected head and blob is present at the pinned revision.
 * - Does it agree with compiled? `compareLiveIslandRuntime` over the whole island,
 *   against a cold (uncached) compiled build, which is also timed.
 *
 * It never writes: every input is a read accessor. The chunk runtime it builds is
 * local and dropped when the call returns.
 *
 * The procedure reads its inputs in one short transaction (`snapshotChunkAuthorityTables`)
 * and runs this report outside it, over `chunkAuthoritySnapshotDb`: a read-only view of
 * the copied rows. A mutable transaction held for the multi-second compiled build would
 * stall every scheduled tick for that long.
 */

export const CHUNK_AUTHORITY_AUDIT_SCHEMA = 1;
export const CHUNK_AUTHORITY_AUDIT_SAMPLE_LIMIT = 32;
const LIST_LIMIT = 8;

export interface ChunkHeadView {
  readonly cx: number;
  readonly cy: number;
  readonly contentHash: string;
  readonly revision: number;
}

export interface ChunkAuthorityAuditClock {
  /** `performance`, `date`, or `none` when the host exposes no usable clock. */
  readonly label: 'performance' | 'date' | 'none';
  readonly now: () => number;
}

export interface ChunkAuthorityAuditInput {
  /** The current switch value (reported only; the audit behaves the same in every mode). */
  readonly mode: string;
  /** The live dispatcher's source (its `mode` is ignored: the audit always asks what `on` would do). */
  readonly source: Omit<ChunkAuthoritySource, 'mode'>;
  /** `world_chunk_head` rows for topside. */
  readonly heads: () => readonly ChunkHeadView[];
  /** A cold compiled build that bypasses (and does not disturb) the server's compiled cache. */
  readonly coldCompiled: () => CompiledCollisionRuntime | null;
  readonly clock: ChunkAuthorityAuditClock;
  readonly sampleLimit?: number;
  /** Compiled guard: the survival world dimensions. Tests may use a small island. */
  readonly worldSize?: { readonly width: number; readonly height: number };
  /** Extra diagnostics copied into the report (procedure-instance counters). */
  readonly instance?: Readonly<Record<string, unknown>>;
  /** Time spent copying the inputs inside the transaction, when the caller measured it. */
  readonly snapshotMs?: number | null;
}

export interface ChunkAuthorityAuditReport {
  readonly schema: typeof CHUNK_AUTHORITY_AUDIT_SCHEMA;
  /** True only when `on` would serve the publication, it is complete, and it agrees with compiled everywhere. */
  readonly ok: boolean;
  readonly mode: string;
  readonly keys: {
    readonly shadowRevision: number | null;
    readonly shadowMapId: string | null;
    readonly shadowContentHash: string | null;
    readonly manifestSourceRevision: number | null;
    readonly manifestSourceHash: string | null;
    readonly liveMapRevision: number | null;
    readonly liveMapHash: string | null;
    readonly registryContentHash: string;
    readonly chunkRuntimeKey: string | null;
    readonly compiledKey: string | null;
  };
  readonly completeness: {
    /** All expected heads and blobs present at the pinned revision, and the assembled runtime is complete. */
    readonly complete: boolean;
    readonly expectedChunks: number;
    readonly manifestChunks: number;
    readonly heads: { readonly rows: number; readonly atShadowRevision: number; readonly matchingManifest: number };
    readonly blobs: { readonly present: number; readonly missing: number; readonly missingSamples: readonly string[] };
    readonly runtimeComplete: boolean | null;
    readonly issueCount: number;
    readonly issues: readonly string[];
  };
  /** What `on` would do with this publication right now. */
  readonly servable: { readonly ok: boolean; readonly reason?: ChunkAuthorityUnavailableReason | 'compiled_null'; readonly detail?: string };
  readonly manifestError: string | null;
  readonly disagreements: {
    /** Whether the compare ran (it needs both runtimes). */
    readonly compared: boolean;
    readonly equal: boolean;
    /** Unbounded count across all fields; -1 when the compare did not run. */
    readonly count: number;
    readonly fields: Readonly<Record<string, number>>;
    readonly samples: readonly (LiveIslandRuntimeDisagreement & { readonly field: string })[];
  };
  readonly timings: {
    readonly clock: ChunkAuthorityAuditClock['label'];
    /** The transaction: copying the rows and blobs (the only part that holds a transaction). */
    readonly snapshotMs: number | null;
    /** Fresh `resolve()`: manifest parse and validation, guards, blob reads and assembly (what `on` pays cold). */
    readonly chunkBuildMs: number | null;
    /** Only when `on` refuses before assembling (stale, guard): the direct assembly used for the compare. */
    readonly diagnosticAssembleMs: number | null;
    readonly compiledBuildMs: number | null;
    readonly compareMs: number | null;
    readonly totalMs: number | null;
  };
  readonly stats: ChunkLiveIslandRuntime['stats'] | null;
  readonly instance?: Readonly<Record<string, unknown>>;
}

const silentLogger: ChunkAuthorityLogger = { info() {}, warn() {}, time() {}, timeEnd() {} };

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function elapsed(clock: ChunkAuthorityAuditClock, start: number): number | null {
  if (clock.label === 'none') return null;
  return Math.round((clock.now() - start) * 100) / 100;
}

export function runChunkAuthorityAudit(input: ChunkAuthorityAuditInput): ChunkAuthorityAuditReport {
  const { clock } = input;
  const limit = input.sampleLimit ?? CHUNK_AUTHORITY_AUDIT_SAMPLE_LIMIT;
  const worldSize = input.worldSize ?? { width: SURVIVAL_WORLD_SIZE, height: SURVIVAL_WORLD_SIZE };
  const started = clock.now();
  const shadow = input.source.shadow();
  const liveMap = input.source.liveMap();
  const registryContentHash = input.source.registryContentHash();

  // One read per blob for the whole audit: the resolve, the presence count and a
  // diagnostic assembly all share it. Dropped with the report.
  const blobs = new Map<string, Uint8Array | undefined>();
  const readBlob = (hash: string): Uint8Array | undefined => {
    if (!blobs.has(hash)) blobs.set(hash, input.source.readBlob(hash));
    return blobs.get(hash);
  };
  const source: ChunkAuthoritySource = { ...input.source, mode: 'on', readBlob };

  let manifest: WorldChunkManifest | null = null;
  let manifestError: string | null = null;
  if (shadow === null) manifestError = 'shadow_missing';
  else {
    try {
      manifest = validateRuntimeManifest(JSON.parse(shadow.manifestJson));
    } catch (error) {
      manifestError = message(error);
    }
  }

  // The exact `on` decision, from a fresh dispatcher (no cache, silent).
  const chunkStart = clock.now();
  const dispatcher = new ChunkAuthorityDispatcher({ logger: silentLogger, worldSize, sampleLimit: limit });
  let resolution: ReturnType<ChunkAuthorityDispatcher['resolve']>;
  try {
    resolution = dispatcher.resolve(source);
  } catch (error) {
    resolution = { ok: false, reason: 'assemble_failed', detail: message(error), key: 'unresolved' };
  }
  const chunkBuildMs = elapsed(clock, chunkStart);

  // When `on` refuses before (or after) assembling, still assemble directly so the
  // report can say where the chunks and compiled disagree.
  let runtime: ChunkLiveIslandRuntime | null = resolution.ok ? resolution.runtime : null;
  let diagnosticAssembleMs: number | null = null;
  if (runtime === null && manifest !== null && shadow !== null) {
    const assembleStart = clock.now();
    try {
      runtime = assembleChunkLiveIslandRuntime(manifest, readBlob, { contentHash: registryContentHash },
        { shadowRevision: shadow.revision, shadowContentHash: shadow.contentHash });
    } catch (error) {
      manifestError ??= `assemble: ${message(error)}`;
    }
    diagnosticAssembleMs = elapsed(clock, assembleStart);
  }

  const compiledStart = clock.now();
  const compiled = input.coldCompiled();
  const compiledBuildMs = elapsed(clock, compiledStart);

  let compareMs: number | null = null;
  let disagreements: ChunkAuthorityAuditReport['disagreements'] = { compared: false, equal: false, count: -1, fields: {}, samples: [] };
  if (runtime !== null && compiled !== null) {
    const compareStart = clock.now();
    const diff = compareLiveIslandRuntime(runtime, compiled, limit);
    compareMs = elapsed(clock, compareStart);
    disagreements = {
      compared: true,
      equal: diff.equal,
      count: diff.total,
      fields: Object.fromEntries(Object.entries(diff.fields).map(([field, entry]) => [field, entry.count])),
      samples: flattenDisagreementSamples(diff.fields, limit),
    };
  }

  // Completeness: expected grid, heads at the pinned revision matching the manifest, blobs present.
  const width = manifest?.width ?? worldSize.width, height = manifest?.height ?? worldSize.height;
  const expectedChunks = Math.ceil(width / WORLD_CHUNK_SIZE) * Math.ceil(height / WORLD_CHUNK_SIZE);
  const manifestHeads = new Map((manifest?.chunks ?? []).map(head => [`${head.cx}:${head.cy}`, head.contentHash]));
  const headRows = input.heads();
  const atShadowRevision = shadow === null ? 0 : headRows.filter(head => head.revision === shadow.revision).length;
  const matchingManifest = shadow === null ? 0 : headRows.filter(head => head.revision === shadow.revision
    && manifestHeads.get(`${head.cx}:${head.cy}`) === head.contentHash).length;
  const missingBlobs: string[] = [];
  let presentBlobs = 0;
  for (const hash of manifestHeads.values()) {
    if (readBlob(hash) === undefined) missingBlobs.push(hash); else presentBlobs += 1;
  }
  const issues = runtime?.issues ?? [];
  const complete = manifest !== null && manifestHeads.size === expectedChunks && matchingManifest === expectedChunks
    && headRows.length === expectedChunks && presentBlobs === expectedChunks && runtime?.complete === true;

  const servable: ChunkAuthorityAuditReport['servable'] = !resolution.ok
    ? { ok: false, reason: resolution.reason, ...(resolution.detail === undefined ? {} : { detail: resolution.detail }) }
    : compiled === null
      // `on` would serve chunks, but the live compiled guards reject the map: report it, never treat it as parity.
      ? { ok: false, reason: 'compiled_null', detail: 'the compiled runtime is null for the live map' }
      : { ok: true };

  const report: ChunkAuthorityAuditReport = {
    schema: CHUNK_AUTHORITY_AUDIT_SCHEMA,
    ok: servable.ok && complete && disagreements.compared && disagreements.equal,
    mode: input.mode,
    keys: {
      shadowRevision: shadow?.revision ?? null,
      shadowMapId: shadow?.mapId ?? null,
      shadowContentHash: shadow?.contentHash ?? null,
      manifestSourceRevision: manifest?.sourceRevision ?? null,
      manifestSourceHash: manifest?.sourceHash ?? null,
      liveMapRevision: liveMap?.revision ?? null,
      liveMapHash: liveMap?.contentHash ?? null,
      registryContentHash,
      chunkRuntimeKey: runtime?.key ?? null,
      compiledKey: compiled?.key ?? null,
    },
    completeness: {
      complete,
      expectedChunks,
      manifestChunks: manifestHeads.size,
      heads: { rows: headRows.length, atShadowRevision, matchingManifest },
      blobs: { present: presentBlobs, missing: missingBlobs.length, missingSamples: missingBlobs.slice(0, LIST_LIMIT) },
      runtimeComplete: runtime?.complete ?? null,
      issueCount: issues.length,
      issues: issues.slice(0, LIST_LIMIT).map(issue => `${issue.kind}${issue.cx === undefined ? '' : `@${issue.cx},${issue.cy}`}${issue.detail === undefined ? '' : `:${issue.detail}`}`),
    },
    servable,
    manifestError,
    disagreements,
    timings: { clock: clock.label, snapshotMs: input.snapshotMs ?? null, chunkBuildMs, diagnosticAssembleMs, compiledBuildMs, compareMs, totalMs: elapsed(clock, started) },
    stats: runtime?.stats ?? null,
    ...(input.instance === undefined ? {} : { instance: input.instance }),
  };
  return report;
}

/** The host clock: `performance.now()` when present, else `Date.now()`, else none. */
export function chunkAuthorityAuditClock(scope: { readonly performance?: { now?: unknown }; readonly Date?: { now?: unknown } } = globalThis as never): ChunkAuthorityAuditClock {
  const performanceNow = scope.performance?.now;
  if (typeof performanceNow === 'function') return { label: 'performance', now: () => (performanceNow as () => number).call(scope.performance) };
  const dateNow = scope.Date?.now;
  if (typeof dateNow === 'function') return { label: 'date', now: () => (dateNow as () => number).call(scope.Date) };
  return { label: 'none', now: () => 0 };
}

// --- Snapshot: the only part of the audit that holds a transaction -------------------------------

interface SnapshotRowSource {
  readonly db: {
    readonly live_map_document: { readonly mapId: { find(mapId: string): unknown } };
    readonly content_head: { readonly packId: { find(packId: string): unknown } };
    readonly content_definition: { iter(): Iterable<unknown> };
    readonly world_chunk_shadow: { readonly spaceId: { find(spaceId: bigint): { readonly manifestJson: string } | null } };
    readonly world_chunk_head: { readonly by_space: { filter(spaceId: bigint): Iterable<{ readonly contentHash: string }> } };
    readonly world_chunk_blob: { readonly contentHash: { find(contentHash: string): { readonly contentHash: string; readonly bytes: unknown } | null } };
  };
}

/** Rows copied out of one transaction. Blobs are the ones the heads and the manifest name. */
export interface ChunkAuthorityTableSnapshot {
  readonly liveMapId: string;
  readonly contentPackId: string;
  readonly spaceId: bigint;
  readonly liveMap: unknown;
  readonly contentHead: unknown;
  readonly contentDefinitions: readonly unknown[];
  readonly shadow: { readonly manifestJson: string } | null;
  readonly heads: readonly { readonly contentHash: string }[];
  readonly blobs: ReadonlyMap<string, { readonly contentHash: string; readonly bytes: unknown }>;
  /** Every blob hash looked up inside the transaction, found or not. Only these may be asked for later. */
  readonly requestedBlobHashes: ReadonlySet<string>;
}

/** Copies every row the audit reads (call inside the transaction; everything else runs outside it). */
export function snapshotChunkAuthorityTables(tx: SnapshotRowSource,
  ids: { readonly liveMapId: string; readonly contentPackId: string; readonly spaceId: bigint }): ChunkAuthorityTableSnapshot {
  const shadow = tx.db.world_chunk_shadow.spaceId.find(ids.spaceId);
  const heads = [...tx.db.world_chunk_head.by_space.filter(ids.spaceId)];
  const hashes = new Set(heads.map(head => head.contentHash));
  if (shadow !== null) {
    try {
      const chunks = (JSON.parse(shadow.manifestJson) as { chunks?: unknown }).chunks;
      if (Array.isArray(chunks)) {
        for (const head of chunks) {
          const hash = (head as { contentHash?: unknown } | null)?.contentHash;
          if (typeof hash === 'string') hashes.add(hash);
        }
      }
    } catch {
      // The report parses the manifest again and says why it is invalid.
    }
  }
  const blobs = new Map<string, { readonly contentHash: string; readonly bytes: unknown }>();
  for (const hash of hashes) {
    const row = tx.db.world_chunk_blob.contentHash.find(hash);
    if (row !== null) blobs.set(hash, row);
  }
  return {
    ...ids,
    liveMap: tx.db.live_map_document.mapId.find(ids.liveMapId),
    contentHead: tx.db.content_head.packId.find(ids.contentPackId),
    contentDefinitions: [...tx.db.content_definition.iter()],
    shadow,
    heads,
    blobs,
    requestedBlobHashes: hashes,
  };
}

export class ChunkAuthoritySnapshotError extends Error {}

/**
 * The reducer-context stand-in the audit's builds receive: only `db` (the snapshot view).
 * Any other member (`sender`, `timestamp`, `senderAuth`, ...) throws, so a build that needs
 * more than the copied rows fails loudly instead of reading undefined.
 */
export function chunkAuthoritySnapshotContext(snapshot: ChunkAuthorityTableSnapshot): unknown {
  const db = chunkAuthoritySnapshotDb(snapshot);
  return new Proxy({ db }, {
    get(target, name) {
      if (typeof name !== 'string') return undefined;
      if (name !== 'db') throw new ChunkAuthoritySnapshotError(`audit_snapshot_context:${name}`);
      return target.db;
    },
    set() { throw new ChunkAuthoritySnapshotError('audit_snapshot_read_only'); },
  });
}

/**
 * A read-only `db` over a snapshot, shaped like the tables the audit reads. Anything
 * else (another table, another key, any write) throws, so an audit that reached
 * outside its snapshot fails loudly instead of reading nothing.
 */
export function chunkAuthoritySnapshotDb(snapshot: ChunkAuthorityTableSnapshot): unknown {
  const keyed = (table: string, key: string, expected: unknown, value: unknown) => ({
    [key]: {
      find(requested: unknown) {
        if (requested !== expected) throw new ChunkAuthoritySnapshotError(`audit_snapshot_key:${table}.${key}=${String(requested)}`);
        return value ?? null;
      },
    },
  });
  const tables: Record<string, unknown> = {
    live_map_document: keyed('live_map_document', 'mapId', snapshot.liveMapId, snapshot.liveMap),
    content_head: keyed('content_head', 'packId', snapshot.contentPackId, snapshot.contentHead),
    content_definition: { iter: () => snapshot.contentDefinitions[Symbol.iterator]() },
    world_chunk_shadow: keyed('world_chunk_shadow', 'spaceId', snapshot.spaceId, snapshot.shadow),
    world_chunk_head: {
      by_space: {
        filter(spaceId: unknown) {
          if (spaceId !== snapshot.spaceId) throw new ChunkAuthoritySnapshotError(`audit_snapshot_key:world_chunk_head.by_space=${String(spaceId)}`);
          return snapshot.heads[Symbol.iterator]();
        },
      },
    },
    world_chunk_blob: {
      contentHash: {
        // Null only for a hash that was looked up in the transaction and absent there; a hash
        // that was never copied throws rather than looking like a missing blob.
        find(hash: unknown) {
          if (typeof hash !== 'string' || !snapshot.requestedBlobHashes.has(hash)) {
            throw new ChunkAuthoritySnapshotError(`audit_snapshot_key:world_chunk_blob.contentHash=${String(hash)}`);
          }
          return snapshot.blobs.get(hash) ?? null;
        },
      },
    },
  };
  return new Proxy(tables, {
    get(target, name) {
      if (typeof name !== 'string') return undefined;
      if (!(name in target)) throw new ChunkAuthoritySnapshotError(`audit_snapshot_table:${name}`);
      return target[name];
    },
    set() { throw new ChunkAuthoritySnapshotError('audit_snapshot_read_only'); },
  });
}
