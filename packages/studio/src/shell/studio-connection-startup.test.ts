import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Identity, Timestamp } from 'spacetimedb';
import { bootstrapContentRows, contentDefinitionRowsHash } from '@orchard/sim';
import { DbConnection } from '@orchard/world-bindings';
import { chunkHistoryFixture } from '../../../world/src/live-map-chunk-history.fixture.js';
import { StudioConnection } from './studio-connection.js';
import { studioLiveContentSnapshot } from './live-content-readiness.js';

vi.mock('@orchard/auth', () => ({ localProfilesEnabled: true, oidcConfigured: false, readOidcSession: () => null }));

function connectFixture(manifest = chunkHistoryFixture()) {
  const source = bootstrapContentRows();
  const metadata = { updatedBy: Identity.fromString('01'.repeat(32)), updatedAt: new Timestamp(0n) };
  const rows = source.map(row => ({ ...row, slug: row.id.split(':')[1]!, revision: 7n, hash: contentDefinitionRowsHash([row]), ...metadata }));
  let shadow = { revision: 7n, contentHash: manifest.head.contentHash, manifestJson: manifest.manifestJson };
  const contentHead = { packId: 'live', revision: 7n, contentHash: contentDefinitionRowsHash(source), definitionCount: source.length,
    engineVersion: 1, clientMutationId: 'startup.test', ...metadata };
  const table = () => ({ iter: () => [], onInsert: vi.fn(), onUpdate: vi.fn(), onDelete: vi.fn() });
  const data: Record<string, unknown> = {
    worldChunkShadow: { ...table(), spaceId: { find: () => shadow } },
    contentHead: { ...table(), packId: { find: () => contentHead } },
    contentDefinition: { ...table(), iter: () => rows },
  };
  const subscriptions: { applied?: () => void; error?: () => void }[] = [];
  const connection = {
    db: new Proxy(data, { get(target, key: string) { return target[key] ??= table(); } }),
    disconnect: vi.fn(),
    subscriptionBuilder: () => {
      const callbacks: { applied?: () => void; error?: () => void } = {};
      const subscriber = {
        onApplied: (callback: () => void) => { callbacks.applied = callback; return subscriber; },
        onError: (callback: () => void) => { callbacks.error = callback; return subscriber; },
        subscribe: () => { subscriptions.push(callbacks); return { isActive: () => true, unsubscribe: vi.fn() }; },
      };
      return subscriber;
    },
  };
  let onConnect: ((connection: DbConnection, identity: Identity, token: string) => void) | undefined;
  const builder = {
    withUri: () => builder, withDatabaseName: () => builder, withToken: () => builder,
    onConnect: (callback: typeof onConnect) => { onConnect = callback; return builder; },
    onConnectError: () => builder, onDisconnect: () => builder,
    build: () => connection,
  };
  vi.spyOn(DbConnection, 'builder').mockReturnValue(builder as unknown as ReturnType<typeof DbConnection.builder>);
  const adapter = new StudioConnection('local', vi.fn(), 'http://127.0.0.1:18179', 'bug079-local');
  adapter.connect();
  onConnect!(connection as unknown as DbConnection, metadata.updatedBy, 'nonsecret-fixture');
  subscriptions[0]!.applied!();
  return {
    adapter, subscriptions,
    replaceHead: (next: ReturnType<typeof chunkHistoryFixture>) => {
      shadow = { revision: BigInt(next.head.revision), contentHash: next.head.contentHash, manifestJson: next.manifestJson };
      subscriptions[0]!.applied!();
    },
  };
}

