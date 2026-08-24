import { DbConnection, tables } from '../packages/client/src/net/generated/index.js';
import { TILE_SIZE_FIXED } from '../packages/sim/src/index.js';
import { readFile, writeFile } from 'node:fs/promises';
import type { Identity } from 'spacetimedb';

const HOST = process.env['SPACETIMEDB_HOST'] ?? 'http://127.0.0.1:3000';
const DATABASE = process.env['SPACETIMEDB_DATABASE'] ?? 'orchard-cellar-world';
const TIMEOUT_MS = 30_000;
const TOKEN_CACHE_PATH = process.env['WORLD_SMOKE_TOKEN_CACHE'] ?? '.world-smoke-tokens.json';
const TOKEN_CACHE_KEY = `${HOST}|${DATABASE}`;

interface ConnectedClient {
  readonly connection: DbConnection;
  readonly identity: Identity;
  readonly identityHex: string;
  readonly token: string;
}

interface Sequence {
  value: bigint;
}

interface SmokeTokens {
  readonly alice: string;
  readonly bob: string;
}

async function loadTokenCache(): Promise<Record<string, SmokeTokens>> {
  try {
    const parsed = JSON.parse(await readFile(TOKEN_CACHE_PATH, 'utf8')) as unknown;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    return parsed as Record<string, SmokeTokens>;
  } catch {
    return {};
  }
}

async function saveTokens(cache: Record<string, SmokeTokens>, tokens: SmokeTokens): Promise<void> {
  cache[TOKEN_CACHE_KEY] = tokens;
  await writeFile(TOKEN_CACHE_PATH, `${JSON.stringify(cache, null, 2)}\n`, { mode: 0o600 });
}

