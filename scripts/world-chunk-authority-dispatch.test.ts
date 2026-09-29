import { beforeAll, describe, expect, it } from 'vitest';
import { activeSurvivalLandmarks, bootstrapContentRegistry, createLiveIslandMapDocument, LIVE_ISLAND_MAP_ID, runtimeTraversalPolicy,
  serializeMapDocumentV3, TOPSIDE_SPACE_ID, type ContentRegistry } from '@orchard/sim';
import type { LiveMapDocumentRow } from '@orchard/engine/live-map-runtime';
import { decodeWorldChunk, WORLD_CHUNK_AUTHORITY_SCHEMA_V2 } from '@orchard/sim/world-chunk';
import { ChunkAuthorityDispatcher, type ChunkAuthorityLogger, type ChunkAuthoritySource, type CompiledCollisionRuntime } from '../packages/world/src/content/chunk-authority-dispatch.js';
import type { ChunkLiveIslandRuntime } from '../packages/world/src/content/chunk-authority-runtime.js';
import { chunkRuntimeParityFixture, collisionJson, liveRowsFixture, type ChunkRuntimeParityFixture, type LiveRowsFixture } from './world-chunk-runtime-parity.js';

/**
 * Static-world S2b/S3-final on the real bootstrap island (169 chunks): the dispatcher's runtime,
 * composed over the server's own solid island base, gives the same final collision as the compiled
 * reference over the precomputed island, live rows included; a missing chunk is unservable; and the
 * cold build (blob row copies as the host deserializes `t.array(t.u8())`, manifest parse, verify,
 * assemble) is timed inside one reducer-like `select` call. Nightly (heavy).
 */
describe('chunk authority dispatcher on the bootstrap island', () => {
  let fixture: ChunkRuntimeParityFixture;
  let row: LiveMapDocumentRow;
  let registry: ContentRegistry;
  let live: LiveRowsFixture;
  let rowBytes: Map<string, Uint8Array>;
  let manifestJson: string;
  const events: { level: string; event: Record<string, unknown> }[] = [];
  const logger: ChunkAuthorityLogger = {
    info: event => events.push({ level: 'info', event: { ...event } }),
    warn: event => events.push({ level: 'warn', event: { ...event } }),
    time: () => {}, timeEnd: () => {},
  };

  beforeAll(() => {
    registry = bootstrapContentRegistry();
    const document = createLiveIslandMapDocument({ landmarks: activeSurvivalLandmarks(registry, TOPSIDE_SPACE_ID) });
    row = { mapId: LIVE_ISLAND_MAP_ID, revision: document.revision, contentHash: 'dispatch-bootstrap', documentJson: serializeMapDocumentV3(document) };
    fixture = chunkRuntimeParityFixture(row, registry);
    live = liveRowsFixture(fixture.server, registry);
    rowBytes = new Map(fixture.blobs);
    manifestJson = JSON.stringify(fixture.published.manifest);
  }, 120_000);

  const compiled = (): CompiledCollisionRuntime => fixture.server.runtime;
  function source(missing?: string): ChunkAuthoritySource {
    return {
      shadow: () => ({ revision: 1, mapId: LIVE_ISLAND_MAP_ID, contentHash: registry.contentHash, manifestJson }),
      liveMap: () => ({ revision: row.revision, contentHash: row.contentHash }),
      registryContentHash: () => registry.contentHash,
      traversalPolicyActive: () => runtimeTraversalPolicy(registry) !== null,
      readBlob: hash => {
        const bytes = hash === missing ? undefined : rowBytes.get(hash);
        // What a reducer row read costs: spacetimedb 2.8.2 deserializes Array<U8> with a slice copy.
        return bytes === undefined ? undefined : bytes.slice();
      },
    };
  }

  it('on: serves the chunk runtime and composes the same final collision as compiled, live rows included', () => {
    const dispatcher = new ChunkAuthorityDispatcher({ logger });
    const runtime = dispatcher.select(source()) as ChunkLiveIslandRuntime;
    expect(dispatcher.status().fallbacks).toEqual({});
    expect(runtime.source).toBe('chunks');
    expect(runtime.stats).toMatchObject({ expectedChunks: 169, decodedChunks: 169 });
    // The publisher writes authority schema 2 (obstacle tables, BUG-044): parity below is against v2 blobs.
    expect(new Set([...fixture.blobs.values()].map(bytes => decodeWorldChunk(bytes).authoritySchema))).toEqual(new Set([WORLD_CHUNK_AUTHORITY_SCHEMA_V2]));
    for (const medium of ['ground', 'water'] as const) {
      const expected = fixture.server.composeWithLiveRows(medium, compiled(), live.rows);
      expect(collisionJson(fixture.server.composeWithLiveRows(medium, runtime, live.rows)), medium).toBe(collisionJson(expected));
    }
  }, 120_000);

  it('is unservable (null: the server fails safe) when one chunk blob is missing', () => {
    const dispatcher = new ChunkAuthorityDispatcher({ logger });
    const centre = fixture.published.manifest.chunks.find(head => head.cx === 6 && head.cy === 6)!;
    expect(dispatcher.select(source(centre.contentHash))).toBeNull();
    expect(dispatcher.status().fallbacks).toEqual({ incomplete: 1 });
  }, 120_000);

  it('times the cold and warm select', () => {
    const dispatcher = new ChunkAuthorityDispatcher({ logger });
    const coldStarted = performance.now();
    expect((dispatcher.select(source()) as ChunkLiveIslandRuntime).source).toBe('chunks');
    const coldMs = performance.now() - coldStarted;
    const warmStarted = performance.now();
    for (let call = 0; call < 20; call++) dispatcher.select(source());
    const warmMs = (performance.now() - warmStarted) / 20;
    const megabytes = [...fixture.blobs.values()].reduce((sum, bytes) => sum + bytes.byteLength, 0) / 1048576;
    console.info(`[S3-final] 169 chunks (${megabytes.toFixed(1)} MiB, manifest ${(manifestJson.length / 1024).toFixed(0)} KiB): `
      + `cold select (blob row copies, parse, verify, assemble) ${coldMs.toFixed(0)} ms; warm select ${warmMs.toFixed(2)} ms`);
    // Loose sanity bound only: the shared host is noisy.
    expect(coldMs).toBeLessThan(30_000);
  }, 120_000);
});
