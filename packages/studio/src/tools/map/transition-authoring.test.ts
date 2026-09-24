import { createEmptyMapDocument, migrateMapDocumentV2 } from '@orchard/sim';
import { describe, expect, it } from 'vitest';
import type { TerrainArray } from '@orchard/engine/terrain';
import {
  clampMapEditorTransitionPoint,
  planMapEditorTransition,
} from './transition-authoring.js';

function fixture(width = 8, height = 8) {
  return migrateMapDocumentV2(createEmptyMapDocument({ id: 'transitions', title: 'Transitions', width, height }));
}

function terrain(width = 8, height = 8, entries: readonly [number, number, number][] = []): TerrainArray {
  const elevations = new Int16Array(width * height);
  for (const [x, y, elevation] of entries) elevations[y * width + x] = elevation;
  return {
    spaceId: 4_200_001, seed: 1, version: 0, width, height, generator: 'debug_flat',
    defaultCliffFamily: 'stone_1', defaultSurfaceFamily: 'grass_1',
    biomes: new Uint8Array(0), blocked: [], horseJumpableTerrain: [], elevations,
    raisedTerrainCollisionClassified: true, dirtCliffRoles: new Uint8Array(0), dirtTerraces: new Uint8Array(0),
  };
}

/** A straight cliff: level `level` on rows y0..y1 across the whole map width. */
function plateau(width: number, y0: number, y1: number, level = 1): [number, number, number][] {
  const entries: [number, number, number][] = [];
  for (let y = y0; y <= y1; y += 1) for (let x = 0; x < width; x += 1) entries.push([x, y, level]);
  return entries;
}

