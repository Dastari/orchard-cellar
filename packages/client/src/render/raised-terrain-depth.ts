import {
  SURVIVAL_CHUNK_TILES,
  TILE_SIZE_PIXELS,
  terrainProjectedDepthOffset,
} from '@orchard/sim';
import type { OverworldArt } from '../overworld-art.js';
import type { GroundChunkCache } from './ground-cache.js';
import { selectAtlasFrame } from './sprite.js';
import {
  plateauLayerPlansAt,
  terrainBiomeAt,
  terrainElevationAt,
  terrainMaximumElevation,
  terrainProjectedRowsPerLevel,
  terrainProjectedSortOffset,
  type TerrainArray,
} from './terrain.js';
import type { WorldDepthItem } from './renderer.js';
import type { LoadedAsset } from './assets.js';

export interface RaisedTerrainDepthEntry {
  readonly tileX: number;
  readonly tileY: number;
  readonly contourLevel: number;
  readonly footY: number;
  readonly depthOffset: number;
  readonly plan: ReturnType<typeof plateauLayerPlansAt>[number]['plan'];
}

export interface RaisedTerrainSurfaceRun {
  readonly firstTileX: number;
  readonly lastTileX: number;
  readonly tileY: number;
  readonly elevation: number;
  readonly footY: number;
  readonly visualOffset: number;
}

export function raisedTerrainSurfaceRuns(
  terrain: TerrainArray,
  minimumTileX: number,
  minimumTileY: number,
  maximumTileX: number,
  maximumTileY: number,
): readonly RaisedTerrainSurfaceRun[] {
  if (terrain.generator === 'cellar') return [];
  const projectsAsOpaqueSurface = (tileX: number, tileY: number, elevation: number): boolean => {
    const boundary = plateauLayerPlansAt(terrain, tileX, tileY)
      .find((entry) => entry.contourLevel === elevation)?.plan;
    // Boundary and ramp sheets already contain the correctly shaped cap.
    // Copying the rectangular ground tile underneath them fills their
    // transparent corners and produces the green occlusion blocks seen at
    // concave/side cliff edges.
    return boundary === undefined || (boundary.edgeFrame === null && boundary.rampFrame === null);
  };
  const runs: RaisedTerrainSurfaceRun[] = [];
  const firstX = Math.max(0, minimumTileX);
  const lastX = Math.min(terrain.width - 1, maximumTileX);
  for (let tileY = Math.max(0, minimumTileY); tileY <= Math.min(terrain.height - 1, maximumTileY); tileY += 1) {
    let tileX = firstX;
    while (tileX <= lastX) {
      const elevation = terrainElevationAt(terrain, tileX, tileY);
      if (elevation <= 0 || !projectsAsOpaqueSurface(tileX, tileY, elevation)) {
        tileX += 1;
        continue;
      }
      const runStart = tileX;
      const chunkX = Math.floor(tileX / SURVIVAL_CHUNK_TILES);
      while (tileX + 1 <= lastX
        && Math.floor((tileX + 1) / SURVIVAL_CHUNK_TILES) === chunkX
        && terrainElevationAt(terrain, tileX + 1, tileY) === elevation
        && projectsAsOpaqueSurface(tileX + 1, tileY, elevation)) tileX += 1;
      runs.push({
        firstTileX: runStart,
        lastTileX: tileX,
        tileY,
        elevation,
        footY: (tileY + 1) * TILE_SIZE_PIXELS - terrainProjectedDepthOffset(
          elevation,
          terrainProjectedRowsPerLevel(),
          TILE_SIZE_PIXELS,
        ),
        visualOffset: terrainProjectedDepthOffset(
          elevation,
          terrainProjectedRowsPerLevel(),
          TILE_SIZE_PIXELS,
        ),
      });
      tileX += 1;
    }
  }
  return runs;
}

export function raisedTerrainVisualOffset(entry: Pick<RaisedTerrainDepthEntry, 'contourLevel'>): number {
  return terrainProjectedDepthOffset(
    entry.contourLevel,
    terrainProjectedRowsPerLevel(),
    TILE_SIZE_PIXELS,
  );
}

