import {
  TILE_SIZE_FIXED, createSurvivalCollisionMap, movePlayer, type Direction, type PlayerState,
} from '../packages/sim/src/index.js';
import { DbConnection, tables } from '../packages/client/src/net/generated/index.js';
import type { Identity } from 'spacetimedb';

const HOST = process.env['SPACETIMEDB_HOST'] ?? 'http://127.0.0.1:3000';
const DATABASE = process.env['SPACETIMEDB_DATABASE'] ?? 'orchard-cellar-netcode-load';
const CLIENTS = Number(process.env['NETCODE_LOAD_CLIENTS'] ?? 25);
const DURATION_MS = Number(process.env['NETCODE_LOAD_DURATION_MS'] ?? 5_000);
const DIRECTIONS = ['up', 'down', 'left', 'right', 'upLeft', 'upRight', 'downLeft', 'downRight'] as const;

interface Client {
  readonly connection: DbConnection;
  readonly identity: Identity;
  sequence: bigint;
  clientTick: bigint;
  randomState: number;
  expected: PlayerState | null;
}
interface ReducerMetrics {
  readonly count: number;
  readonly sumSeconds: number;
  readonly buckets: ReadonlyMap<number, number>;
}
function wait(ms: number): Promise<void> { return new Promise((resolve) => setTimeout(resolve, ms)); }
async function waitUntil(label: string, predicate: () => boolean, timeoutMs = 5_000): Promise<void> {
  const started = performance.now();
  while (!predicate()) {
    if (performance.now() - started > timeoutMs) throw new Error(`${label}_timeout`);
    await wait(20);
  }
}
function connect(): Promise<Client> {
  return new Promise((resolve, reject) => {
    DbConnection.builder().withUri(HOST).withDatabaseName(DATABASE)
      .onConnect((connection, identity) => resolve({
        connection, identity, sequence: 0n, clientTick: 0n,
        randomState: Number.parseInt(identity.toHexString().slice(0, 8), 16) || 1,
        expected: null,
      }))
      .onConnectError((_context, error) => reject(error)).build();
  });
}

async function stepWorldMetrics(): Promise<ReducerMetrics> {
  const databaseIdentity = (await (await fetch(`${HOST}/v1/database/${DATABASE}/identity`)).text()).trim();
  const exposition = await (await fetch(`${HOST}/v1/metrics`)).text();
  let count = 0;
  let sumSeconds = 0;
  const buckets = new Map<number, number>();
  for (const line of exposition.split('\n')) {
    const bucket = /^spacetime_reducer_plus_query_duration_sec_bucket\{db="([^"]+)",reducer="step_world",le="([^"]+)"\} ([\d.eE+-]+)$/.exec(line);
    if (bucket?.[1] === databaseIdentity && bucket[2] !== '+Inf') {
      buckets.set(Number(bucket[2]), Number(bucket[3]));
      continue;
    }
    const sum = /^spacetime_reducer_plus_query_duration_sec_sum\{db="([^"]+)",reducer="step_world"\} ([\d.eE+-]+)$/.exec(line);
    if (sum?.[1] === databaseIdentity) { sumSeconds = Number(sum[2]); continue; }
    const observedCount = /^spacetime_reducer_plus_query_duration_sec_count\{db="([^"]+)",reducer="step_world"\} ([\d.eE+-]+)$/.exec(line);
    if (observedCount?.[1] === databaseIdentity) count = Number(observedCount[2]);
  }
  return { count, sumSeconds, buckets };
}

function advanceExpected(
  client: Client,
  direction: Direction,
  steps: number,
  collision: ReturnType<typeof createSurvivalCollisionMap>,
): void {
  if (client.expected === null) throw new Error('expected_state_missing');
  for (let step = 0; step < steps; step += 1) client.expected = movePlayer(client.expected, direction, collision);
}
function subscribe(client: Client): Promise<void> {
  return new Promise((resolve, reject) => client.connection.subscriptionBuilder()
    .onApplied(() => resolve()).onError((context) => reject(new Error(String(context.event))))
    .subscribe([tables.worldClock, tables.worldSeed, tables.worldResource, tables.playerPosition]));
}

