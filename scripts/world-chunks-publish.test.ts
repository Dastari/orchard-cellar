import { chmod, lstat, mkdir, mkdtemp, readdir, readFile, rm, stat, symlink, unlink, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { brotliDecompressSync, gunzipSync } from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';
import { bootstrapContentRegistry, bootstrapContentRows, contentDefinitionRowsHash } from '@orchard/sim';
import { createWorldChunkMiddleware } from '../packages/client/world-chunk-serving.js';
import { canonicalChunkJson, decodeWorldChunk, encodeWorldChunk, worldChunkHash, WORLD_CHUNK_STRIDE, type WorldChunkManifest } from '../packages/sim/src/world-chunk.js';
import {
  EXIT, PipelineError, checkPublishedHeads, checkServedBlob, failureReport, fileChunkStore, httpOrigin, isPublished, liveRegistryContentHash, main,
  parseCli, publishConfirmation, readTokenFile, redact, runPublishPipeline, sha256Hex, verifyServed, type ContentRow, type PipelineTrace,
  type Candidate, type ChunkStorePort, type LiveMapRow, type LiveState, type OriginPort, type PipelineDeps, type ServedBlob, type ShadowPublication, type WorldPort,
} from './world-chunks-publish.js';

const directories: string[] = [];
async function temporary(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'orchard-chunks-publish-'));
  directories.push(directory);
  return directory;
}
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))); });

const CELLS = WORLD_CHUNK_STRIDE ** 2;
const DATABASE = 'orchard-chunks-test';
const ATLAS = new TextEncoder().encode('{"assetPacks":{"tree":"nature"}}');
const REGISTRY_HASH = '93a4eada';
/** content_head.contentHash is the raw rows hash; it differs from the registry hash the CAS uses. */
const ROWS_HASH = 'bcab1a8e';

function mapRow(revision = 7): LiveMapRow {
  return { mapId: 'live-island', revision, contentHash: `map-hash-${revision}`, documentJson: '{}' };
}

/** A small but real candidate (4 decodable chunks) for these rows and this atlas. */
function candidateFor(map: LiveMapRow, atlas: Uint8Array, contentHash = REGISTRY_HASH): Candidate {
  const assetRevision = worldChunkHash(atlas);
  const coords = [[0, 0], [1, 0], [0, 1], [1, 1]] as const;
  const blobs = coords.map(([cx, cy]) => encodeWorldChunk({
    schema: 1, mediumSchema: 1, spaceId: 0, cx, cy, assetRevision,
    arrays: { medium: new Uint8Array(CELLS).fill(map.revision % 2), solidBlocked: new Uint8Array(CELLS) },
    records: [], assetIds: [], atlasPackIds: [],
  }));
  const manifest: WorldChunkManifest = {
    schema: 1, chunkSize: 64, spaceId: 0, width: 128, height: 128, assetRevision,
    sourceRevision: map.revision, sourceHash: map.contentHash, metadata: { note: 'test' },
    chunks: blobs.map(bytes => { const chunk = decodeWorldChunk(bytes); return { cx: chunk.cx, cy: chunk.cy, contentHash: chunk.contentHash, byteLength: bytes.length }; }),
  };
  return {
    manifest, manifestJson: `${canonicalChunkJson(manifest)}\n`, registryContentHash: contentHash,
    blobs: blobs.map((bytes, index) => ({ cx: coords[index]![0], cy: coords[index]![1], contentHash: manifest.chunks[index]!.contentHash, bytes })),
  };
}

type Events = string[];

