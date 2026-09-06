import { describe, expect, it } from 'vitest';
import { BOOTSTRAP_SPACE_DEFINITIONS } from './content/bootstrap-spaces.js';
import { parseSpaceContentDefinition } from './content/world-definition.js';
import { createSurvivalAuthoredLandmarkInstances } from './map-document-v3.js';
import { generateSurvivalLandmarkDecorations, survivalAuthoredLandmarkDecorations } from './survival-world.js';

function authoredSpace(layer: unknown) {
  return {
    ...BOOTSTRAP_SPACE_DEFINITIONS.find(({ id }) => id === 'space:island')!,
    landmarks: [{
      id: 'moonlit_orchard', label: 'Moonlit Orchard', runtimeIdBase: '8000000000',
      bounds: { minimumTileX: 2, maximumTileX: 8, minimumTileY: 2, maximumTileY: 8 },
      decorations: [
        { kind: 'point', decorationKind: 'camp_flowers', tileX: 3, tileY: 3, idOffset: 10, layer },
        { kind: 'fill_rectangle', decorationKind: 'camp_flowers', startTileX: 4, startTileY: 4,
          width: 2, height: 2, animationOffsetX: 3, animationOffsetY: 7, layer: 'ground' },
        { kind: 'fence_rectangle', decorationKind: 'farm_fence', gateKind: 'farm_gate',
          bounds: { minimumTileX: 5, maximumTileX: 7, minimumTileY: 5, maximumTileY: 7 },
          gateTileX: 6, gateTileY: 7, layer: 'gameplay' },
      ],
    }],
  };
}

describe('authored landmark rules', () => {
  it('expands a new authored group with stable ids, fence joins and explicit presentation layers', () => {
    const space = parseSpaceContentDefinition(authoredSpace('canopy'));
    const rows = generateSurvivalLandmarkDecorations(space.landmarks!);
    expect(rows).toHaveLength(13);
    expect(rows.every(({ groupId, groupLabel }) => groupId === 'moonlit_orchard'
      && groupLabel === 'Moonlit Orchard')).toBe(true);
    expect(rows.map(({ id }) => id)).toEqual(Array.from({ length: 13 }, (_, index) => 8_000_000_010 + index));
    expect(rows[0]).toMatchObject({ kind: 'camp_flowers', layer: 'canopy', tileX: 3, tileY: 3 });
    expect(rows.slice(1, 5).map(({ tileX, tileY, animationOffset, layer }) => [tileX, tileY, animationOffset, layer]))
      .toEqual([[4, 4, 0, 'ground'], [5, 4, 3, 'ground'], [4, 5, 7, 'ground'], [5, 5, 10, 'ground']]);
    expect(rows.slice(5).map(({ tileX, tileY, variant, layer }) => [tileX, tileY, variant, layer]))
      .toEqual([[5, 5, 6, 'gameplay'], [5, 7, 3, 'gameplay'], [6, 5, 10, 'gameplay'],
        [7, 5, 12, 'gameplay'], [7, 7, 9, 'gameplay'], [5, 6, 5, 'gameplay'],
        [7, 6, 5, 'gameplay'], [6, 7, 10, 'gameplay']]);
    expect(rows.at(-1)?.kind).toBe('farm_gate');
  });

  it('preserves authored layers through map materialization and rejects unknown layer values', () => {
    const decorations = survivalAuthoredLandmarkDecorations();
    const instances = createSurvivalAuthoredLandmarkInstances();
    expect(new Set(decorations.map(({ layer }) => layer))).toEqual(new Set(['ground', 'objects', 'canopy']));
    for (const decoration of decorations) {
      expect(instances.find(({ sourceDecorationId }) => sourceDecorationId === decoration.id)?.layer)
        .toBe(decoration.layer);
    }
    expect(() => parseSpaceContentDefinition(authoredSpace('invented'))).toThrow('layer');
    const legacy = parseSpaceContentDefinition(authoredSpace(undefined));
    expect(legacy.landmarks?.[0]?.decorations[0]).not.toHaveProperty('layer');
  });
});
