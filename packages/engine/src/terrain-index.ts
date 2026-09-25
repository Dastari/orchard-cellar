/** The addressable part of a terrain array: a `width` x `height` window of
 * world tiles whose top-left tile is (`originX`, `originY`). Whole maps leave
 * the origin at (0, 0); a chunk render window (static world S4c) sets it. */
export interface TerrainWindow {
  readonly width: number;
  readonly height: number;
  readonly originX?: number;
  readonly originY?: number;
}

/** Flat index of world tile (x, y) in a row-major terrain channel, or -1 when
 * the tile lies outside the window [origin, origin + size).
 *
 * The test is written in the same "reject when below or at/after the end" form
 * as the hand-written checks it replaced, so non-integer or NaN coordinates
 * are not rejected here: they produce a non-integer or NaN index that reads
 * `undefined`, exactly as before. Callers pass integer tile coordinates. */
export function terrainIndexAt(terrain: TerrainWindow, x: number, y: number): number {
  const localX = x - (terrain.originX ?? 0);
  const localY = y - (terrain.originY ?? 0);
  if (localX < 0 || localY < 0 || localX >= terrain.width || localY >= terrain.height) return -1;
  return localY * terrain.width + localX;
}

/** True when world tile (x, y) lies inside the terrain window. Positive form of
 * the bounds test (NaN is outside), matching the `x >= 0 && ...` checks it replaced. */
export function terrainContains(terrain: TerrainWindow, x: number, y: number): boolean {
  const localX = x - (terrain.originX ?? 0);
  const localY = y - (terrain.originY ?? 0);
  return localX >= 0 && localY >= 0 && localX < terrain.width && localY < terrain.height;
}

/** Inclusive world-tile bounds of the terrain window. */
export function terrainTileBounds(terrain: TerrainWindow): {
  readonly minX: number; readonly minY: number; readonly maxX: number; readonly maxY: number;
} {
  const minX = terrain.originX ?? 0;
  const minY = terrain.originY ?? 0;
  return { minX, minY, maxX: minX + terrain.width - 1, maxY: minY + terrain.height - 1 };
}

/** True for a chunk render window (static world S4c): it sets its origin, even
 * at (0, 0). Whole-map terrain never does. */
export function terrainIsWindow(terrain: TerrainWindow): boolean {
  return terrain.originX !== undefined || terrain.originY !== undefined;
}

const SPARSE_SPAN = 65_536;
const SPARSE_OFFSET = 32_768;

/** Numeric key for sparse per-tile maps (caches and authored lookups) that can
 * see coordinates outside the terrain.
 *
 * Whole-map terrain keeps the historical `tileY * width + tileX` key, including
 * its aliasing of off-map coordinates, so legacy output is unchanged. A window
 * cannot use that key: world tiles past its width would alias tiles on the next
 * row. It packs both world coordinates instead (unique for |coordinate| < 32768). */
export function terrainSparseKey(terrain: TerrainWindow, x: number, y: number): number {
  if (!terrainIsWindow(terrain)) return y * terrain.width + x;
  return (y + SPARSE_OFFSET) * SPARSE_SPAN + (x + SPARSE_OFFSET);
}

/** Inverse of terrainSparseKey (the legacy form only for in-range keys, as before). */
export function terrainSparseKeyTile(terrain: TerrainWindow, key: number): { readonly tileX: number; readonly tileY: number } {
  if (!terrainIsWindow(terrain)) return { tileX: key % terrain.width, tileY: Math.floor(key / terrain.width) };
  return { tileX: key % SPARSE_SPAN - SPARSE_OFFSET, tileY: Math.floor(key / SPARSE_SPAN) - SPARSE_OFFSET };
}
