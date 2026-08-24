import {
  TILE_SIZE_FIXED,
  createPlaceholderCollisionMap,
  type Direction,
  type PlayerState,
} from '@orchard/sim';
import { ScheduleAt, SenderError, schema, table, t } from 'spacetimedb/server';
import {
  advanceAuthorityPlayer,
  canTendTree,
  chunkAt,
  decodeDirection,
  presenceLeaseExpired,
} from './world-rules.js';

const WORLD_COLLISION = createPlaceholderCollisionMap(48, 32);
const START_X = 8 * TILE_SIZE_FIXED;
const START_Y = 12 * TILE_SIZE_FIXED;

const player_public = table(
  { name: 'player_public', public: true },
  {
    identity: t.identity().primaryKey(),
    displayName: t.string(),
    online: t.bool(),
  },
);

const player_position = table(
  {
    name: 'player_position',
    public: true,
    indexes: [
      { accessor: 'by_chunk', algorithm: 'btree', columns: ['chunkX', 'chunkY'] },
    ],
  },
  {
    identity: t.identity().primaryKey(),
    x: t.i32(),
    y: t.i32(),
    chunkX: t.i16(),
    chunkY: t.i16(),
    facing: t.string(),
    moving: t.bool(),
    lastProcessedSequence: t.u64(),
    authorityTick: t.u64(),
  },
);

const player_input = table(
  { name: 'player_input' },
  {
    identity: t.identity().primaryKey(),
    direction: t.string(),
    sequence: t.u64(),
  },
);

const private_inventory = table(
  { name: 'private_inventory' },
  {
    identity: t.identity().primaryKey(),
    fruit: t.u64(),
    bottles: t.u64(),
    knowledge: t.u32(),
  },
);

const connection_presence = table(
  {
    name: 'connection_presence',
    indexes: [
      { accessor: 'by_identity', algorithm: 'btree', columns: ['identity'] },
    ],
  },
  {
    connectionId: t.connectionId().primaryKey(),
    identity: t.identity(),
  },
);

const connection_presence_v2 = table(
  {
    name: 'connection_presence_v2',
    indexes: [
      { accessor: 'by_identity', algorithm: 'btree', columns: ['identity'] },
    ],
  },
  {
    connectionId: t.connectionId().primaryKey(),
    identity: t.identity(),
    lastSeenAt: t.timestamp(),
  },
);

const world_tree = table(
  {
    name: 'world_tree',
    public: true,
    indexes: [
      { accessor: 'by_chunk', algorithm: 'btree', columns: ['chunkX', 'chunkY'] },
    ],
  },
  {
    id: t.u64().primaryKey(),
    owner: t.identity(),
    x: t.i32(),
    y: t.i32(),
    chunkX: t.i16(),
    chunkY: t.i16(),
    care: t.u16(),
    tendCount: t.u32(),
    lastTendedTick: t.u64(),
  },
);

const world_clock = table(
  { name: 'world_clock', public: true },
  {
    id: t.u8().primaryKey(),
    authorityTick: t.u64(),
  },
);

const movement_timer = table(
  { name: 'movement_timer' },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
  },
);

const spacetimedb = schema({
  player_public,
  player_position,
  player_input,
  private_inventory,
  connection_presence,
  connection_presence_v2,
  world_tree,
  world_clock,
  movement_timer,
});

export default spacetimedb;

function parseDirection(value: string): Direction | null {
  const direction = decodeDirection(value);
  if (direction === undefined) throw new SenderError('invalid_direction');
  return direction;
}

function validateDisplayName(value: string): string {
  const name = value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9 '-]{1,18}[A-Za-z0-9]$/.test(name)) {
    throw new SenderError('invalid_display_name');
  }
  return name;
}

