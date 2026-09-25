import { worldChunkHasAuthority, WORLD_CHUNK_SIZE, WORLD_CHUNK_STRIDE, WORLD_CHUNK_VOID, decodeWorldChunk, type WorldChunk, type WorldChunkAuthorityObstacle,
  type WorldChunkAuthoritySuppressedObstacle, type WorldChunkManifest } from './world-chunk.js';
import type { CollisionObstacle } from './state.js';

export const CHUNK_RUNTIME_MAX_BLOB_BYTES = 1024 * 1024;
export const CHUNK_RUNTIME_MAX_HEADS = 4096;
export function chunkKey(cx: number, cy: number): string { return `${cx}:${cy}`; }
export function chunkBlobPath(spaceId: number, hash: string): string {
  if (!Number.isSafeInteger(spaceId) || spaceId < 0 || !/^[a-f0-9]{64}$/u.test(hash)) throw new Error('invalid_chunk_address');
  return `/world/${spaceId}/${hash}.bin`;
}
export function validateRuntimeManifest(raw: unknown): WorldChunkManifest {
  if (raw === null || typeof raw !== 'object') throw new Error('invalid_chunk_manifest');
  const value = raw as WorldChunkManifest;
  if (value.schema !== 1 || value.chunkSize !== WORLD_CHUNK_SIZE || !Number.isSafeInteger(value.spaceId) || value.spaceId < 0
    || !Number.isSafeInteger(value.width) || value.width < 1 || !Number.isSafeInteger(value.height) || value.height < 1
    || value.width * value.height > 16_777_216 || !Number.isSafeInteger(value.sourceRevision) || value.sourceRevision < 0
    || typeof value.sourceHash !== 'string' || !value.sourceHash || typeof value.assetRevision !== 'string' || !value.assetRevision
    || !value.metadata || typeof value.metadata !== 'object' || !Array.isArray(value.chunks)
    || value.chunks.length < 1 || value.chunks.length > CHUNK_RUNTIME_MAX_HEADS) throw new Error('invalid_chunk_manifest');
  const seen = new Set<string>();
  for (const head of value.chunks) {
    if (!head || !Number.isSafeInteger(head.cx) || !Number.isSafeInteger(head.cy)
      || !Number.isSafeInteger(head.byteLength) || head.byteLength < 44 || head.byteLength > CHUNK_RUNTIME_MAX_BLOB_BYTES
      || !/^[a-f0-9]{64}$/u.test(head.contentHash) || seen.has(chunkKey(head.cx, head.cy))) throw new Error('invalid_chunk_head');
    seen.add(chunkKey(head.cx, head.cy));
  }
  return value;
}
export function verifyRuntimeChunk(bytes: Uint8Array, manifest: WorldChunkManifest, cx: number, cy: number): WorldChunk {
  const head = manifest.chunks.find(row => row.cx === cx && row.cy === cy);
  if (!head || bytes.byteLength !== head.byteLength || bytes.byteLength > CHUNK_RUNTIME_MAX_BLOB_BYTES) throw new Error('chunk_size_or_head_mismatch');
  const chunk = decodeWorldChunk(bytes, head.contentHash);
  if (chunk.spaceId !== manifest.spaceId || chunk.cx !== cx || chunk.cy !== cy || chunk.assetRevision !== manifest.assetRevision
    || chunk.mediumSchema !== 1) throw new Error('chunk_revision_mismatch');
  return chunk;
}
/** Static server-authoritative cell values from the `authoritySchema` extension.
 * Obstacles, suppression and terrain planes are records/planes composed by the caller. */
export interface ChunkAuthoritySample {
  readonly groundBlocked: boolean;
  readonly groundElevation: number;
  readonly groundHorseJumpable: boolean;
  readonly waterBlocked: boolean;
  /** 0 when unclassified, otherwise 1 + index into manifest metadata.authority.combatRegions. */
  readonly combatRegion: number;
}
export interface ChunkCollisionSample { readonly ready: boolean; readonly elevation: number | null; readonly medium: number; readonly solidBlocked: boolean; readonly legacyGroundBlocked: boolean; readonly legacyWaterBlocked: boolean;
  /** Present only for blobs carrying the authority extension. */
  readonly authority?: ChunkAuthoritySample }
