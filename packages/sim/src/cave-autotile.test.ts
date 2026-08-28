import { describe, expect, it } from 'vitest';
import {
  caveProjectedRowsPerLevel,
  caveTerrainPlaneCollisionBytes,
} from './cave-autotile.js';

describe('cave elevation-plane collision', () => {
  it('never turns unexcavated rock into an open lower-plane cell', () => {
    const width = 17;
    const height = 13;
    const elevations = Uint8Array.from({ length: width * height }, (_, index) => {
      const tileX = index % width;
      const tileY = Math.floor(index / width);
      if (tileX === 0 || tileY === 0 || tileX === width - 1 || tileY === height - 1) return 1;
      return ((tileX * 17 + tileY * 31 + tileX * tileY) % 5) < 2 ? 0 : 1;
    });
    const blocked = caveTerrainPlaneCollisionBytes(elevations, width, height);
    for (let index = 0; index < elevations.length; index += 1) {
      if (elevations[index] === 1) expect(blocked[index]).toBe(1);
    }
  });

  it('keeps an ordinary side wall solid on both excavation and datum planes', () => {
    const width = 7;
    const height = 7;
    const stride = width * height;
    const elevations = new Uint8Array(stride).fill(1);
    for (let tileY = 1; tileY < height - 1; tileY += 1) {
      for (let tileX = 1; tileX <= 2; tileX += 1) elevations[tileY * width + tileX] = 0;
    }
    const blocked = caveTerrainPlaneCollisionBytes(elevations, width, height);
    const sideWall = 3 * width + 3;
    expect(elevations[sideWall]).toBe(1);
    expect(blocked[sideWall]).toBe(1);
    expect(blocked[stride + sideWall]).toBe(1);
    expect(blocked[3 * width + 4]).toBe(1);
  });

  it('projects both physical south-wall courses into the lower excavation', () => {
    const width = 7;
    const height = 7;
    const stride = width * height;
    const elevations = new Uint8Array(stride).fill(1);
    for (let tileY = 3; tileY < height; tileY += 1) {
      for (let tileX = 1; tileX < width - 1; tileX += 1) elevations[tileY * width + tileX] = 0;
    }
    const blocked = caveTerrainPlaneCollisionBytes(elevations, width, height);
    expect(caveProjectedRowsPerLevel()).toBe(2);
    expect(blocked[2 * width + 3]).toBe(1);
    expect(blocked[3 * width + 3]).toBe(1);
    expect(blocked[4 * width + 3]).toBe(1);
    expect(blocked[5 * width + 3]).toBe(0);
  });
});
