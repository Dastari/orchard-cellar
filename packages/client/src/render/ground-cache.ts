import { SURVIVAL_CHUNK_TILES, TILE_SIZE_PIXELS } from '@orchard/sim';
import type { OverworldArt } from '../overworld-art.js';
import type { LoadedAsset } from './assets.js';
import { selectAtlasFrame } from './sprite.js';
import { terrainBiomeAt, terrainColorAt, type TerrainArray } from './terrain.js';

export const GROUND_CHUNK_PIXELS = SURVIVAL_CHUNK_TILES * TILE_SIZE_PIXELS;

interface CacheEntry<T> {
  readonly value: T;
  lastUsed: number;
}

export class ChunkLruCache<T> {
  private readonly entries = new Map<string, CacheEntry<T>>();
  private useCounter = 0;

  constructor(readonly capacity = 64) {}

  get size(): number { return this.entries.size; }
  has(chunkX: number, chunkY: number): boolean { return this.entries.has(`${chunkX},${chunkY}`); }

  getOrCreate(chunkX: number, chunkY: number, create: () => T): T {
    const key = `${chunkX},${chunkY}`;
    const existing = this.entries.get(key);
    if (existing !== undefined) {
      existing.lastUsed = ++this.useCounter;
      return existing.value;
    }
    const value = create();
    this.entries.set(key, { value, lastUsed: ++this.useCounter });
    this.evict();
    return value;
  }

  invalidate(chunkX: number, chunkY: number): void {
    this.entries.delete(`${chunkX},${chunkY}`);
  }

  invalidateResource(tileX: number, tileY: number): void {
    this.invalidate(Math.floor(tileX / SURVIVAL_CHUNK_TILES), Math.floor(tileY / SURVIVAL_CHUNK_TILES));
  }

  clear(): void { this.entries.clear(); }

  keys(): readonly string[] { return [...this.entries.keys()]; }

  private evict(): void {
    while (this.entries.size > this.capacity) {
      let oldestKey: string | null = null;
      let oldestUse = Number.POSITIVE_INFINITY;
      for (const [key, entry] of this.entries) {
        if (entry.lastUsed >= oldestUse) continue;
        oldestUse = entry.lastUsed;
        oldestKey = key;
      }
      if (oldestKey === null) return;
      this.entries.delete(oldestKey);
    }
  }
}

function tileHash(x: number, y: number): number {
  return (Math.imul(x, 73_856_093) ^ Math.imul(y, 19_349_663)) >>> 0;
}

function drawGroundAsset(
  context: CanvasRenderingContext2D,
  asset: LoadedAsset,
  tileX: number,
  tileY: number,
): void {
  const source = selectAtlasFrame(asset.metadata, 'base');
  if (source === null) return;
  context.drawImage(
    asset.image,
    source.x,
    source.y,
    source.width,
    source.height,
    Math.round(tileX * TILE_SIZE_PIXELS + 8 - asset.anchor[0]),
    Math.round(tileY * TILE_SIZE_PIXELS + 15 - asset.anchor[1]),
    source.width,
    source.height,
  );
}

export class GroundChunkCache {
  private readonly chunks: ChunkLruCache<HTMLCanvasElement>;
  private terrainKey = '';

  constructor(capacity = 64) {
    this.chunks = new ChunkLruCache(capacity);
  }

  get residentCount(): number { return this.chunks.size; }
  get residentKeys(): readonly string[] { return this.chunks.keys(); }

  invalidateResource(tileX: number, tileY: number): void {
    this.chunks.invalidateResource(tileX, tileY);
  }

  draw(
    context: CanvasRenderingContext2D,
    art: OverworldArt,
    terrain: TerrainArray,
    cameraX: number,
    cameraY: number,
    scale: number,
    viewportWidth: number,
    viewportHeight: number,
  ): number {
    const key = `${terrain.seed}:${terrain.version}`;
    if (key !== this.terrainKey) {
      this.terrainKey = key;
      this.chunks.clear();
    }
    const minChunkX = Math.max(0, Math.floor(cameraX / GROUND_CHUNK_PIXELS));
    const minChunkY = Math.max(0, Math.floor(cameraY / GROUND_CHUNK_PIXELS));
    const maxChunkX = Math.min(
      Math.ceil(terrain.width / SURVIVAL_CHUNK_TILES) - 1,
      Math.floor((cameraX + viewportWidth / scale) / GROUND_CHUNK_PIXELS),
    );
    const maxChunkY = Math.min(
      Math.ceil(terrain.height / SURVIVAL_CHUNK_TILES) - 1,
      Math.floor((cameraY + viewportHeight / scale) / GROUND_CHUNK_PIXELS),
    );
    let drawCalls = 0;
    for (let chunkY = minChunkY; chunkY <= maxChunkY; chunkY += 1) {
      for (let chunkX = minChunkX; chunkX <= maxChunkX; chunkX += 1) {
        const canvas = this.chunks.getOrCreate(
          chunkX,
          chunkY,
          () => this.renderChunk(art, terrain, chunkX, chunkY),
        );
        context.drawImage(
          canvas,
          Math.round((chunkX * GROUND_CHUNK_PIXELS - cameraX) * scale),
          Math.round((chunkY * GROUND_CHUNK_PIXELS - cameraY) * scale),
          GROUND_CHUNK_PIXELS * scale,
          GROUND_CHUNK_PIXELS * scale,
        );
        drawCalls += 1;
      }
    }
    return drawCalls;
  }

  private renderChunk(
    art: OverworldArt,
    terrain: TerrainArray,
    chunkX: number,
    chunkY: number,
  ): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = GROUND_CHUNK_PIXELS;
    canvas.height = GROUND_CHUNK_PIXELS;
    const context = canvas.getContext('2d');
    if (context === null) throw new Error('Ground chunk Canvas 2D unavailable');
    context.imageSmoothingEnabled = false;
    const firstTileX = chunkX * SURVIVAL_CHUNK_TILES;
    const firstTileY = chunkY * SURVIVAL_CHUNK_TILES;
    for (let localY = 0; localY < SURVIVAL_CHUNK_TILES; localY += 1) {
      for (let localX = 0; localX < SURVIVAL_CHUNK_TILES; localX += 1) {
        const tileX = firstTileX + localX;
        const tileY = firstTileY + localY;
        const biome = terrainBiomeAt(terrain, tileX, tileY);
        context.fillStyle = terrainColorAt(terrain, tileX, tileY);
        context.fillRect(
          localX * TILE_SIZE_PIXELS,
          localY * TILE_SIZE_PIXELS,
          TILE_SIZE_PIXELS,
          TILE_SIZE_PIXELS,
        );
        const hash = tileHash(tileX, tileY);
        if (biome === 'water' && hash % 13 === 0) {
          drawGroundAsset(context, art.waterRipples, localX, localY);
        } else if ((biome === 'plains' || biome === 'meadow') && hash % (biome === 'meadow' ? 9 : 23) === 0) {
          drawGroundAsset(context, art.grassTuft, localX, localY);
        } else if ((biome === 'valley' || biome === 'highland') && hash % 17 === 0) {
          drawGroundAsset(context, art.hillside, localX, localY);
        }
      }
    }
    return canvas;
  }
}
