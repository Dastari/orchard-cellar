import { performance } from 'node:perf_hooks';
import { describe, expect, it, vi } from 'vitest';
import {
  applyMapDocumentV3Edit,
  bootstrapTilesetDefinitions,
  createEmptyMapDocument,
  createLiveIslandMapDocument,
  migrateMapDocumentV2,
  terrainDocumentForMapV3,
} from '@orchard/sim';
import { terrainArrayForMapDocument } from '@orchard/engine/editor-terrain';
import { terrainForWorld } from '@orchard/engine/terrain';
import {
  buildMapEditorTerrain,
  mapEditorCanReuseGeneratedTerrain,
} from './editor-terrain-build.js';
import {
  createStudioLiveIslandBootstrapDocument,
  isStudioCanonicalLiveIslandTerrain,
  STUDIO_CANONICAL_LIVE_ISLAND_TRANSITIONS,
} from './editor-live-island-bootstrap.js';
import {
  buildMapEditorTerrainDerivatives,
  mapTerrainOverrideInfluenceRuns,
} from './editor-terrain-derivatives.js';
import {
  decodeMapEditorTerrain,
  decodeMapEditorTerrainAsync,
  decodeMapEditorTerrainDerivativesAsync,
  encodeMapEditorTerrain,
  encodeMapEditorTerrainDerivatives,
  MAP_EDITOR_TERRAIN_DECODE_CANCELLED,
} from './editor-terrain-wire.js';
import { liveTerrainAuthoringPalette } from './terrain-authoring-palette.js';

