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

function drawEntry(
  context: CanvasRenderingContext2D,
  art: OverworldArt,
  entry: RaisedTerrainDepthEntry,
  cameraX: number,
  cameraY: number,
  scale: number,
): void {
  context.save();
  context.translate(0, -raisedTerrainVisualOffset(entry) * scale);
  for (const face of entry.plan.faceLayers) {
    drawTerrainAsset(context, art.cliff, face.frame, entry.tileX, entry.tileY, cameraX, cameraY, scale);
  }
  if (entry.plan.edgeFrame !== null) {
    drawTerrainAsset(context, art.cliff, entry.plan.edgeFrame, entry.tileX, entry.tileY, cameraX, cameraY, scale);
  }
  for (const insetFrame of entry.plan.insetFrames) {
    drawTerrainAsset(
      context,
      art.stoneCliffInverseOverlay,
      insetFrame,
      entry.tileX,
      entry.tileY,
      cameraX,
      cameraY,
      scale,
    );
  }
  if (entry.plan.rampFrame !== null) {
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
    target.push({
      footY: entry.footY,
      depthOffset: entry.depthOffset,
      elevationLayer: entry.contourLevel,
      depthPhase: 'boundary',
      tie: `0-terrain:${entry.contourLevel}:${entry.tileY}:${entry.tileX}`,
      draw: () => drawEntry(context, art, entry, cameraX, cameraY, scale),
    });
  }
  return entries.length + surfaceRuns.length;
}
