import {
  LIVE_ISLAND_MAP_ID, mapDocumentUsesSurvivalIslandBase, positionCollides, positionCollidesTerrain, SURVIVAL_WORLD_SIZE,
  terrainPlaneAtPosition, TILE_SIZE_FIXED, TOPSIDE_SPACE_ID,
  type CollisionMap, type CollisionObstacle, type MapDocumentV3, type Vec2Fixed,
} from '@orchard/sim';
import { authorityObstacleKey, validateRuntimeManifest } from '@orchard/sim/chunk-runtime';
import type { WorldChunkManifest } from '@orchard/sim/world-chunk';
import {
  assembleChunkLiveIslandRuntime, compareLiveIslandRuntime,
  type ChunkLiveIslandRuntime, type LiveIslandCollisionRuntime, type LiveIslandRuntimeDisagreement,
} from './chunk-authority-runtime.js';

/**
 * Static-world S2b: the dual-read collision dispatcher behind the owner
 * `chunkAuthority` switch (`chunk-authority-setting.ts`).
 *
 * - `off` only calls `release()`: the server calls the compiled runtime directly.
 * - `shadow`: the compiled runtime stays authoritative. The chunk runtime is
 *   assembled from the published shadow (own cache, keyed by shadow revision and
 *   content hashes), compared in full once per (chunk key, compiled key), and
 *   sampled at player positions at most once per `sampleIntervalTicks`. Only logs;
 *   nothing is stored.
 * - `on`: the chunk runtime is served only when it is complete, fresh (map
 *   revision/hash and content hash still match the publication) and passes the
 *   compiled guards (topside, survival world size, survival island base, a live map
 *   row exists, the ground terrain fields compiled always sets, and traversal-policy
 *   presence on both media). Staleness is checked from the shadow row and manifest
 *   header before any blob is decoded. Anything else, including a throw while
 *   parsing or assembling, falls back to the compiled runtime and logs why. A partial
 *   runtime is never served: an obstacle anchored in a missing chunk would lose its
 *   overhang into present chunks and open walkable ground the compiled map blocks.
 *
 * State is per module instance (the host may recycle it; the next call rebuilds or
 * re-compares). Every failure is cached per key, so a broken publication costs one
 * attempt per key, not one per tick.
 */

/** The compiled runtime as the dispatcher sees it (the server's `LiveIslandRuntime`). */
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
  readonly mode: 'shadow' | 'on';
  readonly compiled: () => CompiledCollisionRuntime | null;
  /** `world_chunk_shadow` for topside, or null when nothing is published. */
  readonly shadow: () => ChunkShadowRowView | null;
  /** `live_map_document` for the live island, or null (seed bootstrap). */
  readonly liveMap: () => LiveMapRowView | null;
  readonly registryContentHash: () => string;
  /** Whether the CURRENT registry has a traversal policy (compiled derives traversal channels from it). */
  readonly traversalPolicyActive: () => boolean;
  readonly readBlob: (contentHash: string) => Uint8Array | undefined;
}

export type ChunkAuthorityUnavailableReason =
  | 'shadow_missing' | 'shadow_map_mismatch' | 'map_row_missing' | 'manifest_invalid' | 'assemble_failed'
  | 'guard_space' | 'guard_size' | 'guard_base' | 'incomplete' | 'stale_content' | 'stale_map' | 'traversal_policy_mismatch'
  | 'ground_fields_missing';

export type ChunkRuntimeResolution =
  | { readonly ok: true; readonly runtime: ChunkLiveIslandRuntime }
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
  /** Compiled guard: the survival world dimensions. Tests may use a small island. */
  readonly worldSize?: { readonly width: number; readonly height: number };
  /** Disagreement samples logged per window (full compare and per-tick sampler each). */
  readonly sampleLimit?: number;
  /** Per-tick sampler cadence (20 ticks is 1 Hz at the 20 Hz authority rate). */
  readonly sampleIntervalTicks?: bigint;
  /** Player positions compared per sampled tick. */
  readonly samplePositions?: number;
  /** Sampler log window: at most `sampleLimit` disagreement samples per window. */
  readonly sampleWindowTicks?: bigint;
}

export interface FinalCollisionPair {
  readonly ground: CollisionMap;
  readonly water: CollisionMap;
}

export interface PositionDisagreement {
  readonly medium: 'ground' | 'water';
  readonly x: number;
  readonly y: number;
  readonly tileX: number;
  readonly tileY: number;
  readonly field: string;
  readonly compiled: unknown;
  readonly chunks: unknown;
}