async function flush() { for (let index = 0; index < 20; index += 1) await Promise.resolve(); }

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn() });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('Studio startup authority isolation', () => {
  it('keeps verified content usable through map failure and bounded automatic recovery', async () => {
    const fixture = chunkHistoryFixture();
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(null, { status: 429 }))
      .mockImplementation(async () => new Response(new Uint8Array(fixture.blobs.values().next().value!)));
    vi.stubGlobal('fetch', fetcher);
    const { adapter } = connectFixture(fixture);
    await flush();
    expect(adapter.view()).toMatchObject({ error: null, mapError: expect.stringContaining('Retrying'),
      mapLoadProgress: { verifiedChunks: 0, totalChunks: 1, attempt: 1 }, mapDocument: null });
    expect(studioLiveContentSnapshot(adapter).mode).toBe('ready');
    await vi.advanceTimersByTimeAsync(999); expect(fetcher).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1); await flush();
    expect(adapter.view()).toMatchObject({ error: null, mapError: null, mapLoadProgress: null,
      mapDocument: { revision: 7, contentHash: fixture.head.contentHash } });
    adapter.disconnect();
  });

  it('never clears a control-subscription error when the map finishes loading', async () => {
    const fixture = chunkHistoryFixture();
    let finish: ((response: Response) => void) | undefined;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { finish = resolve; })));
    const { adapter, subscriptions } = connectFixture(fixture);
    subscriptions[0]!.error!();
    finish!(new Response(new Uint8Array(fixture.blobs.values().next().value!))); await flush();
    expect(adapter.view()).toMatchObject({ error: 'studio_subscription_failed', mapError: null, mapDocument: { revision: 7 } });
    expect(studioLiveContentSnapshot(adapter).mode).toBe('unavailable');
    adapter.disconnect();
  });

  it('keeps region delivery errors independent of content and clears them only after region recovery', async () => {
    const fixture = chunkHistoryFixture();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array(fixture.blobs.values().next().value!))));
    const { adapter, subscriptions } = connectFixture(fixture);
    adapter.setMapViewport({ spaceId: 0, mapWidthTiles: 832, mapHeightTiles: 832, cameraX: 0, cameraY: 0,
      zoom: 1, viewportWidth: 500, viewportHeight: 300 });
    subscriptions[1]!.error!(); await flush();
    expect(adapter.view()).toMatchObject({ error: null, mapError: expect.stringContaining('region'), mapRevision: 7 });
    expect(studioLiveContentSnapshot(adapter).mode).toBe('ready');
    adapter.setMapViewport({ spaceId: 0, mapWidthTiles: 832, mapHeightTiles: 832, cameraX: 4096, cameraY: 0,
      zoom: 1, viewportWidth: 500, viewportHeight: 300 });
    await vi.advanceTimersByTimeAsync(140);
    subscriptions[2]!.applied!();
    expect(adapter.view().mapError).toBeNull();
    adapter.disconnect();
  });

  it('does not reuse verified bytes after the publication changes', async () => {
    const first = chunkHistoryFixture(7), next = chunkHistoryFixture(8);
    const fetcher = vi.fn(async () => new Response(new Uint8Array(first.blobs.values().next().value!)));
    vi.stubGlobal('fetch', fetcher);
    const { adapter, replaceHead } = connectFixture(first);
    await flush(); expect(adapter.view().mapRevision).toBe(7);
    replaceHead(next); await flush();
    expect(adapter.view().mapRevision).toBe(8);
    expect(fetcher).toHaveBeenCalledTimes(2);
    adapter.disconnect();
  });

  it('drops old publication progress and ignores bytes arriving after a changed head or disconnect', async () => {
    const first = chunkHistoryFixture(7), next = chunkHistoryFixture(8);
    const finishes: ((response: Response) => void)[] = [];
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { finishes.push(resolve); })));
    const { adapter, replaceHead } = connectFixture(first);
    replaceHead(next);
    finishes[0]!(new Response(new Uint8Array(first.blobs.values().next().value!))); await flush();
    expect(adapter.view()).toMatchObject({ mapDocument: null, mapLoadProgress: { attempt: 1, verifiedChunks: 0 } });
    finishes[1]!(new Response(new Uint8Array(next.blobs.values().next().value!))); await flush();
    expect(adapter.view().mapRevision).toBe(8);
    adapter.disconnect(); await vi.advanceTimersByTimeAsync(30_000);
    expect(adapter.view()).toMatchObject({ connected: false, mapDocument: null, mapError: null, mapLoadProgress: null });
  });
});
