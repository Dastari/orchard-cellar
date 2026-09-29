import {
  LIVE_ISLAND_MAP_ID, mapDocumentUsesSurvivalIslandBase, SURVIVAL_WORLD_SIZE, TOPSIDE_SPACE_ID, type MapDocumentV3,
} from '@orchard/sim';
import { validateRuntimeManifest } from '@orchard/sim/chunk-runtime';
import type { WorldChunkManifest } from '@orchard/sim/world-chunk';
import {
  assembleChunkLiveIslandRuntime, chunkResourceGeneratorMismatch,
  type ChunkLiveIslandRuntime, type LiveIslandCollisionRuntime,
} from './chunk-authority-runtime.js';

/**
 * The live-island chunk dispatcher behind the owner `chunkAuthority` switch
 * (`chunk-authority-setting.ts`). Static world S3-final: the published chunks are the server's
 * only source (no compiled map, no shadow comparison, no fallback).
 *
 * - `off` only calls `release()`; the server then has no runtime (the island is unservable).
 * - Otherwise the chunk runtime is served only when it is complete, not built by another resource
 *   generator, and passes the island guards (topside, survival world size, survival island base,
 *   a live map row, the ground terrain fields, traversal-policy presence on both media). A map or
 *   content publication since the chunks keeps the pinned publication serving (SW-D2, a reported
 *   lag). Anything else, including a throw while parsing or assembling, returns null: the server
 *   fails safe (solid topside) and clients show "world updating". A partial runtime is never
 *   served: an obstacle anchored in a missing chunk would lose its overhang into present chunks.
 *
 * State is per module instance (the host may recycle it; the next call rebuilds). Every failure is
 * cached per key, so a broken publication costs one attempt per key, not one per tick.
 */

/** A compiled live-island runtime (tools only since S3-final: the chunk materializer and audits). */
export type CompiledCollisionRuntime = LiveIslandCollisionRuntime & { readonly document: MapDocumentV3 };

export interface ChunkShadowRowView {
  readonly revision: number;
  readonly mapId: string;
  readonly contentHash: string;
  readonly manifestJson: string;
}
export interface LiveMapRowView {
  readonly revision: number;
  readonly contentHash: string;
}

/** Everything the dispatcher reads for one call. Lazy members are read only when needed. */
export interface ChunkAuthoritySource {
  /** `world_chunk_shadow` for topside, or null when nothing is published. */
  readonly shadow: () => ChunkShadowRowView | null;
  /** `live_map_document` for the live island, or null (seed bootstrap). */
  readonly liveMap: () => LiveMapRowView | null;
  readonly registryContentHash: () => string;
  /** Whether the CURRENT registry has a traversal policy (the publication must carry channels then). */
  readonly traversalPolicyActive: () => boolean;
  readonly readBlob: (contentHash: string) => Uint8Array | undefined;
}

export type ChunkAuthorityUnavailableReason =
  | 'shadow_missing' | 'shadow_map_mismatch' | 'map_row_missing' | 'manifest_invalid' | 'assemble_failed'
  | 'guard_space' | 'guard_size' | 'guard_base' | 'incomplete' | 'stale_content' | 'stale_map' | 'stale_generator' | 'traversal_policy_mismatch'
  | 'ground_fields_missing';

/** Why a served publication is behind the live map or content (SW-D2: it keeps serving until republished). */
export type ChunkPublicationLag = 'content' | 'map';

export type ChunkRuntimeResolution =
  | { readonly ok: true; readonly runtime: ChunkLiveIslandRuntime;
    /** SW-D2 (static world S6): the live map or content moved on since this publication. The pinned
     * publication keeps serving (clients serve exactly the same chunks) until the heads are republished. */
    readonly lag?: readonly ChunkPublicationLag[]; readonly lagDetail?: string }
  | { readonly ok: false; readonly reason: ChunkAuthorityUnavailableReason; readonly detail?: string; readonly key: string };

export interface ChunkAuthorityLogger {
  info(event: Readonly<Record<string, unknown>>): void;
  warn(event: Readonly<Record<string, unknown>>): void;
  time(label: string): void;
  timeEnd(label: string): void;
}

