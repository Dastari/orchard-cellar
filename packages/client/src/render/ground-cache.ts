import { SURVIVAL_CHUNK_TILES, TILE_SIZE_PIXELS, type SurvivalBiome } from '@orchard/sim';
import type { OverworldArt } from '../overworld-art.js';
import type { LoadedAsset } from './assets.js';
import { selectAtlasFrame } from './sprite.js';
import {
  beachFrameIndexAt,
  cliffFrameIndexAt,
  desertCliffFrameIndexAt,
  desertGrassEdgeFrameIndexAt,
  desertGrassInsetFrameIndicesAt,
  desertShoreFrameIndexAt,
  grassSandTransitionFrameIndexAt,
  savannaGrassTransitionFrameIndexAt,
  shorelineInsetFrameIndicesAt,
  dirtTerraceFrameIndexAt,
  dirtTerraceRampFrameIndexAt,
  freshwaterFrameIndexAt,
  plateauLayerPlanAt,
  terrainDecorationHash,
  terrainBiomeAt,
  terrainColorAt,
  waterDecorationAllowedAt,
  waterfallFrameIndexAt,
  type TerrainArray,
} from './terrain.js';

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

function drawGroundAsset(
  context: CanvasRenderingContext2D,
  asset: LoadedAsset,
  tileX: number,
  tileY: number,
  frameIndex = 0,
): void {
  const source = selectAtlasFrame(asset.metadata, 'base', frameIndex);
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

/** Frame zero in the grass-fringe blob sheet is intentionally solid grass.
 * Compose its authored north/south halves for an isolated sandy tile, matching
 * the reusable farmland renderer's handling of the same source sheet. */
function drawGrassSandTransition(
  context: CanvasRenderingContext2D,
  asset: LoadedAsset,
  tileX: number,
  tileY: number,
  frameIndex: number,
): void {
  if (frameIndex !== 0) {
    drawGroundAsset(context, asset, tileX, tileY, frameIndex);
    return;
  }
  const destinationX = tileX * TILE_SIZE_PIXELS;
  const destinationY = tileY * TILE_SIZE_PIXELS;
  for (const [sourceFrame, sourceY, destinationOffset] of [[5, 0, 0], [1, 8, 8]] as const) {
    const source = selectAtlasFrame(asset.metadata, 'base', sourceFrame);
    if (source === null) continue;
    context.drawImage(
      asset.image,
      source.x,
      source.y + sourceY,
      source.width,
      8,
      destinationX,
      destinationY + destinationOffset,
      source.width,
      8,
    );
  }
}

function groundAssetForBiome(art: OverworldArt, biome: SurvivalBiome): LoadedAsset {
  if (biome === 'water' || biome === 'oasis_water') return art.water;
  if (biome === 'freshwater') return art.grass;
  if (biome === 'waterfall') return art.grass;
  if (biome === 'beach') return art.beach;
  // Coastal cliff art is transparent outside the authored rock face. Sand is
  // the correct substrate there; using the default grass base made those
  // transparent pixels look like opaque green slabs around the cliff.
  if (biome === 'coastal_cliff') return art.beach;
  if (biome === 'desert_shore') return art.desertShore;
  if (biome === 'desert' || biome === 'desert_ridge') return art.desert;
  if (biome === 'oasis' || biome === 'savanna') return art.desertGrass;
  return art.grass;
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
        const destinationX = localX * TILE_SIZE_PIXELS;
        const destinationY = localY * TILE_SIZE_PIXELS;
        context.fillStyle = terrainColorAt(terrain, tileX, tileY);
        context.fillRect(destinationX, destinationY, TILE_SIZE_PIXELS, TILE_SIZE_PIXELS);
        const base = groundAssetForBiome(art, biome);
        const baseFrame = biome === 'beach' ? beachFrameIndexAt(terrain, tileX, tileY)
          : biome === 'coastal_cliff' ? 4
          : biome === 'desert_shore' ? desertShoreFrameIndexAt(terrain, tileX, tileY)
            : 0;
        drawGroundAsset(context, base, localX, localY, baseFrame);

        for (const shorelineInsetFrame of shorelineInsetFrameIndicesAt(terrain, tileX, tileY)) {
          drawGroundAsset(
            context,
            biome === 'beach' ? art.beachInset : art.desertShoreInset,
            localX,
            localY,
            shorelineInsetFrame,
          );
        }

        const grassSandFrame = grassSandTransitionFrameIndexAt(terrain, tileX, tileY);
        if (grassSandFrame !== null) drawGrassSandTransition(
          context,
          art.farmlandGrassInset,
          localX,
          localY,
          grassSandFrame,
        );

        const savannaGrassFrame = savannaGrassTransitionFrameIndexAt(terrain, tileX, tileY);
        if (savannaGrassFrame !== null) drawGrassSandTransition(
          context,
          art.savannaGrassInset,
          localX,
          localY,
          savannaGrassFrame,
        );

        const desertGrassFrame = desertGrassEdgeFrameIndexAt(terrain, tileX, tileY);
        if (desertGrassFrame !== null) drawGroundAsset(
          context,
          art.desertGrassEdge,
          localX,
          localY,
          desertGrassFrame,
        );
        for (const desertGrassInsetFrame of desertGrassInsetFrameIndicesAt(terrain, tileX, tileY)) {
          drawGroundAsset(context, art.desertGrassInset, localX, localY, desertGrassInsetFrame);
        }

        if (biome === 'freshwater') drawGroundAsset(
          context,
          art.freshwater,
          localX,
          localY,
          freshwaterFrameIndexAt(terrain, tileX, tileY),
        );

        const waterfallFrame = waterfallFrameIndexAt(terrain, tileX, tileY);
        if (waterfallFrame !== null) drawGroundAsset(context, art.waterfall, localX, localY, waterfallFrame);

        const dirtTerraceFrame = dirtTerraceFrameIndexAt(terrain, tileX, tileY);
        if (dirtTerraceFrame !== null) {
          drawGroundAsset(context, art.dirtTerrace, localX, localY, dirtTerraceFrame);
          drawGroundAsset(context, art.dirtCliffEdge, localX, localY, dirtTerraceFrame);
        }
        const dirtRampFrame = dirtTerraceRampFrameIndexAt(terrain, tileX, tileY);
        if (dirtRampFrame !== null) drawGroundAsset(context, art.dirtCliffRamp, localX, localY, dirtRampFrame);

        const plateau = plateauLayerPlanAt(terrain, tileX, tileY);
        for (const face of plateau.faceLayers) {
          drawGroundAsset(context, art.cliff, localX, localY, face.frame);
        }
        if (plateau.edgeFrame !== null) drawGroundAsset(context, art.cliff, localX, localY, plateau.edgeFrame);
        for (const insetFrame of plateau.insetFrames) {
          drawGroundAsset(context, art.stoneCliffInverseOverlay, localX, localY, insetFrame);
        }
        if (plateau.rampFrame !== null) drawGroundAsset(context, art.grassCliffRamp, localX, localY, plateau.rampFrame);

        const cliffFrame = cliffFrameIndexAt(terrain, tileX, tileY);
        if (cliffFrame !== null) {
          // Coastal faces use Stone Cliff 3 over sand. Raised inland plateaus
          // deliberately keep Stone Cliff 1's dark-grass cap above.
          drawGroundAsset(context, art.coastalCliffOverlay, localX, localY, cliffFrame);
        }
        const desertCliffFrame = desertCliffFrameIndexAt(terrain, tileX, tileY);
        if (desertCliffFrame !== null) drawGroundAsset(context, art.desertCliff, localX, localY, desertCliffFrame);

        const hash = terrainDecorationHash(tileX, tileY);
        if (waterDecorationAllowedAt(terrain, tileX, tileY) && hash % 37 === 0) {
          drawGroundAsset(context, art.waterRipples, localX, localY);
        }
      }
    }
    return canvas;
  }
}