export interface ChunkAuthorityStatus {
  readonly lastResolution: { readonly ok: boolean; readonly reason?: ChunkAuthorityUnavailableReason; readonly key: string } | null;
  readonly fallbacks: Readonly<Record<string, number>>;
  readonly compares: number;
  readonly lastCompare: { readonly key: string; readonly equal: boolean; readonly total: number; readonly fields: Readonly<Record<string, number>> } | null;
  readonly sampledTicks: number;
  readonly sampledPositions: number;
  readonly sampleDisagreements: number;
  readonly loggedSamples: number;
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

/** First `limit` samples across all diff fields, each tagged with its field. */
export function flattenDisagreementSamples(fields: Readonly<Record<string, { readonly samples: readonly LiveIslandRuntimeDisagreement[] }>>,
  limit: number): (LiveIslandRuntimeDisagreement & { readonly field: string })[] {
  const out: (LiveIslandRuntimeDisagreement & { readonly field: string })[] = [];
  for (const [field, entry] of Object.entries(fields)) for (const sample of entry.samples) {
    if (out.length >= limit) return out;
    out.push({ field, ...sample });
  }
  return out;
}

function cellValue(values: ArrayLike<number | boolean> | undefined, index: number): number | 'absent' {
  if (values === undefined) return 'absent';
  const value = values[index];
  return value === undefined ? 'absent' : Number(value);
}

/** Obstacle keys (server order) whose boxes overlap the 3x3 tiles around a tile. */
function obstacleKeysNear(obstacles: readonly CollisionObstacle[] | undefined, tileX: number, tileY: number): string[] {
  const left = (tileX - 1) * TILE_SIZE_FIXED, top = (tileY - 1) * TILE_SIZE_FIXED;
  const right = (tileX + 2) * TILE_SIZE_FIXED - 1, bottom = (tileY + 2) * TILE_SIZE_FIXED - 1;
  const keys: string[] = [];
  for (const obstacle of obstacles ?? []) {
    if (obstacle.right < left || obstacle.left > right || obstacle.bottom < top || obstacle.top > bottom) continue;
    keys.push(authorityObstacleKey(obstacle));
  }
  return keys;
}

/**
 * Compares two final collision maps at one position: the answers movement uses
 * (terrain collision, full collision, terrain plane) and every per-cell channel of
 * the position's tile, plus the ordered obstacles near it. Pure; exported for tests
 * and the S2c soak.
 */
export function compareCollisionAtPosition(medium: 'ground' | 'water', position: Vec2Fixed, compiled: CollisionMap,
  chunks: CollisionMap): PositionDisagreement[] {
  const tileX = Math.floor(position.x / TILE_SIZE_FIXED), tileY = Math.floor(position.y / TILE_SIZE_FIXED);
  const out: PositionDisagreement[] = [];
  const note = (field: string, a: unknown, b: unknown): void => {
    if (a !== b) out.push({ medium, x: position.x, y: position.y, tileX, tileY, field, compiled: a, chunks: b });
  };
  note('positionCollides', positionCollides(position, compiled), positionCollides(position, chunks));
  note('positionCollidesTerrain', positionCollidesTerrain(position, compiled), positionCollidesTerrain(position, chunks));
  note('terrainPlane', terrainPlaneAtPosition(position, compiled), terrainPlaneAtPosition(position, chunks));
  note('width', compiled.width, chunks.width);
  note('height', compiled.height, chunks.height);
  if (tileX >= 0 && tileY >= 0 && tileX < compiled.width && tileY < compiled.height) {
    const index = tileY * compiled.width + tileX, size = compiled.width * compiled.height;
    note('blocked', cellValue(compiled.blocked, index), cellValue(chunks.blocked, index));
    note('elevations', cellValue(compiled.elevations, index), cellValue(chunks.elevations, index));
    note('horseJumpableTerrain', cellValue(compiled.horseJumpableTerrain, index), cellValue(chunks.horseJumpableTerrain, index));
    const planes = Math.max(compiled.terrainPlaneBlocked?.length ?? 0, chunks.terrainPlaneBlocked?.length ?? 0) / size;
    for (let plane = 0; plane < planes; plane++) {
      note(`terrainPlaneBlocked[${plane}]`, cellValue(compiled.terrainPlaneBlocked, plane * size + index), cellValue(chunks.terrainPlaneBlocked, plane * size + index));
    }
    note('traversalChannels.medium', cellValue(compiled.traversalChannels?.medium, index), cellValue(chunks.traversalChannels?.medium, index));
    note('traversalChannels.solidBlocked', cellValue(compiled.traversalChannels?.solidBlocked, index), cellValue(chunks.traversalChannels?.solidBlocked, index));
  }
  note('obstaclesNear', obstacleKeysNear(compiled.obstacles, tileX, tileY).join(','), obstacleKeysNear(chunks.obstacles, tileX, tileY).join(','));
  return out;
}

export class ChunkAuthorityDispatcher {
  readonly #logger: ChunkAuthorityLogger;
  readonly #worldSize: { readonly width: number; readonly height: number };
  readonly #sampleLimit: number;
  readonly #sampleIntervalTicks: bigint;
  readonly #samplePositions: number;
  readonly #sampleWindowTicks: bigint;
  #manifestCache: ManifestEntry | null = null;
  #runtimeCache: RuntimeEntry | null = null;
  readonly #loggedOnce = new Set<string>();
  readonly #compared = new Set<string>();
  readonly #fallbacks: Record<string, number> = {};
  #lastResolution: ChunkAuthorityStatus['lastResolution'] = null;
  #lastCompare: ChunkAuthorityStatus['lastCompare'] = null;
  #compares = 0;
  /** The fresh chunk runtime seen by the latest shadow select, for the per-tick sampler. */
  #shadowSampleRuntime: ChunkLiveIslandRuntime | null = null;
  #sampledTicks = 0;
  #sampledPositions = 0;
  #sampleDisagreements = 0;
  #loggedSamples = 0;
  #window: bigint | null = null;
  #windowLogged = 0;
  #windowSuppressed = 0;

