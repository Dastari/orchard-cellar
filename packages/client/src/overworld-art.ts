import type { Direction } from '@orchard/sim';
import { loadGeneratedAsset, type LoadedAsset } from './render/assets.js';
import { drawPixelText, loadPixelUi, measurePixelText, type PixelUi } from './render/pixel-ui.js';
import { selectAtlasFrame, type AtlasFrame } from './render/sprite.js';
import { loadUiSkin, type UiSkin } from './ui/skin.js';

export interface OverworldArt {
  readonly avatar: LoadedAsset;
  readonly avatarAxe: LoadedAsset;
  readonly actionAssets: Readonly<Record<string, LoadedAsset>>;
  readonly grass: LoadedAsset;
  readonly meadowGrass: LoadedAsset;
  readonly highlandGrass: LoadedAsset;
  readonly valleyGrass: LoadedAsset;
  readonly grassTuft: LoadedAsset;
  readonly water: LoadedAsset;
  readonly freshwater: LoadedAsset;
  readonly waterfall: LoadedAsset;
  readonly beach: LoadedAsset;
  readonly desert: LoadedAsset;
  readonly desertShore: LoadedAsset;
  readonly desertGrass: LoadedAsset;
  readonly path: LoadedAsset;
  readonly cliff: LoadedAsset;
  readonly cliff2: LoadedAsset;
  readonly cliff3: LoadedAsset;
  readonly cliff4: LoadedAsset;
  readonly desertCliff: LoadedAsset;
  readonly iconAxe: LoadedAsset;
  readonly iconHoe: LoadedAsset;
  readonly iconPickaxe: LoadedAsset;
  readonly iconWateringCan: LoadedAsset;
  readonly itemWood: LoadedAsset;
  readonly rainStreak: LoadedAsset;
  readonly rainSplash: LoadedAsset;
  readonly waterRipples: LoadedAsset;
  readonly treeFruiting: LoadedAsset;
  readonly treeMature: LoadedAsset;
  readonly treeOak: LoadedAsset;
  readonly treeBirch: LoadedAsset;
  readonly treeSpruce: LoadedAsset;
  readonly treeAcacia: LoadedAsset;
  readonly treePalm: LoadedAsset;
  readonly treeStump: LoadedAsset;
  readonly treeAcaciaStump: LoadedAsset;
  readonly treePalmStump: LoadedAsset;
  readonly ui: PixelUi;
  readonly uiSkin: UiSkin;
}

