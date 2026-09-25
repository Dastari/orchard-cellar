import { beforeAll, describe, expect, it } from 'vitest';
import { activeSurvivalLandmarks, bootstrapContentRegistry, createLiveIslandMapDocument, createMapPrefabDocument, LIVE_ISLAND_MAP_ID,
  serializeMapDocumentV3, TOPSIDE_SPACE_ID, type ContentRegistry, type MapDocumentV3, type MapPrefabDocumentV2 } from '@orchard/sim';
import { CHUNK_RUNTIME_MAX_BLOB_BYTES, verifyRuntimeChunk } from '@orchard/sim/chunk-runtime';
import { decodeWorldChunk, encodeWorldChunk, WORLD_CHUNK_SIZE, type WorldChunk } from '@orchard/sim/world-chunk';
import type { LiveMapDocumentRow } from '@orchard/engine/live-map-runtime';
import { compareLiveIslandRuntime } from '../packages/world/src/content/chunk-authority-runtime.js';
import { validateShadowBlob } from '../packages/world/src/content/chunk-shadow-runtime.js';
import { materializeWorldChunks, verifyWorldChunkParity } from './materialize-world-chunks.js';
import { chunkRuntimeParityFixture, collisionJson, type ChunkRuntimeParityFixture } from './world-chunk-runtime-parity.js';

/**
 * BUG-044 regression gate: production-like prefab collision density. The 2026-09-22 production
 * map has 790 prefab objects with 5,104 collision sub-cell boxes in chunk (2,6); as authority
 * schema 1 (each box three times as JSON records) that chunk was 2.9 MB, over the 1 MiB runtime
 * cap. This synthetic document is denser: 400 fully solid 1x1 prefabs (6,400 sub-cell boxes) in
 * chunk (2,6), plus a strip of 2x1 part-solid prefabs straddling the (2,6)/(3,6) edge.
 */
const DENSE_CHUNK = { cx: 2, cy: 6 } as const;
function denseRow(registry: ContentRegistry): LiveMapDocumentRow {
  const base = createLiveIslandMapDocument({ landmarks: activeSurvivalLandmarks(registry, TOPSIDE_SPACE_ID) });
  const wall: MapPrefabDocumentV2 = { ...createMapPrefabDocument({ id: 'dense-wall', title: 'Dense wall', width: 1, height: 1 }),
    pivot: { tileX: 0, tileY: 0 }, cells: [{ id: 'cell', tileX: 0, tileY: 0, elevation: 0, collisionMask: 0xffff }] };
  const fence: MapPrefabDocumentV2 = { ...createMapPrefabDocument({ id: 'dense-fence', title: 'Dense fence', width: 2, height: 1 }),
    pivot: { tileX: 0, tileY: 0 }, cells: [{ id: 'a', tileX: 0, tileY: 0, elevation: 0, collisionMask: 0x0ff0 },
      { id: 'b', tileX: 1, tileY: 0, elevation: 0, collisionMask: 0x0660 }] };
  const originX = DENSE_CHUNK.cx * WORLD_CHUNK_SIZE + 10, originY = DENSE_CHUNK.cy * WORLD_CHUNK_SIZE + 10;
  const object = (id: string, prefab: MapPrefabDocumentV2, tileX: number, tileY: number) => ({ id, prefabId: prefab.id, prefabRevision: prefab.revision,
    tileX, tileY, elevation: 0, layer: 'ground' as const, enabled: true, quarterTurns: 0 as const, flipX: false });
  const walls = Array.from({ length: 400 }, (_, index) => object(`wall-${index}`, wall, originX + index % 20, originY + Math.floor(index / 20)));
  const edge = (DENSE_CHUNK.cx + 1) * WORLD_CHUNK_SIZE - 1;
  const fences = Array.from({ length: 30 }, (_, index) => object(`fence-${index}`, fence, edge, originY + index));
  const document: MapDocumentV3 = { ...base, prefabs: [...base.prefabs, wall, fence], objects: [...base.objects, ...walls, ...fences] };
  return { mapId: LIVE_ISLAND_MAP_ID, revision: document.revision, contentHash: 'dense-prefab-collision', documentJson: serializeMapDocumentV3(document) };
}

