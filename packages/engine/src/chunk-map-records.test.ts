import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { bootstrapContentRegistry, createMapPrefabDocument, type MapPrefabDocumentV2 } from '@orchard/sim';
import type { WorldChunk, WorldChunkManifest, WorldChunkRecord } from '@orchard/sim/world-chunk';
import { buildChunkWindowMapRecords, chunkMapRecordsReach, chunkMapViewAllowanceTiles } from './chunk-map-records.js';
import { CHUNK_WINDOW_MARGIN_TILES } from './chunk-terrain-window.js';
import type { TerrainArray } from './terrain-array.js';

const document = { id: 'live-island', layers: [{ id: 'objects', order: 30 }, { id: 'ground', order: 20 }],
  prefabs: [{ id: 'crate' }], provenance: { kind: 'generated' } };
const authority = { schema: 1, combatRegions: [{ id: 'arena', spaceId: 0, minX: 0, minY: 0, maxX: 9, maxY: 9, policy: 'hostile' }],
  generatedSuppressions: ['decoration-2', 'resource-9'], collisions: { ground: {}, water: {} } };

function manifest(metadata: Record<string, unknown> = { document, authority }): WorldChunkManifest {
  return { schema: 1, chunkSize: 64, spaceId: 0, width: 192, height: 192, assetRevision: 'a', sourceRevision: 1, sourceHash: 'h',
    metadata, chunks: [] } as unknown as WorldChunkManifest;
}
const object = (id: string, tileX: number, tileY: number) => ({ id, prefabId: 'crate', prefabRevision: 0, tileX, tileY, elevation: 0,
  layer: 'objects', quarterTurns: 0, flipX: false, enabled: true });
const decoration = (id: number, tileX: number, tileY: number) => ({ id, kind: 'poi_rock_small', tileX, tileY, variant: 0, animationOffset: 0 });
const landmark = (id: string, tileX: number, tileY: number) => ({ id, sourceDecorationId: 100, groupId: 'g', groupLabel: 'G', kind: 'camp_tent',
  tileX, tileY, elevation: 0, layer: 'objects', variant: 0, animationOffset: 0, quarterTurns: 0, flipX: false, enabled: true });
function chunk(records: readonly WorldChunkRecord[], authoritySchema = 1): WorldChunk {
  return { authoritySchema, records } as unknown as WorldChunk;
}
const at = (kind: string, ordinal: number, value: { tileX: number; tileY: number } & Record<string, unknown>): WorldChunkRecord =>
  ({ kind, ordinal, tileX: value.tileX, tileY: value.tileY, value } as unknown as WorldChunkRecord);