export function raisedTerrainDepthEntries(
  terrain: TerrainArray,
  minimumTileX: number,
  minimumTileY: number,
  maximumTileX: number,
  maximumTileY: number,
): readonly RaisedTerrainDepthEntry[] {
  const entries: RaisedTerrainDepthEntry[] = [];
  for (let tileY = Math.max(0, minimumTileY); tileY <= Math.min(terrain.height - 1, maximumTileY); tileY += 1) {
    for (let tileX = Math.max(0, minimumTileX); tileX <= Math.min(terrain.width - 1, maximumTileX); tileX += 1) {
      for (const { contourLevel, plan } of plateauLayerPlansAt(terrain, tileX, tileY)) {
        entries.push({
          tileX,
          tileY,
          contourLevel,
          footY: (tileY + 1) * TILE_SIZE_PIXELS - raisedTerrainVisualOffset({ contourLevel }),
          depthOffset: terrainProjectedSortOffset(contourLevel, true),
          plan,
        });
      }
    }
  }
  return entries;
}

function drawTerrainAsset(
  context: CanvasRenderingContext2D,
  asset: LoadedAsset,
  frameIndex: number,
  tileX: number,
  tileY: number,
  cameraX: number,
  cameraY: number,
  scale: number,
): void {
  const source = selectAtlasFrame(asset.metadata, 'base', frameIndex);
  if (source === null) return;
  const worldX = tileX * TILE_SIZE_PIXELS + 8 - asset.anchor[0];
  const worldY = tileY * TILE_SIZE_PIXELS + 15 - asset.anchor[1];
  context.drawImage(
    asset.image,
    source.x,
    source.y,
    source.width,
    source.height,
    Math.round((worldX - cameraX) * scale),
    Math.round((worldY - cameraY) * scale),
    source.width * scale,
    source.height * scale,
  );
}

export type RaisedTerrainDepthStratum = 'face' | 'face_foot' | 'cap';

export interface RaisedTerrainDepthLayer {
  readonly stratum: RaisedTerrainDepthStratum;
  readonly elevationLayer: number;
  readonly depthPhase: NonNullable<WorldDepthItem['depthPhase']>;
}

function raisedWaterfallColumnAt(
  terrain: TerrainArray,
  tileX: number,
  tileY: number,
): number {
  const waterfall = (offsetX: number): boolean =>
    terrainBiomeAt(terrain, tileX + offsetX, tileY) === 'waterfall';
  return !waterfall(-1) ? 0 : !waterfall(1) ? 2 : 1;
}

/** Selects the static waterfall atlas row that replaces a projected cliff
 * stratum. The source sheet is five rows tall; a one-level raised cliff owns
 * four visible rows, so its two wall courses use the authored upper/lower
 * flow rows and deliberately skip the repeatable centre row. */
export function raisedTerrainWaterfallFrameIndex(
  terrain: TerrainArray,
  entry: Pick<RaisedTerrainDepthEntry, 'tileX' | 'tileY' | 'contourLevel' | 'plan'>,
  stratum: RaisedTerrainDepthStratum,
): number | null {
  if (terrain.generator === 'cellar'
    || terrainBiomeAt(terrain, entry.tileX, entry.tileY) !== 'waterfall') return null;
  const column = raisedWaterfallColumnAt(terrain, entry.tileX, entry.tileY);
  if (stratum === 'cap') {
    const southFace = plateauLayerPlansAt(terrain, entry.tileX, entry.tileY + 1)
      .find(({ contourLevel }) => contourLevel === entry.contourLevel)?.plan.faceLayers
      .some((face) => face.direct && face.rowId === 'wall');
    return southFace ? column : null;
  }
  const direct = entry.plan.faceLayers.find((face) => face.direct);
  const row = direct?.rowId === 'wall'
    ? 1
    : direct?.rowId === 'lower_wall'
      ? 3
      : direct?.rowId === 'foot'
        ? 4
        : null;
  return row === null ? null : row * 3 + column;
}

