import { TILE_SIZE_PIXELS, type CollisionMap, type Season } from '@orchard/sim';
import type { Camera } from './camera.js';
import type { AtlasFrame } from './sprite.js';
import type { MapSource } from './map-source.js';

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

export interface EstateTileAtlases {
  readonly grass?: { readonly image: CanvasImageSource; readonly frame: AtlasFrame } | undefined;
  readonly path?: { readonly image: CanvasImageSource; readonly frame: AtlasFrame } | undefined;
  readonly soil?: { readonly image: CanvasImageSource; readonly frame: AtlasFrame } | undefined;
  readonly season?: Season | undefined;
}

const authoredDefinitions: Readonly<Record<string, number>> = {
  empty: 0,
  grass_base: 1,
  grass_detail: 2,
  path: 3,
  soil: 4,
  water: 5,
  hillside: 6,
  cellar_floor: 7,
  cellar_wall: 8,
  cellar_rack: 9,
};

export function createAuthoredTileMap(source: MapSource, atlases: EstateTileAtlases = {}): TileMapData {
  const groundColor: Readonly<Record<Season, string>> = {
    spring: '#58a346',
    summer: '#58a346',
    autumn: '#c68a53',
    winter: '#57a374',
  };
  const grass = groundColor[atlases.season ?? 'spring'];
  const definitions: Readonly<Record<number, TileDefinition>> = {
    1: { fill: grass },
    2: { fill: grass, ...(atlases.grass ? { atlas: atlases.grass } : {}) },
    3: { fill: '#98724c', ...(atlases.path ? { atlas: atlases.path } : {}) },
    4: { fill: '#79513b', ...(atlases.soil ? { atlas: atlases.soil } : {}) },
    5: { fill: '#3f7e8b', inset: { color: '#65a6ae', x: 2, y: 4, width: 9, height: 1 } },
    6: { fill: '#315938' },
    7: { fill: '#8a613f', inset: { color: '#a87952', x: 0, y: 0, width: 16, height: 1 } },
    8: { fill: '#3d3130', inset: { color: '#5e4a40', x: 0, y: 12, width: 16, height: 4 } },
    9: { fill: '#5a382d', inset: { color: '#c67f49', x: 2, y: 2, width: 12, height: 3 } },
  };
  const layers = (['ground', 'detail', 'canopy'] as const).map((name): TileLayerData => ({
    name,
    tiles: source.layers[name].flatMap((row) => [...row].map((character) => authoredDefinitions[source.legend[character] ?? 'empty'] ?? 0)),
  }));
  return { width: source.size[0], height: source.size[1], tileSize: TILE_SIZE_PIXELS, definitions, layers };
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

export function createEstateTileMap(
  collision: CollisionMap,
  atlases: EstateTileAtlases = {},
): TileMapData {
  const ground = Array.from({ length: collision.width * collision.height }, (_, index) => {
    const x = index % collision.width;
    const y = Math.floor(index / collision.width);
    if (x >= 44 && x <= 54 && y >= 18 && y <= 28) return 5;
    if ((x >= 27 && x <= 29 && y >= 10 && y <= 46) || (y >= 44 && y <= 46 && x >= 27 && x <= 36)) return 3;
    if (x >= 7 && x <= 23 && y >= 15 && y <= 39 && x % 4 !== 3 && y % 5 !== 4) return 4;
    if (y >= 48 && (x < 20 || x > 43)) return 6;
    return (x * 7 + y * 11) % 13 === 0 ? 2 : 1;
  });
  const detail = [...blankLayer(collision.width, collision.height, 'detail').tiles];
  const canopy = [...blankLayer(collision.width, collision.height, 'canopy').tiles];

  // Collision is simulation data, never a visible fallback layer. Authored maps
  // provide fences, hedges, water, and cliffs independently of walkability.
  return {
    width: collision.width,
    height: collision.height,
    tileSize: TILE_SIZE_PIXELS,
    definitions: {
      1: { fill: '#58a346' },
      2: { fill: '#58a346', ...(atlases.grass ? { atlas: atlases.grass } : {}) },
      3: { fill: '#98724c', ...(atlases.path ? { atlas: atlases.path } : {}) },
      4: { fill: '#79513b', ...(atlases.soil ? { atlas: atlases.soil } : {}) },
      5: { fill: '#3f7e8b', inset: { color: '#65a6ae', x: 2, y: 4, width: 9, height: 1 } },
      6: { fill: '#315938' },
    },
    layers: [
      { name: 'ground', tiles: ground },
      { name: 'detail', tiles: detail },
      { name: 'canopy', tiles: canopy },
    ],
  };
}

export function createCellarTileMap(collision: CollisionMap): TileMapData {
  const ground = Array.from({ length: collision.width * collision.height }, () => 7);
  const detail = Array.from({ length: collision.width * collision.height }, (_, index) => {
    if (!(collision.blocked[index] ?? false)) return 0;
    const x = index % collision.width;
    const y = Math.floor(index / collision.width);
    const border = x === 0 || y === 0 || x === collision.width - 1 || y === collision.height - 1;
    return border ? 8 : 9;
  });
  return {
    width: collision.width,
    height: collision.height,
    tileSize: TILE_SIZE_PIXELS,
    definitions: {
      7: { fill: '#8a613f', inset: { color: '#a87952', x: 0, y: 0, width: 16, height: 1 } },
      8: { fill: '#3d3130', inset: { color: '#5e4a40', x: 0, y: 12, width: 16, height: 4 } },
      9: { fill: '#5a382d', inset: { color: '#c67f49', x: 2, y: 2, width: 12, height: 3 } },
    },
    layers: [
      { name: 'ground', tiles: ground },
      { name: 'detail', tiles: detail },
      { name: 'canopy', tiles: blankLayer(collision.width, collision.height, 'canopy').tiles },
    ],
  };
}

export function createPlaceholderTileMap(
  collision: CollisionMap,
  grassAtlas?: { readonly image: CanvasImageSource; readonly frame: AtlasFrame },
): TileMapData {
  return createEstateTileMap(collision, grassAtlas ? { grass: grassAtlas } : {});
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