export async function loadOverworldArt(): Promise<OverworldArt> {
  const [
    avatar, avatarAxe, grass, meadowGrass, highlandGrass, valleyGrass, grassTuft,
    water, freshwater, waterfall, beach, desert, desertShore, desertGrass, path,
    cliff, cliff2, cliff3, cliff4, desertCliff, iconAxe, iconHoe, iconPickaxe, iconWateringCan,
    itemWood, rainStreak, rainSplash, waterRipples, treeFruiting, treeMature,
    treeOak, treeBirch, treeSpruce, treeAcacia, treePalm,
    treeStump, treeAcaciaStump, treePalmStump, ui, uiSkin,
  ] = await Promise.all([
    loadGeneratedAsset('avatar_cf_farmer', 'summer'),
    loadGeneratedAsset('avatar_cf_farmer_axe', 'summer'),
    loadGeneratedAsset('tile_cf_grass', 'summer'),
    loadGeneratedAsset('tile_cf_grass_meadow', 'summer'),
    loadGeneratedAsset('tile_cf_grass_highland', 'summer'),
    loadGeneratedAsset('tile_cf_hillside', 'summer'),
    loadGeneratedAsset('tile_cf_grass_tuft', 'summer'),
    loadGeneratedAsset('tile_cf_water', 'summer'),
    loadGeneratedAsset('tile_cf_freshwater', 'summer'),
    loadGeneratedAsset('tile_cf_waterfall', 'summer'),
    loadGeneratedAsset('tile_cf_beach', 'summer'),
    loadGeneratedAsset('tile_cf_desert', 'summer'),
    loadGeneratedAsset('tile_cf_desert_shore', 'summer'),
    loadGeneratedAsset('tile_cf_desert_grass', 'summer'),
    loadGeneratedAsset('tile_cf_path', 'summer'),
    loadGeneratedAsset('tile_cf_stone_cliff_variants', 'summer'),
    loadGeneratedAsset('tile_cf_stone_cliff_2', 'summer'),
    loadGeneratedAsset('tile_cf_stone_cliff_3', 'summer'),
    loadGeneratedAsset('tile_cf_stone_cliff_4', 'summer'),
    loadGeneratedAsset('tile_cf_desert_cliff', 'summer'),
    loadGeneratedAsset('icon_cf_axe', 'summer'),
    loadGeneratedAsset('icon_cf_hoe', 'summer'),
    loadGeneratedAsset('icon_cf_pickaxe', 'summer'),
    loadGeneratedAsset('icon_cf_watering_can', 'summer'),
    loadGeneratedAsset('item_cf_wood', 'summer'),
    loadGeneratedAsset('effect_cf_rain_streak', 'summer'),
    loadGeneratedAsset('effect_cf_rain_splash', 'summer'),
    loadGeneratedAsset('tile_cf_water_ripples', 'summer'),
    loadGeneratedAsset('tree_cf_fruit_fruiting', 'summer'),
    loadGeneratedAsset('tree_cf_fruit_mature', 'summer'),
    loadGeneratedAsset('tree_cf_oak_mature', 'summer'),
    loadGeneratedAsset('tree_cf_birch_mature', 'summer'),
    loadGeneratedAsset('tree_cf_spruce_mature', 'summer'),
    loadGeneratedAsset('tree_cf_acacia_mature', 'summer'),
    loadGeneratedAsset('tree_cf_palm_mature', 'summer'),
    loadGeneratedAsset('tree_cf_oak_stump', 'summer'),
    loadGeneratedAsset('tree_cf_acacia_stump', 'summer'),
    loadGeneratedAsset('tree_cf_palm_stump', 'summer'),
    loadPixelUi(),
    loadUiSkin(),
  ]);
  return {
    avatar, avatarAxe, actionAssets: { swing_axe: avatarAxe },
    grass, meadowGrass, highlandGrass, valleyGrass, grassTuft,
    water, freshwater, waterfall, beach, desert, desertShore, desertGrass, path,
    cliff, cliff2, cliff3, cliff4, desertCliff,
    iconAxe, iconHoe, iconPickaxe, iconWateringCan, itemWood, rainStreak, rainSplash, waterRipples,
    treeFruiting, treeMature, treeOak, treeBirch, treeSpruce, treeAcacia, treePalm,
    treeStump, treeAcaciaStump, treePalmStump, ui, uiSkin,
  };
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

export function drawUiAsset(
  context: CanvasRenderingContext2D,
  asset: LoadedAsset,
  x: number,
  y: number,
  scale = 1,
): void {
  const source = frame(asset);
  if (source === null) return;
  context.drawImage(
    asset.image,
    source.x,
    source.y,
    source.width,
    source.height,
    Math.round(x),
    Math.round(y),
    source.width * scale,
    source.height * scale,
  );
}

export { sortWorldDepthItems as sortWorldDrawItems } from './render/renderer.js';

export function drawOverworldTree(
  context: CanvasRenderingContext2D,
  art: OverworldArt,
  x: number,
  y: number,
  fruiting: boolean,
  cameraX: number,
  cameraY: number,
  zoom: number,
  kind = 'tree',
): void {
  const tree = fruiting ? art.treeFruiting
    : kind === 'tree_oak' ? art.treeOak
      : kind === 'tree_birch' ? art.treeBirch
        : kind === 'tree_spruce' ? art.treeSpruce
          : kind === 'tree_acacia' ? art.treeAcacia
            : kind === 'tree_palm' ? art.treePalm
              : art.treeMature;
  drawAnchored(context, tree, 'base', 0, x, y + 4, cameraX, cameraY, zoom);
}

export function drawOverworldStump(
  context: CanvasRenderingContext2D,
  art: OverworldArt,
  x: number,
  y: number,
  cameraX: number,
  cameraY: number,
  zoom: number,
  kind = 'tree',
): void {
  const stump = kind === 'tree_acacia' ? art.treeAcaciaStump
    : kind === 'tree_palm' ? art.treePalmStump
      : art.treeStump;
  drawAnchored(context, stump, 'base', 0, x, y, cameraX, cameraY, zoom);
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
  locomotionFrame: number,
  cameraX: number,
  cameraY: number,
  zoom: number,
  actionFrame: number | null,
  actionVisual: ActionVisual | null = null,
): void {
  const animation = avatarAnimationForDirection(facing);
  const frameIndex = moving ? locomotionFrame : 0;
  drawAnchored(
    context,
    actionFrame === null || actionVisual === null ? art.avatar : actionVisual.asset,
    actionFrame === null || actionVisual === null ? animation : actionVisual.animation,
    actionFrame ?? frameIndex,
    x,
    y,
    cameraX,
    cameraY,
    zoom,
    facing === 'left' || facing === 'upLeft' || facing === 'downLeft',
  );
}

export function drawOverworldNameplate(
  context: CanvasRenderingContext2D,
  art: OverworldArt,
  worldX: number,
  worldY: number,
  cameraX: number,
  cameraY: number,
  zoom: number,
  name: string,
): void {
  const label = name.slice(0, 20);
  const width = measurePixelText(label) + 4;
  const height = 9;
  const screenX = Math.round((worldX - cameraX) * zoom);
  const screenY = Math.round((worldY - cameraY - 42) * zoom);
  context.save();
  context.translate(screenX, screenY);
  context.scale(zoom, zoom);
  context.fillStyle = '#14221acc';
  context.fillRect(Math.round(-width / 2), 0, width, height);
  drawPixelText(context, art.ui, label, 0, 1, { align: 'center', color: '#f2e3c2' });
  context.restore();
}

export function axeAnimationForDirection(facing: Direction): 'axe_up' | 'axe_right' | 'axe_down' {
  if (facing === 'up') return 'axe_up';
  if (facing === 'down') return 'axe_down';
  return 'axe_right';
}

function actionFacing(facing: Direction): 'up' | 'right' | 'down' {
  if (facing === 'up') return 'up';
  if (facing === 'down') return 'down';
  return 'right';
}

/** Resolve the semantic `<kind>_<facing>` contract, retaining the purchased
 * farmer sheet's legacy axe group names as an explicit compatibility path. */
export interface ActionVisual {
  readonly asset: LoadedAsset;
  readonly animation: string;
}

export function actionVisualForDirection(
  art: OverworldArt,
  actionKind: string,
  facing: Direction,
): ActionVisual | null {
  const asset = art.actionAssets[actionKind];
  if (asset === undefined) return null;
  const semantic = `${actionKind}_${actionFacing(facing)}`;
  if (asset.metadata.animations[semantic] !== undefined) return { asset, animation: semantic };
  if (actionKind === 'swing_axe') {
    const legacy = axeAnimationForDirection(facing);
    if (asset.metadata.animations[legacy] !== undefined) return { asset, animation: legacy };
  }
  return null;
}

export function avatarAnimationForDirection(facing: Direction): 'walk_up' | 'walk_right' | 'walk_down' {
  if (facing === 'up') return 'walk_up';
  if (facing === 'down') return 'walk_down';
  return 'walk_right';
}
