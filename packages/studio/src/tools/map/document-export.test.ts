import {
  createEmptyMapDocument,
  migrateMapDocumentV2,
  parseMapDocumentV3,
  serializeMapDocumentV3,
  type MapDocumentV3,
} from '@orchard/sim';
import { describe, expect, it } from 'vitest';
import {
  MAP_DOCUMENT_EXPORT_MAX_PREFABS,
  createMapDocumentExport,
  sanitizeMapDocumentExportFilename,
} from './document-export.js';

function fixture(): MapDocumentV3 {
  return migrateMapDocumentV2(createEmptyMapDocument({
    id: 'export-fixture',
    title: 'Export Fixture',
    width: 8,
    height: 6,
  }));
}

describe('map document export', () => {
  it('returns canonical deterministic JSON and an exact JSON blob', async () => {
    const document = fixture();
    const first = createMapDocumentExport(document);
    const second = createMapDocumentExport(document);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;

    expect(first.payload.filename).toBe('export-fixture-r0.map.json');
    expect(first.payload.json).toBe(serializeMapDocumentV3(document));
    expect(first.payload.json).toBe(second.payload.json);
    expect(parseMapDocumentV3(first.payload.json)).toEqual(document);
    expect(first.payload.mediaType).toBe('application/json');
    expect(first.payload.blob.type).toBe('application/json');
    expect(await first.payload.blob.text()).toBe(first.payload.json);
    expect(first.payload.byteLength).toBe(first.payload.blob.size);
    expect(first.payload.characterLength).toBe(first.payload.json.length);
  });

  it('normalizes ordering before validating the canonical round trip', () => {
    const document = fixture();
    const unordered = {
      ...document,
      layers: [...document.layers].reverse(),
      cells: {
        '4,3': { biome: 'forest' as const },
        '1,1': { biome: 'meadow' as const },
      },
    };
    const result = createMapDocumentExport(unordered);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.json).toBe(serializeMapDocumentV3(unordered));
    expect([...parseMapDocumentV3(result.payload.json).layers].map(({ order }) => order))
      .toEqual([...document.layers].map(({ order }) => order).sort((left, right) => left - right));
    expect(Object.keys(parseMapDocumentV3(result.payload.json).cells)).toEqual(['1,1', '4,3']);
  });

  it('sanitizes traversal, extensions, controls, device names, and long stems', () => {
    expect(sanitizeMapDocumentExportFilename('../Mary’s Orchard: Night?.JSON'))
      .toBe('marys-orchard-night.map.json');
    expect(sanitizeMapDocumentExportFilename('CON')).toBe('map-con.map.json');
    expect(sanitizeMapDocumentExportFilename('\u0000/..', 'Safe Island'))
      .toBe('safe-island.map.json');
    const long = sanitizeMapDocumentExportFilename('x'.repeat(200));
    expect(long).toBe(`${'x'.repeat(80)}.map.json`);
  });

  it('allows callers to lower but never raise the hard character and byte bounds', () => {
    const characterFailure = createMapDocumentExport(fixture(), { maximumCharacters: 10 });
    expect(characterFailure).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'size_limit_exceeded' }),
    });

    const byteFailure = createMapDocumentExport(
      { ...fixture(), title: 'Pâtisserie 🍎' },
      { maximumBytes: 10 },
    );
    expect(byteFailure).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'size_limit_exceeded' }),
    });

    expect(createMapDocumentExport(fixture(), { maximumCharacters: 0 })).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'invalid_limit' }),
    });
  });

  it('rejects oversized content before serialization', () => {
    const document = fixture();
    const oversized = {
      ...document,
      prefabs: Array.from({ length: MAP_DOCUMENT_EXPORT_MAX_PREFABS + 1 }, () => null),
    } as unknown as MapDocumentV3;

    expect(createMapDocumentExport(oversized)).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'content_limit_exceeded' }),
    });
  });

  it('returns a bounded schema error rather than exporting malformed runtime input', () => {
    const malformed = { ...fixture(), id: '../not-a-map-id' } as MapDocumentV3;
    expect(createMapDocumentExport(malformed)).toEqual({
      ok: false,
      error: {
        code: 'document_invalid',
        message: 'Map export has an invalid portable map id.',
      },
    });
  });
});