describe('map editor terrain initialization', () => {
  it('reuses generated production terrain without changing its visual semantics', () => {
    const document = createLiveIslandMapDocument();
    const terrain = buildMapEditorTerrain(document);
    const production = terrainForWorld(
      document.provenance.generatorSeed!,
      document.provenance.generatorVersion!,
    );
    const compiled = terrainArrayForMapDocument(
      terrainDocumentForMapV3(document),
      undefined,
      document,
      { includeTerrainPlaneCollision: false },
    );

    expect(terrain.biomes).toEqual(compiled.biomes);
    expect(terrain.elevations).toEqual(compiled.elevations);
    expect(terrain.dirtCliffRoles).toEqual(compiled.dirtCliffRoles);
    expect(terrain.dirtTerraces).toEqual(compiled.dirtTerraces);
    expect(terrain.terrainTransitions).toEqual(compiled.terrainTransitions);
    expect(terrain.defaultCliffFamily).toBe(compiled.defaultCliffFamily);
    expect(terrain.defaultSurfaceFamily).toBe(compiled.defaultSurfaceFamily);
    // Studio must use the gameplay terrain's traversal semantics too; the
    // generic compiler does not include every generated dock/ramp exception.
    expect(terrain.blocked).toBe(production.blocked);
    expect(terrain.horseJumpableTerrain).toBe(production.horseJumpableTerrain);
  });

  it('returns a completed terrain cache entry in constant time', () => {
    const document = createLiveIslandMapDocument();
    const first = buildMapEditorTerrain(document);
    const started = performance.now();
    const second = buildMapEditorTerrain(document);
    const elapsed = performance.now() - started;

    expect(second).toBe(first);
    expect(elapsed).toBeLessThan(5);
  }, 20_000);

  it('limits the trusted validation fast path to untouched production terrain', () => {
    const document = createLiveIslandMapDocument();
    expect(mapEditorCanReuseGeneratedTerrain(document)).toBe(true);
    expect(mapEditorCanReuseGeneratedTerrain({
      ...document,
      cells: { '400,400': { biome: 'forest' } },
    })).toBe(false);
    expect(mapEditorCanReuseGeneratedTerrain({ ...document, width: 831 })).toBe(false);
  });

  it('keeps the zero-cost Studio bootstrap byte-for-byte at generator parity', () => {
    const generated = createLiveIslandMapDocument();
    const bootstrap = createStudioLiveIslandBootstrapDocument();

    expect(STUDIO_CANONICAL_LIVE_ISLAND_TRANSITIONS).toEqual(generated.transitions);
    expect(bootstrap).toEqual(generated);
    expect(isStudioCanonicalLiveIslandTerrain(bootstrap)).toBe(true);
    expect(isStudioCanonicalLiveIslandTerrain({
      ...bootstrap,
      cells: { '400,400': { surface: 'stone' } },
    })).toBe(false);
    expect(isStudioCanonicalLiveIslandTerrain({
      ...bootstrap,
      provenance: { ...bootstrap.provenance, generatorSeed: 42 },
    })).toBe(false);
  }, 20_000);

  it('compiles preview terrain against the keyed active live tileset resolver', () => {
    const source = bootstrapTilesetDefinitions().find(({ familyId }) => familyId === 'stone_1')!;
    const orchardMoss = { ...source, id: 'tileset:orchard_moss' as const, familyId: 'orchard_moss' };
    const document = migrateMapDocumentV2({
      ...createEmptyMapDocument({ id: 'live-family', title: 'Live family', width: 8, height: 8 }),
      defaultCliffFamily: 'orchard_moss',
    });
    const firstPalette = liveTerrainAuthoringPalette([orchardMoss], '7:first');
    const first = buildMapEditorTerrain(document, firstPalette);
    expect(first.tilesets?.tileSetFor('orchard_moss')).not.toBeNull();
    expect(first.tilesets?.tileSetFor('stone_1')).toBeNull();
    const secondPalette = liveTerrainAuthoringPalette([{
      ...orchardMoss,
      roleFrames: orchardMoss.roleFrames.map((entry) => ({
        ...entry, assetId: 'tile_cf_orchard_moss_next',
      })),
      assetIds: ['tile_cf_orchard_moss_next'],
    }], '8:second');
    const second = buildMapEditorTerrain(document, secondPalette);
    expect(second).not.toBe(first);
    expect(second.tilesets?.tileSetFor('orchard_moss')?.assetId).toBe('tile_cf_orchard_moss_next');
  });

  it('round-trips worker terrain without cloning dense boolean or null arrays', () => {
    const terrain = buildMapEditorTerrain(createLiveIslandMapDocument());
    const encoded = encodeMapEditorTerrain(terrain);
    const decoded = decodeMapEditorTerrain(encoded.wire);

    expect(encoded.wire.blocked).toBeInstanceOf(Uint8Array);
    expect(encoded.wire.horseJumpableTerrain).toBeInstanceOf(Uint8Array);
    expect(encoded.wire.terrainOverrides).toBeUndefined();
    expect(decoded.blocked).toEqual(terrain.blocked);
    expect(decoded.horseJumpableTerrain).toEqual(terrain.horseJumpableTerrain);
    expect(decoded.biomes).toEqual(terrain.biomes);
    expect(decoded.elevations).toEqual(terrain.elevations);
  }, 20_000);

  it('copies and transfers the optional authored farmland mask through the worker wire', () => {
    const base = migrateMapDocumentV2(createEmptyMapDocument({
      id: 'wire-farmland', title: 'Wire farmland', width: 4, height: 4,
    }));
    const document = applyMapDocumentV3Edit(base, {
      kind: 'terrain',
      command: {
        kind: 'paint', points: [{ tileX: 2, tileY: 1 }],
        patch: { surface: 'dirt', feature: 'farmland' },
      },
    }).document;
    const terrain = buildMapEditorTerrain(document);
    const encoded = encodeMapEditorTerrain(terrain);
    const decoded = decodeMapEditorTerrain(encoded.wire);

    expect(encoded.wire.authoredFarmland).toEqual(terrain.authoredFarmland);
    expect(encoded.wire.authoredFarmland).not.toBe(terrain.authoredFarmland);
    expect(encoded.transfer).toContain(encoded.wire.authoredFarmland?.buffer);
    expect(decoded.authoredFarmland).toEqual(terrain.authoredFarmland);
    expect(decoded.authoredFarmland?.[1 * document.width + 2]).toBe(1);
  });

  it('chunk-decodes transferred traversal fields without changing terrain', async () => {
    const terrain = buildMapEditorTerrain(createStudioLiveIslandBootstrapDocument());
    const encoded = encodeMapEditorTerrain(terrain);
    const decoded = await decodeMapEditorTerrainAsync(encoded.wire);
    expect(decoded.blocked).toEqual(terrain.blocked);
    expect(decoded.horseJumpableTerrain).toEqual(terrain.horseJumpableTerrain);
  }, 20_000);

  it('cancels stale chunked traversal adoption before doing more UI-thread work', async () => {
    vi.useFakeTimers();
    try {
      const terrain = buildMapEditorTerrain(createStudioLiveIslandBootstrapDocument());
      const pending = decodeMapEditorTerrainAsync(encodeMapEditorTerrain(terrain).wire, () => false);
      const rejected = expect(pending).rejects.toThrow(MAP_EDITOR_TERRAIN_DECODE_CANCELLED);
      await vi.runAllTimersAsync();
      await rejected;
    } finally {
      vi.useRealTimers();
    }
  }, 20_000);

  it('derives overview layers and authored influence before the worker result is adopted', async () => {
    const base = migrateMapDocumentV2(createEmptyMapDocument({
      id: 'worker-derivatives', title: 'Worker derivatives', width: 8, height: 8,
    }));
    const document = applyMapDocumentV3Edit(base, {
      kind: 'terrain',
      command: {
        kind: 'paint', points: [{ tileX: 4, tileY: 4 }],
        patch: { surface: 'dirt', elevation: 1 },
      },
    }).document;
    const terrain = buildMapEditorTerrain(document);
    const derivatives = buildMapEditorTerrainDerivatives(document, terrain);
    const encodedTerrain = encodeMapEditorTerrain(terrain);
    const decodedTerrain = decodeMapEditorTerrain(encodedTerrain.wire);
    const encoded = encodeMapEditorTerrainDerivatives(derivatives, terrain);
    const decoded = await decodeMapEditorTerrainDerivativesAsync(encoded.wire, decodedTerrain);

    expect(decoded.overview.layers.combined).toEqual(derivatives.overview.layers.combined);
    expect(decoded.overview.layers.generated_base).toEqual(
      derivatives.overview.layers.generated_base,
    );
    expect(decoded.overview.layers.terrain).toEqual(derivatives.overview.layers.terrain);
    expect(decoded.generatedBaseTerrainKey).toBe(derivatives.generatedBaseTerrainKey);
    expect(decoded.terrainOverrideInfluenceRuns).toEqual(
      mapTerrainOverrideInfluenceRuns(terrain, decoded.generatedBaseTerrain),
    );
    expect(decoded.terrainOverrideInfluenceRuns.length).toBeGreaterThan(0);
    expect(encoded.transfer).toContain(encoded.wire.overview.layers.combined.buffer);
  });
});
