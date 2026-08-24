import type { AtlasFrame } from './sprite.js';

/** Reusable authored-tile contract retained for future instanced maps. */
export interface TileDefinition {
  readonly fill: string;
  readonly inset?: {
    readonly color: string;
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
  readonly atlas?: {
    readonly image: CanvasImageSource;
    readonly frame: AtlasFrame;
    readonly frames?: readonly AtlasFrame[];
    readonly autotile?: 'blob47';
  };
  readonly overlayAtlas?: { readonly image: CanvasImageSource; readonly frame: AtlasFrame };
}

function eligibleDiagonalCount(cardinals: number): number {
  const north = (cardinals & 1) !== 0;
  const east = (cardinals & 2) !== 0;
  const south = (cardinals & 4) !== 0;
  const west = (cardinals & 8) !== 0;
  return Number(north && east) + Number(east && south) + Number(south && west) + Number(west && north);
}

/** Canonical 47-frame blob topology shared by authored paths and the runtime atlas. */
export function canonicalBlob47Index(cardinals: number, diagonalChoice: number): number {
  let index = diagonalChoice;
  for (let previous = 0; previous < cardinals; previous += 1) {
    index += 1 << eligibleDiagonalCount(previous);
  }
  return index;
}

export function blob47FrameIndex(tiles: readonly number[], width: number, index: number, tileId: number): number {
  const height = Math.ceil(tiles.length / width);
  const x = index % width;
  const y = Math.floor(index / width);
  const matches = (offsetX: number, offsetY: number): boolean => {
    const neighborX = x + offsetX;
    const neighborY = y + offsetY;
    if (neighborX < 0 || neighborY < 0 || neighborX >= width || neighborY >= height) return false;
    return tiles[neighborY * width + neighborX] === tileId;
  };
  const north = matches(0, -1);
  const east = matches(1, 0);
  const south = matches(0, 1);
  const west = matches(-1, 0);
  const cardinals = Number(north) | (Number(east) << 1) | (Number(south) << 2) | (Number(west) << 3);
  const diagonals = [matches(1, -1), matches(1, 1), matches(-1, 1), matches(-1, -1)];
  const eligible = [north && east, east && south, south && west, west && north];
  let diagonalChoice = 0;
  let choiceBit = 0;
  for (let diagonal = 0; diagonal < eligible.length; diagonal += 1) {
    if (!eligible[diagonal]) continue;
    if (diagonals[diagonal]) diagonalChoice |= 1 << choiceBit;
    choiceBit += 1;
  }
  return canonicalBlob47Index(cardinals, diagonalChoice);
}
