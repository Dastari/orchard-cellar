import { worldChunkHash, type WorldChunkManifest } from '@orchard/sim/world-chunk';
import type { DbConnection, SubscriptionHandle } from '@orchard/world-bindings';
import type { WorldChunkHead } from '@orchard/world-bindings/types';
import { validateRuntimeManifest, type ChunkCollisionSample, type ChunkRuntimeMode } from '@orchard/sim/chunk-runtime';
import type { BoundedChunkTerrainStore } from '@orchard/engine/bounded-chunk-terrain-store';
import { ChunkShadowLoader, fetchChunkBlob } from './chunk-shadow-loader.js';
import { browserChunkBlobCache, type ChunkBlobCache, type IndexedDbChunkCache } from './chunk-shadow-cache.js';

export type ChunkView = readonly [number, number, number, number];

export function chunkRuntimeQueries(spaceId: bigint, bounds: ChunkView): readonly string[] {
  if (spaceId < 0n || !bounds.every(Number.isSafeInteger)) throw new Error('invalid_chunk_subscription');
  const [minX,minY,maxX,maxY] = bounds.map(value => Math.floor(value / 64)) as [number,number,number,number];
  return [`SELECT * FROM world_chunk_shadow WHERE space_id = ${spaceId}`,
    `SELECT * FROM world_chunk_head WHERE space_id = ${spaceId} AND cx >= ${minX-1} AND cx <= ${maxX+1} AND cy >= ${minY-1} AND cy <= ${maxY+1}`];
}

/** What the client's legacy path currently runs: compared against the published manifest. */
export interface ChunkRuntimeSource { readonly mapRevision: number; readonly mapHash: string; readonly contentHash: string }

/**
 * SEAM (static world S2a, PR #162): the server's public chunkAuthority switch, read from the
 * public `space_admin_flag` row of space 0 (flagsJson, `chunkAuthorityModeFromFlagsJson`).
 * A later PR passes a source that reads that row and calls `authorityChanged()` when it changes.
 * Until then the source is unconnected and returns undefined ("unknown").
 */
export type ChunkAuthoritySource = (connection: DbConnection) => ChunkRuntimeMode | undefined;
export const UNCONNECTED_CHUNK_AUTHORITY: ChunkAuthoritySource = () => undefined;

/**
 * The client follows the server's chunkAuthority, capped by what the build was made for.
 * `off` from the server is the rollback and wins over any build. An `on` build with an
 * unknown authority never activates: it runs diagnostics-only `shadow`.
 */
export function effectiveChunkRuntimeMode(build: ChunkRuntimeMode, authority: ChunkRuntimeMode | undefined): ChunkRuntimeMode {
  if (build === 'off' || authority === 'off') return 'off';
  if (build === 'shadow') return 'shadow';
  return authority === 'on' ? 'on' : 'shadow';
}

/** Why the published manifest disagrees with what the legacy path runs. Never a stop in `on`. */
export type ChunkStaleReason = 'content' | 'map' | 'asset';

/**
 * Why the serving revision must not be used for server-authoritative data
 * (client collision, suppression, combat regions) right now. Mirrors the
 * server dispatcher (S2b), which reads the latest publication and serves its
 * compiled map on `stale_content` / `stale_map`:
 * - `not_on`, `not_serving`: no `on` store yet;
 * - `shadow_missing`: nothing published (the server has no chunk runtime);
 * - `superseded`: a newer revision is published and still loading here, while
 *   the server already reads it (or its compiled map);
 * - `stale_content`, `stale_map`: the publication disagrees with the live content
 *   or map. An asset (atlas) mismatch is rendering-only and does not gate.
 */
export type ChunkAuthorityGate = 'not_on' | 'not_serving' | 'shadow_missing' | 'superseded' | 'stale_content' | 'stale_map';

export interface ChunkRuntimeStatus {
  /** Effective mode after following the server authority. */
  mode: ChunkRuntimeMode;
  state: string;
  readyChunks: number;
  residentBytes: number;
  compared: number;
  differences: number;
  /** `on` only: the published heads disagree with this client's content, map or assets. */
  stale: boolean;
  staleReasons: readonly ChunkStaleReason[];
  /** Times the controller entered (or changed) a stale condition. */
  staleObservations: number;
  /** Revision (`space:revision`) whose store is serving, and the one loading behind it. */
  servingRevision: string | null;
  pendingRevision: string | null;
  swaps: number;
  /** `on`: atlas pack loads that failed (non-fatal; the consolidated atlas still draws). */
  atlasPackFailures: number;
}

