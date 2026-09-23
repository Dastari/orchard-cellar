import { describe, expect, it } from 'vitest';
import {
  cellPartExactAssetName,
  cellPartForTerrainAsset,
  cellPartToTerrainOverride,
  effectiveCellParts,
  parseCellPart,
  parseCellParts,
  revertCellPartExact,
  terrainOverrideToCellPart,
  upsertCellPart,
  type CellPart,
} from './map-cell-parts.js';
import {
  parseMapDocument,
  resolvedMapCellAt,
  serializeMapDocument,
  type MapCellOverride,
  type MapDocumentV2,
  type TerrainOverride,
} from './map-document.js';
import { migrateMapDocumentV2, parseMapDocumentV3, serializeMapDocumentV3 } from './map-document-v3.js';
import { applyMapEdit } from './map-editing.js';
import { compileMapDocument, semanticTerrainTraceAt, validateMapDocument } from './map-compiler.js';
import { createEmptyMapDocument, createTerrainLabDocument } from './terrain-lab.js';

function withCells(document: MapDocumentV2, cells: Readonly<Record<string, MapCellOverride>>): MapDocumentV2 {
  return { ...document, cells: { ...document.cells, ...cells } };
}

/** Moves every legacy `terrainOverride` into an equivalent `contour:N` part. */
function migrateOverridesToParts(document: MapDocumentV2): MapDocumentV2 {
  return {
    ...document,
    cells: Object.fromEntries(Object.entries(document.cells).map(([key, cell]) => {
      if (cell.terrainOverride === undefined) return [key, cell];
      const { terrainOverride, ...rest } = cell;
      return [key, { ...rest, parts: [terrainOverrideToCellPart(terrainOverride)] }];
    })),
  };
}

const LEGACY_OVERRIDES: readonly TerrainOverride[] = [
  { contourLevel: 0, role: 'bottom_right', frameIndex: 777 },
  { contourLevel: 1, frameIndex: 4 },
  { contourLevel: 1, family: 'shroomlands', role: 'top' },
  { contourLevel: -2, role: 'face.lower_wall.middle', frameIndex: 57, family: 'dungeon_2' },
  // Stale/invalid legacy frames stay legal and must survive migration.
  { contourLevel: 7, frameIndex: 999_999 },
];

describe('cell part parsing', () => {
  it('accepts every slot form and canonicalizes key order', () => {
    expect(parseCellPart({ exact: { flipX: true, frame: 3, quarterTurns: 2 }, slot: 'path' })).toEqual({
      slot: 'path', exact: { frame: 3, quarterTurns: 2, flipX: true },
    });
    expect(JSON.stringify(parseCellPart({ exact: { frame: 1 }, family: 'grass_2', slot: 'fringe:grass_2' })))
      .toBe('{"slot":"fringe:grass_2","family":"grass_2","exact":{"frame":1}}');
    for (const slot of ['surface', 'farmland', 'water', 'contour:0', 'contour:-32', 'contour:32', 'fringe:beach_inset']) {
      expect(parseCellPart({ slot, exact: { frame: 0 } })).not.toBeNull();
    }
  });

  it('rejects malformed parts instead of repairing them', () => {
    for (const value of [
      null, [], 'path', { slot: 'path' }, { slot: 'road', exact: { frame: 1 } },
      { slot: 'contour:33', exact: { frame: 1 } }, { slot: 'contour:-0', exact: { frame: 1 } },
      { slot: 'contour:01', exact: { frame: 1 } }, { slot: 'fringe:', exact: { frame: 1 } },
      { slot: 'fringe:Grass', exact: { frame: 1 } }, { slot: 'path', exact: { frame: 1.5 } },
      { slot: 'path', exact: { frame: -1 } }, { slot: 'path', exact: { frame: 2 ** 31 } },
      { slot: 'path', exact: { frame: 1, quarterTurns: 0 } }, { slot: 'path', exact: { frame: 1, flipX: false } },
      { slot: 'path', exact: { frame: 1, extra: 1 } }, { slot: 'path', exact: { frame: 1 }, extra: true },
      { slot: 'path', role: 'top', exact: { frame: 1 } }, { slot: 'path', family: 'Bad-Id' },
    ]) expect(parseCellPart(value)).toBeNull();
  });

  it('bounds the stack, keeps slots unique and allows one contour part', () => {
    const path: CellPart = { slot: 'path', exact: { frame: 1 } };
    expect(parseCellParts([path])).toEqual([path]);
    expect(parseCellParts([path, path])).toBeNull();
    expect(parseCellParts(Array.from({ length: 9 }, (_, index) => ({ slot: `fringe:f${index}`, exact: { frame: 1 } })))).toBeNull();
    expect(parseCellParts([
      { slot: 'contour:1', exact: { frame: 1 } }, { slot: 'contour:2', exact: { frame: 1 } },
    ])).toBeNull();
    expect(parseCellParts({})).toBeNull();
  });
});

