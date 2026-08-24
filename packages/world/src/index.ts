import {
  AUTHORITY_TICK_MICROS,
  FIXED_UNITS_PER_PIXEL,
  SURVIVAL_CHUNK_TILES,
  SURVIVAL_WORLD_SEED,
  SURVIVAL_WORLD_VERSION,
  TILE_SIZE_FIXED,
  avatarActionAfterMovement,
  avatarActionForEquippedKind,
  generateSurvivalResources,
  movePlayer,
  survivalSpawnPosition,
  type Direction,
  type PlayerState,
} from '@orchard/sim';
import { ScheduleAt, SenderError, schema, table, t } from 'spacetimedb/server';
import {
  canTendTree,
  canUseFarmTile,
  chunkAt,
  CROP_GROWTH_TICKS,
  createAuthoritySurvivalCollisionMap,
  decodeDirection,
  inputIsStale,
  itemDropPosition,
  itemWithinPickupReach,
  isFarmBedTile,
  MAX_SETTLE_STEPS_PER_TICK,
  movementCreditAvailable,
  queueMovementAcknowledgement,
  drainMovementAcknowledgement,
  drainMovementRunQueue,
  nextActionStartedTick,
  presenceLeaseExpired,
  resourceHarvestResult,
  settleMovementRun,
} from './world-rules.js';
import { authenticationRejection } from './auth-policy.js';

const HOTBAR_SLOTS = ['axe', 'pickaxe', 'hoe', 'watering_can', 'empty', 'empty', 'empty', 'empty', 'empty'] as const;

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
    actionKind: t.string(),
    actionStartedTick: t.u64(),
    equippedKind: t.string(),
  },
);

const player_input = table(
  { name: 'player_input' },
  {
    identity: t.identity().primaryKey(),
    direction: t.string(),
    sequence: t.u64(),
    settledSequence: t.u64(),
    pendingSequence: t.u64(),
    updatedAtMicros: t.u64(),
    runStartClientTick: t.u64(),
    appliedSteps: t.u64(),
    settleDirection: t.string(),
    settleSteps: t.u8(),
    creditStartedAtMicros: t.u64(),
    creditedSteps: t.u64(),
  },
);

