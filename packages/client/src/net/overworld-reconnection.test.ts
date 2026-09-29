import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Identity } from 'spacetimedb';
import { AlgebraicType, BinaryReader, BinaryWriter } from 'spacetimedb';
import { bootstrapContentRows, contentDefinitionRowsHash, CONTAINER_CELL_INVENTORY_PROTOCOL_VERSION, MAIN_HAND_SELECTED_SLOT, selectedSlotCell, TILE_SIZE_FIXED, TOPSIDE_SPACE_ID } from '@orchard/sim';
import { reducers as bindingReducers, tables } from '@orchard/world-bindings';
import { HEARTBEAT_INTERVAL_MS, HIDDEN_HEARTBEAT_LIMIT_MS, OverworldConnection } from './overworld-connection.js';
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
/** The container reducers whose arguments name cells. */
const CONTAINER_REDUCERS = ['moveInventoryItem', 'movePlaceableItem', 'distributeInventoryItem', 'inventoryCursorQuickCraft',
  'inventoryCursorClick', 'inventoryCursorSwapHotbar', 'throwMenuItem', 'quickMoveMenuItem', 'setTradeOfferItem', 'selectHotbar'] as const;
type ContainerReducer = (typeof CONTAINER_REDUCERS)[number];
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
  readonly reducers = { acknowledgeInventoryProtocol:vi.fn(async(args:unknown)=>{ void args; }), setInput: vi.fn(async (input: unknown) => { void input; }), heartbeat: vi.fn(async () => undefined),
    ...Object.fromEntries(CONTAINER_REDUCERS.map(name => [name, vi.fn(async (args: unknown) => { void args; })])) as Record<ContainerReducer, ReturnType<typeof vi.fn>> };
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
function cellRow(container: string, index: number, itemKind: string, extra: Partial<Row> = {}): Row {
  return { id: `${identity.toHexString()}:${container}:${index}`, identity, container, index, itemKind, quantity: 1, durability: 0, lit: false, ...extra };
}
/** One `own_player_container_cells` row in each of the five containers (a backpack index past the legacy u8 range
 * among them), and one in a container this client does not know. */
