import { describe, expect, it } from 'vitest';
import { createTerrainLabDocument } from '@orchard/sim';
import { terrainArrayForMapDocument } from './editor-terrain.js';
import { terrainElevationAt, terrainPlaneCollisionCellAt } from '../render/terrain.js';

describe('editor runtime terrain adapter', () => {
  it('feeds the shared renderer and plane collision from absolute map height', () => {
    const terrain = terrainArrayForMapDocument(createTerrainLabDocument());
    expect(terrainElevationAt(terrain, 20, 27)).toBe(6);
    expect(terrainElevationAt(terrain, 60, 27)).toBe(0);
    expect(terrainPlaneCollisionCellAt(terrain, 20, 27, 3)).toBe('blocked');
    expect(terrainPlaneCollisionCellAt(terrain, 20, 27, 6)).toBe('open');
  });
});
