import { describe, expect, it } from 'vitest';
import {
  CELLAR_WALL_MAX_HITS,
  CELLAR_WALL_MIN_HITS,
  cellarOreKindAt,
  cellarOreResourceId,
  cellarWallHitsRequired,
  cellarWallStoneQuantity,
} from './cellar-excavation.js';

describe('cellar excavation', () => {
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
