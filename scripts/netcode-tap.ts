import {
  createSurvivalCollisionMap,
  movePlayer,
  type Direction,
  type PlayerState,
} from '../packages/sim/src/index.js';
import { DbConnection, tables } from '../packages/client/src/net/generated/index.js';
import type { Identity } from 'spacetimedb';

const HOST = process.env['SPACETIMEDB_HOST'] ?? 'http://127.0.0.1:3000';
const DATABASE = process.env['SPACETIMEDB_DATABASE'] ?? 'orchard-cellar-world';
const DIRECTIONS: readonly Direction[] = ['up', 'right', 'down', 'left'];
const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const client = await new Promise<{ connection: DbConnection; identity: Identity }>((resolve, reject) => {
  DbConnection.builder().withUri(HOST).withDatabaseName(DATABASE)
    .onConnect((connection, identity) => resolve({ connection, identity }))
    .onConnectError((_context, error) => reject(error)).build();
});
try {
  await new Promise<void>((resolve, reject) => client.connection.subscriptionBuilder()
    .onApplied(() => resolve()).onError((context) => reject(new Error(String(context.event))))
    .subscribe([tables.playerPosition, tables.worldClock, tables.worldSeed, tables.worldResource]));
  const row = client.connection.db.playerPosition.identity.find(client.identity);
  const seed = [...client.connection.db.worldSeed.iter()][0]?.seed;
  if (row === null || seed === undefined) throw new Error('tap_fixture_missing');
  const collision = createSurvivalCollisionMap(seed, [...client.connection.db.worldResource.iter()]
    .filter((resource) => !resource.depleted)
    .map((resource) => ({ id: Number(resource.id), kind: 'tree' as const, tileX: resource.tileX, tileY: resource.tileY })));
  const start: PlayerState = {
    position: { x: row.x, y: row.y }, facing: row.facing as Direction,
    moving: false, location: 'estate',
  };
  const fixture = DIRECTIONS.map((direction) => {
    let expected = start;
    for (let step = 0; step < 2; step += 1) expected = movePlayer(expected, direction, collision);
    const third = movePlayer(expected, direction, collision);
    return { direction, expected, third };
  }).find(({ expected, third }) => (expected.position.x !== start.position.x || expected.position.y !== start.position.y)
    && (third.position.x !== expected.position.x || third.position.y !== expected.position.y));
  if (fixture === undefined) throw new Error('tap_safe_direction_missing');

  await new Promise<void>((resolve) => {
    let observedTicks = 0;
    client.connection.db.worldClock.onUpdate(() => {
      observedTicks += 1;
      // The scheduler already exists before the first client connects, so its
      // first active tick can be a partial interval. The second update begins a
      // full authority interval in which a 30 ms tap fits deterministically.
      if (observedTicks === 2) resolve();
    });
  });
  const startSequence = row.lastProcessedSequence + 1n;
  const stopSequence = startSequence + 1n;
  const startCall = client.connection.reducers.setInput({
    direction: fixture.direction,
    sequence: startSequence,
    clientTick: 0n,
    sprinting: false,
  });
  await wait(30);
  const stopCall = client.connection.reducers.setInput({
    direction: 'idle',
    sequence: stopSequence,
    clientTick: 2n,
    sprinting: false,
  });
  await Promise.all([startCall, stopCall]);
  const started = performance.now();
  while (true) {
    const current = client.connection.db.playerPosition.identity.find(client.identity);
    if (current?.lastProcessedSequence === stopSequence
      && current.x === fixture.expected.position.x
      && current.y === fixture.expected.position.y) break;
    if (performance.now() - started > 3_000) {
      throw new Error(`tap_mismatch:${current?.x},${current?.y}:${current?.lastProcessedSequence}`);
    }
    await wait(10);
  }
  process.stdout.write(`${JSON.stringify({ tapMs: 30, creditedSteps: 2, exact: true })}\n`);
} finally {
  client.connection.disconnect();
}
