import { TILE_SIZE_PIXELS } from '@orchard/sim';
import type { OverworldArt } from '../overworld-art.js';
import type { LoadedAsset } from './assets.js';
import type { GroundChunkCache } from './ground-cache.js';
import {
  raisedTerrainDepthEntries,
  raisedTerrainDepthLayers,
  raisedTerrainWaterfallFrameIndex,
} from './raised-terrain-depth.js';
import { sortWorldDepthItems, type WorldDepthItem } from './renderer.js';
import { selectAtlasFrame } from './sprite.js';
import {
  plateauLayerPlansAt,
  terrainElevationAt,
  terrainMaximumElevation,
  terrainPlaneCollisionCellAt,
  terrainProjectedRowsPerLevel,
  terrainVisualProjectionRowsPerLevel,
  type TerrainArray,
} from './terrain.js';

export interface TerrainInspectorLayer {
  readonly asset: 'ground_cache' | 'stone_cliff' | 'stone_cliff_inverse' | 'cave_wall' | 'grass_cliff_ramp' | 'waterfall';
  readonly frame: number | null;
  readonly role: string;
  readonly contourLevel: number;
  readonly tileX: number;
  readonly tileY: number;
  readonly elevationLayer: number;
  readonly depthPhase: NonNullable<WorldDepthItem['depthPhase']>;
  readonly footY: number;
  readonly depthOffset: number;
  readonly tie: string;
}

export interface TerrainInspection {
  readonly projectedWorldX: number;
  readonly projectedWorldY: number;
  readonly tileX: number;
  readonly tileY: number;
  readonly activeElevation: number;
  readonly logicalElevation: number;
  readonly collisionCell: ReturnType<typeof terrainPlaneCollisionCellAt>;
  readonly blocked: boolean;
  /** Back-to-front order, matching the terrain depth queue and each tile's
   * internal draw order. */
  readonly layers: readonly TerrainInspectorLayer[];
}

export interface TerrainInspectionVisualLayout {
  readonly width: number;
  readonly height: number;
  readonly compositeSize: number;
  readonly thumbnailSize: number;
  readonly columns: number;
}

const VISUAL_PADDING = 6;
const COMPOSITE_SIZE = 80;
const THUMBNAIL_SIZE = 32;
const THUMBNAIL_GAP = 4;
const THUMBNAIL_COLUMNS = 4;

export function terrainInspectionVisualLayout(inspection: TerrainInspection): TerrainInspectionVisualLayout {
  const rows = Math.ceil(inspection.layers.length / THUMBNAIL_COLUMNS);
  return {
    width: VISUAL_PADDING * 2 + Math.max(
      COMPOSITE_SIZE,
      THUMBNAIL_COLUMNS * THUMBNAIL_SIZE + (THUMBNAIL_COLUMNS - 1) * THUMBNAIL_GAP,
    ),
    height: VISUAL_PADDING * 3 + COMPOSITE_SIZE
      + rows * THUMBNAIL_SIZE + Math.max(0, rows - 1) * THUMBNAIL_GAP,
    compositeSize: COMPOSITE_SIZE,
    thumbnailSize: THUMBNAIL_SIZE,
    columns: THUMBNAIL_COLUMNS,
  };
}

function drawTransparencyGrid(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
): void {
  const cell = Math.max(2, Math.floor(size / 8));
  for (let row = 0; row < Math.ceil(size / cell); row += 1) {
    for (let column = 0; column < Math.ceil(size / cell); column += 1) {
      context.fillStyle = (row + column) % 2 === 0 ? '#d8d0ba' : '#887f72';
      context.fillRect(x + column * cell, y + row * cell, cell, cell);
    }
  }
}

