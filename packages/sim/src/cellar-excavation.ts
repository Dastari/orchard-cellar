import { SURVIVAL_ORE_KINDS, type SurvivalOreKind } from './survival-world.js';
import { miningWorkPerHit } from './mining.js';

export const CELLAR_WALL_MIN_HITS = 5;
export const CELLAR_WALL_MAX_HITS = 6;
export const CELLAR_WALL_TOOL_WEAR = 2;
export const CELLAR_WALL_STONE_MIN = 10;
export const CELLAR_WALL_STONE_MAX = 18;

/** Old rows store only physical hits. Each legacy hit contributed novice work.
 * Work is additive so changing the contributing miner never revalues old hits. */
export function cellarWallStrikeProgress(
  baseHits: number,
  progress: { readonly hits: number; readonly work?: number } | null,
  efficientStrikesRank: number,
): { readonly hits: number; readonly work: number; readonly opensWall: boolean } {
  const previousWork = progress?.work || (progress?.hits ?? 0) * miningWorkPerHit(0);
  const work = previousWork + miningWorkPerHit(efficientStrikesRank);
  return { hits: (progress?.hits ?? 0) + 1, work,
    opensWall: work >= baseHits * miningWorkPerHit(0) };
}

/** The cellar is a grid of aligned 2x2 macro-cells. Every excavation is a
 * whole macro-cell, so solid rock and open floor are both unions of aligned
 * 2x2 blocks: no one-cell wall, one-cell step or one-cell notch can exist,
 * which is the minimum the rounded 2x2 cave corner bank can express. A
 * persisted excavation row is interpreted as the macro-cell containing its
 * anchor; legacy misaligned rows are repaired in place by that reading rather
 * than by rewriting or deleting a player's cave. */
export const CELLAR_EXCAVATION_SIZE_TILES = 2;

/** The outer rock ring stays at least one full macro-cell thick. */
const CELLAR_EXCAVATION_MARGIN_TILES = CELLAR_EXCAVATION_SIZE_TILES;

export interface CellarExcavationTile {
  readonly tileX: number;
  readonly tileY: number;
}

/** North-west corner of the macro-cell containing a tile. */
export function cellarExcavationAnchor(tileX: number, tileY: number): CellarExcavationTile {
  return {
    tileX: Math.floor(tileX / CELLAR_EXCAVATION_SIZE_TILES) * CELLAR_EXCAVATION_SIZE_TILES,
    tileY: Math.floor(tileY / CELLAR_EXCAVATION_SIZE_TILES) * CELLAR_EXCAVATION_SIZE_TILES,
  };
}

export function cellarExcavationFootprint(
  tileX: number,
  tileY: number,
  width: number,
  height: number,
): readonly CellarExcavationTile[] {
  if (!Number.isInteger(tileX) || !Number.isInteger(tileY)) return [];
  const anchor = cellarExcavationAnchor(tileX, tileY);
  const last = CELLAR_EXCAVATION_SIZE_TILES - 1;
  if (anchor.tileX < CELLAR_EXCAVATION_MARGIN_TILES
    || anchor.tileY < CELLAR_EXCAVATION_MARGIN_TILES
    || anchor.tileX + last >= width - CELLAR_EXCAVATION_MARGIN_TILES
    || anchor.tileY + last >= height - CELLAR_EXCAVATION_MARGIN_TILES) return [];
  return Array.from(
    { length: CELLAR_EXCAVATION_SIZE_TILES * CELLAR_EXCAVATION_SIZE_TILES },
    (_, index) => ({
      tileX: anchor.tileX + index % CELLAR_EXCAVATION_SIZE_TILES,
      tileY: anchor.tileY + Math.floor(index / CELLAR_EXCAVATION_SIZE_TILES),
    }),
  );
}

/** Persisted anchors whose macro-cell owns a queried floor cell: every anchor
 * inside that macro-cell, including legacy misaligned ones. */
export function cellarExcavationAnchorsAffectingTile(
  tileX: number,
  tileY: number,
  width: number,
  height: number,
): readonly CellarExcavationTile[] {
  const anchors: CellarExcavationTile[] = [];
  const cell = cellarExcavationAnchor(tileX, tileY);
  for (let anchorY = cell.tileY; anchorY < cell.tileY + CELLAR_EXCAVATION_SIZE_TILES; anchorY += 1) {
    for (let anchorX = cell.tileX; anchorX < cell.tileX + CELLAR_EXCAVATION_SIZE_TILES; anchorX += 1) {
      if (cellarExcavationFootprint(anchorX, anchorY, width, height).some(
        (candidate) => candidate.tileX === tileX && candidate.tileY === tileY,
      )) anchors.push({ tileX: anchorX, tileY: anchorY });
    }
  }
  return anchors;
}