describe('legacy terrainOverride migration', () => {
  it('maps every legacy override form losslessly to a contour part and back', () => {
    for (const override of LEGACY_OVERRIDES) {
      const part = terrainOverrideToCellPart(override);
      expect(part.slot).toBe(`contour:${override.contourLevel}`);
      expect(parseCellPart(JSON.parse(JSON.stringify(part)))).toEqual(part);
      expect(cellPartToTerrainOverride(part)).toEqual(override);
    }
    expect(effectiveCellParts({ terrainOverride: LEGACY_OVERRIDES[0]!, parts: [{ slot: 'path', exact: { frame: 2 } }] }))
      .toEqual([terrainOverrideToCellPart(LEGACY_OVERRIDES[0]!), { slot: 'path', exact: { frame: 2 } }]);
  });

  it('compiles and traces a contour part exactly like the equivalent legacy override', () => {
    let lab = createTerrainLabDocument();
    for (const [point, override] of [
      [{ tileX: 47, tileY: 3 }, { contourLevel: 0, role: 'bottom_right', frameIndex: 777 }],
      [{ tileX: 20, tileY: 20 }, { contourLevel: 1, frameIndex: 4 }],
      [{ tileX: 21, tileY: 20 }, { contourLevel: 1, family: 'shroomlands', role: 'top' }],
    ] as const) {
      lab = applyMapEdit(lab, { kind: 'paint', points: [point], patch: { terrainOverride: override } }).document;
    }
    const migrated = migrateOverridesToParts(lab);
    const legacyCompiled = compileMapDocument(lab);
    const partCompiled = compileMapDocument(migrated);
    expect(partCompiled.terrainOverrides).toEqual(legacyCompiled.terrainOverrides);
    expect(partCompiled.cliffFamilyIds).toEqual(legacyCompiled.cliffFamilyIds);
    expect('cellParts' in legacyCompiled).toBe(false);
    for (const [x, y] of [[47, 3], [20, 20], [21, 20]] as const) {
      expect(semanticTerrainTraceAt(migrated, x, y, partCompiled))
        .toEqual(semanticTerrainTraceAt(lab, x, y, legacyCompiled));
      expect(resolvedMapCellAt(migrated, x, y).terrainOverride).toEqual(resolvedMapCellAt(lab, x, y).terrainOverride);
    }
    expect(validateMapDocument(migrated)).toEqual(validateMapDocument(lab));
  });
});

