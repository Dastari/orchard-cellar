import type { Direction } from '@orchard/sim';
import type { CropPatch, FarmParcel } from './net/generated/types.js';
import { loadGeneratedAsset, type LoadedAsset } from './render/assets.js';
import { drawPixelPanel, drawPixelText, loadPixelUi, measurePixelText, type PixelUi } from './render/pixel-ui.js';
import { selectAtlasFrame, type AtlasFrame } from './render/sprite.js';

export interface OverworldArt {
  readonly avatar: LoadedAsset;
  readonly crop: LoadedAsset;
  readonly farmland: LoadedAsset;
  readonly farmlandWet: LoadedAsset;
  readonly fenceHorizontal: LoadedAsset;
  readonly fenceVertical: LoadedAsset;
  readonly flowersGold: LoadedAsset;
  readonly flowersPink: LoadedAsset;
  readonly grassTuft: LoadedAsset;
  readonly path: LoadedAsset;
  readonly treeFruiting: LoadedAsset;
  readonly treeMature: LoadedAsset;
  readonly ui: PixelUi;
}

export async function loadOverworldArt(): Promise<OverworldArt> {
  const [
    avatar, crop, farmland, farmlandWet, fenceHorizontal, fenceVertical,
    flowersGold, flowersPink, grassTuft, path, treeFruiting, treeMature, ui,
  ] = await Promise.all([
    loadGeneratedAsset('avatar_cf_farmer', 'summer'),
    loadGeneratedAsset('crop_cf_carrot_mature', 'summer'),
    loadGeneratedAsset('tile_cf_farmland', 'summer'),
    loadGeneratedAsset('tile_cf_farmland_wet', 'summer'),
    loadGeneratedAsset('prop_cf_fence_horizontal', 'summer'),
    loadGeneratedAsset('prop_cf_fence_vertical', 'summer'),
    loadGeneratedAsset('prop_cf_flowers_gold', 'summer'),
    loadGeneratedAsset('prop_cf_flowers_pink', 'summer'),
    loadGeneratedAsset('tile_cf_grass_tuft', 'summer'),
    loadGeneratedAsset('tile_cf_path', 'summer'),
    loadGeneratedAsset('tree_cf_fruit_fruiting', 'summer'),
    loadGeneratedAsset('tree_cf_fruit_mature', 'summer'),
    loadPixelUi(),
  ]);
  return {
    avatar, crop, farmland, farmlandWet, fenceHorizontal, fenceVertical,
    flowersGold, flowersPink, grassTuft, path, treeFruiting, treeMature, ui,
  };
}

function eligibleDiagonalCount(cardinals: number): number {
  const north = (cardinals & 1) !== 0;
  const east = (cardinals & 2) !== 0;
  const south = (cardinals & 4) !== 0;
  const west = (cardinals & 8) !== 0;
  return Number(north && east) + Number(east && south) + Number(south && west) + Number(west && north);
}

export function canonicalBlob47Index(cardinals: number, diagonalChoice: number): number {
  let index = diagonalChoice;
  for (let previous = 0; previous < cardinals; previous += 1) index += 1 << eligibleDiagonalCount(previous);
  return index;
}

export function isOverworldRoad(tileX: number, tileY: number): boolean {
  const vertical = tileX > 0 && tileX < 79 && (tileX % 16 === 15 || tileX % 16 === 0);
  const horizontal = tileY > 0 && tileY < 79 && (tileY % 16 === 15 || tileY % 16 === 0);
  return vertical || horizontal;
}

function roadVariant(tileX: number, tileY: number): number {
  const connected = (x: number, y: number): boolean => isOverworldRoad(x, y);
  const north = connected(tileX, tileY - 1);
  const east = connected(tileX + 1, tileY);
  const south = connected(tileX, tileY + 1);
  const west = connected(tileX - 1, tileY);
  const cardinals = Number(north) | Number(east) << 1 | Number(south) << 2 | Number(west) << 3;
  const diagonals = [
    north && east && connected(tileX + 1, tileY - 1),
    east && south && connected(tileX + 1, tileY + 1),
    south && west && connected(tileX - 1, tileY + 1),
    west && north && connected(tileX - 1, tileY - 1),
  ];
  let diagonalChoice = 0;
  let choiceBit = 0;
  const eligible = [north && east, east && south, south && west, west && north];
  for (let diagonalIndex = 0; diagonalIndex < eligible.length; diagonalIndex += 1) {
    const allowed = eligible[diagonalIndex] ?? false;
    if (allowed) {
      if (diagonals[diagonalIndex]) diagonalChoice |= 1 << choiceBit;
      choiceBit += 1;
    }
  }
  return canonicalBlob47Index(cardinals, diagonalChoice);
}

