import { comparePreparedWorldDepthItems, type WorldItemKind, type WorldItemIdentity } from './painter-depth.js';
import { disposeHudDisplayCaches, hudDisplayCacheDiagnostics } from '@orchard/ui';
export { WorldItemKind } from './painter-depth.js';
import type { WorldScalePolicy } from './world-pass-present.js';
import { CanvasWorldPassBackend } from './world-pass-canvas.js';
import type { WorldPassBackend } from './world-pass-backend.js';
export { worldPresentLayout, type WorldScalePolicy } from './world-pass-present.js';
import { MIN_WORLD_ZOOM, canvasHostViewport } from './display.js';

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
  readonly worldScale: WorldScalePolicy;
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
  worldScale: WorldScalePolicy = 'native',
): WorldPassLayout {
  const safeWidth = Math.max(1, Math.floor(cssWidth));
  const safeHeight = Math.max(1, Math.floor(cssHeight));
  const safeDpr = Math.max(1, dpr);
  const safeZoom = Math.max(0.01, zoom);
  const deviceZoom = safeZoom * safeDpr;
  const preferredScale = worldScale === 'native' ? Math.max(1, Math.ceil(deviceZoom)) : worldScale === '2x' ? 2 : 1;
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
    worldScale,
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
  // A finite zone may occupy less than the viewport. The renderer's memory
  // budget—not the map dimensions—sets the zoom-out floor; camera centering
  // exposes the remaining viewport as the out-of-world matte.
  void worldPixels;
  const viewMinimum = MIN_WORLD_ZOOM;
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
  /** Projected screen-space foot/bottom line. Sorting what is actually drawn
   * prevents an unprojected cliff row from painting over an actor already
   * standing south of its visible wall. */
  readonly footY: number;
  /** Small logical-foot painter tie-break within one elevation/phase. */
  readonly depthOffset?: number;
  /** Integer terrain plane. Higher planes composite after every drawable on
   * lower planes; projected foot-Y then resolves painter order within a plane. */
  readonly elevationLayer?: number;
  /** Within one plane: surface, cliff boundary, then world entities. */
  readonly depthPhase?: 'surface' | 'boundary' | 'entity';
  /** Legacy producers are normalized at the shared painter boundary. */
  readonly tie: string | number;
  readonly debugTie?: string;
  readonly kind?: WorldItemKind;
  readonly sortKey?: number;
  readonly sortPlane?: number;
  readonly sortDepth?: number;
  readonly sortIdentity?: WorldItemIdentity;
  readonly draw: () => void;
}

function depthPhaseOrder(phase: WorldDepthItem['depthPhase']): number {
  if (phase === 'surface') return 0;
  if (phase === 'boundary') return 1;
  return 2;
}

function terrainUnderlayOrder(phase: WorldDepthItem['depthPhase']): number {
  return phase === 'surface' ? 0 : 1;
}

export function sortWorldDepthItems<T extends Pick<
  WorldDepthItem,
  'footY' | 'tie' | 'depthOffset' | 'elevationLayer' | 'depthPhase' | 'debugTie' | 'sortKey' | 'sortPlane' | 'sortDepth' | 'sortIdentity'
>>(
  items: readonly T[],
): T[] {
  return [...items].sort(compareWorldDepthItems);
}

/** Shared painter-order comparison for render effects that must determine
 * whether one drawable will actually cover another without maintaining a
 * second, subtly different depth implementation. */
export function compareWorldDepthItems<T extends Pick<
  WorldDepthItem,
  'footY' | 'tie' | 'depthOffset' | 'elevationLayer' | 'depthPhase' | 'debugTie' | 'sortKey' | 'sortPlane' | 'sortDepth' | 'sortIdentity'
>>(
  left: T,
  right: T,
): number {
  if (left.sortKey !== undefined && right.sortKey !== undefined) {
    return comparePreparedWorldDepthItems(left, right);
  }
  return (left.elevationLayer ?? 0) - (right.elevationLayer ?? 0)
    // A plane's opaque surface and cosmetic ground-contact trim must be below
    // every painter-sorted actor on that plane, regardless of their row. A
    // raised cap still covers all lower-plane actors by elevation ordering.
    || terrainUnderlayOrder(left.depthPhase) - terrainUnderlayOrder(right.depthPhase)
    || worldDepthY(left) - worldDepthY(right)
    || depthPhaseOrder(left.depthPhase) - depthPhaseOrder(right.depthPhase)
    || String(left.debugTie ?? left.tie).localeCompare(String(right.debugTie ?? right.tie));
}

export function worldDepthY(item: Pick<WorldDepthItem, 'footY' | 'depthOffset'>): number {
  return item.footY + (item.depthOffset ?? 0);
}

export { drawWorldDepthQueue, drawSortedWorldDepthQueue } from './world-depth-draw.js';

/** Owns display sizing and the only world-to-display composite. */
export class UnifiedRenderer {
  private readonly displayContext: CanvasRenderingContext2D;
  private backend: WorldPassBackend;
  beforeWorldFrame: (() => void) | undefined;
  afterWorldFrame: (() => void) | undefined;
  worldBackendFailure: ((error: unknown) => boolean) | undefined;
  private dprValue = 1;
  private cssWidthValue = 1;
  private cssHeightValue = 1;
  private frameLayout: WorldPassLayout | null = null;
  private worldPassInProgressValue = false;
  private worldScaleValue: WorldScalePolicy = 'native';

