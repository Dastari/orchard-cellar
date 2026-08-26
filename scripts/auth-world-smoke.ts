import { DbConnection, tables } from '../packages/client/src/net/generated/index.js';
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

function subscribe(client: Client): Promise<void> {
  return timeout('subscription', new Promise((resolve, reject) => {
    client.connection.subscriptionBuilder()
      .onApplied(() => resolve())
      .onError(() => reject(new Error('subscription_rejected')))
      .subscribe([
        tables.playerPublic,
        tables.ownSurvival,
        tables.ownInventorySlots,
        tables.ownStats,
        tables.ownEffects,
        tables.ownPlayerStatistics,
        tables.ownPlayerStatisticMilestones,
      ]);
  }));
}

function privateTableRejected(client: Client): Promise<boolean> {
  return timeout('private_table', new Promise((resolve) => {
    client.connection.subscriptionBuilder().onApplied(() => resolve(false)).onError(() => resolve(true))
      .subscribe('SELECT * FROM private_inventory');
  }));
}

async function waitUntil(label: string, condition: () => boolean, timeoutMs = TIMEOUT_MS): Promise<void> {
  const started = performance.now();
  while (!condition()) {
    if (performance.now() - started > timeoutMs) throw new Error(`${label}_timeout`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

async function main(): Promise<void> {
  const [alice, bob] = await Promise.all([
    connect(process.env['WORLD_SMOKE_ALICE_TOKEN']),
    connect(process.env['WORLD_SMOKE_BOB_TOKEN']),
  ]);
  let secondTab: Client | null = null;
  let reconnect: Client | null = null;
  const bobHeartbeat = setInterval(() => { void bob.connection.reducers.heartbeat({}).catch(() => undefined); }, 10_000);
  try {
    if (alice.identity.isEqual(bob.identity)) throw new Error('identities_not_distinct');
    await Promise.all([subscribe(alice), subscribe(bob)]);
    if (!await privateTableRejected(bob)) throw new Error('private_inventory_was_readable');

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

    const aliceSlotBefore = [...alice.connection.db.ownInventorySlots.iter()].find((row) => row.slot === 0);
    const bobSlotBefore = [...bob.connection.db.ownInventorySlots.iter()].find((row) => row.slot === 0);
    if (aliceSlotBefore?.itemKind !== 'axe' || bobSlotBefore?.itemKind !== 'axe') throw new Error('starter_inventory_missing');
    await bob.connection.reducers.dropSelected({});
    await waitUntil('own_inventory_mutation', () => (
      [...bob.connection.db.ownInventorySlots.iter()].find((row) => row.slot === 0)?.itemKind === 'empty'
    ));
    if ([...alice.connection.db.ownInventorySlots.iter()].find((row) => row.slot === 0)?.itemKind !== 'axe') {
      throw new Error('cross_identity_inventory_mutation');
    }

    secondTab = await connect(alice.token);
    await subscribe(secondTab);
    if (!secondTab.identity.isEqual(alice.identity)) throw new Error('same_token_changed_identity');
    await Promise.all([
      alice.connection.reducers.heartbeat({}),
      secondTab.connection.reducers.heartbeat({}),
    ]);
    alice.connection.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 31_000));
    await secondTab.connection.reducers.heartbeat({});
    const aliceProfile = bob.connection.db.playerPublic.identity.find(alice.identity);
    if (aliceProfile?.online !== true) throw new Error('first_tab_close_removed_presence');

    reconnect = await connect(alice.token);
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

await main();
