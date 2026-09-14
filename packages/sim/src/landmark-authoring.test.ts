import { describe, expect, it } from 'vitest';
import { BOOTSTRAP_SPACE_DEFINITIONS } from './content/bootstrap-spaces.js';
import { bootstrapContentRegistry } from './content/bootstrap-registry.js';
import { parseSpaceContentDefinition } from './content/world-definition.js';
import {
  createLiveIslandMapDocument,
  createSurvivalAuthoredLandmarkInstances,
  parseMapDocumentV3,
  serializeMapDocumentV3,
} from './map-document-v3.js';
import {
  activeSurvivalLandmarks,
  generateMarlowCampPathTiles,
  generateSurvivalLandmarkDecorations,
  generateSurvivalLandmarkPathTiles,
  generateSurvivalLandmarkRoleDecorations,
  isSurvivalAuthoredLandmarkDecoration,
  survivalAuthoredLandmarkDecorations,
  survivalLandmarkRoleReservedAt,
  survivalLandmarksForRole,
} from './survival-world.js';

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
  it('loads the full registry without recursively constructing it through survival landmarks', () => {
    const registry = bootstrapContentRegistry();
    const island = [...registry.spaces.values()].find(({ generator }) => generator === 'island');
    expect(island?.landmarks).toHaveLength(3);
    expect(survivalAuthoredLandmarkDecorations()).not.toHaveLength(0);
  });

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

  it('projects watered soil by authored role independently of landmark and decoration identity', () => {
    const original = authoredSpace('ground');
    const source = {
      ...original,
      landmarks: [{
        ...original.landmarks[0]!,
        id: 'renamed_water_garden',
        decorations: [{
          kind: 'fill_rectangle',
          decorationKind: 'moonlit_crop_canvas',
          startTileX: 3,
          startTileY: 3,
          width: 2,
          height: 1,
          role: 'soil.watered',
        }],
      }],
    };
    const space = parseSpaceContentDefinition(source);
    const rows = generateSurvivalLandmarkDecorations(space.landmarks!);
    expect(rows).toEqual([
      expect.objectContaining({ groupId: 'renamed_water_garden', kind: 'moonlit_crop_canvas', role: 'soil.watered' }),
      expect.objectContaining({ groupId: 'renamed_water_garden', kind: 'moonlit_crop_canvas', role: 'soil.watered' }),
    ]);
    expect(createSurvivalAuthoredLandmarkInstances(space.landmarks!))
      .toEqual(rows.map((row) => expect.objectContaining({ sourceDecorationId: row.id, role: 'soil.watered' })));
    expect(() => parseSpaceContentDefinition({
      ...source,
      landmarks: [{
        ...source.landmarks[0]!,
        decorations: [{ ...source.landmarks[0]!.decorations[0]!, role: 'soil.flooded' }],
      }],
    })).toThrow('role');
  });

  it('projects renamed active-registry landmarks by semantic role', () => {
    const island = BOOTSTRAP_SPACE_DEFINITIONS.find(({ generator }) => generator === 'island')!;
    const renamed = parseSpaceContentDefinition({
      ...island,
      id: 'space:orchard_after_dark',
      landmarks: (island.landmarks ?? []).map((landmark) => {
        const roles = landmark.decorations.flatMap((rule) => (
          rule.kind === 'point' ? rule.roles ?? [] : []
        ));
        return {
          ...landmark,
          id: roles.includes('automated_campfire') ? 'travellers_rest'
            : roles.includes('wildlife_feed') ? 'moonlit_pasture'
              : `renamed_${landmark.id}`,
          label: `Renamed ${landmark.label}`,
        };
      }),
    });
    const landmarks = activeSurvivalLandmarks({
      spaces: new Map([[renamed.id, renamed]]),
    }, island.spaceId);
    expect(landmarks.map(({ id }) => id)).toEqual([
      'travellers_rest', 'moonlit_pasture', 'renamed_fisherman_fin_camp',
    ]);

    const camp = survivalLandmarksForRole(landmarks, 'automated_campfire');
    const pasture = survivalLandmarksForRole(landmarks, 'wildlife_feed');
    expect(camp.map(({ id }) => id)).toEqual(['travellers_rest']);
    expect(pasture.map(({ id }) => id)).toEqual(['moonlit_pasture']);
    expect(survivalLandmarkRoleReservedAt(
      landmarks, 'automated_campfire', camp[0]!.bounds.minimumTileX, camp[0]!.bounds.minimumTileY,
    )).toBe(true);
    expect(survivalLandmarkRoleReservedAt(
      landmarks, 'automated_campfire', camp[0]!.bounds.minimumTileX - 1, camp[0]!.bounds.minimumTileY,
    )).toBe(false);

    expect(generateSurvivalLandmarkPathTiles(landmarks, 'automated_campfire'))
      .toEqual(generateMarlowCampPathTiles());
    const pastureDecorations = generateSurvivalLandmarkRoleDecorations(landmarks, 'wildlife_feed');
    expect(pastureDecorations).not.toHaveLength(0);
    expect(pastureDecorations.every(({ groupId }) => groupId === 'moonlit_pasture')).toBe(true);

    const instances = createSurvivalAuthoredLandmarkInstances(landmarks);
    expect(new Set(instances.map(({ groupId }) => groupId))).toEqual(new Set([
      'travellers_rest', 'moonlit_pasture', 'renamed_fisherman_fin_camp',
    ]));
    expect(instances.map(({ sourceDecorationId, tileX, tileY, kind }) => (
      { sourceDecorationId, tileX, tileY, kind }
    ))).toEqual(createSurvivalAuthoredLandmarkInstances().map(({
      sourceDecorationId, tileX, tileY, kind,
    }) => ({ sourceDecorationId, tileX, tileY, kind })));
    expect(instances.every((instance) => isSurvivalAuthoredLandmarkDecoration({
      id: instance.sourceDecorationId,
    }, landmarks))).toBe(true);

    const hidden = instances.find(({ groupId }) => groupId === 'travellers_rest')!;
    const legacy = JSON.parse(serializeMapDocumentV3(createLiveIslandMapDocument({ landmarks }))) as Record<string, unknown>;
    delete legacy['landmarks'];
    legacy['generatedSuppressions'] = [`decoration-${hidden.sourceDecorationId}`];
    const upgraded = parseMapDocumentV3(JSON.stringify(legacy), landmarks);
    expect(upgraded.landmarks.find(({ id }) => id === hidden.id)?.enabled).toBe(false);
    expect(upgraded.generatedSuppressions).not.toContain(`decoration-${hidden.sourceDecorationId}`);
  });
});