function assetForLayer(art: OverworldArt, layer: TerrainInspectorLayer): LoadedAsset | null {
  if (layer.asset === 'cave_wall') return art.caveWall;
  if (layer.asset === 'stone_cliff') return art.cliff;
  if (layer.asset === 'stone_cliff_inverse') return art.stoneCliffInverseOverlay;
  if (layer.asset === 'grass_cliff_ramp') return art.grassCliffRamp;
  if (layer.asset === 'waterfall') return art.waterfall;
  return null;
}

function drawLayerPreview(
  context: CanvasRenderingContext2D,
  art: OverworldArt,
  terrain: TerrainArray,
  groundCache: GroundChunkCache,
  layer: TerrainInspectorLayer,
  x: number,
  y: number,
  size: number,
): void {
  if (layer.asset === 'ground_cache') {
    groundCache.drawTilePreview(context, art, terrain, layer.tileX, layer.tileY, x, y, size);
    return;
  }
  if (layer.frame === null) return;
  const asset = assetForLayer(art, layer);
  if (asset === null) return;
  const source = selectAtlasFrame(asset.metadata, 'base', layer.frame);
  if (source === null) return;
  context.drawImage(
    asset.image,
    source.x,
    source.y,
    source.width,
    source.height,
    x,
    y,
    size,
    size,
  );
}

/** Draws the exact baked base plus every raised-terrain frame, followed by an
 * indexed thumbnail grid where transparency remains visible as a checker. */
export function drawTerrainInspectionVisuals(
  context: CanvasRenderingContext2D,
  art: OverworldArt,
  terrain: TerrainArray,
  groundCache: GroundChunkCache,
  inspection: TerrainInspection,
  x: number,
  y: number,
): TerrainInspectionVisualLayout {
  const layout = terrainInspectionVisualLayout(inspection);
  const compositeX = x + Math.floor((layout.width - layout.compositeSize) / 2);
  const compositeY = y + VISUAL_PADDING;
  context.save();
  context.imageSmoothingEnabled = false;
  drawTransparencyGrid(context, compositeX, compositeY, layout.compositeSize);
  for (const layer of inspection.layers) {
    drawLayerPreview(
      context,
      art,
      terrain,
      groundCache,
      layer,
      compositeX,
      compositeY,
      layout.compositeSize,
    );
  }
  context.strokeStyle = '#f6f0d8';
  context.lineWidth = 1;
  context.strokeRect(compositeX - 1, compositeY - 1, layout.compositeSize + 2, layout.compositeSize + 2);

  const thumbnailsY = compositeY + layout.compositeSize + VISUAL_PADDING * 2;
  for (let index = 0; index < inspection.layers.length; index += 1) {
    const column = index % layout.columns;
    const row = Math.floor(index / layout.columns);
    const thumbnailX = x + VISUAL_PADDING + column * (layout.thumbnailSize + THUMBNAIL_GAP);
    const thumbnailY = thumbnailsY + row * (layout.thumbnailSize + THUMBNAIL_GAP);
    drawTransparencyGrid(context, thumbnailX, thumbnailY, layout.thumbnailSize);
    drawLayerPreview(
      context,
      art,
      terrain,
      groundCache,
      inspection.layers[index]!,
      thumbnailX,
      thumbnailY,
      layout.thumbnailSize,
    );
    context.fillStyle = '#07120ddd';
    context.fillRect(thumbnailX, thumbnailY, 10, 8);
    context.fillStyle = '#f6f0d8';
    context.font = '7px monospace';
    context.textBaseline = 'top';
    context.fillText(String(index + 1), thumbnailX + 1, thumbnailY);
    context.strokeStyle = '#887f72';
    context.strokeRect(thumbnailX - 1, thumbnailY - 1, layout.thumbnailSize + 2, layout.thumbnailSize + 2);
  }
  context.restore();
  return layout;
}

