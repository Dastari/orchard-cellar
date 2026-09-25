import { expect, it } from 'vitest';
import { activeSurvivalLandmarks, bootstrapContentRegistry, createLiveIslandMapDocument, LIVE_ISLAND_MAP_ID,
  serializeMapDocumentV3, TOPSIDE_SPACE_ID } from '@orchard/sim';
import { verifyRuntimeChunk } from '@orchard/sim/chunk-runtime';
import { WORLD_CHUNK_SIZE, WORLD_CHUNK_VOID } from '@orchard/sim/world-chunk';
import { assembleChunkLiveIslandRuntime, compareLiveIslandRuntime } from '../packages/world/src/content/chunk-authority-runtime.js';
import { describeChunkRuntimeParity } from './world-chunk-runtime-parity.js';

describeChunkRuntimeParity('bootstrap island', () => {
  const registry = bootstrapContentRegistry();
  const document = createLiveIslandMapDocument({ landmarks: activeSurvivalLandmarks(registry, TOPSIDE_SPACE_ID) });
  return { registry, row: { mapId: LIVE_ISLAND_MAP_ID, revision: document.revision, contentHash: 'runtime-bootstrap', documentJson: serializeMapDocumentV3(document) } };
}, context => {
  it('fills a missing or corrupt chunk void and solid, reports it, and bounds the diff', () => {
    const { published, readBlob, registry, server } = context();
    const heads = published.manifest.chunks;
    const missing = heads.find(head => head.cx === 6 && head.cy === 6)!;
    const corrupt = heads.find(head => head.cx === 5 && head.cy === 6)!;
    const runtime = assembleChunkLiveIslandRuntime(published.manifest, hash => {
      if (hash === missing.contentHash) return undefined;
      const bytes = readBlob(hash);
      if (hash !== corrupt.contentHash || bytes === undefined) return bytes;
      const copy = bytes.slice(); copy[copy.length - 1] = copy[copy.length - 1]! ^ 1; return copy;
    }, registry);
    expect(runtime.complete).toBe(false);
    expect(runtime.issues).toEqual([
      { kind: 'blob_invalid', cx: 5, cy: 6, detail: 'World chunk hash mismatch' },
      { kind: 'blob_missing', cx: 6, cy: 6, detail: missing.contentHash },
    ]);
    expect(runtime.stats.decodedChunks).toBe(167);
    const { width, height } = runtime.ground;
    const planes = runtime.ground.terrainPlaneBlocked!.length / (width * height);
    for (const { cx, cy } of [missing, corrupt]) for (let y = 0; y < WORLD_CHUNK_SIZE; y++) for (let x = 0; x < WORLD_CHUNK_SIZE; x++) {
      const tileX = cx * WORLD_CHUNK_SIZE + x, tileY = cy * WORLD_CHUNK_SIZE + y, index = tileY * width + tileX;
      if (!runtime.ground.blocked[index] || !runtime.water.blocked[index] || runtime.ground.horseJumpableTerrain![index]
        || runtime.ground.traversalChannels!.medium[index] !== WORLD_CHUNK_VOID || runtime.ground.traversalChannels!.solidBlocked[index] !== 1
        || runtime.staticView.biomeAt(tileX, tileY) !== undefined
        || Array.from({ length: planes }, (_, plane) => runtime.ground.terrainPlaneBlocked![plane * width * height + index]).some(value => value !== 1)) {
        throw new Error(`Missing chunk cell ${tileX},${tileY} is not void and solid`);
      }
    }
    // The central chunks hold walkable land in the compiled runtime, so the bounded diff must see them.
    const diff = compareLiveIslandRuntime(runtime, server.runtime, 5);
    expect(diff.equal).toBe(false);
    const blocked = diff.fields['ground.blocked']!;
    expect(blocked.count).toBeGreaterThan(5);
    expect(blocked.samples).toHaveLength(5);
    expect(blocked.samples.every(sample => sample.a === 1 && sample.b === 0 && Math.floor(sample.tileX! / WORLD_CHUNK_SIZE) >= 5)).toBe(true);
    expect(Object.values(diff.fields).every(field => field.samples.length <= 5)).toBe(true);
    expect(diff.total).toBe(Object.values(diff.fields).reduce((sum, field) => sum + field.count, 0));
    expect(Object.keys(diff.fields)).toEqual(expect.arrayContaining(['ground.blocked', 'water.blocked', 'staticView.biomeAt']));
  }, 120_000);

  it('reports a head missing from the manifest and blobs without the authority extension', () => {
    const { published, readBlob, registry } = context();
    const manifest = { ...published.manifest, chunks: published.manifest.chunks.filter(head => !(head.cx === 0 && head.cy === 0)) };
    const runtime = assembleChunkLiveIslandRuntime(manifest, readBlob, registry, { shadowRevision: 7, shadowContentHash: 'older-content' });
    expect(runtime.issues).toEqual([{ kind: 'head_missing', cx: 0, cy: 0 }]);
    expect(runtime.stale).toBe(true);
    expect(runtime.key).toBe(`chunks:0:7:${manifest.sourceRevision}:${manifest.sourceHash}:${registry.contentHash}`);
    expect(runtime.ground.blocked[0]).toBe(true);
    // A manifest without authority metadata cannot be assembled at all.
    const metadata = Object.fromEntries(Object.entries(published.manifest.metadata).filter(([key]) => key !== 'authority'));
    expect(() => assembleChunkLiveIslandRuntime({ ...published.manifest, metadata }, readBlob, registry)).toThrow('chunk_authority_metadata_missing');
  }, 120_000);

  it('assembles all 169 chunks within the reducer budget (timing is reported, S2b cold build)', () => {
    const { assemble, assembleMs, published, readBlob } = context();
    const runs = [assembleMs];
    for (let run = 0; run < 3; run++) { const started = performance.now(); assemble(); runs.push(performance.now() - started); }
    const decodeStarted = performance.now();
    for (const head of published.manifest.chunks) verifyRuntimeChunk(readBlob(head.contentHash)!, published.manifest, head.cx, head.cy);
    const decodeMs = performance.now() - decodeStarted;
    const totalBytes = published.blobs.reduce((sum, bytes) => sum + bytes.byteLength, 0);
    console.info(`[S1b] assemble 169 chunks (${(totalBytes / 1048576).toFixed(1)} MiB): cold ${runs[0]!.toFixed(0)} ms, warm ${runs.slice(1).map(ms => ms.toFixed(0)).join('/')} ms; verify+decode alone ${decodeMs.toFixed(0)} ms`);
    // Loose sanity bound only: the shared host is noisy. The measured figure goes in the PR.
    expect(Math.min(...runs)).toBeLessThan(10_000);
  }, 120_000);
});
