import { describe, expect, it } from 'vitest';
import { createMapPrefabDocument, type MapPrefabDocumentV2 } from './map-prefab.js';
import { MAP_DOCUMENT_SCHEMA_VERSION, type MapDocumentV2 } from './map-document.js';
import { SURVIVAL_BIOMES } from './survival-biomes.js';
import { mapDocumentV3Hash, migrateMapDocumentV2, parseMapDocumentV3, serializeMapDocumentV3, type MapDocumentV3 } from './map-document-v3.js';
import {
  WORLD_CHUNK_DOCUMENT_SCHEMA, WORLD_CHUNK_SIZE, WORLD_CHUNK_STRIDE, canonicalChunkJson, decodeWorldChunk, encodeWorldChunk,
  type ChunkJson, type WorldChunk, type WorldChunkDocumentCells, type WorldChunkManifest, type WorldChunkRecord,
} from './world-chunk.js';
import { decodeWorldChunk as legacyDecodeWorldChunk, encodeWorldChunk as legacyEncodeWorldChunk } from './world-chunk.schema1-legacy.fixture.js';
import {
  WORLD_CHUNK_DOCUMENT_LIST_RECORDS, WORLD_CHUNK_DOCUMENT_METADATA_KEYS, authoredCellConsultsBaseBiome, manifestCarriesAuthoredDocument,
  normalizedMapDocumentSemanticHash, normalizedMapDocumentSha256, rebuildWorldChunkDocument, worldChunkAuthoredDocument, worldChunkBaseBiomes, worldChunkDocumentCellsByChunk,
  worldChunkDocumentKeyOrders,
} from './world-chunk-document.js';

function ordered<T extends object>(value: T, first: readonly string[]): T {
  const source = value as Record<string, unknown>;
  return Object.fromEntries([...first.filter(key => key in source), ...Object.keys(source).filter(key => !first.includes(key))]
    .map(key => [key, source[key]])) as T;
}

/** A small (2×1 chunk) authored document with every cell field and document list,
 * published as hand-ordered JSON (history-dependent key orders, as in production). */
