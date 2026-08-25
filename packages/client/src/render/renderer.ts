import { MIN_WORLD_ZOOM } from '../display.js';

export const MAX_WORLD_PASS_WIDTH = 4096;
export const MAX_WORLD_PASS_HEIGHT = 2304;
export const MAX_WORLD_ZOOM = 8;

export interface WorldPassLayout {
  readonly cssWidth: number;
  readonly cssHeight: number;
  readonly dpr: number;
  readonly zoom: number;
  readonly deviceZoom: number;
  readonly integerScale: number;
  readonly width: number;
  readonly height: number;
}

export interface WorldPassCapacity {
  readonly width: number;
  readonly height: number;
}

const WORLD_PASS_WIDTH_BUCKET = 256;
const WORLD_PASS_HEIGHT_BUCKET = 144;

/**
 * Grows the backing store in coarse buckets and never shrinks it during play.
 * The active source rectangle still follows the eased zoom exactly, but zoom
 * animation no longer reallocates a multi-megabyte canvas every frame.
 */
export function worldPassCapacity(
  requiredWidth: number,
  requiredHeight: number,
  currentWidth = 0,
  currentHeight = 0,
): WorldPassCapacity {
  const bucketedWidth = Math.ceil(Math.max(1, requiredWidth) / WORLD_PASS_WIDTH_BUCKET) * WORLD_PASS_WIDTH_BUCKET;
  const bucketedHeight = Math.ceil(Math.max(1, requiredHeight) / WORLD_PASS_HEIGHT_BUCKET) * WORLD_PASS_HEIGHT_BUCKET;
  return {
    width: Math.min(MAX_WORLD_PASS_WIDTH, Math.max(currentWidth, bucketedWidth)),
    height: Math.min(MAX_WORLD_PASS_HEIGHT, Math.max(currentHeight, bucketedHeight)),
  };
}

export function worldPassLayout(
  cssWidth: number,
  cssHeight: number,
  dpr: number,
  zoom: number,
): WorldPassLayout {
  const safeWidth = Math.max(1, Math.floor(cssWidth));
  const safeHeight = Math.max(1, Math.floor(cssHeight));
  const safeDpr = Math.max(1, dpr);
  const safeZoom = Math.max(0.01, zoom);
  const deviceZoom = safeZoom * safeDpr;
  const preferredScale = Math.max(1, Math.ceil(deviceZoom));
  // Fractional zoom/DPR thresholds can increase ceil(deviceZoom) by one and
  // make the logical pass wider than its capped backing canvas. Limit the
  // integer pass first so the active source rectangle is never clipped.
  const widthScaleLimit = Math.floor(MAX_WORLD_PASS_WIDTH * deviceZoom / (safeWidth * safeDpr));
  const heightScaleLimit = Math.floor(MAX_WORLD_PASS_HEIGHT * deviceZoom / (safeHeight * safeDpr));
  const integerScale = Math.max(1, Math.min(preferredScale, widthScaleLimit, heightScaleLimit));
  return {
    cssWidth: safeWidth,
    cssHeight: safeHeight,
    dpr: safeDpr,
    zoom: safeZoom,
    deviceZoom,
    integerScale,
    width: Math.ceil(safeWidth * safeDpr * integerScale / deviceZoom),
    height: Math.ceil(safeHeight * safeDpr * integerScale / deviceZoom),
  };
}

export function minimumWorldZoom(
  cssWidth: number,
  cssHeight: number,
  dpr: number,
  worldPixels: number,
): number {
  const viewMinimum = Math.max(cssWidth / worldPixels, cssHeight / worldPixels, MIN_WORLD_ZOOM);
  let zoom = Math.ceil(viewMinimum * 1000) / 1000;
  while (zoom < MAX_WORLD_ZOOM) {
    const layout = worldPassLayout(cssWidth, cssHeight, dpr, zoom);
    if (layout.width <= MAX_WORLD_PASS_WIDTH && layout.height <= MAX_WORLD_PASS_HEIGHT) return zoom;
    zoom = Math.ceil((zoom + 0.001) * 1000) / 1000;
  }
  return MAX_WORLD_ZOOM;
}

export interface RenderFrame {
  readonly world: CanvasRenderingContext2D;
  readonly layout: WorldPassLayout;
}

/** Every non-ground world object supplies this foot/door-line depth. */
export interface WorldDepthItem {
  readonly footY: number;
  readonly tie: string;
  readonly draw: () => void;
}

export function sortWorldDepthItems<T extends Pick<WorldDepthItem, 'footY' | 'tie'>>(
  items: readonly T[],
): T[] {
  return [...items].sort((left, right) => left.footY - right.footY || left.tie.localeCompare(right.tie));
}

