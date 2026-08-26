import {
  SURVIVAL_WORLD_SIZE, TILE_SIZE_FIXED, createSurvivalCollisionMap, movePlayer,
  type CollisionMap, type Direction, type PlayerState,
} from '../packages/sim/src/index.js';
import { DbConnection, tables } from '../packages/client/src/net/generated/index.js';
import { AvatarAnimationController } from '../packages/client/src/net/netcode.js';
import type { Identity } from 'spacetimedb';

const HOST = process.env['SPACETIMEDB_HOST'] ?? 'http://127.0.0.1:3000';
const DATABASE = process.env['SPACETIMEDB_DATABASE'] ?? 'orchard-cellar-world';
interface Client { readonly connection: DbConnection; readonly identity: Identity; sequence: bigint; clientTick: bigint }
const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
async function waitUntil(label: string, predicate: () => boolean, timeoutMs = 10_000): Promise<void> {
  const started = performance.now();
  while (!predicate()) { if (performance.now() - started > timeoutMs) throw new Error(`${label}_timeout`); await wait(20); }
}
function connect(): Promise<Client> {
  return new Promise((resolve, reject) => DbConnection.builder().withUri(HOST).withDatabaseName(DATABASE)
    .onConnect((connection, identity) => resolve({ connection, identity, sequence: 0n, clientTick: 0n }))
    .onConnectError((_context, error) => reject(error)).build());
}
function subscribe(client: Client): Promise<void> {
  return new Promise((resolve, reject) => client.connection.subscriptionBuilder().onApplied(() => resolve())
    .onError((context) => reject(new Error(String(context.event))))
    .subscribe([tables.playerPosition, tables.worldResource, tables.worldSeed]));
}
function stateAt(client: Client): PlayerState {
  const row = client.connection.db.playerPosition.identity.find(client.identity);
  if (row === null) throw new Error('position_missing');
  return { position: { x: row.x, y: row.y }, facing: row.facing as Direction, moving: row.moving, location: 'estate' };
}

const CARDINAL: ReadonlyArray<readonly [number, number, Direction]> = [
  [0, -1, 'up'], [1, 0, 'right'], [0, 1, 'down'], [-1, 0, 'left'],
];
function pathToTree(start: PlayerState, collision: CollisionMap, resources: ReadonlyArray<{ id: bigint; tileX: number; tileY: number }>): {
  readonly directions: Direction[]; readonly resourceId: bigint;
} {
  const startX = Math.floor(start.position.x / TILE_SIZE_FIXED);
  const startY = Math.floor(start.position.y / TILE_SIZE_FIXED);
  const key = (x: number, y: number): number => y * SURVIVAL_WORLD_SIZE + x;
  const queue: Array<readonly [number, number]> = [[startX, startY]];
  const parent = new Map<number, { previous: number; direction: Direction }>();
  const seen = new Set([key(startX, startY)]);
  let goal: { node: number; resourceId: bigint } | null = null;
  for (let cursor = 0; cursor < queue.length && goal === null; cursor += 1) {
    const [x, y] = queue[cursor] ?? [startX, startY];
    const centerX = x * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2;
    const centerY = y * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2;
    const resource = resources.find((row) => {
      const dx = row.tileX * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2 - centerX;
      const dy = row.tileY * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2 - centerY;
      return dx * dx + dy * dy <= (2 * TILE_SIZE_FIXED) ** 2;
    });
    if (resource !== undefined) { goal = { node: key(x, y), resourceId: resource.id }; break; }
    for (const [dx, dy, direction] of CARDINAL) {
      const nx = x + dx; const ny = y + dy; const node = key(nx, ny);
      if (nx < 0 || ny < 0 || nx >= SURVIVAL_WORLD_SIZE || ny >= SURVIVAL_WORLD_SIZE || seen.has(node)) continue;
      let probe: PlayerState = { ...start, position: { x: centerX, y: centerY } };
      for (let step = 0; step < 16; step += 1) probe = movePlayer(probe, direction, collision);
      if (probe.position.x !== nx * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2
        || probe.position.y !== ny * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2) continue;
      seen.add(node); parent.set(node, { previous: key(x, y), direction }); queue.push([nx, ny]);
    }
  }
  if (goal === null) throw new Error('reachable_tree_missing');
  const directions: Direction[] = []; let node = goal.node; const origin = key(startX, startY);
  while (node !== origin) { const edge = parent.get(node); if (edge === undefined) throw new Error('path_broken'); directions.push(edge.direction); node = edge.previous; }
  directions.reverse(); return { directions, resourceId: goal.resourceId };
}

