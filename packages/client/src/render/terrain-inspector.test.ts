import { describe, expect, it } from 'vitest';
import { inspectTerrainAtProjectedPoint, terrainInspectionLines } from './terrain-inspector.js';
import type { TerrainArray } from './terrain.js';

function terrainFixture(): TerrainArray {
  const width = 4;
  const height = 7;
  const elevations = Uint8Array.from([
    0, 1, 1, 0,
    1, 1, 0, 0,
    0, 1, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0,
  ]);
  return {
    spaceId: 0,
    seed: 1,
    version: 1,
    width,
    height,
    generator: 'island',
    biomes: new Uint8Array(width * height).fill(4),
    blocked: Array<boolean>(width * height).fill(false),
    horseJumpableTerrain: Array<boolean>(width * height).fill(false),
    cliffRoles: new Uint8Array(width * height),
    elevations,
    raisedTerrainCollisionClassified: true,
    plateaus: elevations,
    dirtCliffRoles: new Uint8Array(width * height),
    dirtTerraces: new Uint8Array(width * height),
  };
}

describe('terrain composition inspector', () => {
  it('reverses cliff projection and reports the exact internal draw order', () => {
    const inspection = inspectTerrainAtProjectedPoint(terrainFixture(), 24, 8, 0, true);
    expect(inspection.tileX).toBe(1);
    expect(inspection.layers.some(({ role }) => role.endsWith('_underlay'))).toBe(true);
    const underlay = inspection.layers.findIndex(({ role }) => role.endsWith('_underlay'));
    expect(inspection.layers[underlay + 1]?.asset).toBe('stone_cliff');
    expect(terrainInspectionLines(inspection)).toContain('COMPOSED BACK -> FRONT');
  });

  it('reports collision independently from visual composition', () => {
    const inspection = inspectTerrainAtProjectedPoint(terrainFixture(), 8, 88, 0, false);
    expect(inspection.blocked).toBe(false);
    expect(terrainInspectionLines(inspection)[3]).toContain('OPEN');
  });

  it('reports cave contour frames from the cave wall atlas', () => {
    const terrain = { ...terrainFixture(), generator: 'cellar' as const };
    const inspection = inspectTerrainAtProjectedPoint(terrain, 24, 8, 0, true);
    expect(inspection.layers.some(({ asset }) => asset === 'cave_wall')).toBe(true);
    expect(inspection.layers.every(({ asset }) => (
      asset !== 'stone_cliff' && asset !== 'stone_cliff_inverse'
    ))).toBe(true);
  });
});
