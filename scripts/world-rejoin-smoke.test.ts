import { afterEach, expect, it, vi } from 'vitest';
import { Identity, Timestamp } from 'spacetimedb';
import { DbConnection, tables } from '@orchard/world-bindings';
import { REQUIRED_REJOIN_TABLES, compareWorldRejoinSnapshots } from './world-rejoin-snapshot.js';
import { captureAll, legacyMapRowsFromSql, LEGACY_MAP_SQL, rejoinMapTransport } from './world-rejoin-smoke.js';

const actor = Identity.fromString('a'.repeat(64));
const body = '{"title":"Historical 🌳","revision":13,"cells":{}}';
const names = ['map_id', 'revision', 'content_hash', 'document_json', 'asset_registry_revision', 'client_mutation_id', 'updated_by', 'updated_at'];
const scalar = (tag: string) => ({ [tag]: [] });
const product = (name: string, tag: string) => ({ Product: { elements: [{ name: { some: name }, algebraic_type: scalar(tag) }] } });
const types = [scalar('String'), scalar('U32'), scalar('String'), scalar('String'), scalar('String'), scalar('String'),
  product('__identity__', 'U256'), product('__timestamp_micros_since_unix_epoch__', 'I64')];
const sqlResult = () => [{ schema: { elements: names.map((name, index) => ({ name: { some: name }, algebraic_type: types[index] })) },
  rows: [['live-island', 13, 'map-hash', body, 'art-revision', 'edit-13', [`0x${actor.toHexString()}`], [1790000000000001]]] }];
const schema = (modern = false, privateLegacy = modern) => ({ sections: [
  { Tables: [{ source_name: 'live_map_document', table_access: privateLegacy ? { Private: [] } : { Public: [] } }] },
  ...(modern ? [{ Views: [{ source_name: 'liveMapHead', is_public: true, is_anonymous: true }] }] : []),
  { ExplicitNames: { entries: [{ Table: { source_name: 'live_map_document', canonical_name: 'live_map_document' } },
    { Function: { source_name: 'liveMapHead', canonical_name: 'live_map_head' } }] } },
] });

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function fixture(modern = false, digestRows?: readonly unknown[]) {
  const queries: unknown[][] = [];
  const cache: Record<string, { iter(): Iterable<unknown> }> = Object.fromEntries(REQUIRED_REJOIN_TABLES.filter(value => value.accessor !== 'liveMapDocument').map(value =>
    [value.accessor, { iter: () => value.cardinality === 'zero_or_more' ? [] : [{ id: value.accessor,
      ...(value.identityScoped ? { [value.identityField ?? 'identity']: actor } : {}) }] }]));
  if (modern) cache['liveMapHead'] = { iter: () => digestRows ?? [{ mapId: 'live-island', revision: 13, contentHash: 'map-hash',
    documentHash: 'not-used-here', assetRegistryRevision: 'art-revision', clientMutationId: 'edit-13', updatedBy: actor,
    updatedAt: new Timestamp(1790000000000001n) }] };
  let applied = () => {}; let rejected = () => {};
  const connection = { db: cache, disconnect: vi.fn(), subscriptionBuilder: () => ({
    onApplied(fn: () => void) { applied = fn; return this; }, onError(fn: () => void) { rejected = fn; return this; },
    subscribe(value: unknown[]) { queries.push(value); if (!modern && value.includes(tables.liveMapHead)) rejected(); else applied(); },
  }) };
  let connected: (connection: unknown, identity: Identity) => void = () => {};
  const builder = {
    withUri() { return this; }, withDatabaseName() { return this; }, withToken() { return this; },
    onConnect(fn: typeof connected) { connected = fn; return this; }, onConnectError() { return this; },
    build() { connected(connection, actor); return connection; },
  };
  vi.spyOn(DbConnection, 'builder').mockReturnValue(builder as unknown as ReturnType<typeof DbConnection.builder>);
  const fetcher = vi.fn(async (url: string, init: RequestInit) => {
    expect(init.headers).toMatchObject({ Authorization: 'Bearer local-fixture' });
    if (url.endsWith('/schema?version=10')) return Response.json(schema(modern));
    expect(modern).toBe(false);
    expect(url).toMatch(/\/sql$/u);
    expect(init.method).toBe('POST'); expect(init.body).toBe(LEGACY_MAP_SQL);
    return Response.json(sqlResult());
  });
  vi.stubGlobal('fetch', fetcher);
  return { queries, connection, fetcher };
}

it('captures all 44 continuity surfaces from old public SQL while preserving the 43 SDK identity queries', async () => {
  const world = fixture();
  const snapshot = await captureAll([{ label: 'owner', token: 'local-fixture' }]);
  expect(Object.keys(snapshot.identities[0]!.tables)).toHaveLength(44);
  expect(world.queries[0]).toHaveLength(43);
  expect(world.queries[0]).not.toContain(tables.liveMapHead);
  const sql = world.queries[0]!.map(query => (query as { toSql(): string }).toSql());
  for (const name of ['player_public', 'player_appearance', 'player_position', 'world_placeable']) {
    expect(sql.find(value => value.includes(`"${name}"`))).toContain(actor.toHexString());
  }
  expect(snapshot.identities[0]!.tables['liveMapDocument']).toEqual([{ mapId: 'live-island', revision: 13, contentHash: 'map-hash',
    documentHash: expect.stringMatching(/^[0-9a-f]{64}$/u), assetRegistryRevision: 'art-revision', clientMutationId: 'edit-13',
    updatedBy: { $identity: actor.toHexString() }, updatedAt: { $timestampMicros: '1790000000000001' } }]);
  expect(JSON.stringify(snapshot)).not.toContain(body);
  expect(world.connection.disconnect).toHaveBeenCalledOnce();
});