describe('map documents with cell parts', () => {
  const base = createEmptyMapDocument({ id: 'parts', title: 'Parts', width: 6, height: 6 });

  it('round-trips canonical JSON through v2 and v3 parsers', () => {
    const document = withCells(base, {
      '2,2': { feature: 'path', parts: [{ exact: { frame: 12 }, slot: 'path' }, { slot: 'fringe:grass_2', exact: { frame: 1 } }] },
    });
    const serialized = serializeMapDocument(document);
    expect(serialized).toContain('"parts": [\n        {\n          "slot": "path",\n          "exact": {\n            "frame": 12');
    expect(serializeMapDocument(parseMapDocument(serialized))).toBe(serialized);
    const v3 = migrateMapDocumentV2(parseMapDocument(serialized));
    const v3Json = serializeMapDocumentV3(v3);
    expect(parseMapDocumentV3(v3Json).cells['2,2']?.parts).toEqual([
      { slot: 'path', exact: { frame: 12 } }, { slot: 'fringe:grass_2', exact: { frame: 1 } },
    ]);
  });

  it('refuses malformed parts and contour conflicts at load, but never touches legacy fields', () => {
    const json = (cells: unknown): string => JSON.stringify({ ...base, cells });
    expect(() => parseMapDocument(json({ '1,1': { parts: [{ slot: 'path' }] } }))).toThrow('Map cell parts are invalid');
    expect(() => parseMapDocument(json({
      '1,1': { terrainOverride: { contourLevel: 1, frameIndex: 2 }, parts: [{ slot: 'contour:1', exact: { frame: 3 } }] },
    }))).toThrow('both a terrain override and a contour part');
    // Legacy override shape remains leniently loadable (validated later).
    expect(parseMapDocument(json({ '1,1': { terrainOverride: { contourLevel: 9, frameIndex: 999_999 } } }))
      .cells['1,1']?.terrainOverride).toEqual({ contourLevel: 9, frameIndex: 999_999 });
  });

  it('exposes non-contour parts to renderers only when a map uses parts', () => {
    expect('cellParts' in compileMapDocument(base)).toBe(false);
    const document = withCells(base, { '1,2': { parts: [{ slot: 'path', exact: { frame: 5 } }] } });
    const compiled = compileMapDocument(document);
    expect(compiled.cellParts?.get(2 * 6 + 1)).toEqual([{ slot: 'path', exact: { frame: 5 } }]);
    expect(compiled.terrainOverrides.every((value) => value === null)).toBe(true);
    expect(semanticTerrainTraceAt(document, 1, 2, compiled).layers).toContainEqual(expect.objectContaining({
      role: 'part.path', frameIndex: 5,
    }));
  });

  it('upserts, reverts and replaces parts through ordinary paint edits', () => {
    const point = { tileX: 3, tileY: 3 };
    const painted = applyMapEdit(base, {
      kind: 'paint', points: [point], patch: { cellPart: { slot: 'path', exact: { frame: 7 } } },
    }).document;
    expect(painted.cells['3,3']).toEqual({ parts: [{ slot: 'path', exact: { frame: 7 } }] });
    const fringe = applyMapEdit(painted, {
      kind: 'paint', points: [point], patch: { cellPart: { slot: 'fringe:grass_3', exact: { frame: 2 } }, surface: 'sand' },
    }).document;
    expect(fringe.cells['3,3']).toEqual({ surface: 'sand', parts: [
      { slot: 'path', exact: { frame: 7 } }, { slot: 'fringe:grass_3', exact: { frame: 2 } },
    ] });
    // Unrelated edits keep the stack.
    const raised = applyMapEdit(fringe, { kind: 'paint', points: [point], patch: { elevation: 1 } }).document;
    expect(raised.cells['3,3']?.parts).toHaveLength(2);
    const reverted = applyMapEdit(raised, { kind: 'paint', points: [point], patch: { revertPartExact: 'path' } }).document;
    expect(reverted.cells['3,3']?.parts).toEqual([{ slot: 'fringe:grass_3', exact: { frame: 2 } }]);
    const cleared = applyMapEdit(reverted, { kind: 'paint', points: [point], patch: { parts: null } }).document;
    expect(cleared.cells['3,3']?.parts).toBeUndefined();
  });

  it('keeps the legacy override and a contour part mutually exclusive when editing', () => {
    const point = { tileX: 1, tileY: 1 };
    const legacy = applyMapEdit(base, {
      kind: 'paint', points: [point], patch: { terrainOverride: { contourLevel: 1, frameIndex: 3 } },
    }).document;
    const asPart = applyMapEdit(legacy, {
      kind: 'paint', points: [point], patch: { cellPart: { slot: 'contour:1', exact: { frame: 4 } } },
    }).document;
    expect(asPart.cells['1,1']).toEqual({ parts: [{ slot: 'contour:1', exact: { frame: 4 } }] });
    const backToLegacy = applyMapEdit(asPart, {
      kind: 'paint', points: [point], patch: { terrainOverride: { contourLevel: 1, frameIndex: 5 } },
    }).document;
    expect(backToLegacy.cells['1,1']).toEqual({ terrainOverride: { contourLevel: 1, frameIndex: 5 } });
    // A path part never disturbs the legacy override.
    const both = applyMapEdit(backToLegacy, {
      kind: 'paint', points: [point], patch: { cellPart: { slot: 'path', exact: { frame: 1 } } },
    }).document;
    expect(both.cells['1,1']).toEqual({
      terrainOverride: { contourLevel: 1, frameIndex: 5 }, parts: [{ slot: 'path', exact: { frame: 1 } }],
    });
  });

  it('reports part problems through validation without repairing them', () => {
    const document = withCells(base, {
      '1,1': { parts: [{ slot: 'fringe:unknown_family', exact: { frame: 1 } }] },
      '2,1': { parts: [{ slot: 'surface', exact: { frame: 1 } }] },
      '3,1': { terrainOverride: { contourLevel: 1, frameIndex: 2 }, parts: [{ slot: 'contour:1', exact: { frame: 3 } }] },
      '4,1': { parts: [{ slot: 'path' }] as unknown as readonly CellPart[] },
    });
    const codes = validateMapDocument(document).map(({ code, tileX, tileY }) => `${code}@${tileX},${tileY}`);
    expect(codes).toContain('cell_part_exact_unsupported@1,1');
    expect(codes).not.toContain('cell_part_exact_unsupported@2,1');
    expect(codes).toContain('cell_parts_contour_conflict@3,1');
    expect(codes).toContain('cell_parts_invalid@4,1');
  });
});