describe('map transition authoring plan', () => {
  it('authors a complete two-lane slope in gameplay direction', () => {
    const document = fixture();
    const plan = planMapEditorTransition(document, { tileX: 2, tileY: 4 }, { tileX: 2, tileY: 3 },
      'slope', 2, terrain(8, 8, plateau(8, 1, 3)));
    expect(plan.error).toBeNull();
    expect(plan.direction).toBe('up');
    expect(plan.command).toEqual({ kind: 'add_transitions', transitions: [
      { contourLevel: 1, kind: 'slope', direction: 'up', lowerTileX: 2, lowerTileY: 4,
        upperTileX: 2, upperTileY: 3 },
      { contourLevel: 1, kind: 'slope', direction: 'up', lowerTileX: 3, lowerTileY: 4,
        upperTileX: 3, upperTileY: 3 },
    ] });
  });

  it('previews a multi-course stair run but refuses missing dedicated stair art', () => {
    const document = fixture();
    const validTerrain = terrain(8, 8, [
      [2, 3, 1], [3, 3, 1],
      [2, 2, 2], [3, 2, 2],
    ]);
    const plan = planMapEditorTransition(document, { tileX: 2, tileY: 4 }, { tileX: 2, tileY: 2 },
      'stairs', 2, validTerrain);
    expect(plan.error).toBe('transition_stair_art_unavailable');
    expect(plan.transitions).toHaveLength(4);
    expect(plan.command).toBeNull();

    const invalidLane = terrain(8, 8, [[2, 3, 1], [3, 3, 1], [2, 2, 2]]);
    expect(planMapEditorTransition(document, { tileX: 2, tileY: 4 }, { tileX: 2, tileY: 2 },
      'stairs', 2, invalidLane).error).toBe('transition_endpoint_height_mismatch');
  });

  it('previews ladders but refuses absent traversal authority and directional art', () => {
    const document = fixture();
    const elevations = terrain(8, 8, [[4, 3, 1]]);
    const valid = planMapEditorTransition(document, { tileX: 4, tileY: 4 }, { tileX: 4, tileY: 3 },
      'ladder', 4, elevations);
    expect(valid.error).toBe('transition_ladder_runtime_unavailable');
    expect(valid.command).toBeNull();
    expect(valid.transitions).toEqual([{
      contourLevel: 1, kind: 'ladder', direction: 'up',
      lowerTileX: 4, lowerTileY: 4, upperTileX: 4, upperTileY: 3,
    }]);

    const nonAdjacent = terrain(8, 8, [[4, 2, 2]]);
    expect(planMapEditorTransition(document, { tileX: 4, tileY: 4 }, { tileX: 4, tileY: 2 },
      'ladder', 2, nonAdjacent).error).toBe('transition_path_length_mismatch');
  });

  it('refuses directions for which gameplay has no authored transition art', () => {
    const document = fixture();
    expect(planMapEditorTransition(document, { tileX: 4, tileY: 4 }, { tileX: 5, tileY: 4 },
      'slope', 2, terrain(8, 8, [[5, 4, 1], [5, 5, 1]])).error)
      .toBe('transition_direction_art_unavailable');
  });

  it('refuses north slopes when the selected cliff family has no ramp bank', () => {
    const document = { ...fixture(), defaultCliffFamily: 'cave' };
    expect(planMapEditorTransition(document, { tileX: 2, tileY: 4 }, { tileX: 2, tileY: 3 },
      'slope', 2, terrain(8, 8, [[2, 3, 1], [3, 3, 1]])).error)
      .toBe('transition_family_art_unavailable');
  });

  it('rejects diagonal, same-height, and mismatched-length gestures', () => {
    const document = fixture();
    expect(planMapEditorTransition(document, { tileX: 1, tileY: 1 }, { tileX: 2, tileY: 2 },
      'slope', 2).error).toBe('transition_not_cardinal');
    expect(planMapEditorTransition(document, { tileX: 1, tileY: 1 }, { tileX: 1, tileY: 2 },
      'slope', 2).error).toBe('transition_same_elevation');
    expect(planMapEditorTransition(document, { tileX: 1, tileY: 3 }, { tileX: 1, tileY: 1 },
      'stairs', 2, terrain(8, 8, [[1, 1, 1]])).error).toBe('transition_path_length_mismatch');
  });

  it('clamps captured endpoints and shifts a wide bank inside finite bounds', () => {
    const document = fixture(5, 5);
    expect(clampMapEditorTransitionPoint(document, { tileX: -20, tileY: 99 }))
      .toEqual({ tileX: 0, tileY: 4 });
    const elevations = terrain(5, 5, [[2, 1, 1], [3, 1, 1], [4, 1, 1]]);
    const plan = planMapEditorTransition(document, { tileX: 4, tileY: 2 }, { tileX: 4, tileY: 1 },
      'slope', 3, elevations);
    // Clamped to the map edge, the bank has no cliff beside it on the east.
    expect(plan.error).toBe('transition_stair_off_straight_cliff');
    expect(plan.from.tileX).toBe(2);
    expect(plan.to.tileX).toBe(2);
    expect(plan.transitions.map(({ lowerTileX }) => lowerTileX)).toEqual([2, 3, 4]);
  });

  it('refuses slopes and stairs beside a corner, a cliff end or free-standing (owner rule)', () => {
    const document = fixture(10, 8);
    // Plateau x1-8, rows 1-3: a straight edge at x3-4, a corner beside x6-7, the end at x7-8.
    const edge = terrain(10, 8, plateau(10, 1, 3).filter(([x]) => x >= 1 && x <= 8));
    const at = (x: number) => planMapEditorTransition(document, { tileX: x, tileY: 4 }, { tileX: x, tileY: 3 }, 'slope', 2, edge).error;
    expect(at(3)).toBeNull();
    expect(at(6)).toBe('transition_stair_off_straight_cliff');
    expect(at(7)).toBe('transition_stair_off_straight_cliff');
    expect(planMapEditorTransition(document, { tileX: 2, tileY: 4 }, { tileX: 2, tileY: 3 },
      'slope', 2, terrain(10, 8, [[2, 3, 1], [3, 3, 1]])).error).toBe('transition_stair_off_straight_cliff');
  });

  it('refuses a bank wider than the finite lateral dimension', () => {
    const document = fixture(2, 5);
    expect(planMapEditorTransition(document, { tileX: 0, tileY: 2 }, { tileX: 0, tileY: 1 },
      'slope', 3, terrain(2, 5, [[0, 1, 1]])).error).toBe('transition_width_exceeds_map');
  });
});
