import type { LoadedAsset } from './assets.js';
import { selectAtlasFrame } from './sprite.js';
import { blob47FrameIndexFor } from './tilemap.js';

export interface FarmSoilTile {
  readonly tileX: number;
  readonly tileY: number;
  readonly watered: boolean;
}

export function farmSoilKey(tileX: number, tileY: number): string { return `${tileX}:${tileY}`; }

export function farmSoilFrameIndex(
  tile: Pick<FarmSoilTile, 'tileX' | 'tileY'>,
  occupied: ReadonlySet<string>,
): number {
  return blob47FrameIndexFor((offsetX, offsetY) => (
    occupied.has(farmSoilKey(tile.tileX + offsetX, tile.tileY + offsetY))
  ));
}

function drawSoilFrame(
  context: CanvasRenderingContext2D,
  asset: LoadedAsset,
  frameIndex: number,
  destinationX: number,
  destinationY: number,
  scale: number,
): boolean {
  const frame = selectAtlasFrame(asset.metadata, 'base', frameIndex);
  if (frame === null) return false;
  context.drawImage(
    asset.image,
    frame.x,
    frame.y,
    frame.width,
    frame.height,
    destinationX,
    destinationY,
    16 * scale,
    16 * scale,
  );
  return true;
}

/** The grass blend sheet contains an empty-grass frame rather than a dedicated
 * isolated-soil frame. Join the authored north and south boundary halves for a
 * lone tile; all connected topologies can use their matching full frame. */
function drawGrassBlend(
  context: CanvasRenderingContext2D,
  asset: LoadedAsset,
  frameIndex: number,
  destinationX: number,
  destinationY: number,
  scale: number,
): number {
  if (frameIndex !== 0) {
    return Number(drawSoilFrame(context, asset, frameIndex, destinationX, destinationY, scale));
  }
  const northEdge = selectAtlasFrame(asset.metadata, 'base', 5);
  const southEdge = selectAtlasFrame(asset.metadata, 'base', 1);
  if (northEdge === null || southEdge === null) return 0;
  context.drawImage(
    asset.image,
    northEdge.x,
    northEdge.y,
    northEdge.width,
    8,
    destinationX,
    destinationY,
    16 * scale,
    8 * scale,
  );
  context.drawImage(
    asset.image,
    southEdge.x,
    southEdge.y + 8,
    southEdge.width,
    8,
    destinationX,
    destinationY + 8 * scale,
    16 * scale,
    8 * scale,
  );
  return 2;
}

/** Dynamic soil stays outside the immutable terrain chunk cache. Dry soil is
 * the base, wet soil darkens its centre, and the authored transparent grass
 * fringe finishes the outside while retaining the lighter inner path edge. */
export function drawFarmSoil(
  context: CanvasRenderingContext2D,
  dry: LoadedAsset,
  wet: LoadedAsset,
  grassBlend: LoadedAsset,
  tiles: Iterable<FarmSoilTile>,
  cameraX: number,
  cameraY: number,
  scale: number,
  viewportWidth: number,
  viewportHeight: number,
): number {
  const rows = [...tiles];
  const occupied = new Set(rows.map((tile) => farmSoilKey(tile.tileX, tile.tileY)));
  const minimumX = cameraX / 16 - 1;
  const minimumY = cameraY / 16 - 1;
  const maximumX = (cameraX + viewportWidth / scale) / 16 + 1;
  const maximumY = (cameraY + viewportHeight / scale) / 16 + 1;
  let draws = 0;
  context.imageSmoothingEnabled = false;
  for (const tile of rows) {
    if (tile.tileX < minimumX || tile.tileY < minimumY || tile.tileX > maximumX || tile.tileY > maximumY) continue;
    const frameIndex = farmSoilFrameIndex(tile, occupied);
    const destinationX = Math.round((tile.tileX * 16 - cameraX) * scale);
    const destinationY = Math.round((tile.tileY * 16 - cameraY) * scale);
    if (!drawSoilFrame(context, dry, frameIndex, destinationX, destinationY, scale)) continue;
    draws += 1;
    if (tile.watered) {
      draws += Number(drawSoilFrame(context, wet, frameIndex, destinationX, destinationY, scale));
    }
    draws += drawGrassBlend(context, grassBlend, frameIndex, destinationX, destinationY, scale);
  }
  return draws;
}

export function drawFarmTileTarget(
  context: CanvasRenderingContext2D,
  crosshair: LoadedAsset,
  tileX: number,
  tileY: number,
  cameraX: number,
  cameraY: number,
  scale: number,
): void {
  const frame = selectAtlasFrame(crosshair.metadata, 'idle', 0)
    ?? selectAtlasFrame(crosshair.metadata, 'base', 0);
  if (frame === null) return;
  context.drawImage(
    crosshair.image,
    frame.x,
    frame.y,
    frame.width,
    frame.height,
    Math.round((tileX * 16 - cameraX) * scale),
    Math.round((tileY * 16 - cameraY) * scale),
    16 * scale,
    16 * scale,
  );
}

/** A palette-safe world-space cousin of the hotbar selection frame. The pack's
 * selector sheet has white, green, and red variants but no yellow state, so the
 * farming target uses the project's gold ramp with the same corner language. */
export function drawFarmTileReticle(
  context: CanvasRenderingContext2D,
  tileX: number,
  tileY: number,
  cameraX: number,
  cameraY: number,
  scale: number,
): void {
  const unit = Math.max(1, Math.round(scale));
  const x = Math.round((tileX * 16 - cameraX) * scale) - unit;
  const y = Math.round((tileY * 16 - cameraY) * scale) - unit;
  const size = 18 * unit;
  const arm = 5 * unit;
  const segments = [
    [x, y, arm, unit], [x, y, unit, arm],
    [x + size - arm, y, arm, unit], [x + size - unit, y, unit, arm],
    [x, y + size - unit, arm, unit], [x, y + size - arm, unit, arm],
    [x + size - arm, y + size - unit, arm, unit], [x + size - unit, y + size - arm, unit, arm],
  ] as const;
  context.fillStyle = '#3f2832';
  for (const [left, top, width, height] of segments) context.fillRect(left + unit, top + unit, width, height);
  context.fillStyle = '#f7c94b';
  for (const [left, top, width, height] of segments) context.fillRect(left, top, width, height);
  context.fillStyle = '#ffe98a';
  context.fillRect(x + unit, y, Math.max(unit, arm - unit * 2), unit);
  context.fillRect(x, y + unit, unit, Math.max(unit, arm - unit * 2));
}