export interface ChunkRuntimeControllerOptions {
  readonly buildMode: ChunkRuntimeMode;
  readonly authority?: ChunkAuthoritySource;
  /** undefined: the browser IndexedDB cache when available; null: memory only. */
  readonly cache?: ChunkBlobCache | null;
  readonly fetchBlob?: (path: string, maxBytes: number) => Promise<Uint8Array>;
  /** `on` only, and only when atlas pack delivery is enabled: loads the pinned chunks'
   * atlas packs (ui loadAtlasPacks). A failure is counted, never fatal (S4f). */
  readonly loadAtlasPacks?: (ids: readonly string[]) => Promise<void>;
}

interface ChunkBuffer { readonly revision: string; readonly spaceId: bigint; readonly manifest: WorldChunkManifest; readonly loader: ChunkShadowLoader }
interface ChunkInput { readonly connection: DbConnection; readonly spaceId: bigint; readonly bounds: ChunkView; readonly source: ChunkRuntimeSource }

/** The view's centre chunks: the pin bounds before pinView adds its ring (the spawn chunk
 * and its ring when the pin is centred on the player). All published ones must be resident. */
function coreResident(store: BoundedChunkTerrainStore, bounds: ChunkView): boolean {
  const [minX, minY, maxX, maxY] = bounds.map(value => Math.floor(value / 64)) as [number, number, number, number];
  return store.manifest.chunks.every(head => head.cx < minX || head.cx > maxX || head.cy < minY || head.cy > maxY
    || store.peekChunk(head.cx, head.cy) !== undefined);
}

function idleStatus(mode: ChunkRuntimeMode, state: string): ChunkRuntimeStatus {
  return { mode, state, readyChunks: 0, residentBytes: 0, compared: 0, differences: 0, stale: false, staleReasons: [], staleObservations: 0,
    servingRevision: null, pendingRevision: null, swaps: 0, atlasPackFailures: 0 };
}

/**
 * Loads published chunk heads for the player's view.
 *
 * - `shadow`: diagnostics only, exactly as before S4a. A content or map mismatch drops the
 *   loader (`source_mismatch`); an asset mismatch pauses loading (`asset_revision_mismatch`).
 * - `on`: follows the published heads. Two buffers: the serving store keeps serving (and
 *   keeps following the view) while the next revision loads; once every pinned chunk of the
 *   next revision is resident the two swap in one assignment. The first revision (nothing
 *   serving yet) serves as soon as the view's centre chunks, the spawn chunk and its ring,
 *   are resident, loading them first (S4f spawn readiness); the rest of its window arrives
 *   behind it and reads as solid void until then. A content or map mismatch, an asset
 *   mismatch, or an atlas that cannot be fetched to check it, only marks the runtime stale;
 *   the atlas check runs beside loading, never before it. No mismatch stops serving or
 *   loading in `on`. Atlas packs load only when pack delivery is enabled, and a failure is
 *   counted, never fatal.
 *
 * S4a has no gameplay consumer: rendering (S4c) and collision (S4d) read `store` later.
 */