async function exactRun(client: Client, direction: Direction, steps: number, collision: CollisionMap): Promise<void> {
  const before = stateAt(client); let expected = before;
  for (let step = 0; step < steps; step += 1) expected = movePlayer(expected, direction, collision);
  client.sequence += 1n; const startSequence = client.sequence; const startTick = client.clientTick;
  client.sequence += 1n; client.clientTick += BigInt(steps); const stopSequence = client.sequence;
  await Promise.all([
    client.connection.reducers.setInput({ direction, sequence: startSequence, clientTick: startTick }),
    client.connection.reducers.setInput({ direction: 'idle', sequence: stopSequence, clientTick: client.clientTick }),
  ]);
  await waitUntil('exact_run', () => {
    const row = client.connection.db.playerPosition.identity.find(client.identity);
    return row?.x === expected.position.x && row.y === expected.position.y;
  });
}

const [actor, observer] = await Promise.all([connect(), connect()]);
try {
  await Promise.all([subscribe(actor), subscribe(observer)]);
  const actorRow = observer.connection.db.playerPosition.identity.find(actor.identity);
  if (actorRow?.equippedKind !== 'axe') throw new Error('observer_missing_held_tool');
  actor.sequence = actorRow.lastProcessedSequence;
  const seed = [...actor.connection.db.worldSeed.iter()][0]?.seed;
  if (seed === undefined) throw new Error('seed_missing');
  const live = [...actor.connection.db.worldResource.iter()].filter((row) => !row.depleted);
  const collision = createSurvivalCollisionMap(seed, live);
  const route = pathToTree(stateAt(actor), collision, live);
  for (const direction of route.directions) { await exactRun(actor, direction, 12, collision); await exactRun(actor, direction, 4, collision); }
  const before = actor.connection.db.worldResource.id.find(route.resourceId);
  const beforeAction = actor.connection.db.playerPosition.identity.find(actor.identity)?.actionStartedTick;
  if (before === null || beforeAction === undefined) throw new Error('action_fixture_missing');
  let atomicCommitObserved = false;
  observer.connection.db.playerPosition.onUpdate(() => {
    const position = observer.connection.db.playerPosition.identity.find(actor.identity);
    const resource = observer.connection.db.worldResource.id.find(route.resourceId);
    if (position?.actionKind === 'swing_axe' && position.actionStartedTick > beforeAction
      && resource !== null && resource.health === before.health - 1) atomicCommitObserved = true;
  });
  observer.connection.db.worldResource.onUpdate(() => {
    const position = observer.connection.db.playerPosition.identity.find(actor.identity);
    const resource = observer.connection.db.worldResource.id.find(route.resourceId);
    if (position?.actionKind === 'swing_axe' && position.actionStartedTick > beforeAction
      && resource !== null && resource.health === before.health - 1) atomicCommitObserved = true;
  });
  await actor.connection.reducers.harvestResource({ resourceId: route.resourceId });
  await waitUntil('atomic_action_commit', () => atomicCommitObserved);
  const swingTick = observer.connection.db.playerPosition.identity.find(actor.identity)?.actionStartedTick;
  if (swingTick === undefined) throw new Error('observer_swing_missing');
  await actor.connection.reducers.dropSelected({});
  await waitUntil('observer_missing_art_action', () => {
    const row = observer.connection.db.playerPosition.identity.find(actor.identity);
    return row?.actionKind === 'drop' && row.actionStartedTick > swingTick;
  });
  const observedFallbackAction = observer.connection.db.playerPosition.identity.find(actor.identity);
  if (observedFallbackAction === null) throw new Error('observer_fallback_row_missing');
  const fallback = new AvatarAnimationController().update(
    observedFallbackAction.x,
    observedFallbackAction.y,
    observedFallbackAction.actionKind,
    observedFallbackAction.actionStartedTick,
    Number(observedFallbackAction.authorityTick),
    4,
    8,
    4,
    10,
    false,
  );
  if (!fallback.fallback || fallback.kind !== 'fallback_use') throw new Error('unknown_action_fallback_missing');
  process.stdout.write(`${JSON.stringify({
    heldToolVisible: true,
    swingReplicated: true,
    treeCommitAtomic: true,
    observerMissingArtFallback: true,
    pathTiles: route.directions.length,
  })}\n`);
} finally { actor.connection.disconnect(); observer.connection.disconnect(); }
