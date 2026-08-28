import { describe, expect, it } from 'vitest';
import {
  applyMapEdit,
  commitMapEdit,
  compileMapDocument,
  createEmptyMapDocument,
  createMapEditHistory,
  createTerrainLabDocument,
  mapCollisionAtPlane,
  mapDependencyHalo,
  mapDocumentHash,
  parseMapDocument,
  rasterMapLine,
  redoMapEdit,
  resolvedMapCellAt,
  semanticTerrainTraceAt,
  serializeMapDocument,
  undoMapEdit,
  validateMapDocument,
} from './index.js';

describe('MapDocumentV2 editor foundation', () => {
  it('round-trips a canonical source document with a stable content hash', () => {
    const document = createTerrainLabDocument();
    const source = serializeMapDocument(document);
    const parsed = parseMapDocument(source);
    expect(serializeMapDocument(parsed)).toBe(source);
    expect(mapDocumentHash(parsed)).toBe(mapDocumentHash(document));
    expect(source).not.toContain('references/');
  });

  it('uses the same deterministic line cells for pointer and headless strokes', () => {
    expect(rasterMapLine({ tileX: 1, tileY: 1 }, { tileX: 5, tileY: 3 })).toEqual([
      { tileX: 1, tileY: 1 },
      { tileX: 2, tileY: 2 },
      { tileX: 3, tileY: 2 },
      { tileX: 4, tileY: 3 },
      { tileX: 5, tileY: 3 },
    ]);
  });

  it('paints, fills, raises a closed contour, and restores exact undo/redo hashes', () => {
    const empty = createEmptyMapDocument({ id: 'fixture', title: 'Fixture', width: 8, height: 8 });
    let history = createMapEditHistory(empty);
    history = commitMapEdit(history, {
      kind: 'line', from: { tileX: 1, tileY: 2 }, to: { tileX: 6, tileY: 2 }, patch: { surface: 'sand' },
    });
    const sandHash = mapDocumentHash(history.present);
    history = commitMapEdit(history, {
      kind: 'change_elevation_polygon', delta: 1,
      polygon: [
        { tileX: 2, tileY: 3 }, { tileX: 6, tileY: 3 },
        { tileX: 6, tileY: 7 }, { tileX: 2, tileY: 7 },
      ],
    });
    expect(resolvedMapCellAt(history.present, 3, 4).elevation).toBe(1);
    const raisedHash = mapDocumentHash(history.present);
    history = undoMapEdit(history);
    expect(mapDocumentHash(history.present)).toBe(sandHash);
    history = redoMapEdit(history);
    expect(mapDocumentHash(history.present)).toBe(raisedHash);

    const filled = applyMapEdit(history.present, {
      kind: 'fill_surface', start: { tileX: 0, tileY: 0 }, surface: 'dirt',
    });
    expect(resolvedMapCellAt(filled.document, 0, 0).surface).toBe('dirt');
    expect(resolvedMapCellAt(filled.document, 3, 2).surface).toBe('sand');
  });

  it('resizes every authored layer by one relative offset and supports exact undo', () => {
    const empty = createEmptyMapDocument({ id: 'resize', title: 'Resize', width: 4, height: 3 });
    const painted = applyMapEdit(empty, {
      kind: 'paint', points: [{ tileX: 1, tileY: 1 }], patch: { surface: 'stone' },
    }).document;
    const source = {
      ...painted,
      transitions: [{
        contourLevel: 1, kind: 'slope', direction: 'up',
        lowerTileX: 1, lowerTileY: 1, upperTileX: 1, upperTileY: 0,
      }] as const,
      scenery: [{ id: 'tree', assetId: 'tree', tileX: 2, tileY: 1, elevation: 0 }],
      anchors: [{ id: 'spawn', kind: 'spawn' as const, tileX: 2, tileY: 2, elevation: 0 }],
    };
    let history = createMapEditHistory(source);
    history = commitMapEdit(history, { kind: 'resize', width: 6, height: 5, anchor: 'south_east' });
    expect(history.present).toMatchObject({ width: 6, height: 5, revision: source.revision + 1 });
    expect(resolvedMapCellAt(history.present, 3, 3).surface).toBe('stone');
    expect(history.present.transitions[0]).toMatchObject({
      lowerTileX: 3, lowerTileY: 3, upperTileX: 3, upperTileY: 2,
    });
    expect(history.present.scenery[0]).toMatchObject({ tileX: 4, tileY: 3 });
    expect(history.present.anchors[0]).toMatchObject({ tileX: 4, tileY: 4 });
    history = undoMapEdit(history);
    expect(history.present).toEqual(source);
  });

  it('crops out-of-bounds layers and deterministically biases odd centre growth south-east', () => {
    const source = applyMapEdit(
      createEmptyMapDocument({ id: 'crop', title: 'Crop', width: 4, height: 4 }),
      { kind: 'paint', points: [{ tileX: 0, tileY: 0 }], patch: { surface: 'stone' } },
    ).document;
    const grown = applyMapEdit(source, {
      kind: 'resize', width: 5, height: 5, anchor: 'center',
    }).document;
    expect(resolvedMapCellAt(grown, 0, 0).surface).toBe('stone');
    const cropped = applyMapEdit(grown, {
      kind: 'resize', width: 3, height: 3, anchor: 'south_east',
    });
    expect(cropped.fullRebuild).toBe(true);
    expect(cropped.document.cells).toEqual({});
    expect(() => applyMapEdit(source, {
      kind: 'resize', width: 0, height: 4, anchor: 'north_west',
    })).toThrow('positive integers');
  });

  it('derives height-plane collision and dirty dependency halos', () => {
    const empty = createEmptyMapDocument({
      id: 'planes', title: 'Planes', width: 5, height: 5, baseElevation: 2,
    });
    const edited = applyMapEdit(empty, {
      kind: 'paint', points: [{ tileX: 2, tileY: 2 }], patch: { elevation: 3 },
    }).document;
    const compiled = compileMapDocument(edited);
    expect(mapCollisionAtPlane(compiled, 2, 2, 2)).toBe('blocked');
    expect(mapCollisionAtPlane(compiled, 2, 2, 3)).toBe('open');
    expect(mapDependencyHalo(edited, [{ tileX: 0, tileY: 0 }], 1)).toEqual([
      { tileX: 0, tileY: 0 }, { tileX: 1, tileY: 0 },
      { tileX: 0, tileY: 1 }, { tileX: 1, tileY: 1 },
    ]);
  });

  it('exposes asset-independent contour roles and WHY reasons', () => {
    const lab = createTerrainLabDocument();
    const trace = semanticTerrainTraceAt(lab, 19, 48);
    expect(trace.elevation).toBe(4);
    expect(trace.layers.some((layer) => layer.role.startsWith('crossing.ramp_'))).toBe(true);
    expect(trace.layers.every((layer) => layer.reason.length > 0)).toBe(true);
  });

  it('validates all six terrain-lab crossings against coordinate-derived heights', () => {
    const lab = createTerrainLabDocument();
    expect(lab.transitions).toHaveLength(12);
    expect(validateMapDocument(lab)).toEqual([]);
    expect(resolvedMapCellAt(lab, 20, 27).elevation).toBe(6);
    expect(resolvedMapCellAt(lab, 60, 27).elevation).toBe(0);
  });

  it('rejects collision overrides without an authored reason', () => {
    const empty = createEmptyMapDocument({ id: 'invalid', title: 'Invalid', width: 3, height: 3 });
    const edited = applyMapEdit(empty, {
      kind: 'paint', points: [{ tileX: 1, tileY: 1 }], patch: { collision: 'force_walk' },
    }).document;
    expect(validateMapDocument(edited)).toContainEqual(expect.objectContaining({ code: 'collision_reason_missing' }));
  });
});
