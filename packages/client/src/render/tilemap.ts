import { TILE_SIZE_PIXELS, type CollisionMap } from '@orchard/sim';
import type { Camera } from './camera.js';
import type { AtlasFrame } from './sprite.js';

export type CachedLayerName = 'ground' | 'detail' | 'canopy';

export interface TileDefinition {
  readonly fill: string;
  readonly inset?: { readonly color: string; readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  readonly atlas?: { readonly image: CanvasImageSource; readonly frame: AtlasFrame };
}

export interface TileLayerData {
  readonly name: CachedLayerName;
  readonly tiles: readonly number[];
}

export interface TileMapData {
  readonly width: number;
  readonly height: number;
  readonly tileSize: number;
  readonly definitions: Readonly<Record<number, TileDefinition>>;
  readonly layers: readonly TileLayerData[];
}

function makeLayer(width: number, height: number): HTMLCanvasElement {
  const layer = document.createElement('canvas');
  layer.width = width;
  layer.height = height;
  const context = layer.getContext('2d');
  if (context) context.imageSmoothingEnabled = false;
  return layer;
}

function blankLayer(width: number, height: number, name: CachedLayerName): TileLayerData {
  return { name, tiles: Array.from({ length: width * height }, () => 0) };
}

export function createPlaceholderTileMap(
  collision: CollisionMap,
  grassAtlas?: { readonly image: CanvasImageSource; readonly frame: AtlasFrame },
): TileMapData {
  const ground = Array.from({ length: collision.width * collision.height }, (_, index) => {
    const x = index % collision.width;
    const y = Math.floor(index / collision.width);
    if (x >= 30 && x <= 38 && y >= 18 && y <= 24) return (x + y) % 2 === 0 ? 3 : 4;
    return (x * 7 + y * 11) % 13 === 0 ? 2 : 1;
  });
  const detail = [...blankLayer(collision.width, collision.height, 'detail').tiles];
  const canopy = [...blankLayer(collision.width, collision.height, 'canopy').tiles];

  for (let index = 0; index < collision.blocked.length; index += 1) {
    if (!(collision.blocked[index] ?? false)) continue;
    const x = index % collision.width;
    const y = Math.floor(index / collision.width);
    if (x >= 30 && x <= 38 && y >= 18 && y <= 24) continue;
    if (x >= 17 && x <= 23 && y >= 7 && y <= 12) continue;
    if (x === 12 && y === 14) continue;
    detail[index] = y === 16 ? 5 : 6;
  }
  return {
    width: collision.width,
    height: collision.height,
    tileSize: TILE_SIZE_PIXELS,
    definitions: {
      1: { fill: '#58a346' },
      2: { fill: '#58a346', ...(grassAtlas ? { atlas: grassAtlas } : {}) },
      3: { fill: '#3f7e8b' },
      4: { fill: '#397482' },
      5: { fill: 'transparent', inset: { color: '#8a613f', x: 0, y: 8, width: 16, height: 8 } },
      6: { fill: 'transparent', inset: { color: '#315938', x: 0, y: 8, width: 16, height: 8 } },
      7: { fill: '#b47b4e' },
      8: { fill: '#b47b4e', inset: { color: '#6d3e36', x: 5, y: 0, width: 6, height: 16 } },
      9: { fill: '#713f3b' },
      10: { fill: '#99594c' },
    },
    layers: [
      { name: 'ground', tiles: ground },
      { name: 'detail', tiles: detail },
      { name: 'canopy', tiles: canopy },
    ],
  };
}

export class CachedTileMapRenderer {
  private readonly cache: Record<CachedLayerName, HTMLCanvasElement>;
  private readonly dirty = new Set<CachedLayerName>(['ground', 'detail', 'canopy']);

  constructor(private readonly map: TileMapData) {
    const width = map.width * map.tileSize;
    const height = map.height * map.tileSize;
    this.cache = {
      ground: makeLayer(width, height),
      detail: makeLayer(width, height),
      canopy: makeLayer(width, height),
    };
  }

  invalidate(layer?: CachedLayerName): void {
    if (layer) this.dirty.add(layer);
    else for (const name of ['ground', 'detail', 'canopy'] as const) this.dirty.add(name);
  }

  isDirty(layer: CachedLayerName): boolean { return this.dirty.has(layer); }

  drawLayer(context: CanvasRenderingContext2D, camera: Camera, layerName: CachedLayerName): void {
    if (this.dirty.has(layerName)) this.rebuildLayer(layerName);
    context.drawImage(
      this.cache[layerName],
      camera.x,
      camera.y,
      camera.viewportWidth,
      camera.viewportHeight,
      0,
      0,
      camera.viewportWidth,
      camera.viewportHeight,
    );
  }

  private rebuildLayer(layerName: CachedLayerName): void {
    const layer = this.map.layers.find((candidate) => candidate.name === layerName);
    if (!layer) throw new Error(`Missing tile layer ${layerName}`);
    const context = this.cache[layerName].getContext('2d');
    if (!context) return;
    context.clearRect(0, 0, context.canvas.width, context.canvas.height);
    for (let index = 0; index < layer.tiles.length; index += 1) {
      const tile = this.map.definitions[layer.tiles[index] ?? 0];
      if (!tile) continue;
      const x = (index % this.map.width) * this.map.tileSize;
      const y = Math.floor(index / this.map.width) * this.map.tileSize;
      if (tile.fill !== 'transparent') {
        context.fillStyle = tile.fill;
        context.fillRect(x, y, this.map.tileSize, this.map.tileSize);
      }
      if (tile.atlas) {
        const frame = tile.atlas.frame;
        context.drawImage(tile.atlas.image, frame.x, frame.y, frame.width, frame.height, x, y, this.map.tileSize, this.map.tileSize);
      }
      if (tile.inset) {
        context.fillStyle = tile.inset.color;
        context.fillRect(x + tile.inset.x, y + tile.inset.y, tile.inset.width, tile.inset.height);
      }
    }
    this.dirty.delete(layerName);
  }
}
