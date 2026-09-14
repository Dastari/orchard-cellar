import {
  applyMapEdit,
  bootstrapTilesetDefinitions,
  compileMapDocument,
  createEmptyMapDocument,
  RESERVED_TILESET_FAMILIES,
  runtimeTilesetResolver,
  semanticTerrainTraceAt,
  TERRAIN_SURFACE_FAMILIES,
  TERRAIN_SURFACE_FAMILY_IDS,
  validateExactTerrainOverride,
  type TilesetContentDefinition,
} from '@orchard/sim';
import { describe, expect, it } from 'vitest';
import {
  exactTerrainOverrideChoicesAt,
  liveTerrainAuthoringPalette,
  terrainCliffFamilyChoices,
  terrainCliffFamilyExclusions,
  terrainFarmlandVisualChoices,
  terrainSurfaceFamilyChoices,
} from './terrain-authoring-palette.js';

function renamedTileset(
  source: TilesetContentDefinition,
  familyId: string,
  assetId = `tile_cf_${familyId}`,
): TilesetContentDefinition {
  const transition = (entry: TilesetContentDefinition['transitions']['ramp']) => entry.available
    ? { ...entry, assetId } : entry;
  return {
    ...source,
    id: `tileset:${familyId}`,
    familyId,
    roleFrames: source.roleFrames.map((entry) => ({ ...entry, assetId })),
    faceProfiles: source.faceProfiles.map((profile) => ({
      ...profile,
      rows: profile.rows.map((row) => ({ ...row, assetId })),
      repeatRows: profile.repeatRows.map((row) => ({ ...row, assetId })),
    })),
    transitions: {
      ramp: transition(source.transitions.ramp),
      stair: transition(source.transitions.stair),
      ladder: transition(source.transitions.ladder),
    },
    assetIds: [assetId],
  };
}

function raisedFixture() {
  const base = createEmptyMapDocument({
    id: 'terrain-palette', title: 'Terrain palette', width: 6, height: 6,
  });
  return applyMapEdit(base, {
    kind: 'paint',
    points: [
      { tileX: 2, tileY: 2 }, { tileX: 3, tileY: 2 },
      { tileX: 2, tileY: 3 }, { tileX: 3, tileY: 3 },
    ],
    patch: { elevation: 1 },
  }).document;
}