describe('chunk blobs under production-like prefab collision density (BUG-044)', () => {
  let registry: ContentRegistry;
  let row: LiveMapDocumentRow;
  let fixture: ChunkRuntimeParityFixture;
  beforeAll(() => {
    registry = bootstrapContentRegistry();
    row = denseRow(registry);
    fixture = chunkRuntimeParityFixture(row, registry);
  }, 180_000);

  it('is denser than production: over 6,000 prefab sub-cell boxes in one chunk, over the cap as authority schema 1', () => {
    const { published } = fixture;
    const index = published.manifest.chunks.findIndex(head => head.cx === DENSE_CHUNK.cx && head.cy === DENSE_CHUNK.cy);
    const chunk = decodeWorldChunk(published.blobs[index]!);
    expect(chunk.authoritySchema).toBe(2);
    const authored = chunk.records.filter(record => record.kind === 'authority.ground.obstacle' && (record.value as { sourceId: string }).sourceId.startsWith('object:'));
    expect(authored.length).toBeGreaterThan(6_000);
    expect(chunk.records.filter(record => record.kind === 'clientGround.obstacle').length).toBeGreaterThan(6_000);
    expect(chunk.records.filter(record => record.kind === 'clientWater.obstacle').length).toBeGreaterThan(6_000);
    // The same chunk in the version-1 encoding (every obstacle three times as JSON) breaks the cap.
    expect(encodeWorldChunk({ ...chunk, authoritySchema: 1 }).length).toBeGreaterThan(CHUNK_RUNTIME_MAX_BLOB_BYTES);
  });

  it('keeps every published blob within the 1 MiB runtime cap, accepted by the runtime and shadow validators', () => {
    const { published } = fixture;
    expect(published.blobs).toHaveLength(169);
    for (const [index, bytes] of published.blobs.entries()) {
      const head = published.manifest.chunks[index]!;
      expect(bytes.length, `${head.cx},${head.cy}`).toBeLessThanOrEqual(CHUNK_RUNTIME_MAX_BLOB_BYTES);
      expect(verifyRuntimeChunk(bytes, published.manifest, head.cx, head.cy).authoritySchema).toBe(2);
      expect(validateShadowBlob(bytes).contentHash).toBe(head.contentHash);
    }
  });

  it('matches the server oracle exactly: materializer parity and the S1b assembler', () => {
    const { snapshot, published, server } = fixture;
    verifyWorldChunkParity(snapshot, published);
    const runtime = fixture.assemble();
    expect(runtime.issues).toEqual([]);
    expect(runtime.complete).toBe(true);
    const diff = compareLiveIslandRuntime(runtime, server.runtime);
    expect(diff.fields).toEqual({});
    expect(diff.equal).toBe(true);
    for (const medium of ['ground', 'water'] as const) expect(collisionJson(runtime[medium]), medium).toBe(collisionJson(server.runtime[medium]));
  }, 120_000);

  it('decodes every chunk identically from the version-1 encoding, within the per-chunk decode budget', () => {
    const { snapshot, published } = fixture;
    const legacy = materializeWorldChunks(snapshot, row, registry, { authoritySchema: 1 });
    const times: number[] = [];
    const comparable = (chunk: WorldChunk) => ({ ...chunk, contentHash: '', authoritySchema: 0 });
    for (const [index, bytes] of published.blobs.entries()) {
      const v1 = decodeWorldChunk(legacy.blobs[index]!);
      let best = Infinity, decoded = decodeWorldChunk(bytes);
      for (let round = 0; round < 3; round++) {
        const started = performance.now();
        decoded = decodeWorldChunk(bytes);
        best = Math.min(best, performance.now() - started);
      }
      times.push(best);
      expect([v1.authoritySchema, decoded.authoritySchema]).toEqual([1, 2]);
      expect(comparable(decoded)).toEqual(comparable(v1));
    }
    // Plan budget: 4 ms per chunk. Enforced where timing is meaningful (nightly,
    // ORCHARD_TIMING_BUDGETS=1: no coverage, one file at a time); loose otherwise.
    expect(Math.max(...times)).toBeLessThanOrEqual(process.env.ORCHARD_TIMING_BUDGETS === '1' ? 4 : 50);
  }, 120_000);
});