function frame(asset: LoadedAsset, animation = 'base', index = 0): AtlasFrame | null {
  return selectAtlasFrame(asset.metadata, animation, index);
}

function drawAnchored(
  context: CanvasRenderingContext2D,
  asset: LoadedAsset,
  animation: string,
  frameIndex: number,
  worldX: number,
  worldY: number,
  cameraX: number,
  cameraY: number,
  zoom: number,
  flipX = false,
): void {
  const source = frame(asset, animation, frameIndex);
  if (source === null) return;
  const x = Math.round((worldX - cameraX - asset.anchor[0]) * zoom);
  const y = Math.round((worldY - cameraY - asset.anchor[1]) * zoom);
  context.save();
  if (flipX) {
    context.translate(x + source.width * zoom, 0);
    context.scale(-1, 1);
    context.drawImage(asset.image, source.x, source.y, source.width, source.height, 0, y, source.width * zoom, source.height * zoom);
  } else {
    context.drawImage(asset.image, source.x, source.y, source.width, source.height, x, y, source.width * zoom, source.height * zoom);
  }
  context.restore();
}

function drawTile(
  context: CanvasRenderingContext2D,
  asset: LoadedAsset,
  tileX: number,
  tileY: number,
  cameraX: number,
  cameraY: number,
  zoom: number,
  frameIndex = 0,
): void {
  drawAnchored(context, asset, 'base', frameIndex, tileX * 16 + 8, tileY * 16 + 15, cameraX, cameraY, zoom);
}

function tileHash(x: number, y: number): number {
  return (Math.imul(x, 73_856_093) ^ Math.imul(y, 19_349_663)) >>> 0;
}

export function drawOverworldGround(
  context: CanvasRenderingContext2D,
  art: OverworldArt,
  cameraX: number,
  cameraY: number,
  zoom: number,
): void {
  // Match Cute Fantasy's native Grass_1_Middle base; detail sprites sit on top.
  context.fillStyle = '#3e8948';
  context.fillRect(0, 0, 480, 270);
  const minX = Math.max(0, Math.floor(cameraX / 16) - 1);
  const minY = Math.max(0, Math.floor(cameraY / 16) - 1);
  const maxX = Math.min(79, Math.ceil((cameraX + 480 / zoom) / 16) + 1);
  const maxY = Math.min(79, Math.ceil((cameraY + 270 / zoom) / 16) + 1);
  for (let tileY = minY; tileY <= maxY; tileY += 1) for (let tileX = minX; tileX <= maxX; tileX += 1) {
    if (isOverworldRoad(tileX, tileY)) drawTile(context, art.path, tileX, tileY, cameraX, cameraY, zoom, roadVariant(tileX, tileY));
    else if (tileHash(tileX, tileY) % 23 === 0) drawTile(context, art.grassTuft, tileX, tileY, cameraX, cameraY, zoom);
  }
}

