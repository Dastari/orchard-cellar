import { describe, expect, it } from 'vitest';
import {
  SURVIVAL_WORLD_SEED,
  SURVIVAL_WORLD_VERSION,
  survivalPlateauRamps,
} from '@orchard/sim';
import { raisedTerrainDepthEntries } from './raised-terrain-depth.js';
import { plateauLayerPlansAt, terrainForWorld, type TerrainArray } from './terrain.js';

function nestedTerrain(): TerrainArray {
  const width = 7;
  const height = 7;
  const elevations = new Uint8Array(width * height);
  for (let y = 1; y <= 5; y += 1) for (let x = 1; x <= 5; x += 1) {
    elevations[y * width + x] = 1;
  }
  for (let y = 2; y <= 4; y += 1) for (let x = 2; x <= 4; x += 1) {
    elevations[y * width + x] = 2;
  }
  elevations[3 * width + 3] = 3;
  return {
    spaceId: 0,
    seed: 1,
    version: 1,
    width,
    height,
    biomes: new Uint8Array(width * height).fill(4),
    blocked: Array<boolean>(width * height).fill(false),
    horseJumpableTerrain: Array<boolean>(width * height).fill(false),
    cliffRoles: new Uint8Array(width * height),
    elevations,
    plateaus: elevations,
    dirtCliffRoles: new Uint8Array(width * height),
    dirtTerraces: new Uint8Array(width * height),
  };
}

describe('30§5 raised-terrain depth entries', () => {
  it('submits every nested contour at its lower elevation depth plane', () => {
    const entries = raisedTerrainDepthEntries(nestedTerrain(), 0, 0, 6, 6);
    const nestedSouth = entries.filter(({ tileX, tileY }) => tileX === 3 && tileY === 5);
    expect(nestedSouth.map(({ contourLevel }) => contourLevel)).toEqual([1, 2, 3]);
    expect(nestedSouth.map(({ depthOffset }) => depthOffset)).toEqual([0, 48, 96]);
  });

  it('30§3 maps every generated semantic crossing to its named contour art', () => {
    const terrain = terrainForWorld(SURVIVAL_WORLD_SEED, SURVIVAL_WORLD_VERSION);
    for (const ramp of survivalPlateauRamps(SURVIVAL_WORLD_SEED)) {
      const upperLeft = plateauLayerPlansAt(terrain, ramp.tileX, ramp.tileY - 1)
        .find(({ contourLevel }) => contourLevel === ramp.contourLevel);
      const upperRight = plateauLayerPlansAt(terrain, ramp.tileX + 1, ramp.tileY - 1)
        .find(({ contourLevel }) => contourLevel === ramp.contourLevel);
      const lowerLeft = plateauLayerPlansAt(terrain, ramp.tileX, ramp.tileY)
        .find(({ contourLevel }) => contourLevel === ramp.contourLevel);
      const lowerRight = plateauLayerPlansAt(terrain, ramp.tileX + 1, ramp.tileY)
        .find(({ contourLevel }) => contourLevel === ramp.contourLevel);
      expect([
        upperLeft?.plan.rampRole,
        upperRight?.plan.rampRole,
        lowerLeft?.plan.rampRole,
        lowerRight?.plan.rampRole,
      ]).toEqual([
        'ramp_top_left', 'ramp_top_right', 'ramp_bottom_left', 'ramp_bottom_right',
      ]);
    }
  }, 20_000);
});
