import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { activeSurvivalLandmarks, bootstrapContentRegistry, createLiveIslandMapDocument, LIVE_ISLAND_MAP_ID, serializeMapDocumentV3, TOPSIDE_SPACE_ID } from '@orchard/sim';
import { canonicalChunkJson, decodeWorldChunk, worldChunkHash } from '@orchard/sim/world-chunk';
import { captureWorldChunkSnapshot, materializeWorldChunks, verifyWorldChunkParity } from './materialize-world-chunks.js';

describe('static island materialization golden parity', () => {
  it('preserves authored cell-part stacks through the chunk TerrainArray adapter', () => {
    const registry = bootstrapContentRegistry();
    const base = createLiveIslandMapDocument({ landmarks: activeSurvivalLandmarks(registry, TOPSIDE_SPACE_ID) });
    const parts = [{ slot: 'water' as const, exact: { frame: 4 } }];
    const document = { ...base, cells: { ...base.cells, '400,400': { parts } } };
    const row = { mapId: LIVE_ISLAND_MAP_ID, revision: document.revision, contentHash: 'parts-golden', documentJson: serializeMapDocumentV3(document) };
    const snapshot = captureWorldChunkSnapshot(row, registry);
    expect(snapshot.terrain.cellParts?.get(400 * snapshot.terrain.width + 400)).toEqual(parts);
    const result = materializeWorldChunks(snapshot, row, registry);
    verifyWorldChunkParity(snapshot, result);
    const chunk = result.blobs.map(bytes => decodeWorldChunk(bytes)).find(chunk => chunk.cx === 6 && chunk.cy === 6)!;
    expect(chunk.cellParts?.[String(16 * 64 + 16)]).toEqual(parts);
  }, 120_000);
  it('reconstructs every seed/bootstrap channel, server collision and ordered record from 13×13 chunks', () => {
    const registry = bootstrapContentRegistry();
    const document = createLiveIslandMapDocument({ landmarks: activeSurvivalLandmarks(registry, TOPSIDE_SPACE_ID) });
    const row = { mapId: LIVE_ISLAND_MAP_ID, revision: document.revision, contentHash: 'bootstrap-golden', documentJson: serializeMapDocumentV3(document) };
    const snapshot = captureWorldChunkSnapshot(row, registry);
    const result = materializeWorldChunks(snapshot, row, registry, { includeServerOracle: true });
    expect(result.blobs).toHaveLength(169);
    for (let y = 357; y <= 361; y++) for (let x = 414; x <= 416; x++) {
      const index = y * snapshot.terrain.width + x;
      expect(snapshot.channels['medium']![index]).toBe(1); // waterfall: shallow_water
      expect(snapshot.channels['solidBlocked']![index]).toBe(0);
      expect(snapshot.channels['clientWater.blocked']![index]).toBe(1);
      expect(snapshot.channels['serverWater.blocked']![index]).toBe(0);
    }
    verifyWorldChunkParity(snapshot, result);
    const goldens = JSON.parse(readFileSync(new URL('./world-chunk-goldens.json', import.meta.url), 'utf8')) as Record<string, string>;
    for (const [name, values] of Object.entries(snapshot.channels)) {
      expect(worldChunkHash(new Uint8Array(values.buffer, values.byteOffset, values.byteLength)), name).toBe(goldens[name]);
    }
    expect(worldChunkHash(new TextEncoder().encode(canonicalChunkJson(snapshot.records))), 'ordered records').toBe(goldens['records']);
  }, 120_000);
});
