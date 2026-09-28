import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Identity } from 'spacetimedb';
import { bootstrapContentRows, contentDefinitionRowsHash, TILE_SIZE_FIXED, TOPSIDE_SPACE_ID } from '@orchard/sim';
import { OverworldConnection } from './overworld-connection.js';
import { LatencyInjector } from './netcode.js';
import { CLIENT_CONTENT_ENGINE_VERSION } from '../content/live-content.js';

const mocked = vi.hoisted(() => ({ build: vi.fn(), ensure: vi.fn() }));
vi.mock('@orchard/world-bindings', async (original) => ({
  ...await original<object>(), DbConnection: { builder: () => mocked.build() },
}));
vi.mock('@orchard/auth', () => ({
  oidcConfigured: true, localProfilesEnabled: false,
  readOidcSession: () => ({ subject: 'existing-owner', idToken: 'test-token' }),
  ensureOidcSession: mocked.ensure,
}));
vi.mock('../client-error-reporter.js', () => ({
  clientErrorReporter: { attach: vi.fn(), detach: vi.fn(), capture: vi.fn() },
}));

type Row = Record<string, unknown>;
type Callback = (...args: unknown[]) => void;
class FakeTable {
  rows: Row[] = [];
  readonly inserted: Callback[] = [];
  readonly updated: Callback[] = [];
  readonly deleted: Callback[] = [];
  readonly index = { find: () => this.rows[0] ?? null };
  iter(): Iterable<Row> { return this.rows; }
  onInsert(callback: Callback): void { this.inserted.push(callback); }
  onUpdate(callback: Callback): void { this.updated.push(callback); }
  onDelete(callback: Callback): void { this.deleted.push(callback); }
}
class FakeSubscription {
  applied = (): void => undefined;
  error = (): void => undefined;
  queries: unknown = null;
  active = true;
  onApplied(callback: () => void): this { this.applied = callback; return this; }
  onError(callback: () => void): this { this.error = callback; return this; }
  subscribe(queries: unknown): this { this.queries = queries; return this; }
  isActive(): boolean { return this.active; }
  unsubscribe(): void { this.active = false; }
}
class FakeConnection {
  readonly subscriptions: FakeSubscription[] = [];
  readonly tableMap = new Map<string, FakeTable>();
  readonly db = new Proxy({}, { get: (_target, key) => this.table(String(key)) });
  readonly reducers = { acknowledgeInventoryProtocol:vi.fn(async()=>undefined), setInput: vi.fn(async (input: unknown) => { void input; }), heartbeat: vi.fn(async () => undefined) };
  readonly disconnect = vi.fn();
  readonly connectionId = { isEqual: () => true,toHexString:()=> 'test-connection' };
  isSocketClosed = false;
  connected: Callback = () => undefined;
  disconnected: Callback = () => undefined;
  errored: Callback = () => undefined;
  table(name: string): FakeTable {
    let table = this.tableMap.get(name);
    if (table === undefined) {
      const base = new FakeTable();
      table = new Proxy(base, { get: (target, key) => key in target ? Reflect.get(target, key) : target.index });
      this.tableMap.set(name, table);
    }
    return table;
  }
  subscriptionBuilder(): FakeSubscription {
    const subscription = new FakeSubscription(); this.subscriptions.push(subscription); return subscription;
  }
  builder(): object {
    const builder = {
      withUri: () => builder,
      withDatabaseName: () => builder,
      withToken: () => builder,
      onConnect: (callback: Callback) => { this.connected = callback; return builder; },
      onDisconnect: (callback: Callback) => { this.disconnected = callback; return builder; },
      onConnectError: (callback: Callback) => { this.errored = callback; return builder; },
      build: () => this,
    };
    return builder;
  }
}
const identity = Identity.fromString('1'.padStart(64, '0'));
const rows = bootstrapContentRows();
function seed(connection: FakeConnection): void {
  const position = { identity, spaceId: TOPSIDE_SPACE_ID, chunkX: 2, chunkY: 2,
    x: 35 * TILE_SIZE_FIXED, y: 35 * TILE_SIZE_FIXED, facing: 'down', actionKind: 'none' };
  for (const [table, values] of Object.entries({
    worldClock: [{ id: 0, authorityTick: 100n }], worldEnvironment: [{ id: 0 }], worldSeed: [{ id: 0, seed: 42 }],
    playerPosition: [position], ownSurvival: [{ identity }], ownCharacterProfile: [{ identity }], ownMembership: [{ identity }],
    ownHearthStashSlots:[{id:'stash:3',identity,slot:3,itemKind:'torch',quantity:1,durability:73,lit:false}],
    ownInventorySlots: [{ slot: 0, itemKind: 'axe', quantity: 1, durability: 17, lit: true }],
    runtimeContentDefinitions: rows,
    contentHead: [{ packId: 'live', revision: 1n, engineVersion: CLIENT_CONTENT_ENGINE_VERSION,
      contentHash: contentDefinitionRowsHash(rows), definitionCount: rows.length }],
  })) connection.table(table).rows = values.map((row) => ({ ...row }));
}
async function flush(): Promise<void> { await vi.advanceTimersByTimeAsync(5); }
async function hydrate(connection: FakeConnection): Promise<void> {
  await connection.connected(connection, identity, 'test-token');
  connection.subscriptions[0]?.applied();
  connection.subscriptions[1]?.applied();
  await flush();
  connection.subscriptions[2]?.applied();
  await flush();
  // Auxiliary region metadata is optional; core rows must apply before ready.
  expect(connection.subscriptions.length).toBeGreaterThanOrEqual(5);
}


