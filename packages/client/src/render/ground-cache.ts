import {
  SURVIVAL_CHUNK_TILES,
  TILE_SIZE_PIXELS,
  type SurvivalBiome,
} from "@orchard/sim";
import type { OverworldArt } from "../overworld-art.js";
import type { LoadedAsset } from "./assets.js";
import { selectAtlasFrame } from "./sprite.js";
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
  freshwaterInsetFrameIndicesAt,
  terrainDecorationHash,
  terrainBiomeAt,
  terrainColorAt,
  waterDecorationAllowedAt,
  waterfallFrameIndexAt,
  waterfallUsesRaisedCompositionAt,
  type TerrainArray,
} from "./terrain.js";

export const GROUND_CHUNK_PIXELS = SURVIVAL_CHUNK_TILES * TILE_SIZE_PIXELS;

export function groundTileInsideTerrain(
  terrain: Pick<TerrainArray, "width" | "height">,
  tileX: number,
  tileY: number,
): boolean {
  return (
    tileX >= 0 && tileY >= 0 && tileX < terrain.width && tileY < terrain.height
  );
}

export class ChunkLruCache<T> {
  private readonly entries = new Map<string, T>();

  constructor(private capacityValue = 64) {}

  get size(): number {
    return this.entries.size;
  }
  get capacity(): number {
    return this.capacityValue;
  }
  has(chunkX: number, chunkY: number): boolean {
    return this.entries.has(`${chunkX},${chunkY}`);
  }

  setCapacity(capacity: number): void {
    this.capacityValue = Math.max(1, Math.ceil(capacity));
    this.evict();
  }

  getOrCreate(chunkX: number, chunkY: number, create: () => T): T {
    const key = `${chunkX},${chunkY}`;
    const existing = this.entries.get(key);
    if (existing !== undefined) {
      // Map iteration order is the LRU queue: refresh a hit at the tail in O(1).
      this.entries.delete(key);
      this.entries.set(key, existing);
      return existing;
    }
    const value = create();
    this.entries.set(key, value);
    this.evict();
    return value;
  }

  invalidate(chunkX: number, chunkY: number): void {
    this.entries.delete(`${chunkX},${chunkY}`);
  }

  invalidateResource(tileX: number, tileY: number): void {
    this.invalidate(
      Math.floor(tileX / SURVIVAL_CHUNK_TILES),
      Math.floor(tileY / SURVIVAL_CHUNK_TILES),
    );
  }

  clear(): void {
    this.entries.clear();
  }

  keys(): readonly string[] {
    return [...this.entries.keys()];
  }

  private evict(): void {
    while (this.entries.size > this.capacityValue) {
      const oldestKey = this.entries.keys().next().value as string | undefined;
      if (oldestKey === undefined) return;
      this.entries.delete(oldestKey);
    }
  }
}

export function groundCacheCapacityForViewport(
  viewportWidth: number,
  viewportHeight: number,
  scale: number,
): number {
  const safeScale = Math.max(0.01, scale);
  const columns =
    Math.ceil(viewportWidth / safeScale / GROUND_CHUNK_PIXELS) + 1;
  const rows = Math.ceil(viewportHeight / safeScale / GROUND_CHUNK_PIXELS) + 1;
  return Math.max(64, Math.ceil(columns * rows * 1.5));
}

