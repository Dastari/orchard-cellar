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