function placeable(id: bigint, definitionId: string): Row {
  return { id, kind: definitionId.slice('object:'.length), definitionId, tileX: 36, tileY: 34, chunkX: 2, chunkY: 2,
    spaceId: TOPSIDE_SPACE_ID, placedBy: identity, facing: 'down', open: true, lit: false, stateJson: '{}' };
}
function slot(placeableId: bigint, index: number, itemKind: string): Row {
  return { id: `${placeableId}:${index}`, placeableId, slot: index, itemKind, quantity: 2, durability: 0, lit: true };
}

describe('OverworldConnection placeable session through the SDK callbacks (BUG-058)', () => {
  const networks: OverworldConnection[] = [];
  let connections: FakeConnection[];
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('window', globalThis);
    vi.stubGlobal('document', { hidden: false });
    vi.stubGlobal('navigator', { onLine: true });
    connections = [];
    mocked.ensure.mockReset().mockResolvedValue({ subject: 'existing-owner', idToken: 'test-token' });
    mocked.build.mockImplementation(() => {
      const connection = new FakeConnection(); seed(connection); connections.push(connection); return connection.builder();
    });
  });
  afterEach(() => { for (const network of networks.splice(0)) network.dispose(); vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('keeps a chest session that replaces a workbench session when the SDK reports the insert before the delete', async () => {
    const network = new OverworldConnection('owner', () => undefined, 'http://example.test', 'world', new LatencyInjector(0, 0));
    networks.push(network); await flush();
    const connection = connections[0]!;
    await hydrate(connection); connection.subscriptions[4]?.applied(); await flush();
    const active = connection.table('ownActivePlaceable'), slots = connection.table('ownOpenPlaceableSlots');
    const workbench = placeable(8n, 'object:workbench'), chest = placeable(7n, 'object:chest');
    // The player uses a workbench: the server opens its session (the client shows the crafting grid, or nothing on main).
    active.inserted[0]?.({ event: { id: 'bench' } }, workbench);
    await flush();
    expect(network.view().activePlaceable?.id).toBe(8n);
    // Then a chest: one transaction replaces the session. The SDK reports the view's new row first, then the old row's
    // removal (spacetimedb index.mjs applies inserts before deletes for a view without a matching key).
    active.inserted[0]?.({ event: { id: 'chest' } }, chest);
    for (let index = 0; index < 16; index++) slots.inserted[0]?.({ event: { id: 'chest' } }, slot(7n, index, index === 0 ? 'apple' : 'empty'));
    active.deleted[0]?.({ event: { id: 'chest' } }, workbench);
    await flush();
    const view = network.view();
    expect(view.activePlaceable?.id).toBe(7n);
    expect(view.activeChest?.id).toBe(7n);
    expect(view.openChestSlots.size).toBe(16);
    expect(view.openChestSlots.get(0)).toMatchObject({ chestId: 7n, itemKind: 'apple' });
    // Closing the chest still ends the session.
    active.deleted[0]?.({ event: { id: 'close' } }, chest);
    for (let index = 0; index < 16; index++) slots.deleted[0]?.({ event: { id: 'close' } }, slot(7n, index, index === 0 ? 'apple' : 'empty'));
    await flush();
    expect(network.view().activePlaceable).toBeNull();
    expect(network.view().activeChest).toBeNull();
    expect(network.view().openChestSlots.size).toBe(0);
  });
});