const player_equipment = table(
  { name: 'player_equipment', public: true },
  {
    identity: t.identity().primaryKey(),
    itemKind: t.string(),
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

const player_survival = table(
  { name: 'player_survival' },
  {
    identity: t.identity().primaryKey(),
    spawnSlot: t.u8(),
    wood: t.u32(),
    stone: t.u32(),
    selectedSlot: t.u8(),
  },
);

const inventory_slot = table(
  {
    name: 'inventory_slot',
    indexes: [
      { accessor: 'by_identity', algorithm: 'btree', columns: ['identity'] },
    ],
  },
  {
    id: t.string().primaryKey(),
    identity: t.identity(),
    slot: t.u8(),
    itemKind: t.string(),
    quantity: t.u16(),
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

const world_seed = table(
  { name: 'world_seed', public: true },
  {
    id: t.u8().primaryKey(),
    seed: t.u32(),
    version: t.u16(),
  },
);

const world_resource = table(
  {
    name: 'world_resource',
    public: true,
    indexes: [
      { accessor: 'by_chunk', algorithm: 'btree', columns: ['chunkX', 'chunkY'] },
    ],
  },
  {
    id: t.u64().primaryKey(),
    kind: t.string(),
    tileX: t.i16(),
    tileY: t.i16(),
    chunkX: t.i16(),
    chunkY: t.i16(),
    health: t.u8(),
    depleted: t.bool(),
  },
);

const world_item = table(
  {
    name: 'world_item',
    public: true,
    indexes: [
      { accessor: 'by_chunk', algorithm: 'btree', columns: ['chunkX', 'chunkY'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    itemKind: t.string(),
    quantity: t.u16(),
    x: t.i32(),
    y: t.i32(),
    chunkX: t.i16(),
    chunkY: t.i16(),
    droppedAtTick: t.u64(),
  },
);

const farm_parcel = table(
  {
    name: 'farm_parcel',
    public: true,
    indexes: [
      { accessor: 'by_owner', algorithm: 'btree', columns: ['owner'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    owner: t.identity(),
    name: t.string(),
    originX: t.i16(),
    originY: t.i16(),
    width: t.u8(),
    height: t.u8(),
  },
);

const crop_patch = table(
  {
    name: 'crop_patch',
    public: true,
    indexes: [
      { accessor: 'by_chunk', algorithm: 'btree', columns: ['chunkX', 'chunkY'] },
      { accessor: 'by_parcel', algorithm: 'btree', columns: ['parcelId'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    parcelId: t.u64(),
    owner: t.identity(),
    tileX: t.i16(),
    tileY: t.i16(),
    chunkX: t.i16(),
    chunkY: t.i16(),
    plantedAtTick: t.u64(),
    watered: t.bool(),
    wateredAtTick: t.u64(),
  },
);

const farm_activity = table(
  { name: 'farm_activity', public: true },
  {
    identity: t.identity().primaryKey(),
    planted: t.u32(),
    watered: t.u32(),
    harvested: t.u32(),
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
  player_equipment,
  private_inventory,
  player_survival,
  inventory_slot,
  connection_presence,
  connection_presence_v2,
  world_tree,
  world_clock,
  world_seed,
  world_resource,
  world_item,
  farm_parcel,
  crop_patch,
  farm_activity,
  movement_timer,
});

export default spacetimedb;

export const ownSurvival = spacetimedb.view(
  { name: 'own_survival', public: true },
  t.option(player_survival.rowType),
  (ctx) => ctx.db.player_survival.identity.find(ctx.sender) ?? undefined,
);

export const ownInventorySlots = spacetimedb.view(
  { name: 'own_inventory_slots', public: true },
  t.array(inventory_slot.rowType),
  (ctx) => [...ctx.db.inventory_slot.by_identity.filter(ctx.sender)],
);

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
  ctx.db.world_seed.insert({ id: 0, seed: SURVIVAL_WORLD_SEED, version: SURVIVAL_WORLD_VERSION });
  for (const resource of generateSurvivalResources()) {
    ctx.db.world_resource.insert({
      id: BigInt(resource.id),
      kind: resource.kind,
      tileX: resource.tileX,
      tileY: resource.tileY,
      chunkX: Math.floor(resource.tileX / SURVIVAL_CHUNK_TILES),
      chunkY: Math.floor(resource.tileY / SURVIVAL_CHUNK_TILES),
      health: 3,
      depleted: false,
    });
  }
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
    scheduledAt: ScheduleAt.interval(AUTHORITY_TICK_MICROS),
  });
});

export const onConnect = spacetimedb.clientConnected((ctx) => {
  if (ctx.connectionId === null) throw new SenderError('missing_connection_id');
  const authRejection = authenticationRejection(ctx.senderAuth.jwt);
  if (authRejection !== null) throw new SenderError(authRejection);
  // Additive module publishes do not rerun init. The first post-upgrade connection
  // transactionally installs the immutable seed and initial mutable resources.
  const installedWorld = ctx.db.world_seed.id.find(0);
  if (installedWorld === null || installedWorld.version < SURVIVAL_WORLD_VERSION) {
    for (const crop of ctx.db.crop_patch.iter()) ctx.db.crop_patch.id.delete(crop.id);
    for (const parcel of ctx.db.farm_parcel.iter()) ctx.db.farm_parcel.id.delete(parcel.id);
    for (const resource of ctx.db.world_resource.iter()) ctx.db.world_resource.id.delete(resource.id);
    const nextWorld = { id: 0, seed: SURVIVAL_WORLD_SEED, version: SURVIVAL_WORLD_VERSION };
    if (installedWorld === null) ctx.db.world_seed.insert(nextWorld);
    else ctx.db.world_seed.id.update(nextWorld);
    for (const resource of generateSurvivalResources()) {
      ctx.db.world_resource.insert({
        id: BigInt(resource.id),
        kind: resource.kind,
        tileX: resource.tileX,
        tileY: resource.tileY,
        chunkX: Math.floor(resource.tileX / SURVIVAL_CHUNK_TILES),
        chunkY: Math.floor(resource.tileY / SURVIVAL_CHUNK_TILES),
        health: 3,
        depleted: false,
      });
    }
  }
  ctx.db.connection_presence_v2.insert({
    connectionId: ctx.connectionId,
    identity: ctx.sender,
    lastSeenAt: ctx.timestamp,
  });
  let survival = ctx.db.player_survival.identity.find(ctx.sender);
  const enteringSurvivalWorld = survival === null;
  if (survival === null) {
    const occupied = new Set([...ctx.db.player_survival.iter()].map((row) => row.spawnSlot));
    const spawnSlot = Array.from({ length: 25 }, (_, slot) => slot).find((slot) => !occupied.has(slot));
    if (spawnSlot === undefined) throw new SenderError('survival_world_full');
    survival = ctx.db.player_survival.insert({
      identity: ctx.sender,
      spawnSlot,
      wood: 0,
      stone: 0,
      selectedSlot: 0,
    });
    for (const [slot, itemKind] of HOTBAR_SLOTS.entries()) {
      ctx.db.inventory_slot.insert({
        id: `${ctx.sender.toHexString()}:${slot}`,
        identity: ctx.sender,
        slot,
        itemKind,
        quantity: itemKind === 'empty' ? 0 : 1,
      });
    }
  }
  const spawn = survivalSpawnPosition(survival.spawnSlot);
  if (spawn === null) throw new SenderError('invalid_spawn_slot');
  const profile = ctx.db.player_public.identity.find(ctx.sender);
  if (profile === null) {
    ctx.db.player_public.insert({
      identity: ctx.sender,
      displayName: 'New Farmer',
      online: true,
    });
    ctx.db.player_position.insert({
      identity: ctx.sender,
      x: spawn.x,
      y: spawn.y,
      chunkX: chunkAt(spawn.x),
      chunkY: chunkAt(spawn.y),
      facing: 'down',
      moving: false,
      lastProcessedSequence: 0n,
      authorityTick: 0n,
      actionKind: 'none',
      actionStartedTick: 0n,
      equippedKind: HOTBAR_SLOTS[0],
    });
    ctx.db.player_input.insert({
      identity: ctx.sender,
      direction: 'idle',
      sequence: 0n,
      settledSequence: 0n,
      pendingSequence: 0n,
      updatedAtMicros: ctx.timestamp.microsSinceUnixEpoch,
      runStartClientTick: 0n,
      appliedSteps: 0n,
      settleDirection: 'idle',
      settleSteps: 0,
      creditStartedAtMicros: ctx.timestamp.microsSinceUnixEpoch,
      creditedSteps: 0n,
    });
    ctx.db.private_inventory.insert({ identity: ctx.sender, fruit: 0n, bottles: 0n, knowledge: 0 });
  } else {
    ctx.db.player_public.identity.update({ ...profile, online: true });
    const position = ctx.db.player_position.identity.find(ctx.sender);
    if (position === null) {
      ctx.db.player_position.insert({
        identity: ctx.sender,
        x: spawn.x,
        y: spawn.y,
        chunkX: chunkAt(spawn.x),
        chunkY: chunkAt(spawn.y),
        facing: 'down',
        moving: false,
        lastProcessedSequence: 0n,
        authorityTick: 0n,
        actionKind: 'none',
        actionStartedTick: 0n,
        equippedKind: HOTBAR_SLOTS[0],
      });
    } else if (enteringSurvivalWorld) {
      ctx.db.player_position.identity.update({
        ...position,
        x: spawn.x,
        y: spawn.y,
        chunkX: chunkAt(spawn.x),
        chunkY: chunkAt(spawn.y),
        moving: false,
        actionKind: 'none',
        actionStartedTick: 0n,
      });
    }
    if (ctx.db.player_input.identity.find(ctx.sender) === null) {
      ctx.db.player_input.insert({
        identity: ctx.sender,
        direction: 'idle',
        sequence: 0n,
        settledSequence: 0n,
        pendingSequence: 0n,
        updatedAtMicros: ctx.timestamp.microsSinceUnixEpoch,
        runStartClientTick: 0n,
        appliedSteps: 0n,
        settleDirection: 'idle',
        settleSteps: 0,
        creditStartedAtMicros: ctx.timestamp.microsSinceUnixEpoch,
        creditedSteps: 0n,
      });
    } else {
      const input = ctx.db.player_input.identity.find(ctx.sender);
      if (input !== null) {
        ctx.db.player_input.identity.update({
          ...input,
          direction: 'idle',
          updatedAtMicros: ctx.timestamp.microsSinceUnixEpoch,
          runStartClientTick: 0n,
          appliedSteps: 0n,
          settleDirection: 'idle',
          settleSteps: 0,
          settledSequence: input.sequence,
          pendingSequence: 0n,
          creditStartedAtMicros: ctx.timestamp.microsSinceUnixEpoch,
          creditedSteps: 0n,
        });
        const reconnectPosition = ctx.db.player_position.identity.find(ctx.sender);
        if (reconnectPosition !== null && reconnectPosition.lastProcessedSequence !== input.sequence) {
          ctx.db.player_position.identity.update({
            ...reconnectPosition,
            moving: false,
            lastProcessedSequence: input.sequence,
          });
        }
      }
    }
    if (ctx.db.private_inventory.identity.find(ctx.sender) === null) {
      ctx.db.private_inventory.insert({ identity: ctx.sender, fruit: 0n, bottles: 0n, knowledge: 0 });
    }
  }
  if (ctx.db.farm_activity.identity.find(ctx.sender) === null) {
    ctx.db.farm_activity.insert({ identity: ctx.sender, planted: 0, watered: 0, harvested: 0 });
  }
  const selected = ctx.db.inventory_slot.id.find(`${ctx.sender.toHexString()}:${survival.selectedSlot}`);
  const equippedItem = selected?.itemKind ?? 'empty';
  const position = ctx.db.player_position.identity.find(ctx.sender);
  if (position !== null && position.equippedKind !== equippedItem) {
    ctx.db.player_position.identity.update({ ...position, equippedKind: equippedItem });
  }
});

// Keep the lease row after a transport disconnect. A killed process must stop
// through the 2 s stale-input failsafe while remaining visibly online until the
// existing 30 s presence lease expires; stepWorld owns that cleanup.
export const onDisconnect = spacetimedb.clientDisconnected(() => {});

export const setDisplayName = spacetimedb.reducer(
  { displayName: t.string() },
  (ctx, { displayName }) => {
    const profile = ctx.db.player_public.identity.find(ctx.sender);
    if (profile === null) throw new SenderError('player_not_ready');
    const validName = validateDisplayName(displayName);
    ctx.db.player_public.identity.update({
      ...profile,
      displayName: validName,
    });
    const parcel = [...ctx.db.farm_parcel.by_owner.filter(ctx.sender)][0];
    if (parcel !== undefined) {
      ctx.db.farm_parcel.id.update({ ...parcel, name: `${validName}'s Farm` });
    }
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
  const input = ctx.db.player_input.identity.find(ctx.sender);
  if (input !== null) {
    ctx.db.player_input.identity.update({
      ...input,
      updatedAtMicros: ctx.timestamp.microsSinceUnixEpoch,
    });
  }
});

export const setInput = spacetimedb.reducer(
  { direction: t.string(), sequence: t.u64(), clientTick: t.u64() },
  (ctx, { direction, sequence, clientTick }) => {
    parseDirection(direction);
    const input = ctx.db.player_input.identity.find(ctx.sender);
    if (input === null) throw new SenderError('player_not_ready');
    if (sequence <= input.sequence) return;
    const settled = settleMovementRun(
      input.direction,
      input.runStartClientTick,
      clientTick,
      input.settleDirection,
      input.settleSteps,
    );
    ctx.db.player_input.identity.update({
      ...input,
      direction,
      sequence,
      updatedAtMicros: ctx.timestamp.microsSinceUnixEpoch,
      runStartClientTick: clientTick > input.runStartClientTick ? clientTick : input.runStartClientTick,
      appliedSteps: 0n,
      settleDirection: settled.pendingDirection,
      settleSteps: settled.pendingSteps,
      ...queueMovementAcknowledgement(input.settledSequence, sequence, settled.pendingSteps),
    });
  },
);

export const selectHotbar = spacetimedb.reducer(
  { slot: t.u8() },
  (ctx, { slot }) => {
    if (slot >= HOTBAR_SLOTS.length) throw new SenderError('invalid_hotbar_slot');
    const survival = ctx.db.player_survival.identity.find(ctx.sender);
    if (survival === null) throw new SenderError('player_not_ready');
    ctx.db.player_survival.identity.update({ ...survival, selectedSlot: slot });
    const selected = ctx.db.inventory_slot.id.find(`${ctx.sender.toHexString()}:${slot}`);
    const position = ctx.db.player_position.identity.find(ctx.sender);
    const equippedKind = selected?.itemKind ?? 'empty';
    if (position !== null) ctx.db.player_position.identity.update({ ...position, equippedKind });
  },
);

export const dropSelected = spacetimedb.reducer((ctx) => {
  const position = ctx.db.player_position.identity.find(ctx.sender);
  const survival = ctx.db.player_survival.identity.find(ctx.sender);
  const clock = ctx.db.world_clock.id.find(0);
  if (position === null || survival === null || clock === null) throw new SenderError('player_not_ready');
  const slot = ctx.db.inventory_slot.id.find(`${ctx.sender.toHexString()}:${survival.selectedSlot}`);
  if (slot === null || slot.itemKind === 'empty' || slot.quantity === 0) throw new SenderError('selected_slot_empty');
  const facing = parseDirection(position.facing) ?? 'down';
  const drop = itemDropPosition(position.x, position.y, facing);
  ctx.db.inventory_slot.id.update({ ...slot, itemKind: 'empty', quantity: 0 });
  ctx.db.player_position.identity.update({
    ...position,
    equippedKind: 'empty',
    actionKind: 'drop',
    actionStartedTick: nextActionStartedTick(position.actionStartedTick, clock.authorityTick),
  });
  ctx.db.world_item.insert({
    id: 0n,
    itemKind: slot.itemKind,
    quantity: slot.quantity,
    x: drop.x,
    y: drop.y,
    chunkX: chunkAt(drop.x),
    chunkY: chunkAt(drop.y),
    droppedAtTick: clock.authorityTick,
  });
});

export const pickupWorldItem = spacetimedb.reducer(
  { itemId: t.u64() },
  (ctx, { itemId }) => {
    const position = ctx.db.player_position.identity.find(ctx.sender);
    const item = ctx.db.world_item.id.find(itemId);
    const clock = ctx.db.world_clock.id.find(0);
    if (position === null || item === null || clock === null) throw new SenderError('item_not_ready');
    if (!itemWithinPickupReach(position.x, position.y, item.x, item.y)) throw new SenderError('item_out_of_range');
    const slots = [...ctx.db.inventory_slot.by_identity.filter(ctx.sender)].sort((left, right) => left.slot - right.slot);
    const destination = slots.find((slot) => slot.itemKind === item.itemKind && slot.quantity + item.quantity <= 65_535)
      ?? slots.find((slot) => slot.itemKind === 'empty' || slot.quantity === 0);
    if (destination === undefined) throw new SenderError('inventory_full');
    ctx.db.inventory_slot.id.update({
      ...destination,
      itemKind: item.itemKind,
      quantity: destination.itemKind === item.itemKind ? destination.quantity + item.quantity : item.quantity,
    });
    const survival = ctx.db.player_survival.identity.find(ctx.sender);
    ctx.db.player_position.identity.update({
      ...position,
      equippedKind: survival?.selectedSlot === destination.slot ? item.itemKind : position.equippedKind,
      actionKind: 'pickup',
      actionStartedTick: nextActionStartedTick(position.actionStartedTick, clock.authorityTick),
    });
    ctx.db.world_item.id.delete(item.id);
  },
);

export const harvestResource = spacetimedb.reducer(
  { resourceId: t.u64() },
  (ctx, { resourceId }) => {
    const position = ctx.db.player_position.identity.find(ctx.sender);
    const survival = ctx.db.player_survival.identity.find(ctx.sender);
    const clock = ctx.db.world_clock.id.find(0);
    if (position === null || survival === null || clock === null) throw new SenderError('player_not_ready');
    const slot = ctx.db.inventory_slot.id.find(`${ctx.sender.toHexString()}:${survival.selectedSlot}`);
    const actionKind = avatarActionForEquippedKind(slot?.itemKind ?? 'empty');
    if (actionKind === null) throw new SenderError('selected_tool_has_no_action');

    if (resourceId === 0n) {
      ctx.db.player_position.identity.update({
        ...position,
        actionKind,
        actionStartedTick: nextActionStartedTick(position.actionStartedTick, clock.authorityTick),
      });
      return;
    }

    const resource = ctx.db.world_resource.id.find(resourceId);
    if (resource === null) throw new SenderError('target_not_ready');
    const result = resourceHarvestResult(position.x, position.y, slot?.itemKind ?? 'empty', resource);
    if (result === 'depleted') throw new SenderError('resource_depleted');
    if (result === 'wrong_tool') throw new SenderError('wrong_tool');
    if (result === 'out_of_range') throw new SenderError('target_out_of_range');

    ctx.db.player_position.identity.update({
      ...position,
      actionKind,
      actionStartedTick: nextActionStartedTick(position.actionStartedTick, clock.authorityTick),
    });

    if (resource.health > 1) {
      ctx.db.world_resource.id.update({ ...resource, health: resource.health - 1 });
      return;
    }
    ctx.db.world_resource.id.update({ ...resource, health: 0, depleted: true });
    const itemX = resource.tileX * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2 + 10 * FIXED_UNITS_PER_PIXEL;
    const itemY = (resource.tileY + 1) * TILE_SIZE_FIXED + 3 * FIXED_UNITS_PER_PIXEL;
    ctx.db.world_item.insert({
      id: 0n,
      itemKind: 'wood',
      quantity: 3,
      x: itemX,
      y: itemY,
      chunkX: chunkAt(itemX),
      chunkY: chunkAt(itemY),
      droppedAtTick: clock.authorityTick,
    });
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

export const useFarmTile = spacetimedb.reducer(
  { tileX: t.i16(), tileY: t.i16() },
  (ctx, { tileX, tileY }) => {
    const position = ctx.db.player_position.identity.find(ctx.sender);
    const clock = ctx.db.world_clock.id.find(0);
    if (position === null || clock === null) throw new SenderError('player_not_ready');
    if (!canUseFarmTile(position.x, position.y, tileX, tileY)) {
      throw new SenderError('farm_tile_out_of_range');
    }
    const parcel = [...ctx.db.farm_parcel.iter()].find((candidate) => isFarmBedTile(candidate, tileX, tileY));
    if (parcel === undefined) throw new SenderError('not_a_farm_bed');
    const crop = [...ctx.db.crop_patch.by_parcel.filter(parcel.id)]
      .find((candidate) => candidate.tileX === tileX && candidate.tileY === tileY);
    const actor = ctx.db.farm_activity.identity.find(ctx.sender);
    if (actor === null) throw new SenderError('farm_activity_not_ready');

    if (crop === undefined) {
      if (!parcel.owner.isEqual(ctx.sender)) throw new SenderError('owner_only_planting');
      ctx.db.crop_patch.insert({
        id: 0n,
        parcelId: parcel.id,
        owner: parcel.owner,
        tileX,
        tileY,
        chunkX: chunkAt(tileX * TILE_SIZE_FIXED),
        chunkY: chunkAt(tileY * TILE_SIZE_FIXED),
        plantedAtTick: clock.authorityTick,
        watered: false,
        wateredAtTick: 0n,
      });
      ctx.db.farm_activity.identity.update({ ...actor, planted: actor.planted + 1 });
      return;
    }
    if (!crop.watered) {
      ctx.db.crop_patch.id.update({ ...crop, watered: true, wateredAtTick: clock.authorityTick });
      ctx.db.farm_activity.identity.update({ ...actor, watered: actor.watered + 1 });
      return;
    }
    if (clock.authorityTick - crop.wateredAtTick < CROP_GROWTH_TICKS) {
      throw new SenderError('crop_still_growing');
    }
    if (!crop.owner.isEqual(ctx.sender)) throw new SenderError('owner_only_harvest');
    ctx.db.crop_patch.id.delete(crop.id);
    ctx.db.farm_activity.identity.update({ ...actor, harvested: actor.harvested + 1 });
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
      if (input !== null) ctx.db.player_input.identity.update({
        ...input,
        direction: 'idle',
        settleDirection: 'idle',
        settleSteps: 0,
        settledSequence: input.sequence,
        pendingSequence: 0n,
      });
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
    const collision = createAuthoritySurvivalCollisionMap([...ctx.db.world_resource.iter()]);

    for (const row of ctx.db.player_position.iter()) {
      const online = [
        ...ctx.db.connection_presence_v2.by_identity.filter(row.identity),
      ].length > 0;
      if (!online) continue;
      const input = ctx.db.player_input.identity.find(row.identity);
      const stale = input === null || inputIsStale(
        input.updatedAtMicros,
        ctx.timestamp.microsSinceUnixEpoch,
      );
      let player: PlayerState = {
        position: { x: row.x, y: row.y },
        facing: parseDirection(row.facing) ?? 'down',
        moving: row.moving,
        location: 'estate',
      };
      const startedX = player.position.x;
      const startedY = player.position.y;
      let lastProcessedSequence = row.lastProcessedSequence;
      if (input !== null && !stale) {
        const available = movementCreditAvailable(
          input.creditStartedAtMicros,
          input.creditedSteps,
          ctx.timestamp.microsSinceUnixEpoch,
        );
        const acceptedBatch = Math.min(input.settleSteps, MAX_SETTLE_STEPS_PER_TICK);
        const settledThisTick = acceptedBatch <= available ? acceptedBatch : 0;
        const drained = drainMovementRunQueue(
          input.settleDirection,
          input.settleSteps,
          settledThisTick,
        );
        for (const settleDirection of drained.directions) {
          player = movePlayer(player, settleDirection, collision);
        }
        const creditedThisTick = settledThisTick;
        const remainingSettleSteps = drained.pendingSteps;
        const acknowledgement = drainMovementAcknowledgement(
          input.settledSequence,
          input.pendingSequence,
          remainingSettleSteps,
        );
        ctx.db.player_input.identity.update({
          ...input,
          appliedSteps: 0n,
          settleDirection: drained.pendingDirection,
          settleSteps: remainingSettleSteps,
          ...acknowledgement,
          creditedSteps: input.creditedSteps + BigInt(creditedThisTick),
        });
        lastProcessedSequence = acknowledgement.settledSequence;
      }
      const moved = player.position.x !== startedX || player.position.y !== startedY;
      const nextActionKind = avatarActionAfterMovement(row.actionKind, moved);
      const clearAction = nextActionKind === 'none' && row.actionKind !== 'none';
      ctx.db.player_position.identity.update({
        ...row,
        x: player.position.x,
        y: player.position.y,
        chunkX: chunkAt(player.position.x),
        chunkY: chunkAt(player.position.y),
        facing: player.facing,
        moving: moved,
        lastProcessedSequence,
        authorityTick,
        actionKind: nextActionKind,
        actionStartedTick: clearAction ? authorityTick : row.actionStartedTick,
      });
    }
  },
);