const VEIN_CELL_SIZE = 12;
const VEIN_CHANCE_DENOMINATOR = 4;

function mix(value: number): number {
  let mixed = value | 0;
  mixed = Math.imul(mixed ^ (mixed >>> 16), 0x7feb352d);
  mixed = Math.imul(mixed ^ (mixed >>> 15), 0x846ca68b);
  return (mixed ^ (mixed >>> 16)) >>> 0;
}

function cellarHash(seed: number, spaceId: number, x: number, y: number, salt: number): number {
  return mix(
    seed
      ^ Math.imul(spaceId + 1, 0x9e3779b1)
      ^ Math.imul(x, 0x85ebca6b)
      ^ Math.imul(y, 0xc2b2ae35)
      ^ salt,
  );
}

/** Each wall takes a stable five or six blows. The value belongs to the tile,
 * so different players contribute to the same excavation rather than racing
 * separate client-side counters. */
export function cellarWallHitsRequired(seed: number, spaceId: number, tileX: number, tileY: number): number {
  return CELLAR_WALL_MIN_HITS
    + cellarHash(seed, spaceId, tileX, tileY, 0x2d15f06b)
      % (CELLAR_WALL_MAX_HITS - CELLAR_WALL_MIN_HITS + 1);
}

export function cellarWallStoneQuantity(seed: number, spaceId: number, tileX: number, tileY: number): number {
  return CELLAR_WALL_STONE_MIN
    + cellarHash(seed, spaceId, tileX, tileY, 0x51a7e5d3)
      % (CELLAR_WALL_STONE_MAX - CELLAR_WALL_STONE_MIN + 1);
}

function oreKindForAnchor(hash: number): SurvivalOreKind {
  // Common metals occupy most veins; gems remain discoverable but scarce.
  const roll = hash % 100;
  const index = roll < 34 ? 0
    : roll < 62 ? 1
      : roll < 74 ? 2
        : roll < 81 ? 3
          : roll < 87 ? 4
            : roll < 92 ? 5
              : roll < 96 ? 6 : 7;
  return SURVIVAL_ORE_KINDS[index]!;
}

/** Deterministic, ragged ore clusters. Only the selected tile is returned;
 * callers do not need to materialise the 1024-square underground field. */
export function cellarOreKindAt(
  seed: number,
  spaceId: number,
  tileX: number,
  tileY: number,
): SurvivalOreKind | null {
  if (!Number.isInteger(tileX) || !Number.isInteger(tileY) || tileX <= 0 || tileY <= 0) return null;
  const cellX = Math.floor(tileX / VEIN_CELL_SIZE);
  const cellY = Math.floor(tileY / VEIN_CELL_SIZE);
  let selected: { readonly kind: SurvivalOreKind; readonly score: number } | null = null;
  for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
    for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
      const anchorCellX = cellX + offsetX;
      const anchorCellY = cellY + offsetY;
      const anchorHash = cellarHash(seed, spaceId, anchorCellX, anchorCellY, 0x6a09e667);
      if (anchorHash % VEIN_CHANCE_DENOMINATOR !== 0) continue;
      const centerX = anchorCellX * VEIN_CELL_SIZE + 2 + ((anchorHash >>> 5) % (VEIN_CELL_SIZE - 4));
      const centerY = anchorCellY * VEIN_CELL_SIZE + 2 + ((anchorHash >>> 11) % (VEIN_CELL_SIZE - 4));
      const radius = 2 + ((anchorHash >>> 17) % 3);
      const dx = tileX - centerX;
      const dy = tileY - centerY;
      const distance = dx * dx + dy * dy;
      if (distance > radius * radius) continue;
      const edgeNoise = cellarHash(seed, spaceId, tileX, tileY, anchorHash);
      if (distance > (radius - 1) * (radius - 1) && edgeNoise % 4 === 0) continue;
      const score = distance * 0x1_0000 + (anchorHash & 0xffff);
      if (selected === null || score < selected.score) {
        selected = { kind: oreKindForAnchor(anchorHash >>> 3), score };
      }
    }
  }
  return selected?.kind ?? null;
}

/** Resource ids above bit 63 are reserved for revealed cellar veins. */
export function cellarOreResourceId(spaceId: number, tileX: number, tileY: number): bigint {
  return (1n << 63n)
    | (BigInt(spaceId & 0xffff) << 20n)
    | (BigInt(tileY & 0x3ff) << 10n)
    | BigInt(tileX & 0x3ff);
}