export function drawOverworldParcel(
  context: CanvasRenderingContext2D,
  art: OverworldArt,
  parcel: FarmParcel,
  crops: readonly CropPatch[],
  cameraX: number,
  cameraY: number,
  zoom: number,
): void {
  for (let y = parcel.originY + 5; y <= parcel.originY + 11; y += 1) for (let x = parcel.originX + 2; x <= parcel.originX + 11; x += 1) {
    const crop = crops.find((candidate) => candidate.tileX === x && candidate.tileY === y);
    drawTile(context, crop?.watered === true ? art.farmlandWet : art.farmland, x, y, cameraX, cameraY, zoom);
  }
  for (let x = parcel.originX + 1; x < parcel.originX + parcel.width - 1; x += 2) {
    drawAnchored(context, art.fenceHorizontal, 'base', 0, x * 16 + 16, parcel.originY * 16 + 15, cameraX, cameraY, zoom);
    drawAnchored(context, art.fenceHorizontal, 'base', 0, x * 16 + 16, (parcel.originY + parcel.height) * 16 - 1, cameraX, cameraY, zoom);
  }
  for (let y = parcel.originY + 1; y < parcel.originY + parcel.height - 1; y += 2) {
    drawAnchored(context, art.fenceVertical, 'base', 0, parcel.originX * 16 + 8, y * 16 + 31, cameraX, cameraY, zoom);
    drawAnchored(context, art.fenceVertical, 'base', 0, (parcel.originX + parcel.width) * 16 - 8, y * 16 + 31, cameraX, cameraY, zoom);
  }
  const flower = Number(parcel.id % 2n) === 0 ? art.flowersPink : art.flowersGold;
  drawTile(context, flower, parcel.originX + 1, parcel.originY + 3, cameraX, cameraY, zoom);

  const label = parcel.name.slice(0, 25).toUpperCase();
  const labelWidth = measurePixelText(label) + 12;
  const screenX = Math.round(((parcel.originX + parcel.width / 2) * 16 - cameraX) * zoom);
  const screenY = Math.round(((parcel.originY + 1) * 16 - cameraY) * zoom);
  drawPixelPanel(context, art.ui, screenX - labelWidth / 2, screenY, labelWidth, 17);
  drawPixelText(context, art.ui, label, screenX, screenY + 5, { align: 'center' });
}

export function drawOverworldCrop(
  context: CanvasRenderingContext2D,
  art: OverworldArt,
  crop: CropPatch,
  stage: 0 | 1 | 2 | 3,
  cameraX: number,
  cameraY: number,
  zoom: number,
): void {
  if (stage === 3) {
    drawTile(context, art.crop, crop.tileX, crop.tileY, cameraX, cameraY, zoom);
    return;
  }
  const x = Math.round((crop.tileX * 16 - cameraX) * zoom);
  const y = Math.round((crop.tileY * 16 - cameraY) * zoom);
  context.fillStyle = stage === 0 ? '#b3781e' : '#58a346';
  const size = Math.max(2, (stage + 1) * zoom);
  context.fillRect(x + 8 * zoom - size / 2, y + (11 - stage * 2) * zoom, size, size + zoom);
}

export function drawOverworldTree(
  context: CanvasRenderingContext2D,
  art: OverworldArt,
  x: number,
  y: number,
  fruiting: boolean,
  cameraX: number,
  cameraY: number,
  zoom: number,
): void {
  drawAnchored(context, fruiting ? art.treeFruiting : art.treeMature, 'base', 0, x, y + 4, cameraX, cameraY, zoom);
}

export function drawOverworldAvatar(
  context: CanvasRenderingContext2D,
  art: OverworldArt,
  x: number,
  y: number,
  facing: Direction,
  moving: boolean,
  animationTick: number,
  cameraX: number,
  cameraY: number,
  zoom: number,
  name: string,
): void {
  const horizontal = facing === 'left' || facing === 'right' || facing === 'upLeft' || facing === 'upRight' || facing === 'downLeft' || facing === 'downRight';
  const animation = facing === 'up' || facing === 'upLeft' || facing === 'upRight' ? 'walk_up' : horizontal ? 'walk_right' : 'walk_down';
  const frameIndex = avatarFrameIndex(moving, animationTick);
  drawAnchored(context, art.avatar, animation, frameIndex, x, y + 4, cameraX, cameraY, zoom, facing === 'left' || facing === 'upLeft' || facing === 'downLeft');
  const screenX = Math.round((x - cameraX) * zoom);
  const screenY = Math.round((y - cameraY - 36) * zoom);
  const label = name.slice(0, 20);
  const width = measurePixelText(label) + 8;
  drawPixelPanel(context, art.ui, screenX - width / 2, screenY, width, 15);
  drawPixelText(context, art.ui, label, screenX, screenY + 4, { align: 'center' });
}

export function avatarFrameIndex(moving: boolean, animationTick: number): number {
  return moving ? Math.floor(animationTick / 8) % 4 : 0;
}