/** A cliff tile contains two different painter-depth owners. Its projected
 * vertical face belongs to the lower plane, so a lower actor can sort behind
 * or in front of it by foot Y. The rim/cap belongs to the raised plane and
 * must cover every lower-plane drawable in its projected walk-behind band. */
export function raisedTerrainDepthLayers(
  entry: Pick<RaisedTerrainDepthEntry, 'contourLevel' | 'plan'>,
): readonly RaisedTerrainDepthLayer[] {
  const layers: RaisedTerrainDepthLayer[] = [];
  const hasDirectWall = entry.plan.faceLayers.some((face) => face.direct && face.rowId !== 'foot');
  const hasDirectFoot = entry.plan.faceLayers.some((face) => face.direct && face.rowId === 'foot');
  // A projected destination can contain an authored rear row followed by a
  // direct row. Keep that stack in one painter item: the rear frame fills the
  // translucent side gutter of the direct frame, while the direct frame keeps
  // the correct exposed silhouette. Indirect-only destinations remain absent
  // so they cannot recreate the solid stone columns at stepped corners.
  if (hasDirectWall) {
    layers.push({
      stratum: 'face',
      elevationLayer: Math.max(0, entry.contourLevel - 1),
      depthPhase: 'boundary',
    });
  } else if (hasDirectFoot) {
    layers.push({
      stratum: 'face_foot',
      elevationLayer: Math.max(0, entry.contourLevel - 1),
      depthPhase: 'surface',
    });
  }
  // Indirect coverage is topology support for resolving corners, not another
  // visible wall. Drawing it exposes the stone column underneath the thin
  // left/right cap edge at stepped corners.
  if (entry.plan.edgeFrame !== null
    || entry.plan.insetFrames.length > 0
    || entry.plan.rampFrame !== null) {
    layers.push({
      stratum: 'cap',
      elevationLayer: entry.contourLevel,
      depthPhase: 'surface',
    });
  }
  return layers;
}

function drawEntryStratum(
  context: CanvasRenderingContext2D,
  art: OverworldArt,
  terrain: TerrainArray,
  entry: RaisedTerrainDepthEntry,
  stratum: RaisedTerrainDepthStratum,
  cameraX: number,
  cameraY: number,
  scale: number,
): void {
  const cliffAsset = terrain.generator === 'cellar' ? art.caveWall : art.cliff;
  const waterfallFrame = raisedTerrainWaterfallFrameIndex(terrain, entry, stratum);
  context.save();
  context.translate(0, -raisedTerrainVisualOffset(entry) * scale);
  if (waterfallFrame !== null) {
    drawTerrainAsset(
      context,
      art.waterfall,
      waterfallFrame,
      entry.tileX,
      entry.tileY,
      cameraX,
      cameraY,
      scale,
    );
    context.restore();
    return;
  }
  if (stratum === 'face' || stratum === 'face_foot') {
    // The resolver returns these deepest-to-nearest. Drawing the complete
    // mixed stack restores the source tileset's intended edge compositing;
    // raisedTerrainDepthLayers has already rejected indirect-only stacks.
    for (const face of entry.plan.faceLayers) {
      if (face.seamUnderlayFrame !== undefined) {
        drawTerrainAsset(
          context,
          cliffAsset,
          face.seamUnderlayFrame,
          entry.tileX,
          entry.tileY,
          cameraX,
          cameraY,
          scale,
        );
      }
      drawTerrainAsset(context, cliffAsset, face.frame, entry.tileX, entry.tileY, cameraX, cameraY, scale);
    }
    const directWall = entry.plan.faceLayers.find((face) => face.direct && face.rowId === 'wall');
    if (terrain.generator === 'cellar'
      && stratum === 'face'
      && directWall?.join === 'middle'
      && ((entry.tileX + terrain.seed) % 9 + 9) % 9 === 4) {
      drawTerrainAsset(context, art.caveSupport, 0, entry.tileX, entry.tileY, cameraX, cameraY, scale);
    }
  }
  if (stratum === 'cap'
    && entry.plan.edgeSeamUnderlayFrame !== undefined
    && entry.plan.insetFrames.length === 0) {
    drawTerrainAsset(
      context,
      cliffAsset,
      entry.plan.edgeSeamUnderlayFrame,
      entry.tileX,
      entry.tileY,
      cameraX,
      cameraY,
      scale,
    );
  }
  if (stratum === 'cap' && entry.plan.edgeFrame !== null) {
    drawTerrainAsset(context, cliffAsset, entry.plan.edgeFrame, entry.tileX, entry.tileY, cameraX, cameraY, scale);
  }
  for (const insetFrame of stratum === 'cap' ? entry.plan.insetFrames : []) {
    drawTerrainAsset(
      context,
      terrain.generator === 'cellar' ? art.caveWall : art.stoneCliffInverseOverlay,
      insetFrame,
      entry.tileX,
      entry.tileY,
      cameraX,
      cameraY,
      scale,
    );
  }
  if (stratum === 'cap' && entry.plan.rampFrame !== null) {
    drawTerrainAsset(
      context,
      art.grassCliffRamp,
      entry.plan.rampFrame,
      entry.tileX,
      entry.tileY,
      cameraX,
      cameraY,
      scale,
    );
  }
  context.restore();
}

