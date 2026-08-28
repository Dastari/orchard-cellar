import {
  PROCEDURAL_WORLD_CHUNK_TILES,
  PROCEDURAL_WORLD_EXTENT_TILES,
} from './balance.js';

export interface SpaceTilePoint {
  readonly spaceId: number;
  readonly tileX: number;
  readonly tileY: number;
}

export interface SpaceTileBounds {
  readonly minTileX: number;
  readonly minTileY: number;
  readonly width: number;
  readonly height: number;
}

export interface ChunkPoint {
  readonly spaceId: number;
  readonly chunkX: number;
  readonly chunkY: number;
}

export interface ChunkLocalPoint {
  readonly localX: number;
  readonly localY: number;
}

export interface TileChunkCoordinate {
  readonly chunk: number;
  readonly local: number;
}

function requireInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value)) throw new Error(`${label} must be a safe integer`);
}

function requirePositiveInteger(value: number, label: string): void {
  requireInteger(value, label);
  if (value <= 0) throw new Error(`${label} must be positive`);
}

/** Mathematical floor division. Unlike truncation, negative tiles remain in
 * the chunk immediately west/north of zero. */
export function floorDiv(value: number, divisor: number): number {
  requireInteger(value, 'value');
  requirePositiveInteger(divisor, 'divisor');
  return Math.floor(value / divisor);
}

/** Floor modulo in `[0, divisor)`. Raw JavaScript `%` must not be used for
 * signed world-to-chunk conversion. */
export function floorMod(value: number, divisor: number): number {
  return value - floorDiv(value, divisor) * divisor;
}

export function tileChunkCoordinate(
  tile: number,
  chunkTiles = PROCEDURAL_WORLD_CHUNK_TILES,
): TileChunkCoordinate {
  const chunk = floorDiv(tile, chunkTiles);
  const local = floorMod(tile, chunkTiles);
  return { chunk, local };
}

export function tileToChunkPoint(
  point: SpaceTilePoint,
  chunkTiles = PROCEDURAL_WORLD_CHUNK_TILES,
): ChunkPoint & ChunkLocalPoint {
  const x = tileChunkCoordinate(point.tileX, chunkTiles);
  const y = tileChunkCoordinate(point.tileY, chunkTiles);
  return {
    spaceId: point.spaceId,
    chunkX: x.chunk,
    chunkY: y.chunk,
    localX: x.local,
    localY: y.local,
  };
}

export function chunkLocalToTile(
  chunk: number,
  local: number,
  chunkTiles = PROCEDURAL_WORLD_CHUNK_TILES,
): number {
  requireInteger(chunk, 'chunk');
  requireInteger(local, 'local');
  requirePositiveInteger(chunkTiles, 'chunkTiles');
  if (local < 0 || local >= chunkTiles) {
    throw new Error(`local must be between 0 and ${chunkTiles - 1}`);
  }
  return chunk * chunkTiles + local;
}

export function chunkTileBounds(
  chunkX: number,
  chunkY: number,
  chunkTiles = PROCEDURAL_WORLD_CHUNK_TILES,
): SpaceTileBounds {
  requireInteger(chunkX, 'chunkX');
  requireInteger(chunkY, 'chunkY');
  requirePositiveInteger(chunkTiles, 'chunkTiles');
  return {
    minTileX: chunkX * chunkTiles,
    minTileY: chunkY * chunkTiles,
    width: chunkTiles,
    height: chunkTiles,
  };
}

export function spaceTileBoundsContains(
  bounds: SpaceTileBounds,
  tileX: number,
  tileY: number,
): boolean {
  requireInteger(tileX, 'tileX');
  requireInteger(tileY, 'tileY');
  requireInteger(bounds.minTileX, 'bounds.minTileX');
  requireInteger(bounds.minTileY, 'bounds.minTileY');
  requirePositiveInteger(bounds.width, 'bounds.width');
  requirePositiveInteger(bounds.height, 'bounds.height');
  return tileX >= bounds.minTileX
    && tileY >= bounds.minTileY
    && tileX < bounds.minTileX + bounds.width
    && tileY < bounds.minTileY + bounds.height;
}

export function proceduralWorldCoordinateInExtent(tileX: number, tileY: number): boolean {
  return Number.isSafeInteger(tileX)
    && Number.isSafeInteger(tileY)
    && tileX >= -PROCEDURAL_WORLD_EXTENT_TILES
    && tileX <= PROCEDURAL_WORLD_EXTENT_TILES
    && tileY >= -PROCEDURAL_WORLD_EXTENT_TILES
    && tileY <= PROCEDURAL_WORLD_EXTENT_TILES;
}

export function signedTileKey(tileX: number, tileY: number): string {
  requireInteger(tileX, 'tileX');
  requireInteger(tileY, 'tileY');
  return `${tileX},${tileY}`;
}