function liveDocument(): MapDocumentV3 {
  const v2: MapDocumentV2 = {
    schemaVersion: MAP_DOCUMENT_SCHEMA_VERSION, id: 'round-trip', title: 'Round Trip', width: 128, height: 64, tileSize: 16,
    themeId: 'orchard_stone', baseElevation: 0, baseSurface: 'grass', defaultCliffFamily: 'stone_1', defaultSurfaceFamily: 'grass_1', revision: 3,
    cells: {
      '1,1': { elevation: 1, surface: 'stone', cliffFamily: 'stone_1' },
      '2,1': { surface: 'water', feature: 'river' },
      '3,1': { collision: 'force_block', collisionReason: 'fence line' },
      '4,1': { collision: 'force_walk', ledge: true, surfaceFamily: 'grass_1' },
      '5,1': { elevation: 1, terrainOverride: { frameIndex: 4, contourLevel: 1 } as never },
      '6,1': { parts: [{ slot: 'water', exact: { frame: 4 } }] },
      '7,1': { elevation: 1, parts: [{ slot: 'water', exact: { frame: 5 } }] },
      '70,10': { elevation: 1, surface: 'stone', cliffFamily: 'stone_1' },
      '127,63': { surface: 'sand', feature: 'path' },
    },
    transitions: [
      { contourLevel: 1, kind: 'slope', direction: 'up', lowerTileX: 10, lowerTileY: 11, upperTileX: 10, upperTileY: 10 },
      ordered({ contourLevel: 1, kind: 'slope', direction: 'up', lowerTileX: 11, lowerTileY: 11, upperTileX: 11, upperTileY: 10 } as const, ['upperTileY', 'lowerTileX']),
    ],
    stairRuns: [{ x: 20, y: 20, direction: 'up', fromLevel: 0, toLevel: 1 }],
    scenery: [{ id: 'bench-1', assetId: 'bench_oak', tileX: 66, tileY: 3, elevation: 0, state: 'open' }],
    anchors: [{ id: 'spawn-a', kind: 'spawn', tileX: 2, tileY: 2, elevation: 0 }, { id: 'poi-a', kind: 'poi', tileX: 90, tileY: 5, elevation: 0, label: 'Old Well' }],
    provenance: { kind: 'authored', source: 'round-trip-test' },
  };
  const crate: MapPrefabDocumentV2 = { ...createMapPrefabDocument({ id: 'crate', title: 'Crate', width: 1, height: 1 }),
    pivot: { tileX: 0, tileY: 0 }, cells: [{ id: 'cell', tileX: 0, tileY: 0, elevation: 0, collisionMask: 0x0660 }] };
  const placement = { id: 'visual-1', assetId: 7, assetName: 'tree', visual: { kind: 'animation', name: 'base', frameIndex: 0 },
    tileX: 0, tileY: 0, elevation: 0, layer: 'canopy', quarterTurns: 0, flipX: false } as const;
  const pair: MapPrefabDocumentV2 = { ...createMapPrefabDocument({ id: 'pair', title: 'Pair', width: 2, height: 1 }),
    placements: [placement, ordered({ ...placement, id: 'visual-2', tileX: 1 }, ['id', 'assetId', 'assetName', 'tileX', 'tileY', 'elevation', 'visual'])] as never };
  const document: MapDocumentV3 = { ...migrateMapDocumentV2(v2),
    cells: { ...v2.cells, '8,1': { biome: 'beach' }, '1,1': { ...v2.cells['1,1']!, biome: 'highland' } },
    prefabs: [crate, pair],
    objects: [{ id: 'crate-1', prefabId: 'crate', prefabRevision: crate.revision, tileX: 64, tileY: 0, elevation: 0, layer: 'ground', enabled: true, quarterTurns: 0, flipX: false }],
    landmarks: [{ id: 'landmark-9', sourceDecorationId: 9, groupId: 'well', groupLabel: 'Well', kind: 'well', tileX: 12, tileY: 12, elevation: 0, layer: 'objects',
      variant: 0, animationOffset: 0, quarterTurns: 0, flipX: false, enabled: false }],
    generatedSuppressions: ['decoration-4'],
    entityStates: [{ id: 'resource:5', entityKind: 'resource', entityId: '5', baseState: { lit: false }, state: { lit: true } }],
    resourcePlacements: [{ id: '5', originTileX: 60, originTileY: 5, tileX: 65, tileY: 5 }],
    combatRegions: [{ id: 'arena', spaceId: 0, minX: 0, minY: 0, maxX: 20, maxY: 20, policy: 'hostile' }],
  };
  const source = ordered({ ...document, provenance: ordered(document.provenance, ['source', 'kind']) },
    ['schemaVersion', 'id', 'title', 'width', 'height', 'tileSize', 'themeId', 'baseElevation', 'baseSurface', 'defaultCliffFamily', 'defaultSurfaceFamily',
      'revision', 'cells', 'transitions', 'stairRuns', 'scenery', 'anchors', 'provenance', 'baseBiome', 'layers', 'prefabs', 'objects', 'generatedSuppressions', 'landmarks']);
  return parseMapDocumentV3(JSON.stringify(source));
}

