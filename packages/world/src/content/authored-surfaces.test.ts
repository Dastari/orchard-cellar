import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { SpaceContentDefinition } from '@orchard/sim';
import { authoredSurfacePlans } from './authored-surfaces.js';

describe('authored static surface projection', () => {
  it('materializes an arbitrarily named landmark space without an id branch', () => {
    const space: SpaceContentDefinition = {
      id: 'space:harbour_archive',
      kind: 'space',
      schemaVersion: 1,
      spaceId: 61_000,
      name: 'harbour_archive',
      sizeTiles: 32,
      generator: 'debug_flat',
      environment: 'indoor',
      ambient: { r: 20, g: 30, b: 40 },
      weather: false,
      audioBed: 'homestead',
      surfaces: [{
        id: '4990000100', kind: 'writing_desk', tileX: 18, tileY: 7,
        capacity: 3, footprint: [-1, 0, 1, 0],
      }],
    };
    expect(authoredSurfacePlans([space], 16)).toEqual([{
      id: 4_990_000_100n,
      kind: 'writing_desk',
      tileX: 18,
      tileY: 7,
      chunkX: 1,
      chunkY: 0,
      capacity: 3,
      spaceId: 61_000,
    }]);
    expect(authoredSurfacePlans([{ ...space, retired: true }], 16)).toEqual([]);
  });

  it('does not restore exact surface-kind collision branches', () => {
    const world = readFileSync(new URL('../index.ts', import.meta.url), 'utf8');
    expect(world).not.toContain("surface.kind === 'wooden_table'");
    expect(world).toContain('runtimeSpaceSurfaceObstacle(contentRegistry(ctx), surface)');
    expect(world).toContain('runtimeSpaceSurfaceDefinition(contentRegistry(ctx), surface)');
  });
});