function timeout<T>(label: string, promise: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label}_timeout`)), TIMEOUT_MS);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
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
      .subscribe([
        tables.playerPublic,
        tables.playerPosition,
        tables.worldTree,
        tables.worldClock,
        tables.farmParcel,
        tables.cropPatch,
        tables.farmActivity,
      ]);
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

async function moveNear(
  client: ConnectedClient,
  sequence: Sequence,
  tileX: number,
  tileY: number,
): Promise<void> {
  const moveAxis = async (axis: 'x' | 'y', target: number): Promise<void> => {
    const row = client.connection.db.playerPosition.identity.find(client.identity);
    if (row === null) throw new Error('farm_move_position_missing');
    const current = axis === 'x' ? row.x : row.y;
    if (Math.abs(current - target) <= TILE_SIZE_FIXED) return;
    const direction = axis === 'x'
      ? current < target ? 'right' : 'left'
      : current < target ? 'down' : 'up';
    sequence.value += 1n;
    await client.connection.reducers.setInput({ direction, sequence: sequence.value });
    await waitUntil(`farm_move_${axis}`, () => {
      const position = client.connection.db.playerPosition.identity.find(client.identity);
      if (position === null) return false;
      return Math.abs((axis === 'x' ? position.x : position.y) - target) <= TILE_SIZE_FIXED;
    });
    sequence.value += 1n;
    await client.connection.reducers.setInput({ direction: 'idle', sequence: sequence.value });
    await waitUntil(`farm_move_${axis}_idle`, () => {
      return client.connection.db.playerPosition.identity.find(client.identity)?.lastProcessedSequence === sequence.value;
    });
  };
  await moveAxis('x', tileX * TILE_SIZE_FIXED);
  await moveAxis('y', tileY * TILE_SIZE_FIXED);
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
  const tokenCache = await loadTokenCache();
  const cached = tokenCache[TOKEN_CACHE_KEY];
  const aliceToken = process.env['WORLD_SMOKE_ALICE_TOKEN'] ?? cached?.alice;
  const bobToken = process.env['WORLD_SMOKE_BOB_TOKEN'] ?? cached?.bob;
  const [alice, bob] = await Promise.all([connect(aliceToken), connect(bobToken)]);
  await saveTokens(tokenCache, { alice: alice.token, bob: bob.token });
  const heartbeatTimer = setInterval(() => {
    void alice.connection.reducers.heartbeat({}).catch(() => undefined);
    void bob.connection.reducers.heartbeat({}).catch(() => undefined);
  }, 10_000);
  try {
    if (alice.identityHex === bob.identityHex) throw new Error('identities_not_distinct');
    await Promise.all([subscribeWorld(alice), subscribeWorld(bob)]);

    const reducerNames = Object.keys(alice.connection.reducers).sort();
    if (reducerNames.some((name) => name.toLowerCase().includes('position'))) {
      throw new Error('position_spoof_reducer_exposed');
    }
    if (!reducerNames.includes('useFarmTile')) throw new Error('farm_action_reducer_missing');
    const aliceStart = alice.connection.db.playerPosition.identity.find(alice.identity);
    const bobStart = bob.connection.db.playerPosition.identity.find(bob.identity);
    if (aliceStart === null || bobStart === null) throw new Error('initial_position_missing');
    const aliceSequence: Sequence = { value: aliceStart.lastProcessedSequence };
    const bobSequence: Sequence = { value: bobStart.lastProcessedSequence };

    await Promise.all([
      moveNear(alice, aliceSequence, 10, 12),
      moveNear(bob, bobSequence, 10, 12),
    ]);

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

    const aliceParcel = [...alice.connection.db.farmParcel.iter()]
      .find((parcel) => parcel.owner.isEqual(alice.identity));
    if (aliceParcel === undefined) throw new Error('alice_parcel_missing');
    const farmTileX = aliceParcel.originX + 2;
    const farmTileY = aliceParcel.originY + 5;
    await Promise.all([
      moveNear(alice, aliceSequence, farmTileX, farmTileY),
      moveNear(bob, bobSequence, farmTileX, farmTileY),
    ]);
    const aliceActivityBefore = alice.connection.db.farmActivity.identity.find(alice.identity);
    const bobActivityBefore = bob.connection.db.farmActivity.identity.find(bob.identity);
    if (aliceActivityBefore === null || bobActivityBefore === null) throw new Error('farm_activity_missing');
    await alice.connection.reducers.useFarmTile({ tileX: farmTileX, tileY: farmTileY });
    await bob.connection.reducers.useFarmTile({ tileX: farmTileX, tileY: farmTileY });
    await waitUntil('cooperative_water_replication', () => {
      const crop = [...alice.connection.db.cropPatch.iter()]
        .find((row) => row.tileX === farmTileX && row.tileY === farmTileY);
      const aliceActivity = alice.connection.db.farmActivity.identity.find(alice.identity);
      const bobActivity = alice.connection.db.farmActivity.identity.find(bob.identity);
      return crop?.watered === true
        && crop.owner.isEqual(alice.identity)
        && aliceActivity?.planted === aliceActivityBefore.planted + 1
        && bobActivity?.watered === bobActivityBefore.watered + 1;
    });
    const premature = await Promise.allSettled([
      alice.connection.reducers.useFarmTile({ tileX: farmTileX, tileY: farmTileY }),
    ]);
    if (premature[0]?.status !== 'rejected') throw new Error('premature_harvest_was_accepted');
    const plantedCrop = [...alice.connection.db.cropPatch.iter()]
      .find((row) => row.tileX === farmTileX && row.tileY === farmTileY);
    if (plantedCrop === undefined) throw new Error('planted_crop_missing');
    await waitUntil('crop_maturity', () => {
      const clock = [...alice.connection.db.worldClock.iter()][0];
      return clock !== undefined && clock.authorityTick - plantedCrop.wateredAtTick >= 200n;
    });
    const harvestRace = await Promise.allSettled([
      alice.connection.reducers.useFarmTile({ tileX: farmTileX, tileY: farmTileY }),
      bob.connection.reducers.useFarmTile({ tileX: farmTileX, tileY: farmTileY }),
    ]);
    if (harvestRace.filter((result) => result.status === 'fulfilled').length !== 1) {
      throw new Error('harvest_race_did_not_commit_exactly_once');
    }
    await waitUntil('harvest_replication', () => {
      const cropStillExists = [...bob.connection.db.cropPatch.iter()]
        .some((row) => row.tileX === farmTileX && row.tileY === farmTileY);
      const aliceActivity = bob.connection.db.farmActivity.identity.find(alice.identity);
      const bobActivity = bob.connection.db.farmActivity.identity.find(bob.identity);
      return !cropStillExists
        && aliceActivity?.harvested === aliceActivityBefore.harvested + 1
        && bobActivity?.harvested === bobActivityBefore.harvested;
    });

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
      sequence: aliceSequence.value + 1n,
      x: beforeSpoof.x + 1_000_000,
      y: beforeSpoof.y + 1_000_000,
    };
    aliceSequence.value = hostileInput.sequence;
    await alice.connection.reducers.setInput(hostileInput);
    await waitUntil('spoof_ack', () => {
      return alice.connection.db.playerPosition.identity.find(alice.identity)?.lastProcessedSequence === aliceSequence.value;
    });
    const afterSpoof = alice.connection.db.playerPosition.identity.find(alice.identity);
    if (afterSpoof?.x !== beforeSpoof.x || afterSpoof.y !== beforeSpoof.y) {
      throw new Error('position_spoof_succeeded');
    }

    const startingChunk = afterSpoof?.chunkX ?? 0;
    const chunkDirection = startingChunk >= 1 ? 'left' : 'right';
    const destinationChunk = startingChunk >= 1 ? startingChunk - 1 : startingChunk + 1;
    aliceSequence.value += 1n;
    alice.connection.reducers.setInput({ direction: chunkDirection, sequence: aliceSequence.value });
    await waitUntil('chunk_crossing', () => {
      return alice.connection.db.playerPosition.identity.find(alice.identity)?.chunkX === destinationChunk;
    });
    aliceSequence.value += 1n;
    alice.connection.reducers.setInput({ direction: 'idle', sequence: aliceSequence.value });
    await waitUntil('idle_ack', () => {
      return alice.connection.db.playerPosition.identity.find(alice.identity)?.lastProcessedSequence === aliceSequence.value;
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
      if (restored.chunkX !== positionBeforeReconnect.chunkX || restored.x !== positionBeforeReconnect.x) {
        throw new Error('non_origin_position_not_restored');
      }
      aliceSequence.value += 1n;
      reconnected.connection.reducers.setInput({ direction: 'right', sequence: aliceSequence.value });
      await waitUntil('post_reconnect_input', () => {
        const row = reconnected.connection.db.playerPosition.identity.find(reconnected.identity);
        return row?.lastProcessedSequence === aliceSequence.value && row.x > restored.x;
      });
      aliceSequence.value += 1n;
      reconnected.connection.reducers.setInput({ direction: 'idle', sequence: aliceSequence.value });
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
      farmSampleReducer: true,
      publicFarmTables: ['farmParcel', 'cropPatch', 'farmActivity'],
      cooperativeFarmLoop: true,
      atomicHarvestRace: true,
    }, null, 2));
    process.stdout.write('\n');
  } finally {
    clearInterval(heartbeatTimer);
    alice.connection.disconnect();
    bob.connection.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
}

await main();