export function enqueueRaisedTerrainDepth(
  target: WorldDepthItem[],
  context: CanvasRenderingContext2D,
  art: OverworldArt,
  terrain: TerrainArray,
  groundCache: GroundChunkCache,
  cameraX: number,
  cameraY: number,
  scale: number,
  viewportWidth: number,
  viewportHeight: number,
): number {
  const marginTiles = Math.max(
    4,
    terrainMaximumElevation(terrain) * terrainProjectedRowsPerLevel() + 1,
  );
  const entries = raisedTerrainDepthEntries(
    terrain,
    Math.floor(cameraX / TILE_SIZE_PIXELS) - marginTiles,
    Math.floor(cameraY / TILE_SIZE_PIXELS) - marginTiles,
    Math.ceil((cameraX + viewportWidth) / TILE_SIZE_PIXELS) + marginTiles,
    Math.ceil((cameraY + viewportHeight) / TILE_SIZE_PIXELS) + marginTiles,
  );
  const surfaceRuns = raisedTerrainSurfaceRuns(
    terrain,
    Math.floor(cameraX / TILE_SIZE_PIXELS) - marginTiles,
    Math.floor(cameraY / TILE_SIZE_PIXELS) - marginTiles,
    Math.ceil((cameraX + viewportWidth) / TILE_SIZE_PIXELS) + marginTiles,
    Math.ceil((cameraY + viewportHeight) / TILE_SIZE_PIXELS) + marginTiles,
  );
  for (const run of surfaceRuns) {
    target.push({
      footY: run.footY,
      elevationLayer: run.elevation,
      depthPhase: 'surface',
      tie: `0-surface:${run.elevation}:${run.tileY}:${run.firstTileX}`,
      draw: () => groundCache.drawProjectedRun(
        context,
        art,
        terrain,
        run.firstTileX,
        run.lastTileX,
        run.tileY,
        run.visualOffset,
        cameraX,
        cameraY,
        scale,
      ),
    });
  }
  for (const entry of entries) {
    for (const layer of raisedTerrainDepthLayers(entry)) {
      target.push({
        footY: entry.footY,
        depthOffset: entry.depthOffset,
        elevationLayer: layer.elevationLayer,
        depthPhase: layer.depthPhase,
        tie: `0-terrain:${entry.contourLevel}:${layer.stratum}:${entry.tileY}:${entry.tileX}`,
        draw: () => drawEntryStratum(
          context,
          art,
          terrain,
          entry,
          layer.stratum,
          cameraX,
          cameraY,
          scale,
        ),
      });
    }
  }
  return entries.reduce((count, entry) => count + raisedTerrainDepthLayers(entry).length, surfaceRuns.length);
}
