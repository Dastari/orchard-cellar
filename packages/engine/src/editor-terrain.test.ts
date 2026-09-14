import { describe, expect, it } from 'vitest';
import {
  SURVIVAL_BIOMES,
  applyMapDocumentV3Edit,
  createEmptyMapDocument,
  createTerrainLabDocument,
  migrateMapDocumentV2,
  terrainDocumentForMapV3,
} from '@orchard/sim';
import {
  authoredTransitionArtRefusal,
  terrainArrayForMapDocument,
} from './editor-terrain.js';
import { terrainElevationAt, terrainPlaneCollisionCellAt } from './terrain.js';

describe('editor runtime terrain adapter', () => {
  it('uses the shared exact transition capability for editor refusals', () => {
    expect(authoredTransitionArtRefusal({
      kind: 'slope', direction: 'up', familyId: 'stone_1', width: 2,
    })).toBeNull();
    expect(authoredTransitionArtRefusal({
      kind: 'slope', direction: null, familyId: 'stone_1', width: 2,
    })).toBeNull();
    expect(authoredTransitionArtRefusal({
      kind: 'slope', direction: 'right', familyId: 'stone_1', width: 2,
    })).toMatchObject({ supported: false, code: 'transition_direction_art_unavailable' });
    expect(authoredTransitionArtRefusal({
      kind: 'slope', direction: 'up', familyId: 'cave', width: 2,
    })).toMatchObject({ supported: false, code: 'transition_family_art_unavailable' });
    expect(authoredTransitionArtRefusal({
      kind: 'stairs', direction: 'up', familyId: 'stone_1', width: 2,
    })).toMatchObject({ supported: false, code: 'transition_stair_art_unavailable' });
    expect(authoredTransitionArtRefusal({
      kind: 'ladder', direction: 'up', familyId: 'cave', width: 1,
    })).toMatchObject({ supported: false, code: 'transition_ladder_runtime_unavailable' });
  });

  it('feeds the shared renderer and plane collision from absolute map height', () => {
    const terrain = terrainArrayForMapDocument(createTerrainLabDocument());
    expect(terrainElevationAt(terrain, 20, 27)).toBe(5);
    expect(terrainElevationAt(terrain, 60, 27)).toBe(-3);
    expect(terrainPlaneCollisionCellAt(terrain, 20, 27, 3)).toBe('blocked');
    expect(terrainPlaneCollisionCellAt(terrain, 20, 27, 5)).toBe('open');
  });

  it('carries explicitly painted semantic biomes into the production terrain array', () => {
    const base = migrateMapDocumentV2(createEmptyMapDocument({
      id: 'biome-preview', title: 'Biome Preview', width: 4, height: 4,
    }));
    const document = applyMapDocumentV3Edit(base, {
      kind: 'paint_biome', points: [{ tileX: 2, tileY: 1 }], biome: 'forest',
    }).document;
    const terrain = terrainArrayForMapDocument(
      terrainDocumentForMapV3(document),
      undefined,
      document,
    );
    expect(terrain.biomes[1 * document.width + 2]).toBe(SURVIVAL_BIOMES.indexOf('forest'));
  });

  it('carries authored farmland as a sparse visual-only terrain mask', () => {
    const base = migrateMapDocumentV2(createEmptyMapDocument({
      id: 'farmland-preview', title: 'Farmland Preview', width: 4, height: 4,
    }));
    const document = applyMapDocumentV3Edit(base, {
      kind: 'terrain',
      command: {
        kind: 'paint',
        points: [{ tileX: 2, tileY: 1 }],
        patch: { surface: 'dirt', feature: 'farmland' },
      },
    }).document;
    const terrain = terrainArrayForMapDocument(
      terrainDocumentForMapV3(document),
      undefined,
      document,
    );

    expect(terrain.authoredFarmland).toBeInstanceOf(Uint8Array);
    expect(terrain.authoredFarmland?.[1 * document.width + 2]).toBe(1);
    expect(terrain.authoredFarmland?.[1 * document.width + 1]).toBe(0);
    expect(terrain.dirtTerraces[1 * document.width + 2]).toBe(1);
  });

  it('can omit gameplay collision-plane expansion for visual-only editor renders', () => {
    const document = createTerrainLabDocument();
    const gameplay = terrainArrayForMapDocument(document);
    const visual = terrainArrayForMapDocument(
      document,
      undefined,
      undefined,
      { includeTerrainPlaneCollision: false },
    );

    expect(gameplay.terrainPlaneBlocked).toBeInstanceOf(Uint8Array);
    expect(visual.terrainPlaneBlocked).toBeUndefined();
    expect(visual.elevations).toEqual(gameplay.elevations);
    expect(visual.terrainTransitions).toEqual(gameplay.terrainTransitions);
    expect(visual.terrainOverrides).toEqual(gameplay.terrainOverrides);
  });
});