const CELLS: readonly Row[] = [
  cellRow('hotbar', 0, 'axe', { durability: 17, lit: true }),
  cellRow('backpack', 300, 'wood', { quantity: 12 }),
  cellRow('equipment', 3, 'hearth_rare_sword', { durability: 190 }),
  cellRow('crafting', 8, 'plank', { quantity: 2 }),
  cellRow('stash', 3, 'torch', { durability: 73 }),
  cellRow('satchel', 0, 'apple'),
];
function seed(connection: FakeConnection): void {
  const position = { identity, spaceId: TOPSIDE_SPACE_ID, chunkX: 2, chunkY: 2,
    x: 35 * TILE_SIZE_FIXED, y: 35 * TILE_SIZE_FIXED, facing: 'down', actionKind: 'none' };
  for (const [table, values] of Object.entries({
    worldClock: [{ id: 0, authorityTick: 100n }], worldEnvironment: [{ id: 0 }], worldSeed: [{ id: 0, seed: 42 }],
    playerPosition: [position], ownSurvival: [{ identity }], ownCharacterProfile: [{ identity }], ownMembership: [{ identity }],
    ownPlayerContainerCells: CELLS,
    // The frozen legacy views stay published for the release lane only: the client never reads them.
    ownInventorySlots: [{ slot: 0, itemKind: 'apple', quantity: 9, durability: 0, lit: false }],
    ownHearthStashSlots: [{ id: 'stash:3', identity, slot: 3, itemKind: 'apple', quantity: 9, durability: 0, lit: false }],
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
    expect(network.view().playerCells.size).toBe(0);
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
    expect(network.view().playerCells.get({ container: 'hotbar', index: 0 })).toMatchObject({ itemKind: 'axe', durability: 17, quantity: 1 });
    expect(network.view().playerCells.get({ container: 'stash', index: 3 })).toMatchObject({itemKind:'torch',quantity:1,durability:73,lit:false});
    expect(network.view().hearthStashOpen).toBe(false);
    expect(second.reducers.setInput.mock.calls).toHaveLength(1);
    expect(second.reducers.setInput.mock.calls[0]?.[0]).toMatchObject({ direction: 'idle', sprinting: false });
    expect(second.disconnect).not.toHaveBeenCalled();
    second.subscriptions[2]?.error();
    expect(network.gameplayReady).toBe(false);
    expect(network.view().error).toBe('self_subscription_failed');
  });

  it('BUG-062: a hidden tab keeps its lease, a lapsed lease never blanks the own player, and return is instant', async () => {
    const network = create(); await flush();
    const connection = connections[0]!;
    await hydrate(connection);
    connection.subscriptions[4]?.applied(); await flush();
    expect(network.gameplayReady).toBe(true);
    const own = () => network.view().players.get(identity.toHexString());
    expect(own()).toBeDefined();
    const heartbeat = connection.reducers.heartbeat;
    heartbeat.mockClear();
    // Hidden (alt-tab): heartbeats continue as inactive, so the server's 30 s lease does not lapse
    // while the page can run (throttled timers still fire; before the fix they returned early).
    vi.stubGlobal('document', { hidden: true }); network.pause();
    await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS * 3 + 10);
    expect(heartbeat.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect((heartbeat.mock.calls as unknown as [{ active: boolean }][]).every(([args]) => args.active === false)).toBe(true);
    // Frozen past the lease: the server marks the player offline and the own public row leaves the
    // online-profile subscription. The own player stays in the world (it blanked it for up to 10 s).
    connection.table('playerPublic').deleted.forEach(callback => callback({ event: { id: 'lease-lapsed' } }, { identity, online: false }));
    await flush();
    expect(own()).toBeDefined();
    // Back: the lease is renewed at once, the sign-in refreshed ahead of any reconnect, and no reconnect happens.
    heartbeat.mockClear();
    const ensureCalls = mocked.ensure.mock.calls.length;
    vi.stubGlobal('document', { hidden: false }); network.resume();
    await flush();
    expect(heartbeat).toHaveBeenCalledTimes(1);
    expect(mocked.ensure.mock.calls.length).toBe(ensureCalls + 1);
    expect(network.gameplayReady).toBe(true);
    expect(connections).toHaveLength(1);
    expect(connection.disconnect).not.toHaveBeenCalled();
  });

  it('#250 review: a long hide stops heartbeating after the limit, so the lease lapses exactly once, and resumes cleanly', async () => {
    const network = create(); await flush();
    const connection = connections[0]!;
    await hydrate(connection);
    connection.subscriptions[4]?.applied(); await flush();
    expect(network.gameplayReady).toBe(true);
    const heartbeat = connection.reducers.heartbeat;
    heartbeat.mockClear();
    const sentAt: number[] = [];
    heartbeat.mockImplementation(async () => { sentAt.push(Date.now()); });
    const hiddenAt = Date.now();
    vi.stubGlobal('document', { hidden: true }); network.pause();
    // Ten minutes hidden. The fake timers fire every 10 s, more often than a throttled tab would,
    // which is the harder case: the limit, not throttling, must stop the heartbeats.
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(sentAt.length).toBeGreaterThan(0);
    expect(Math.max(...sentAt) - hiddenAt).toBeLessThanOrEqual(HIDDEN_HEARTBEAT_LIMIT_MS);
    // The server's view (30 s lease): online, then one lapse, and nothing more until the return.
    const LEASE_MS = 30_000;
    const lapses = (times: readonly number[], until: number) => {
      let count = 0, last = hiddenAt;
      for (const at of [...times, until]) { if (at - last > LEASE_MS) count += 1; last = at; }
      return count;
    };
    const returnedAt = Date.now();
    expect(lapses(sentAt, returnedAt)).toBe(1);
    // Back: one heartbeat at once renews the lease; heartbeats continue on the normal cadence.
    vi.stubGlobal('document', { hidden: false }); network.resume();
    await flush();
    expect(sentAt.filter(at => at >= returnedAt)).toHaveLength(1);
    // The live socket's world clock keeps ticking after the return (the watchdog's traffic).
    const tick = (n: number) => connection.table('worldClock').updated.forEach(callback =>
      callback({ event: { id: `tick-${n}` } }, { id: 0, authorityTick: 100n }, { id: 0, authorityTick: 100n + BigInt(n) }));
    for (let n = 1; n <= 5; n += 1) { tick(n); await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS / 2 + 5); }
    expect(sentAt.filter(at => at >= returnedAt).length).toBeGreaterThanOrEqual(3);
    expect(lapses(sentAt, Date.now())).toBe(1);
    // A second, short hide keeps heartbeating (the limit restarts).
    const secondHide = Date.now();
    vi.stubGlobal('document', { hidden: true }); network.pause();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sentAt.filter(at => at > secondHide).length).toBeGreaterThanOrEqual(5);
    expect(connections).toHaveLength(1);
    expect(connection.disconnect).not.toHaveBeenCalled();
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

describe('container cells (Uncapped Storage step 4c)', () => {
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
  async function ready(): Promise<{ network: OverworldConnection; connection: FakeConnection }> {
    const network = new OverworldConnection('owner', () => undefined, 'http://example.test', 'world', new LatencyInjector(0, 0));
    networks.push(network); await flush();
    const connection = connections[0]!;
    await hydrate(connection); connection.subscriptions[4]?.applied(); await flush();
    expect(network.gameplayReady).toBe(true);
    return { network, connection };
  }
  const key = (row: { readonly container: string; readonly index: number }) => `${row.container}:${row.index}`;

  it('acknowledges inventory protocol 2 and subscribes to the container-cell views, never the legacy slot views', async () => {
    const { connection } = await ready();
    expect(CONTAINER_CELL_INVENTORY_PROTOCOL_VERSION).toBe(2);
    expect(connection.reducers.acknowledgeInventoryProtocol).toHaveBeenCalledWith({ version: CONTAINER_CELL_INVENTORY_PROTOCOL_VERSION });
    const queries = connection.subscriptions.flatMap(subscription => Array.isArray(subscription.queries) ? subscription.queries as unknown[] : [subscription.queries]);
    expect(queries).toContain(tables.ownPlayerContainerCells);
    expect(queries).toContain(tables.ownOpenPlaceableContainerCells);
    for (const legacy of [tables.ownInventorySlots, tables.ownHearthStashSlots, tables.ownOpenPlaceableSlots, tables.ownPlacedPlaceableSlots]) {
      expect(queries).not.toContain(legacy);
    }
    for (const legacy of ['ownInventorySlots', 'ownHearthStashSlots', 'ownOpenPlaceableSlots']) {
      const table = connection.table(legacy);
      expect(table.inserted.length + table.updated.length + table.deleted.length, legacy).toBe(0);
    }
  });

  it('shows update-required, not sign-in, when the world refuses this client\'s inventory protocol, and stops reconnecting', async () => {
    const network = new OverworldConnection('owner', () => undefined, 'http://example.test', 'world', new LatencyInjector(0, 0));
    networks.push(network); await flush();
    const connection = connections[0]!;
    connection.reducers.acknowledgeInventoryProtocol.mockRejectedValueOnce(new Error('inventory_client_update_required'));
    await connection.connected(connection, identity, 'test-token'); await flush();
    expect(network.recoveryState).toBe('update-required');
    expect(network.gameplayReady).toBe(false);
    // No retry, reconnect or sign-in loop: the same bundle would only be refused again.
    await vi.advanceTimersByTimeAsync(120_000);
    expect(connections).toHaveLength(1);
    expect(network.recoveryState).toBe('update-required');
    expect(mocked.ensure).toHaveBeenCalledTimes(1);
  });

  it('keeps a live session on its last good content when a publish brings rows this client cannot parse, until content it can', async () => {
    // Uncapped Storage step 5 (review of #272): a client older than the content (one that cannot parse `entitySlots:
    // "all"`, before 0.52) must report content_registry_invalid, which the game shows as CONTENT UPDATE REQUIRED with a
    // RELOAD (initial-world-loading.test.ts), and never adopt a half-understood registry.
    const { network, connection } = await ready();
    const good = network.view().content;
    expect(good.status).toBe('ready');
    expect(good.registry.frames.get('frame:chest')?.panes.find(pane => pane.id === 'contents')?.bind).toEqual({ entitySlots: 'all' });
    const publish = (next: typeof rows, revision: bigint) => {
      connection.table('runtimeContentDefinitions').rows = next.map(row => ({ ...row }));
      connection.table('contentHead').rows = [{ packId: 'live', revision, engineVersion: CLIENT_CONTENT_ENGINE_VERSION,
        contentHash: contentDefinitionRowsHash(next), definitionCount: next.length }];
      for (const callback of connection.table('contentHead').updated) callback({ event: { id: `publish-${revision}` } }, {}, {});
    };
    // A binding form from a newer engine than this bundle's parser, correctly hashed and counted.
    const newer = rows.map(row => row.id !== 'frame:chest' ? row : { ...row, json: JSON.stringify({ ...JSON.parse(String(row.json)),
      panes: (JSON.parse(String(row.json)).panes as { bind: object }[]).map(pane => 'entitySlots' in pane.bind ? { ...pane, bind: { entitySlots: 'visible' } } : pane) }) });
    publish(newer, 2n); await flush();
    const stale = network.view();
    expect(stale.error).toBe('content_registry_invalid');
    expect(stale.content.status).toBe('invalid');
    expect(stale.content.issues.filter(issue => issue.endsWith(':frame:chest'))).not.toEqual([]);
    expect(stale.content.issues).not.toContain('content_hash_mismatch');
    expect(stale.content.registry).toBe(good.registry);
    // The session itself stays up (no reconnect loop, no sign-in): only a newer client can read the content.
    expect(stale.connected).toBe(true);
    expect(network.recoveryState).toBe('ready');
    expect(connections).toHaveLength(1);
    publish(rows, 3n); await flush();
    expect(network.view().error).toBeNull();
    expect(network.view().content.status).toBe('ready');
  });

  it('maps own_player_container_cells rows into the container model: all five containers, u32 indices, no legacy rows', async () => {
    const { network, connection } = await ready();
    const cells = network.view().playerCells;
    // Five known containers; the row in a container this client does not know is left out, and the legacy views'
    // apples never arrive.
    expect(cells.size).toBe(5);
    expect([...cells].map(key)).toEqual(['hotbar:0', 'backpack:300', 'equipment:3', 'crafting:8', 'stash:3']);
    expect([...cells].some(row => row.itemKind === 'apple')).toBe(false);
    expect(cells.get({ container: 'hotbar', index: 0 })).toMatchObject({ itemKind: 'axe', durability: 17, lit: true });
    expect(cells.get({ container: 'backpack', index: 300 })).toMatchObject({ itemKind: 'wood', quantity: 12 });
    expect(cells.get({ container: 'crafting', index: 8 })).toMatchObject({ itemKind: 'plank', quantity: 2 });
    expect(cells.container('stash').map(row => row.itemKind)).toEqual(['torch']);
    // The stash stays at the hearth: carried rows are the other four containers.
    expect(cells.carried().map(key)).toEqual(['hotbar:0', 'backpack:300', 'equipment:3', 'crafting:8']);
    // A stored selectedSlot of 33 names the Main Hand cell, never global slot 33.
    expect(selectedSlotCell(MAIN_HAND_SELECTED_SLOT)).toEqual({ container: 'equipment', index: 3 });
    expect(cells.get(selectedSlotCell(MAIN_HAND_SELECTED_SLOT))).toMatchObject({ itemKind: 'hearth_rare_sword' });
    expect(cells.get(selectedSlotCell(0))).toMatchObject({ itemKind: 'axe' });
    // Live rows: an insert far past the legacy layout, an update in place, and a delete.
    const table = connection.table('ownPlayerContainerCells'), revision = cells.revision;
    table.inserted[0]?.({ event: { id: 'insert' } }, cellRow('backpack', 70_000, 'stone', { quantity: 4 }));
    table.updated[0]?.({ event: { id: 'update' } }, CELLS[1], cellRow('backpack', 300, 'wood', { quantity: 5 }));
    table.deleted[0]?.({ event: { id: 'delete' } }, CELLS[3]);
    await flush();
    const live = network.view().playerCells;
    expect(live.revision).toBeGreaterThan(revision);
    expect(live.container('backpack').map(row => [row.index, row.quantity])).toEqual([[300, 5], [70_000, 4]]);
    expect(live.get({ container: 'crafting', index: 8 })).toBeUndefined();
    expect(network.snapshot().playerCells.map(key)).toEqual(['hotbar:0', 'backpack:300', 'backpack:70000', 'equipment:3', 'stash:3']);
  });

  it('sends a container and a u32 index on every container reducer call, a backpack index past 255 included', async () => {
    const { network, connection } = await ready();
    // Reducer calls go through the latency injector's timers.
    const settle = async (call: Promise<void>) => { await flush(); await call; };
    const sent = (name: ContainerReducer) => connection.reducers[name].mock.calls.at(-1)?.[0] as Record<string, unknown>;
    /** The arguments survive the generated binding's own wire encoding unchanged: every index is a u32 there. */
    const roundTrip = (name: ContainerReducer, args: Record<string, unknown>) => {
      const type = { tag: 'Product', value: (bindingReducers as unknown as Record<string, { paramsType: unknown }>)[name]!.paramsType } as unknown as AlgebraicType;
      const writer = new BinaryWriter(64); AlgebraicType.serializeValue(writer, type, args);
      return AlgebraicType.deserializeValue(new BinaryReader(writer.getBuffer()), type);
    };
    await settle(network.moveInventoryItem({ fromContainer: 'backpack', fromIndex: 300, toContainer: 'hotbar', toIndex: 2, quantity: 1 }));
    expect(sent('moveInventoryItem')).toEqual({ fromContainer: 'backpack', fromIndex: 300, toContainer: 'hotbar', toIndex: 2, quantity: 1 });
    await settle(network.moveInventoryItem({ fromContainer: 'placeable', fromIndex: 1024, toContainer: 'backpack', toIndex: 256, quantity: 1 }));
    expect(sent('movePlaceableItem')).toMatchObject({ fromIndex: 1024, toIndex: 256 });
    await settle(network.distributeInventoryItem('backpack', 300, [{ container: 'backpack', index: 4096 }, { container: 'hotbar', index: 1 }], 2));
    expect(sent('distributeInventoryItem')).toEqual({ fromContainer: 'backpack', fromIndex: 300,
      targetContainers: ['backpack', 'hotbar'], targetIndexes: [4096, 1], quantity: 2 });
    await settle(network.inventoryCursorQuickCraft([{ container: 'backpack', index: 256 }, { container: 'crafting', index: 8 }], 'even'));
    expect(sent('inventoryCursorQuickCraft')).toEqual({ targetContainers: ['backpack', 'crafting'], targetIndexes: [256, 8], mode: 'even' });
    await settle(network.inventoryCursorClick('backpack', 300, 'left'));
    expect(sent('inventoryCursorClick')).toEqual({ container: 'backpack', index: 300, button: 'left' });
    await settle(network.inventoryCursorSwapHotbar('backpack', 300, 4));
    expect(sent('inventoryCursorSwapHotbar')).toEqual({ container: 'backpack', index: 300, hotbarIndex: 4 });
    await settle(network.throwMenuItem('backpack', 300, true));
    expect(sent('throwMenuItem')).toEqual({ container: 'backpack', index: 300, wholeStack: true });
    await settle(network.quickMoveInventoryItem('backpack', 300, ['hotbar']));
    expect(sent('quickMoveMenuItem')).toEqual({ fromContainer: 'backpack', fromIndex: 300, toContainers: ['hotbar'] });
    await settle(network.setTradeOfferItem('trade-1', { container: 'backpack', index: 300 }, 5, 3));
    expect(sent('setTradeOfferItem')).toEqual({ tradeId: 'trade-1', inventoryContainer: 'backpack', inventoryIndex: 300, tradeSlot: 5, quantity: 3 });
    for (const name of CONTAINER_REDUCERS.filter(name => name !== 'selectHotbar')) {
      const args = sent(name);
      expect(roundTrip(name, args), name).toEqual(args);
    }
    // The legacy u8 would have wrapped the same index to another cell.
    const u8 = { tag: 'Product', value: { elements: [{ name: 'index', algebraicType: { tag: 'U8' } }] } } as unknown as AlgebraicType;
    const writer = new BinaryWriter(8); AlgebraicType.serializeValue(writer, u8, { index: 300 });
    expect(AlgebraicType.deserializeValue(new BinaryReader(writer.getBuffer()), u8)).toEqual({ index: 44 });
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