describe('exact terrain asset mapping', () => {
  it('maps terrain-component atlases to slots and leaves decorations as objects', () => {
    expect(cellPartForTerrainAsset('tile_cf_path')).toEqual({ slot: 'path' });
    expect(cellPartForTerrainAsset('tile_path')).toEqual({ slot: 'path' });
    expect(cellPartForTerrainAsset('tile_cf_grass_2_sheet')).toEqual({ slot: 'fringe:grass_2' });
    expect(cellPartForTerrainAsset('tile_cf_beach')).toEqual({ slot: 'surface', family: 'beach' });
    expect(cellPartForTerrainAsset('tile_cf_freshwater_inset')).toEqual({ slot: 'fringe:freshwater_inset' });
    for (const decoration of ['tile_cf_path_decorated', 'tile_cf_grass_tuft', 'tile_cf_water_ripples', 'tile_cf_stone_cliff_variants']) {
      expect(cellPartForTerrainAsset(decoration)).toBeNull();
    }
    expect(cellPartExactAssetName({ slot: 'path' })).toBe('tile_cf_path');
    expect(cellPartExactAssetName({ slot: 'surface' })).toBeNull();
    expect(cellPartExactAssetName({ slot: 'surface', family: 'beach' })).toBe('tile_cf_beach');
  });

  it('upsert and revert helpers keep authored order and drop empty parts', () => {
    const parts = upsertCellPart([{ slot: 'water', exact: { frame: 1 } }], { slot: 'path', exact: { frame: 2 } });
    expect(parts.map(({ slot }) => slot)).toEqual(['water', 'path']);
    expect(upsertCellPart(parts, { slot: 'water', exact: { frame: 9 } })[0]).toEqual({ slot: 'water', exact: { frame: 9 } });
    expect(revertCellPartExact(parts, 'water')).toEqual([{ slot: 'path', exact: { frame: 2 } }]);
    expect(revertCellPartExact([{ slot: 'fringe:grass_1', family: 'grass_1', exact: { frame: 1 } }], 'fringe:grass_1'))
      .toEqual([{ slot: 'fringe:grass_1', family: 'grass_1' }]);
  });
});
