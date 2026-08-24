import { SURVIVAL_WORLD_SIZE, survivalBiomeAt, type Direction } from '@orchard/sim';
import type { CropPatch, FarmParcel } from './net/generated/types.js';
import { loadGeneratedAsset, type LoadedAsset } from './render/assets.js';
import { drawPixelPanel, drawPixelText, loadPixelUi, measurePixelText, type PixelUi } from './render/pixel-ui.js';
import { selectAtlasFrame, type AtlasFrame } from './render/sprite.js';

export interface OverworldArt {
  readonly avatar: LoadedAsset;
  readonly avatarAxe: LoadedAsset;
  readonly crop: LoadedAsset;
  readonly farmland: LoadedAsset;
  readonly farmlandWet: LoadedAsset;
  readonly fenceHorizontal: LoadedAsset;
  readonly fenceVertical: LoadedAsset;
  readonly flowersGold: LoadedAsset;
  readonly flowersPink: LoadedAsset;
  readonly grassTuft: LoadedAsset;
  readonly hillside: LoadedAsset;
  readonly iconAxe: LoadedAsset;
  readonly iconHoe: LoadedAsset;
  readonly iconPickaxe: LoadedAsset;
  readonly iconWateringCan: LoadedAsset;
  readonly itemWood: LoadedAsset;
  readonly path: LoadedAsset;
  readonly water: LoadedAsset;
  readonly waterRipples: LoadedAsset;
  readonly treeFruiting: LoadedAsset;
  readonly treeMature: LoadedAsset;
  readonly treeStump: LoadedAsset;
  readonly ui: PixelUi;
}