describe('chunk window map records (static world S4e)', () => {
  const chunks = new Map<string, WorldChunk>([
    ['0:0', chunk([at('objects', 2, object('c', 10, 10)), at('decoration', 3, decoration(3, 5, 5)), at('authority.walkable', 0, { tileX: 1, tileY: 2 }),
      at('authority.ground.obstacle', 0, { tileX: 0, tileY: 0 })])],
    ['1:0', chunk([at('objects', 0, object('a', 70, 1)), at('decoration', 1, { ...decoration(1, 80, 3), landmark: landmark('tent', 80, 3) }),
      at('landmarks', 0, landmark('tent', 80, 3))])],
    ['0:1', chunk([at('objects', 1, object('b', 1, 70)), at('decoration', 2, decoration(2, 3, 70))])],
    // Outside the window's resident set.
    ['1:1', chunk([at('objects', 3, object('d', 70, 70)), at('decoration', 0, decoration(0, 66, 66))])],
  ]);
  const rect = { cx: 0, cy: 0, columns: 2, rows: 2 };
  const present = new Set(['0:0', '1:0', '0:1']);

  it('reads the resident chunks records in stream order with the manifest map metadata', () => {
    const source = { manifest: manifest(), peekChunk: (cx: number, cy: number) => chunks.get(`${cx}:${cy}`) };
    const records = buildChunkWindowMapRecords(source, { rect, present, manifest: source.manifest });
    expect(records.objects.map(({ id }) => id)).toEqual(['a', 'b', 'c']);
    expect(records.decorations.map(({ id }) => id)).toEqual([1, 2, 3]);
    expect(records.decorations[0]!.landmark?.id).toBe('tent');
    expect(records.landmarks.map(({ id }) => id)).toEqual(['tent']);
    expect(records.walkable).toEqual([{ tileX: 1, tileY: 2 }]);
    expect([records.id, records.layers, records.prefabs]).toEqual([document.id, document.layers, document.prefabs]);
    expect(records.combatRegions).toEqual(authority.combatRegions);
    expect(records.generatedSuppressions).toEqual(authority.generatedSuppressions);
    expect([...records.present].sort()).toEqual([...present].sort());
    expect(records.source).toBe('chunks');
  });

  it('reads authority records only from a known authority version: a later one keeps its map records but no walkable tiles (BUG-044)', () => {
    for (const [version, walkable] of [[1, [{ tileX: 1, tileY: 2 }]], [2, [{ tileX: 1, tileY: 2 }]], [3, []]] as const) {
      const source = { manifest: manifest(), peekChunk: (cx: number, cy: number) => cx === 0 && cy === 0
        ? chunk(chunks.get('0:0')!.records, version) : chunks.get(`${cx}:${cy}`) };
      const records = buildChunkWindowMapRecords(source, { rect, present, manifest: source.manifest });
      expect(records.walkable, `version ${version}`).toEqual(walkable);
      expect(records.objects.map(({ id }) => id), `version ${version}`).toEqual(['a', 'b', 'c']);
    }
  });

  it('skips a chunk evicted since the window was built, and lists it', () => {
    const source = { manifest: manifest(), peekChunk: (cx: number, cy: number) => cx === 0 && cy === 1 ? undefined : chunks.get(`${cx}:${cy}`) };
    const records = buildChunkWindowMapRecords(source, { rect, present, manifest: source.manifest });
    expect(records.evicted).toEqual(['0:1']);
    expect([...records.present].sort()).toEqual(['0:0', '1:0']);
    expect(records.objects.map(({ id }) => id)).toEqual(['a', 'c']);
    expect(buildChunkWindowMapRecords({ ...source, peekChunk: (cx, cy) => chunks.get(`${cx}:${cy}`) },
      { rect, present, manifest: source.manifest }).evicted).toEqual([]);
  });

  it('fails closed on missing metadata, malformed or duplicated records, or another manifest', () => {
    const build = (options: { metadata?: Record<string, unknown>; extra?: WorldChunkRecord; peek?: (key: string) => WorldChunk | undefined; other?: boolean }) => {
      const source = { manifest: manifest(options.metadata), peekChunk: (cx: number, cy: number) => options.peek !== undefined ? options.peek(`${cx}:${cy}`)
        : cx === 0 && cy === 0 && options.extra !== undefined ? chunk([...chunks.get('0:0')!.records, options.extra]) : chunks.get(`${cx}:${cy}`) };
      return () => buildChunkWindowMapRecords(source, { rect, present, manifest: options.other === true ? manifest() : source.manifest });
    };
    expect(build({ metadata: { document } })).toThrow('chunk_map_records_authority_missing');
    expect(build({ metadata: { authority, document: { provenance: {} } } })).toThrow('chunk_map_records_document_missing');
    expect(build({ extra: at('objects', 9, { ...object('x', 3, 3), prefabId: undefined } as never) })).toThrow('chunk_map_record_invalid:objects@0,0#9');
    expect(build({ extra: at('decoration', 9, { ...decoration(9, 3, 3), kind: 4 } as never) })).toThrow('chunk_map_record_invalid:decoration@0,0#9');
    expect(build({ extra: at('decoration', 9, { ...decoration(9, 3, 3), landmark: { id: 'x' } } as never) })).toThrow('chunk_map_record_invalid:decoration@0,0#9');
    expect(build({ extra: at('objects', 1, object('dup', 3, 3)) })).toThrow('chunk_map_record_order:objects#1');
    expect(build({ other: true })).toThrow('chunk_map_records_manifest_mismatch');
  });

  it('checks that no prefab placement plus light can reach past the window margin', () => {
    const registry = bootstrapContentRegistry();
    // The bootstrap content: its lights with the largest prefab the S4e fixture uses (a 3 x 3 tree).
    const tree: MapPrefabDocumentV2 = { ...createMapPrefabDocument({ id: 'tree', title: 'tree', width: 3, height: 3 }), pivot: { tileX: 1, tileY: 2 },
      cells: [{ id: 'root', tileX: 2, tileY: 2, elevation: 0, collisionMask: 1 }] };
    const flat = { elevations: new Int16Array(1), width: 1, height: 1 } as unknown as TerrainArray;
    const view = chunkMapViewAllowanceTiles(flat);
    expect(view).toBe(4);
    const reach = chunkMapRecordsReach([tree], registry, view);
    expect(reach).toMatchObject({ prefabTiles: 3, marginTiles: CHUNK_WINDOW_MARGIN_TILES, fits: true });
    expect(reach.lightTiles).toBeGreaterThanOrEqual(6);
    expect(reach.prefabTiles + reach.lightTiles + reach.viewTiles).toBeLessThanOrEqual(CHUNK_WINDOW_MARGIN_TILES);
    // A building-sized prefab does not fit: the records refuse to serve.
    const hall = { ...tree, id: 'hall', width: 24, pivot: { tileX: 0, tileY: 0 }, cells: [{ id: 'far', tileX: 12, tileY: 0, elevation: 0, collisionMask: 1 }] };
    expect(chunkMapRecordsReach([tree, hall], registry, view).fits).toBe(false);
    const source = { manifest: manifest({ document: { ...document, prefabs: [hall] }, authority }), peekChunk: (cx: number, cy: number) => chunks.get(`${cx}:${cy}`) };
    expect(() => buildChunkWindowMapRecords(source, { rect, present, manifest: source.manifest }, { reach: { registry, viewTiles: view } }))
      .toThrow(/^chunk_map_records_reach_exceeds_margin:prefab=25,/u);
    expect(buildChunkWindowMapRecords(source, { rect, present, manifest: source.manifest }).objects).toHaveLength(3);
  });

  it('is generator-free: its value imports are the shared chunk-collision and world-chunk leaves and the window modules', () => {
    const file = new URL('./chunk-map-records.ts', import.meta.url);
    const source = ts.createSourceFile(file.pathname, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, false);
    const values = source.statements.filter(ts.isImportDeclaration).filter(statement => statement.importClause?.isTypeOnly !== true)
      .map(statement => (statement.moduleSpecifier as ts.StringLiteral).text);
    expect(values).toEqual(['@orchard/sim/chunk-collision', '@orchard/sim/world-chunk', './chunk-terrain-window.js', './terrain-sampling.js']);
  });
});