export const init = spacetimedb.init((ctx) => {
  ctx.db.world_clock.insert({ id: 0, authorityTick: 0n });
  ctx.db.world_tree.insert({
    id: 1n,
    owner: ctx.databaseIdentity,
    x: 10 * TILE_SIZE_FIXED,
    y: 12 * TILE_SIZE_FIXED,
    chunkX: 0,
    chunkY: 0,
    care: 0,
    tendCount: 0,
    lastTendedTick: 0n,
  });
  ctx.db.movement_timer.insert({
    scheduledId: 0n,
    scheduledAt: ScheduleAt.interval(50_000n),
  });
});

export const onConnect = spacetimedb.clientConnected((ctx) => {
  if (ctx.connectionId === null) throw new SenderError('missing_connection_id');
  ctx.db.connection_presence_v2.insert({
    connectionId: ctx.connectionId,
    identity: ctx.sender,
    lastSeenAt: ctx.timestamp,
  });
  const profile = ctx.db.player_public.identity.find(ctx.sender);
  if (profile === null) {
    ctx.db.player_public.insert({
      identity: ctx.sender,
      displayName: 'New Farmer',
      online: true,
    });
    ctx.db.player_position.insert({
      identity: ctx.sender,
      x: START_X,
      y: START_Y,
      chunkX: 0,
      chunkY: 0,
      facing: 'down',
      moving: false,
      lastProcessedSequence: 0n,
      authorityTick: 0n,
    });
    ctx.db.player_input.insert({ identity: ctx.sender, direction: 'idle', sequence: 0n });
    ctx.db.private_inventory.insert({ identity: ctx.sender, fruit: 0n, bottles: 0n, knowledge: 0 });
    return;
  }
  ctx.db.player_public.identity.update({ ...profile, online: true });
});

export const onDisconnect = spacetimedb.clientDisconnected((ctx) => {
  if (ctx.connectionId !== null) {
    ctx.db.connection_presence_v2.connectionId.delete(ctx.connectionId);
  }
  const profile = ctx.db.player_public.identity.find(ctx.sender);
  const stillOnline = [...ctx.db.connection_presence_v2.by_identity.filter(ctx.sender)].length > 0;
  if (profile !== null) ctx.db.player_public.identity.update({ ...profile, online: stillOnline });
  if (stillOnline) return;
  const input = ctx.db.player_input.identity.find(ctx.sender);
  if (input !== null) ctx.db.player_input.identity.update({ ...input, direction: 'idle' });
  const position = ctx.db.player_position.identity.find(ctx.sender);
  if (position !== null) {
    ctx.db.player_position.identity.update({
      ...position,
      moving: false,
      lastProcessedSequence: input?.sequence ?? position.lastProcessedSequence,
    });
  }
});

export const setDisplayName = spacetimedb.reducer(
  { displayName: t.string() },
  (ctx, { displayName }) => {
    const profile = ctx.db.player_public.identity.find(ctx.sender);
    if (profile === null) throw new SenderError('player_not_ready');
    ctx.db.player_public.identity.update({
      ...profile,
      displayName: validateDisplayName(displayName),
    });
  },
);

export const heartbeat = spacetimedb.reducer((ctx) => {
  if (ctx.connectionId === null) throw new SenderError('missing_connection_id');
  const presence = ctx.db.connection_presence_v2.connectionId.find(ctx.connectionId);
  if (presence === null) {
    ctx.db.connection_presence_v2.insert({
      connectionId: ctx.connectionId,
      identity: ctx.sender,
      lastSeenAt: ctx.timestamp,
    });
    const profile = ctx.db.player_public.identity.find(ctx.sender);
    if (profile !== null && !profile.online) {
      ctx.db.player_public.identity.update({ ...profile, online: true });
    }
    return;
  }
  if (!presence.identity.isEqual(ctx.sender)) throw new SenderError('connection_identity_mismatch');
  ctx.db.connection_presence_v2.connectionId.update({
    ...presence,
    lastSeenAt: ctx.timestamp,
  });
});

export const setInput = spacetimedb.reducer(
  { direction: t.string(), sequence: t.u64() },
  (ctx, { direction, sequence }) => {
    parseDirection(direction);
    const input = ctx.db.player_input.identity.find(ctx.sender);
    if (input === null) throw new SenderError('player_not_ready');
    if (sequence <= input.sequence) return;
    ctx.db.player_input.identity.update({ ...input, direction, sequence });
  },
);