function stratumLayers(
  terrain: TerrainArray,
  entry: ReturnType<typeof raisedTerrainDepthEntries>[number],
  stratum: ReturnType<typeof raisedTerrainDepthLayers>[number]['stratum'],
  depthLayer: ReturnType<typeof raisedTerrainDepthLayers>[number],
): TerrainInspectorLayer[] {
  const common = {
    contourLevel: entry.contourLevel,
    tileX: entry.tileX,
    tileY: entry.tileY,
    elevationLayer: depthLayer.elevationLayer,
    depthPhase: depthLayer.depthPhase,
    footY: entry.footY,
    depthOffset: entry.depthOffset,
    tie: `0-terrain:${entry.contourLevel}:${stratum}:${entry.tileY}:${entry.tileX}`,
  } as const;
  const waterfallFrame = raisedTerrainWaterfallFrameIndex(terrain, entry, stratum);
  if (waterfallFrame !== null) {
    return [{
      ...common,
      asset: 'waterfall',
      frame: waterfallFrame,
      role: `raised_waterfall_${stratum}`,
    }];
  }
  const layers: TerrainInspectorLayer[] = [];
  const cliffAsset = terrain.generator === 'cellar' ? 'cave_wall' : 'stone_cliff';
  const insetAsset = terrain.generator === 'cellar' ? 'cave_wall' : 'stone_cliff_inverse';
  if (stratum === 'face' || stratum === 'face_foot') {
    for (const face of entry.plan.faceLayers) {
      if (face.seamUnderlayFrame !== undefined) {
        layers.push({
          ...common,
          asset: cliffAsset,
          frame: face.seamUnderlayFrame,
          role: `${face.rowId}_${face.join}_underlay`,
        });
      }
      layers.push({
        ...common,
        asset: cliffAsset,
        frame: face.frame,
        role: `${face.rowId}_${face.join}${face.direct ? '' : '_indirect'}`,
      });
    }
  }
  if (stratum === 'cap') {
    if (entry.plan.edgeSeamUnderlayFrame !== undefined
      && entry.plan.insetFrames.length === 0) {
      layers.push({
        ...common,
        asset: cliffAsset,
        frame: entry.plan.edgeSeamUnderlayFrame,
        role: `${entry.plan.edgeRole ?? 'edge'}_underlay`,
      });
    }
    if (entry.plan.edgeFrame !== null) {
      layers.push({
        ...common,
        asset: cliffAsset,
        frame: entry.plan.edgeFrame,
        role: entry.plan.edgeRole ?? 'edge',
      });
    }
    for (let index = 0; index < entry.plan.insetFrames.length; index += 1) {
      layers.push({
        ...common,
        asset: insetAsset,
        frame: entry.plan.insetFrames[index] ?? null,
        role: entry.plan.insetRoles[index] ?? `inset_${index}`,
      });
    }
    if (entry.plan.rampFrame !== null) {
      layers.push({
        ...common,
        asset: 'grass_cliff_ramp',
        frame: entry.plan.rampFrame,
        role: entry.plan.rampRole ?? 'ramp',
      });
    }
  }
  return layers;
}