export const MISSING_CHUNK_SAMPLE: ChunkCollisionSample = Object.freeze({ ready: false, elevation: null, medium: WORLD_CHUNK_VOID, solidBlocked: true, legacyGroundBlocked: true, legacyWaterBlocked: true });
/** Chunk-local channels only; traversal abilities and dynamic overlays belong to D6/the caller. */
export function sampleChunkCollision(chunk: WorldChunk | undefined, tileX: number, tileY: number): ChunkCollisionSample {
  if (!chunk || !Number.isSafeInteger(tileX) || !Number.isSafeInteger(tileY)) return MISSING_CHUNK_SAMPLE;
  const x = tileX - chunk.cx * WORLD_CHUNK_SIZE + 1, y = tileY - chunk.cy * WORLD_CHUNK_SIZE + 1;
  if (x < 0 || y < 0 || x >= WORLD_CHUNK_STRIDE || y >= WORLD_CHUNK_STRIDE) return MISSING_CHUNK_SAMPLE;
  const index = y * WORLD_CHUNK_STRIDE + x;
  const medium = chunk.arrays['medium']?.[index], solid = chunk.arrays['solidBlocked']?.[index];
  if (medium === undefined || solid === undefined) return MISSING_CHUNK_SAMPLE;
  const arrays = chunk.arrays;
  return { ready: true, elevation: arrays['elevations']?.[index] ?? null, medium, solidBlocked: solid !== 0,
    legacyGroundBlocked: arrays['clientGround.blocked']?.[index] !== 0,
    legacyWaterBlocked: arrays['clientWater.blocked']?.[index] !== 0,
    // The decoder has validated every authority channel whenever the schema is present.
    ...(!worldChunkHasAuthority(chunk) ? {} : { authority: {
      groundBlocked: arrays['authority.ground.blocked']![index] !== 0,
      groundElevation: arrays['authority.ground.elevations']![index]!,
      groundHorseJumpable: arrays['authority.ground.horseJumpableTerrain']![index] !== 0,
      waterBlocked: arrays['authority.water.blocked']![index] !== 0,
      combatRegion: arrays['authority.combatRegion']![index]!,
    } }) };
}
/** The server's suppressed-decoration key (`left:top:right:bottom`, fixed point). */
export function authorityObstacleKey(box: CollisionObstacle): string {
  return `${box.left}:${box.top}:${box.right}:${box.bottom}`;
}
/** Composes one medium exactly as the server's liveMapCollisionForSpace does:
 * every base obstacle (static records, then any live rows in their server order)
 * is filtered by the suppressed keys, then the authored group is appended.
 * `obstacles` must be the complete record set in ordinal order. */
export function composeAuthorityObstacles(
  obstacles: readonly WorldChunkAuthorityObstacle[],
  suppressed: readonly WorldChunkAuthoritySuppressedObstacle[],
  medium: 'ground' | 'water',
  liveBaseObstacles: readonly CollisionObstacle[] = [],
): CollisionObstacle[] {
  const base: CollisionObstacle[] = [], authored: CollisionObstacle[] = [];
  for (const obstacle of obstacles) {
    const group = obstacle.group === 'base' ? base : authored;
    if (obstacle.ordinal !== group.length || (obstacle.group === 'base' && authored.length > 0)) throw new Error('authority_obstacle_order');
    group.push({ left: obstacle.left, top: obstacle.top, right: obstacle.right, bottom: obstacle.bottom });
  }
  const keys = new Set(suppressed.filter(row => row.medium === medium).map(authorityObstacleKey));
  return [...[...base, ...liveBaseObstacles].filter(obstacle => !keys.has(authorityObstacleKey(obstacle))), ...authored];
}
/** Client chunk runtime modes. `off` is the legacy path; `shadow` loads chunks for
 * diagnostics only; `on` follows published heads. Whether an `on` build may ship to
 * players is decided by the client build gate's reviewed release flag, and at run
 * time the client still follows the server's public chunkAuthority. */
export const CHUNK_RUNTIME_MODES = ['off', 'shadow', 'on'] as const;
export type ChunkRuntimeMode = typeof CHUNK_RUNTIME_MODES[number];
export function assertChunkRuntimeMode(mode: string): asserts mode is ChunkRuntimeMode {
  if (!(CHUNK_RUNTIME_MODES as readonly string[]).includes(mode)) throw new Error('chunk_runtime_mode_invalid');
}
/** Unset or empty means `off`; anything else must be an exact mode name. */
export function parseChunkRuntimeMode(raw: string | undefined): ChunkRuntimeMode {
  const mode = raw ?? '';
  if (mode === '') return 'off';
  assertChunkRuntimeMode(mode);
  return mode;
}