export const tendTree = spacetimedb.reducer(
  { treeId: t.u64() },
  (ctx, { treeId }) => {
    const position = ctx.db.player_position.identity.find(ctx.sender);
    const tree = ctx.db.world_tree.id.find(treeId);
    const clock = ctx.db.world_clock.id.find(0);
    if (position === null || tree === null || clock === null) {
      throw new SenderError('target_not_ready');
    }
    const result = canTendTree(
      position.x,
      position.y,
      tree.x,
      tree.y,
      tree.tendCount,
      tree.lastTendedTick,
      clock.authorityTick,
    );
    if (result === 'out_of_range') {
      throw new SenderError('target_out_of_range');
    }
    if (result === 'cooldown') {
      throw new SenderError('tree_recently_tended');
    }
    ctx.db.world_tree.id.update({
      ...tree,
      care: Math.min(100, tree.care + 1),
      tendCount: tree.tendCount + 1,
      lastTendedTick: clock.authorityTick,
    });
    const inventory = ctx.db.private_inventory.identity.find(ctx.sender);
    if (inventory !== null) {
      ctx.db.private_inventory.identity.update({
        ...inventory,
        knowledge: inventory.knowledge + 1,
      });
    }
  },
);

export const stepWorld = spacetimedb.reducer(
  { onSchedule: movement_timer },
  { scheduledMessage: movement_timer.rowType },
  (ctx) => {
    const clock = ctx.db.world_clock.id.find(0);
    if (clock === null) return;

    for (const presence of ctx.db.connection_presence_v2.iter()) {
      if (!presenceLeaseExpired(
        presence.lastSeenAt.microsSinceUnixEpoch,
        ctx.timestamp.microsSinceUnixEpoch,
      )) continue;
      ctx.db.connection_presence_v2.connectionId.delete(presence.connectionId);
      const stillOnline = [
        ...ctx.db.connection_presence_v2.by_identity.filter(presence.identity),
      ].length > 0;
      if (stillOnline) continue;
      const profile = ctx.db.player_public.identity.find(presence.identity);
      if (profile !== null) {
        ctx.db.player_public.identity.update({ ...profile, online: false });
      }
      const input = ctx.db.player_input.identity.find(presence.identity);
      if (input !== null) ctx.db.player_input.identity.update({ ...input, direction: 'idle' });
      const position = ctx.db.player_position.identity.find(presence.identity);
      if (position !== null) {
        ctx.db.player_position.identity.update({
          ...position,
          moving: false,
          lastProcessedSequence: input?.sequence ?? position.lastProcessedSequence,
        });
      }
    }

    if ([...ctx.db.connection_presence_v2.iter()].length === 0) return;
    const authorityTick = clock.authorityTick + 1n;
    ctx.db.world_clock.id.update({ ...clock, authorityTick });

    for (const row of ctx.db.player_position.iter()) {
      const online = [
        ...ctx.db.connection_presence_v2.by_identity.filter(row.identity),
      ].length > 0;
      if (!online) continue;
      const input = ctx.db.player_input.identity.find(row.identity);
      const direction = input === null ? null : parseDirection(input.direction);
      let player: PlayerState = {
        position: { x: row.x, y: row.y },
        facing: parseDirection(row.facing) ?? 'down',
        moving: row.moving,
        location: 'estate',
      };
      player = advanceAuthorityPlayer(player, direction, WORLD_COLLISION);
      ctx.db.player_position.identity.update({
        ...row,
        x: player.position.x,
        y: player.position.y,
        chunkX: chunkAt(player.position.x),
        chunkY: chunkAt(player.position.y),
        facing: player.facing,
        moving: player.moving,
        lastProcessedSequence: input?.sequence ?? row.lastProcessedSequence,
        authorityTick,
      });
    }
  },
);
