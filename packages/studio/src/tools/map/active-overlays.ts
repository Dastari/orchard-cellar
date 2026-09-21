import {
  TILE_SIZE_PIXELS,
  type MapDocumentV3,
} from '@orchard/sim';
import {
  drawTileRaster,
  terrainPlaneCollisionCellAt,
  terrainProjectedDepthForElevation,
  type TerrainArray,
} from '@orchard/engine';
import type { UiRect } from '@orchard/ui/studio';
import type { VisibleTileRange } from './editor-renderer.js';

export interface MapEditorOverlayVisibility {
  readonly height: boolean;
  readonly collision: boolean;
}

export interface MapEditorOverlayRaster {
  readonly image: CanvasImageSource;
  readonly width: number;
  readonly height: number;
}

export interface MapEditorOverlayImageTarget {
  readonly image: CanvasImageSource;
  writeRows(startY: number, width: number, height: number, pixels: Uint8ClampedArray): void;
  dispose(): void;
}

export type MapEditorOverlayImageFactory = (
  width: number,
  height: number,
  ) => MapEditorOverlayImageTarget;

export interface MapEditorOverlayScheduler {
  schedule(callback: () => void): unknown;
  cancel(handle: unknown): void;
}

export const MAP_EDITOR_OVERLAY_BUILD_CHUNK_TILES = 8_192;

const TIMEOUT_OVERLAY_SCHEDULER: MapEditorOverlayScheduler = {
  schedule: (callback) => setTimeout(callback, 0),
  cancel: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

interface CachedRaster extends MapEditorOverlayRaster {
  readonly activeElevation: number;
  readonly target: MapEditorOverlayImageTarget;
}

interface PendingRaster {
  readonly terrain: TerrainArray;
  readonly activeElevation: number;
  readonly target: MapEditorOverlayImageTarget;
  nextY: number;
  handle: unknown;
}

function boundedRange(terrain: TerrainArray, range: VisibleTileRange): VisibleTileRange {
  return {
    minimumX: Math.max(0, Math.min(terrain.width, range.minimumX)),
    minimumY: Math.max(0, Math.min(terrain.height, range.minimumY)),
    maximumX: Math.max(0, Math.min(terrain.width, range.maximumX)),
    maximumY: Math.max(0, Math.min(terrain.height, range.maximumY)),
  };
}

export function mapEditorOverlayVisibleTileCount(
  terrain: TerrainArray,
  range: VisibleTileRange,
): number {
  const bounded = boundedRange(terrain, range);
  return Math.max(0, bounded.maximumX - bounded.minimumX)
    * Math.max(0, bounded.maximumY - bounded.minimumY);
}

function heightColor(delta: number): readonly [number, number, number, number] {
  if (delta === 0) return [255, 255, 255, 45];
  if (delta > 0) return [255, 255, 255, Math.min(138, 62 + delta * 12)];
  return [42, 45, 48, Math.min(148, 68 + Math.abs(delta) * 12)];
}

function collisionColor(kind: ReturnType<typeof terrainPlaneCollisionCellAt>):
readonly [number, number, number, number] {
  if (kind === 'transition') return [255, 255, 255, 190];
  if (kind === 'blocked') return [50, 52, 55, 176];
  return [255, 255, 255, 18];
}

export function mapEditorHeightOverlayPixels(
  terrain: TerrainArray,
  activeElevation: number,
): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(terrain.width * terrain.height * 4);
  for (let index = 0; index < terrain.width * terrain.height; index += 1) {
    const color = heightColor((terrain.elevations[index] ?? 0) - activeElevation);
    pixels.set(color, index * 4);
  }
  return pixels;
}

export function mapEditorCollisionOverlayPixels(
  terrain: TerrainArray,
  activeElevation: number,
): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(terrain.width * terrain.height * 4);
  for (let tileY = 0; tileY < terrain.height; tileY += 1) {
    for (let tileX = 0; tileX < terrain.width; tileX += 1) {
      const index = tileY * terrain.width + tileX;
      pixels.set(collisionColor(
        terrainPlaneCollisionCellAt(terrain, tileX, tileY, activeElevation),
      ), index * 4);
    }
  }
  return pixels;
}

