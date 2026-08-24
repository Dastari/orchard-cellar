import { DbConnection, tables } from '../packages/client/src/net/generated/index.js';
import type { Identity } from 'spacetimedb';

const HOST = process.env['SPACETIMEDB_HOST'] ?? 'http://127.0.0.1:3000';
const DATABASE = process.env['SPACETIMEDB_DATABASE'] ?? 'orchard-cellar-world';
const TIMEOUT_MS = 15_000;

interface ConnectedClient {
  readonly connection: DbConnection;
  readonly identity: Identity;
  readonly identityHex: string;
  readonly token: string;
}

function timeout<T>(label: string, promise: Promise<T>): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_resolve, reject) => {
      setTimeout(() => reject(new Error(`${label}_timeout`)), TIMEOUT_MS);
    }),
  ]);
}

function connect(token?: string): Promise<ConnectedClient> {
  return timeout('connect', new Promise((resolve, reject) => {
    const builder = DbConnection.builder()
      .withUri(HOST)
      .withDatabaseName(DATABASE)
      .onConnect((connection, identity, issuedToken) => {
        resolve({ connection, identity, identityHex: identity.toHexString(), token: issuedToken });
      })
      .onConnectError((_context, error) => reject(error));
    if (token !== undefined) builder.withToken(token);
    builder.build();
  }));
}

function subscribeWorld(client: ConnectedClient): Promise<void> {
  return timeout('subscription', new Promise((resolve, reject) => {
    client.connection.subscriptionBuilder()
      .onApplied(() => resolve())
      .onError((context) => reject(new Error(String(context.event))))
      .subscribe([tables.playerPublic, tables.playerPosition, tables.worldTree, tables.worldClock]);
  }));
}

function subscribeSelf(client: ConnectedClient): Promise<void> {
  return timeout('self_subscription', new Promise((resolve, reject) => {
    client.connection.subscriptionBuilder()
      .onApplied(() => resolve())
      .onError((context) => reject(new Error(String(context.event))))
      .subscribe(tables.playerPosition.where((row) => row.identity.eq(client.identity)));
  }));
}

