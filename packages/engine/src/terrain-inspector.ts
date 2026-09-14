import { TILE_SIZE_PIXELS } from '@orchard/sim';
import type { OverworldArt } from './overworld-art.js';
import type { LoadedAsset } from '@orchard/ui';
import {
  cellarGroundVisualLayersAt,
  type GroundChunkCache,
} from './ground-cache.js';
import {
  raisedTerrainDepthEntries,
  raisedTerrainDepthLayers,
  raisedTerrainStairFrameIndex,
  raisedTerrainWaterfallFrameIndex,
  terrainLedgePlanAt,
} from './raised-terrain-depth.js';
import { sortWorldDepthItems, type WorldDepthItem } from './renderer.js';
import { selectAtlasFrame } from '@orchard/ui';
import {
  plateauLayerPlansAt,
  raisedCliffTileSetFor,
  terrainBaseDatum,
  terrainElevationAt,
  terrainMaximumElevation,
  terrainMinimumElevation,
  terrainPlaneCollisionCellAt,
  terrainProjectionStyle,
  terrainProjectedRowsPerLevel,
  terrainVisualProjectionRowsPerLevel,
  type TerrainArray,
} from './terrain.js';

export interface TerrainInspectorLayer {
  readonly asset: string;
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

export interface TerrainInspectionThumbnailRect {
  readonly index: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly visibilityToggle: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
}

export interface TerrainInspectionThumbnailHit {
  readonly index: number;
  readonly target: 'layer' | 'visibility';
}

/** Removes visually identical layers that land on the same projected tile.
 * Keep the frontmost occurrence so the inspector mirrors painter order while
 * avoiding duplicate thumbnails for one actual bitmap contribution. */
export function squashDuplicateTerrainInspectorLayers(
  layers: readonly TerrainInspectorLayer[],
): readonly TerrainInspectorLayer[] {
  const seen = new Set<string>();
  const retained: TerrainInspectorLayer[] = [];
  for (let index = layers.length - 1; index >= 0; index -= 1) {
    const layer = layers[index]!;
    const key = [
      layer.asset, layer.frame ?? '-', layer.tileX,
      layer.footY, layer.depthOffset,
    ].join(':');
    if (seen.has(key)) continue;
    seen.add(key);
    retained.push(layer);
  }
  return retained.reverse();
}

const VISUAL_HORIZONTAL_PADDING = 12;
const VISUAL_VERTICAL_PADDING = 9;
const COMPOSITE_SIZE = 80;
const THUMBNAIL_SIZE = 32;
const THUMBNAIL_GAP = 4;
const THUMBNAIL_COLUMNS = 4;
const VISIBILITY_TOGGLE_SIZE = 10;
const VISUAL_BOTTOM_PADDING = 12;
// Fits the complete heading and leaves a real inner gutter around the stack;
// the old content-derived 160px panel clipped at narrower UI scales.
const VISUAL_MINIMUM_WIDTH = 190;

export function terrainInspectionVisualLayout(inspection: TerrainInspection): TerrainInspectionVisualLayout {
  // Keep the four-column stack grid stable even when a tile currently has
  // fewer layers. Besides preventing the inspector from shifting underneath
  // the pointer as layers are hidden, this preserves the offline editor's
  // established stack-tile hit positions while the wider frame adds padding.
  const columns = THUMBNAIL_COLUMNS;
  const rows = Math.ceil(inspection.layers.length / columns);
  return {
    width: Math.max(VISUAL_MINIMUM_WIDTH, VISUAL_HORIZONTAL_PADDING * 2 + Math.max(
      COMPOSITE_SIZE,
      columns * THUMBNAIL_SIZE + (columns - 1) * THUMBNAIL_GAP,
    )),
    height: VISUAL_VERTICAL_PADDING * 3 + COMPOSITE_SIZE + VISUAL_BOTTOM_PADDING
      + rows * THUMBNAIL_SIZE + Math.max(0, rows - 1) * THUMBNAIL_GAP,
    compositeSize: COMPOSITE_SIZE,
    thumbnailSize: THUMBNAIL_SIZE,
    columns,
  };
}

export function terrainInspectionThumbnailRects(
  inspection: TerrainInspection,
  x: number,
  y: number,
): readonly TerrainInspectionThumbnailRect[] {
  const layout = terrainInspectionVisualLayout(inspection);
  const compositeY = y + VISUAL_VERTICAL_PADDING;
  const thumbnailsY = compositeY + layout.compositeSize + VISUAL_VERTICAL_PADDING * 2;
  const gridWidth = layout.columns * layout.thumbnailSize
    + (layout.columns - 1) * THUMBNAIL_GAP;
  const thumbnailsX = x + Math.floor((layout.width - gridWidth) / 2);
  return inspection.layers.map((_layer, index) => {
    const column = index % layout.columns;
    const row = Math.floor(index / layout.columns);
    const thumbnailX = thumbnailsX + column * (layout.thumbnailSize + THUMBNAIL_GAP);
    const thumbnailY = thumbnailsY + row * (layout.thumbnailSize + THUMBNAIL_GAP);
    return {
      index,
      x: thumbnailX,
      y: thumbnailY,
      width: layout.thumbnailSize,
      height: layout.thumbnailSize,
      visibilityToggle: {
        x: thumbnailX + layout.thumbnailSize - VISIBILITY_TOGGLE_SIZE,
        y: thumbnailY,
        width: VISIBILITY_TOGGLE_SIZE,
        height: VISIBILITY_TOGGLE_SIZE,
      },
    };
  });
}

export function terrainInspectionThumbnailHitAt(
  rects: readonly TerrainInspectionThumbnailRect[],
  x: number,
  y: number,
): TerrainInspectionThumbnailHit | null {
  for (const rect of rects) {
    const toggle = rect.visibilityToggle;
    if (x >= toggle.x && y >= toggle.y
      && x < toggle.x + toggle.width && y < toggle.y + toggle.height) {
      return { index: rect.index, target: 'visibility' };
    }
    if (x >= rect.x && y >= rect.y && x < rect.x + rect.width && y < rect.y + rect.height) {
      return { index: rect.index, target: 'layer' };
    }
  }
  return null;
}

function assetForLayer(art: OverworldArt, layer: TerrainInspectorLayer): LoadedAsset | null {
  return art.terrainAssets[layer.asset] ?? null;
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

/** Spatial preview only. The host kit owns frames, labels and layer controls. */
export function drawTerrainInspectionPreview(
  context: CanvasRenderingContext2D,
  art: OverworldArt,
  terrain: TerrainArray,
  groundCache: GroundChunkCache,
  inspection: TerrainInspection,
  bounds: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
  layerIndex: number | null,
  layerVisibility: readonly boolean[] = [],
): void {
  const size = Math.max(0, Math.min(bounds.width, bounds.height));
  if (size === 0) return;
  context.save();
  context.beginPath(); context.rect(bounds.x, bounds.y, bounds.width, bounds.height); context.clip();
  context.imageSmoothingEnabled = false;
  const alpha = context.globalAlpha;
  try {
    for (let index = 0; index < inspection.layers.length; index++) {
      if (layerIndex !== null && index !== layerIndex) continue;
      if (layerIndex === null && layerVisibility[index] === false) continue;
      context.globalAlpha = alpha * (layerIndex !== null && layerVisibility[index] === false ? 0.25 : 1);
      drawLayerPreview(context, art, terrain, groundCache, inspection.layers[index]!, bounds.x, bounds.y, size);
    }
  } finally { context.restore(); }
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
  const tileSet = raisedCliffTileSetFor(terrain, entry.tileX, entry.tileY);
  if (waterfallFrame !== null) {
    return [{
      ...common,
      asset: tileSet.waterfallAssetId ?? 'tile_cf_waterfall',
      frame: waterfallFrame,
      role: `raised_waterfall_${stratum}`,
    }];
  }
  const layers: TerrainInspectorLayer[] = [];
  const cliffAsset = tileSet.assetId;
  const insetAsset = tileSet.insetAssetId ?? tileSet.assetId;
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
    const rampBankFrame = entry.plan.rampRole === null
      ? null : raisedTerrainStairFrameIndex(terrain, entry);
    if (rampBankFrame !== null || entry.plan.rampFrame !== null) {
      layers.push({
        ...common,
        asset: tileSet.rampBank?.assetId ?? tileSet.rampAssetId ?? tileSet.assetId,
        frame: rampBankFrame ?? entry.plan.rampFrame,
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
  const baseDatum = terrainBaseDatum(terrain);
  const tileY = Math.floor(
    (projectedWorldY + (activeElevation - baseDatum)
      * visualProjectionRows * TILE_SIZE_PIXELS) / TILE_SIZE_PIXELS,
  );
  const queued: TerrainInspectorLayer[] = [];

  // The normal unprojected terrain pass is always below the raised queue. It
  // is crucial in this inspector because translucent cliff gutters reveal it.
  const groundTileX = Math.floor(projectedWorldX / TILE_SIZE_PIXELS);
  const groundTileY = Math.floor(projectedWorldY / TILE_SIZE_PIXELS);
  const inspectableGroundLayers = terrainProjectionStyle(terrain) === 'interior'
    && (terrain.rogueTheme === undefined || terrain.rogueTheme === 'cave')
    ? cellarGroundVisualLayersAt(terrain, groundTileX, groundTileY)
    : [{ asset: 'ground_cache', frame: 0, role: 'base_ground' }];
  inspectableGroundLayers.forEach((layer, index) => queued.push({
    asset: layer.asset,
    frame: layer.asset === 'ground_cache' ? null : layer.frame,
    role: layer.role,
    contourLevel: 0,
    tileX: groundTileX,
    tileY: groundTileY,
    elevationLayer: 0,
    depthPhase: 'surface',
    footY: (groundTileY + 1) * TILE_SIZE_PIXELS,
    depthOffset: 0,
    tie: `0-ground-cache:${String(index).padStart(2, '0')}`,
  }));

  // A rendered contour at level L is translated upward by L projected rows.
  // Reversing that projection lets a click on the visible wall inspect the
  // logical tile which supplied each overlapping contour layer.
  for (
    let contourLevel = Math.min(terrainMinimumElevation(terrain), baseDatum) + 1;
    contourLevel <= Math.max(terrainMaximumElevation(terrain), baseDatum);
    contourLevel += 1
  ) {
    const sourceTileY = Math.floor(projectedWorldY / TILE_SIZE_PIXELS)
      + (contourLevel - baseDatum) * visualProjectionRows;
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
  if (visualProjectionRows > 0 && logicalElevation !== baseDatum && (boundary === undefined
    || (boundary.edgeFrame === null && boundary.rampRole === null))) {
    queued.push({
      asset: 'ground_cache',
      frame: null,
      role: 'projected_surface',
      contourLevel: logicalElevation,
      tileX,
      tileY,
      elevationLayer: logicalElevation,
      depthPhase: 'surface',
      footY: (tileY + 1 - (logicalElevation - baseDatum) * projectionRows) * TILE_SIZE_PIXELS,
      depthOffset: 0,
      tie: `0-surface:${logicalElevation}:${tileY}:${tileX}`,
    });
  }

  const ledge = terrainLedgePlanAt(terrain, tileX, tileY);
  if (ledge !== null) {
    const ledgeCommon = {
      contourLevel: logicalElevation,
      tileX,
      tileY,
      elevationLayer: logicalElevation,
      depthPhase: 'boundary' as const,
      footY: (tileY + 1 - (logicalElevation - baseDatum) * projectionRows) * TILE_SIZE_PIXELS,
      depthOffset: 0,
      tie: `0-ledge:${logicalElevation}:${tileY}:${tileX}`,
    };
    if (ledge.edgeFrame !== null) queued.push({
      ...ledgeCommon,
      asset: ledge.assetId,
      frame: ledge.edgeFrame,
      role: `ledge_${ledge.edgeRole ?? 'edge'}`,
    });
    ledge.insetFrames.forEach((frame, index) => queued.push({
      ...ledgeCommon,
      asset: ledge.assetId,
      frame,
      role: `ledge_${ledge.insetRoles[index] ?? `inset_${index}`}`,
    }));
  }

  const sortedLayers = sortWorldDepthItems(queued);
  // A projected surface tile is a full-cell opaque layer. Nothing sorted
  // behind the frontmost ground tile can contribute a pixel, including a
  // stale face/foot from another contour; squash that covered prefix instead
  // of presenting duplicate or impossible inspector layers.
  const frontmostGround = sortedLayers.findLastIndex(({ role }) => (
    role === 'base_ground' || role === 'projected_surface'
  ));
  const uncoveredLayers = frontmostGround < 0 ? sortedLayers : sortedLayers.slice(frontmostGround);
  const visibleLayers = squashDuplicateTerrainInspectorLayers(uncoveredLayers);

  return {
    projectedWorldX,
    projectedWorldY,
    tileX,
    tileY,
    activeElevation,
    logicalElevation,
    collisionCell: terrainPlaneCollisionCellAt(terrain, tileX, tileY, activeElevation),
    blocked,
    layers: visibleLayers,
  };
}

export function terrainInspectionLines(
  inspection: TerrainInspection,
  selectedLayerIndex: number | null = null,
): readonly string[] {
  const lines = [
    'TERRAIN TILE INSPECTOR [G + CLICK]',
    `PROJECTED ${inspection.projectedWorldX.toFixed(1)},${inspection.projectedWorldY.toFixed(1)}`,
    `TILE ${inspection.tileX},${inspection.tileY} ACTIVE L${inspection.activeElevation} TILE L${inspection.logicalElevation}`,
    `COLLISION ${inspection.collisionCell.toUpperCase()} / ${inspection.blocked ? 'BLOCKED' : 'OPEN'}`,
    'COMPOSED BACK -> FRONT',
  ];
  const selected = selectedLayerIndex === null
    ? undefined
    : inspection.layers[selectedLayerIndex];
  if (selectedLayerIndex !== null && selected !== undefined) lines.push(
    `SELECTED #${selectedLayerIndex + 1} ${selected.asset}`,
    `   FRAME ${selected.frame ?? '-'} / ROLE ${selected.role}`,
    `   SOURCE ${selected.tileX},${selected.tileY} / CONTOUR L${selected.contourLevel}`,
    `   ${selected.depthPhase.toUpperCase()} / ELEVATION L${selected.elevationLayer}`,
  );
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
