import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Identity } from 'spacetimedb';
import { bootstrapContentRows, contentDefinitionRowsHash, TILE_SIZE_FIXED, TOPSIDE_SPACE_ID } from '@orchard/sim';
import { OverworldConnection } from './overworld-connection.js';
import { LatencyInjector } from './netcode.js';
import { clientErrorReporter } from '../client-error-reporter.js';
import { CLIENT_CONTENT_ENGINE_VERSION } from '../content/live-content.js';
import { cellFlags } from '@orchard/sim/cell-flags';

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

describe('authenticated OverworldConnection recovery', () => {
  const networks: OverworldConnection[] = [];
  let connections: FakeConnection[];
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('window', globalThis);
    vi.stubGlobal('document', { hidden: false });
    vi.stubGlobal('navigator', { onLine: true });
    connections = [];
    vi.mocked(clientErrorReporter.attach).mockClear(); vi.mocked(clientErrorReporter.detach).mockClear();
    mocked.ensure.mockReset().mockResolvedValue({ subject: 'existing-owner', idToken: 'test-token' });
    mocked.build.mockImplementation(() => {
      const connection = new FakeConnection(); seed(connection); connections.push(connection); return connection.builder();
    });
  });
  afterEach(() => { for (const network of networks.splice(0)) network.dispose(); vi.useRealTimers(); vi.unstubAllGlobals(); });
  function create(): OverworldConnection {
    const network = new OverworldConnection('owner', () => undefined, 'http://example.test', 'world', new LatencyInjector(0, 0));
    networks.push(network); return network;
  }

  it('reconnects the same account at unchanged coordinates with fresh subscriptions, idle input and preserved inventory', async () => {
    const network = create(); await flush();
    const first = connections[0]!;
    await hydrate(first);
    expect(network.gameplayReady).toBe(false);
    first.subscriptions[4]?.applied(); await flush();
    expect(network.gameplayReady).toBe(true);
    expect(clientErrorReporter.attach).toHaveBeenCalledOnce();
    first.table('worldCampfireState').inserted[0]?.({ event: { id: 'campfire' } }, { id: 7n });
    first.table('worldMerchant').inserted[0]?.({ event: { id: 'merchant' } }, { npcId: 8n });
    first.table('worldCombatTarget').inserted[0]?.({ event: { id: 'target' } }, { id: 9n });
    await flush();
    expect(network.view().campfires?.size).toBe(1);
    expect(network.view().merchants.size).toBe(1);
    expect(network.view().combatTargets.size).toBe(1);
    first.table('ownActiveHearthStash').inserted[0]?.({event:{id:'stash'}},{identity,connectionId:first.connectionId});
    await flush();expect(network.view().hearthStashOpen).toBe(true);
    network.setMovementIntent('right', true); await flush();
    expect(first.reducers.setInput.mock.calls.at(-1)?.[0]).toMatchObject({ direction: 'right', sprinting: true });
    first.disconnected(first, new Error('socket_closed'));
    expect(clientErrorReporter.detach).toHaveBeenCalledOnce();
    expect(network.gameplayReady).toBe(false);
    expect(network.view().inventorySlots.size).toBe(0);
    expect(network.view().hearthStashSlots?.size).toBe(0);
    expect(network.view().hearthStashOpen).toBe(false);
    expect(network.view().campfires?.size).toBe(0);
    expect(network.view().merchants.size).toBe(0);
    expect(network.view().combatTargets.size).toBe(0);
    await vi.advanceTimersByTimeAsync(501);
    expect(mocked.ensure).toHaveBeenCalledTimes(2);
    const second = connections[1]!;
    await hydrate(second);
    // Neither the old callback nor a second old disconnect can hydrate/drop the new generation.
    first.subscriptions[4]?.applied(); first.disconnected(first, new Error('late-close'));
    first.table('ownActiveHearthStash').inserted[0]?.({event:{id:'late-stash'}},{identity,connectionId:first.connectionId});
    await flush();expect(network.view().hearthStashOpen).toBe(false);
    expect(network.gameplayReady).toBe(false);
    second.subscriptions[4]?.applied(); await flush();
    expect(network.gameplayReady).toBe(true);
    expect(network.view().inventorySlots.get(0)).toMatchObject({ itemKind: 'axe', durability: 17, quantity: 1 });
    expect(network.view().hearthStashSlots?.get(3)).toMatchObject({itemKind:'torch',quantity:1,durability:73,lit:false});
    expect(network.view().hearthStashOpen).toBe(false);
    expect(second.reducers.setInput.mock.calls).toHaveLength(1);
    expect(second.reducers.setInput.mock.calls[0]?.[0]).toMatchObject({ direction: 'idle', sprinting: false });
    expect(second.disconnect).not.toHaveBeenCalled();
    second.subscriptions[2]?.error();
    expect(network.gameplayReady).toBe(false);
    expect(network.view().error).toBe('self_subscription_failed');
  });

  it('waits for persisted cellar excavation before enabling movement after a rejoin', async () => {
    const network = create(); await flush();
    const connection = connections[0]!;
    connection.table('ownCurrentHomestead').rows = [{ spaceId: 30_000, residenceSpaceId: 30_001, sizeTier: 0 }];
    connection.table('playerPosition').rows[0] = { ...connection.table('playerPosition').rows[0], spaceId: 30_002 };
    connection.table('cellarExcavation').rows = [{ id: '44', spaceId: 30_002, tileX: 8, tileY: 8 }];
    await hydrate(connection);
    expect(connection.subscriptions).toHaveLength(6);
    connection.subscriptions[5]?.applied(); await flush();
    expect(network.gameplayReady).toBe(false);
    expect(connection.reducers.setInput).not.toHaveBeenCalled();
    connection.subscriptions[3]?.applied(); await flush();
    expect(network.gameplayReady).toBe(true);
    expect(network.view().cellarExcavations.get('44')).toMatchObject({ spaceId: 30_002, tileX: 8 });
  });

  it('detaches reporting and retries a failed connection handshake with a fresh account session', async () => {
    const network = create(); await flush();
    connections[0]!.errored(connections[0], new Error('temporary_proxy_failure'));
    expect(clientErrorReporter.detach).toHaveBeenCalledOnce();
    expect(network.gameplayReady).toBe(false);
    await vi.advanceTimersByTimeAsync(501);
    expect(mocked.ensure).toHaveBeenCalledTimes(2);
    expect(connections).toHaveLength(2);
  });

  it('does not build anonymously or accept a replacement account after terminal session failure', async () => {
    mocked.ensure.mockResolvedValueOnce(null);
    const network = create(); await flush();
    expect(network.recoveryState).toBe('sign-in-required');
    expect(connections).toHaveLength(0);
    network.resume(); network.retryConnection(); await vi.advanceTimersByTimeAsync(60_000);
    expect(connections).toHaveLength(0);
    mocked.ensure.mockResolvedValueOnce({ subject: 'different-owner', idToken: 'different-token' });
    const another = create(); await flush();
    expect(another.recoveryState).toBe('sign-in-required');
    expect(connections).toHaveLength(0);
  });

  it('discards delayed commands and malformed old table callbacks instead of replaying them on the new socket', async () => {
    const network = create(); await flush();
    const first = connections[0]!; await hydrate(first); first.subscriptions[4]?.applied(); await flush();
    // The command is queued on a microtask; loss before dispatch must prevent its reducer call.
    network.setMovementIntent('left', true);
    first.disconnected(first, new Error('restart'));
    await vi.advanceTimersByTimeAsync(501);
    const second = connections[1]!; await hydrate(second); second.subscriptions[4]?.applied(); await flush();
    first.table('playerPosition').inserted[0]?.({ event: { id: 'stale-event' } }, { identity: null });
    await flush();
    expect(network.gameplayReady).toBe(true);
    expect(first.reducers.setInput.mock.calls).toHaveLength(1);
    expect(second.reducers.setInput.mock.calls).toHaveLength(1);
  });

  it('recovers from a malformed current hydration callback without poisoning the next latency queue', async () => {
    const network = create(); await flush();
    const first = connections[0]!; await hydrate(first); first.subscriptions[4]?.applied(); await flush();
    first.table('playerPosition').inserted[0]?.({ event: { id: 'bad-event' } }, { identity: null });
    await flush();
    expect(network.gameplayReady).toBe(false);
    expect(network.view().error).toBe('subscription_hydration_failed');
    await vi.advanceTimersByTimeAsync(501);
    const second = connections[1]!; await hydrate(second); second.subscriptions[4]?.applied(); await flush();
    expect(network.gameplayReady).toBe(true);
  });
});

it('discards seated prediction on every frame without replaying pending movement', () => {
  const discard=vi.fn(),replay=vi.fn();
  const fake={ownPosition:()=>({actionKind:'sitting',x:100,y:200,authorityTick:1n}),
    prediction:{discardPendingMovement:discard,reconcile:replay},lastReconciledRowKey:'old'};
  const authoritative={position:{x:100,y:200},facing:'down',moving:false,location:'estate'} as const;
  const predicted={...authoritative,position:{x:9000,y:9000}};
  for(let frame=0;frame<3;frame++){
    const result=OverworldConnection.prototype.reconcile.call(fake as unknown as OverworldConnection,predicted,authoritative,{width:1,height:1,blocked:cellFlags([false])});
    expect(result).toMatchObject({player:authoritative,hardSnap:true,replayDepth:0});
  }
  expect(discard).toHaveBeenCalledTimes(3);expect(replay).not.toHaveBeenCalled();
});