export function inspectTerrainAtProjectedPoint(
  terrain: TerrainArray,
  projectedWorldX: number,
  projectedWorldY: number,
  activeElevation: number,
  blocked: boolean,
): TerrainInspection {
  const tileX = Math.floor(projectedWorldX / TILE_SIZE_PIXELS);
  const projectionRows = terrainProjectedRowsPerLevel(terrain);
  const visualProjectionRows = terrainVisualProjectionRowsPerLevel(terrain);
  const tileY = Math.floor(
    (projectedWorldY + activeElevation * visualProjectionRows * TILE_SIZE_PIXELS) / TILE_SIZE_PIXELS,
  );
  const queued: TerrainInspectorLayer[] = [];

  // The normal unprojected terrain pass is always below the raised queue. It
  // is crucial in this inspector because translucent cliff gutters reveal it.
  queued.push({
    asset: 'ground_cache',
    frame: null,
    role: 'base_ground',
    contourLevel: 0,
    tileX: Math.floor(projectedWorldX / TILE_SIZE_PIXELS),
    tileY: Math.floor(projectedWorldY / TILE_SIZE_PIXELS),
    elevationLayer: 0,
    depthPhase: 'surface',
    footY: (Math.floor(projectedWorldY / TILE_SIZE_PIXELS) + 1) * TILE_SIZE_PIXELS,
    depthOffset: 0,
    tie: '0-ground-cache',
  });

  // A rendered contour at level L is translated upward by L projected rows.
  // Reversing that projection lets a click on the visible wall inspect the
  // logical tile which supplied each overlapping contour layer.
  for (let contourLevel = 1; contourLevel <= terrainMaximumElevation(terrain); contourLevel += 1) {
    const sourceTileY = Math.floor(projectedWorldY / TILE_SIZE_PIXELS)
      + contourLevel * visualProjectionRows;
    const entry = raisedTerrainDepthEntries(
      terrain,
      tileX,
      sourceTileY,
      tileX,
      sourceTileY,
    ).find((candidate) => candidate.contourLevel === contourLevel);
    if (entry === undefined) continue;
    for (const depthLayer of raisedTerrainDepthLayers(entry)) {
      for (const layer of stratumLayers(terrain, entry, depthLayer.stratum, depthLayer)) {
        queued.push(layer);
      }
    }
  }

  // Include the opaque projected surface when the selected logical tile is
  // not itself a cap/ramp cell. Its frame is baked into the chunk cache.
  const logicalElevation = terrainElevationAt(terrain, tileX, tileY);
  const boundary = plateauLayerPlansAt(terrain, tileX, tileY)
    .find(({ contourLevel }) => contourLevel === logicalElevation)?.plan;
  if (terrain.generator !== 'cellar' && logicalElevation > 0 && (boundary === undefined
    || (boundary.edgeFrame === null && boundary.rampFrame === null))) {
    queued.push({
      asset: 'ground_cache',
      frame: null,
      role: 'projected_surface',
      contourLevel: logicalElevation,
      tileX,
      tileY,
      elevationLayer: logicalElevation,
      depthPhase: 'surface',
      footY: (tileY + 1 - logicalElevation * projectionRows) * TILE_SIZE_PIXELS,
      depthOffset: 0,
      tie: `0-surface:${logicalElevation}:${tileY}:${tileX}`,
    });
  }

  return {
    projectedWorldX,
    projectedWorldY,
    tileX,
    tileY,
    activeElevation,
    logicalElevation,
    collisionCell: terrainPlaneCollisionCellAt(terrain, tileX, tileY, activeElevation),
    blocked,
    layers: sortWorldDepthItems(queued),
  };
}

export function terrainInspectionLines(inspection: TerrainInspection): readonly string[] {
  const lines = [
    'TERRAIN TILE INSPECTOR [G + CLICK]',
    `PROJECTED ${inspection.projectedWorldX.toFixed(1)},${inspection.projectedWorldY.toFixed(1)}`,
    `TILE ${inspection.tileX},${inspection.tileY} ACTIVE L${inspection.activeElevation} TILE L${inspection.logicalElevation}`,
    `COLLISION ${inspection.collisionCell.toUpperCase()} / ${inspection.blocked ? 'BLOCKED' : 'OPEN'}`,
    'COMPOSED BACK -> FRONT',
  ];
  if (inspection.layers.length === 0) lines.push('  (NO RAISED TERRAIN LAYERS)');
  for (let index = 0; index < inspection.layers.length; index += 1) {
    const layer = inspection.layers[index]!;
    lines.push(
      `${String(index + 1).padStart(2, '0')} L${layer.elevationLayer} ${layer.depthPhase.toUpperCase()} ${layer.asset}`,
      `   F${layer.frame ?? '-'} ${layer.role} C${layer.contourLevel} @${layer.tileX},${layer.tileY}`,
      `   Y${layer.footY.toFixed(1)}+${layer.depthOffset.toFixed(4)} ${layer.tie}`,
    );
  }
  return lines;
}