interface Published { readonly manifest: WorldChunkManifest; readonly blobs: Map<string, Uint8Array>; readonly chunks: Omit<WorldChunk, 'contentHash'>[] }
/** Mirrors what the materializer publishes for the document, with and without the extension. */
function publish(document: MapDocumentV3, extension = true): Published {
  const normalized = JSON.parse(serializeMapDocumentV3(document)) as Record<string, ChunkJson> & { cells: Record<string, Record<string, ChunkJson>> };
  const authored = worldChunkAuthoredDocument(normalized, mapDocumentV3Hash({ ...document, revision: 0 }));
  const cells = worldChunkDocumentCellsByChunk(normalized.cells, document.width, document.height);
  const records: WorldChunkRecord[] = [];
  for (const [key, kind] of Object.entries(WORLD_CHUNK_DOCUMENT_LIST_RECORDS)) {
    ((document as unknown as Record<string, readonly Record<string, number>[] | undefined>)[key] ?? []).forEach((value, ordinal) => records.push({
      kind, ordinal, tileX: Math.min(document.width - 1, value['tileX'] ?? value['x']!), tileY: Math.min(document.height - 1, value['tileY'] ?? value['y']!),
      value: JSON.parse(JSON.stringify(value)) as ChunkJson }));
  }
  const chunks: Omit<WorldChunk, 'contentHash'>[] = [];
  for (let cx = 0; cx < document.width / WORLD_CHUNK_SIZE; cx++) {
    const cellParts: Record<string, ChunkJson> = {};
    for (const [key, cell] of Object.entries(document.cells)) {
      const [x, y] = key.split(',').map(Number) as [number, number];
      if (Math.floor(x / WORLD_CHUNK_SIZE) === cx && cell.parts !== undefined) cellParts[String(y * WORLD_CHUNK_SIZE + x % WORLD_CHUNK_SIZE)] = JSON.parse(JSON.stringify(cell.parts)) as ChunkJson;
    }
    chunks.push({ schema: 1, spaceId: 0, cx, cy: 0, assetRevision: 'assets', arrays: { biomes: new Uint8Array(WORLD_CHUNK_STRIDE ** 2) },
      records: records.filter(record => Math.floor(record.tileX / WORLD_CHUNK_SIZE) === cx), assetIds: [], atlasPackIds: [],
      ...(Object.keys(cellParts).length > 0 ? { cellParts } : {}),
      ...(extension ? { documentSchema: WORLD_CHUNK_DOCUMENT_SCHEMA, documentCells: cells.get(`${cx}:0`) ?? { palette: [], cells: [] } } : {}) });
  }
  const bytes = chunks.map(chunk => encodeWorldChunk(chunk));
  const metadata = JSON.parse(canonicalChunkJson({
    biomePalette: SURVIVAL_BIOMES,
    document: Object.fromEntries(WORLD_CHUNK_DOCUMENT_METADATA_KEYS.map(key => [key, (document as unknown as Record<string, unknown>)[key]])),
    ...(extension ? { authoredDocument: authored } : {}),
  })) as Record<string, ChunkJson>;
  const heads = bytes.map((blob, index) => ({ cx: index, cy: 0, contentHash: decodeWorldChunk(blob).contentHash, byteLength: blob.length }));
  return { chunks, blobs: new Map(heads.map((head, index) => [head.contentHash, bytes[index]!])),
    manifest: { schema: 1, chunkSize: WORLD_CHUNK_SIZE, spaceId: 0, width: document.width, height: document.height, assetRevision: 'assets',
      sourceRevision: 4, sourceHash: 'source', metadata, chunks: heads } };
}