function drawGroundAsset(
  context: CanvasRenderingContext2D,
  asset: LoadedAsset,
  tileX: number,
  tileY: number,
  frameIndex = 0,
): void {
  const source = selectAtlasFrame(asset.metadata, "base", frameIndex);
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

function drawUndugCaveTile(
  context: CanvasRenderingContext2D,
  asset: LoadedAsset,
  tileX: number,
  tileY: number,
  frameIndex: number,
): void {
  drawGroundAsset(context, asset, tileX, tileY, frameIndex);
  context.save();
  // Cave_Floor_Middle is the canonical tile-sized underground field. Recolour
  // it to Cave_Walls' dark blocked-centre colour; do not substitute the dense
  // rocky walkable-floor frame here.
  context.globalCompositeOperation = "source-atop";
  context.fillStyle = "#391f21";
  context.fillRect(
    tileX * TILE_SIZE_PIXELS,
    tileY * TILE_SIZE_PIXELS,
    TILE_SIZE_PIXELS,
    TILE_SIZE_PIXELS,
  );
  context.restore();
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
  for (const [sourceFrame, sourceY, destinationOffset] of [
    [5, 0, 0],
    [1, 8, 8],
  ] as const) {
    const source = selectAtlasFrame(asset.metadata, "base", sourceFrame);
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

function groundAssetForBiome(
  art: OverworldArt,
  biome: SurvivalBiome,
): LoadedAsset {
  if (biome === "water" || biome === "oasis_water") return art.water;
  if (biome === "freshwater") return art.grass;
  if (biome === "waterfall") return art.grass;
  if (biome === "beach") return art.beach;
  // Coastal cliff art is transparent outside the authored rock face. Sand is
  // the correct substrate there; using the default grass base made those
  // transparent pixels look like opaque green slabs around the cliff.
  if (biome === "coastal_cliff") return art.beach;
  if (biome === "desert_shore") return art.desertShore;
  if (biome === "desert" || biome === "desert_ridge") return art.desert;
  if (biome === "oasis" || biome === "savanna") return art.desertGrass;
  return art.grass;
}

export class GroundChunkCache {
  private readonly chunks: ChunkLruCache<HTMLCanvasElement>;
  private terrainKey = "";

  constructor(capacity = 64) {
    this.chunks = new ChunkLruCache(capacity);
  }

  get residentCount(): number {
    return this.chunks.size;
  }
  get residentKeys(): readonly string[] {
    return this.chunks.keys();
  }

  invalidateResource(tileX: number, tileY: number): void {
    this.chunks.invalidateResource(tileX, tileY);
  }

  private prepareTerrain(terrain: TerrainArray): void {
    const key = `${terrain.spaceId}:${terrain.generator ?? "unknown"}:${terrain.width}x${terrain.height}:${terrain.seed}:${terrain.version}`;
    if (key === this.terrainKey) return;
    this.terrainKey = key;
    this.chunks.clear();
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
    this.chunks.setCapacity(
      groundCacheCapacityForViewport(viewportWidth, viewportHeight, scale),
    );
    this.prepareTerrain(terrain);
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
    if (terrain.generator === "cellar") {
      const frame = selectAtlasFrame(art.caveFloorMiddle.metadata, "base", 0);
      if (frame !== null) {
        const firstTileX = Math.floor(cameraX / TILE_SIZE_PIXELS);
        const firstTileY = Math.floor(cameraY / TILE_SIZE_PIXELS);
        const lastTileX = Math.ceil(
          (cameraX + viewportWidth / scale) / TILE_SIZE_PIXELS,
        );
        const lastTileY = Math.ceil(
          (cameraY + viewportHeight / scale) / TILE_SIZE_PIXELS,
        );
        for (let tileY = firstTileY; tileY <= lastTileY; tileY += 1) {
          for (let tileX = firstTileX; tileX <= lastTileX; tileX += 1) {
            const destinationX = Math.round(
              (tileX * TILE_SIZE_PIXELS - cameraX) * scale,
            );
            const destinationY = Math.round(
              (tileY * TILE_SIZE_PIXELS - cameraY) * scale,
            );
            context.drawImage(
              art.caveFloorMiddle.image,
              frame.x,
              frame.y,
              frame.width,
              frame.height,
              destinationX,
              destinationY,
              TILE_SIZE_PIXELS * scale,
              TILE_SIZE_PIXELS * scale,
            );
            context.save();
            context.globalCompositeOperation = "source-atop";
            context.fillStyle = "#391f21";
            context.fillRect(
              destinationX,
              destinationY,
              TILE_SIZE_PIXELS * scale,
              TILE_SIZE_PIXELS * scale,
            );
            context.restore();
          }
        }
        drawCalls += 1;
      }
    }
    for (let chunkY = minChunkY; chunkY <= maxChunkY; chunkY += 1) {
      for (let chunkX = minChunkX; chunkX <= maxChunkX; chunkX += 1) {
        const canvas = this.chunks.getOrCreate(chunkX, chunkY, () =>
          this.renderChunk(art, terrain, chunkX, chunkY),
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

  /** Reuses an already-baked ground chunk as an elevation-aware cap run.
   * Runs never cross a chunk boundary, keeping each surface span to one draw. */
  drawProjectedRun(
    context: CanvasRenderingContext2D,
    art: OverworldArt,
    terrain: TerrainArray,
    firstTileX: number,
    lastTileX: number,
    tileY: number,
    visualOffset: number,
    cameraX: number,
    cameraY: number,
    scale: number,
  ): void {
    this.prepareTerrain(terrain);
    const chunkX = Math.floor(firstTileX / SURVIVAL_CHUNK_TILES);
    const chunkY = Math.floor(tileY / SURVIVAL_CHUNK_TILES);
    if (Math.floor(lastTileX / SURVIVAL_CHUNK_TILES) !== chunkX) {
      throw new Error("Projected ground run crossed a chunk boundary");
    }
    const canvas = this.chunks.getOrCreate(chunkX, chunkY, () =>
      this.renderChunk(art, terrain, chunkX, chunkY),
    );
    const sourceX =
      (firstTileX - chunkX * SURVIVAL_CHUNK_TILES) * TILE_SIZE_PIXELS;
    const sourceY = (tileY - chunkY * SURVIVAL_CHUNK_TILES) * TILE_SIZE_PIXELS;
    const width = (lastTileX - firstTileX + 1) * TILE_SIZE_PIXELS;
    context.drawImage(
      canvas,
      sourceX,
      sourceY,
      width,
      TILE_SIZE_PIXELS,
      Math.round((firstTileX * TILE_SIZE_PIXELS - cameraX) * scale),
      Math.round((tileY * TILE_SIZE_PIXELS - visualOffset - cameraY) * scale),
      width * scale,
      TILE_SIZE_PIXELS * scale,
    );
  }

  /** Draws the exact baked source tile for terrain-composition diagnostics.
   * This deliberately shares the resident chunk rather than approximating a
   * biome frame, so transitions and other ground overlays remain visible. */
  drawTilePreview(
    context: CanvasRenderingContext2D,
    art: OverworldArt,
    terrain: TerrainArray,
    tileX: number,
    tileY: number,
    destinationX: number,
    destinationY: number,
    size: number,
  ): boolean {
    if (
      tileX < 0 ||
      tileY < 0 ||
      tileX >= terrain.width ||
      tileY >= terrain.height
    )
      return false;
    this.prepareTerrain(terrain);
    const chunkX = Math.floor(tileX / SURVIVAL_CHUNK_TILES);
    const chunkY = Math.floor(tileY / SURVIVAL_CHUNK_TILES);
    const canvas = this.chunks.getOrCreate(chunkX, chunkY, () =>
      this.renderChunk(art, terrain, chunkX, chunkY),
    );
    context.drawImage(
      canvas,
      (tileX - chunkX * SURVIVAL_CHUNK_TILES) * TILE_SIZE_PIXELS,
      (tileY - chunkY * SURVIVAL_CHUNK_TILES) * TILE_SIZE_PIXELS,
      TILE_SIZE_PIXELS,
      TILE_SIZE_PIXELS,
      destinationX,
      destinationY,
      size,
      size,
    );
    return true;
  }

  private renderChunk(
    art: OverworldArt,
    terrain: TerrainArray,
    chunkX: number,
    chunkY: number,
  ): HTMLCanvasElement {
    const canvas = document.createElement("canvas");
    canvas.width = GROUND_CHUNK_PIXELS;
    canvas.height = GROUND_CHUNK_PIXELS;
    const context = canvas.getContext("2d");
    if (context === null) throw new Error("Ground chunk Canvas 2D unavailable");
    context.imageSmoothingEnabled = false;
    const firstTileX = chunkX * SURVIVAL_CHUNK_TILES;
    const firstTileY = chunkY * SURVIVAL_CHUNK_TILES;
    for (let localY = 0; localY < SURVIVAL_CHUNK_TILES; localY += 1) {
      for (let localX = 0; localX < SURVIVAL_CHUNK_TILES; localX += 1) {
        const tileX = firstTileX + localX;
        const tileY = firstTileY + localY;
        // The final cache chunk can be only partially occupied. Leaving its
        // unused cells to terrainBiomeAt's water fallback paints a fake ocean
        // outside finite maps and editor inspection windows.
        if (!groundTileInsideTerrain(terrain, tileX, tileY)) continue;
        if (terrain.generator === "residence" || terrain.generator === "marlow_tent") {
          const index = tileY * terrain.width + tileX;
          if (terrain.blocked[index]) continue;
          drawGroundAsset(context, art.woodFloor, localX, localY, 0);
          const northBlocked =
            tileY === 0 || terrain.blocked[(tileY - 1) * terrain.width + tileX];
          if (northBlocked)
            drawGroundAsset(context, art.interiorWall, localX, localY);
          continue;
        }
        if (terrain.generator === "cellar") {
          const index = tileY * terrain.width + tileX;
          if (!terrain.blocked[index]) {
            drawGroundAsset(context, art.caveFloorMiddle, localX, localY);
          } else {
            // Uncut rock is only the continuous raised-plane substrate. The
            // shared raised-terrain resolver owns every cap, corner and face;
            // duplicating a 3x3 ring here makes those layers disagree.
            drawUndugCaveTile(context, art.caveFloorMiddle, localX, localY, 0);
          }
          continue;
        }
        const biome = terrainBiomeAt(terrain, tileX, tileY);
        const destinationX = localX * TILE_SIZE_PIXELS;
        const destinationY = localY * TILE_SIZE_PIXELS;
        context.fillStyle = terrainColorAt(terrain, tileX, tileY);
        context.fillRect(
          destinationX,
          destinationY,
          TILE_SIZE_PIXELS,
          TILE_SIZE_PIXELS,
        );
        const base = groundAssetForBiome(art, biome);
        const baseFrame =
          biome === "beach"
            ? beachFrameIndexAt(terrain, tileX, tileY)
            : biome === "coastal_cliff"
              ? 4
              : biome === "desert_shore"
                ? desertShoreFrameIndexAt(terrain, tileX, tileY)
                : 0;
        drawGroundAsset(context, base, localX, localY, baseFrame);

        for (const shorelineInsetFrame of shorelineInsetFrameIndicesAt(
          terrain,
          tileX,
          tileY,
        )) {
          drawGroundAsset(
            context,
            biome === "beach" ? art.beachInset : art.desertShoreInset,
            localX,
            localY,
            shorelineInsetFrame,
          );
        }

        const grassSandFrame = grassSandTransitionFrameIndexAt(
          terrain,
          tileX,
          tileY,
        );
        if (grassSandFrame !== null)
          drawGrassSandTransition(
            context,
            art.farmlandGrassInset,
            localX,
            localY,
            grassSandFrame,
          );

        const savannaGrassFrame = savannaGrassTransitionFrameIndexAt(
          terrain,
          tileX,
          tileY,
        );
        if (savannaGrassFrame !== null)
          drawGrassSandTransition(
            context,
            art.savannaGrassInset,
            localX,
            localY,
            savannaGrassFrame,
          );

        const desertGrassFrame = desertGrassEdgeFrameIndexAt(
          terrain,
          tileX,
          tileY,
        );
        if (desertGrassFrame !== null)
          drawGroundAsset(
            context,
            art.desertGrassEdge,
            localX,
            localY,
            desertGrassFrame,
          );
        for (const desertGrassInsetFrame of desertGrassInsetFrameIndicesAt(
          terrain,
          tileX,
          tileY,
        )) {
          drawGroundAsset(
            context,
            art.desertGrassInset,
            localX,
            localY,
            desertGrassInsetFrame,
          );
        }

        if (biome === "freshwater")
          drawGroundAsset(
            context,
            art.freshwater,
            localX,
            localY,
            freshwaterFrameIndexAt(terrain, tileX, tileY),
          );
        if (biome === "freshwater") {
          for (const insetFrame of freshwaterInsetFrameIndicesAt(
            terrain,
            tileX,
            tileY,
          )) {
            drawGroundAsset(
              context,
              art.freshwaterInset,
              localX,
              localY,
              insetFrame,
            );
          }
        }

        const waterfallFrame = waterfallUsesRaisedCompositionAt(
          terrain,
          tileX,
          tileY,
        ) ? null : waterfallFrameIndexAt(terrain, tileX, tileY);
        if (waterfallFrame !== null)
          drawGroundAsset(
            context,
            art.waterfall,
            localX,
            localY,
            waterfallFrame,
          );

        const dirtTerraceFrame = dirtTerraceFrameIndexAt(terrain, tileX, tileY);
        if (dirtTerraceFrame !== null) {
          drawGroundAsset(
            context,
            art.dirtTerrace,
            localX,
            localY,
            dirtTerraceFrame,
          );
          drawGroundAsset(
            context,
            art.dirtCliffEdge,
            localX,
            localY,
            dirtTerraceFrame,
          );
        }
        const dirtRampFrame = dirtTerraceRampFrameIndexAt(
          terrain,
          tileX,
          tileY,
        );
        if (dirtRampFrame !== null)
          drawGroundAsset(
            context,
            art.dirtCliffRamp,
            localX,
            localY,
            dirtRampFrame,
          );

        const cliffFrame = cliffFrameIndexAt(terrain, tileX, tileY);
        if (cliffFrame !== null) {
          // Coastal faces use Stone Cliff 3 over sand. Raised inland plateaus
          // deliberately keep Stone Cliff 1's dark-grass cap above.
          drawGroundAsset(
            context,
            art.coastalCliffOverlay,
            localX,
            localY,
            cliffFrame,
          );
        }
        const desertCliffFrame = desertCliffFrameIndexAt(terrain, tileX, tileY);
        if (desertCliffFrame !== null)
          drawGroundAsset(
            context,
            art.desertCliff,
            localX,
            localY,
            desertCliffFrame,
          );

        const hash = terrainDecorationHash(tileX, tileY);
        if (
          waterDecorationAllowedAt(terrain, tileX, tileY) &&
          hash % 37 === 0
        ) {
          drawGroundAsset(context, art.waterRipples, localX, localY);
        }
      }
    }
    return canvas;
  }
}
