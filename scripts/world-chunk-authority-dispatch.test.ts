import { beforeAll, describe, expect, it } from 'vitest';
import { activeSurvivalLandmarks, bootstrapContentRegistry, createLiveIslandMapDocument, LIVE_ISLAND_MAP_ID, runtimeTraversalPolicy,
  serializeMapDocumentV3, TILE_SIZE_FIXED, TOPSIDE_SPACE_ID, type ContentRegistry } from '@orchard/sim';
import type { LiveMapDocumentRow } from '@orchard/engine/live-map-runtime';
import { ChunkAuthorityDispatcher, type ChunkAuthorityLogger, type ChunkAuthoritySource, type CompiledCollisionRuntime } from '../packages/world/src/content/chunk-authority-dispatch.js';
import type { ChunkLiveIslandRuntime } from '../packages/world/src/content/chunk-authority-runtime.js';
import { chunkRuntimeParityFixture, collisionJson, liveRowsFixture, type ChunkRuntimeParityFixture, type LiveRowsFixture } from './world-chunk-runtime-parity.js';

/**
 * Static-world S2b on the real bootstrap island (169 chunks): the dispatcher's `on`
 * runtime composes the same final collision as compiled at the call sites, `shadow`
 * compares equal with zero disagreement samples, and the cold build (blob row copies
 * as the host deserializes `t.array(t.u8())`, manifest parse, verify, assemble) plus the full
 * compare are timed inside one reducer-like `select` call. Nightly (heavy).
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
  function source(mode: 'shadow' | 'on', missing?: string): ChunkAuthoritySource {
    return {
      mode,
      compiled,
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
    const runtime = dispatcher.select(source('on')) as ChunkLiveIslandRuntime;
    expect(dispatcher.status().fallbacks).toEqual({});
    expect(runtime.source).toBe('chunks');
    expect(runtime.stats).toMatchObject({ expectedChunks: 169, decodedChunks: 169 });
    for (const medium of ['ground', 'water'] as const) {
      const expected = fixture.server.composeWithLiveRows(medium, compiled(), live.rows);
      expect(collisionJson(fixture.server.composeWithLiveRows(medium, runtime, live.rows)), medium).toBe(collisionJson(expected));
    }
  }, 120_000);

  it('on: falls back to compiled when one chunk blob is missing', () => {
    const dispatcher = new ChunkAuthorityDispatcher({ logger });
    const centre = fixture.published.manifest.chunks.find(head => head.cx === 6 && head.cy === 6)!;
    expect(dispatcher.select(source('on', centre.contentHash))).toBe(compiled());
    expect(dispatcher.status().fallbacks).toEqual({ incomplete: 1 });
  }, 120_000);

  it('shadow: compiled stays authoritative, the full compare and the player samples agree, and the cold build is timed', () => {
    events.length = 0;
    const dispatcher = new ChunkAuthorityDispatcher({ logger });
    const coldStarted = performance.now();
    expect(dispatcher.select(source('shadow'))).toBe(compiled());
    const coldMs = performance.now() - coldStarted;
    const warmStarted = performance.now();
    for (let call = 0; call < 20; call++) dispatcher.select(source('shadow'));
    const warmMs = (performance.now() - warmStarted) / 20;
    expect(dispatcher.status()).toMatchObject({ compares: 1, lastCompare: { equal: true, total: 0, fields: {} } });
    expect(events.filter(({ level }) => level === 'warn')).toEqual([]);

    // Assemble alone (on) versus assemble + full compare (shadow).
    const onDispatcher = new ChunkAuthorityDispatcher({ logger });
    const onStarted = performance.now();
    onDispatcher.select(source('on'));
    const onColdMs = performance.now() - onStarted;

    // Per-tick sampler at walkable tiles spread over the island, live rows included.
    const runtime = dispatcher.sampleRuntime(20n)!;
    expect(runtime.source).toBe('chunks');
    const finals = (value: unknown) => ({ ground: fixture.server.composeWithLiveRows('ground', value, live.rows), water: fixture.server.composeWithLiveRows('water', value, live.rows) });
    const compiledFinal = finals(compiled());
    const { width, height, blocked } = compiledFinal.ground;
    const positions: { x: number; y: number }[] = [];
    for (let tileY = 8; tileY < height && positions.length < 64; tileY += 37) for (let tileX = 8; tileX < width && positions.length < 64; tileX += 29) {
      if (!blocked[tileY * width + tileX]) positions.push({ x: tileX * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2, y: tileY * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2 });
    }
    expect(positions.length).toBeGreaterThan(16);
    const sampler = new ChunkAuthorityDispatcher({ logger, samplePositions: positions.length });
    sampler.select(source('shadow'));
    const sampleStarted = performance.now();
    sampler.recordSample(20n, positions, compiledFinal, () => finals(runtime));
    const sampleMs = performance.now() - sampleStarted;
    expect(sampler.status()).toMatchObject({ sampledPositions: positions.length, sampleDisagreements: 0 });
    // The sampler is not vacuous: a chunk map that lost the obstacles is caught at an obstacle.
    const obstacle = compiledFinal.ground.obstacles![0]!;
    const probe = { x: Math.floor((obstacle.left + obstacle.right) / 2), y: Math.floor((obstacle.top + obstacle.bottom) / 2) };
    const lost = { ...compiledFinal, ground: { ...compiledFinal.ground, obstacles: [] } };
    sampler.recordSample(40n, [probe], compiledFinal, () => lost);
    expect(sampler.status().sampleDisagreements).toBeGreaterThan(0);

    const megabytes = [...fixture.blobs.values()].reduce((sum, bytes) => sum + bytes.byteLength, 0) / 1048576;
    console.info(`[S2b] 169 chunks (${megabytes.toFixed(1)} MiB, manifest ${(manifestJson.length / 1024).toFixed(0)} KiB): `
      + `shadow cold select (blob row copies, parse, verify, assemble, full compare) ${coldMs.toFixed(0)} ms; `
      + `on cold select (assemble only) ${onColdMs.toFixed(0)} ms; warm select ${warmMs.toFixed(2)} ms; `
      + `per-tick sample of ${positions.length} positions x 2 media ${sampleMs.toFixed(1)} ms`);
    // Loose sanity bound only: the shared host is noisy. The measured figures go in the PR.
    expect(coldMs).toBeLessThan(30_000);
  }, 120_000);
});
