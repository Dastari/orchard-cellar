import { describe, expect, it } from 'vitest';
import type { TerrainOverride } from '../map-document.js';
import { runtimeTilesetResolver, bootstrapTilesetDefinitions } from './tileset-registry.js';
import {
  exactTerrainOverrideFramesForRole,
  validateExactTerrainOverride,
} from './terrain-override-validation.js';

const resolver = runtimeTilesetResolver(bootstrapTilesetDefinitions());
const stone = resolver.tileSetFor('stone_1')!;

function validate(
  override: TerrainOverride,
  family = 'stone_1',
  role: Parameters<typeof validateExactTerrainOverride>[3] = override.role ?? null,
) {
  return validateExactTerrainOverride(override, family, resolver.tileSetFor(family), role);
}

describe('exact terrain override validation', () => {
  it('accepts only exact registered edge, inset, ramp, and face frames', () => {
    const edgeFrame = stone.edgeFrames.top!;
    expect(validate({ contourLevel: 1, role: 'top', frameIndex: edgeFrame })).toEqual([]);
    expect(validate({ contourLevel: 1, role: 'top', frameIndex: edgeFrame + 10_000 }))
      .toContainEqual(expect.objectContaining({ code: 'terrain_override_frame_incompatible' }));

    const faceRole = 'face.lower_wall.middle' as const;
    const faceFrames = exactTerrainOverrideFramesForRole(stone, faceRole)!;
    expect(faceFrames.length).toBeGreaterThan(0);
    expect(validate({ contourLevel: 1, role: faceRole, frameIndex: faceFrames[0]! })).toEqual([]);
    expect(validate({ contourLevel: 1, role: faceRole }))
      .toContainEqual(expect.objectContaining({ code: 'terrain_override_frame_invalid' }));
  });

  it('rejects missing roles, meaningless overrides, and reserved families', () => {
    expect(validate({ contourLevel: 1 }))
      .toContainEqual(expect.objectContaining({ code: 'terrain_override_empty' }));
    expect(validate(
      { contourLevel: 1, role: 'face.not_authored.left', frameIndex: 0 },
      'stone_1',
      'face.not_authored.left',
    )).toContainEqual(expect.objectContaining({ code: 'terrain_override_role_invalid' }));
    expect(validateExactTerrainOverride(
      { contourLevel: 1, role: 'top', frameIndex: 0 },
      'snow',
      stone,
      'top',
    )).toContainEqual(expect.objectContaining({ code: 'terrain_override_family_unavailable' }));
  });

  it('rejects negative, fractional, and unsafe frame numbers', () => {
    for (const frameIndex of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(validate({ contourLevel: 1, role: 'top', frameIndex }))
        .toContainEqual(expect.objectContaining({ code: 'terrain_override_frame_invalid' }));
    }
  });
});
