import { describe, expect, it } from 'vitest';
import {
  CELLAR_WALL_MAX_HITS,
  CELLAR_WALL_MIN_HITS,
  cellarExcavationAnchor,
  cellarExcavationAnchorsAffectingTile,
  cellarExcavationFootprint,
  cellarOreKindAt,
  cellarOreResourceId,
  cellarWallHitsRequired,
  cellarWallStrikeProgress,
  cellarWallStoneQuantity,
} from './cellar-excavation.js';

describe('cellar excavation', () => {
  it('scales wall work with Efficient Strikes without changing the untrained threshold', () => {
    for (const [baseHits, expected] of [[5, [5, 4, 3]], [6, [6, 5, 3]]] as const) {
      for (const rank of [0, 1, 2]) {
        let progress = cellarWallStrikeProgress(baseHits, null, rank);
        while (!progress.opensWall) progress = cellarWallStrikeProgress(baseHits, progress, rank);
        expect(progress.hits).toBe(expected[rank]);
      }
    }
  });

  it('preserves legacy hits and accumulates mixed-rank contributions without revaluing them', () => {
    const legacy = { hits: 2, work: 0 };
    const expert = cellarWallStrikeProgress(6, legacy, 2);
    expect(expert).toEqual({ hits: 3, work: 12, opensWall: false });
    const trained = cellarWallStrikeProgress(6, expert, 1);
    expect(trained).toEqual({ hits: 4, work: 16, opensWall: false });
    expect(cellarWallStrikeProgress(6, trained, 0)).toEqual({ hits: 5, work: 19, opensWall: true });
    expect(cellarWallStrikeProgress(6, { hits: 2 }, 2)).toEqual(expert);
    expect(legacy).toEqual({ hits: 2, work: 0 });
  });
  it('interprets every persisted dig as the aligned 2x2 macro-cell containing it', () => {
    expect(cellarExcavationFootprint(4, 2, 8, 8)).toEqual([
      { tileX: 4, tileY: 2 }, { tileX: 5, tileY: 2 },
      { tileX: 4, tileY: 3 }, { tileX: 5, tileY: 3 },
    ]);
    // Legacy misaligned anchors are repaired in place onto their macro-cell.
    expect(cellarExcavationFootprint(5, 3, 8, 8)).toEqual(cellarExcavationFootprint(4, 2, 8, 8));
    expect(cellarExcavationAnchor(5, 3)).toEqual({ tileX: 4, tileY: 2 });
    // The outer rock ring stays a full macro-cell thick.
    expect(cellarExcavationFootprint(0, 3, 8, 8)).toEqual([]);
    expect(cellarExcavationFootprint(1, 3, 8, 8)).toEqual([]);
    expect(cellarExcavationFootprint(6, 6, 8, 8)).toEqual([]);
    expect(cellarExcavationFootprint(4, 4, 8, 8)).toHaveLength(4);
    expect(cellarExcavationAnchorsAffectingTile(5, 3, 8, 8)).toEqual([
      { tileX: 4, tileY: 2 }, { tileX: 5, tileY: 2 },
      { tileX: 4, tileY: 3 }, { tileX: 5, tileY: 3 },
    ]);
    expect(cellarExcavationAnchorsAffectingTile(1, 3, 8, 8)).toEqual([]);
  });

  it('requires a stable five or six wall hits and drops a stone heap', () => {
    const hits = Array.from({ length: 32 }, (_, tileX) => cellarWallHitsRequired(42, 10_002, tileX, 511));
    expect(new Set(hits)).toEqual(new Set([CELLAR_WALL_MIN_HITS, CELLAR_WALL_MAX_HITS]));
    expect(cellarWallHitsRequired(42, 10_002, 17, 511)).toBe(cellarWallHitsRequired(42, 10_002, 17, 511));
    expect(cellarWallStoneQuantity(42, 10_002, 17, 511)).toBeGreaterThanOrEqual(10);
  });

  it('forms deterministic multi-tile ore veins with unique resource ids', () => {
    const seeded = new Map<string, string>();
    for (let y = 420; y < 620; y += 1) for (let x = 420; x < 620; x += 1) {
      const kind = cellarOreKindAt(0x4f434852, 10_002, x, y);
      if (kind !== null) seeded.set(`${x},${y}`, kind);
    }
    expect(seeded.size).toBeGreaterThan(300);
    expect([...seeded.keys()].some((key) => {
      const [x, y] = key.split(',').map(Number) as [number, number];
      return seeded.has(`${x + 1},${y}`) || seeded.has(`${x},${y + 1}`);
    })).toBe(true);
    expect(cellarOreKindAt(0x4f434852, 10_002, 500, 500)).toBe(
      cellarOreKindAt(0x4f434852, 10_002, 500, 500),
    );
    expect(cellarOreResourceId(10_002, 500, 500)).not.toBe(cellarOreResourceId(10_002, 501, 500));
  });
});