export class ChunkRuntimeController {
  readonly buildMode: ChunkRuntimeMode;
  readonly #authority: ChunkAuthoritySource;
  readonly #fetchBlob: (path: string, maxBytes: number) => Promise<Uint8Array>;
  readonly #cache: ChunkBlobCache | undefined;
  readonly #ownedCache: IndexedDbChunkCache | undefined;
  #subscription: SubscriptionHandle | undefined;
  #key = '';
  #bound: DbConnection | undefined;
  #active: ChunkBuffer | undefined;
  #pending: ChunkBuffer | undefined;
  #assetHash: Promise<string> | undefined;
  /** `on`: the checked atlas revision (S4f: checked beside loading, never before it);
   * undefined while unknown, null after a failed fetch. */
  #assetValue: string | null | undefined;
  #assetChecking = false;
  /** The current chunk subscription has applied (its rows are in the client cache). */
  #applied = false;
  readonly #loadAtlasPacks: ((ids: readonly string[]) => Promise<void>) | undefined;
  #atlasPackKey = '';
  #busy = false;
  /** Bumped on every mode change or stop, so an in-flight refresh cannot report into a new mode. */
  #epoch = 0;
  #disposed = false;
  #latest: ChunkInput | undefined;
  status: ChunkRuntimeStatus;
  constructor(options: ChunkRuntimeControllerOptions) {
    this.buildMode = options.buildMode;
    this.#authority = options.authority ?? UNCONNECTED_CHUNK_AUTHORITY;
    this.#fetchBlob = options.fetchBlob ?? fetchChunkBlob;
    this.#loadAtlasPacks = options.loadAtlasPacks;
    this.#ownedCache = options.cache === undefined ? browserChunkBlobCache() : undefined;
    this.#cache = options.cache === undefined ? this.#ownedCache : options.cache ?? undefined;
    this.status = idleStatus(effectiveChunkRuntimeMode(this.buildMode, undefined), 'idle');
  }
  /** The serving store in `on` mode: a swapped-in revision, never a half-loaded replacement.
   * The first revision serves once its spawn ring is resident (S4f). */
  get store(): BoundedChunkTerrainStore | undefined {
    return this.status.mode === 'on' ? this.#active?.loader.store : undefined;
  }
  /** Synchronous authority gate for the serving store against the caller's current
   * live map and content (see ChunkAuthorityGate); null when it may be used. */
  authorityGate(source: ChunkRuntimeSource): ChunkAuthorityGate | null {
    if (this.status.mode !== 'on') return 'not_on';
    const active = this.#active, input = this.#latest;
    if (active === undefined || input === undefined) return 'not_serving';
    const row = input.connection.db.worldChunkShadow.spaceId.find(active.spaceId);
    if (!row) return 'shadow_missing';
    if (`${active.spaceId}:${row.revision}` !== active.revision) return 'superseded';
    if (row.contentHash !== source.contentHash) return 'stale_content';
    if (active.manifest.sourceRevision !== source.mapRevision || active.manifest.sourceHash !== source.mapHash) return 'stale_map';
    return null;
  }
  update(connection: DbConnection, spaceId: bigint, bounds: ChunkView, source: ChunkRuntimeSource): void {
    if (this.#disposed) return;
    this.#latest = { connection, spaceId, bounds, source };
    this.#apply();
  }
  /** Call when the server's chunkAuthority changes (the seam's row listener). */
  authorityChanged(): void {
    if (!this.#disposed && this.#latest) this.#apply();
  }
  #apply(): void {
    const input = this.#latest!, connection = input.connection;
    const mode = effectiveChunkRuntimeMode(this.buildMode, this.#authority(connection));
    if (mode === 'off') { this.#stop(); return; }
    if (mode !== this.status.mode) {
      // A shadow buffer may be partly loaded; `on` must only ever serve a fully pinned swap.
      if (this.#active) this.#drop(this.#active);
      if (this.#pending) this.#drop(this.#pending);
      this.#epoch++;
      this.status = { ...idleStatus(mode, 'idle'), swaps: this.status.swaps, staleObservations: this.status.staleObservations };
    }
    if (this.#bound !== connection) {
      this.#bound = connection;
      const changed = () => { if (this.#latest) this.#latest = {...this.#latest}; void this.refresh(); };
      connection.db.worldChunkShadow.onInsert(changed); connection.db.worldChunkShadow.onUpdate(changed); connection.db.worldChunkShadow.onDelete(changed);
      connection.db.worldChunkHead.onInsert(changed); connection.db.worldChunkHead.onUpdate(changed); connection.db.worldChunkHead.onDelete(changed);
    }
    // A buffer of another space is useless here and only costs memory. The epoch bump stops
    // an in-flight pass (for the old space) from building or swapping in a buffer afterwards.
    let spaceChanged = false;
    for (const buffer of [this.#active, this.#pending]) if (buffer && buffer.spaceId !== input.spaceId) { this.#drop(buffer); spaceChanged = true; }
    if (spaceChanged) this.#epoch++;
    const queries = chunkRuntimeQueries(input.spaceId, input.bounds), key = queries.join(';');
    if (key !== this.#key) {
      this.#subscription?.unsubscribe(); this.#key = key; this.#applied = false;
      this.#subscription = connection.subscriptionBuilder().onApplied(() => {
        // `on`: marked as new input (like the row listeners) so a pass that is busy right now
        // re-runs and leaves `subscribing` (S4f). Shadow keeps its exact behaviour.
        this.#applied = true; if (this.status.mode === 'on' && this.#latest) this.#latest = { ...this.#latest }; void this.refresh();
      })
        .onError(() => { this.status.state = 'subscription_error'; }).subscribe([...queries]);
    }
    void this.refresh();
  }
  /** Rollback: release everything and stay idle until the authority allows chunks again. */
  #stop(): void {
    this.#subscription?.unsubscribe(); this.#subscription = undefined; this.#key = '';
    if (this.#active) this.#drop(this.#active);
    if (this.#pending) this.#drop(this.#pending);
    this.#epoch++;
    this.status = { ...idleStatus('off', 'off'), swaps: this.status.swaps, staleObservations: this.status.staleObservations };
  }
  #drop(buffer: ChunkBuffer): void {
    buffer.loader.dispose();
    if (this.#active === buffer) this.#active = undefined;
    if (this.#pending === buffer) this.#pending = undefined;
  }
  #buffer(revision: string, spaceId: bigint, manifest: WorldChunkManifest): ChunkBuffer {
    return { revision, spaceId, manifest, loader: new ChunkShadowLoader(manifest, this.#fetchBlob, this.#cache) };
  }
  #assetRevision(): Promise<string> {
    this.#assetHash ??= this.#fetchBlob('/generated/atlas.packs.json', 1024 * 1024).then(worldChunkHash)
      .catch(error => { this.#assetHash = undefined; throw error; });
    return this.#assetHash;
  }
  private async refresh(): Promise<void> {
    if (this.#busy || this.#disposed || !this.#latest || this.status.mode === 'off') return;
    this.#busy = true;
    const input = this.#latest, epoch = this.#epoch;
    try {
      if (this.status.mode === 'on') await this.#refreshOn(input, epoch);
      else await this.#refreshShadow(input, epoch);
    } catch (error) { if (epoch === this.#epoch) this.status.state = error instanceof Error ? error.message : 'chunk_runtime_error'; }
    // Re-run for newer input, or for a mode change (rollback and re-activation) that raced this pass.
    finally { this.#busy = false; if (!this.#disposed && (this.#latest !== input || this.#epoch !== epoch)) void this.refresh(); }
  }
  #readManifest(input: ChunkInput) {
    const row = input.connection.db.worldChunkShadow.spaceId.find(input.spaceId);
    if (!row) return undefined;
    const manifest = validateRuntimeManifest(JSON.parse(row.manifestJson));
    if (manifest.spaceId !== Number(input.spaceId)) throw new Error('chunk_manifest_space_mismatch');
    const reasons: ChunkStaleReason[] = [];
    if (row.contentHash !== input.source.contentHash) reasons.push('content');
    if (manifest.sourceHash !== input.source.mapHash || manifest.sourceRevision !== input.source.mapRevision) reasons.push('map');
    const heads = [...input.connection.db.worldChunkHead.iter()].filter(head => head.spaceId === input.spaceId);
    // Public regional heads must agree with the atomically published manifest.
    const headsConsistent = !heads.some(head => head.revision !== row.revision
      || !manifest.chunks.some(expected => expected.cx === head.cx && expected.cy === head.cy && expected.contentHash === head.contentHash));
    return { row, manifest, reasons, heads, headsConsistent, revision: `${input.spaceId}:${row.revision}` };
  }
  #pinnedHeadsPublished(buffer: ChunkBuffer, heads: readonly WorldChunkHead[], revision: number): boolean {
    return buffer.loader.store.pinnedKeys.every(key => heads.some(head => `${head.cx}:${head.cy}` === key && head.revision === revision));
  }
  #report(buffer: ChunkBuffer | undefined): void {
    this.status.readyChunks = buffer?.loader.store.residentCount ?? 0;
    this.status.residentBytes = buffer?.loader.store.residentBytes ?? 0;
    this.status.servingRevision = buffer?.revision ?? null;
    this.status.pendingRevision = this.#pending?.revision ?? null;
  }
  /** Unchanged pre-S4a shadow behaviour: diagnostics stop on any mismatch. */
  async #refreshShadow(input: ChunkInput, epoch: number): Promise<void> {
    const published = this.#readManifest(input);
    if (!published) { this.status.state = 'awaiting_publication'; return; }
    const { manifest, reasons, heads, headsConsistent, revision, row } = published;
    if (reasons.length > 0) {
      if (this.#active) this.#drop(this.#active);
      if (this.#pending) this.#drop(this.#pending);
      this.status.state = 'source_mismatch'; return;
    }
    const assetRevision = await this.#assetRevision();
    if (epoch !== this.#epoch) return;
    if (manifest.assetRevision !== assetRevision) { this.status.state = 'asset_revision_mismatch'; return; }
    if (revision !== this.#active?.revision) {
      if (this.#active) this.#drop(this.#active);
      if (this.#pending) this.#drop(this.#pending);
      this.#active = this.#buffer(revision, input.spaceId, manifest);
    }
    const buffer = this.#active!;
    if (!headsConsistent) throw new Error('chunk_head_revision_mismatch');
    buffer.loader.store.pinView(...input.bounds);
    if (!this.#pinnedHeadsPublished(buffer, heads, row.revision)) { this.status.state = 'awaiting_heads'; return; }
    await buffer.loader.updateView(...input.bounds);
    if (!this.#disposed && epoch === this.#epoch && this.#active === buffer) { this.status.state = 'shadow'; this.#report(buffer); }
  }
  async #refreshOn(input: ChunkInput, epoch: number): Promise<void> {
    const published = this.#readManifest(input);
    const active = this.#active;
    if (!published) {
      // An unpublished or withdrawn manifest is not a reason to stop serving what we have.
      if (active) await this.#follow(active, input.bounds);
      if (epoch !== this.#epoch) return;
      // `subscribing` until the manifest subscription has applied: "no publication" is only
      // known then (S4f spawn readiness waits for it, but never for a real absence).
      this.status.state = this.#applied ? 'awaiting_publication' : 'subscribing'; this.#report(this.#active);
      if (this.#active) this.#loadPinnedAtlasPacks(this.#active);
      return;
    }
    const { manifest, heads, headsConsistent, revision, row } = published;
    const reasons = [...published.reasons];
    // The atlas check is rendering-only diagnostics: it runs beside loading and never
    // delays the first chunks (S4f). Its result is applied by the next refresh.
    this.#checkAssetRevision();
    if (this.#assetValue === null || (this.#assetValue !== undefined && manifest.assetRevision !== this.#assetValue)) reasons.push('asset');
    this.#markStale(reasons);
    let target: ChunkBuffer | undefined, state = '';
    if (active?.revision === revision) {
      if (this.#pending) this.#drop(this.#pending);
    } else if (!headsConsistent) {
      state = 'awaiting_heads';
    } else if (input.spaceId === this.#latest?.spaceId) {
      if (this.#pending?.revision !== revision) {
        if (this.#pending) this.#drop(this.#pending);
        this.#pending = this.#buffer(revision, input.spaceId, manifest);
      }
      target = this.#pending;
    }
    const errors = new Map<ChunkBuffer, string>();
    const follow = async (buffer: ChunkBuffer, requireHeads: boolean) => {
      try {
        if (requireHeads) {
          buffer.loader.store.pinView(...input.bounds);
          if (!this.#pinnedHeadsPublished(buffer, heads, row.revision)) { state ||= 'awaiting_heads'; return; }
          // Spawn readiness (S4f): with nothing serving yet, the first revision serves as soon as
          // the view's centre chunks (the spawn chunk and its ring) are resident; the rest of the
          // window keeps loading behind it. A later revision still waits for every pinned chunk.
          if (this.#active === undefined) buffer.loader.onInstall = () => {
            if (this.#disposed || epoch !== this.#epoch || this.#pending !== buffer || this.#active !== undefined
              || buffer.spaceId !== this.#latest?.spaceId || !coreResident(buffer.loader.store, input.bounds)) return;
            buffer.loader.onInstall = undefined;
            this.#swap(buffer);
            this.#report(buffer);
            this.status.state = this.status.stale ? 'stale' : 'on';
          };
        }
        await this.#follow(buffer, input.bounds);
      } catch (error) { errors.set(buffer, error instanceof Error ? error.message : 'chunk_runtime_error'); }
      finally { buffer.loader.onInstall = undefined; }
    };
    if (target) { this.status.pendingRevision = target.revision; this.status.state = 'loading'; }
    // The serving revision keeps following the view whatever happens to the next one.
    await Promise.all([active ? follow(active, false) : undefined, target ? follow(target, true) : undefined]);
    if (this.#disposed || epoch !== this.#epoch) return;
    // Only the next revision's own readiness gates the swap: a failing serving revision must
    // never hold back a fully loaded replacement.
    if (target && this.#pending === target && target.spaceId === this.#latest?.spaceId && target.loader.store.pinnedReady
      && state === '' && !errors.has(target)) this.#swap(target);
    this.#report(this.#active);
    if (this.#active) this.#loadPinnedAtlasPacks(this.#active);
    const live = [this.#active, this.#pending].flatMap(buffer => buffer && errors.has(buffer) ? [errors.get(buffer)!] : []);
    this.status.state = live[0] ?? (state || (this.#pending ? 'loading' : this.status.stale ? 'stale' : 'on'));
  }
  async #follow(buffer: ChunkBuffer, bounds: ChunkView): Promise<void> {
    await buffer.loader.updateView(...bounds, true);
  }
  /** Atlas packs for the serving store's pinned chunks, only when pack delivery is on. */
  #loadPinnedAtlasPacks(buffer: ChunkBuffer): void {
    if (this.#loadAtlasPacks === undefined || this.#active !== buffer) return;
    const ids = buffer.loader.store.pinnedPackIds, key = ids.join(',');
    if (ids.length === 0 || key === this.#atlasPackKey) return;
    this.#atlasPackKey = key;
    const epoch = this.#epoch;
    void this.#loadAtlasPacks(ids).catch(() => {
      if (epoch !== this.#epoch) return;
      this.status.atlasPackFailures++;
      if (this.#atlasPackKey === key) this.#atlasPackKey = '';
    });
  }
  #checkAssetRevision(): void {
    if (this.#assetChecking || (this.#assetValue !== undefined && this.#assetValue !== null)) return;
    this.#assetChecking = true;
    this.#assetRevision().then(value => {
      this.#assetValue = value; this.#assetChecking = false;
      if (!this.#disposed) void this.refresh();
    }, () => {
      // Stale ('asset') until a later refresh retries; a failure never re-triggers one itself.
      this.#assetValue = null; this.#assetChecking = false;
    });
  }
  #swap(next: ChunkBuffer): void {
    const previous = this.#active;
    // One assignment: readers see either the old complete store or the new complete store.
    this.#active = next; this.#pending = undefined;
    previous?.loader.dispose();
    this.status.swaps++;
    const keep = new Set([...next.manifest.chunks, ...(previous?.manifest.chunks ?? [])].map(head => head.contentHash));
    void this.#cache?.prune?.(next.manifest.spaceId, keep).catch(() => undefined);
  }
  #markStale(reasons: readonly ChunkStaleReason[]): void {
    const changed = reasons.length !== this.status.staleReasons.length || reasons.some((reason, index) => this.status.staleReasons[index] !== reason);
    if (changed && reasons.length > 0) this.status.staleObservations++;
    this.status.stale = reasons.length > 0;
    this.status.staleReasons = reasons;
  }
  sample(x: number, y: number): ChunkCollisionSample | undefined {
    return this.store?.sample(x, y);
  }
  compare(x: number,y: number,legacyBlocked: boolean): ChunkCollisionSample | undefined {
    if (this.status.state !== 'shadow') return undefined;
    const sample = this.#active?.loader.store.sample(x,y);
    if (sample?.ready) { this.status.compared++; if (sample.legacyGroundBlocked !== legacyBlocked) this.status.differences++; }
    return sample;
  }
  dispose(): void {
    this.#disposed = true; this.#subscription?.unsubscribe();
    if (this.#active) this.#drop(this.#active);
    if (this.#pending) this.#drop(this.#pending);
    this.#ownedCache?.close();
  }
}
