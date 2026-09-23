import { expect, it } from 'vitest';
import { type LightOcclusionMap, rasterizeLightOcclusion, type LightTrunkOccluder } from './light-occlusion.js';
import { celestialCastersFromOcclusion } from './world-lighting-renderer.js';
import { LightCoordinateMapper } from './light-coordinate-mapper.js';
import type { TerrainArray } from './terrain.js';
import { FIXED_UNITS_PER_PIXEL as U } from '@orchard/sim';
const caster: LightTrunkOccluder = { footX: 8, footY: 12, shadowMode: 'silhouette',
  obstacle: { left: 7 * U, right: 9 * U, top: 10 * U, bottom: 12 * U },
  receiver: { left: 7, top: 8, width: 2, height: 4, opaque: new Uint8Array(8).fill(1) } };
it('keeps a celestial caster when local occlusion is disabled, and vice versa', () => {
  const terrain = { width: 20, height: 20, baseDatum: 0 } as TerrainArray;
  const mapper = new LightCoordinateMapper(terrain);
  const base = { width: 20, height: 20, hardBlocked: new Uint8Array(400), frontFaces: new Uint8Array(400), softObstacles: [], spriteOccluders: [] };
  const lightOnly: LightOcclusionMap = { ...base, trunkOccluders: [{ ...caster, shadowMode: 'none' }] };
  const shadowOnly: LightOcclusionMap = { ...base, trunkOccluders: [{ ...caster, occludesLocalLight: false }] };
  expect(celestialCastersFromOcclusion(lightOnly, mapper, 0, 0, 20, 20)).toHaveLength(0);
  expect(celestialCastersFromOcclusion(shadowOnly, mapper, 0, 0, 20, 20)).toHaveLength(1);
  const local = new Uint8Array(400), transparent = new Uint8Array(400);
  rasterizeLightOcclusion(local, 20, 20, 0, 0, 16, lightOnly);
  rasterizeLightOcclusion(transparent, 20, 20, 0, 0, 16, shadowOnly);
  expect(local.some(value => value !== 0)).toBe(true);
  expect(transparent.some(value => value !== 0)).toBe(false);
});
