import { worldChunkHash } from '@orchard/sim/world-chunk';
import type { DbConnection, SubscriptionHandle } from '@orchard/world-bindings';
import { validateRuntimeManifest } from '@orchard/sim/chunk-runtime';
import type { ChunkCollisionSample } from '@orchard/sim/chunk-runtime';
import { ChunkShadowLoader, fetchChunkBlob } from './chunk-shadow-loader.js';
import { IndexedDbChunkCache } from './chunk-shadow-cache.js';

export function chunkShadowQueries(spaceId: bigint, bounds: readonly [number,number,number,number]): readonly string[] {
  if (spaceId < 0n || !bounds.every(Number.isSafeInteger)) throw new Error('invalid_chunk_subscription');
  const [minX,minY,maxX,maxY] = bounds.map(value => Math.floor(value / 64)) as [number,number,number,number];
  return [`SELECT * FROM world_chunk_shadow WHERE space_id = ${spaceId}`,
    `SELECT * FROM world_chunk_head WHERE space_id = ${spaceId} AND cx >= ${minX-1} AND cx <= ${maxX+1} AND cy >= ${minY-1} AND cy <= ${maxY+1}`];
}
export interface ChunkShadowSource { readonly mapRevision: number; readonly mapHash: string; readonly contentHash: string }
/** Optional diagnostics. This class never returns terrain to gameplay or alters readiness. */
export class ChunkShadowController {
  #subscription: SubscriptionHandle | undefined;
  #key = '';
  #bound: DbConnection | undefined;
  #loader: ChunkShadowLoader | undefined;
  #revision = '';
  #assetHash: Promise<string> | undefined;
  #busy = false;
  #disposed = false;
  #latest: { connection: DbConnection; spaceId: bigint; bounds: readonly [number,number,number,number]; source: ChunkShadowSource } | undefined;
  readonly #cache = typeof indexedDB === 'undefined' ? undefined : new IndexedDbChunkCache(indexedDB);
  status: { state: string; readyChunks: number; residentBytes: number; compared: number; differences: number } = { state: 'idle', readyChunks: 0, residentBytes: 0, compared: 0, differences: 0 };
  update(connection: DbConnection,spaceId: bigint,bounds: readonly [number,number,number,number],source: ChunkShadowSource): void {
    if (this.#disposed) return;
    this.#latest = {connection,spaceId,bounds,source};
    if (this.#bound !== connection) {
      this.#bound = connection;
      const changed = () => { if (this.#latest) this.#latest = {...this.#latest}; void this.refresh(); };
      connection.db.worldChunkShadow.onInsert(changed); connection.db.worldChunkShadow.onUpdate(changed); connection.db.worldChunkShadow.onDelete(changed);
      connection.db.worldChunkHead.onInsert(changed); connection.db.worldChunkHead.onUpdate(changed); connection.db.worldChunkHead.onDelete(changed);
    }
    const queries = chunkShadowQueries(spaceId,bounds), key = queries.join(';');
    if (key !== this.#key) {
      this.#subscription?.unsubscribe(); this.#key = key;
      this.#subscription = connection.subscriptionBuilder().onApplied(() => { void this.refresh(); })
        .onError(() => { this.status.state = 'subscription_error'; }).subscribe([...queries]);
    }
    void this.refresh();
  }
  private async refresh(): Promise<void> {
    if (this.#busy || this.#disposed || !this.#latest) return;
    this.#busy = true;
    const input = this.#latest;
    try {
      const row = input.connection.db.worldChunkShadow.spaceId.find(input.spaceId);
      if (!row) { this.status.state = 'awaiting_publication'; return; }
      const manifest = validateRuntimeManifest(JSON.parse(row.manifestJson));
      if (manifest.spaceId !== Number(input.spaceId) || row.contentHash !== input.source.contentHash
        || manifest.sourceHash !== input.source.mapHash || manifest.sourceRevision !== input.source.mapRevision) {
        this.#loader?.dispose(); this.#loader = undefined; this.#revision = ''; this.status.state = 'source_mismatch'; return;
      }
      this.#assetHash ??= fetchChunkBlob('/generated/atlas.packs.json', 1024 * 1024).then(worldChunkHash).catch(error => { this.#assetHash = undefined; throw error; });
      if (manifest.assetRevision !== await this.#assetHash) { this.status.state = 'asset_revision_mismatch'; return; }
      const revision = `${input.spaceId}:${row.revision}`;
      if (revision !== this.#revision) { this.#loader?.dispose(); this.#loader = new ChunkShadowLoader(manifest,fetchChunkBlob,this.#cache); this.#revision = revision; }
      // Public regional heads must agree with the atomically published manifest before loading.
      const heads = [...input.connection.db.worldChunkHead.iter()].filter(head => head.spaceId === input.spaceId);
      if (heads.some(head => head.revision !== row.revision || !manifest.chunks.some(expected => expected.cx === head.cx && expected.cy === head.cy && expected.contentHash === head.contentHash))) throw new Error('chunk_head_revision_mismatch');
      this.#loader!.store.pinView(...input.bounds);
      if (this.#loader!.store.pinnedKeys.some(key => !heads.some(head => `${head.cx}:${head.cy}` === key && head.revision === row.revision))) {
        this.status.state = 'awaiting_heads'; return;
      }
      await this.#loader!.updateView(...input.bounds);
      if (!this.#disposed) { this.status.state = 'shadow'; this.status.readyChunks = this.#loader!.store.residentCount; this.status.residentBytes = this.#loader!.store.residentBytes; }
    } catch (error) { this.status.state = error instanceof Error ? error.message : 'chunk_shadow_error'; }
    finally { this.#busy = false; if (!this.#disposed && this.#latest !== input) void this.refresh(); }
  }
  compare(x: number,y: number,legacyBlocked: boolean): ChunkCollisionSample | undefined {
    if (this.status.state !== 'shadow') return undefined;
    const sample = this.#loader?.store.sample(x,y);
    if (sample?.ready) { this.status.compared++; if (sample.legacyGroundBlocked !== legacyBlocked) this.status.differences++; }
    return sample;
  }
  dispose(): void { this.#disposed = true; this.#subscription?.unsubscribe(); this.#loader?.dispose(); this.#cache?.close(); }
}
