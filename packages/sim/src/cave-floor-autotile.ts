export interface CaveFloorAutotilePlan {
  /** Raw row-major frame in Cave_Floor_1's 3×5 sheet. Null uses plain middle. */
  readonly transitionFrame: number | null;
  readonly insetFrames: readonly number[];
}

export type CaveFloorPatchVariant = 0 | 1;

const PATCH_CELL_TILES = 18;

function caveFloorHash(
  seed: number,
  spaceId: number,
  x: number,
  y: number,
  salt: number,
): number {
  let value = seed
    ^ Math.imul(spaceId + 1, 0x9e3779b1)
    ^ Math.imul(x, 0x85ebca6b)
    ^ Math.imul(y, 0xc2b2ae35)
    ^ salt;
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
  return (value ^ (value >>> 16)) >>> 0;
}

/** Stable, connected rocky-floor patches. Each selected coarse cell owns one
 * broad ellipse; the 3x5 floor sheets then autotile its perimeter. Generating
 * the mask from absolute coordinates keeps paths seamless across cache chunks
 * and newly excavated cells. */
export function caveFloorPatchVariantAt(
  seed: number,
  spaceId: number,
  tileX: number,
  tileY: number,
): CaveFloorPatchVariant | null {
  const cellX = Math.floor(tileX / PATCH_CELL_TILES);
  const cellY = Math.floor(tileY / PATCH_CELL_TILES);
  let selected: { readonly score: number; readonly variant: CaveFloorPatchVariant } | null = null;
  for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
    for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
      const anchorCellX = cellX + offsetX;
      const anchorCellY = cellY + offsetY;
      const hash = caveFloorHash(seed, spaceId, anchorCellX, anchorCellY, 0x4f1bbcdc);
      if (hash % 3 === 0) continue;
      const centerX = anchorCellX * PATCH_CELL_TILES + 4 + ((hash >>> 4) % 11);
      const centerY = anchorCellY * PATCH_CELL_TILES + 4 + ((hash >>> 9) % 11);
      const horizontal = ((hash >>> 14) & 1) === 0;
      const radiusX = horizontal ? 5 + ((hash >>> 15) % 4) : 3 + ((hash >>> 15) % 2);
      const radiusY = horizontal ? 3 + ((hash >>> 18) % 2) : 5 + ((hash >>> 18) % 4);
      const dx = tileX - centerX;
      const dy = tileY - centerY;
      const score = (dx * dx) / (radiusX * radiusX) + (dy * dy) / (radiusY * radiusY);
      if (score > 1) continue;
      const variant = ((hash >>> 22) & 1) as CaveFloorPatchVariant;
      if (selected === null || score < selected.score) selected = { score, variant };
    }
  }
  return selected?.variant ?? null;
}

/** Sparse full-tile cracks/pebbles from Cave_Floor_Decoration.png. Clearance
 * from walls is enforced by the caller because only it owns live excavation. */
export function caveFloorDecorationFrameAt(
  seed: number,
  spaceId: number,
  tileX: number,
  tileY: number,
): number | null {
  const hash = caveFloorHash(seed, spaceId, tileX, tileY, 0x6a09e667);
  return hash % 47 === 0 ? (hash >>> 8) % 3 : null;
}

/** Resolves the normal-floor side of a rocky-floor boundary. Re-run this for
 * the edited cell and its eight neighbours whenever the rocky mask changes. */
export function caveFloorAutotilePlan(
  rockyAt: (offsetX: number, offsetY: number) => boolean,
): CaveFloorAutotilePlan {
  if (rockyAt(0, 0)) return { transitionFrame: 10, insetFrames: [] };
  const north = rockyAt(0, -1);
  const east = rockyAt(1, 0);
  const south = rockyAt(0, 1);
  const west = rockyAt(-1, 0);
  let transitionFrame: number | null = null;
  if (north && west) transitionFrame = 14;
  else if (north && east) transitionFrame = 12;
  else if (south && west) transitionFrame = 8;
  else if (south && east) transitionFrame = 6;
  else if (north) transitionFrame = 13;
  else if (east) transitionFrame = 9;
  else if (south) transitionFrame = 7;
  else if (west) transitionFrame = 11;

  const insetFrames: number[] = [];
  if (!north && !west && rockyAt(-1, -1)) insetFrames.push(4);
  if (!north && !east && rockyAt(1, -1)) insetFrames.push(3);
  if (!south && !west && rockyAt(-1, 1)) insetFrames.push(1);
  if (!south && !east && rockyAt(1, 1)) insetFrames.push(0);
  return { transitionFrame, insetFrames };
}
