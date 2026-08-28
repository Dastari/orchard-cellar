import type { UiRect } from './geometry.js';

export interface NineSlicePatch {
  readonly source: UiRect;
  readonly destination: UiRect;
}

export interface NineSliceRegion extends NineSlicePatch {
  readonly repeatX: boolean;
  readonly repeatY: boolean;
}

export interface NineSliceRepeatAxes {
  readonly repeatX?: boolean;
  readonly repeatY?: boolean;
}

export interface AxisAlignedCanvasTransform {
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly d: number;
  readonly e: number;
  readonly f: number;
}

/**
 * Align a logical rectangle to physical canvas pixels. Canvas can otherwise
 * rasterise two adjacent patches onto opposite sides of the same fractional
 * device pixel, exposing a hairline between them at fractional browser DPRs.
 * Snapping both rectangles' shared edge with the same transform keeps it
 * identical while retaining the application's logical coordinate system.
 */
export function snapRectToDevicePixels(
  rect: UiRect,
  transform: AxisAlignedCanvasTransform,
): UiRect {
  if (
    !Number.isFinite(transform.a) || !Number.isFinite(transform.d)
    || Math.abs(transform.a) < Number.EPSILON || Math.abs(transform.d) < Number.EPSILON
    || Math.abs(transform.b) > Number.EPSILON || Math.abs(transform.c) > Number.EPSILON
  ) return rect;

  const snapX = (value: number): number => (Math.round(value * transform.a + transform.e) - transform.e) / transform.a;
  const snapY = (value: number): number => (Math.round(value * transform.d + transform.f) - transform.f) / transform.d;
  const left = snapX(rect.x);
  const top = snapY(rect.y);
  const right = snapX(rect.x + rect.width);
  const bottom = snapY(rect.y + rect.height);
  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  };
}

export function snapRectForContext(context: CanvasRenderingContext2D, rect: UiRect): UiRect {
  return snapRectToDevicePixels(rect, context.getTransform());
}

function fitInsets(total: number, before: number, after: number): readonly [number, number] {
  const sum = before + after;
  if (sum <= total || sum === 0) return [before, after];
  const fittedBefore = Math.floor(total * before / sum);
  return [fittedBefore, total - fittedBefore];
}

function safeInset(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

/**
 * The nine authored source regions and their destination faces. Corner source
 * pixels remain one-to-one. If a destination is too small for both corners,
 * the outer portion of each corner is cropped instead of scaling the artwork.
 */
export function nineSliceRegions(
  source: UiRect,
  destination: UiRect,
  slice: readonly [left: number, top: number, right: number, bottom: number],
  repeat: NineSliceRepeatAxes = {},
): NineSliceRegion[] {
  if (source.width <= 0 || source.height <= 0 || destination.width <= 0 || destination.height <= 0) return [];

  const [requestedLeft, requestedTop, requestedRight, requestedBottom] = slice.map(safeInset) as unknown as
    readonly [number, number, number, number];
  const [sourceLeft, sourceRight] = fitInsets(source.width, requestedLeft, requestedRight);
  const [sourceTop, sourceBottom] = fitInsets(source.height, requestedTop, requestedBottom);
  const [destLeft, destRight] = fitInsets(destination.width, sourceLeft, sourceRight);
  const [destTop, destBottom] = fitInsets(destination.height, sourceTop, sourceBottom);

  const sourceMiddleWidth = Math.max(0, source.width - sourceLeft - sourceRight);
  const sourceMiddleHeight = Math.max(0, source.height - sourceTop - sourceBottom);
  const destMiddleWidth = Math.max(0, destination.width - destLeft - destRight);
  const destMiddleHeight = Math.max(0, destination.height - destTop - destBottom);

  const sourceWidths = [destLeft, sourceMiddleWidth, destRight];
  const sourceHeights = [destTop, sourceMiddleHeight, destBottom];
  const sourceXs = [source.x, source.x + sourceLeft, source.x + source.width - destRight];
  const sourceYs = [source.y, source.y + sourceTop, source.y + source.height - destBottom];
  const destWidths = [destLeft, destMiddleWidth, destRight];
  const destHeights = [destTop, destMiddleHeight, destBottom];
  const destXs = [destination.x, destination.x + destLeft, destination.x + destination.width - destRight];
  const destYs = [destination.y, destination.y + destTop, destination.y + destination.height - destBottom];

  const regions: NineSliceRegion[] = [];
  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      const sourceRect = {
        x: sourceXs[column]!,
        y: sourceYs[row]!,
        width: sourceWidths[column]!,
        height: sourceHeights[row]!,
      };
      const destRect = {
        x: destXs[column]!,
        y: destYs[row]!,
        width: destWidths[column]!,
        height: destHeights[row]!,
      };
      if (sourceRect.width <= 0 || sourceRect.height <= 0 || destRect.width <= 0 || destRect.height <= 0) continue;
      regions.push({
        source: sourceRect,
        destination: destRect,
        repeatX: column === 1 && repeat.repeatX !== false,
        repeatY: row === 1 && repeat.repeatY !== false,
      });
    }
  }
  return regions;
}

