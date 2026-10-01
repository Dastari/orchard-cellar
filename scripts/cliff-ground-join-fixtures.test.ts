import { describe, expect, it } from 'vitest';
import { cliffFixtures, fixturePlan, probeFixture, sixLevelVolcano, walkFixture } from './cliff-ground-join-fixtures.js';
import { planTerrain, type TerrainPlanAtlasAsset } from './terrain-plan.js';

const tile: TerrainPlanAtlasAsset = { anchor: [8, 15], variants: { base: Array.from({ length: 256 }, () => ({ width: 16, height: 16 })) } };
const atlas = new Proxy({} as Record<string, TerrainPlanAtlasAsset>, { get: () => tile });

describe('cliff investigation baseline evidence (update when engine capabilities deliberately change)', () => {
  it('separates Studio refusals from authoritative hitbox traversal', () => {
    expect(cliffFixtures().map(probeFixture)).toEqual([
      { id: 'closed-plateau', authoringError: null, authoredTransitions: 0, semanticEndpointStep: false, hitboxAscent: false, hitboxDescent: false },
      { id: 'straight-north-bank', authoringError: null, authoredTransitions: 2, semanticEndpointStep: true, hitboxAscent: true, hitboxDescent: true },
      { id: 'bank-at-cliff-end', authoringError: 'transition_stair_off_straight_cliff', authoredTransitions: 2, semanticEndpointStep: true, hitboxAscent: true, hitboxDescent: true },
      { id: 'four-tile-natural-ascent', authoringError: 'transition_path_length_mismatch', authoredTransitions: 0, semanticEndpointStep: false, hitboxAscent: false, hitboxDescent: false },
      ...['east', 'south', 'west'].map((direction) => ({ id: `${direction}-facing-bank`, authoringError: 'transition_direction_art_unavailable', authoredTransitions: 2, semanticEndpointStep: true, hitboxAscent: true, hitboxDescent: true })),
    ]);
  });

  it('allows a bank longitudinal approach but blocks lateral entry into its lower landing', () => {
    const bank = cliffFixtures()[1]!;
    expect(walkFixture(bank, [6, 9], [6, 8])).toBe(true);
    expect(walkFixture(bank, [5, 8], [6, 8])).toBe(false);
  });

  it('records native explicit slope-bank draws and retains the closed-plateau wall', () => {
    const [closed, bank] = cliffFixtures();
    const baseline = planTerrain(fixturePlan(closed!, atlas));
    const crossing = planTerrain(fixturePlan(bank!, atlas));
    const bankAsset = 'tile_cf_grass_1_ramp_bank_stone';
    expect(baseline.some((draw) => draw.assetId === bankAsset)).toBe(false);
    expect(crossing.some((draw) => draw.assetId === bankAsset)).toBe(true);
    expect(baseline.some((draw) => draw.tie?.includes(':face:'))).toBe(true);
  });

  it('draws six volcanic contour levels with volcanic substrate and physical wall courses', () => {
    const draws = planTerrain(sixLevelVolcano(atlas));
    const levels = new Set(draws.flatMap((draw) => {
      const match = /^0-terrain:(\d+):cap:/.exec(draw.tie ?? '');
      return match ? [Number(match[1])] : [];
    }));
    expect([...levels].sort()).toEqual([1, 2, 3, 4, 5, 6]);
    expect(draws.some((draw) => draw.assetId === 'tile_cf_rogue_volcanic_floor')).toBe(true);
    expect(draws.some((draw) => draw.assetId === 'tile_cf_grass_1_middle')).toBe(false);
    expect(draws.some((draw) => draw.assetId === 'tile_cf_volcanic_cliff' && draw.tie?.includes(':face:'))).toBe(true);
  });
});
