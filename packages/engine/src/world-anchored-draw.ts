import { selectAtlasFrame, type LoadedAsset, type AtlasFrame, type AssetFrameSource } from '@orchard/ui';
import { saveSpriteTransform, restoreSpriteTransform } from './painter-context.js';
import { worldAssetFrameSource } from './world-asset-presentation.js';
import { groundSpriteSource } from './ground-light-source.js';
import { applyStonePalette } from './stone-palette.js';

export function frame(
  asset: LoadedAsset,
  animation = "base",
  index = 0,
): AtlasFrame | null {
  return selectAtlasFrame(asset.metadata, animation, index);
}

export type AvatarPalette = "normal" | "stone";

const stoneFrameCache = new WeakMap<object, Map<string, HTMLCanvasElement>>();

/**
 * Builds a small native-resolution stone sprite once, rather than relying on
 * CanvasRenderingContext2D.filter support in the per-frame render loop.
 */
function stoneFrame(source: AssetFrameSource): HTMLCanvasElement {
  const imageKey = source.image as object;
  let imageFrames = stoneFrameCache.get(imageKey);
  if (imageFrames === undefined) {
    imageFrames = new Map();
    stoneFrameCache.set(imageKey, imageFrames);
  }
  const key = `${source.x}:${source.y}:${source.width}:${source.height}`;
  const cached = imageFrames.get(key);
  if (cached !== undefined) return cached;

  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  const stoneContext = canvas.getContext("2d", { willReadFrequently: true });
  if (stoneContext !== null) {
    stoneContext.imageSmoothingEnabled = false;
    stoneContext.drawImage(
      source.image,
      source.x,
      source.y,
      source.width,
      source.height,
      0,
      0,
      source.width,
      source.height,
    );
    try {
      const pixels = stoneContext.getImageData(0, 0, source.width, source.height);
      applyStonePalette(pixels.data, source.width, source.height);
      stoneContext.putImageData(pixels, 0, 0);
    } catch {
      // Same-origin generated atlases are readable. Keep a visible stone
      // fallback if a browser nevertheless protects the canvas pixel buffer.
      stoneContext.globalCompositeOperation = "source-atop";
      stoneContext.fillStyle = "rgba(116, 125, 130, 0.82)";
      stoneContext.fillRect(0, 0, source.width, source.height);
      stoneContext.globalCompositeOperation = "source-over";
    }
  }
  imageFrames.set(key, canvas);
  return canvas;
}

export function stoneFrameSource(source: AssetFrameSource): AssetFrameSource {
  return { image: stoneFrame(source), x: 0, y: 0, width: source.width, height: source.height };
}

export function drawAnchored(
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
  dimmed = false,
  palette: AvatarPalette = "normal",
  maximumSourceRows?: number,
): void {
  const selected = frame(asset, animation, frameIndex);
  if (selected === null) return;
  const original = worldAssetFrameSource(context, asset, selected, palette === 'stone' ? stoneFrameSource : undefined);
  if (original === null) return;
  const source = groundSpriteSource(context, original, worldX - asset.anchor[0], worldY - asset.anchor[1]);
  const sourceHeight = Math.max(0, Math.min(source.height, maximumSourceRows ?? source.height));
  if (sourceHeight === 0) return;
  const sourceImage = source.image;
  const sourceX = source.x;
  const sourceY = source.y;
  const anchorX = flipX ? source.width - 1 - asset.anchor[0] : asset.anchor[0];
  const x = Math.round((worldX - cameraX - anchorX) * zoom);
  const y = Math.round((worldY - cameraY - asset.anchor[1]) * zoom);
  const previousAlpha = dimmed ? context.globalAlpha : 1;
  const previousFilter = dimmed ? context.filter : '';
  const savedTransform = saveSpriteTransform(context, flipX);
  if (dimmed) {
    context.filter = "brightness(42%) saturate(55%)";
    context.globalAlpha *= 0.88;
  }
  if (flipX) {
    context.translate(x + source.width * zoom, 0);
    context.scale(-1, 1);
    context.drawImage(
      sourceImage,
      sourceX,
      sourceY,
      source.width,
      sourceHeight,
      0,
      y,
      source.width * zoom,
      sourceHeight * zoom,
    );
  } else {
    context.drawImage(
      sourceImage,
      sourceX,
      sourceY,
      source.width,
      sourceHeight,
      x,
      y,
      source.width * zoom,
      sourceHeight * zoom,
    );
  }
  if (dimmed) { context.globalAlpha = previousAlpha; context.filter = previousFilter; }
  restoreSpriteTransform(context, savedTransform);
}

export function drawRogueEnemyVisual(
  context: CanvasRenderingContext2D,
  visual: { readonly asset: LoadedAsset; readonly animation: string; readonly frameIndex: number; readonly flip: boolean },
  x: number, y: number, cameraX: number, cameraY: number, zoom: number, hitFlash: boolean,
): void {
  const previousFilter = hitFlash ? context.filter : '';
  const savedTransform = saveSpriteTransform(context, false);
  if (hitFlash) context.filter = 'brightness(210%) saturate(40%)';
  drawAnchored(
    context, visual.asset, visual.animation, visual.frameIndex,
    x, y, cameraX, cameraY, zoom, visual.flip,
  );
  if (hitFlash) context.filter = previousFilter;
  restoreSpriteTransform(context, savedTransform);
}
