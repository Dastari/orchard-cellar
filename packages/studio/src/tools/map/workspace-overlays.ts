import { TILE_SIZE_PIXELS } from '@orchard/sim';
import { terrainInspectionVisualLayout } from '@orchard/engine';
import { STUDIO_SKIN_TOKENS, type AtlasFrame, type UiPoint, type UiRect } from '@orchard/ui/studio';
import type { MapEditorController } from './editor-controller.js';
import type { MapEditorRenderer } from './editor-renderer.js';
import type { MapResizeImpact } from './resize.js';
import { MAP_SPATIAL_COLOURS } from './spatial-colours.js';

/** Viewport renderer for transient map-workspace overlays: crop previews,
 * pending placement targets, the palette drag ghost and the tile inspection
 * picture. Everything here is spatial content drawn inside the map viewport;
 * controls and chrome belong to kit factories in canvas.ts. */

type MapInteractionSnapshot = ReturnType<MapEditorController['snapshot']>;
type MapTileComposition = Parameters<MapEditorRenderer['drawTileInspection']>[1];

export function drawMapResizePreview(
  context: CanvasRenderingContext2D,
  impact: MapResizeImpact | null,
  interaction: MapInteractionSnapshot,
): void {
  if (impact === null || impact.cropBounds === null) return;
  const { viewport, camera } = interaction;
  const crop = impact.cropBounds;
  const x = viewport.x + (crop.minimumTileX * TILE_SIZE_PIXELS - camera.x) * camera.zoom;
  const y = viewport.y + (crop.minimumTileY * TILE_SIZE_PIXELS - camera.y) * camera.zoom;
  const width = (crop.maximumTileX - crop.minimumTileX + 1) * TILE_SIZE_PIXELS * camera.zoom;
  const height = (crop.maximumTileY - crop.minimumTileY + 1) * TILE_SIZE_PIXELS * camera.zoom;
  context.save();
  context.beginPath();
  context.rect(viewport.x, viewport.y, viewport.width, viewport.height);
  context.clip();
  context.fillStyle = MAP_SPATIAL_COLOURS.resizeCrop;
  context.fillRect(x, y, width, height);
  context.strokeStyle = STUDIO_SKIN_TOKENS.parchmentLight;
  context.lineWidth = 2;
  context.setLineDash([6, 4]);
  context.strokeRect(x, y, width, height);
  context.setLineDash([]);
  context.restore();
}

/** waiting: amber target awaiting a pending confirmation; ready: green
 * destination; npc: NPC relocation destination. */
export type MapTileTargetStyle = 'waiting' | 'ready' | 'npc';
const TARGET_STYLES: Readonly<Record<MapTileTargetStyle, { readonly fill: string; readonly stroke: string }>> = {
  waiting: { fill: MAP_SPATIAL_COLOURS.targetWaiting, stroke: STUDIO_SKIN_TOKENS.amber },
  ready: { fill: MAP_SPATIAL_COLOURS.targetReady, stroke: STUDIO_SKIN_TOKENS.green },
  npc: { fill: MAP_SPATIAL_COLOURS.targetNpc, stroke: STUDIO_SKIN_TOKENS.amber },
};

export function drawMapTileTarget(
  context: CanvasRenderingContext2D,
  interaction: MapInteractionSnapshot,
  target: { readonly tileX: number; readonly tileY: number },
  projection: number,
  style: MapTileTargetStyle,
): void {
  const { viewport, camera } = interaction;
  const x = viewport.x + (target.tileX * TILE_SIZE_PIXELS - camera.x) * camera.zoom;
  const y = viewport.y + (target.tileY * TILE_SIZE_PIXELS - projection - camera.y) * camera.zoom;
  const size = Math.max(5, TILE_SIZE_PIXELS * camera.zoom);
  const colours = TARGET_STYLES[style];
  context.save();
  context.beginPath();
  context.rect(viewport.x, viewport.y, viewport.width, viewport.height);
  context.clip();
  context.fillStyle = colours.fill;
  context.fillRect(Math.round(x), Math.round(y), Math.round(size), Math.round(size));
  context.strokeStyle = colours.stroke;
  context.lineWidth = 2;
  context.setLineDash([6, 4]);
  context.strokeRect(Math.round(x), Math.round(y), Math.round(size), Math.round(size));
  context.setLineDash([]);
  context.restore();
}

/** Semi-transparent sprite following the pointer while a palette object is dragged. */
export function drawPaletteDragGhost(
  context: CanvasRenderingContext2D,
  preview: { readonly image: CanvasImageSource; readonly frame: AtlasFrame },
  point: UiPoint,
): void {
  const f = preview.frame;
  const scale = Math.min(96 / f.width, 96 / f.height);
  context.save();
  context.globalAlpha = 0.75;
  context.imageSmoothingEnabled = false;
  context.drawImage(preview.image, f.x, f.y, f.width, f.height,
    point.x - f.width * scale / 2, point.y - f.height * scale, f.width * scale, f.height * scale);
  context.restore();
}

/** Logical height the tile inspection picture needs at a given drawer width. */
export function mapTileInspectionHeight(composition: MapTileComposition, width: number): number {
  const layout = terrainInspectionVisualLayout(composition);
  return Math.ceil(layout.height * Math.min(1, Math.max(1, width) / layout.width));
}

/** Tile inspection picture, scaled down (never up) and centred in its viewport. */
export function drawMapTileInspection(
  context: CanvasRenderingContext2D,
  renderer: MapEditorRenderer,
  composition: MapTileComposition,
  bounds: UiRect,
): void {
  const layout = terrainInspectionVisualLayout(composition);
  const scale = Math.min(1, bounds.width / layout.width);
  context.save();
  context.translate(bounds.x + (bounds.width - layout.width * scale) / 2, bounds.y);
  context.scale(scale, scale);
  renderer.drawTileInspection(context, composition);
  context.restore();
}