async function main(): Promise<void> {
  const clients = await Promise.all(Array.from({ length: CLIENTS }, () => connect()));
  const clockTimes: Array<{ tick: bigint; time: number }> = [];
  try {
    await Promise.all(clients.map(subscribe));
    clients[0]?.connection.db.worldClock.onUpdate((_context, _old, row) => clockTimes.push({ tick: row.authorityTick, time: performance.now() }));
    const random = (client: Client): number => {
      let value = client.randomState;
      value ^= value << 13; value ^= value >>> 17; value ^= value << 5;
      client.randomState = value >>> 0;
      return client.randomState / 0x1_0000_0000;
    };
    const seed = [...(clients[0]?.connection.db.worldSeed.iter() ?? [])][0]?.seed;
    if (seed === undefined) throw new Error('world_seed_missing');
    const resources = [...(clients[0]?.connection.db.worldResource.iter() ?? [])].filter((row) => !row.depleted);
    if (resources.length === 0) throw new Error('world_resources_missing');
    const collision = createSurvivalCollisionMap(seed, resources.map((row) => ({
      id: Number(row.id), kind: 'tree' as const, tileX: row.tileX, tileY: row.tileY,
    })));
    for (const client of clients) {
      const row = client.connection.db.playerPosition.identity.find(client.identity);
      if (row === null) throw new Error('initial_position_missing');
      client.sequence = row.lastProcessedSequence;
      client.expected = {
        position: { x: row.x, y: row.y }, facing: row.facing as Direction,
        moving: row.moving, location: 'estate',
      };
    }
    const metricsBefore = await stepWorldMetrics();
    const started = performance.now(); let chopAttempts = 0;
    while (performance.now() - started < DURATION_MS) {
      await Promise.all(clients.map(async (client) => {
        const direction = DIRECTIONS[Math.floor(random(client) * DIRECTIONS.length)] ?? 'right';
        advanceExpected(client, direction, 2, collision);
        client.sequence += 1n;
        const startSequence = client.sequence;
        const startTick = client.clientTick;
        client.sequence += 1n;
        client.clientTick += 2n;
        const stopSequence = client.sequence;
        await Promise.all([
          client.connection.reducers.setInput({ direction, sequence: startSequence, clientTick: startTick, sprinting: false }),
          client.connection.reducers.setInput({ direction: 'idle', sequence: stopSequence, clientTick: client.clientTick, sprinting: false }),
        ]);
        if (random(client) < 0.25) {
          const position = client.expected?.position;
          const resource = position === undefined ? undefined : resources.reduce((farthest, candidate) => {
            const candidateDistance = (candidate.tileX * TILE_SIZE_FIXED - position.x) ** 2
              + (candidate.tileY * TILE_SIZE_FIXED - position.y) ** 2;
            const farthestDistance = (farthest.tileX * TILE_SIZE_FIXED - position.x) ** 2
              + (farthest.tileY * TILE_SIZE_FIXED - position.y) ** 2;
            return candidateDistance > farthestDistance ? candidate : farthest;
          }, resources[0] as (typeof resources)[number]);
          chopAttempts += 1;
          if (resource !== undefined) await client.connection.reducers.harvestResource({ resourceId: resource.id }).catch(() => undefined);
        }
      }));
      await wait(100);
    }
    await waitUntil('final_authority_replay', () => clients.every((client) => {
      const row = client.connection.db.playerPosition.identity.find(client.identity);
      return row !== null && client.expected !== null
        && row.lastProcessedSequence === client.sequence
        && row.x === client.expected.position.x && row.y === client.expected.position.y;
    }));
    const metricsAfter = await stepWorldMetrics();
    const intervals = clockTimes.slice(1).map((entry, index) => entry.time - (clockTimes[index]?.time ?? entry.time));
    const averageTickMs = intervals.reduce((sum, value) => sum + value, 0) / Math.max(1, intervals.length);
    if (averageTickMs > 55) throw new Error(`authority_cadence_over_budget:${averageTickMs.toFixed(1)}ms`);
    const reducerCount = metricsAfter.count - metricsBefore.count;
    const reducerAverageMs = reducerCount > 0
      ? (metricsAfter.sumSeconds - metricsBefore.sumSeconds) * 1_000 / reducerCount : Number.POSITIVE_INFINITY;
    const target = reducerCount * 0.95;
    const reducerP95Ms = [...metricsAfter.buckets.keys()].sort((left, right) => left - right)
      .find((boundary) => (metricsAfter.buckets.get(boundary) ?? 0) - (metricsBefore.buckets.get(boundary) ?? 0) >= target);
    if (reducerP95Ms === undefined || reducerP95Ms * 1_000 > 50) throw new Error(`step_world_p95_over_budget:${reducerP95Ms}`);
    if (chopAttempts === 0) throw new Error('no_chop_attempts');
    process.stdout.write(`${JSON.stringify({
      clients: clients.length,
      authorityCadenceMs: averageTickMs,
      stepWorldAverageMs: reducerAverageMs,
      stepWorldP95Ms: reducerP95Ms * 1_000,
      randomizedMovement: true,
      chopAttempts,
      finalReplayChecks: clients.length,
    })}\n`);
  } finally { for (const client of clients) client.connection.disconnect(); }
}
await main();