/** Interleaves an impact-depth layer (weather today) around every world drawable. */
export function drawWorldDepthQueue(
  items: readonly WorldDepthItem[],
  cameraY: number,
  scale: number,
  drawDepthRange: (minimumDepth: number, maximumDepth: number) => number,
): number {
  let draws = 0;
  let previousDepth = Number.NEGATIVE_INFINITY;
  for (const item of sortWorldDepthItems(items)) {
    const depth = (item.footY - cameraY) * scale;
    draws += drawDepthRange(previousDepth, depth);
    previousDepth = depth;
    item.draw();
  }
  return draws + drawDepthRange(previousDepth, Number.POSITIVE_INFINITY);
}

/** Owns display sizing and the only world-to-display composite. */
export class UnifiedRenderer {
  private readonly displayContext: CanvasRenderingContext2D;
  private readonly worldCanvas: HTMLCanvasElement;
  private readonly worldContextValue: CanvasRenderingContext2D;
  private dprValue = 1;
  private cssWidthValue = 1;
  private cssHeightValue = 1;
  private frameLayout: WorldPassLayout | null = null;

  constructor(readonly canvas: HTMLCanvasElement) {
    const displayContext = canvas.getContext('2d');
    if (displayContext === null) throw new Error('Canvas 2D unavailable');
    this.displayContext = displayContext;
    this.worldCanvas = document.createElement('canvas');
    const worldContext = this.worldCanvas.getContext('2d');
    if (worldContext === null) throw new Error('Offscreen Canvas 2D unavailable');
    this.worldContextValue = worldContext;
    this.assertNearestNeighbour();
  }

  get cssWidth(): number { return this.cssWidthValue; }
  get cssHeight(): number { return this.cssHeightValue; }
  get dpr(): number { return this.dprValue; }
  get worldWidth(): number { return this.worldCanvas.width; }
  get worldHeight(): number { return this.worldCanvas.height; }

  resize(cssWidth = innerWidth, cssHeight = innerHeight, dpr = devicePixelRatio): void {
    this.cssWidthValue = Math.max(1, Math.floor(cssWidth));
    this.cssHeightValue = Math.max(1, Math.floor(cssHeight));
    this.dprValue = Math.max(1, dpr);
    const backingWidth = Math.max(1, Math.round(this.cssWidthValue * this.dprValue));
    const backingHeight = Math.max(1, Math.round(this.cssHeightValue * this.dprValue));
    if (this.canvas.width !== backingWidth) this.canvas.width = backingWidth;
    if (this.canvas.height !== backingHeight) this.canvas.height = backingHeight;
    this.canvas.style.width = `${this.cssWidthValue}px`;
    this.canvas.style.height = `${this.cssHeightValue}px`;
    this.assertNearestNeighbour();
  }

  minimumZoom(worldPixels: number): number {
    return minimumWorldZoom(this.cssWidthValue, this.cssHeightValue, this.dprValue, worldPixels);
  }

  beginWorld(zoom: number): RenderFrame {
    const layout = worldPassLayout(this.cssWidthValue, this.cssHeightValue, this.dprValue, zoom);
    const capacity = worldPassCapacity(
      layout.width,
      layout.height,
      this.worldCanvas.width,
      this.worldCanvas.height,
    );
    if (this.worldCanvas.width !== capacity.width) this.worldCanvas.width = capacity.width;
    if (this.worldCanvas.height !== capacity.height) this.worldCanvas.height = capacity.height;
    this.worldContextValue.setTransform(1, 0, 0, 1, 0, 0);
    this.worldContextValue.imageSmoothingEnabled = false;
    this.worldContextValue.globalCompositeOperation = 'source-over';
    this.worldContextValue.globalAlpha = 1;
    this.worldContextValue.clearRect(0, 0, layout.width, layout.height);
    this.frameLayout = layout;
    return { world: this.worldContextValue, layout };
  }

  compositeWorld(): void {
    if (this.frameLayout === null) throw new Error('beginWorld must precede compositeWorld');
    this.displayContext.setTransform(1, 0, 0, 1, 0, 0);
    this.displayContext.globalCompositeOperation = 'source-over';
    this.displayContext.globalAlpha = 1;
    this.displayContext.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.displayContext.imageSmoothingEnabled = true;
    this.displayContext.drawImage(
      this.worldCanvas,
      0,
      0,
      this.frameLayout.width,
      this.frameLayout.height,
      0,
      0,
      this.canvas.width,
      this.canvas.height,
    );
    this.displayContext.imageSmoothingEnabled = false;
  }

  beginUi(uiScale: number): CanvasRenderingContext2D {
    this.displayContext.save();
    this.displayContext.setTransform(
      this.dprValue * uiScale,
      0,
      0,
      this.dprValue * uiScale,
      0,
      0,
    );
    this.displayContext.imageSmoothingEnabled = false;
    this.displayContext.globalCompositeOperation = 'source-over';
    this.displayContext.globalAlpha = 1;
    return this.displayContext;
  }

  endUi(): void {
    this.displayContext.restore();
    this.displayContext.imageSmoothingEnabled = false;
  }

  private assertNearestNeighbour(): void {
    this.displayContext.imageSmoothingEnabled = false;
    this.worldContextValue.imageSmoothingEnabled = false;
  }
}