describe('world chunk document round trip (static-world S7a)', () => {
  it('rebuilds the live document, key order included, from the chunks and manifest alone', () => {
    const live = liveDocument();
    const { manifest, blobs } = publish(live);
    expect(manifestCarriesAuthoredDocument(manifest)).toBe(true);
    const rebuilt = rebuildWorldChunkDocument(manifest, hash => blobs.get(hash));
    expect(serializeMapDocumentV3(rebuilt)).toBe(serializeMapDocumentV3(live));
    expect(mapDocumentV3Hash({ ...rebuilt, revision: 0 })).toBe(mapDocumentV3Hash({ ...live, revision: 0 }));
    expect(rebuilt.revision).toBe(3); // the document's own revision, not the manifest's source revision
    // The hand-ordered publication really differs from canonical order, and survives.
    expect(Object.keys(rebuilt).indexOf('generatedSuppressions')).toBeLessThan(Object.keys(rebuilt).indexOf('landmarks'));
    expect(Object.keys(rebuilt.provenance)).toEqual(['source', 'kind']);
    expect(Object.keys(rebuilt.cells['5,1']!.terrainOverride!)).toEqual(['frameIndex', 'contourLevel']);
    const authored = manifest.metadata['authoredDocument'] as { keyOrderChoices: Record<string, number[]> };
    expect(Object.keys(authored.keyOrderChoices).sort()).toEqual(['prefabs[].placements[]', 'transitions[]']);
  });

  it('verifies the full text, not only the 32-bit semantic hash, which folds astral characters together', () => {
    const live = { ...liveDocument(), title: '\u{1F600}' };
    const { manifest, blobs } = publish(live);
    const normalized = JSON.parse(serializeMapDocumentV3(live)) as Record<string, unknown>;
    // FNV over charCodeAt(0) of each code point: the two emoji share a high surrogate and collide.
    expect(normalizedMapDocumentSemanticHash({ ...normalized, title: '\u{1F601}' })).toBe(normalizedMapDocumentSemanticHash(normalized));
    expect(normalizedMapDocumentSha256({ ...normalized, title: '\u{1F601}' })).not.toBe(normalizedMapDocumentSha256(normalized));
    const metadata = manifest.metadata['authoredDocument'] as Record<string, ChunkJson>;
    expect(metadata['documentSha256']).toBe(normalizedMapDocumentSha256(normalized));
    const tampered = { ...manifest, metadata: { ...manifest.metadata, authoredDocument: { ...metadata, fields: { ...(metadata['fields'] as object), title: '\u{1F601}' } } } };
    expect(() => rebuildWorldChunkDocument(tampered, hash => blobs.get(hash))).toThrow('chunk_document_sha256_mismatch');
    expect(rebuildWorldChunkDocument(manifest, hash => blobs.get(hash)).title).toBe('\u{1F600}');
  });

  it('computes Studio\'s semantic hash without the map-document module for normalized documents', () => {
    const live = liveDocument();
    const normalized = JSON.parse(serializeMapDocumentV3(live)) as object;
    expect(normalizedMapDocumentSemanticHash(normalized)).toBe(mapDocumentV3Hash({ ...live, revision: 0 }));
    expect(normalizedMapDocumentSemanticHash({ ...normalized, title: 'Other' })).not.toBe(mapDocumentV3Hash({ ...live, revision: 0 }));
  });

  it('captures one variant per key order and explicit choices only where two variants share a key set', () => {
    const orders = worldChunkDocumentKeyOrders({ list: [{ a: 1, b: 2 }, { b: 1, a: 2 }, { a: 3 }], one: [{ x: 1, y: 1 }, { x: 2 }] });
    expect(orders.keyOrders).toEqual({ '': [['list', 'one']], 'list[]': [['a', 'b'], ['b', 'a'], ['a']], 'one[]': [['x', 'y'], ['x']] });
    expect(orders.keyOrderChoices).toEqual({ 'list[]': [0, 1, 2] });
  });

  it('palette-encodes sparse cells per chunk and keeps parts in cellParts only', () => {
    const cells = worldChunkDocumentCellsByChunk({ '1,0': { surface: 'sand' }, '0,0': { surface: 'sand' }, '2,0': { parts: [] }, '65,1': { elevation: 1, parts: [] } }, 128, 64);
    expect([...cells.entries()]).toEqual([['0:0', { palette: [{ surface: 'sand' }], cells: [0, 0, 1, 0] }], ['1:0', { palette: [{ elevation: 1 }], cells: [65, 0] }]]);
    expect(() => worldChunkDocumentCellsByChunk({ '128,0': { surface: 'sand' } }, 128, 64)).toThrow(/cell_key_invalid/u);
    // Base biomes are recorded only for consulting cells, and only where the caller reports a lost generated biome.
    const withBases = worldChunkDocumentCellsByChunk({ '0,0': { biome: 'beach' }, '1,0': { surface: 'sand', biome: 'beach' }, '2,0': { surface: 'sand' },
      '3,0': { elevation: 2 }, '4,0': { feature: 'path' } }, 128, 64, (tileX) => tileX === 4 ? undefined : 7);
    expect(withBases.get('0:0')!.baseBiomes).toEqual([0, 7, 2, 7]);
    expect(worldChunkBaseBiomes({ documentSchema: 1, documentCells: withBases.get('0:0')! }, 8)).toEqual(new Map([[0, 7], [2, 7]]));
    // Bounded by the manifest's biome palette, and never read from a later document schema.
    expect(() => worldChunkBaseBiomes({ documentSchema: 1, documentCells: withBases.get('0:0')! }, 7)).toThrow('chunk_document_base_biome_invalid');
    expect(() => worldChunkBaseBiomes({ documentSchema: 2, documentCells: withBases.get('0:0')! }, 8)).toThrow('chunk_document_schema_unsupported');
    expect('baseBiomes' in cells.get('0:0')!).toBe(false);
  });

  it('knows which authored cells consult the generated biome', () => {
    expect([{ biome: 'beach' }, { biome: 'beach', surface: 'sand' }, { surface: 'sand' }, { feature: 'path' }, { feature: 'path', biome: 'plains' },
      { elevation: 1 }, { collision: 'force_block' }, { parts: [] }].map(authoredCellConsultsBaseBiome))
      .toEqual([true, false, true, true, true, false, false, false]); // a feature does not author the surface
    expect(() => worldChunkDocumentCellsByChunk({ '01,0': { surface: 'sand' } }, 128, 64)).toThrow(/cell_key_invalid/u);
  });

  it('fails closed on a missing blob, a chunk without the extension, lost records or cells, and a hash mismatch', () => {
    const live = liveDocument();
    const { manifest, blobs, chunks } = publish(live);
    const read = (hash: string) => blobs.get(hash);
    expect(() => rebuildWorldChunkDocument(publish(live, false).manifest, read)).toThrow('chunk_document_metadata_missing');
    expect(() => rebuildWorldChunkDocument(manifest, hash => hash === manifest.chunks[1]!.contentHash ? undefined : read(hash))).toThrow('chunk_document_blob_missing');
    const withChunk = (index: number, chunk: Omit<WorldChunk, 'contentHash'>): [WorldChunkManifest, (hash: string) => Uint8Array | undefined] => {
      const bytes = encodeWorldChunk(chunk);
      const head = { ...manifest.chunks[index]!, contentHash: decodeWorldChunk(bytes).contentHash, byteLength: bytes.length };
      return [{ ...manifest, chunks: manifest.chunks.map((row, at) => at === index ? head : row) }, hash => hash === head.contentHash ? bytes : read(hash)];
    };
    const bare: Record<string, unknown> = { ...chunks[0]! }; delete bare['documentSchema']; delete bare['documentCells'];
    expect(() => rebuildWorldChunkDocument(...withChunk(0, bare as Omit<WorldChunk, 'contentHash'>))).toThrow('chunk_document_extension_missing');
    expect(() => rebuildWorldChunkDocument(...withChunk(1, { ...chunks[1]!, records: chunks[1]!.records.filter(record => record.kind !== 'objects') }))).toThrow('chunk_document_records_incomplete: objects');
    const cells = chunks[0]!.documentCells!;
    expect(() => rebuildWorldChunkDocument(...withChunk(0, { ...chunks[0]!, documentCells: { palette: [cells.palette[cells.cells[1]!]!], cells: [cells.cells[0]!, 0] } }))).toThrow('chunk_document_cells_incomplete');
    const altered: WorldChunkDocumentCells = { palette: cells.palette.map((entry, index) => index === 0 ? { ...entry, elevation: 9 } : entry), cells: cells.cells };
    expect(() => rebuildWorldChunkDocument(...withChunk(0, { ...chunks[0]!, documentCells: altered }))).toThrow('chunk_document_sha256_mismatch');
    const withBase = (biome: number) => withChunk(0, { ...chunks[0]!, documentCells: { ...cells, baseBiomes: [cells.cells[0]!, biome] } });
    expect(() => rebuildWorldChunkDocument(...withBase(SURVIVAL_BIOMES.length - 1))).not.toThrow();
    expect(() => rebuildWorldChunkDocument(...withBase(SURVIVAL_BIOMES.length))).toThrow('chunk_document_base_biome_invalid');
    const metadata = manifest.metadata['authoredDocument'] as Record<string, ChunkJson>;
    const withMetadata = (value: Record<string, ChunkJson>) => ({ ...manifest, metadata: { ...manifest.metadata, authoredDocument: value } });
    expect(() => rebuildWorldChunkDocument(withMetadata({ ...metadata, semanticHash: '00000000' }), read)).toThrow('chunk_document_semantic_hash_mismatch');
    // The semantic hash pins the revision to 0; the SHA-256 of the full text does not.
    const fields = metadata['fields'] as Record<string, ChunkJson>;
    expect(() => rebuildWorldChunkDocument(withMetadata({ ...metadata, fields: { ...fields, revision: 999 } }), read)).toThrow('chunk_document_sha256_mismatch');
    expect(() => rebuildWorldChunkDocument({ ...manifest, metadata: { ...manifest.metadata, biomePalette: null } }, read)).toThrow('chunk_document_metadata_missing');
    expect(() => rebuildWorldChunkDocument(withMetadata({ ...metadata, keyOrders: { ...(metadata['keyOrders'] as object), 'scenery[]': [] } }), read)).toThrow('chunk_document_key_order_missing: scenery[]');
    expect(() => rebuildWorldChunkDocument(withMetadata({ ...metadata, fields: { ...(metadata['fields'] as object), extra: 1 } }), read)).toThrow('chunk_document_key_unplaced: extra');
    expect(() => rebuildWorldChunkDocument({ ...manifest, width: 64 }, read)).toThrow('chunk_document_dimensions_mismatch');
  });

  it('decodes a later document schema for runtime use (payload ignored) and the rebuild refuses it', () => {
    const live = liveDocument();
    const { manifest, blobs, chunks } = publish(live);
    const future = { ...chunks[1]!, documentSchema: 2, documentCells: { future: [1, 2, 3] } } as unknown as Omit<WorldChunk, 'contentHash'>;
    const bytes = encodeWorldChunk(future);
    const decoded = decodeWorldChunk(bytes);
    expect(decoded.documentSchema).toBe(2);
    expect(decoded.arrays).toEqual(chunks[1]!.arrays);
    expect(decoded.records).toEqual(chunks[1]!.records);
    expect(legacyDecodeWorldChunk(bytes).records).toEqual(chunks[1]!.records);
    const head = { ...manifest.chunks[1]!, contentHash: decoded.contentHash, byteLength: bytes.length };
    expect(() => rebuildWorldChunkDocument({ ...manifest, chunks: [manifest.chunks[0]!, head] }, hash => hash === head.contentHash ? bytes : blobs.get(hash)))
      .toThrow('chunk_document_schema_unsupported');
  });

  it('is an additive codec extension: validated when present, invisible to deployed decoders, absent bytes unchanged', () => {
    const { chunks } = publish(liveDocument());
    const chunk = chunks[0]!;
    const bytes = encodeWorldChunk(chunk);
    expect(decodeWorldChunk(bytes)).toEqual({ ...chunk, contentHash: expect.any(String) });
    // The frozen schema-1 decoder accepts the extended blob, with identical channels and records.
    const legacy = legacyDecodeWorldChunk(bytes);
    expect(legacy.arrays).toEqual(chunk.arrays);
    expect(legacy.records).toEqual(chunk.records);
    const bare: Record<string, unknown> = { ...chunk }; delete bare['documentSchema']; delete bare['documentCells'];
    expect(encodeWorldChunk(bare as Omit<WorldChunk, 'contentHash'>)).toEqual(legacyEncodeWorldChunk(bare as Omit<WorldChunk, 'contentHash'>));
    expect('documentSchema' in decodeWorldChunk(encodeWorldChunk(bare as Omit<WorldChunk, 'contentHash'>))).toBe(false);
    const cells = chunk.documentCells!;
    const invalid = (documentCells: unknown, documentSchema: unknown = 1) => encodeWorldChunk({ ...chunk, documentSchema, documentCells } as Omit<WorldChunk, 'contentHash'>);
    const withoutSchema: Record<string, unknown> = { ...chunk }; delete withoutSchema['documentSchema'];
    expect(() => invalid(cells, 2)).not.toThrow(); // a later version is additive (see the test above)
    expect(() => invalid(undefined)).toThrow(/document cells/u);
    expect(() => encodeWorldChunk(withoutSchema as Omit<WorldChunk, 'contentHash'>)).toThrow(/document cells/u);
    expect(() => invalid({ palette: cells.palette, cells: [...cells.cells, 5] })).toThrow(/document cells/u);
    expect(() => invalid({ palette: cells.palette, cells: [4096, 0] })).toThrow(/document cell index/u);
    expect(() => invalid({ palette: cells.palette, cells: [1, 0, 1, 0] })).toThrow(/document cell index/u);
    expect(() => invalid({ palette: cells.palette, cells: [0, cells.palette.length] })).toThrow(/document cell index/u);
    expect(() => invalid({ palette: [...cells.palette, { surface: 'sand' }], cells: cells.cells })).toThrow(/Unused document cell palette/u);
    expect(() => invalid({ palette: [{ parts: [] }], cells: [0, 0] })).toThrow(/document cell palette/u);
    expect(() => invalid({ palette: [{}], cells: [0, 0] })).toThrow(/document cell palette/u);
    for (const schema of [0, -1, 1.5, '2', null]) expect(() => invalid(cells, schema), String(schema)).toThrow(/document cells/u);
    const authored = cells.cells[0]!, other = cells.cells[2]!;
    expect(decodeWorldChunk(invalid({ ...cells, baseBiomes: [authored, 3] })).documentCells!.baseBiomes).toEqual([authored, 3]);
    expect(legacyDecodeWorldChunk(invalid({ ...cells, baseBiomes: [authored, 3] })).records).toEqual(chunk.records);
    expect(() => invalid({ ...cells, baseBiomes: [] })).toThrow(/base biomes/u);
    expect(() => invalid({ ...cells, baseBiomes: [authored] })).toThrow(/base biomes/u);
    expect(() => invalid({ ...cells, baseBiomes: [4095, 3] })).toThrow(/base biome/u); // not an authored cell
    expect(() => invalid({ ...cells, baseBiomes: [other, 3, authored, 3] })).toThrow(/base biome/u);
    expect(() => invalid({ ...cells, baseBiomes: [authored, 256] })).toThrow(/base biome/u);
  });
});
