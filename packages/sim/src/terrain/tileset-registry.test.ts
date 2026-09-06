import { describe, expect, it } from 'vitest';
import {
  ContentParseError,
  parseTilesetDefinition,
  type TilesetContentDefinition,
} from '../content/definitions.js';
import { validateContentDefinitions } from '../content/validate.js';
import {
  TERRAIN_CLIFF_FAMILIES,
  TERRAIN_CLIFF_FAMILY_IDS,
} from '../terrain-tilesets.js';
import {
  RESERVED_TILESET_FAMILIES,
  TILESET_CONTENT_ENGINE_VERSION,
  bootstrapTilesetDefinitions,
  buildTilesetRegistry,
  terrainTransitionCapability,
  tilesetDefinitionsHash,
  validateTilesetDefinition,
} from './tileset-registry.js';

function clone(definition: TilesetContentDefinition): TilesetContentDefinition {
  return structuredClone(definition);
}

describe('authored tileset registry', () => {
  it('reports the exact reproducible transition capability without substituting art', () => {
    expect(terrainTransitionCapability({
      kind: 'slope', direction: 'up', familyId: 'stone_1', width: 2,
    })).toMatchObject({ supported: true, code: 'transition_supported' });
    expect(terrainTransitionCapability({
      kind: 'slope', direction: 'right', familyId: 'stone_1', width: 2,
    })).toMatchObject({ supported: false, code: 'transition_direction_art_unavailable' });
    expect(terrainTransitionCapability({
      kind: 'slope', direction: 'up', familyId: 'cave', width: 2,
    })).toMatchObject({ supported: false, code: 'transition_family_art_unavailable' });
    expect(terrainTransitionCapability({
      kind: 'slope', direction: 'up', familyId: 'stone_1', width: 1,
    })).toMatchObject({ supported: false, code: 'transition_bank_width_unavailable' });
    expect(terrainTransitionCapability({
      kind: 'stairs', direction: 'up', familyId: 'stone_1', width: 2,
    })).toMatchObject({ supported: false, code: 'transition_stair_art_unavailable' });
    expect(terrainTransitionCapability({
      kind: 'ladder', direction: 'up', familyId: 'cave', width: 1,
    })).toMatchObject({ supported: false, code: 'transition_ladder_runtime_unavailable' });
    expect(terrainTransitionCapability({
      kind: 'rope', direction: 'up', familyId: 'stone_1', width: 1,
    })).toMatchObject({ supported: false, code: 'transition_kind_runtime_unavailable' });
  });

  it('derives one valid definition from every available runtime terrain family', () => {
    const definitions = bootstrapTilesetDefinitions();
    const availableIds = TERRAIN_CLIFF_FAMILY_IDS.filter((id) => TERRAIN_CLIFF_FAMILIES[id].available);
    expect(definitions.map(({ familyId }) => familyId)).toEqual(availableIds.slice().sort());
    expect(RESERVED_TILESET_FAMILIES).toEqual([
      expect.objectContaining({ familyId: 'snow' }),
    ]);
    for (const definition of definitions) {
      expect(definition).toMatchObject({
        id: `tileset:${definition.familyId}`,
        schemaVersion: 1,
        engineVersion: TILESET_CONTENT_ENGINE_VERSION,
      });
      expect(validateTilesetDefinition(definition)).toEqual([]);
      expect(Object.isFrozen(definition)).toBe(true);
    }
  });

  it('preserves every existing edge/inset role and its concrete asset reference', () => {
    for (const definition of bootstrapTilesetDefinitions()) {
      const family = TERRAIN_CLIFF_FAMILIES[definition.familyId as keyof typeof TERRAIN_CLIFF_FAMILIES];
      expect(family.available).toBe(true);
      if (!family.available) continue;
      const expected = [
        ...Object.entries(family.tileSet.edgeFrames).map(([role, frame]) => ({
          group: 'edge', role, assetId: family.tileSet.assetId, frame,
        })),
        ...Object.entries(family.tileSet.insetFrames).map(([role, frame]) => ({
          group: 'inset', role, assetId: family.tileSet.insetAssetId ?? family.tileSet.assetId, frame,
        })),
      ];
      expect(definition.roleFrames).toEqual(expect.arrayContaining(expected));
      expect(definition.assetIds).toContain(family.tileSet.assetId);
    }
  });

  it('normalizes author ordering and hashes definitions deterministically', () => {
    const source = bootstrapTilesetDefinitions()[0]!;
    const parsed = parseTilesetDefinition({
      ...clone(source),
      roleFrames: [...source.roleFrames].reverse(),
      faceProfiles: [...source.faceProfiles].reverse(),
      assetIds: [...source.assetIds].reverse(),
    });
    expect(parsed).toEqual(source);
    const definitions = bootstrapTilesetDefinitions();
    expect(tilesetDefinitionsHash([...definitions].reverse())).toBe(tilesetDefinitionsHash(definitions));
    expect(buildTilesetRegistry([...definitions].reverse()).contentHash)
      .toBe(buildTilesetRegistry(definitions).contentHash);
    expect([...buildTilesetRegistry(definitions).definitions.keys()])
      .toEqual(definitions.map(({ id }) => id));
    for (const definition of definitions) {
      expect(parseTilesetDefinition(JSON.stringify(definition))).toEqual(definition);
    }
  });

  it('requires schema and engine versions plus stable ids and terrain references', () => {
    const source = clone(bootstrapTilesetDefinitions()[0]!);
    expect(() => parseTilesetDefinition({ ...source, schemaVersion: 2 }))
      .toThrowError(ContentParseError);
    expect(() => parseTilesetDefinition({ ...source, familyId: 'Not Stable' }))
      .toThrowError(/invalid stable reference/u);
    expect(validateTilesetDefinition({ ...source, engineVersion: 2 }))
      .toEqual([expect.objectContaining({ code: 'invalid_tileset', path: 'engineVersion' })]);
    expect(validateTilesetDefinition({ ...source, familyId: 'other_family' }))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ code: 'invalid_terrain_reference', path: 'familyId' }),
      ]));
  });

  it('rejects missing role variants, malformed transitions, and undeclared assets', () => {
    const source = clone(bootstrapTilesetDefinitions()
      .find(({ transitions }) => transitions.ramp.available)!);
    const missingEdge = {
      ...source,
      roleFrames: source.roleFrames.filter(({ group, role }) => group !== 'edge' || role !== 'top'),
    };
    expect(validateTilesetDefinition(missingEdge)).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'missing_tileset_variant', path: 'roleFrames.edge' }),
    ]));

    const invalidRamp = clone(source);
    const ramp = invalidRamp.transitions.ramp;
    expect(ramp.available).toBe(true);
    if (!ramp.available) return;
    const broken = {
      ...invalidRamp,
      transitions: {
        ...invalidRamp.transitions,
        ramp: { ...ramp, variants: ramp.variants.filter(({ id }) => id !== 'base') },
      },
    };
    expect(validateTilesetDefinition(broken)).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'invalid_tileset_transition', path: 'transitions.ramp.base' }),
    ]));
    expect(validateTilesetDefinition({ ...source, assetIds: [] })).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'invalid_asset_reference' }),
    ]));
  });

  it('enforces tileset retirement through the shared content validator', () => {
    const source = clone(bootstrapTilesetDefinitions()[0]!);
    const report = validateContentDefinitions([{ ...source, retired: true }]);
    expect(report.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'missing_retirement_replacement', definitionId: source.id }),
    ]));
  });
});
