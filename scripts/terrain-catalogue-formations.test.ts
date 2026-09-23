import { describe, expect, it } from 'vitest';
import { raisedTerrainInsetRolesAt } from '../packages/sim/src/raised-terrain-autotile.js';
import { catalogueFormation, TERRAIN_CATALOGUE_SHAPES } from './terrain-catalogue-formations.js';

describe('native terrain formation evidence', () => {
  it('retains the reported broken diagonal as input but never presents its conflicting inset stack as a Smart result', () => {
    const formation = catalogueFormation(TERRAIN_CATALOGUE_SHAPES.diagonal);
    const before = { raisedAt: formation.inputAt };
    expect(formation.input.some(p => raisedTerrainInsetRolesAt(before, p.tileX, p.tileY).length > 1)).toBe(true);
    expect(formation.added.length).toBeGreaterThan(0);
    for (const p of formation.input) expect(formation.occupiedAt(p.tileX, p.tileY)).toBe(true);
  });

  for (const [name, shape] of Object.entries(TERRAIN_CATALOGUE_SHAPES)) {
    it(`${name} uses at most one inset per occupied cell and only immediately adjacent repairs`, () => {
      const formation = catalogueFormation(shape);
      for (const p of formation.points) {
        expect(raisedTerrainInsetRolesAt({ raisedAt: formation.occupiedAt }, p.tileX, p.tileY).length).toBeLessThanOrEqual(1);
      }
      for (const p of formation.added) {
        expect(formation.input.some(q => Math.max(Math.abs(p.tileX-q.tileX),Math.abs(p.tileY-q.tileY))<=1)).toBe(true);
      }
      if (name !== 'diagonal') expect(formation.added).toHaveLength(0);
    });
  }
});
