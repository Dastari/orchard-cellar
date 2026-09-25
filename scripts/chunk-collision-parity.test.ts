import { activeSurvivalLandmarks, bootstrapContentRegistry, createLiveIslandMapDocument, LIVE_ISLAND_MAP_ID,
  serializeMapDocumentV3, TOPSIDE_SPACE_ID } from '@orchard/sim';
import { describeChunkCollisionParity } from './chunk-collision-parity.js';

// Static world S4d, nightly: client chunk collision (mode on) against the server
// on the bootstrap island. The authored document runs in chunk-collision-parity-authored.test.ts.
describeChunkCollisionParity('bootstrap island', () => {
  const registry = bootstrapContentRegistry();
  const document = createLiveIslandMapDocument({ landmarks: activeSurvivalLandmarks(registry, TOPSIDE_SPACE_ID) });
  return { registry, row: { mapId: LIVE_ISLAND_MAP_ID, revision: document.revision, contentHash: 'collision-bootstrap', documentJson: serializeMapDocumentV3(document) } };
});
