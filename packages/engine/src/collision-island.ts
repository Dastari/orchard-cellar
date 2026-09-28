import {
  activeSurvivalLandmarks, createLiveIslandMapDocument, generateSurvivalDecorations, mapDocumentTraversalChannels,
  survivalTerrainPlaneCollisionBytes, TOPSIDE_SPACE_ID,
} from '@orchard/sim';
import type { IslandCollisionGenerators } from './collision.js';

/** The island generator's collision inputs for a whole-map (generated) topside terrain (static
 * world S6). Engine tests and tools only: the game client collides with chunk windows and must
 * never import this module (the generator-free build check enforces it). */
export const islandCollisionGenerators: IslandCollisionGenerators = {
  decorations: (seed, registry) => generateSurvivalDecorations(seed, registry),
  traversalChannels: (seed, registry) => mapDocumentTraversalChannels(
    createLiveIslandMapDocument({ seed, landmarks: activeSurvivalLandmarks(registry, TOPSIDE_SPACE_ID) })),
  planeBlocked: seed => survivalTerrainPlaneCollisionBytes(seed),
};
