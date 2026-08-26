import { TILE_SIZE_PIXELS, terrainProjectedDepthOffset } from '@orchard/sim';
import type { OverworldArt } from '../overworld-art.js';
import { selectAtlasFrame } from './sprite.js';
import {
  plateauLayerPlansAt,
  terrainProjectedRowsPerLevel,
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

export function raisedTerrainDepthEntries(
  terrain: TerrainArray,
  minimumTileX: number,
  minimumTileY: number,
  maximumTileX: number,
  maximumTileY: number,
): readonly RaisedTerrainDepthEntry[] {
  const entries: RaisedTerrainDepthEntry[] = [];
  const projectedRows = terrainProjectedRowsPerLevel();
  for (let tileY = Math.max(0, minimumTileY); tileY <= Math.min(terrain.height - 1, maximumTileY); tileY += 1) {
    for (let tileX = Math.max(0, minimumTileX); tileX <= Math.min(terrain.width - 1, maximumTileX); tileX += 1) {
      for (const { contourLevel, plan } of plateauLayerPlansAt(terrain, tileX, tileY)) {
        entries.push({
          tileX,
          tileY,
          contourLevel,
          footY: (tileY + 1) * TILE_SIZE_PIXELS,
          depthOffset: terrainProjectedDepthOffset(
            contourLevel - 1,
            projectedRows,
            TILE_SIZE_PIXELS,
          ),
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
}

export function enqueueRaisedTerrainDepth(
  target: WorldDepthItem[],
  context: CanvasRenderingContext2D,
  art: OverworldArt,
  terrain: TerrainArray,
  cameraX: number,
  cameraY: number,
  scale: number,
  viewportWidth: number,
  viewportHeight: number,
): number {
  const marginTiles = 4;
  const entries = raisedTerrainDepthEntries(
    terrain,
    Math.floor(cameraX / TILE_SIZE_PIXELS) - marginTiles,
    Math.floor(cameraY / TILE_SIZE_PIXELS) - marginTiles,
    Math.ceil((cameraX + viewportWidth) / TILE_SIZE_PIXELS) + marginTiles,
    Math.ceil((cameraY + viewportHeight) / TILE_SIZE_PIXELS) + marginTiles,
  );
  for (const entry of entries) {
    target.push({
      footY: entry.footY,
      depthOffset: entry.depthOffset,
      tie: `0-terrain:${entry.contourLevel}:${entry.tileY}:${entry.tileX}`,
      draw: () => drawEntry(context, art, entry, cameraX, cameraY, scale),
    });
  }
  return entries.length;
}