export async function loadOverworldArt(): Promise<OverworldArt> {
  const [
    avatar, avatarAxe, crop, farmland, farmlandWet, fenceHorizontal, fenceVertical,
    flowersGold, flowersPink, grassTuft, hillside, iconAxe, iconHoe, iconPickaxe,
    iconWateringCan, itemWood, path, water, waterRipples,
    treeFruiting, treeMature, treeStump, ui,
  ] = await Promise.all([
    loadGeneratedAsset('avatar_cf_farmer', 'summer'),
    loadGeneratedAsset('avatar_cf_farmer_axe', 'summer'),
    loadGeneratedAsset('crop_cf_carrot_mature', 'summer'),
    loadGeneratedAsset('tile_cf_farmland', 'summer'),
    loadGeneratedAsset('tile_cf_farmland_wet', 'summer'),
    loadGeneratedAsset('prop_cf_fence_horizontal', 'summer'),
    loadGeneratedAsset('prop_cf_fence_vertical', 'summer'),
    loadGeneratedAsset('prop_cf_flowers_gold', 'summer'),
    loadGeneratedAsset('prop_cf_flowers_pink', 'summer'),
    loadGeneratedAsset('tile_cf_grass_tuft', 'summer'),
    loadGeneratedAsset('tile_cf_hillside', 'summer'),
    loadGeneratedAsset('icon_cf_axe', 'summer'),
    loadGeneratedAsset('icon_cf_hoe', 'summer'),
    loadGeneratedAsset('icon_cf_pickaxe', 'summer'),
    loadGeneratedAsset('icon_cf_watering_can', 'summer'),
    loadGeneratedAsset('item_cf_wood', 'summer'),
    loadGeneratedAsset('tile_cf_path', 'summer'),
    loadGeneratedAsset('tile_cf_water', 'summer'),
    loadGeneratedAsset('tile_cf_water_ripples', 'summer'),
    loadGeneratedAsset('tree_cf_fruit_fruiting', 'summer'),
    loadGeneratedAsset('tree_cf_fruit_mature', 'summer'),
    loadGeneratedAsset('tree_cf_oak_stump', 'summer'),
    loadPixelUi(),
  ]);
  return {
    avatar, avatarAxe, crop, farmland, farmlandWet, fenceHorizontal, fenceVertical,
    flowersGold, flowersPink, grassTuft, hillside, iconAxe, iconHoe, iconPickaxe,
    iconWateringCan, itemWood, path, water, waterRipples,
    treeFruiting, treeMature, treeStump, ui,
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
  const anchorX = flipX ? source.width - 1 - asset.anchor[0] : asset.anchor[0];
  const x = Math.round((worldX - cameraX - anchorX) * zoom);
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

export function drawUiAsset(
  context: CanvasRenderingContext2D,
  asset: LoadedAsset,
  x: number,
  y: number,
): void {
  const source = frame(asset);
  if (source === null) return;
  context.drawImage(asset.image, source.x, source.y, source.width, source.height, Math.round(x), Math.round(y), source.width, source.height);
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
  viewportWidth: number,
  viewportHeight: number,
  seed: number,
): void {
  // Every fill is taken directly from a reviewed Cute Fantasy source ramp. The
  // canvas has no global tint/filter; authored pixels are drawn unchanged.
  context.fillStyle = '#0095e9';
  context.fillRect(0, 0, viewportWidth, viewportHeight);
  const minX = Math.max(0, Math.floor(cameraX / 16) - 1);
  const minY = Math.max(0, Math.floor(cameraY / 16) - 1);
  const maxX = Math.min(SURVIVAL_WORLD_SIZE - 1, Math.ceil((cameraX + viewportWidth / zoom) / 16) + 1);
  const maxY = Math.min(SURVIVAL_WORLD_SIZE - 1, Math.ceil((cameraY + viewportHeight / zoom) / 16) + 1);
  for (let tileY = minY; tileY <= maxY; tileY += 1) for (let tileX = minX; tileX <= maxX; tileX += 1) {
    const biome = survivalBiomeAt(seed, tileX, tileY);
    const colors: Record<typeof biome, string> = {
      water: '#0095e9',
      beach: '#e4a672',
      plains: '#3e8948',
      meadow: '#50af5d',
      forest: '#33713b',
      valley: '#3f886c',
      highland: '#56627b',
      ridge: '#3c4258',
    };
    context.fillStyle = colors[biome];
    context.fillRect(
      Math.round((tileX * 16 - cameraX) * zoom),
      Math.round((tileY * 16 - cameraY) * zoom),
      16 * zoom,
      16 * zoom,
    );
    const hash = tileHash(tileX, tileY);
    if (biome === 'water' && hash % 13 === 0) {
      drawTile(context, art.waterRipples, tileX, tileY, cameraX, cameraY, zoom);
    } else if ((biome === 'plains' || biome === 'meadow') && hash % (biome === 'meadow' ? 9 : 23) === 0) {
      drawTile(context, art.grassTuft, tileX, tileY, cameraX, cameraY, zoom);
    } else if ((biome === 'valley' || biome === 'highland') && hash % 17 === 0) {
      drawTile(context, art.hillside, tileX, tileY, cameraX, cameraY, zoom);
    }
  }
}

export interface WorldDrawItem {
  readonly footY: number;
  readonly tie: string;
}

export function sortWorldDrawItems<T extends WorldDrawItem>(items: readonly T[]): T[] {
  return [...items].sort((left, right) => left.footY - right.footY || left.tie.localeCompare(right.tie));
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

export function drawOverworldStump(
  context: CanvasRenderingContext2D,
  art: OverworldArt,
  x: number,
  y: number,
  cameraX: number,
  cameraY: number,
  zoom: number,
): void {
  drawAnchored(context, art.treeStump, 'base', 0, x, y, cameraX, cameraY, zoom);
}

export function drawOverworldItem(
  context: CanvasRenderingContext2D,
  art: OverworldArt,
  x: number,
  y: number,
  arcHeight: number,
  cameraX: number,
  cameraY: number,
  zoom: number,
): void {
  drawAnchored(context, art.itemWood, 'base', 0, x, y - arcHeight, cameraX, cameraY, zoom);
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
  axeFrame: number | null,
  name: string,
  uiScale: number,
): void {
  const animation = avatarAnimationForDirection(facing);
  const frameIndex = avatarFrameIndex(moving, animationTick);
  drawAnchored(
    context,
    axeFrame === null ? art.avatar : art.avatarAxe,
    axeFrame === null ? animation : axeAnimationForDirection(facing),
    axeFrame ?? frameIndex,
    x,
    y,
    cameraX,
    cameraY,
    zoom,
    facing === 'left' || facing === 'upLeft' || facing === 'downLeft',
  );
  const screenX = Math.round((x - cameraX) * zoom);
  const screenY = Math.round((y - cameraY - 36) * zoom);
  const label = name.slice(0, 20);
  const width = measurePixelText(label) + 8;
  context.save();
  context.translate(screenX, screenY);
  context.scale(uiScale, uiScale);
  drawPixelPanel(context, art.ui, -width / 2, 0, width, 15);
  drawPixelText(context, art.ui, label, 0, 4, { align: 'center' });
  context.restore();
}

export function axeAnimationForDirection(facing: Direction): 'axe_up' | 'axe_right' | 'axe_down' {
  if (facing === 'up') return 'axe_up';
  if (facing === 'down') return 'axe_down';
  return 'axe_right';
}

export function avatarAnimationForDirection(facing: Direction): 'walk_up' | 'walk_right' | 'walk_down' {
  if (facing === 'up') return 'walk_up';
  if (facing === 'down') return 'walk_down';
  return 'walk_right';
}

export function avatarFrameIndex(moving: boolean, animationTick: number): number {
  return moving ? Math.floor(animationTick / 8) % 4 : 0;
}
