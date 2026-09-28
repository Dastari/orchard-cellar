import { pathToFileURL } from 'node:url';
import { CONTAINER_CELL_INVENTORY_PROTOCOL_VERSION } from '@orchard/sim';
import { DbConnection, tables } from '@orchard/world-bindings';
import type { Identity } from 'spacetimedb';

const HOST = process.env['SPACETIMEDB_HOST'] ?? 'http://127.0.0.1:3000';
const DATABASE = process.env['SPACETIMEDB_DATABASE'] ?? 'orchard-cellar-world';
const TIMEOUT_MS = 40_000;

interface Client {
  readonly connection: DbConnection;
  readonly identity: Identity;
  readonly token: string;
}

function timeout<T>(label: string, promise: Promise<T>, timeoutMs = TIMEOUT_MS): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label}_timeout`)), timeoutMs);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error: unknown) => { clearTimeout(timer); reject(error); },
    );
  });
}

function connect(token?: string): Promise<Client> {
  return timeout('connect', new Promise((resolve, reject) => {
    const builder = DbConnection.builder().withUri(HOST).withDatabaseName(DATABASE)
      .onConnect((connection, identity, issuedToken) => resolve({ connection, identity, token: issuedToken }))
      .onConnectError(() => reject(new Error('connection_rejected')));
    if (token !== undefined) builder.withToken(token);
    builder.build();
  }));
}

/**
 * The smoke reads the container-cell views (inventory protocol 2, Uncapped Storage step 4); the legacy slot views are
 * frozen there. Acknowledging the protocol is also what lets this connection call inventory reducers; a world from
 * before that release has no such reducer and is refused here with this message.
 */
export const SMOKE_PROTOCOL_REQUIRED = 'auth_smoke_world_not_on_container_cells:'
  + 'this smoke needs a world on inventory protocol 2 (Uncapped Storage step 4); the legacy slot views are frozen';

async function acknowledgeProtocol(client: Client): Promise<void> {
  try {
    await timeout('inventory_protocol', client.connection.reducers.acknowledgeInventoryProtocol({
      version: CONTAINER_CELL_INVENTORY_PROTOCOL_VERSION,
    }));
  } catch {
    throw new Error(SMOKE_PROTOCOL_REQUIRED);
  }
}

/** The fields of an `own_player_container_cells` row the smoke reads. */
export interface SmokeCell {
  readonly identity: { isEqual(other: Identity): boolean };
  readonly container: string;
  readonly index: number;
  readonly itemKind: string;
  readonly quantity: number;
}

/** The occupied cell at `container:index`, or null: the view is sparse, so an empty cell has no row. */
export function occupiedCell<T extends SmokeCell>(rows: Iterable<T>, container: string, index: number): T | null {
  for (const row of rows) {
    if (row.container === container && row.index === index && row.itemKind !== 'empty' && row.quantity > 0) return row;
  }
  return null;
}

/** Whether every cell row belongs to the caller. */
export function cellsIsolated(rows: Iterable<SmokeCell>, identity: Identity): boolean {
  for (const row of rows) if (!row.identity.isEqual(identity)) return false;
  return true;
}

function subscribe(client: Client): Promise<void> {
  return timeout('subscription', new Promise((resolve, reject) => {
    client.connection.subscriptionBuilder()
      .onApplied(() => resolve())
      // A world before inventory protocol 2 has no container-cell view, so the subscription itself is refused there.
      .onError(() => reject(new Error(`subscription_rejected:${SMOKE_PROTOCOL_REQUIRED}`)))
      .subscribe([
        tables.playerPublic,
        tables.ownSurvival,
        tables.ownPlayerContainerCells,
        tables.ownStats,
        tables.ownEffects,
        tables.ownPlayerStatistics,
        tables.ownPlayerStatisticMilestones,
      ]);
  }));
}

function privateTableRejected(client: Client, name: string): Promise<boolean> {
  return timeout('private_table', new Promise((resolve) => {
    client.connection.subscriptionBuilder().onApplied(() => resolve(false)).onError(() => resolve(true))
      .subscribe(`SELECT * FROM ${name}`);
  }));
}

async function waitUntil(label: string, condition: () => boolean, timeoutMs = TIMEOUT_MS): Promise<void> {
  const started = performance.now();
  while (!condition()) {
    if (performance.now() - started > timeoutMs) throw new Error(`${label}_timeout`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

export async function main(): Promise<void> {
  const [alice, bob] = await Promise.all([
    connect(process.env['WORLD_SMOKE_ALICE_TOKEN']),
    connect(process.env['WORLD_SMOKE_BOB_TOKEN']),
  ]);
  let secondTab: Client | null = null;
  let reconnect: Client | null = null;
  const bobHeartbeat = setInterval(() => { void bob.connection.reducers.heartbeat({ active: false }).catch(() => undefined); }, 10_000);
  try {
    if (alice.identity.isEqual(bob.identity)) throw new Error('identities_not_distinct');
    await Promise.all([acknowledgeProtocol(alice), acknowledgeProtocol(bob)]);
    await Promise.all([subscribe(alice), subscribe(bob)]);
    if (!await privateTableRejected(bob, 'private_inventory')) throw new Error('private_inventory_was_readable');
    // Every player's cells live in one table; only the caller-scoped view may expose them.
    if (!await privateTableRejected(bob, 'player_container_cell')) throw new Error('player_container_cell_was_readable');
    if (!cellsIsolated(alice.connection.db.ownPlayerContainerCells.iter(), alice.identity)
      || !cellsIsolated(bob.connection.db.ownPlayerContainerCells.iter(), bob.identity)) {
      throw new Error('caller_container_cells_not_isolated');
    }

    const aliceStats = [...alice.connection.db.ownStats.iter()];
    const bobStats = [...bob.connection.db.ownStats.iter()];
    if (aliceStats.length !== 1 || !aliceStats[0]!.identity.isEqual(alice.identity)
      || bobStats.length !== 1 || !bobStats[0]!.identity.isEqual(bob.identity)) {
      throw new Error('caller_stats_view_not_isolated');
    }
    if ([...alice.connection.db.ownEffects.iter()].some((row) => !row.identity.isEqual(alice.identity))
      || [...bob.connection.db.ownEffects.iter()].some((row) => !row.identity.isEqual(bob.identity))) {
      throw new Error('caller_effect_view_not_isolated');
    }
    if ([...alice.connection.db.ownPlayerStatistics.iter()].some((row) => !row.identity.isEqual(alice.identity))
      || [...bob.connection.db.ownPlayerStatistics.iter()].some((row) => !row.identity.isEqual(bob.identity))
      || [...alice.connection.db.ownPlayerStatisticMilestones.iter()].some((row) => !row.identity.isEqual(alice.identity))
      || [...bob.connection.db.ownPlayerStatisticMilestones.iter()].some((row) => !row.identity.isEqual(bob.identity))) {
      throw new Error('caller_statistic_views_not_isolated');
    }

    const aliceCellBefore = occupiedCell(alice.connection.db.ownPlayerContainerCells.iter(), 'hotbar', 0);
    const bobCellBefore = occupiedCell(bob.connection.db.ownPlayerContainerCells.iter(), 'hotbar', 0);
    if (aliceCellBefore?.itemKind !== 'axe' || bobCellBefore?.itemKind !== 'axe') throw new Error('starter_inventory_missing');
    await bob.connection.reducers.dropSelected({});
    // Sparse: dropping the whole stack deletes the cell's row.
    await waitUntil('own_inventory_mutation', () => (
      occupiedCell(bob.connection.db.ownPlayerContainerCells.iter(), 'hotbar', 0) === null
    ));
    if (occupiedCell(alice.connection.db.ownPlayerContainerCells.iter(), 'hotbar', 0)?.itemKind !== 'axe') {
      throw new Error('cross_identity_inventory_mutation');
    }

    secondTab = await connect(alice.token);
    await acknowledgeProtocol(secondTab);
    await subscribe(secondTab);
    if (!secondTab.identity.isEqual(alice.identity)) throw new Error('same_token_changed_identity');
    await Promise.all([
      alice.connection.reducers.heartbeat({ active: false }),
      secondTab.connection.reducers.heartbeat({ active: false }),
    ]);
    alice.connection.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 31_000));
    await secondTab.connection.reducers.heartbeat({ active: false });
    const aliceProfile = bob.connection.db.playerPublic.identity.find(alice.identity);
    if (aliceProfile?.online !== true) throw new Error('first_tab_close_removed_presence');

    reconnect = await connect(alice.token);
    await acknowledgeProtocol(reconnect);
    await subscribe(reconnect);
    if (!reconnect.identity.isEqual(alice.identity)) throw new Error('reconnect_changed_identity');
    secondTab.connection.disconnect();
    reconnect.connection.disconnect();
    await waitUntil('last_tab_presence_close', () => (
      bob.connection.db.playerPublic.identity.find(alice.identity)?.online === false
    ), 40_000);

    const rawSpoof = await Promise.allSettled([
      bob.connection.callReducer('set_position', new Uint8Array(), { x: 1_000_000, y: 1_000_000 }),
    ]);
    if (rawSpoof[0]?.status !== 'rejected') throw new Error('position_spoof_was_accepted');

    process.stdout.write(`${JSON.stringify({
      distinctIdentities: true,
      privateInventoryRejected: true,
      containerCellsPrivateAndIsolated: true,
      callerStatsAndEffectsIsolated: true,
      callerStatisticViewsIsolated: true,
      crossIdentityMutationRejected: true,
      sameIdentityTwoTabs: true,
      presenceUntilLastTab: true,
      reconnectIdentity: true,
      positionSpoofRejected: true,
    }, null, 2)}\n`);
  } finally {
    clearInterval(bobHeartbeat);
    alice.connection.disconnect();
    bob.connection.disconnect();
    secondTab?.connection.disconnect();
    reconnect?.connection.disconnect();
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