export const consoleChunkAuthorityLogger: ChunkAuthorityLogger = {
  info: event => console.info(JSON.stringify(event)),
  warn: event => console.warn(JSON.stringify(event)),
  time: label => console.time(label),
  timeEnd: label => console.timeEnd(label),
};

export interface ChunkAuthorityDispatcherOptions {
  readonly logger?: ChunkAuthorityLogger;
  /** Island guard: the survival world dimensions. Tests may use a small island. */
  readonly worldSize?: { readonly width: number; readonly height: number };
}

export interface ChunkAuthorityStatus {
  readonly lastResolution: { readonly ok: boolean; readonly reason?: ChunkAuthorityUnavailableReason; readonly key: string;
    readonly lag?: readonly ChunkPublicationLag[] } | null;
  /** Unservable selects by reason (the server then fails safe). */
  readonly fallbacks: Readonly<Record<string, number>>;
}

interface ManifestEntry {
  readonly key: string;
  readonly result: { readonly ok: true; readonly manifest: WorldChunkManifest }
    | { readonly ok: false; readonly reason: ChunkAuthorityUnavailableReason; readonly detail?: string };
}
interface RuntimeEntry {
  readonly key: string;
  readonly resolution: ChunkRuntimeResolution;
}

const MEDIA = ['ground', 'water'] as const;

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class ChunkAuthorityDispatcher {
  readonly #logger: ChunkAuthorityLogger;
  readonly #worldSize: { readonly width: number; readonly height: number };
  #manifestCache: ManifestEntry | null = null;
  #runtimeCache: RuntimeEntry | null = null;
  readonly #loggedOnce = new Set<string>();
  readonly #fallbacks: Record<string, number> = {};
  #lastResolution: ChunkAuthorityStatus['lastResolution'] = null;

  constructor(options: ChunkAuthorityDispatcherOptions = {}) {
    this.#logger = options.logger ?? consoleChunkAuthorityLogger;
    this.#worldSize = options.worldSize ?? { width: SURVIVAL_WORLD_SIZE, height: SURVIVAL_WORLD_SIZE };
  }

  /**
   * The collision runtime for this call: the chunk runtime when it resolves, else null (the island
   * is unservable: the server fails safe and logs why, once per reason and key).
   */
  select(source: ChunkAuthoritySource): LiveIslandCollisionRuntime | null {
    let resolution: ChunkRuntimeResolution;
    try {
      resolution = this.resolve(source);
    } catch (error) {
      resolution = { ok: false, reason: 'assemble_failed', detail: message(error), key: 'unresolved' };
    }
    if (resolution.ok) {
      this.#once(`on:serving:${resolution.runtime.key}`, 'info', { event: 'chunk_authority_serving', key: resolution.runtime.key });
      if (resolution.lag !== undefined) {
        this.#once(`on:lag:${resolution.runtime.key}:${resolution.lagDetail}`, 'info', { event: 'chunk_authority_serving_pinned',
          key: resolution.runtime.key, lag: resolution.lag, detail: resolution.lagDetail });
      }
      return resolution.runtime;
    }
    this.#fallbacks[resolution.reason] = (this.#fallbacks[resolution.reason] ?? 0) + 1;
    this.#warnOnce(`on:${resolution.reason}:${resolution.key}`, {
      event: 'chunk_authority_unservable', reason: resolution.reason, key: resolution.key,
      ...(resolution.detail === undefined ? {} : { detail: resolution.detail }),
    });
    return null;
  }

  /**
   * Resolves the chunk runtime and every serving guard. Never throws for bad
   * published data: parse, validation and assembly failures become reasons.
   */
  resolve(source: ChunkAuthoritySource): ChunkRuntimeResolution {
    const shadow = source.shadow();
    const resolution = this.#resolveUnchecked(source, shadow);
    this.#lastResolution = resolution.ok
      ? { ok: true, key: resolution.runtime.key, ...(resolution.lag === undefined ? {} : { lag: resolution.lag }) }
      : { ok: false, reason: resolution.reason, key: resolution.key };
    return resolution;
  }

  #resolveUnchecked(source: ChunkAuthoritySource, shadow: ChunkShadowRowView | null): ChunkRuntimeResolution {
    if (shadow === null) return { ok: false, reason: 'shadow_missing', key: 'none' };
    const preKey = `${shadow.revision}:${shadow.contentHash}`;
    if (shadow.mapId !== LIVE_ISLAND_MAP_ID) return { ok: false, reason: 'shadow_map_mismatch', detail: shadow.mapId, key: preKey };
    // A publication always pins an existing live map row; without one there is nothing to describe.
    const liveMap = source.liveMap();
    if (liveMap === null) return { ok: false, reason: 'map_row_missing', key: preKey };
    const manifestEntry = this.#manifestCache?.key === preKey ? this.#manifestCache : this.#readManifest(shadow, preKey);
    const read = manifestEntry.result;
    if (!read.ok) return { ok: false, reason: read.reason, key: preKey, ...(read.detail === undefined ? {} : { detail: read.detail }) };
    const registryContentHash = source.registryContentHash();
    const manifest = read.manifest;
    // The resource records also depend on generator code: a module that bumps SURVIVAL_WORLD_VERSION
    // (the reconcile trigger) must not reconcile from records an older generator produced (#230 review).
    // That is refused before any blob is decoded; only a republish (the release lane does it) serves again.
    const generator = chunkResourceGeneratorMismatch(manifest);
    if (generator !== undefined) {
      this.#runtimeCache = null;
      return { ok: false, reason: 'stale_generator', detail: generator, key: preKey };
    }
    // SW-D2 (static world S6): a map or content publication since the chunk publication does NOT stop
    // serving. The pinned publication keeps serving, exactly what every client draws and collides with,
    // until the heads are republished; the lag is reported, never a fallback to the compiled map.
    const lag: ChunkPublicationLag[] = [];
    if (shadow.contentHash !== registryContentHash) lag.push('content');
    if (manifest.sourceRevision !== liveMap.revision || manifest.sourceHash !== liveMap.contentHash) lag.push('map');
    const lagDetail = lag.length === 0 ? undefined
      : `published ${manifest.sourceRevision}:${manifest.sourceHash} content ${shadow.contentHash}, live ${liveMap.revision}:${liveMap.contentHash} content ${registryContentHash}`;
    // Assembled against the publication's own content hash: the pinned runtime (and its cache key) is the
    // same whatever the live content does, so a content publication never re-assembles or unpins it.
    const cacheKey = `${preKey}:${shadow.contentHash}`;
    const entry = this.#runtimeCache?.key === cacheKey ? this.#runtimeCache : this.#assemble(source, shadow, manifest, cacheKey, shadow.contentHash);
    const resolution = entry.resolution;
    if (!resolution.ok) return resolution;
    const runtime = resolution.runtime;
    if (!runtime.complete) {
      const issues = runtime.issues.slice(0, 4).map(issue => `${issue.kind}${issue.cx === undefined ? '' : `@${issue.cx},${issue.cy}`}${issue.detail === undefined ? '' : `:${issue.detail}`}`);
      return { ok: false, reason: 'incomplete', detail: `${runtime.issues.length} issue(s): ${issues.join('; ')}`, key: runtime.key };
    }
    // Compiled always sets both. Without them liveMapCollisionForSpace's `{ ...base, ...authored }`
    // keeps the generated base's value, whose transitions could open ramps compiled blocks.
    const missingGround = (['terrainMinimumElevation', 'terrainTransitions', 'elevations', 'terrainPlaneBlocked'] as const)
      .filter(field => runtime.ground[field] === undefined);
    if (missingGround.length > 0) return { ok: false, reason: 'ground_fields_missing', detail: missingGround.join(','), key: runtime.key };
    // Presence is fixed at publication; compiled derives it for both media from the live registry policy.
    const active = source.traversalPolicyActive();
    const mismatched = MEDIA.filter(medium => (runtime[medium].traversalChannels !== undefined) !== active);
    if (mismatched.length > 0) {
      return { ok: false, reason: 'traversal_policy_mismatch', detail: `${mismatched.join(',')}: chunks ${!active}, registry ${active}`, key: runtime.key };
    }
    return lag.length === 0 ? resolution : { ...resolution, lag, lagDetail: lagDetail! };
  }

  /** Parse, validate and guard the published manifest once per shadow key. Every throw,
   * expected or not, is cached as a failed key so a bad row is not re-parsed per call. */
  #readManifest(shadow: ChunkShadowRowView, key: string): ManifestEntry {
    // A new publication: drop the previous runtime first, so only one is ever resident.
    this.#runtimeCache = null;
    const fail = (reason: ChunkAuthorityUnavailableReason, detail?: string): ManifestEntry =>
      ({ key, result: { ok: false, reason, ...(detail === undefined ? {} : { detail }) } });
    let entry: ManifestEntry;
    try {
      let parsed: unknown;
      try {
        parsed = JSON.parse(shadow.manifestJson);
      } catch (error) {
        parsed = undefined;
        entry = fail('manifest_invalid', message(error));
      }
      if (parsed !== undefined) {
        const raw = record(parsed) ? parsed : {};
        const document = record(raw['metadata']) && record(raw['metadata']['document']) ? raw['metadata']['document'] : {};
        const provenance = record(document['provenance']) ? document['provenance'] : null;
        // guard_space/guard_size/guard_base trust the manifest metadata. Publishing a shadow
        // (stageWorldChunkBlob, publishWorldChunkShadow) uses requireWorldOwner, which admits
        // admins as well as the owner; whether that is narrow enough is a question to settle
        // before `on`. S5b checks the metadata against the live document at publish time.
        if (raw['spaceId'] !== TOPSIDE_SPACE_ID) entry = fail('guard_space', String(raw['spaceId']));
        else if (raw['width'] !== this.#worldSize.width || raw['height'] !== this.#worldSize.height) entry = fail('guard_size', `${String(raw['width'])}x${String(raw['height'])}`);
        else if (provenance === null || !mapDocumentUsesSurvivalIslandBase({ provenance } as unknown as Pick<MapDocumentV3, 'provenance'>)) entry = fail('guard_base');
        else {
          let manifest: WorldChunkManifest | null = null;
          try {
            manifest = validateRuntimeManifest(parsed);
          } catch (error) {
            entry = fail('manifest_invalid', message(error));
          }
          if (manifest !== null) entry = { key, result: { ok: true, manifest } };
        }
      }
    } catch (error) {
      entry = fail('manifest_invalid', `unexpected: ${message(error)}`);
    }
    this.#manifestCache = entry!;
    return entry!;
  }

  #assemble(source: ChunkAuthoritySource, shadow: ChunkShadowRowView, manifest: WorldChunkManifest, key: string,
    registryContentHash: string): RuntimeEntry {
    this.#runtimeCache = null;
    let entry: RuntimeEntry;
    try {
      this.#logger.time('chunk_authority.assemble');
      try {
        // chunk_authority_metadata_missing (and any blob-independent validation) throws here.
        const runtime = assembleChunkLiveIslandRuntime(manifest, source.readBlob,
          { contentHash: registryContentHash }, { shadowRevision: shadow.revision, shadowContentHash: shadow.contentHash });
        entry = { key, resolution: { ok: true, runtime } };
        this.#logger.info({ event: 'chunk_authority_assembled', key: runtime.key, complete: runtime.complete, stale: runtime.stale,
          issues: runtime.issues.length, ...runtime.stats });
      } finally {
        this.#logger.timeEnd('chunk_authority.assemble');
      }
    } catch (error) {
      entry = { key, resolution: { ok: false, reason: 'assemble_failed', detail: message(error), key } };
    }
    this.#runtimeCache = entry;
    return entry;
  }

    /** Mode `off`: drop the resident chunk runtime (a few field writes, cheap on every call).
   * Switching back re-assembles once. */
  release(): void {
    this.#manifestCache = null;
    this.#runtimeCache = null;
  }

  #warnOnce(key: string, event: Readonly<Record<string, unknown>>): void {
    this.#once(key, 'warn', event);
  }

  #once(key: string, level: 'info' | 'warn', event: Readonly<Record<string, unknown>>): void {
    if (this.#loggedOnce.has(key)) return;
    // Bounded: a long-lived instance with churning keys never grows without limit.
    if (this.#loggedOnce.size >= 256) this.#loggedOnce.clear();
    this.#loggedOnce.add(key);
    this.#logger[level](event);
  }

  status(): ChunkAuthorityStatus {
    return {
      lastResolution: this.#lastResolution,
      fallbacks: { ...this.#fallbacks },
    };
  }
}