async function waitUntil(label: string, condition: () => boolean): Promise<void> {
  const started = performance.now();
  while (!condition()) {
    if (performance.now() - started > TIMEOUT_MS) throw new Error(`${label}_timeout`);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

function privateInventoryIsRejected(client: ConnectedClient): Promise<boolean> {
  return timeout('private_subscription', new Promise((resolve) => {
    client.connection.subscriptionBuilder()
      .onApplied(() => resolve(false))
      .onError(() => resolve(true))
      .subscribe('SELECT * FROM private_inventory');
  }));
}

async function main(): Promise<void> {
  const [alice, bob] = await Promise.all([connect(), connect()]);
  try {
    if (alice.identityHex === bob.identityHex) throw new Error('identities_not_distinct');
    await Promise.all([subscribeWorld(alice), subscribeWorld(bob)]);

    const reducerNames = Object.keys(alice.connection.reducers).sort();
    if (reducerNames.some((name) => name.toLowerCase().includes('position'))) {
      throw new Error('position_spoof_reducer_exposed');
    }

    const treeBefore = [...alice.connection.db.worldTree.iter()][0];
    if (treeBefore === undefined) throw new Error('tree_missing');
    await waitUntil('tree_cooldown', () => {
      const clock = [...alice.connection.db.worldClock.iter()][0];
      const tree = [...alice.connection.db.worldTree.iter()][0];
      return clock !== undefined && tree !== undefined
        && (tree.tendCount === 0 || clock.authorityTick - tree.lastTendedTick >= 20n);
    });

    const results = await Promise.allSettled([
      alice.connection.reducers.tendTree({ treeId: treeBefore.id }),
      bob.connection.reducers.tendTree({ treeId: treeBefore.id }),
    ]);
    const fulfilled = results.filter((result) => result.status === 'fulfilled').length;
    if (fulfilled !== 1) throw new Error(`atomic_tend_expected_one_success_got_${fulfilled}`);
    await waitUntil('tree_replication', () => {
      const aliceTree = [...alice.connection.db.worldTree.iter()][0];
      const bobTree = [...bob.connection.db.worldTree.iter()][0];
      return aliceTree?.tendCount === treeBefore.tendCount + 1
        && bobTree?.tendCount === treeBefore.tendCount + 1;
    });

    if (!await privateInventoryIsRejected(alice)) throw new Error('private_inventory_was_readable');

    const beforeSpoof = alice.connection.db.playerPosition.identity.find(alice.identity);
    if (beforeSpoof === null) throw new Error('position_missing_before_spoof');
    const rawSpoof = await Promise.allSettled([
      alice.connection.callReducer('set_position', new Uint8Array(), {
        x: beforeSpoof.x + 1_000_000,
        y: beforeSpoof.y + 1_000_000,
      }),
    ]);
    if (rawSpoof[0]?.status !== 'rejected') throw new Error('raw_position_spoof_was_accepted');
    const hostileInput = {
      direction: 'idle' as const,
      sequence: 1n,
      x: beforeSpoof.x + 1_000_000,
      y: beforeSpoof.y + 1_000_000,
    };
    await alice.connection.reducers.setInput(hostileInput);
    await waitUntil('spoof_ack', () => {
      return alice.connection.db.playerPosition.identity.find(alice.identity)?.lastProcessedSequence === 1n;
    });
    const afterSpoof = alice.connection.db.playerPosition.identity.find(alice.identity);
    if (afterSpoof?.x !== beforeSpoof.x || afterSpoof.y !== beforeSpoof.y) {
      throw new Error('position_spoof_succeeded');
    }

    alice.connection.reducers.setInput({ direction: 'right', sequence: 2n });
    await waitUntil('chunk_crossing', () => {
      return (alice.connection.db.playerPosition.identity.find(alice.identity)?.chunkX ?? 0) >= 2;
    });
    alice.connection.reducers.setInput({ direction: 'idle', sequence: 3n });
    await waitUntil('idle_ack', () => {
      return alice.connection.db.playerPosition.identity.find(alice.identity)?.lastProcessedSequence === 3n;
    });
    const positionBeforeReconnect = alice.connection.db.playerPosition.identity.find(alice.identity);
    alice.connection.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 150));

    const reconnected = await connect(alice.token);
    try {
      await subscribeSelf(reconnected);
      if (reconnected.identityHex !== alice.identityHex) throw new Error('identity_not_restored');
      const restored = reconnected.connection.db.playerPosition.identity.find(reconnected.identity);
      if (restored === null || positionBeforeReconnect === null) throw new Error('position_not_restored');
      if (restored.chunkX < 2 || restored.x !== positionBeforeReconnect.x) {
        throw new Error('non_origin_position_not_restored');
      }
      reconnected.connection.reducers.setInput({ direction: 'right', sequence: 4n });
      await waitUntil('post_reconnect_input', () => {
        const row = reconnected.connection.db.playerPosition.identity.find(reconnected.identity);
        return row?.lastProcessedSequence === 4n && row.x > restored.x;
      });
      reconnected.connection.reducers.setInput({ direction: 'idle', sequence: 5n });
    } finally {
      reconnected.connection.disconnect();
      await new Promise((resolve) => setTimeout(resolve, 150));
    }

    process.stdout.write(JSON.stringify({
      distinctIdentities: true,
      reducerNames,
      atomicTreeTend: true,
      rawPositionReducerRejected: true,
      extraPositionFieldsIgnored: true,
      nonOriginReconnect: true,
      postReconnectInput: true,
      privateInventoryRejected: true,
      reconnectIdentity: true,
    }, null, 2));
    process.stdout.write('\n');
  } finally {
    alice.connection.disconnect();
    bob.connection.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
}

await main();