it('captures new public digest through SDK only and compares every old byte and audit pin', async () => {
  fixture(); const old = await captureAll([{ label: 'owner', token: 'local-fixture' }]);
  const digest = old.identities[0]!.tables['liveMapDocument'];
  const current = fixture(true, digest);
  const next = await captureAll([{ label: 'owner', token: 'local-fixture' }]);
  expect(current.queries[0]).toHaveLength(44); expect(current.queries[0]).toContain(tables.liveMapHead);
  expect(current.fetcher).toHaveBeenCalledOnce();
  expect(compareWorldRejoinSnapshots(old, next)).toEqual([]);
  for (const field of ['documentHash', 'clientMutationId', 'contentHash', 'assetRegistryRevision']) {
    const changed = { ...next, identities: [{ ...next.identities[0]!, tables: { ...next.identities[0]!.tables,
      liveMapDocument: [{ ...(digest![0] as object), [field]: 'changed' }] } }] };
    expect(compareWorldRejoinSnapshots(old, changed)).not.toEqual([]);
  }
});

it('refuses private legacy or private/malformed digest schemas without transport fallback', async () => {
  expect(() => rejoinMapTransport(schema(false, true))).toThrow('public_transport_missing');
  const hidden = schema(true); const view = (hidden.sections[1] as { Views: { is_public: boolean }[] }).Views[0]!; view.is_public = false;
  expect(() => rejoinMapTransport(hidden)).toThrow('digest_not_public');
  expect(() => rejoinMapTransport({ sections: [] })).toThrow('schema_invalid');
  expect(() => rejoinMapTransport({ tables: [] })).toThrow('schema_invalid');
  const missing = schema(true); missing.sections.pop(); expect(() => rejoinMapTransport(missing)).toThrow('schema_invalid');
  const current = fixture(true, []);
  await expect(captureAll([{ label: 'owner', token: 'local-fixture' }])).rejects.toThrow('required_row_count:liveMapDocument');
  expect(current.fetcher).toHaveBeenCalledOnce();
});

it.each([401, 403, 500])('fails schema authentication/server refusal %s without connecting or SQL fallback', async status => {
  const world = fixture(); world.fetcher.mockResolvedValue(new Response('hidden', { status }));
  await expect(captureAll([{ label: 'owner', token: 'local-fixture' }])).rejects.toThrow(`schema_rejected:${status}`);
  expect(world.queries).toHaveLength(0); expect(world.fetcher).toHaveBeenCalledOnce();
});

it('refuses legacy SQL permission errors and missing singleton rows', async () => {
  const world = fixture(); world.fetcher.mockResolvedValueOnce(Response.json(schema())).mockResolvedValueOnce(new Response('hidden', { status: 403 }));
  await expect(captureAll([{ label: 'owner', token: 'local-fixture' }])).rejects.toThrow('legacy_rejected:403');
  expect(world.fetcher).toHaveBeenCalledTimes(2); expect(world.connection.disconnect).toHaveBeenCalledOnce();
  const empty = fixture(); const result = sqlResult(); result[0]!.rows = [];
  empty.fetcher.mockResolvedValueOnce(Response.json(schema())).mockResolvedValueOnce(Response.json(result));
  await expect(captureAll([{ label: 'owner', token: 'local-fixture' }])).rejects.toThrow('required_row_count:liveMapDocument');
});

it('rejects malformed SQL columns, rows, identity and unsafe timestamps without losing any precision', () => {
  for (const modify of [
    (value: ReturnType<typeof sqlResult>) => { value[0]!.schema.elements[0]!.name.some = 'wrong'; },
    (value: ReturnType<typeof sqlResult>) => { value[0]!.rows[0]!.pop(); },
    (value: ReturnType<typeof sqlResult>) => { value[0]!.rows[0]![6] = ['invalid']; },
    (value: ReturnType<typeof sqlResult>) => { value[0]!.rows[0]![7] = [Number.MAX_SAFE_INTEGER + 1]; },
    (value: ReturnType<typeof sqlResult>) => { value[0]!.rows[0]![1] = 1.5; },
  ]) {
    const result = sqlResult(); modify(result); expect(() => legacyMapRowsFromSql(result)).toThrow('sql_invalid');
  }
  const precise = sqlResult(); precise[0]!.rows[0]![7] = ['9223372036854775807'];
  expect((legacyMapRowsFromSql(precise)[0] as { updatedAt: Timestamp }).updatedAt.microsSinceUnixEpoch).toBe(9223372036854775807n);
  precise[0]!.rows[0]![7] = ['9223372036854775808']; expect(() => legacyMapRowsFromSql(precise)).toThrow('sql_invalid');
});


it('keeps malformed response bodies out of error text and refuses oversized responses', async () => {
  const malformed = fixture(); malformed.fetcher.mockResolvedValue(new Response('private-body-marker'));
  await expect(captureAll([{ label: 'owner', token: 'local-fixture' }])).rejects.toThrow('rejoin_map_schema_invalid');
  expect(malformed.fetcher).toHaveBeenCalledOnce();
  const large = fixture(); large.fetcher.mockResolvedValue(new Response(new Uint8Array(16 * 1024 * 1024 + 1)));
  await expect(captureAll([{ label: 'owner', token: 'local-fixture' }])).rejects.toThrow('rejoin_map_schema_too_large');
  expect(large.fetcher).toHaveBeenCalledOnce();
});
