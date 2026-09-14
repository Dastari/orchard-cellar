import {
  LIVE_ISLAND_MAP_ID,
  SURVIVAL_WORLD_SEED,
  SURVIVAL_WORLD_SIZE,
  SURVIVAL_WORLD_VERSION,
  compileMapDocument,
  terrainDocumentForMapV3,
  type MapDocumentV3,
} from '@orchard/sim';
import { terrainArrayForMapDocument } from '@orchard/engine/editor-terrain';
import { liveIslandUsesGeneratedTerrain } from '@orchard/engine/live-map-runtime';
import { terrainForWorld, type TerrainArray } from '@orchard/engine/terrain';
import { isStudioCanonicalLiveIslandTerrain } from './editor-live-island-bootstrap.js';
import {
  OFFLINE_TERRAIN_AUTHORING_PALETTE,
  type TerrainAuthoringPalette,
} from './terrain-authoring-palette.js';

const EDITOR_SPACE_ID = 4_200_001;
const terrainByDocument = new WeakMap<MapDocumentV3, Map<string, TerrainArray>>();

/** True only for the normalized, generator-owned production terrain. Content
 * rows may differ; they are not part of MapDocumentV2 terrain validation. */
export function mapEditorCanReuseGeneratedTerrain(document: MapDocumentV3): boolean {
  return isStudioCanonicalLiveIslandTerrain(document) || (document.id === LIVE_ISLAND_MAP_ID
    && document.width === SURVIVAL_WORLD_SIZE
    && document.height === SURVIVAL_WORLD_SIZE
    && liveIslandUsesGeneratedTerrain(document));
}

/**
 * Builds the visual terrain used by Studio. An untouched live-island document
 * is the generator output by definition, so compiling all 832x832 sparse map
 * cells again cannot change its pixels. Reusing the engine's generator cache
 * also keeps Studio and the game on the same terrain source of truth.
 */
export function buildMapEditorTerrain(
  document: MapDocumentV3,
  palette: TerrainAuthoringPalette = OFFLINE_TERRAIN_AUTHORING_PALETTE,
): TerrainArray {
  const cached = terrainByDocument.get(document)?.get(palette.contentKey);
  if (cached !== undefined) return cached;

  let terrain: TerrainArray;
  if (mapEditorCanReuseGeneratedTerrain(document)) {
    const seed = document.provenance.generatorSeed ?? SURVIVAL_WORLD_SEED;
    const generatorVersion = document.provenance.generatorVersion ?? SURVIVAL_WORLD_VERSION;
    terrain = {
      ...terrainForWorld(seed, generatorVersion),
      spaceId: EDITOR_SPACE_ID,
      version: document.revision,
      defaultCliffFamily: document.defaultCliffFamily,
      defaultSurfaceFamily: document.defaultSurfaceFamily,
      terrainTransitions: document.transitions,
      ...(palette.mode === 'live' ? { tilesets: palette.resolver } : {}),
    };
  } else {
    const terrainDocument = terrainDocumentForMapV3(document);
    terrain = terrainArrayForMapDocument(
      terrainDocument,
      palette.mode === 'live' ? compileMapDocument(terrainDocument, palette.resolver) : undefined,
      document,
      { includeTerrainPlaneCollision: false },
    );
  }
  let byContent = terrainByDocument.get(document);
  if (byContent === undefined) {
    byContent = new Map();
    terrainByDocument.set(document, byContent);
  }
  byContent.set(palette.contentKey, terrain);
  return terrain;
}