  constructor(options: ChunkAuthorityDispatcherOptions = {}) {
    this.#logger = options.logger ?? consoleChunkAuthorityLogger;
    this.#worldSize = options.worldSize ?? { width: SURVIVAL_WORLD_SIZE, height: SURVIVAL_WORLD_SIZE };
    this.#sampleLimit = options.sampleLimit ?? 32;
    this.#sampleIntervalTicks = options.sampleIntervalTicks ?? 20n;
    this.#samplePositions = options.samplePositions ?? 8;
    this.#sampleWindowTicks = options.sampleWindowTicks ?? 1_200n;
  }

  /**
   * The collision runtime for this call. `shadow` always returns the compiled
   * runtime (after comparing, never throwing); `on` returns the chunk runtime only
   * when it resolves, else the compiled runtime.
   */
  select(source: ChunkAuthoritySource): LiveIslandCollisionRuntime | null {
    if (source.mode === 'shadow') {
      const compiled = source.compiled();
      try {
        this.#shadow(source, compiled);
      } catch (error) {
        this.#shadowSampleRuntime = null;
        this.#warnOnce('shadow_error', { event: 'chunk_authority_shadow_error', detail: message(error) });
      }
      return compiled;
    }
    this.#shadowSampleRuntime = null;
    let resolution: ChunkRuntimeResolution;
    try {
      resolution = this.resolve(source);
    } catch (error) {
      resolution = { ok: false, reason: 'assemble_failed', detail: message(error), key: 'unresolved' };
    }
    if (resolution.ok) {
      this.#once(`on:serving:${resolution.runtime.key}`, 'info', { event: 'chunk_authority_serving', key: resolution.runtime.key });
      return resolution.runtime;
    }
    this.#fallbacks[resolution.reason] = (this.#fallbacks[resolution.reason] ?? 0) + 1;
    this.#warnOnce(`on:${resolution.reason}:${resolution.key}`, {
      event: 'chunk_authority_fallback', reason: resolution.reason, key: resolution.key,
      ...(resolution.detail === undefined ? {} : { detail: resolution.detail }),
    });
    return source.compiled();
  }

  /**
   * Resolves the chunk runtime and every serving guard. Never throws for bad
   * published data: parse, validation and assembly failures become reasons.
   */
  resolve(source: ChunkAuthoritySource): ChunkRuntimeResolution {
    const shadow = source.shadow();
    const resolution = this.#resolveUnchecked(source, shadow);
    this.#lastResolution = resolution.ok
      ? { ok: true, key: resolution.runtime.key }
      : { ok: false, reason: resolution.reason, key: resolution.key };
    return resolution;
  }

  #resolveUnchecked(source: ChunkAuthoritySource, shadow: ChunkShadowRowView | null): ChunkRuntimeResolution {
    if (shadow === null) return { ok: false, reason: 'shadow_missing', key: 'none' };
    const preKey = `${shadow.revision}:${shadow.contentHash}`;
    if (shadow.mapId !== LIVE_ISLAND_MAP_ID) return { ok: false, reason: 'shadow_map_mismatch', detail: shadow.mapId, key: preKey };
    // Compiled guard: with no live map row the compiled runtime is the seed bootstrap,
    // and a publication always pins an existing row, so the chunks cannot describe it.
    const liveMap = source.liveMap();
    if (liveMap === null) return { ok: false, reason: 'map_row_missing', key: preKey };
    const manifestEntry = this.#manifestCache?.key === preKey ? this.#manifestCache : this.#readManifest(shadow, preKey);
    const read = manifestEntry.result;
    if (!read.ok) return { ok: false, reason: read.reason, key: preKey, ...(read.detail === undefined ? {} : { detail: read.detail }) };
    // Cheap staleness before any blob is decoded: a content or map publication since the
    // chunk publication refuses without paying for an assembly (0.2-0.7 s on the island).
    const registryContentHash = source.registryContentHash();
    const manifest = read.manifest;
    const stale: ChunkRuntimeResolution | null = shadow.contentHash !== registryContentHash
      ? { ok: false, reason: 'stale_content', detail: `published ${shadow.contentHash}, live ${registryContentHash}`, key: preKey }
      : manifest.sourceRevision !== liveMap.revision || manifest.sourceHash !== liveMap.contentHash
        ? { ok: false, reason: 'stale_map', detail: `published ${manifest.sourceRevision}:${manifest.sourceHash}, live ${liveMap.revision}:${liveMap.contentHash}`, key: preKey }
        : null;
    if (stale !== null) {
      // Nothing can serve until a republish: free the resident runtime.
      this.#runtimeCache = null;
      this.#shadowSampleRuntime = null;
      return stale;
    }
    const cacheKey = `${preKey}:${registryContentHash}`;
    const entry = this.#runtimeCache?.key === cacheKey ? this.#runtimeCache : this.#assemble(source, shadow, manifest, cacheKey, registryContentHash);
    const resolution = entry.resolution;
    if (!resolution.ok) return resolution;
    const runtime = resolution.runtime;
    if (!runtime.complete) {
      const issues = runtime.issues.slice(0, 4).map(issue => `${issue.kind}${issue.cx === undefined ? '' : `@${issue.cx},${issue.cy}`}${issue.detail === undefined ? '' : `:${issue.detail}`}`);
      return { ok: false, reason: 'incomplete', detail: `${runtime.issues.length} issue(s): ${issues.join('; ')}`, key: runtime.key };
    }
    if (runtime.stale) return { ok: false, reason: 'stale_content', detail: `published ${shadow.contentHash}, live ${registryContentHash}`, key: runtime.key };
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
    return resolution;
  }

  /** Parse, validate and guard the published manifest once per shadow key. Every throw,
   * expected or not, is cached as a failed key so a bad row is not re-parsed per call. */
  #readManifest(shadow: ChunkShadowRowView, key: string): ManifestEntry {
    // A new publication: drop the previous runtime first, so only one is ever resident.
    this.#runtimeCache = null;
    this.#shadowSampleRuntime = null;
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
        // guard_space/guard_size/guard_base trust the manifest metadata: only the owner can
        // publish, and S5b checks it against the live document at publish time.
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
    this.#shadowSampleRuntime = null;
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

  #shadow(source: ChunkAuthoritySource, compiled: CompiledCollisionRuntime | null): void {
    this.#shadowSampleRuntime = null;
    const resolution = this.resolve(source);
    if (!resolution.ok) {
      this.#warnOnce(`shadow:${resolution.reason}:${resolution.key}`, {
        event: 'chunk_authority_shadow_unavailable', reason: resolution.reason, key: resolution.key,
        ...(resolution.detail === undefined ? {} : { detail: resolution.detail }),
      });
      return;
    }
    const runtime = resolution.runtime;
    if (compiled === null) {
      this.#warnOnce(`shadow:compiled_null:${runtime.key}`, { event: 'chunk_authority_shadow_disagreement', key: runtime.key,
        detail: 'compiled runtime is null (its guards reject the live map) but the chunk runtime resolves' });
      return;
    }
    this.#shadowSampleRuntime = runtime;
    const compareKey = `${runtime.key}|${compiled.key}`;
    if (this.#compared.has(compareKey)) return;
    if (this.#compared.size >= 64) this.#compared.clear();
    this.#compared.add(compareKey);
    this.#logger.time('chunk_authority.compare');
    let diff;
    try {
      diff = compareLiveIslandRuntime(runtime, compiled, this.#sampleLimit);
    } finally {
      this.#logger.timeEnd('chunk_authority.compare');
    }
    this.#compares += 1;
    const fields = Object.fromEntries(Object.entries(diff.fields).map(([field, entry]) => [field, entry.count]));
    this.#lastCompare = { key: compareKey, equal: diff.equal, total: diff.total, fields };
    const event = { event: 'chunk_authority_shadow_compare', key: compareKey, equal: diff.equal, total: diff.total, fields,
      samples: flattenDisagreementSamples(diff.fields, this.#sampleLimit) };
    if (diff.equal) this.#logger.info(event); else this.#logger.warn(event);
  }

  /** Mode `off`: drop the resident chunk runtime and stop sampling (two field writes, so it
   * is cheap on every call). Switching back re-assembles once. */
  release(): void {
    this.#manifestCache = null;
    this.#runtimeCache = null;
    this.#shadowSampleRuntime = null;
  }

  /** The chunk runtime to sample this tick: shadow mode, a fresh runtime, and on cadence. */
  sampleRuntime(tick: bigint): ChunkLiveIslandRuntime | null {
    if (this.#shadowSampleRuntime === null || tick % this.#sampleIntervalTicks !== 0n) return null;
    return this.#shadowSampleRuntime;
  }

  /**
   * Compares final collision (live rows included) at up to `samplePositions`
   * positions, rotating through the players across sampled ticks. `chunkFinal`
   * builds the same maps with the chunk runtime; it runs only here. Never throws.
   */
  recordSample(tick: bigint, positions: readonly Vec2Fixed[], compiledFinal: FinalCollisionPair, chunkFinal: () => FinalCollisionPair): void {
    if (positions.length === 0) return;
    try {
      const chunks = chunkFinal();
      const count = Math.min(this.#samplePositions, positions.length);
      const start = Number((tick / this.#sampleIntervalTicks) % BigInt(positions.length));
      const disagreements: PositionDisagreement[] = [];
      for (let offset = 0; offset < count; offset++) {
        const position = positions[(start + offset) % positions.length]!;
        for (const medium of MEDIA) disagreements.push(...compareCollisionAtPosition(medium, position, compiledFinal[medium], chunks[medium]));
      }
      this.#sampledTicks += 1;
      this.#sampledPositions += count;
      this.#logSampleDisagreements(tick, disagreements);
    } catch (error) {
      this.#warnOnce('sample_error', { event: 'chunk_authority_sample_error', detail: message(error) });
    }
  }

  #logSampleDisagreements(tick: bigint, disagreements: readonly PositionDisagreement[]): void {
    const window = tick / this.#sampleWindowTicks;
    if (this.#window !== window) {
      if (this.#window !== null && this.#windowSuppressed > 0) {
        this.#logger.warn({ event: 'chunk_authority_sample_window', window: this.#window.toString(), logged: this.#windowLogged, suppressed: this.#windowSuppressed });
      }
      this.#window = window;
      this.#windowLogged = 0;
      this.#windowSuppressed = 0;
    }
    if (disagreements.length === 0) return;
    this.#sampleDisagreements += disagreements.length;
    const room = Math.max(0, this.#sampleLimit - this.#windowLogged);
    const logged = disagreements.slice(0, room);
    this.#windowSuppressed += disagreements.length - logged.length;
    if (logged.length === 0) return;
    this.#windowLogged += logged.length;
    this.#loggedSamples += logged.length;
    this.#logger.warn({ event: 'chunk_authority_sample_disagreement', tick: tick.toString(), key: this.#shadowSampleRuntime?.key ?? null, samples: logged });
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
      compares: this.#compares,
      lastCompare: this.#lastCompare,
      sampledTicks: this.#sampledTicks,
      sampledPositions: this.#sampledPositions,
      sampleDisagreements: this.#sampleDisagreements,
      loggedSamples: this.#loggedSamples,
    };
  }
}
