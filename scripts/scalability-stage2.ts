import { DbConnection, tables } from '../packages/client/src/net/generated/index.js';
import type { Identity } from 'spacetimedb';

const HOST = process.env['SPACETIMEDB_HOST'] ?? 'http://127.0.0.1:3000';
const DATABASE = process.env['SPACETIMEDB_DATABASE'] ?? 'orchard-cellar-scalability-stage2-scratch';
const TIMEOUT_MS = 45_000;
const RADIUS = 9;

interface Client {
  readonly connection: DbConnection;
  readonly identity: Identity;
}
type SubscriptionQuery = Parameters<ReturnType<DbConnection['subscriptionBuilder']>['subscribe']>[0];

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitUntil(label: string, predicate: () => boolean): Promise<void> {
  const started = performance.now();
  while (!predicate()) {
    if (performance.now() - started > TIMEOUT_MS) throw new Error(`${label}_timeout`);
    await wait(50);
  }
}

function connect(token?: string): Promise<Client> {
  return new Promise((resolve, reject) => {
    const builder = DbConnection.builder().withUri(HOST).withDatabaseName(DATABASE)
      .onConnect((connection, identity) => resolve({ connection, identity }))
      .onConnectError((_context, error) => reject(error));
    if (token !== undefined) builder.withToken(token);
    builder.build();
  });
}

function subscribe(client: Client, queries: SubscriptionQuery): Promise<void> {
  return new Promise((resolve, reject) => client.connection.subscriptionBuilder()
    .onApplied(() => resolve())
    .onError((context) => reject(new Error(String(context.event))))
    .subscribe(queries));
}

async function main(): Promise<void> {
  const [alice, bob] = await Promise.all([
    connect(process.env['STAGE2_ALICE_TOKEN']),
    connect(process.env['STAGE2_BOB_TOKEN']),
  ]);
  const heartbeat = setInterval(() => {
    void alice.connection.reducers.heartbeat({}).catch(() => undefined);
    void bob.connection.reducers.heartbeat({}).catch(() => undefined);
  }, 10_000);
  try {
    await Promise.all([
      subscribe(alice, tables.playerPosition.where((row) => row.identity.eq(alice.identity))),
      subscribe(bob, tables.playerPosition.where((row) => row.identity.eq(bob.identity))),
    ]);
    const alicePosition = alice.connection.db.playerPosition.identity.find(alice.identity);
    if (alicePosition === null) throw new Error('alice_position_missing');
    const bounds = {
      minX: Math.max(0, alicePosition.chunkX - RADIUS),
      minY: Math.max(0, alicePosition.chunkY - RADIUS),
      maxX: alicePosition.chunkX + RADIUS,
      maxY: alicePosition.chunkY + RADIUS,
    };
    let profileInserts = 0;
    let hiveInserts = 0;
    alice.connection.db.worldWildlifeProfile.onInsert(() => { profileInserts += 1; });
    alice.connection.db.worldHive.onInsert(() => { hiveInserts += 1; });
    const profiles = [];
    const hives = [];
    for (let y = bounds.minY; y <= bounds.maxY; y += 1) for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
      profiles.push(tables.worldWildlifeProfile.where((row) => row.spaceId.eq(alicePosition.spaceId))
        .where((row) => row.chunkX.eq(x)).where((row) => row.chunkY.eq(y)));
      hives.push(tables.worldHive.where((row) => row.spaceId.eq(alicePosition.spaceId))
        .where((row) => row.chunkX.eq(x)).where((row) => row.chunkY.eq(y)));
    }
    await Promise.all([
      subscribe(alice, [tables.onlinePlayerPublic, tables.onlinePlayerAppearances, ...profiles, ...hives]),
      subscribe(bob, [tables.onlinePlayerPublic, tables.onlinePlayerAppearances, tables.worldWildlifeProfile, tables.worldHive]),
    ]);
    const aliceProfiles = [...alice.connection.db.worldWildlifeProfile.iter()];
    const aliceHives = [...alice.connection.db.worldHive.iter()];
    const bobProfiles = [...bob.connection.db.worldWildlifeProfile.iter()];
    const bobHives = [...bob.connection.db.worldHive.iter()];
    if (aliceProfiles.length === 0 || aliceHives.length === 0) throw new Error('regional_fixture_empty');
    if (aliceProfiles.length >= bobProfiles.length || aliceHives.length >= bobHives.length) {
      throw new Error('regional_scope_did_not_reduce_rows');
    }
    if (aliceProfiles.some((row) => row.chunkX < bounds.minX || row.chunkX > bounds.maxX
      || row.chunkY < bounds.minY || row.chunkY > bounds.maxY)) throw new Error('wildlife_profile_outside_region');
    if (aliceHives.some((row) => row.chunkX < bounds.minX || row.chunkX > bounds.maxX
      || row.chunkY < bounds.minY || row.chunkY > bounds.maxY)) throw new Error('hive_outside_region');
    if (profileInserts !== aliceProfiles.length || hiveInserts !== aliceHives.length) {
      throw new Error(`initial_callbacks_incomplete:${profileInserts}/${aliceProfiles.length}:${hiveInserts}/${aliceHives.length}`);
    }
    if (alice.connection.db.onlinePlayerPublic.identity.find(bob.identity) === null
      || alice.connection.db.onlinePlayerAppearances.identity.find(bob.identity) === null) {
      throw new Error('online_registry_row_missing');
    }
    const registryRowsBefore = [...alice.connection.db.onlinePlayerPublic.iter()].length;
    bob.connection.disconnect();
    await wait(1_000);
    if (alice.connection.db.onlinePlayerPublic.identity.find(bob.identity) === null) {
      throw new Error('recently_seen_grace_missing');
    }
    await waitUntil('offline_registry_eviction', () => (
      alice.connection.db.onlinePlayerPublic.identity.find(bob.identity) === null
      && alice.connection.db.onlinePlayerAppearances.identity.find(bob.identity) === null
    ));
    const registryRowsAfter = [...alice.connection.db.onlinePlayerPublic.iter()].length;
    process.stdout.write(`${JSON.stringify({
      initialCallbacks: { wildlifeProfiles: profileInserts, hives: hiveInserts },
      regionalRows: { wildlifeProfiles: aliceProfiles.length, hives: aliceHives.length },
      globalRows: { wildlifeProfiles: bobProfiles.length, hives: bobHives.length },
      registryRowsBefore,
      registryRowsAfter,
      recentlySeenGraceSeconds: 30,
    })}\n`);
  } finally {
    clearInterval(heartbeat);
    alice.connection.disconnect();
    bob.connection.disconnect();
  }
}

await main();
