import type { UiRect } from './geometry.js';

const atlasFrameImageCache = new WeakMap<object, Map<string, HTMLCanvasElement>>();

/** Copy native source pixels once before scaling, so atlas neighbours cannot
 * leak across the crop edge. The image identity owns the cache lifetime. */
export function isolatedAtlasFrameImage(image: CanvasImageSource, source: UiRect): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const imageKey = image as object;
  let imageTiles = atlasFrameImageCache.get(imageKey);
  if (imageTiles === undefined) {
    imageTiles = new Map();
    atlasFrameImageCache.set(imageKey, imageTiles);
  }
  const key = `${source.x}:${source.y}:${source.width}:${source.height}`;
  const cached = imageTiles.get(key);
  if (cached !== undefined) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(source.width));
  canvas.height = Math.max(1, Math.round(source.height));
  const tileContext = canvas.getContext('2d');
  if (tileContext === null) return null;
  tileContext.imageSmoothingEnabled = false;
  tileContext.drawImage(
    image,
    source.x,
    source.y,
    source.width,
    source.height,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  imageTiles.set(key, canvas);
  return canvas;
}