  constructor(readonly canvas: HTMLCanvasElement) {
    const displayContext = canvas.getContext('2d', { alpha: false });
    if (displayContext === null) throw new Error('Canvas 2D unavailable');
    this.displayContext = displayContext;
    this.backend = new CanvasWorldPassBackend();
    this.assertNearestNeighbour();
  }

  get cssWidth(): number { return this.cssWidthValue; }
  get cssHeight(): number { return this.cssHeightValue; }
  get dpr(): number { return this.dprValue; }
  get worldScale(): WorldScalePolicy { return this.worldScaleValue; }
  get activeWorldPixels(): number { return this.frameLayout === null ? 0 : this.frameLayout.width * this.frameLayout.height; }
  get presentBytes(): number { return this.backend.presentBytes; }
  get hudCacheDiagnostics(): ReturnType<typeof hudDisplayCacheDiagnostics> { return hudDisplayCacheDiagnostics(this.canvas); }
  setWorldScale(policy: WorldScalePolicy): void {
    if (policy === this.worldScaleValue) return;
    this.worldScaleValue = policy;
    this.reserveWorldPass();
  }
  get worldWidth(): number { return this.backend.width; }
  get worldHeight(): number { return this.backend.height; }
  get worldPassBackend(): WorldPassBackend['kind'] { return this.backend.kind; }
  get worldPassInProgress(): boolean { return this.worldPassInProgressValue; }

  /** The client calls this only at a frame boundary, or before restarting a
   * failed frame. A candidate must reserve successfully before replacing Canvas. */
  replaceWorldBackend(candidate: WorldPassBackend): Error | undefined {
    if (candidate === this.backend) return undefined;
    try { this.reserveBackend(candidate); }
    catch (error) { candidate.dispose(); throw error; }
    const previous = this.backend;
    this.backend = candidate; this.frameLayout = null; this.worldPassInProgressValue = false;
    let cleanupFailure: Error | undefined;
    try { previous.dispose(); }
    catch (error) { cleanupFailure = error instanceof Error ? error : new Error(String(error)); }
    this.assertNearestNeighbour();
    return cleanupFailure;
  }

  resize(cssWidth?: number, cssHeight?: number, dpr = devicePixelRatio): void {
    const hostViewport = canvasHostViewport(this.canvas);
    this.cssWidthValue = Math.max(1, Math.floor(cssWidth ?? hostViewport.width));
    this.cssHeightValue = Math.max(1, Math.floor(cssHeight ?? hostViewport.height));
    this.dprValue = Math.max(1, dpr);
    const backingWidth = Math.max(1, Math.round(this.cssWidthValue * this.dprValue));
    const backingHeight = Math.max(1, Math.round(this.cssHeightValue * this.dprValue));
    if (this.canvas.width !== backingWidth) this.canvas.width = backingWidth;
    if (this.canvas.height !== backingHeight) this.canvas.height = backingHeight;
    this.canvas.style.width = `${this.cssWidthValue}px`;
    this.canvas.style.height = `${this.cssHeightValue}px`;
    this.reserveWorldPass();
    this.assertNearestNeighbour();
  }

  minimumZoom(worldPixels: number): number {
    return minimumWorldZoom(this.cssWidthValue, this.cssHeightValue, this.dprValue, worldPixels);
  }

  beginWorld(zoom: number): RenderFrame {
    this.beforeWorldFrame?.();
    this.worldPassInProgressValue = true;
    const layout = worldPassLayout(this.cssWidthValue, this.cssHeightValue, this.dprValue, zoom, this.worldScaleValue);
    if (layout.width > this.backend.width || layout.height > this.backend.height) {
      throw new Error('world_pass_capacity_not_reserved');
    }
    this.backend.begin(layout);
    this.frameLayout = layout;
    return { world: this.backend.context, layout };
  }

  compositeWorld(): void {
    if (this.frameLayout === null) throw new Error('beginWorld must precede compositeWorld');
    this.backend.composite(this.displayContext, this.canvas.width, this.canvas.height);
    this.worldPassInProgressValue = false;
    this.afterWorldFrame?.();
  }

  /** Release all world/present surfaces when the owning client is disposed. */
  dispose(): void {
    this.beforeWorldFrame = undefined; this.afterWorldFrame = undefined; this.worldBackendFailure = undefined;
    try { disposeHudDisplayCaches(this.canvas); }
    finally {
      try { this.backend.dispose(); }
      finally { this.frameLayout = null; this.worldPassInProgressValue = false; }
    }
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

  private reserveWorldPass(): void {
    try { this.reserveBackend(this.backend); }
    catch (error) {
      if (this.backend.kind !== 'webgl2' || !this.worldBackendFailure?.(error)) throw error;
      this.reserveBackend(this.backend);
    }
  }

  private reserveBackend(backend: WorldPassBackend): void {
    // Fixed policies are largest at minimum zoom. Native's ceil(deviceZoom)
    // may approach dpr + 1/minZoom at a threshold; reserve that upper bound.
    const density = this.worldScaleValue === 'native' ? this.dprValue + 1 / MIN_WORLD_ZOOM
      : (this.worldScaleValue === '2x' ? 2 : 1) / MIN_WORLD_ZOOM;
    const capacity = worldPassCapacity(Math.ceil(this.cssWidthValue * density),
      Math.ceil(this.cssHeightValue * density), backend.width, backend.height);
    backend.reserve(capacity.width, capacity.height,
      this.worldScaleValue !== 'native' ? this.canvas.width : 0,
      this.worldScaleValue !== 'native' ? this.canvas.height : 0);
  }

  private assertNearestNeighbour(): void {
    this.displayContext.imageSmoothingEnabled = false;
    this.backend.context.imageSmoothingEnabled = false;
  }
}