function tiledRegionPatches(region: NineSliceRegion): NineSlicePatch[] {
  const patches: NineSlicePatch[] = [];
  const tileWidth = region.repeatX ? region.source.width : region.destination.width;
  const tileHeight = region.repeatY ? region.source.height : region.destination.height;
  if (tileWidth <= 0 || tileHeight <= 0) return patches;

  for (let offsetY = 0; offsetY < region.destination.height; offsetY += tileHeight) {
    const height = Math.min(tileHeight, region.destination.height - offsetY);
    for (let offsetX = 0; offsetX < region.destination.width; offsetX += tileWidth) {
      const width = Math.min(tileWidth, region.destination.width - offsetX);
      patches.push({
        source: {
          x: region.source.x,
          y: region.source.y,
          width: region.repeatX ? width : region.source.width,
          height: region.repeatY ? height : region.source.height,
        },
        destination: {
          x: region.destination.x + offsetX,
          y: region.destination.y + offsetY,
          width,
          height,
        },
      });
    }
  }
  return patches;
}

export function nineSlicePatches(
  source: UiRect,
  destination: UiRect,
  slice: readonly [left: number, top: number, right: number, bottom: number],
  repeat: NineSliceRepeatAxes = {},
): NineSlicePatch[] {
  return nineSliceRegions(source, destination, slice, repeat).flatMap(tiledRegionPatches);
}

const sourceTileCache = new WeakMap<object, Map<string, HTMLCanvasElement>>();
const patternCache = new WeakMap<CanvasRenderingContext2D, WeakMap<HTMLCanvasElement, CanvasPattern>>();

function sourceTile(image: CanvasImageSource, source: UiRect): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const imageKey = image as object;
  let imageTiles = sourceTileCache.get(imageKey);
  if (imageTiles === undefined) {
    imageTiles = new Map();
    sourceTileCache.set(imageKey, imageTiles);
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

function repeatedPattern(
  context: CanvasRenderingContext2D,
  image: CanvasImageSource,
  source: UiRect,
): CanvasPattern | null {
  const tile = sourceTile(image, source);
  if (tile === null) return null;
  let patterns = patternCache.get(context);
  if (patterns === undefined) {
    patterns = new WeakMap();
    patternCache.set(context, patterns);
  }
  const cached = patterns.get(tile);
  if (cached !== undefined) return cached;
  const pattern = context.createPattern(tile, 'repeat');
  if (pattern !== null) patterns.set(tile, pattern);
  return pattern;
}

function drawRepeatedRegion(
  context: CanvasRenderingContext2D,
  image: CanvasImageSource,
  region: NineSliceRegion,
): void {
  const destination = snapRectForContext(context, region.destination);
  if (destination.width <= 0 || destination.height <= 0) return;
  if (!(region.repeatX && region.repeatY)) {
    for (const patch of tiledRegionPatches(region)) {
      const d = snapRectForContext(context, patch.destination);
      if (d.width <= 0 || d.height <= 0) continue;
      const s = patch.source;
      context.drawImage(image, s.x, s.y, s.width, s.height, d.x, d.y, d.width, d.height);
    }
    return;
  }
  const pattern = repeatedPattern(context, image, region.source);
  if (pattern === null) {
    for (const patch of tiledRegionPatches(region)) {
      const d = snapRectForContext(context, patch.destination);
      if (d.width <= 0 || d.height <= 0) continue;
      const s = patch.source;
      context.drawImage(image, s.x, s.y, s.width, s.height, d.x, d.y, d.width, d.height);
    }
    return;
  }

  context.save();
  context.translate(destination.x, destination.y);
  context.fillStyle = pattern;
  context.fillRect(0, 0, destination.width, destination.height);
  context.restore();
}

export function drawNineSlice(
  context: CanvasRenderingContext2D,
  image: CanvasImageSource,
  source: UiRect,
  destination: UiRect,
  slice: readonly [number, number, number, number],
  repeat: NineSliceRepeatAxes = {},
): void {
  context.save();
  context.imageSmoothingEnabled = false;
  for (const region of nineSliceRegions(source, destination, slice, repeat)) {
    if (region.repeatX || region.repeatY) {
      drawRepeatedRegion(context, image, region);
      continue;
    }
    const s = region.source;
    const d = snapRectForContext(context, region.destination);
    if (d.width <= 0 || d.height <= 0) continue;
    context.drawImage(image, s.x, s.y, s.width, s.height, d.x, d.y, d.width, d.height);
  }
  context.restore();
}
