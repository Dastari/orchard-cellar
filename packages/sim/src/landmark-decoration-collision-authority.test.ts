import { describe, expect, it } from 'vitest';
import { bootstrapContentRegistry } from './content/bootstrap-registry.js';
import type {
  SpaceContentDefinition,
  SpaceDecorationCollisionProfile,
} from './content/world-definition.js';
import { TILE_SIZE_FIXED } from './state.js';
import {
  survivalDecorationBlocksTraversal,
  survivalDecorationObstacle,
  type SurvivalLandmarkRegistry,
} from './survival-world.js';

const bootstrap = bootstrapContentRegistry();
const anchor = { id: 1, kind: '', tileX: 100, tileY: 200, variant: 0, animationOffset: 0 };

const obstacleAt = (offsets: readonly [number, number, number, number]) => ({
  left: (anchor.tileX + offsets[0]) * TILE_SIZE_FIXED,
  top: (anchor.tileY + offsets[1]) * TILE_SIZE_FIXED,
  right: (anchor.tileX + offsets[2] + 1) * TILE_SIZE_FIXED - 1,
  bottom: (anchor.tileY + offsets[3] + 1) * TILE_SIZE_FIXED - 1,
});

describe('authored landmark decoration collision authority', () => {
  it('preserves every canonical ground and water collision profile', () => {
    const cases = [
      ['water', [0, 0, 0, 0], ['nature_water_rock']],
      ['water', [0, -1, 2, 1], ['fisher_dock']],
      ['ground', [-2, -2, 2, -1], ['farm_house', 'fisher_hut']],
      ['ground', [-1, 0, 1, 0], ['farm_hay_stack', 'farm_fallen_log']],
      ['ground', [-1, -2, 1, -1], ['camp_tent']],
      ['ground', [-1, -2, 1, 0], ['camp_pond']],
      ['ground', [0, 0, 0, 0], [
        'camp_campfire', 'camp_round_stool', 'camp_bench', 'camp_stump_seat',
        'camp_chair', 'camp_rock', 'farm_fence', 'farm_hay_bale', 'farm_grave',
        'farm_tree_oak', 'farm_stump',
      ]],
    ] as const;
    for (const [medium, offsets, kinds] of cases) for (const kind of kinds) {
      const decoration = { ...anchor, kind };
      expect(survivalDecorationBlocksTraversal(kind, medium, bootstrap)).toBe(true);
      expect(survivalDecorationObstacle(decoration, medium, bootstrap)).toEqual(obstacleAt(offsets));
    }
    expect(survivalDecorationObstacle({ ...anchor, kind: 'fisher_dock' }, 'ground', bootstrap)).toBeNull();
    expect(survivalDecorationObstacle({ ...anchor, kind: 'camp_tent' }, 'water', bootstrap)).toBeNull();
    expect(survivalDecorationObstacle({ ...anchor, kind: 'camp_tent' }, 'air', bootstrap)).toBeNull();
  });

  it('retains geometry under arbitrary space and decoration-kind renames', () => {
    const island = [...bootstrap.spaces.values()].find((space) => space.generator === 'island')!;
    const renamedKind = 'canvas_shelter_renamed';
    const renamed = {
      ...island,
      id: 'space:collision_authority_renamed',
      spaceId: 9_001,
      decorationCollision: (island.decorationCollision ?? []).map((profile) => (
        profile.map((field, index) => index >= 5 && field === 'camp_tent' ? renamedKind : field)
      )) as unknown as readonly SpaceDecorationCollisionProfile[],
    } satisfies SpaceContentDefinition;
    const registry: SurvivalLandmarkRegistry = {
      spaces: new Map<string, SpaceContentDefinition>([[renamed.id, renamed]]),
    };

    expect(survivalDecorationObstacle({ ...anchor, kind: renamedKind }, 'ground', registry))
      .toEqual(obstacleAt([-1, -2, 1, -1]));
    expect(survivalDecorationObstacle({ ...anchor, kind: 'camp_tent' }, 'ground', registry)).toBeNull();
  });

  it('fails neutral for missing, retired, and ambiguous authored mappings', () => {
    const island = [...bootstrap.spaces.values()].find((space) => space.generator === 'island')!;
    const profile = [1, 0, 0, 0, 0, 'ambiguous_prop'] as const;
    const first = {
      ...island,
      id: 'space:collision_authority_first',
      spaceId: 9_002,
      decorationCollision: [profile],
    } satisfies SpaceContentDefinition;
    const second = {
      ...island,
      id: 'space:collision_authority_second',
      spaceId: 9_003,
      decorationCollision: [profile],
    } satisfies SpaceContentDefinition;
    const decoration = { ...anchor, kind: 'ambiguous_prop' };

    expect(survivalDecorationObstacle(decoration, 'ground', { spaces: new Map() })).toBeNull();
    expect(survivalDecorationObstacle(decoration, 'ground', {
      spaces: new Map<string, SpaceContentDefinition>([[first.id, { ...first, retired: true }]]),
    })).toBeNull();
    expect(survivalDecorationObstacle(decoration, 'ground', {
      spaces: new Map<string, SpaceContentDefinition>([[first.id, first], [second.id, second]]),
    })).toBeNull();
  });
});
