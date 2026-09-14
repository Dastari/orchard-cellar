import {
  SURVIVAL_BIOMES,
  SURVIVAL_WORLD_SEED,
  mapDocumentUsesSurvivalIslandBase,
  resolvedMapBiomeAt,
  resolvedMapCellAt,
  survivalTerrainTransitions,
  terrainDocumentForMapV3,
  type MapDocumentV3,
  type TerrainOverride,
} from '@orchard/sim';
import {
  terrainBaseDatum,
  terrainVisualProjectionRowsPerLevel,
  type TerrainArray,
} from '@orchard/engine';
import {
  editorMapOverviewRaster,
  splitEditorMapOverviewLayers,
} from './editor-map-overview.js';
import { buildMapEditorTerrain } from './editor-terrain-build.js';
import {
  OFFLINE_TERRAIN_AUTHORING_PALETTE,
  type TerrainAuthoringPalette,
} from './terrain-authoring-palette.js';
import { isStudioCanonicalLiveIslandTerrain } from './editor-live-island-bootstrap.js';

export type MapOverviewLayer = 'combined' | 'generated_base' | 'terrain';

export interface MapEditorTerrainInfluenceRun {
  readonly tileY: number;
  readonly firstTileX: number;
  readonly lastTileX: number;
}

export interface MapEditorOverviewPixels {
  readonly width: number;
  readonly height: number;
  readonly layers: Readonly<Record<MapOverviewLayer, Uint8ClampedArray>>;
}

export interface MapEditorTerrainDerivatives {
  readonly overview: MapEditorOverviewPixels;
  readonly generatedBaseTerrain: TerrainArray;
  readonly generatedBaseTerrainKey: string;
  readonly terrainOverrideInfluenceRuns: readonly MapEditorTerrainInfluenceRun[];
}

/** Reconstructs the immutable generator-owned terrain beneath sparse authoring. */
export function mapGeneratedBaseDocument(document: MapDocumentV3): MapDocumentV3 {
  const generatedIsland = mapDocumentUsesSurvivalIslandBase(document);
  return {
    ...document,
    cells: {},
    transitions: generatedIsland
      ? isStudioCanonicalLiveIslandTerrain(document)
        ? document.transitions
        : survivalTerrainTransitions(document.provenance.generatorSeed ?? SURVIVAL_WORLD_SEED)
      : [],
    stairRuns: [],
  };
}

/** Sparse authored edits do not invalidate the immutable generator snapshot. */
export function mapGeneratedBaseTerrainKey(document: MapDocumentV3): string {
  return JSON.stringify({
    width: document.width,
    height: document.height,
    themeId: document.themeId,
    baseElevation: document.baseElevation,
    baseSurface: document.baseSurface,
    baseBiome: document.baseBiome,
    defaultCliffFamily: document.defaultCliffFamily,
    defaultSurfaceFamily: document.defaultSurfaceFamily,
    provenance: document.provenance,
  });
}

function terrainOverrideEqual(
  left: TerrainOverride | null | undefined,
  right: TerrainOverride | null | undefined,
): boolean {
  if (left === right) return true;
  if (left == null && right == null) return true;
  if (left == null || right == null) return false;
  return left.contourLevel === right.contourLevel
    && left.role === right.role
    && left.frameIndex === right.frameIndex
    && left.family === right.family;
}

function terrainVisualCellDiffers(
  combined: TerrainArray,
  generatedBase: TerrainArray,
  index: number,
): boolean {
  return combined.biomes[index] !== generatedBase.biomes[index]
    || combined.elevations[index] !== generatedBase.elevations[index]
    || combined.blocked[index] !== generatedBase.blocked[index]
    || (combined.cliffFamilies?.[index] ?? 0) !== (generatedBase.cliffFamilies?.[index] ?? 0)
    || (combined.surfaceFamilies?.[index] ?? 0) !== (generatedBase.surfaceFamilies?.[index] ?? 0)
    || (combined.ledges?.[index] ?? 0) !== (generatedBase.ledges?.[index] ?? 0)
    || (combined.authoredFarmland?.[index] ?? 0) !== (generatedBase.authoredFarmland?.[index] ?? 0)
    || combined.dirtCliffRoles[index] !== generatedBase.dirtCliffRoles[index]
    || combined.dirtTerraces[index] !== generatedBase.dirtTerraces[index]
    || !terrainOverrideEqual(
      combined.terrainOverrides?.[index],
      generatedBase.terrainOverrides?.[index],
    );
}

/**
 * Returns compact screen-tile mask runs for the sparse authored terrain
 * contribution. This is worker-safe and deliberately independent of Canvas.
 */
