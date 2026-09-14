import { describe, expect, it, vi } from 'vitest';
import { FIXED_UNITS_PER_PIXEL } from '@orchard/sim';
import type { TerrainArray } from '@orchard/engine/terrain';
import type { LightOcclusionMap } from '@orchard/engine/light-occlusion';
import { celestialLightingAtCalendar } from '@orchard/engine/celestial-lighting';
import { TileLightmap } from '@orchard/engine/lighting';
import { lightingOwner } from '@orchard/engine/world-lighting-renderer';
import { GameplayCelestialPass } from './gameplay-celestial-pass.js';

describe('gameplay static and moving celestial orchestration', () => {
  it('retains numeric static identity and owner membership through 600 actor updates', () => {
    const terrain = { width: 20, height: 20, baseDatum: 0 } as TerrainArray;
    const occlusion = { trunkOccluders: [{ footX: 64, footY: 96, elevationLayer: 0,
      obstacle: { left: 60 * FIXED_UNITS_PER_PIXEL, right: 68 * FIXED_UNITS_PER_PIXEL, top: 0, bottom: 0 },
      receiver: { left: 63, top: 93, width: 2, height: 4, opaque: new Uint8Array([1, 1, 1, 1, 1, 1, 0, 0]) },
    }] } as unknown as LightOcclusionMap;
    const sky = celestialLightingAtCalendar({ clockHours: 12, continuousDay: 3.5, lunarProgress: 0, lunarIllumination: 1 });
    const local = new TileLightmap(), pass = new GameplayCelestialPass();
    pass.prepare(terrain, occlusion, [], sky, local, 0, 0, 100, 100, 0, 'legacy', false);
    const begin = vi.spyOn(pass.renderer!, 'begin');
    const moving = { owner: lightingOwner(90, 90), worldX: 90, worldY: 90, baseHeightSubunits: 0,
      heightSubunits: 4, footprint: { left: -3, right: 3, top: -2, bottom: 1 }, contact: true };
    for (let frame = 0; frame < 600; frame++) pass.prepare(terrain, occlusion,
      [{ ...moving, worldX: 90 + frame / 1000 }, { ...moving, owner: lightingOwner(64, 96) }],
      sky, local, frame / 10, 0, 100, 100, 0, 'legacy', false);
    const first = begin.mock.calls[0]!;
    for (const call of begin.mock.calls) {
      expect(call[1]).toBe(first[1]); expect(call[2]).toBe(first[2]); expect(call[8]).toBe(first[8]);
      expect(typeof call[8]).toBe('number');
    }
    expect(first[1]).toHaveLength(1); expect(first[2]).toHaveLength(1);
    expect(first[2][0]!.worldX).toBe(90.599);
    pass.prepare(terrain, occlusion, [moving], sky, local, 128, 0, 100, 100, 0, 'legacy', false);
    expect(begin.mock.calls.at(-1)![1]).not.toBe(first[1]); expect(begin.mock.calls.at(-1)![8]).not.toBe(first[8]);
    pass.prepare(terrain, occlusion, [moving], sky, local, 128, 0, 100, 100, 0, 'legacy', true);
    expect(begin.mock.calls.at(-1)![1]).toHaveLength(0); expect(begin.mock.calls.at(-1)![2]).toHaveLength(0);
    pass.resetRenderer(); pass.clearStatic(); expect(pass.renderer).toBeNull();
  });
});