/** Retains one semantic pixel per map tile. Fit-map redraws copy only the
 * visible source rectangle instead of revisiting all 692k production cells. */
export class MapEditorOverlayCache {
  #terrain: TerrainArray | null = null;
  #height: CachedRaster | null = null;
  #collision: CachedRaster | null = null;
  #heightPending: PendingRaster | null = null;
  #collisionPending: PendingRaster | null = null;

  constructor(
    private readonly image: MapEditorOverlayImageFactory,
    private readonly invalidate: () => void = () => undefined,
    private readonly scheduler: MapEditorOverlayScheduler = TIMEOUT_OVERLAY_SCHEDULER,
  ) {}

  height(terrain: TerrainArray, activeElevation: number): MapEditorOverlayRaster | null {
    this.adopt(terrain);
    if (this.#height?.activeElevation === activeElevation) return this.#height;
    this.release(this.#height);
    this.#height = null;
    if (this.#heightPending?.activeElevation !== activeElevation) {
      this.cancelPending(this.#heightPending);
      this.#heightPending = this.start(terrain, activeElevation, 'height');
    }
    return null;
  }

  collision(terrain: TerrainArray, activeElevation: number): MapEditorOverlayRaster | null {
    this.adopt(terrain);
    if (this.#collision?.activeElevation === activeElevation) return this.#collision;
    this.release(this.#collision);
    this.#collision = null;
    if (this.#collisionPending?.activeElevation !== activeElevation) {
      this.cancelPending(this.#collisionPending);
      this.#collisionPending = this.start(terrain, activeElevation, 'collision');
    }
    return null;
  }

  cancelInactive(visibility: MapEditorOverlayVisibility): void {
    if (!visibility.height) {
      this.cancelPending(this.#heightPending);
      this.#heightPending = null;
    }
    if (!visibility.collision) {
      this.cancelPending(this.#collisionPending);
      this.#collisionPending = null;
    }
  }

  dispose(): void {
    this.cancelPending(this.#heightPending);
    this.cancelPending(this.#collisionPending);
    this.release(this.#height);
    this.release(this.#collision);
    this.#terrain = null;
    this.#height = null;
    this.#collision = null;
    this.#heightPending = null;
    this.#collisionPending = null;
  }

  private adopt(terrain: TerrainArray): void {
    if (terrain === this.#terrain) return;
    this.dispose();
    this.#terrain = terrain;
  }

  private release(raster: CachedRaster | null): void {
    if (raster === null) return;
    raster.target.dispose();
  }

  private cancelPending(pending: PendingRaster | null): void {
    if (pending === null) return;
    this.scheduler.cancel(pending.handle);
    pending.target.dispose();
  }

  private start(
    terrain: TerrainArray,
    activeElevation: number,
    kind: 'height' | 'collision',
  ): PendingRaster {
    const pending: PendingRaster = {
      terrain,
      activeElevation,
      target: this.image(terrain.width, terrain.height),
      nextY: 0,
      handle: undefined,
    };
    const process = (): void => {
      const current = kind === 'height' ? this.#heightPending : this.#collisionPending;
      if (current !== pending || this.#terrain !== terrain) return;
      const rows = Math.max(1, Math.floor(MAP_EDITOR_OVERLAY_BUILD_CHUNK_TILES / terrain.width));
      const endY = Math.min(terrain.height, pending.nextY + rows);
      const pixels = new Uint8ClampedArray((endY - pending.nextY) * terrain.width * 4);
      for (let tileY = pending.nextY; tileY < endY; tileY += 1) {
        for (let tileX = 0; tileX < terrain.width; tileX += 1) {
          const sourceIndex = tileY * terrain.width + tileX;
          const targetIndex = ((tileY - pending.nextY) * terrain.width + tileX) * 4;
          const color = kind === 'height'
            ? heightColor((terrain.elevations[sourceIndex] ?? 0) - activeElevation)
            : collisionColor(terrainPlaneCollisionCellAt(
              terrain, tileX, tileY, activeElevation,
            ));
          pixels.set(color, targetIndex);
        }
      }
      pending.target.writeRows(pending.nextY, terrain.width, endY - pending.nextY, pixels);
      pending.nextY = endY;
      if (endY < terrain.height) {
        pending.handle = this.scheduler.schedule(process);
        return;
      }
      const raster: CachedRaster = {
        image: pending.target.image,
        width: terrain.width,
        height: terrain.height,
        activeElevation,
        target: pending.target,
      };
      if (kind === 'height') { this.#heightPending = null; this.#height = raster; }
      else { this.#collisionPending = null; this.#collision = raster; }
      this.invalidate();
    };
    pending.handle = this.scheduler.schedule(process);
    return pending;
  }
}

function drawRaster(
  context: CanvasRenderingContext2D,
  raster: MapEditorOverlayRaster,
  range: VisibleTileRange,
  viewport: UiRect,
  camera: { readonly x: number; readonly y: number; readonly zoom: number },
): void {
  drawTileRaster(context, raster.image, range, viewport, camera);
}

/** Draws projected cells only while they are individually readable. At wider
 * views it switches to retained semantic masks, so every frame remains bounded
 * to one or two visible-source blits regardless of map dimensions. */
export function drawActiveMapEditorOverlays(
  context: CanvasRenderingContext2D,
  _document: Pick<MapDocumentV3, 'width' | 'height'>,
  terrain: TerrainArray,
  rangeSource: VisibleTileRange,
  viewport: UiRect,
  camera: { readonly x: number; readonly y: number; readonly zoom: number },
  activeElevation: number,
  visibility: MapEditorOverlayVisibility,
  cache: MapEditorOverlayCache,
  terrainVisible = true,
): number {
  cache.cancelInactive(terrainVisible ? visibility : { height: false, collision: false });
  if (!terrainVisible || (!visibility.height && !visibility.collision)) return 0;
  const range = boundedRange(terrain, rangeSource);
  const visibleTiles = mapEditorOverlayVisibleTileCount(terrain, range);
  if (visibleTiles === 0) return 0;
  const size = TILE_SIZE_PIXELS * camera.zoom;
  context.save();
  context.beginPath();
  context.rect(viewport.x, viewport.y, viewport.width, viewport.height);
  context.clip();
  context.imageSmoothingEnabled = false;
  if (size < 5) {
    const height = visibility.height ? cache.height(terrain, activeElevation) : null;
    const collision = visibility.collision ? cache.collision(terrain, activeElevation) : null;
    if (height !== null) drawRaster(context, height, range, viewport, camera);
    if (collision !== null) drawRaster(context, collision, range, viewport, camera);
    context.restore();
    return visibleTiles;
  }

  let previousStyle = '';
  for (let tileY = range.minimumY; tileY < range.maximumY; tileY += 1) {
    for (let tileX = range.minimumX; tileX < range.maximumX; tileX += 1) {
      const index = tileY * terrain.width + tileX;
      const elevation = terrain.elevations[index] ?? 0;
      if (visibility.height) {
        const color = heightColor(elevation - activeElevation);
        const style = `rgba(${color[0]},${color[1]},${color[2]},${color[3] / 255})`;
        if (style !== previousStyle) { context.fillStyle = style; previousStyle = style; }
        const projection = terrainProjectedDepthForElevation(terrain, elevation);
        context.fillRect(
          Math.round(viewport.x + (tileX * TILE_SIZE_PIXELS - camera.x) * camera.zoom),
          Math.round(viewport.y + (tileY * TILE_SIZE_PIXELS - projection - camera.y) * camera.zoom),
          Math.ceil(size),
          Math.ceil(size),
        );
      }
      if (visibility.collision) {
        const kind = terrainPlaneCollisionCellAt(terrain, tileX, tileY, activeElevation);
        if (kind === 'open') continue;
        const color = collisionColor(kind);
        const style = `rgba(${color[0]},${color[1]},${color[2]},${color[3] / 255})`;
        if (style !== previousStyle) { context.fillStyle = style; previousStyle = style; }
        const projection = terrainProjectedDepthForElevation(terrain, activeElevation);
        context.fillRect(
          Math.round(viewport.x + (tileX * TILE_SIZE_PIXELS - camera.x) * camera.zoom),
          Math.round(viewport.y + (tileY * TILE_SIZE_PIXELS - projection - camera.y) * camera.zoom),
          Math.ceil(size),
          Math.ceil(size),
        );
      }
    }
  }
  context.restore();
  return visibleTiles;
}