export function mapTerrainOverrideInfluenceRuns(
  combined: TerrainArray,
  generatedBase: TerrainArray,
): readonly MapEditorTerrainInfluenceRun[] {
  if (combined.width !== generatedBase.width || combined.height !== generatedBase.height) return [];
  const width = combined.width;
  const height = combined.height;
  const influenced = new Uint8Array(width * height);
  const topologyHalo = 2;
  const combinedDatum = terrainBaseDatum(combined);
  const baseDatum = terrainBaseDatum(generatedBase);
  const combinedProjectionRows = terrainVisualProjectionRowsPerLevel(combined);
  const baseProjectionRows = terrainVisualProjectionRowsPerLevel(generatedBase);
  const mark = (firstX: number, lastX: number, firstY: number, lastY: number): void => {
    const minimumX = Math.max(0, firstX);
    const maximumX = Math.min(width - 1, lastX);
    const minimumY = Math.max(0, firstY);
    const maximumY = Math.min(height - 1, lastY);
    for (let tileY = minimumY; tileY <= maximumY; tileY += 1) {
      influenced.fill(1, tileY * width + minimumX, tileY * width + maximumX + 1);
    }
  };
  const markTile = (tileX: number, tileY: number): void => {
    if (tileX < 0 || tileY < 0 || tileX >= width || tileY >= height) return;
    const index = tileY * width + tileX;
    const combinedOffset = (combined.elevations[index]! - combinedDatum) * combinedProjectionRows;
    const baseOffset = (generatedBase.elevations[index]! - baseDatum) * baseProjectionRows;
    const projectedY = tileY - combinedOffset;
    const baseProjectedY = tileY - baseOffset;
    mark(
      tileX - topologyHalo,
      tileX + topologyHalo,
      Math.min(tileY, projectedY, baseProjectedY) - topologyHalo,
      Math.max(tileY, projectedY, baseProjectedY) + topologyHalo,
    );
  };
  for (let index = 0; index < width * height; index += 1) {
    if (!terrainVisualCellDiffers(combined, generatedBase, index)) continue;
    markTile(index % width, Math.floor(index / width));
  }
  const transitionKey = (transition: NonNullable<TerrainArray['terrainTransitions']>[number]): string =>
    JSON.stringify(transition);
  const combinedTransitions = new Map(
    (combined.terrainTransitions ?? []).map((transition) => [transitionKey(transition), transition]),
  );
  const baseTransitions = new Map(
    (generatedBase.terrainTransitions ?? []).map((transition) => [transitionKey(transition), transition]),
  );
  for (const [key, transition] of combinedTransitions) {
    if (baseTransitions.has(key)) continue;
    markTile(transition.lowerTileX, transition.lowerTileY);
    markTile(transition.upperTileX, transition.upperTileY);
  }
  for (const [key, transition] of baseTransitions) {
    if (combinedTransitions.has(key)) continue;
    markTile(transition.lowerTileX, transition.lowerTileY);
    markTile(transition.upperTileX, transition.upperTileY);
  }
  const runs: MapEditorTerrainInfluenceRun[] = [];
  for (let tileY = 0; tileY < height; tileY += 1) {
    let tileX = 0;
    while (tileX < width) {
      while (tileX < width && influenced[tileY * width + tileX] === 0) tileX += 1;
      if (tileX >= width) break;
      const firstTileX = tileX;
      while (tileX + 1 < width && influenced[tileY * width + tileX + 1] === 1) tileX += 1;
      runs.push({ tileY, firstTileX, lastTileX: tileX });
      tileX += 1;
    }
  }
  return runs;
}

/** Builds all dense terrain derivatives in the worker before the renderer is
 * invalidated. The only remaining UI-thread work is one bitmap materialisation
 * per task, never a full-map semantic scan inside draw(). */
export function buildMapEditorTerrainDerivatives(
  document: MapDocumentV3,
  terrain: TerrainArray,
  palette: TerrainAuthoringPalette = OFFLINE_TERRAIN_AUTHORING_PALETTE,
): MapEditorTerrainDerivatives {
  const raster = editorMapOverviewRaster(terrain);
  const generatedBaseDocument = mapGeneratedBaseDocument(document);
  const generatedBaseTerrain = Object.keys(document.cells).length === 0
    ? terrain
    : buildMapEditorTerrain(generatedBaseDocument, palette);
  const generatedBaseDocumentTerrain = terrainDocumentForMapV3(generatedBaseDocument);
  const generatedBaseTiles = Object.keys(document.cells).map((key) => {
    const [tileXSource, tileYSource] = key.split(',');
    const tileX = Number(tileXSource);
    const tileY = Number(tileYSource);
    return {
      tileX,
      tileY,
      biome: SURVIVAL_BIOMES.indexOf(resolvedMapBiomeAt(generatedBaseDocument, tileX, tileY)),
      elevation: resolvedMapCellAt(generatedBaseDocumentTerrain, tileX, tileY).elevation,
    };
  });
  const split = splitEditorMapOverviewLayers(raster, generatedBaseTiles);
  return {
    overview: {
      width: raster.width,
      height: raster.height,
      layers: {
        combined: raster.pixels,
        generated_base: split.generatedBase,
        terrain: split.terrainOverrides,
      },
    },
    generatedBaseTerrain,
    generatedBaseTerrainKey: mapGeneratedBaseTerrainKey(document),
    terrainOverrideInfluenceRuns: mapTerrainOverrideInfluenceRuns(terrain, generatedBaseTerrain),
  };
}