describe('terrain authoring palette data', () => {
  it('exposes all four registered grass families with real preview assets', () => {
    const choices = terrainSurfaceFamilyChoices();
    expect(choices.map(({ familyId }) => familyId)).toEqual(TERRAIN_SURFACE_FAMILY_IDS);
    for (const choice of choices) {
      const family = TERRAIN_SURFACE_FAMILIES[choice.familyId];
      expect(choice.preview).toEqual({ assetId: family.assetId, frameIndex: 0 });
      expect(choice.sheetAssetId).toBe(family.sheetAssetId);
    }
    expect(terrainSurfaceFamilyChoices('grass 3').map(({ familyId }) => familyId))
      .toEqual(['grass_3']);
    expect(terrainSurfaceFamilyChoices('middle 4').map(({ familyId }) => familyId))
      .toEqual(['grass_4']);
  });

  it('derives cliff choices only from publishable bootstrap definitions', () => {
    const definitions = bootstrapTilesetDefinitions();
    const choices = terrainCliffFamilyChoices();
    expect(choices.map(({ definitionId }) => definitionId))
      .toEqual(definitions.map(({ id }) => id));
    expect(choices.map(({ familyId }) => familyId)).not.toContain('snow');
    for (const choice of choices) {
      const definition = definitions.find(({ id }) => id === choice.definitionId)!;
      expect(definition.familyId).toBe(choice.familyId);
      expect(definition.assetIds).toContain(choice.preview.assetId);
      expect(Number.isSafeInteger(choice.preview.frameIndex)).toBe(true);
    }
    expect(terrainCliffFamilyChoices('volcanic interior').map(({ familyId }) => familyId))
      .toEqual(['volcanic_interior']);
  });

  it('explains every reserved family instead of presenting it as placeable art', () => {
    expect(terrainCliffFamilyExclusions()).toEqual(RESERVED_TILESET_FAMILIES);
    expect(terrainCliffFamilyExclusions()).toContainEqual({
      familyId: 'snow',
      reason: expect.stringMatching(/no snow cliff sheet/iu),
    });
  });

  it('searches the dry visual farmland choice by every term and states its runtime boundary', () => {
    expect(terrainFarmlandVisualChoices('farmland dry')).toEqual([
      {
        id: 'dry_farmland_visual',
        label: 'Farmland · Visual',
        warning: 'Dry appearance only; wet soil and crops remain runtime authority',
        preview: { assetId: 'tile_cf_farmland', frameIndex: 0 },
      },
    ]);
    expect(terrainFarmlandVisualChoices('wet authority')).toHaveLength(1);
    expect(terrainFarmlandVisualChoices('farmland harvestable')).toEqual([]);
  });

  it('offers no exact overrides for flat, surface-only, or out-of-bounds cells', () => {
    const document = createEmptyMapDocument({ id: 'flat', title: 'Flat', width: 3, height: 3 });
    expect(exactTerrainOverrideChoicesAt({ document, tileX: 1, tileY: 1 })).toEqual([]);
    expect(exactTerrainOverrideChoicesAt({ document, tileX: -1, tileY: 1 })).toEqual([]);
  });

  it('offers only topology roles and exact registered frames accepted by validation', () => {
    const document = raisedFixture();
    const definitions = bootstrapTilesetDefinitions();
    const resolver = runtimeTilesetResolver(definitions);
    const compiled = compileMapDocument(document, resolver);
    let candidateCount = 0;

    for (let tileY = 0; tileY < document.height; tileY += 1) {
      for (let tileX = 0; tileX < document.width; tileX += 1) {
        const choices = exactTerrainOverrideChoicesAt({ document, tileX, tileY });
        const traceRoles = new Set(semanticTerrainTraceAt(
          document, tileX, tileY, compiled, false,
        ).layers.map(({ role, contourLevel }) => `${role}:${contourLevel}`));
        for (const choice of choices) {
          candidateCount += 1;
          expect(traceRoles).toContain(`${choice.semanticRole}:${choice.contourLevel}`);
          expect(choice.semanticRole).not.toContain('override');
          const definition = definitions.find(({ id }) => id === choice.definitionId)!;
          expect(definition.familyId).toBe(choice.familyId);
          expect(definition.assetIds).toContain(choice.assetId);
          expect(choice.override).toEqual({
            contourLevel: choice.contourLevel,
            role: choice.role,
            family: choice.familyId,
            frameIndex: choice.frameIndex,
          });
          expect(validateExactTerrainOverride(
            choice.override,
            choice.familyId,
            resolver.tileSetFor(choice.familyId),
            choice.role,
          )).toEqual([]);
        }
      }
    }
    expect(candidateCount).toBeGreaterThan(0);
  });

  it('filters exact choices by bootstrap family and every search term', () => {
    const document = raisedFixture();
    const all = exactTerrainOverrideChoicesAt({ document, tileX: 2, tileY: 2 });
    expect(all.length).toBeGreaterThan(0);
    const selected = all[0]!;
    const byFamily = exactTerrainOverrideChoicesAt({
      document, tileX: 2, tileY: 2, familyId: selected.familyId,
    });
    expect(byFamily.length).toBeGreaterThan(0);
    expect(byFamily.every(({ familyId }) => familyId === selected.familyId)).toBe(true);
    const searched = exactTerrainOverrideChoicesAt({
      document,
      tileX: 2,
      tileY: 2,
      query: `${selected.familyId} ${selected.frameIndex}`,
    });
    expect(searched).toContainEqual(selected);
    expect(exactTerrainOverrideChoicesAt({
      document, tileX: 2, tileY: 2, query: 'snow',
    })).toEqual([]);
  });

  it('derives live families, previews, and exact variants from active authored tilesets', () => {
    const source = bootstrapTilesetDefinitions().find(({ familyId }) => familyId === 'stone_1')!;
    const definition = { ...renamedTileset(source, 'orchard_moss'), surfaceFamily: 'grass_2' };
    const palette = liveTerrainAuthoringPalette([definition], '17:content-a');

    expect(terrainCliffFamilyChoices('', palette)).toEqual([
      expect.objectContaining({
        familyId: 'orchard_moss',
        definitionId: 'tileset:orchard_moss',
        preview: expect.objectContaining({ assetId: 'tile_cf_orchard_moss' }),
      }),
    ]);
    expect(terrainSurfaceFamilyChoices('', palette).map(({ familyId }) => familyId))
      .toEqual(['grass_2']);
    expect(palette.resolver.tileSetFor('orchard_moss')?.assetId).toBe('tile_cf_orchard_moss');
    expect(palette.resolver.tileSetFor('stone_1')).toBeNull();

    const document = applyMapEdit({ ...raisedFixture(), defaultCliffFamily: 'orchard_moss' }, {
      kind: 'paint',
      points: [{ tileX: 2, tileY: 2 }, { tileX: 3, tileY: 2 },
        { tileX: 2, tileY: 3 }, { tileX: 3, tileY: 3 }],
      patch: { cliffFamily: 'orchard_moss' },
    }).document;
    const choices = exactTerrainOverrideChoicesAt({
      document, tileX: 2, tileY: 2, palette,
    });
    expect(choices.length).toBeGreaterThan(0);
    expect(choices.every(({ familyId, assetId }) => familyId === 'orchard_moss'
      && assetId === 'tile_cf_orchard_moss')).toBe(true);
  });

  it('fails closed for missing and retired live families and keys derived state by head', () => {
    const source = bootstrapTilesetDefinitions().find(({ familyId }) => familyId === 'stone_1')!;
    const retired = { ...renamedTileset(source, 'stone_1'), retired: true };
    const first = liveTerrainAuthoringPalette([retired], '17:content-a');
    const next = liveTerrainAuthoringPalette([renamedTileset(source, 'orchard_moss')], '18:content-b');

    expect(first.contentKey).not.toBe(next.contentKey);
    expect(first.definitions).toEqual([]);
    expect(terrainCliffFamilyChoices('', first)).toEqual([]);
    expect(terrainSurfaceFamilyChoices('', first)).toEqual([]);
    expect(first.resolver.tileSetFor('stone_1')).toBeNull();
    expect(next.resolver.tileSetFor('orchard_moss')).not.toBeNull();
  });
});
