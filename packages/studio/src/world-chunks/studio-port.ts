import type { DbConnection } from '@orchard/world-bindings';
import { worldChunkHash } from '@orchard/sim/world-chunk';
import type { LiveMapPublicationPort } from './publication.js';
import type { ChunkMapBlobReader } from './map-head.js';
import { materializeLiveMapPublicationInWorker } from './publication-worker-client.js';

/** The game origin's atlas index, same-origin through the Studio proxy (vite.config.ts `studioProxy`). */
export const STUDIO_GAME_ATLAS_INDEX_PATH = '/game/atlas.packs.json';
const TOPSIDE_SPACE = 0n;

/** The game origin's chunk blobs, same-origin through the Studio proxy (`/game/world/` → `/world/`). */
export const STUDIO_GAME_WORLD_PREFIX = '/game/world/';

/**
 * Reads published chunk blobs for Studio (S7b-4): from the game origin first, and from the world
 * database (`readWorldChunkBlob`) when the origin does not have one yet (a fresh Studio publication).
 * The caller verifies the bytes against its manifest.
 */
export function studioChunkBlobReader(connection: DbConnection, fetchImpl: typeof fetch = fetch): ChunkMapBlobReader {
  return async head => {
    const response = await fetchImpl(`${STUDIO_GAME_WORLD_PREFIX}${head.spaceId}/${head.contentHash}.bin`, { cache: 'force-cache', credentials: 'omit' });
    if (response.ok) {
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength > head.byteLength) throw new Error('chunk_response_too_large');
      return bytes;
    }
    if (response.status !== 404) throw new Error(`chunk_fetch_${response.status}`);
    return connection.procedures.readWorldChunkBlob({ spaceId: BigInt(head.spaceId), cx: head.cx, cy: head.cy, contentHash: head.contentHash });
  };
}

/** The live world port for a Studio chunk publication over a connected Studio session. */
export function studioChunkPublicationPort(connection: DbConnection, fetchImpl: typeof fetch = fetch): LiveMapPublicationPort {
  return {
    publishedChunks: () => new Promise((resolve, reject) => {
      const handle = connection.subscriptionBuilder()
        .onApplied(() => {
          const shadow = connection.db.worldChunkShadow.spaceId.find(TOPSIDE_SPACE);
          const contentHashes = new Set([...connection.db.worldChunkHead.iter()]
            .filter(head => head.spaceId === TOPSIDE_SPACE).map(head => head.contentHash));
          let assetRevision: string | null = null;
          if (shadow !== null && shadow !== undefined) {
            try { assetRevision = String((JSON.parse(shadow.manifestJson) as { assetRevision?: unknown }).assetRevision ?? ''); } catch { assetRevision = ''; }
          }
          resolve({ revision: shadow === null || shadow === undefined ? 0 : Number(shadow.revision), contentHashes, assetRevision });
          if (handle.isActive()) handle.unsubscribe();
        })
        .onError(() => reject(new Error('chunk_publication_unavailable')))
        .subscribe([
          `SELECT * FROM world_chunk_shadow WHERE space_id = ${TOPSIDE_SPACE}`,
          `SELECT * FROM world_chunk_head WHERE space_id = ${TOPSIDE_SPACE}`,
        ]);
    }),
    atlasIndex: async () => {
      const response = await fetchImpl(STUDIO_GAME_ATLAS_INDEX_PATH, { cache: 'no-store', credentials: 'omit' });
      if (!response.ok) throw new Error('atlas_index_unavailable');
      return response.text();
    },
    assetRevisionOf: source => worldChunkHash(new TextEncoder().encode(source)),
    materialize: materializeLiveMapPublicationInWorker,
    stageBlob: async bytes => { await connection.reducers.stageWorldChunkBlob({ bytes }); },
    commit: async input => { await connection.reducers.publishLiveMapWithChunks(input); },
  };
}
