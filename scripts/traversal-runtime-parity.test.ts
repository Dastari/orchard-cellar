import { describe, expect, it } from 'vitest';
import { activeSurvivalLandmarks, bootstrapContentRegistry, createLiveIslandMapDocument, LIVE_ISLAND_MAP_ID,
  serializeMapDocumentV3, TOPSIDE_SPACE_ID, mapDocumentTraversalChannels, mapTraversalChannels, compileMapDocument,
  terrainDocumentForMapV3, runtimeTilesetResolver, runtimeTraversalPolicy, mediumTraversalCollision, RULE_MEDIA } from '@orchard/sim';
import { captureWorldChunkSnapshot } from './materialize-world-chunks.js';

describe('D6 runtime medium parity', () => {
  it('uses identical generated/compiled/chunk media and resolves the legacy waterfall boat disagreement', () => {
    const registry = bootstrapContentRegistry();
    const document = createLiveIslandMapDocument({ landmarks: activeSurvivalLandmarks(registry, TOPSIDE_SPACE_ID) });
    const snapshot = captureWorldChunkSnapshot({ mapId: LIVE_ISLAND_MAP_ID, revision: document.revision,
      contentHash: 'd6-parity', documentJson: serializeMapDocumentV3(document) }, registry);
    const generated = mapDocumentTraversalChannels(document);
    const compiled = mapTraversalChannels(document, compileMapDocument(terrainDocumentForMapV3(document), runtimeTilesetResolver(registry.tilesets)));
    const differences = Array.from({length: document.width * document.height}, (_, index) => index).filter(index => generated.medium[index] !== compiled.medium[index] || generated.solidBlocked[index] !== compiled.solidBlocked[index]);
    expect(differences.slice(0, 20).map(index => ({ x: index % document.width, y: Math.floor(index / document.width), gm: generated.medium[index], cm: compiled.medium[index], gs: generated.solidBlocked[index], cs: compiled.solidBlocked[index] }))).toEqual([]);
    expect(generated.medium).toEqual(snapshot.channels['medium']);
    expect(generated.solidBlocked).toEqual(snapshot.channels['solidBlocked']);
    const policy = runtimeTraversalPolicy(registry)!;
    const client = mediumTraversalCollision(snapshot.collisions.clientGround, generated, new Set(['boat']), policy.media);
    const server = mediumTraversalCollision(snapshot.collisions.serverGround, compiled, new Set(['boat']), policy.media);
    expect(client.blocked).toEqual(server.blocked);
    for (let y = 357; y <= 361; y++) for (let x = 414; x <= 416; x++) {
      const index = y * document.width + x;
      expect(generated.medium[index]).toBe(RULE_MEDIA.indexOf('shallow_water'));
      expect(generated.solidBlocked[index]).toBe(0);
      expect(snapshot.collisions.clientWater.blocked[index]).toBe(true);
      expect(snapshot.collisions.serverWater.blocked[index]).toBe(false);
      expect(client.blocked[index]).toBe(false);
      expect(server.blocked[index]).toBe(false);
    }
  }, 120_000);
});