/** Server semantics of stageWorldChunkBlob and publishWorldChunkShadow, with failure hooks. */
class FakeWorld implements WorldPort {
  state: LiveState;
  readonly staged = new Map<string, Uint8Array>();
  stageCalls = 0;
  publishCalls = 0;
  failStageAt: number | null = null;
  /** Runs inside publishShadow before the CAS (a concurrent writer). */
  beforePublish: ((world: FakeWorld) => void) | null = null;
  /** Apply the publication, then report failure (a lost response). */
  loseResponse = false;
  /** Reject without changing anything. */
  rejectPublish = false;
  /** Apply the publication but never show it (the subscription stalls). */
  hideRows = false;
  constructor(readonly events: Events, map: LiveMapRow | null = mapRow()) {
    this.state = { mapRow: map, contentHead: { revision: '4', contentHash: ROWS_HASH }, contentRows: [], shadow: null, heads: [] };
  }
  #visible: LiveState | null = null;
  /** The server's `contentRegistry(ctx).contentHash` for the current rows. */
  registryHash = REGISTRY_HASH;
  serverRegistryHash(): string { return this.state.contentRows === null ? 'bootstrap' : this.registryHash; }
  read(): LiveState {
    if (this.suspended) throw new Error('read while suspended');
    return this.#visible ?? this.state;
  }
  reveal(): void { this.#visible = null; }
  async stageBlob(bytes: Uint8Array): Promise<void> {
    if (this.suspended) throw new Error('stage while suspended');
    this.stageCalls += 1;
    if (this.failStageAt !== null && this.stageCalls === this.failStageAt) throw new Error('stage transport failed');
    this.events.push('stage');
    const hash = decodeWorldChunk(bytes).contentHash;
    if (!this.staged.has(hash)) this.staged.set(hash, bytes);
  }
  async publishShadow(input: ShadowPublication): Promise<void> {
    if (this.suspended) throw new Error('publish while suspended');
    this.publishCalls += 1;
    this.beforePublish?.(this);
    if (this.rejectPublish) throw new Error('fatal error');
    const manifest = JSON.parse(input.manifestJson) as WorldChunkManifest;
    const current = this.state;
    if (input.expectedRevision !== (current.shadow?.revision ?? 0)) throw new Error('fatal error'); // production: plain Error, no code
    if (current.mapRow === null || manifest.sourceRevision !== current.mapRow.revision || manifest.sourceHash !== current.mapRow.contentHash
      || input.contentHash !== this.serverRegistryHash()) throw new Error('fatal error');
    if (manifest.chunks.some(head => !this.staged.has(head.contentHash))) throw new Error('fatal error');
    const revision = input.expectedRevision + 1;
    if (this.hideRows) this.#visible = current;
    this.state = { ...current, shadow: { revision, mapId: input.mapId, contentHash: input.contentHash, manifestJson: input.manifestJson },
      heads: manifest.chunks.map(head => ({ cx: head.cx, cy: head.cy, contentHash: head.contentHash, revision, byteLength: head.byteLength })) };
    this.events.push('publish');
    if (this.loseResponse) throw new Error('connection reset');
  }
  async settle(predicate: (state: LiveState) => boolean): Promise<LiveState> { const state = this.read(); predicate(state); return state; }
  suspended = false;
  async suspend(): Promise<void> { this.suspended = true; this.events.push('suspend'); }
  async resume(): Promise<void> { this.suspended = false; this.events.push('resume'); }
  /** Another publisher writes this candidate at the next revision. */
  publishOther(candidate: Candidate): void {
    const revision = (this.state.shadow?.revision ?? 0) + 1;
    this.state = { ...this.state, shadow: { revision, mapId: 'live-island', contentHash: candidate.registryContentHash, manifestJson: candidate.manifestJson },
      heads: candidate.manifest.chunks.map(head => ({ ...head, revision })) };
  }
}

class FakeStore implements ChunkStorePort {
  readonly files = new Map<string, Uint8Array>();
  failInstallAt: number | null = null;
  installCalls = 0;
  constructor(readonly events: Events) {}
  async status(spaceId: number, hash: string) { return this.files.has(`${spaceId}/${hash}`) ? 'present' as const : 'missing' as const; }
  async install(spaceId: number, hash: string, bytes: Uint8Array) {
    this.installCalls += 1;
    if (this.failInstallAt !== null && this.installCalls === this.failInstallAt) throw new Error('disk full');
    if (this.files.has(`${spaceId}/${hash}`)) return 'present' as const;
    this.events.push('install');
    this.files.set(`${spaceId}/${hash}`, bytes);
    return 'installed' as const;
  }
}

class FakeOrigin implements OriginPort {
  readonly origin = 'https://origin.test';
  atlas = ATLAS;
  down = new Set<string>();
  corrupt = new Set<string>();
  missingStatus = 404;
  fetches = 0;
  constructor(readonly store: FakeStore, readonly events: Events) {}
  async atlasIndex() { return this.atlas; }
  async blob(spaceId: number, hash: string): Promise<ServedBlob> {
    this.fetches += 1;
    this.events.push('verify');
    const bytes = this.store.files.get(`${spaceId}/${hash}`);
    if (bytes === undefined || this.down.has(hash)) return { status: this.missingStatus === 404 || bytes !== undefined ? 404 : this.missingStatus, contentType: 'text/plain', cacheControl: 'no-store', encoding: 'identity', bytes: new Uint8Array() };
    const served = this.corrupt.has(hash) ? Uint8Array.from(bytes, (value, index) => index === bytes.length - 1 ? value ^ 1 : value) : bytes;
    return { status: 200, contentType: 'application/octet-stream', cacheControl: 'public, max-age=31536000, immutable', encoding: 'br', bytes: served };
  }
}

function harness(map: LiveMapRow | null = mapRow()) {
  const events: Events = [];
  const world = new FakeWorld(events, map);
  const store = new FakeStore(events);
  const origin = new FakeOrigin(store, events);
  let materializeCalls = 0;
  let materializeError: Error | null = null;
  let duringMaterialize: (() => void) | null = null;
  const deps: PipelineDeps = {
    world, store, origin, observeTimeoutMs: 10,
    registryContentHash: rows => (rows === null ? 'bootstrap' : world.registryHash),
    materialize: async input => {
      materializeCalls += 1;
      // The connection is closed while the CPU-bound materialisation runs.
      expect(world.suspended).toBe(true);
      duringMaterialize?.();
      if (materializeError !== null) throw materializeError;
      return candidateFor(input.mapRow, input.atlasIndex);
    },
  };
  return {
    events, world, store, origin, deps,
    get materializeCalls() { return materializeCalls; },
    failMaterialize(error: Error | null) { materializeError = error; },
    whileMaterializing(action: (() => void) | null) { duringMaterialize = action; },
    confirm: () => publishConfirmation(candidateFor(world.state.mapRow!, origin.atlas).manifestJson, REGISTRY_HASH, DATABASE),
  };
}

async function expectPipelineError(promise: Promise<unknown>, code: string, exitCode: number): Promise<void> {
  const error = await promise.then(() => null, (caught: unknown) => caught);
  expect(error).toBeInstanceOf(PipelineError);
  expect((error as PipelineError).code).toBe(code);
  expect((error as PipelineError).exitCode).toBe(exitCode);
}

describe('world chunk publish pipeline', () => {
  it('is a dry run by default: it reports the confirmation but makes no write and no reducer call', async () => {
    const h = harness();
    const report = await runPublishPipeline(h.deps, { mode: 'plan', database: DATABASE });
    const candidate = candidateFor(mapRow(), ATLAS);
    expect(report).toMatchObject({ outcome: 'planned', chunks: 4, manifestHash: sha256Hex(candidate.manifestJson),
      confirmation: `publish:${sha256Hex(candidate.manifestJson)}:${REGISTRY_HASH}:${DATABASE}`, before: { shadowRevision: null, stale: ['unpublished'], alreadyPublished: false },
      install: { missing: 4, present: 0 }, publish: null });
    expect(h.store.installCalls).toBe(0);
    expect(h.store.files.size).toBe(0);
    expect(h.world.stageCalls + h.world.publishCalls).toBe(0);
    expect(h.origin.fetches).toBe(0);

    // With the real chunk directory too: the dry run does not even create it.
    const root = join(await temporary(), 'chunks');
    await runPublishPipeline({ ...h.deps, store: fileChunkStore(root) }, { mode: 'plan', database: DATABASE });
    await expect(lstat(root)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('refuses to publish without the exact confirmation, before any write', async () => {
    const h = harness();
    const unbound = `publish:${sha256Hex(candidateFor(mapRow(), ATLAS).manifestJson)}:${DATABASE}`;
    for (const confirm of [undefined, 'publish', unbound, `publish:${'0'.repeat(64)}:${REGISTRY_HASH}:${DATABASE}`, h.confirm().replace(DATABASE, 'orchard-cellar-world'),
      h.confirm().replace(REGISTRY_HASH, ROWS_HASH)]) {
      const error = await runPublishPipeline(h.deps, { mode: 'publish', database: DATABASE, confirm }).catch((caught: unknown) => caught);
      expect(error).toMatchObject({ code: 'world_chunks_confirmation_required', exitCode: EXIT.confirm });
      expect((error as Error).message).toContain(h.confirm());
    }
    expect(h.store.installCalls + h.world.stageCalls + h.world.publishCalls).toBe(0);
  });

  it('installs, verifies over the origin, stages, then CAS-publishes the heads, in that order', async () => {
    const h = harness();
    const report = await runPublishPipeline(h.deps, { mode: 'publish', database: DATABASE, confirm: h.confirm() });
    expect(report).toMatchObject({ outcome: 'published', install: { installed: 4, present: 0 }, verify: { served: 4, encodings: { br: 4 } },
      stage: { staged: 4, skipped: false }, publish: { expectedRevision: 0, revision: 1, recovered: false } });
    const last = (name: string) => h.events.lastIndexOf(name), first = (name: string) => h.events.indexOf(name);
    expect(first('suspend')).toBeLessThan(last('resume'));
    expect(last('resume')).toBeLessThan(first('install'));
    expect(last('install')).toBeLessThan(first('verify'));
    expect(last('verify')).toBeLessThan(first('stage'));
    expect(last('stage')).toBeLessThan(first('publish'));
    expect(isPublished(h.world.state, candidateFor(mapRow(), ATLAS))).toBe(true);
    expect(h.world.state.heads.every(head => head.revision === 1)).toBe(true);
  });

  it('is idempotent: a second run changes nothing and calls no reducer', async () => {
    const h = harness();
    await runPublishPipeline(h.deps, { mode: 'publish', database: DATABASE, confirm: h.confirm() });
    const stageCalls = h.world.stageCalls;
    const report = await runPublishPipeline(h.deps, { mode: 'publish', database: DATABASE, confirm: h.confirm() });
    expect(report).toMatchObject({ outcome: 'unchanged', before: { alreadyPublished: true, stale: [] }, install: { installed: 0, present: 4 },
      stage: { staged: 0, skipped: true }, publish: null });
    expect(h.world.stageCalls).toBe(stageCalls);
    expect(h.world.publishCalls).toBe(1);
    expect(h.world.state.shadow?.revision).toBe(1);
  });

  it('a re-run completes after a failure at every step', async () => {
    const publish = (h: ReturnType<typeof harness>) => runPublishPipeline(h.deps, { mode: 'publish', database: DATABASE, confirm: h.confirm() });

    // 1. Materialisation fails: nothing is written.
    let h = harness();
    h.failMaterialize(new Error('parity failed'));
    await expect(publish(h)).rejects.toThrow('parity failed');
    expect(h.store.installCalls + h.world.stageCalls + h.world.publishCalls).toBe(0);
    h.failMaterialize(null);
    expect((await publish(h)).outcome).toBe('published');

    // 2. Install fails half way: no stage, no publish; the re-run keeps what was installed.
    h = harness();
    h.store.failInstallAt = 3;
    await expect(publish(h)).rejects.toThrow('disk full');
    expect(h.store.files.size).toBe(2);
    expect(h.world.stageCalls + h.world.publishCalls).toBe(0);
    h.store.failInstallAt = null;
    expect(await publish(h)).toMatchObject({ outcome: 'published', install: { installed: 2, present: 2 } });

    // 3. The origin does not serve a blob (or serves corrupt bytes): never staged or published.
    h = harness();
    const [first, second] = candidateFor(mapRow(), ATLAS).manifest.chunks;
    h.origin.down.add(first!.contentHash);
    h.origin.corrupt.add(second!.contentHash);
    await expectPipelineError(publish(h), 'origin_blob_not_served', EXIT.failed);
    expect(h.world.stageCalls + h.world.publishCalls).toBe(0);
    h.origin.down.clear(); h.origin.corrupt.clear();
    expect((await publish(h)).outcome).toBe('published');

    // 4. Staging fails part way: heads untouched; the re-run stages again (the server keeps first copies).
    h = harness();
    h.world.failStageAt = 3;
    await expectPipelineError(publish(h), 'stage_failed', EXIT.failed);
    expect(h.world.publishCalls).toBe(0);
    expect(h.world.state.shadow).toBeNull();
    h.world.failStageAt = null;
    expect(await publish(h)).toMatchObject({ outcome: 'published', stage: { staged: 4 }, publish: { revision: 1 } });

    // 5. The publish applied but the response was lost: recovered from state, not retried.
    h = harness();
    h.world.loseResponse = true;
    expect(await publish(h)).toMatchObject({ outcome: 'published', publish: { revision: 1, recovered: true } });
    expect(h.world.publishCalls).toBe(1);

    // 6. The publish applied but its rows were not observed in time: the re-run sees them and stops.
    h = harness();
    h.world.hideRows = true;
    await expectPipelineError(publish(h), 'publish_not_observed', EXIT.failed);
    h.world.hideRows = false;
    h.world.reveal();
    expect(await publish(h)).toMatchObject({ outcome: 'unchanged', publish: null });
    expect(h.world.publishCalls).toBe(1);
  });

  it('treats a lost CAS race as a conflict to re-run, never overwriting the winner', async () => {
    const h = harness();
    const other = candidateFor(mapRow(), ATLAS, REGISTRY_HASH);
    const rival = { ...other, manifest: { ...other.manifest, metadata: { note: 'other publisher' } } };
    const rivalCandidate = { ...rival, manifestJson: `${canonicalChunkJson(rival.manifest)}\n` };
    h.world.beforePublish = world => { world.publishOther(rivalCandidate); world.beforePublish = null; };
    await expectPipelineError(runPublishPipeline(h.deps, { mode: 'publish', database: DATABASE, confirm: h.confirm() }), 'cas_conflict', EXIT.retry);
    expect(h.world.state.shadow).toMatchObject({ revision: 1, manifestJson: rivalCandidate.manifestJson });

    // The re-run publishes on top of the winner's revision.
    const report = await runPublishPipeline(h.deps, { mode: 'publish', database: DATABASE, confirm: h.confirm() });
    expect(report).toMatchObject({ outcome: 'published', before: { shadowRevision: 1, stale: [] }, publish: { expectedRevision: 1, revision: 2 } });
  });

  it('stops when the live map changes under it, and reports other rejections as failures', async () => {
    let h = harness();
    h.world.beforePublish = world => { world.state = { ...world.state, mapRow: mapRow(8) }; };
    await expectPipelineError(runPublishPipeline(h.deps, { mode: 'publish', database: DATABASE, confirm: h.confirm() }), 'source_changed', EXIT.retry);
    expect(h.world.state.shadow).toBeNull();
    h.world.beforePublish = null;
    // The re-run materialises the new revision, which needs its own confirmation.
    await expectPipelineError(runPublishPipeline(h.deps, { mode: 'publish', database: DATABASE, confirm: publishConfirmation(candidateFor(mapRow(7), ATLAS).manifestJson, REGISTRY_HASH, DATABASE) }),
      'world_chunks_confirmation_required', EXIT.confirm);
    expect((await runPublishPipeline(h.deps, { mode: 'publish', database: DATABASE, confirm: h.confirm() })).publish?.revision).toBe(1);

    // The map moves while the connection is closed for materialisation.
    h = harness();
    const confirm = h.confirm();
    h.whileMaterializing(() => { h.world.state = { ...h.world.state, mapRow: mapRow(9) }; });
    await expectPipelineError(runPublishPipeline(h.deps, { mode: 'publish', database: DATABASE, confirm }), 'source_changed', EXIT.retry);
    expect(h.store.installCalls + h.world.stageCalls).toBe(0);

    h = harness();
    h.world.rejectPublish = true;
    await expectPipelineError(runPublishPipeline(h.deps, { mode: 'publish', database: DATABASE, confirm: h.confirm() }), 'publish_rejected', EXIT.failed);
  });

  it('refuses a candidate that does not match the live rows or the served assets', async () => {
    const h = harness();
    const good = h.deps.materialize;
    await expectPipelineError(runPublishPipeline({ ...h.deps, materialize: async input => candidateFor(mapRow(6), input.atlasIndex) }, { mode: 'plan', database: DATABASE }),
      'candidate_map_source_mismatch', EXIT.failed);
    await expectPipelineError(runPublishPipeline({ ...h.deps, materialize: async input => candidateFor(input.mapRow, input.atlasIndex, 'd'.repeat(64)) }, { mode: 'plan', database: DATABASE }),
      'candidate_content_hash_mismatch', EXIT.failed);
    await expectPipelineError(runPublishPipeline({ ...h.deps, materialize: async input => candidateFor(input.mapRow, new Uint8Array([1])) }, { mode: 'plan', database: DATABASE }),
      'candidate_asset_revision_mismatch', EXIT.failed);
    // The served atlas changes between materialising and verifying: re-run.
    const confirm = h.confirm();
    await expectPipelineError(runPublishPipeline({ ...h.deps, materialize: async input => { const result = await good(input); h.origin.atlas = new Uint8Array([9]); return result; } },
      { mode: 'publish', database: DATABASE, confirm }), 'origin_asset_revision_changed', EXIT.retry);
    expect(h.world.stageCalls).toBe(0);
    await expectPipelineError(runPublishPipeline(harness(null).deps, { mode: 'plan', database: DATABASE }), 'live_map_row_missing', EXIT.failed);
  });

  it('the release check reports stale heads as a failure and never changes the world', async () => {
    const h = harness();
    const check = () => checkPublishedHeads({ world: h.world, origin: h.origin, registryContentHash: h.deps.registryContentHash });
    expect(await check()).toMatchObject({ fresh: false, stale: ['unpublished'], verify: null });
    await runPublishPipeline(h.deps, { mode: 'publish', database: DATABASE, confirm: h.confirm() });
    expect(await check()).toMatchObject({ fresh: true, stale: [], shadowRevision: 1, verify: { served: 4 } });

    const published = h.world.state;
    h.world.state = { ...published, mapRow: mapRow(8) };
    expect((await check()).stale).toEqual(['map']);
    h.world.registryHash = 'e'.repeat(64);
    h.world.state = { ...published, contentHead: { revision: '5', contentHash: 'f'.repeat(8) } };
    expect((await check()).stale).toEqual(['content']);
    h.world.registryHash = REGISTRY_HASH;
    h.world.state = { ...published, contentHead: null, contentRows: null };
    expect((await check()).stale).toEqual(['content']); // compared with the bootstrap registry hash
    // The rows hash in content_head alone moving (same registry) is not staleness.
    h.world.state = { ...published, contentHead: { revision: '5', contentHash: 'f'.repeat(8) } };
    expect((await check()).stale).toEqual([]);
    h.world.state = published;
    h.origin.atlas = new Uint8Array([7]);
    expect((await check()).stale).toEqual(['asset']);
    h.origin.atlas = ATLAS;
    h.origin.down.add(published.heads[2]!.contentHash);
    const unserved = await check();
    expect(unserved).toMatchObject({ fresh: false, stale: ['heads'] });
    expect(unserved.verifyError).toContain('origin_blob_not_served');
    h.origin.down.clear();
    h.world.state = { ...published, heads: published.heads.slice(1) };
    expect((await check()).stale).toEqual(['heads']);
    // Nothing is ever removed or disabled: the heads and blobs stay exactly as published.
    expect(h.world.publishCalls).toBe(1);
    expect(h.world.stageCalls).toBe(4);
    expect(h.store.files.size).toBe(4);
  });

  it('checks each served blob and requires a real 404 for a missing one', async () => {
    const { blobs, manifest } = candidateFor(mapRow(), ATLAS);
    const head = manifest.chunks[0]!;
    const ok: ServedBlob = { status: 200, contentType: 'application/octet-stream', cacheControl: 'public, max-age=31536000, immutable', encoding: 'gzip', bytes: blobs[0]!.bytes };
    expect(checkServedBlob(ok, 0, head)).toBeNull();
    expect(checkServedBlob({ ...ok, status: 404 }, 0, head)).toBe('status 404');
    expect(checkServedBlob({ ...ok, contentType: 'text/html' }, 0, head)).toContain('content type');
    expect(checkServedBlob({ ...ok, cacheControl: 'no-cache' }, 0, head)).toBe('not immutable');
    expect(checkServedBlob({ ...ok, bytes: ok.bytes.subarray(1) }, 0, head)).toContain('length');
    expect(checkServedBlob({ ...ok, bytes: blobs[1]!.bytes }, 0, { ...head, byteLength: blobs[1]!.bytes.length })).toContain('decode');
    expect(checkServedBlob(ok, 3, head)).toBe('space mismatch');
    const h = harness();
    for (const blob of blobs) await h.store.install(0, blob.contentHash, blob.bytes);
    h.origin.missingStatus = 200; // an SPA fallback would answer 200 for anything
    await expectPipelineError(verifyServed(h.origin, 0, manifest.chunks), 'origin_missing_blob_not_404', EXIT.failed);
  });
});

describe('chunk directory', () => {
  it('installs content-addressed blobs with siblings, additively, and never overwrites', async () => {
    const root = join(await temporary(), 'world-chunks');
    const store = fileChunkStore(root);
    const [first, second] = candidateFor(mapRow(), ATLAS).blobs;
    expect(await store.status(0, first!.contentHash)).toBe('missing');
    expect(await store.install(0, first!.contentHash, first!.bytes)).toBe('installed');
    expect(await store.install(0, first!.contentHash, first!.bytes)).toBe('present');
    expect(await store.status(0, first!.contentHash)).toBe('present');
    const base = join(root, '0', `${first!.contentHash}.bin`);
    expect(new Uint8Array(await readFile(base))).toEqual(first!.bytes);
    expect(new Uint8Array(brotliDecompressSync(await readFile(`${base}.br`)))).toEqual(first!.bytes);
    expect(new Uint8Array(gunzipSync(await readFile(`${base}.gz`)))).toEqual(first!.bytes);
    expect((await stat(base)).mode & 0o777).toBe(0o644);
    expect((await readdir(join(root, '0'))).filter(name => name.endsWith('.tmp'))).toEqual([]);

    // A partial install (identity missing) is completed; the server serves nothing until then.
    await rm(base);
    expect(await store.status(0, first!.contentHash)).toBe('incomplete');
    expect(await store.install(0, first!.contentHash, first!.bytes)).toBe('installed');

    // A different file under the address is a conflict, never rewritten.
    await writeFile(`${base}.gz`, 'not gzip');
    await expectPipelineError(store.install(0, first!.contentHash, first!.bytes), 'chunk_dir_blob_conflict', EXIT.failed);
    expect(await readFile(`${base}.gz`, 'utf8')).toBe('not gzip');

    // A symlink planted at a blob path is refused, and so are bytes that do not hash to the address.
    const planted = join(root, '0', `${second!.contentHash}.bin.br`);
    await symlink(base, planted);
    await expectPipelineError(store.install(0, second!.contentHash, second!.bytes), 'chunk_dir_symlink_refused', EXIT.failed);
    await expectPipelineError(store.install(0, second!.contentHash, first!.bytes), 'chunk_hash_mismatch', EXIT.failed);
    expect(() => fileChunkStore('relative/dir')).toThrow('chunk_dir_must_be_absolute');
  });
});

describe('token file', () => {
  const token = 'eyJhbGciOi.eyJzdWIiOi.c2lnbmF0dXJl';
  it('reads a bare token or a labelled rejoin credential from a private regular file', async () => {
    const directory = await temporary();
    const bare = join(directory, 'bare');
    await writeFile(bare, `${token}\n`, { mode: 0o600 });
    expect(await readTokenFile(bare)).toBe(token);
    const rejoin = join(directory, 'rejoin.json');
    await writeFile(rejoin, JSON.stringify([{ label: 'owner', token }, { label: 'player', token: 'other.token.value' }]), { mode: 0o600 });
    expect(await readTokenFile(rejoin, 'owner')).toBe(token);
    await expectPipelineError(readTokenFile(rejoin), 'token_file_label_required', EXIT.usage);
    await expectPipelineError(readTokenFile(rejoin, 'missing'), 'token_file_label_missing', EXIT.usage);
    const refreshOnly = join(directory, 'refresh.json');
    await writeFile(refreshOnly, JSON.stringify([{ label: 'owner', refreshToken: 'r', clientId: 'orchard-web' }]), { mode: 0o600 });
    await expectPipelineError(readTokenFile(refreshOnly, 'owner'), 'token_file_token_missing_refresh_first', EXIT.usage);
  });

  it('refuses symlinks, group/other access, non-regular files and relative paths, and never echoes contents', async () => {
    const directory = await temporary();
    const file = join(directory, 'token');
    await writeFile(file, token, { mode: 0o600 });
    const link = join(directory, 'link');
    await symlink(file, link);
    await expectPipelineError(readTokenFile(link), 'token_file_symlink_refused', EXIT.usage);
    for (const mode of [0o640, 0o604, 0o660, 0o644]) {
      await chmod(file, mode);
      await expectPipelineError(readTokenFile(file), 'token_file_group_or_other_accessible', EXIT.usage);
    }
    await chmod(file, 0o600);
    await expectPipelineError(readTokenFile(directory), 'token_file_not_regular', EXIT.usage);
    await expectPipelineError(readTokenFile('token'), 'token_file_path_must_be_absolute', EXIT.usage);
    const broken = join(directory, 'broken.json');
    await writeFile(broken, `{"owner": "${token}"`, { mode: 0o600 });
    const error = await readTokenFile(broken).catch((caught: unknown) => caught as Error);
    expect((error as PipelineError).code).toBe('token_file_invalid');
    expect((error as Error).message).not.toContain(token.slice(0, 8));
    const spaced = join(directory, 'spaced');
    await writeFile(spaced, `${token} extra`, { mode: 0o600 });
    const invalid = await readTokenFile(spaced).catch((caught: unknown) => caught as Error);
    expect((invalid as Error).message).toBe('token_file_invalid');
  });
});

describe('command line', () => {
  const env = { WORLD_CHUNKS_TOKEN_FILE: '/private/token' };
  const target = ['--host', 'http://127.0.0.1:3470', '--database', 'orchard-chunk-soak-local01', '--origin', 'http://127.0.0.1:5199'];
  it('defaults to the dry run and takes secrets and confirmations only from the environment', () => {
    expect(parseCli([...target, '--chunk-dir', '/data/chunks'], env)).toMatchObject({ command: 'plan', confirm: undefined, chunkDir: '/data/chunks' });
    expect(parseCli(['publish', ...target], { ...env, ORCHARD_WORLD_CHUNK_DIR: '/data/chunks', WORLD_CHUNKS_PUBLISH_CONFIRM: 'publish:x:y' }))
      .toMatchObject({ command: 'publish', chunkDir: '/data/chunks', confirm: 'publish:x:y' });
    expect(parseCli(['check', ...target], env)).toMatchObject({ command: 'check', chunkDir: null });
    expect(() => parseCli(['publish', ...target, '--token', 'x'], env)).toThrow('secrets_and_confirmations_come_from_the_environment');
    expect(() => parseCli(['publish', ...target, '--confirm', 'x'], env)).toThrow('secrets_and_confirmations_come_from_the_environment');
    expect(() => parseCli(['publish', ...target], env)).toThrow('chunk_dir_required');
    expect(() => parseCli(['publish', ...target, '--chunk-dir', 'relative'], env)).toThrow('chunk_dir_required');
    expect(() => parseCli(target, {})).toThrow('usage');
  });

  it('only targets the production database from its canonical host and public origin', () => {
    const production = (host: string, origin: string) => ['check', '--host', host, '--database', 'orchard-cellar-world', '--origin', origin];
    expect(parseCli(production('http://127.0.0.1:3000', 'https://orchard.dastari.net'), env)).toMatchObject({ database: 'orchard-cellar-world' });
    expect(() => parseCli(production('http://127.0.0.1:3470', 'https://orchard.dastari.net'), env)).toThrow('production_target_must_be_canonical');
    expect(() => parseCli(production('http://127.0.0.1:3000', 'http://127.0.0.1:5199'), env)).toThrow('production_target_must_be_canonical');
  });
});

describe('content hash', () => {
  it('compares the parsed registry hash, which can differ from the content_head rows hash', async () => {
    const rows: ContentRow[] = bootstrapContentRows().map(row => ({ id: row.id, kind: row.kind, slug: row.slug ?? '', revision: '1', hash: '',
      json: typeof row.json === 'string' ? row.json : JSON.stringify(row.json) }));
    const index = rows.findIndex(row => row.kind === 'item');
    // Spelling out a default changes the raw rows hash but not the registry the server builds.
    rows[index] = { ...rows[index]!, json: JSON.stringify({ ...JSON.parse(rows[index]!.json) as object, quality: 'common' }) };
    const registry = await liveRegistryContentHash(rows);
    expect(registry).toBe(bootstrapContentRegistry().contentHash);
    expect(contentDefinitionRowsHash(rows)).not.toBe(registry);
    expect(await liveRegistryContentHash(null)).toBe(bootstrapContentRegistry().contentHash);
  });

  it('publishes and checks fresh when content_head holds a different rows hash', async () => {
    const h = harness();
    expect(h.world.state.contentHead?.contentHash).toBe(ROWS_HASH);
    const report = await runPublishPipeline(h.deps, { mode: 'publish', database: DATABASE, confirm: h.confirm() });
    expect(report).toMatchObject({ outcome: 'published', source: { contentHash: REGISTRY_HASH } });
    expect(h.world.state.shadow?.contentHash).toBe(REGISTRY_HASH);
    expect(await checkPublishedHeads({ world: h.world, origin: h.origin, registryContentHash: h.deps.registryContentHash })).toMatchObject({ fresh: true });
  });
});

describe('failure evidence', () => {
  it('records the step, error and required confirmation for the expected exit 77', async () => {
    const h = harness();
    const trace: PipelineTrace = { step: 'read' };
    const error = await runPublishPipeline(h.deps, { mode: 'publish', database: DATABASE }, trace).catch((caught: unknown) => caught);
    const report = failureReport({ command: 'publish', host: 'http://127.0.0.1:3470', database: DATABASE, origin: h.origin.origin }, trace, error);
    expect(report).toMatchObject({ ok: false, step: 'confirm', error: { code: 'world_chunks_confirmation_required', exitCode: EXIT.confirm },
      confirmation: h.confirm(), registryContentHash: REGISTRY_HASH, manifestHash: sha256Hex(candidateFor(mapRow(), ATLAS).manifestJson) });
    expect(report.error.message).toContain(h.confirm());
  });

  it('never lets a token into a report or log line', () => {
    const token = 'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJvd25lciJ9.c2lnbmF0dXJlLXZhbHVl';
    const opaque = 'opaque-secret-token-value';
    const error = new PipelineError('connect_failed', EXIT.failed, `ws://127.0.0.1:3470/v1/subscribe?token=${opaque}&compression=none bearer ${token}`);
    const report = failureReport({ command: 'check', host: 'http://127.0.0.1:3470', database: DATABASE, origin: 'http://127.0.0.1:5199' }, { step: 'connect' }, error, opaque);
    const text = JSON.stringify(report);
    expect(text).not.toContain(opaque);
    expect(text).not.toContain(token);
    expect(text).toContain('connect_failed');
    expect(redact(`x ${opaque} y`, opaque)).toBe('x [redacted] y');
  });

  it('main writes the failure report (no token) when the world cannot be reached', async () => {
    const directory = await temporary();
    const token = 'local.token-value.for-test';
    const tokenFile = join(directory, 'token');
    await writeFile(tokenFile, token, { mode: 0o600 });
    const closed: Server = createServer();
    await new Promise<void>(done => closed.listen(0, '127.0.0.1', done));
    const port = (closed.address() as AddressInfo).port;
    await new Promise<void>(done => closed.close(() => done()));
    const report = join(directory, 'check.json');
    const code = await main(['check', '--host', `http://127.0.0.1:${port}`, '--database', 'orchard-chunk-soak-local01', '--origin', 'http://127.0.0.1:5199', '--report', report],
      { WORLD_CHUNKS_TOKEN_FILE: tokenFile });
    expect(code).toBe(EXIT.failed);
    const text = await readFile(report, 'utf8');
    expect(JSON.parse(text)).toMatchObject({ ok: false, command: 'check', step: 'connect', error: { exitCode: EXIT.failed } });
    expect(text).not.toContain(token);
    expect((await stat(report)).mode & 0o777).toBe(0o600);
  }, 40_000);
});

describe('chunk directory permissions', () => {
  it('creates missing directories as 0755 even under umask 077, and leaves existing ones alone', async () => {
    const parent = await temporary();
    const [blob] = candidateFor(mapRow(), ATLAS).blobs;
    const previous = process.umask(0o077);
    try {
      const root = join(parent, 'share', 'world-chunks');
      await fileChunkStore(root).install(0, blob!.contentHash, blob!.bytes);
      for (const path of [join(parent, 'share'), root, join(root, '0')]) expect((await stat(path)).mode & 0o777).toBe(0o755);
      expect((await stat(join(root, '0', `${blob!.contentHash}.bin`))).mode & 0o777).toBe(0o644);
      const existing = join(parent, 'existing');
      await mkdir(existing, { mode: 0o700 });
      await fileChunkStore(existing).install(0, blob!.contentHash, blob!.bytes);
      expect((await stat(existing)).mode & 0o777).toBe(0o700);
      expect((await stat(join(existing, '0'))).mode & 0o777).toBe(0o755);
    } finally {
      process.umask(previous);
    }
  });
});

describe('public origin adapter', () => {
  it('reads blobs through the real /world/ middleware: Brotli and gzip decode, a real 404', async () => {
    const root = join(await temporary(), 'world-chunks');
    const { blobs, manifest } = candidateFor(mapRow(), ATLAS);
    const store = fileChunkStore(root);
    for (const blob of blobs) await store.install(0, blob.contentHash, blob.bytes);
    await unlink(join(root, '0', `${blobs[1]!.contentHash}.bin.br`)); // this one falls back to gzip
    const middleware = createWorldChunkMiddleware(root);
    const server = createServer((req, res) => {
      if (req.url === '/generated/atlas.packs.json') { res.setHeader('Content-Type', 'application/json'); res.end(Buffer.from(ATLAS)); return; }
      middleware(req, res, () => { res.statusCode = 500; res.end(); });
    });
    await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
    try {
      const origin = httpOrigin(`http://127.0.0.1:${(server.address() as AddressInfo).port}/`);
      expect(new Uint8Array(await origin.atlasIndex())).toEqual(ATLAS);
      const first = await origin.blob(0, blobs[0]!.contentHash);
      expect(first).toMatchObject({ status: 200, encoding: 'br', contentType: 'application/octet-stream' });
      expect(first.bytes).toEqual(blobs[0]!.bytes);
      expect(checkServedBlob(first, 0, manifest.chunks[0]!)).toBeNull();
      expect(await verifyServed(origin, 0, manifest.chunks)).toEqual({ served: 4, encodings: { br: 3, gzip: 1 } });
      expect((await origin.blob(0, '0'.repeat(64))).status).toBe(404);
      await rm(join(root, '0', `${blobs[2]!.contentHash}.bin`));
      await expectPipelineError(verifyServed(origin, 0, manifest.chunks), 'origin_blob_not_served', EXIT.failed);
    } finally {
      await new Promise<void>(done => server.close(() => done()));
    }
  });
});
