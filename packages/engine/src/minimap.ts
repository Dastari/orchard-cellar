import { terrainColorAt, type TerrainArray } from './terrain.js';

export interface MinimapMarker { readonly x: number; readonly y: number; readonly kind: 'self' | 'player' | 'npc' }
export interface MinimapRasterModel {
  readonly terrain: TerrainArray;
  /** Space and content revision; entity movement does not invalidate terrain. */
  readonly revision: string;
  readonly center: { readonly x: number; readonly y: number };
  readonly pixelsPerTile: number;
  readonly markers: readonly MinimapMarker[];
}

/** Semantic world raster for a clipped kit viewport. The application supplies
 * authorized markers; this renderer owns terrain caching and marker pixels. */
export class MinimapRaster {
  private cache?: { readonly key: string; readonly terrain: TerrainArray; readonly canvas: HTMLCanvasElement };
  constructor(private readonly createCanvas: () => HTMLCanvasElement = () => document.createElement('canvas')) {}

  draw(context: CanvasRenderingContext2D, rect: { readonly x: number; readonly y: number; readonly width: number; readonly height: number }, model: MinimapRasterModel): void {
    if (rect.width <= 0 || rect.height <= 0 || !Number.isFinite(model.pixelsPerTile) || model.pixelsPerTile <= 0) return;
    const centerTileX = Math.floor(model.center.x / 16), centerTileY = Math.floor(model.center.y / 16);
    const pixelsPerTile = model.pixelsPerTile;
    const columns = Math.ceil(rect.width / pixelsPerTile) + 2, rows = Math.ceil(rect.height / pixelsPerTile) + 2;
    const firstTileX = centerTileX - Math.ceil(rect.width / (2 * pixelsPerTile));
    const firstTileY = centerTileY - Math.ceil(rect.height / (2 * pixelsPerTile));
    const rasterX = rect.width / 2 - (centerTileX - firstTileX) * pixelsPerTile;
    const rasterY = rect.height / 2 - (centerTileY - firstTileY) * pixelsPerTile;
    const key = [model.revision, centerTileX, centerTileY, pixelsPerTile, Math.ceil(rect.width), Math.ceil(rect.height)].join(':');
    if (this.cache?.key !== key || this.cache.terrain !== model.terrain) {
      const canvas = this.createCanvas(); canvas.width = Math.ceil(rect.width); canvas.height = Math.ceil(rect.height);
      const paint = canvas.getContext('2d');
      if (!paint) return;
      paint.imageSmoothingEnabled = false;
      for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
        paint.fillStyle = terrainColorAt(model.terrain, firstTileX + column, firstTileY + row);
        paint.fillRect(Math.floor(rasterX + column * pixelsPerTile), Math.floor(rasterY + row * pixelsPerTile), Math.ceil(pixelsPerTile), Math.ceil(pixelsPerTile));
      }
      this.cache = { key, terrain: model.terrain, canvas };
    }
    context.save();
    context.beginPath(); context.rect(rect.x, rect.y, rect.width, rect.height); context.clip();
    context.imageSmoothingEnabled = false;
    context.drawImage(this.cache.canvas, Math.floor(rect.x), Math.floor(rect.y));
    for (const marker of model.markers) {
      const x = rect.x + rect.width / 2 + (marker.x / 16 - centerTileX) * pixelsPerTile;
      const y = rect.y + rect.height / 2 + (marker.y / 16 - centerTileY) * pixelsPerTile;
      if (x < rect.x || y < rect.y || x >= rect.x + rect.width || y >= rect.y + rect.height) continue;
      const size = marker.kind === 'self' ? 4 : 3;
      context.fillStyle = '#2b1914';
      context.fillRect(Math.round(x - size / 2 - 1), Math.round(y - size / 2 - 1), size + 2, size + 2);
      context.fillStyle = marker.kind === 'self' ? '#fff3be' : marker.kind === 'player' ? '#64b7e8' : '#f1b34b';
      context.fillRect(Math.round(x - size / 2), Math.round(y - size / 2), size, size);
    }
    context.restore();
  }

  dispose(): void { this.cache = undefined; }
}
