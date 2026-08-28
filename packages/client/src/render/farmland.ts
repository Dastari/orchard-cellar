import type { LoadedAsset } from './assets.js';
import { selectAtlasFrame } from './sprite.js';
import { blob47FrameIndexFor } from './tilemap.js';

export interface FarmSoilTile {
  readonly tileX: number;
  readonly tileY: number;
  readonly watered: boolean;
}

export interface InsetGroundTile {
  readonly tileX: number;
  readonly tileY: number;
}

export function farmSoilKey(tileX: number, tileY: number, spaceId = 0): string {
  return spaceId === 0 ? `${tileX}:${tileY}` : `${spaceId}:${tileX}:${tileY}`;
}

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

/** The grass blend sheet's topology zero is an empty-grass cell, not an
 * isolated inset. The farmland/path fill already owns its complete isolated
 * block, so drawing that overlay would hide it behind a small cross. */
function drawGrassBlend(
  context: CanvasRenderingContext2D,
  asset: LoadedAsset,
  frameIndex: number,
  destinationX: number,
  destinationY: number,
  scale: number,
): number {
  if (frameIndex === 0) return 0;
  return Number(drawSoilFrame(context, asset, frameIndex, destinationX, destinationY, scale));
}

/** Draws any authored ground mask with the same blob47 topology and inset
 * grass fringe used by farmland. Paths and future editable ground patches can
 * therefore share one deterministic edge rule without becoming farm state. */
export function drawInsetGround(
  context: CanvasRenderingContext2D,
  fill: LoadedAsset,
  grassBlend: LoadedAsset,
  tiles: Iterable<InsetGroundTile>,
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
    if (!drawSoilFrame(context, fill, frameIndex, destinationX, destinationY, scale)) continue;
    draws += 1;
    draws += drawGrassBlend(context, grassBlend, frameIndex, destinationX, destinationY, scale);
  }
  return draws;
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
  const watered = new Set(rows.filter((tile) => tile.watered)
    .map((tile) => farmSoilKey(tile.tileX, tile.tileY)));
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
      const wetFrameIndex = farmSoilFrameIndex(tile, watered);
      draws += Number(drawSoilFrame(context, wet, wetFrameIndex, destinationX, destinationY, scale));
    }
    draws += drawGrassBlend(context, grassBlend, frameIndex, destinationX, destinationY, scale);
  }
  return draws;
}

/** Draws the authored neutral/deny selector around a tile. Tile tools and
 * placeables deliberately share this renderer so their targeting language
 * cannot drift apart. */
export function drawInteractionTileReticle(
  context: CanvasRenderingContext2D,
  selector: LoadedAsset,
  tileX: number,
  tileY: number,
  cameraX: number,
  cameraY: number,
  scale: number,
): void {
  const frame = selectAtlasFrame(selector.metadata, 'idle', 0)
    ?? selectAtlasFrame(selector.metadata, 'base', 0);
  if (frame === null) return;
  // The selector sheet has authored transparent padding. A 28 px destination
  // makes its visible corners hug a 16 px world tile without clipping them.
  const destinationSize = 28 * scale;
  const destinationInset = 6 * scale;
  context.drawImage(
    selector.image,
    frame.x,
    frame.y,
    frame.width,
    frame.height,
    Math.round((tileX * 16 - cameraX) * scale - destinationInset),
    Math.round((tileY * 16 - cameraY) * scale - destinationInset),
    destinationSize,
    destinationSize,
  );
}
