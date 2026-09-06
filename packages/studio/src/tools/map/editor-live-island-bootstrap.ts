import {
  LIVE_ISLAND_MAP_ID,
  MAP_DOCUMENT_SCHEMA_VERSION,
  SURVIVAL_ISLAND_MAP_GENERATOR,
  SURVIVAL_WORLD_SEED,
  SURVIVAL_WORLD_SIZE,
  SURVIVAL_WORLD_VERSION,
  migrateMapDocumentV2,
  type MapDocumentV3,
  type TerrainTransition,
} from '@orchard/sim';

type CanonicalTransitionTuple = readonly [
  contourLevel: number,
  kind: TerrainTransition['kind'],
  lowerTileX: number,
  lowerTileY: number,
  upperTileX: number,
  upperTileY: number,
];

/** Generator-derived golden for seed 0x4f434852 / world version 30. Keeping
 * this tiny bootstrap beside Studio avoids generating the entire elevation
 * field before its terrain worker can start. The parity test deliberately
 * fails if the canonical generator output ever changes. */
const CANONICAL_TRANSITION_TUPLES: readonly CanonicalTransitionTuple[] = [
  [1, 'slope', 368, 346, 368, 345],
  [1, 'slope', 369, 346, 369, 345],
  [1, 'slope', 379, 457, 379, 456],
  [1, 'slope', 380, 457, 380, 456],
  [1, 'slope', 450, 499, 450, 498],
  [1, 'slope', 451, 499, 451, 498],
  [1, 'stairs', 474, 408, 474, 407],
  [1, 'stairs', 475, 408, 475, 407],
  [2, 'slope', 372, 342, 372, 341],
  [2, 'slope', 373, 342, 373, 341],
  [2, 'slope', 380, 452, 380, 451],
  [2, 'slope', 381, 452, 381, 451],
  [2, 'slope', 448, 495, 448, 494],
  [2, 'slope', 449, 495, 449, 494],
  [2, 'stairs', 474, 407, 474, 406],
  [2, 'stairs', 475, 407, 475, 406],
  [3, 'slope', 372, 336, 372, 335],
  [3, 'slope', 373, 336, 373, 335],
  [3, 'slope', 376, 446, 376, 445],
  [3, 'slope', 377, 446, 377, 445],
  [3, 'stairs', 474, 406, 474, 405],
  [3, 'stairs', 475, 406, 475, 405],
];

export const STUDIO_CANONICAL_LIVE_ISLAND_TRANSITIONS: readonly TerrainTransition[] =
  CANONICAL_TRANSITION_TUPLES.map(([
    contourLevel, kind, lowerTileX, lowerTileY, upperTileX, upperTileY,
  ]) => ({
    contourLevel,
    kind,
    direction: 'up',
    lowerTileX,
    lowerTileY,
    upperTileX,
    upperTileY,
  }));

export function createStudioLiveIslandBootstrapDocument(): MapDocumentV3 {
  return migrateMapDocumentV2({
    schemaVersion: MAP_DOCUMENT_SCHEMA_VERSION,
    id: LIVE_ISLAND_MAP_ID,
    title: 'Live Island',
    width: SURVIVAL_WORLD_SIZE,
    height: SURVIVAL_WORLD_SIZE,
    tileSize: 16,
    themeId: 'orchard_stone',
    baseElevation: 0,
    baseSurface: 'grass',
    defaultCliffFamily: 'stone_1',
    defaultSurfaceFamily: 'grass_1',
    revision: 0,
    cells: {},
    transitions: STUDIO_CANONICAL_LIVE_ISLAND_TRANSITIONS,
    stairRuns: [],
    scenery: [],
    anchors: [],
    provenance: {
      kind: 'generated',
      source: LIVE_ISLAND_MAP_ID,
      generator: SURVIVAL_ISLAND_MAP_GENERATOR,
      generatorSeed: SURVIVAL_WORLD_SEED,
      generatorVersion: SURVIVAL_WORLD_VERSION,
    },
  });
}

function transitionKey(transition: TerrainTransition): string {
  return [
    transition.contourLevel,
    transition.kind,
    transition.direction,
    transition.lowerTileX,
    transition.lowerTileY,
    transition.upperTileX,
    transition.upperTileY,
  ].join(':');
}

/** Strict enough to bypass full validation only for the exact canonical
 * generator terrain. Objects, landmarks and suppressions remain orthogonal
 * MapDocumentV3 content and do not affect MapDocumentV2 terrain validation. */
export function isStudioCanonicalLiveIslandTerrain(document: MapDocumentV3): boolean {
  if (document.id !== LIVE_ISLAND_MAP_ID
    || document.width !== SURVIVAL_WORLD_SIZE
    || document.height !== SURVIVAL_WORLD_SIZE
    || document.tileSize !== 16
    || document.themeId !== 'orchard_stone'
    || document.baseElevation !== 0
    || document.baseSurface !== 'grass'
    || document.baseBiome !== 'plains'
    || document.defaultCliffFamily !== 'stone_1'
    || document.defaultSurfaceFamily !== 'grass_1'
    || Object.keys(document.cells).length !== 0
    || (document.stairRuns?.length ?? 0) !== 0
    || document.provenance.kind !== 'generated'
    || document.provenance.source !== LIVE_ISLAND_MAP_ID
    || document.provenance.generator !== SURVIVAL_ISLAND_MAP_GENERATOR
    || document.provenance.generatorSeed !== SURVIVAL_WORLD_SEED
    || document.provenance.generatorVersion !== SURVIVAL_WORLD_VERSION
    || document.transitions.length !== STUDIO_CANONICAL_LIVE_ISLAND_TRANSITIONS.length) return false;
  return document.transitions.every((transition, index) => (
    transitionKey(transition) === transitionKey(STUDIO_CANONICAL_LIVE_ISLAND_TRANSITIONS[index]!)
  ));
}
