import {
  AUTHORITY_TICKS_PER_DAY,
  AUTHORITY_TICK_MICROS,
  DAYS_PER_SEASON,
  FIXED_UNITS_PER_PIXEL,
  STARTER_HORSE_ID,
  STARTER_HORSE_NAME,
  SURVIVAL_CHUNK_TILES,
  SURVIVAL_ISLAND_OFFSET_TILES,
  SURVIVAL_WORLD_SEED,
  SURVIVAL_WORLD_SIZE,
  SURVIVAL_WORLD_VERSION,
  TILE_SIZE_FIXED,
  avatarActionAfterMovement,
  avatarActionForEquippedKind,
  generateSurvivalResources,
  generateSurvivalWildlife,
  generateSurvivalWildlifeHives,
  hiveProducesHoneyAtTick,
  insertItemStack,
  findHorseDismountPosition,
  findHorseJumpLanding,
  generatePlayerAppearance,
  HORSE_JUMP_DURATION_TICKS,
  isHorseWithinMountReach,
  isWildlifeSpecies,
  isWindDirectionMode,
  isWeatherMode,
  consumeCraftingRecipe,
  distributeItemStack,
  matchingRecipeId,
  moveItemStacks,
  quickMoveItemStack,
  movePlayer,
  movePlayerAtSpeed,
  mountedHorseFacing,
  bowProjectileOrigin,
  bowShotForCharge,
  directionFromAim,
  firstProjectileTargetHit,
  firstProjectileTerrainHit,
  normalizedBowAim,
  playerHitboxBounds,
  positionCollides,
  isGatherableResourceKind,
  survivalGatherableDrop,
  survivalResourceBlocksMovement,
  survivalResourceObstacle,
  survivalResourceDropsAfterHit,
  survivalResourceInitialHealth,
  normalizeCharacterName,
  stepWanderingNpc,
  stepAmbientWildlife,
  survivalSpawnPosition,
  wildlifeActivityNearPlayers,
  wildlifeMovementMedium,
  wildlifePosition,
  WILDLIFE_FIRST_NPC_ID,
  WILDLIFE_GENERATION_VERSION,
  type GeneratedWildlife,
  type GeneratedWildlifeHive,
  type Direction,
  type ContainerSnapshot,
  type NpcFacing,
  type PlayerState,
} from '@orchard/sim';
import {
  ScheduleAt,
  SenderError,
  schema,
  table,
  t,
} from 'spacetimedb/server';
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
  farmToolUseResult,
  farmSoilRestoreResult,
  nextActionStartedTick,
  presenceLeaseExpired,
  resourceHarvestResult,
  resourceGatherResult,
  settleMovementRun,
} from './world-rules.js';
import {
  BOOTSTRAP_OWNER_IDENTITIES,
  authenticationRejection,
  automaticRegistrationRole,
  canAdministerWorld,
  canManageMembership,
  membershipRejection,
  membershipRole,
  productionAuthEnabled,
} from './auth-policy.js';
import {
  CHAT_CHANNEL_HISTORY_LIMIT,
  CHAT_SEND_COOLDOWN_MICROS,
  DEFAULT_MESSAGE_OF_DAY,
  GENERAL_CHAT_CHANNEL_ID,
  GENERAL_CHAT_CHANNEL_SLUG,
  canJoinChatChannel,
  channelConversationKey,
  chatMembershipId,
  normalizeChatChannelName,
  normalizeChatMessage,
  normalizeMessageOfDay,
  validCreatableChatChannelKind,
  whisperConversationKey,
  worldEntryMessage,
} from './chat-policy.js';

const HOTBAR_SLOTS = ['axe', 'pickaxe', 'hoe', 'watering_can', 'bow', 'arrow', 'empty', 'empty', 'empty'] as const;
const STARTER_ITEM_QUANTITIES: Readonly<Record<string, number>> = { arrow: 32 };
const HOTBAR_CAPACITY = HOTBAR_SLOTS.length;
const BACKPACK_CAPACITY = 20;
const DEFAULT_BACKPACK_CAPACITY = 8;
const EQUIPMENT_CAPACITY = 9;
const BACKPACK_SLOT_OFFSET = HOTBAR_CAPACITY;
const EQUIPMENT_SLOT_OFFSET = BACKPACK_SLOT_OFFSET + BACKPACK_CAPACITY;
const CRAFTING_SLOT_OFFSET = EQUIPMENT_SLOT_OFFSET + EQUIPMENT_CAPACITY;
const CRAFTING_CAPACITY = 9;
const INVENTORY_SLOT_CAPACITY = CRAFTING_SLOT_OFFSET + CRAFTING_CAPACITY;
const CHEST_CAPACITY = 27;
const EQUIPMENT_RESTRICTIONS = {
  0: { requiredTags: ['gear.neck'] },
  1: { requiredTags: ['gear.head'] },
  2: { requiredTags: ['gear.ring'] },
  3: { requiredTags: ['gear.hand'] },
  4: { requiredTags: ['gear.body'] },
  5: { requiredTags: ['gear.hand'] },
  6: { requiredTags: ['gear.hands'] },
  7: { requiredTags: ['gear.legs'] },
  8: { requiredTags: ['gear.feet'] },
} as const;
const MAX_WORLD_CALENDAR_TICK = BigInt(AUTHORITY_TICKS_PER_DAY * DAYS_PER_SEASON * 4 * 999);
const HIVE_PRODUCTION_INTERVAL_TICKS = BigInt(Math.max(1, Math.floor(AUTHORITY_TICKS_PER_DAY / 20)));
const HIVE_HONEY_CAPACITY = 1_000;
const WORLD_OCEAN_EXPANSION_VERSION = 22;
const WORLD_OCEAN_SHIFT_FIXED = SURVIVAL_ISLAND_OFFSET_TILES * TILE_SIZE_FIXED;

type InventoryContainerId = 'hotbar' | 'backpack' | 'equipment' | 'crafting';

function inventorySlotOffset(containerId: InventoryContainerId): number {
  if (containerId === 'hotbar') return 0;
  if (containerId === 'backpack') return BACKPACK_SLOT_OFFSET;
  return containerId === 'equipment' ? EQUIPMENT_SLOT_OFFSET : CRAFTING_SLOT_OFFSET;
}

function inventoryContainerCapacity(containerId: InventoryContainerId): number {
  if (containerId === 'hotbar') return HOTBAR_CAPACITY;
  if (containerId === 'backpack') return BACKPACK_CAPACITY;
  return containerId === 'equipment' ? EQUIPMENT_CAPACITY : CRAFTING_CAPACITY;
}

function accessibleInventoryContainerCapacity(containerId: InventoryContainerId, hasBackpack: boolean): number {
  return containerId === 'backpack' && !hasBackpack ? DEFAULT_BACKPACK_CAPACITY : inventoryContainerCapacity(containerId);
}

function isInventoryContainerId(value: string): value is InventoryContainerId {
  return value === 'hotbar' || value === 'backpack' || value === 'equipment' || value === 'crafting';
}

function facingTile(x: number, y: number, facing: string): { readonly tileX: number; readonly tileY: number } {
  let tileX = Math.floor(x / TILE_SIZE_FIXED); let tileY = Math.floor(y / TILE_SIZE_FIXED);
  if (facing.includes('Left') || facing === 'left') tileX -= 1;
  if (facing.includes('Right') || facing === 'right') tileX += 1;
  if (facing.includes('up') || facing === 'up') tileY -= 1;
  if (facing.includes('down') || facing === 'down') tileY += 1;
  return { tileX, tileY };
}

function chestWithinReach(playerX: number, playerY: number, chest: { readonly tileX: number; readonly tileY: number }): boolean {
  const dx = chest.tileX * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2 - playerX;
  const dy = chest.tileY * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2 - playerY;
  return dx * dx + dy * dy <= (2 * TILE_SIZE_FIXED) ** 2;
}

const player_public = table(
  { name: 'player_public', public: true },
  {
    identity: t.identity().primaryKey(),
    displayName: t.string(),
    online: t.bool(),
  },
);

// Kept separate from the public presence row so this can be added to existing
// databases without rewriting or guessing whether a legacy display name was
// deliberately chosen by its player.
const character_profile = table(
  { name: 'character_profile' },
  {
    identity: t.identity().primaryKey(),
    nameChosen: t.bool(),
    chosenAt: t.option(t.timestamp()),
  },
);

// Public because every client must assemble the same modular character sprite.
// There is deliberately no client reducer for this row: it is generated once
// by the authority and then persists with the character.
const player_appearance = table(
  { name: 'player_appearance', public: true },
  {
    identity: t.identity().primaryKey(),
    hairKind: t.string(),
    shirtKind: t.string(),
    pantsKind: t.string(),
    shoesKind: t.string(),
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
    jumpFromX: t.option(t.i32()),
    jumpFromY: t.option(t.i32()),
    jumpUntilTick: t.option(t.u64()),
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

// Private, append-only operational audit data. Connection identifiers and
// identities must never be exposed through a public subscription.
const connection_audit = table(
  {
    name: 'connection_audit',
    indexes: [
      { accessor: 'by_identity', algorithm: 'btree', columns: ['identity'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    connectionId: t.connectionId(),
    identity: t.identity(),
    eventKind: t.string(),
    displayName: t.string(),
    occurredAt: t.timestamp(),
  },
);

// The configured MOTD remains private. Each connection receives an ephemeral
// copy through a caller-filtered view, preventing the setting from becoming a
// globally subscribed row or a persistent chat-history message.
const world_motd = table(
  { name: 'world_motd' },
  {
    id: t.u8().primaryKey(),
    body: t.string(),
    updatedAt: t.timestamp(),
    updatedBy: t.identity(),
  },
);

const connection_notice = table(
  {
    name: 'connection_notice',
    indexes: [
      { accessor: 'by_identity', algorithm: 'btree', columns: ['identity'] },
    ],
  },
  {
    connectionId: t.connectionId().primaryKey(),
    identity: t.identity(),
    kind: t.string(),
    body: t.string(),
    issuedAt: t.timestamp(),
  },
);

const membership = table(
  { name: 'membership' },
  {
    identity: t.identity().primaryKey(),
    role: t.string(),
    approvedAt: t.timestamp(),
    approvedBy: t.identity(),
    revokedAt: t.option(t.timestamp()),
    blocked: t.bool(),
  },
);

const membership_audit = table(
  { name: 'membership_audit' },
  {
    id: t.u64().primaryKey().autoInc(),
    actor: t.identity(),
    target: t.identity(),
    action: t.string(),
    role: t.string(),
    occurredAt: t.timestamp(),
  },
);

const world_admin_audit = table(
  { name: 'world_admin_audit' },
  {
    id: t.u64().primaryKey().autoInc(),
    actor: t.identity(),
    action: t.string(),
    value: t.string(),
    occurredAt: t.timestamp(),
  },
);

// Chat storage is private and is exposed only through caller-filtered views.
// This prevents a broad table subscription from leaking whispers or group chat.
const chat_channel = table(
  {
    name: 'chat_channel',
    indexes: [
      { accessor: 'by_slug', algorithm: 'btree', columns: ['slug'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    slug: t.string(),
    displayName: t.string(),
    kind: t.string(),
    owner: t.option(t.identity()),
    createdAt: t.timestamp(),
  },
);

const chat_channel_member = table(
  {
    name: 'chat_channel_member',
    indexes: [
      { accessor: 'by_identity', algorithm: 'btree', columns: ['identity'] },
      { accessor: 'by_channel', algorithm: 'btree', columns: ['channelId'] },
    ],
  },
  {
    id: t.string().primaryKey(),
    channelId: t.u64(),
    identity: t.identity(),
    role: t.string(),
    joinedAt: t.timestamp(),
  },
);

const chat_message = table(
  {
    name: 'chat_message',
    indexes: [
      { accessor: 'by_conversation', algorithm: 'btree', columns: ['conversationKey'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    conversationKey: t.string(),
    channelId: t.u64(),
    sender: t.identity(),
    senderDisplayName: t.string(),
    recipient: t.option(t.identity()),
    kind: t.string(),
    body: t.string(),
    // Reserved for server-validated structured item links. Plain chat writes an
    // empty JSON array so future rich segments never need HTML in message text.
    itemLinksJson: t.string(),
    sentAt: t.timestamp(),
  },
);

const chat_sender_state = table(
  { name: 'chat_sender_state' },
  {
    identity: t.identity().primaryKey(),
    lastSentAtMicros: t.u64(),
  },
);

// Transient speech is private storage exposed only through a distance-filtered
// caller view. This prevents /say from becoming a global broadcast and caps
// /shout at a deliberately finite world radius.
const world_speech = table(
  {
    name: 'world_speech',
    indexes: [
      { accessor: 'by_speaker', algorithm: 'btree', columns: ['speaker'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    speaker: t.identity(),
    speakerDisplayName: t.string(),
    kind: t.string(),
    body: t.string(),
    x: t.i32(),
    y: t.i32(),
    createdTick: t.u64(),
    expiresTick: t.u64(),
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

const world_environment = table(
  { name: 'world_environment', public: true },
  {
    id: t.u8().primaryKey(),
    calendarTick: t.u64(),
    weatherMode: t.string(),
  },
);

const world_wind = table(
  { name: 'world_wind', public: true },
  {
    id: t.u8().primaryKey(),
    direction: t.string(),
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

/** Player-authored ground state. Visual edge/corner frames are deliberately
 * not stored: every client derives the blob47 frame from neighbouring rows. */
const world_soil = table(
  {
    name: 'world_soil',
    public: true,
    indexes: [
      { accessor: 'by_chunk', algorithm: 'btree', columns: ['chunkX', 'chunkY'] },
    ],
  },
  {
    id: t.string().primaryKey(),
    tileX: t.i16(),
    tileY: t.i16(),
    chunkX: t.i16(),
    chunkY: t.i16(),
    watered: t.bool(),
    tilledAtTick: t.u64(),
    wateredAtTick: t.u64(),
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

/** Server-authoritative arrows are visible to every nearby player. A hit is
 * retained briefly so clients can render the impact without applying damage. */
const world_projectile = table(
  {
    name: 'world_projectile',
    public: true,
    indexes: [
      { accessor: 'by_chunk', algorithm: 'btree', columns: ['chunkX', 'chunkY'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    owner: t.identity(),
    x: t.i32(),
    y: t.i32(),
    velocityX: t.i32(),
    velocityY: t.i32(),
    chunkX: t.i16(),
    chunkY: t.i16(),
    spawnedTick: t.u64(),
    expiresTick: t.u64(),
    state: t.string(),
    hitKind: t.string(),
    hitId: t.string(),
  },
);

/** A placed chest stays one authoritative entity while it is on the ground or
 * being carried in a player's hands. Contents therefore never need to be
 * serialized into an inventory item. */
const world_chest = table(
  {
    name: 'world_chest',
    public: true,
    indexes: [
      { accessor: 'by_chunk', algorithm: 'btree', columns: ['chunkX', 'chunkY'] },
      { accessor: 'by_carrier', algorithm: 'btree', columns: ['carriedBy'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    owner: t.identity(),
    tileX: t.i16(),
    tileY: t.i16(),
    chunkX: t.i16(),
    chunkY: t.i16(),
    carriedBy: t.option(t.identity()),
  },
);

const world_chest_slot = table(
  {
    name: 'world_chest_slot',
    indexes: [
      { accessor: 'by_chest', algorithm: 'btree', columns: ['chestId'] },
    ],
  },
  {
    id: t.string().primaryKey(),
    chestId: t.u64(),
    slot: t.u8(),
    itemKind: t.string(),
    quantity: t.u16(),
  },
);

const active_chest = table(
  { name: 'active_chest' },
  {
    identity: t.identity().primaryKey(),
    chestId: t.u64(),
  },
);

const world_npc = table(
  {
    name: 'world_npc',
    public: true,
    indexes: [
      { accessor: 'by_chunk', algorithm: 'btree', columns: ['chunkX', 'chunkY'] },
    ],
  },
  {
    id: t.u64().primaryKey(),
    kind: t.string(),
    displayName: t.string(),
    x: t.i32(),
    y: t.i32(),
    homeX: t.i32(),
    homeY: t.i32(),
    chunkX: t.i16(),
    chunkY: t.i16(),
    facing: t.string(),
    moving: t.bool(),
    rider: t.option(t.identity()),
    wanderDirection: t.string(),
    nextDecisionTick: t.u64(),
    authorityTick: t.u64(),
  },
);

/** Static species/appearance metadata is split from the high-frequency NPC row
 * so future health, breeding, and ownership migrations remain additive. */
const world_wildlife_profile = table(
  { name: 'world_wildlife_profile', public: true },
  {
    npcId: t.u64().primaryKey(),
    species: t.string(),
    variant: t.u8(),
    packId: t.u64(),
    habitat: t.string(),
  },
);

const world_hive = table(
  {
    name: 'world_hive',
    public: true,
    indexes: [
      { accessor: 'by_chunk', algorithm: 'btree', columns: ['chunkX', 'chunkY'] },
    ],
  },
  {
    id: t.u64().primaryKey(),
    kind: t.string(),
    variant: t.u8(),
    tileX: t.i16(),
    tileY: t.i16(),
    chunkX: t.i16(),
    chunkY: t.i16(),
    honey: t.u16(),
    beeCount: t.u8(),
    nextProductionTick: t.u64(),
  },
);

const world_wildlife_generation = table(
  { name: 'world_wildlife_generation' },
  { id: t.u8().primaryKey(), version: t.u16() },
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
  character_profile,
  player_appearance,
  player_position,
  player_input,
  player_equipment,
  private_inventory,
  player_survival,
  inventory_slot,
  connection_presence,
  connection_presence_v2,
  connection_audit,
  world_motd,
  connection_notice,
  membership,
  membership_audit,
  world_admin_audit,
  chat_channel,
  chat_channel_member,
  chat_message,
  chat_sender_state,
  world_speech,
  world_tree,
  world_clock,
  world_environment,
  world_wind,
  world_seed,
  world_resource,
  world_soil,
  world_item,
  world_projectile,
  world_chest,
  world_chest_slot,
  active_chest,
  world_npc,
  world_wildlife_profile,
  world_hive,
  world_wildlife_generation,
  farm_parcel,
  crop_patch,
  farm_activity,
  movement_timer,
});

export default spacetimedb;

type WorldReducerContext = Parameters<Parameters<typeof spacetimedb.init>[1]>[0];

/** Version 22 centered the unchanged legacy island inside a much larger ocean.
 * Shift every persistent spatial row exactly once so player-authored state
 * remains attached to the same relative island tile. Generated resources are
 * rebuilt by the normal terrain migration immediately afterwards. */
function migrateWorldForOceanExpansion(ctx: WorldReducerContext, installedVersion: number): void {
  if (installedVersion >= WORLD_OCEAN_EXPANSION_VERSION) return;
  const shiftedFixed = (value: number): number => value + WORLD_OCEAN_SHIFT_FIXED;
  const shiftedTile = (value: number): number => value + SURVIVAL_ISLAND_OFFSET_TILES;

  for (const row of ctx.db.player_position.iter()) {
    const x = shiftedFixed(row.x);
    const y = shiftedFixed(row.y);
    ctx.db.player_position.identity.update({
      ...row,
      x,
      y,
      chunkX: chunkAt(x),
      chunkY: chunkAt(y),
      jumpFromX: row.jumpFromX === undefined ? undefined : shiftedFixed(row.jumpFromX),
      jumpFromY: row.jumpFromY === undefined ? undefined : shiftedFixed(row.jumpFromY),
    });
  }
  for (const row of ctx.db.world_speech.iter()) {
    ctx.db.world_speech.id.update({ ...row, x: shiftedFixed(row.x), y: shiftedFixed(row.y) });
  }
  for (const row of ctx.db.world_tree.iter()) {
    const x = shiftedFixed(row.x);
    const y = shiftedFixed(row.y);
    ctx.db.world_tree.id.update({ ...row, x, y, chunkX: chunkAt(x), chunkY: chunkAt(y) });
  }
  for (const row of [...ctx.db.world_soil.iter()]) {
    const tileX = shiftedTile(row.tileX);
    const tileY = shiftedTile(row.tileY);
    ctx.db.world_soil.id.delete(row.id);
    ctx.db.world_soil.insert({
      ...row,
      id: `${tileX}:${tileY}`,
      tileX,
      tileY,
      chunkX: Math.floor(tileX / SURVIVAL_CHUNK_TILES),
      chunkY: Math.floor(tileY / SURVIVAL_CHUNK_TILES),
    });
  }
  for (const row of ctx.db.world_item.iter()) {
    const x = shiftedFixed(row.x);
    const y = shiftedFixed(row.y);
    ctx.db.world_item.id.update({ ...row, x, y, chunkX: chunkAt(x), chunkY: chunkAt(y) });
  }
  // Projectiles are short-lived and cannot be meaningfully resumed across a
  // module migration; dropping them avoids translating an in-flight trace.
  for (const row of ctx.db.world_projectile.iter()) ctx.db.world_projectile.id.delete(row.id);
  for (const row of ctx.db.world_chest.iter()) {
    const tileX = shiftedTile(row.tileX);
    const tileY = shiftedTile(row.tileY);
    ctx.db.world_chest.id.update({
      ...row,
      tileX,
      tileY,
      chunkX: Math.floor(tileX / SURVIVAL_CHUNK_TILES),
      chunkY: Math.floor(tileY / SURVIVAL_CHUNK_TILES),
    });
  }
  for (const row of ctx.db.world_npc.iter()) {
    const x = shiftedFixed(row.x);
    const y = shiftedFixed(row.y);
    ctx.db.world_npc.id.update({
      ...row,
      x,
      y,
      homeX: shiftedFixed(row.homeX),
      homeY: shiftedFixed(row.homeY),
      chunkX: chunkAt(x),
      chunkY: chunkAt(y),
    });
  }
  for (const row of ctx.db.world_hive.iter()) {
    const tileX = shiftedTile(row.tileX);
    const tileY = shiftedTile(row.tileY);
    ctx.db.world_hive.id.update({
      ...row,
      tileX,
      tileY,
      chunkX: Math.floor(tileX / SURVIVAL_CHUNK_TILES),
      chunkY: Math.floor(tileY / SURVIVAL_CHUNK_TILES),
    });
  }
  for (const row of ctx.db.farm_parcel.iter()) {
    ctx.db.farm_parcel.id.update({
      ...row,
      originX: shiftedTile(row.originX),
      originY: shiftedTile(row.originY),
    });
  }
  for (const row of ctx.db.crop_patch.iter()) {
    const tileX = shiftedTile(row.tileX);
    const tileY = shiftedTile(row.tileY);
    ctx.db.crop_patch.id.update({
      ...row,
      tileX,
      tileY,
      chunkX: Math.floor(tileX / SURVIVAL_CHUNK_TILES),
      chunkY: Math.floor(tileY / SURVIVAL_CHUNK_TILES),
    });
  }
}

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

export const ownActiveChest = spacetimedb.view(
  { name: 'own_active_chest', public: true },
  t.option(world_chest.rowType),
  (ctx) => {
    const active = ctx.db.active_chest.identity.find(ctx.sender);
    return active === null ? undefined : ctx.db.world_chest.id.find(active.chestId) ?? undefined;
  },
);

export const ownOpenChestSlots = spacetimedb.view(
  { name: 'own_open_chest_slots', public: true },
  t.array(world_chest_slot.rowType),
  (ctx) => {
    const active = ctx.db.active_chest.identity.find(ctx.sender);
    return active === null ? [] : [...ctx.db.world_chest_slot.by_chest.filter(active.chestId)];
  },
);

export const ownMembership = spacetimedb.view(
  { name: 'own_membership', public: true },
  t.option(membership.rowType),
  (ctx) => ctx.db.membership.identity.find(ctx.sender) ?? undefined,
);

export const ownCharacterProfile = spacetimedb.view(
  { name: 'own_character_profile', public: true },
  t.option(character_profile.rowType),
  (ctx) => ctx.db.character_profile.identity.find(ctx.sender) ?? undefined,
);

export const ownConnectionNotices = spacetimedb.view(
  { name: 'own_connection_notices', public: true },
  t.array(connection_notice.rowType),
  (ctx) => [...ctx.db.connection_notice.by_identity.filter(ctx.sender)],
);

export const ownChatChannels = spacetimedb.view(
  { name: 'own_chat_channels', public: true },
  t.array(chat_channel.rowType),
  (ctx) => [...ctx.db.chat_channel_member.by_identity.filter(ctx.sender)]
    .map((member) => ctx.db.chat_channel.id.find(member.channelId))
    .filter((channel) => channel !== null),
);

export const visibleChatMessages = spacetimedb.view(
  { name: 'visible_chat_messages', public: true },
  t.array(chat_message.rowType),
  (ctx) => {
    const joined = new Set(
      [...ctx.db.chat_channel_member.by_identity.filter(ctx.sender)]
        .map((member) => member.channelId.toString()),
    );
    return [...ctx.db.chat_message.iter()].filter((message) => {
      if (message.kind === 'whisper') {
        return message.sender.isEqual(ctx.sender) || message.recipient?.isEqual(ctx.sender) === true;
      }
      return joined.has(message.channelId.toString());
    });
  },
);

export const visibleWorldSpeech = spacetimedb.view(
  { name: 'visible_world_speech', public: true },
  t.array(world_speech.rowType),
  (ctx) => {
    const caller = ctx.db.player_position.identity.find(ctx.sender);
    if (caller === null) return [];
    const clock = ctx.db.world_clock.id.find(0)?.authorityTick ?? 0n;
    return [...ctx.db.world_speech.iter()].filter((speech) => {
      if (speech.expiresTick <= clock) return false;
      const rangeTiles = speech.kind === 'shout' ? 80 : 18;
      const range = rangeTiles * TILE_SIZE_FIXED;
      const dx = speech.x - caller.x;
      const dy = speech.y - caller.y;
      return dx * dx + dy * dy <= range * range;
    });
  },
);

function parseDirection(value: string): Direction | null {
  const direction = decodeDirection(value);
  if (direction === undefined) throw new SenderError('invalid_direction');
  return direction;
}

function parseNpcFacing(value: string): NpcFacing {
  switch (value) {
    case 'up':
    case 'down':
    case 'left':
    case 'right':
      return value;
    default:
      return 'down';
  }
}

function npcDirection(value: string): NpcFacing | null {
  return value === 'idle' ? null : parseNpcFacing(value);
}

const STARTER_HORSE_HOME = {
  x: (116 + SURVIVAL_ISLAND_OFFSET_TILES) * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2,
  y: (114 + SURVIVAL_ISLAND_OFFSET_TILES) * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2,
};

function starterHorseRow() {
  return {
    id: STARTER_HORSE_ID,
    kind: 'horse',
    displayName: STARTER_HORSE_NAME,
    x: STARTER_HORSE_HOME.x,
    y: STARTER_HORSE_HOME.y,
    homeX: STARTER_HORSE_HOME.x,
    homeY: STARTER_HORSE_HOME.y,
    chunkX: chunkAt(STARTER_HORSE_HOME.x),
    chunkY: chunkAt(STARTER_HORSE_HOME.y),
    facing: 'down',
    moving: false,
    rider: undefined,
    wanderDirection: 'rest',
    nextDecisionTick: 1n,
    authorityTick: 0n,
  };
}

function starterHorseWildlifeProfileRow() {
  return {
    npcId: STARTER_HORSE_ID,
    species: 'horse',
    variant: 0,
    packId: 0n,
    habitat: 'pasture',
  };
}

function generatedWildlifeNpcRow(animal: GeneratedWildlife, authorityTick = 0n) {
  const position = wildlifePosition(animal.tileX, animal.tileY);
  const home = wildlifePosition(animal.homeTileX, animal.homeTileY);
  const spawn = animal.species === 'bee' ? home : position;
  const facings = ['down', 'left', 'right', 'up'] as const;
  return {
    id: BigInt(animal.id),
    kind: animal.species,
    // Empty is deliberate: wild horses remain nameless until a naming system
    // exists. Nados Mum is the sole authored exception.
    displayName: '',
    x: spawn.x,
    y: spawn.y,
    homeX: home.x,
    homeY: home.y,
    chunkX: chunkAt(spawn.x),
    chunkY: chunkAt(spawn.y),
    facing: facings[animal.id % facings.length] ?? 'down',
    moving: false,
    rider: undefined,
    wanderDirection: animal.species === 'bee' ? 'inside_hive' : 'rest',
    nextDecisionTick: authorityTick + BigInt(40 + animal.id % 240),
    authorityTick,
  };
}

function generatedWildlifeProfileRow(animal: GeneratedWildlife) {
  return {
    npcId: BigInt(animal.id),
    species: animal.species,
    variant: animal.variant,
    packId: BigInt(animal.packId),
    habitat: animal.habitat,
  };
}

function generatedHiveRow(hive: GeneratedWildlifeHive) {
  return {
    id: BigInt(hive.id),
    kind: hive.kind,
    variant: hive.variant,
    tileX: hive.tileX,
    tileY: hive.tileY,
    chunkX: Math.floor(hive.tileX / SURVIVAL_CHUNK_TILES),
    chunkY: Math.floor(hive.tileY / SURVIVAL_CHUNK_TILES),
    honey: 0,
    beeCount: hive.beeCount,
    nextProductionTick: 1n,
  };
}

function validateDisplayName(value: string): string {
  const name = normalizeCharacterName(value);
  if (name === null) throw new SenderError('invalid_display_name');
  return name;
}

interface MembershipPolicyRow {
  readonly role: string;
  readonly revokedAt: unknown;
  readonly blocked: boolean;
}

function requireAuthorizedSender(
  jwt: { readonly issuer: string; readonly audience: readonly string[] } | null,
  member: MembershipPolicyRow | null,
): { readonly role: string } {
  const authRejection = authenticationRejection(jwt);
  if (authRejection !== null) throw new SenderError(authRejection);
  const rejection = membershipRejection(member === null ? null : {
    role: member.role,
    revoked: member.revokedAt !== undefined,
    blocked: member.blocked,
  });
  if (rejection !== null) throw new SenderError(rejection);
  return { role: member?.role ?? 'owner' };
}

function requireWorldOwner(
  jwt: { readonly issuer: string; readonly audience: readonly string[] } | null,
  member: MembershipPolicyRow | null,
): void {
  if (member === null) throw new SenderError('owner_required');
  const actor = requireAuthorizedSender(jwt, member);
  if (!canAdministerWorld(actor.role)) throw new SenderError('owner_required');
}

export const init = spacetimedb.init((ctx) => {
  ctx.db.world_clock.insert({ id: 0, authorityTick: 0n });
  ctx.db.world_environment.insert({ id: 0, calendarTick: 0n, weatherMode: 'auto' });
  ctx.db.world_wind.insert({ id: 0, direction: 'auto' });
  ctx.db.world_seed.insert({ id: 0, seed: SURVIVAL_WORLD_SEED, version: SURVIVAL_WORLD_VERSION });
  ctx.db.chat_channel.insert({
    id: GENERAL_CHAT_CHANNEL_ID,
    slug: GENERAL_CHAT_CHANNEL_SLUG,
    displayName: 'General',
    kind: 'general',
    owner: undefined,
    createdAt: ctx.timestamp,
  });
  ctx.db.world_motd.insert({
    id: 0,
    body: DEFAULT_MESSAGE_OF_DAY,
    updatedAt: ctx.timestamp,
    updatedBy: ctx.databaseIdentity,
  });
  for (const resource of generateSurvivalResources()) {
    ctx.db.world_resource.insert({
      id: BigInt(resource.id),
      kind: resource.kind,
      tileX: resource.tileX,
      tileY: resource.tileY,
      chunkX: Math.floor(resource.tileX / SURVIVAL_CHUNK_TILES),
      chunkY: Math.floor(resource.tileY / SURVIVAL_CHUNK_TILES),
      health: survivalResourceInitialHealth(resource.kind),
      depleted: false,
    });
  }
  ctx.db.world_tree.insert({
    id: 1n,
    owner: ctx.databaseIdentity,
    x: (10 + SURVIVAL_ISLAND_OFFSET_TILES) * TILE_SIZE_FIXED,
    y: (12 + SURVIVAL_ISLAND_OFFSET_TILES) * TILE_SIZE_FIXED,
    chunkX: Math.floor((10 + SURVIVAL_ISLAND_OFFSET_TILES) / SURVIVAL_CHUNK_TILES),
    chunkY: Math.floor((12 + SURVIVAL_ISLAND_OFFSET_TILES) / SURVIVAL_CHUNK_TILES),
    care: 0,
    tendCount: 0,
    lastTendedTick: 0n,
  });
  ctx.db.world_npc.insert(starterHorseRow());
  ctx.db.world_wildlife_profile.insert(starterHorseWildlifeProfileRow());
  for (const animal of generateSurvivalWildlife()) {
    ctx.db.world_npc.insert(generatedWildlifeNpcRow(animal));
    ctx.db.world_wildlife_profile.insert(generatedWildlifeProfileRow(animal));
  }
  for (const hive of generateSurvivalWildlifeHives()) {
    ctx.db.world_hive.insert(generatedHiveRow(hive));
  }
  ctx.db.world_wildlife_generation.insert({ id: 0, version: WILDLIFE_GENERATION_VERSION });
  ctx.db.movement_timer.insert({
    scheduledId: 0n,
    scheduledAt: ScheduleAt.interval(AUTHORITY_TICK_MICROS),
  });
});

export const onConnect = spacetimedb.clientConnected((ctx) => {
  if (ctx.connectionId === null) throw new SenderError('missing_connection_id');
  const authRejection = authenticationRejection(ctx.senderAuth.jwt);
  if (authRejection !== null) throw new SenderError(authRejection);
  let member = ctx.db.membership.identity.find(ctx.sender);
  if (productionAuthEnabled()
    && member === null
    && BOOTSTRAP_OWNER_IDENTITIES.includes(ctx.sender.toHexString())) {
    member = ctx.db.membership.insert({
      identity: ctx.sender,
      role: 'owner',
      approvedAt: ctx.timestamp,
      approvedBy: ctx.sender,
      revokedAt: undefined,
      blocked: false,
    });
    ctx.db.membership_audit.insert({
      id: 0n,
      actor: ctx.sender,
      target: ctx.sender,
      action: 'bootstrap_owner',
      role: 'owner',
      occurredAt: ctx.timestamp,
    });
  }
  const registrationRole = automaticRegistrationRole(ctx.senderAuth.jwt, member !== null);
  if (registrationRole !== null) {
    member = ctx.db.membership.insert({
      identity: ctx.sender,
      role: registrationRole,
      approvedAt: ctx.timestamp,
      approvedBy: ctx.sender,
      revokedAt: undefined,
      blocked: false,
    });
    ctx.db.membership_audit.insert({
      id: 0n,
      actor: ctx.sender,
      target: ctx.sender,
      action: 'auto_register',
      role: registrationRole,
      occurredAt: ctx.timestamp,
    });
  }
  requireAuthorizedSender(ctx.senderAuth.jwt, member);
  let motd = ctx.db.world_motd.id.find(0);
  if (motd === null) {
    motd = ctx.db.world_motd.insert({
      id: 0,
      body: DEFAULT_MESSAGE_OF_DAY,
      updatedAt: ctx.timestamp,
      updatedBy: ctx.databaseIdentity,
    });
  }
  ctx.db.connection_notice.insert({
    connectionId: ctx.connectionId,
    identity: ctx.sender,
    kind: 'motd',
    body: motd.body,
    issuedAt: ctx.timestamp,
  });
  if (ctx.db.character_profile.identity.find(ctx.sender) === null) {
    ctx.db.character_profile.insert({
      identity: ctx.sender,
      nameChosen: false,
      chosenAt: undefined,
    });
  }
  if (ctx.db.player_appearance.identity.find(ctx.sender) === null) {
    const appearance = generatePlayerAppearance(ctx.sender.toHexString());
    ctx.db.player_appearance.insert({ identity: ctx.sender, ...appearance });
  }
  if (ctx.db.chat_channel.id.find(GENERAL_CHAT_CHANNEL_ID) === null) {
    ctx.db.chat_channel.insert({
      id: GENERAL_CHAT_CHANNEL_ID,
      slug: GENERAL_CHAT_CHANNEL_SLUG,
      displayName: 'General',
      kind: 'general',
      owner: undefined,
      createdAt: ctx.timestamp,
    });
  }
  const starterHorse = ctx.db.world_npc.id.find(STARTER_HORSE_ID);
  if (starterHorse === null) {
    ctx.db.world_npc.insert(starterHorseRow());
  } else if (starterHorse.displayName !== STARTER_HORSE_NAME) {
    ctx.db.world_npc.id.update({ ...starterHorse, displayName: STARTER_HORSE_NAME });
  }
  const generalMembershipId = chatMembershipId(GENERAL_CHAT_CHANNEL_ID, ctx.sender.toHexString());
  if (ctx.db.chat_channel_member.id.find(generalMembershipId) === null) {
    ctx.db.chat_channel_member.insert({
      id: generalMembershipId,
      channelId: GENERAL_CHAT_CHANNEL_ID,
      identity: ctx.sender,
      role: 'member',
      joinedAt: ctx.timestamp,
    });
  }
  // Additive module publishes do not rerun init. The first post-upgrade connection
  // transactionally installs the immutable seed and initial mutable resources.
  const installedWorld = ctx.db.world_seed.id.find(0);
  if (installedWorld === null || installedWorld.version < SURVIVAL_WORLD_VERSION) {
    if (installedWorld !== null) migrateWorldForOceanExpansion(ctx, installedWorld.version);
    // Terrain/resource revisions must not erase player-authored farms. Only the
    // legacy pre-v3 layout migration owned those rows.
    if (installedWorld !== null && installedWorld.version < 3) {
      for (const crop of ctx.db.crop_patch.iter()) ctx.db.crop_patch.id.delete(crop.id);
      for (const parcel of ctx.db.farm_parcel.iter()) ctx.db.farm_parcel.id.delete(parcel.id);
    }
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
        health: survivalResourceInitialHealth(resource.kind),
        depleted: false,
      });
    }
  }
  const firstLiveConnection = [...ctx.db.connection_presence_v2.by_identity.filter(ctx.sender)]
    .every((presence) => presenceLeaseExpired(
      presence.lastSeenAt.microsSinceUnixEpoch,
      ctx.timestamp.microsSinceUnixEpoch,
    ));
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
    for (let slot = 0; slot < INVENTORY_SLOT_CAPACITY; slot += 1) {
      const itemKind = HOTBAR_SLOTS[slot] ?? 'empty';
      ctx.db.inventory_slot.insert({
        id: `${ctx.sender.toHexString()}:${slot}`,
        identity: ctx.sender,
        slot,
        itemKind,
        quantity: itemKind === 'empty' ? 0 : STARTER_ITEM_QUANTITIES[itemKind] ?? 1,
      });
    }
  }
  for (let slot = HOTBAR_CAPACITY; slot < INVENTORY_SLOT_CAPACITY; slot += 1) {
    const id = `${ctx.sender.toHexString()}:${slot}`;
    if (ctx.db.inventory_slot.id.find(id) === null) ctx.db.inventory_slot.insert({
      id,
      identity: ctx.sender,
      slot,
      itemKind: 'empty',
      quantity: 0,
    });
  }
  // Existing characters receive the ranged starter kit only in genuinely
  // empty hotbar cells; no collected item is displaced by an additive publish.
  const currentInventory = [...ctx.db.inventory_slot.by_identity.filter(ctx.sender)];
  for (const [itemKind, quantity] of [['bow', 1], ['arrow', 32]] as const) {
    if (currentInventory.some((row) => row.itemKind === itemKind && row.quantity > 0)) continue;
    const empty = currentInventory
      .filter((row) => row.slot < HOTBAR_CAPACITY && (row.itemKind === 'empty' || row.quantity === 0))
      .sort((left, right) => left.slot - right.slot)[0];
    if (empty === undefined) continue;
    const filled = { ...empty, itemKind, quantity };
    ctx.db.inventory_slot.id.update(filled);
    currentInventory.splice(currentInventory.indexOf(empty), 1, filled);
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
      jumpFromX: undefined,
      jumpFromY: undefined,
      jumpUntilTick: undefined,
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
        jumpFromX: undefined,
        jumpFromY: undefined,
        jumpUntilTick: undefined,
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
        jumpFromX: undefined,
        jumpFromY: undefined,
        jumpUntilTick: undefined,
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
  const connectedProfile = ctx.db.player_public.identity.find(ctx.sender);
  ctx.db.connection_audit.insert({
    id: 0n,
    connectionId: ctx.connectionId,
    identity: ctx.sender,
    eventKind: 'connected',
    displayName: connectedProfile?.displayName ?? 'Unknown',
    occurredAt: ctx.timestamp,
  });
  if (firstLiveConnection
    && connectedProfile !== null
    && ctx.db.character_profile.identity.find(ctx.sender)?.nameChosen === true) {
    const conversationKey = channelConversationKey(GENERAL_CHAT_CHANNEL_ID);
    ctx.db.chat_message.insert({
      id: 0n,
      conversationKey,
      channelId: GENERAL_CHAT_CHANNEL_ID,
      sender: ctx.databaseIdentity,
      senderDisplayName: 'World',
      recipient: undefined,
      kind: 'system',
      body: worldEntryMessage(connectedProfile.displayName),
      itemLinksJson: '[]',
      sentAt: ctx.timestamp,
    });
    const history = [...ctx.db.chat_message.by_conversation.filter(conversationKey)]
      .sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
    for (const expired of history.slice(0, Math.max(0, history.length - CHAT_CHANNEL_HISTORY_LIMIT))) {
      ctx.db.chat_message.id.delete(expired.id);
    }
  }
});

// Keep the lease row after a transport disconnect. A killed process must stop
// through the 2 s stale-input failsafe while remaining visibly online until the
// existing 30 s presence lease expires; stepWorld owns that cleanup.
export const onDisconnect = spacetimedb.clientDisconnected((ctx) => {
  if (ctx.connectionId === null) return;
  const notice = ctx.db.connection_notice.connectionId.find(ctx.connectionId);
  if (notice === null || !notice.identity.isEqual(ctx.sender)) return;
  const profile = ctx.db.player_public.identity.find(ctx.sender);
  ctx.db.connection_audit.insert({
    id: 0n,
    connectionId: ctx.connectionId,
    identity: ctx.sender,
    eventKind: 'disconnected',
    displayName: profile?.displayName ?? 'Unknown',
    occurredAt: ctx.timestamp,
  });
  ctx.db.connection_notice.connectionId.delete(ctx.connectionId);
});

export const createChatChannel = spacetimedb.reducer(
  { displayName: t.string(), kind: t.string() },
  (ctx, { displayName, kind }) => {
    requireAuthorizedSender(ctx.senderAuth.jwt, ctx.db.membership.identity.find(ctx.sender));
    if (!validCreatableChatChannelKind(kind)) throw new SenderError('invalid_chat_channel_kind');
    const normalized = normalizeChatChannelName(displayName);
    if (normalized === null) throw new SenderError('invalid_chat_channel_name');
    if ([...ctx.db.chat_channel.by_slug.filter(normalized.slug)].length > 0) {
      throw new SenderError('chat_channel_name_taken');
    }
    const channel = ctx.db.chat_channel.insert({
      id: 0n,
      slug: normalized.slug,
      displayName: normalized.name,
      kind,
      owner: ctx.sender,
      createdAt: ctx.timestamp,
    });
    ctx.db.chat_channel_member.insert({
      id: chatMembershipId(channel.id, ctx.sender.toHexString()),
      channelId: channel.id,
      identity: ctx.sender,
      role: 'owner',
      joinedAt: ctx.timestamp,
    });
  },
);

export const joinChatChannel = spacetimedb.reducer(
  { channelId: t.u64() },
  (ctx, { channelId }) => {
    requireAuthorizedSender(ctx.senderAuth.jwt, ctx.db.membership.identity.find(ctx.sender));
    const channel = ctx.db.chat_channel.id.find(channelId);
    if (channel === null) throw new SenderError('chat_channel_not_found');
    if (!canJoinChatChannel(channel.kind)) throw new SenderError('chat_channel_invite_required');
    const id = chatMembershipId(channelId, ctx.sender.toHexString());
    if (ctx.db.chat_channel_member.id.find(id) !== null) return;
    ctx.db.chat_channel_member.insert({
      id,
      channelId,
      identity: ctx.sender,
      role: 'member',
      joinedAt: ctx.timestamp,
    });
  },
);

export const leaveChatChannel = spacetimedb.reducer(
  { channelId: t.u64() },
  (ctx, { channelId }) => {
    requireAuthorizedSender(ctx.senderAuth.jwt, ctx.db.membership.identity.find(ctx.sender));
    if (channelId === GENERAL_CHAT_CHANNEL_ID) throw new SenderError('general_chat_channel_required');
    const channel = ctx.db.chat_channel.id.find(channelId);
    if (channel === null) throw new SenderError('chat_channel_not_found');
    const id = chatMembershipId(channelId, ctx.sender.toHexString());
    const membershipRow = ctx.db.chat_channel_member.id.find(id);
    if (membershipRow === null) throw new SenderError('chat_channel_not_joined');
    const remainingMembers = [...ctx.db.chat_channel_member.by_channel.filter(channelId)]
      .filter((candidate) => candidate.id !== id);
    if (membershipRow.role === 'owner') {
      const nextOwner = remainingMembers[0];
      if (nextOwner === undefined) {
        for (const message of ctx.db.chat_message.by_conversation.filter(channelConversationKey(channelId))) {
          ctx.db.chat_message.id.delete(message.id);
        }
        ctx.db.chat_channel.id.delete(channelId);
      } else {
        ctx.db.chat_channel_member.id.update({ ...nextOwner, role: 'owner' });
        ctx.db.chat_channel.id.update({ ...channel, owner: nextOwner.identity });
      }
    }
    ctx.db.chat_channel_member.id.delete(id);
  },
);

export const inviteChatMember = spacetimedb.reducer(
  { channelId: t.u64(), identity: t.identity() },
  (ctx, { channelId, identity }) => {
    requireAuthorizedSender(ctx.senderAuth.jwt, ctx.db.membership.identity.find(ctx.sender));
    const channel = ctx.db.chat_channel.id.find(channelId);
    if (channel === null) throw new SenderError('chat_channel_not_found');
    const actor = ctx.db.chat_channel_member.id.find(chatMembershipId(channelId, ctx.sender.toHexString()));
    if (actor?.role !== 'owner') throw new SenderError('chat_channel_invite_forbidden');
    if (ctx.db.player_public.identity.find(identity) === null) throw new SenderError('chat_player_not_found');
    const id = chatMembershipId(channelId, identity.toHexString());
    if (ctx.db.chat_channel_member.id.find(id) !== null) return;
    ctx.db.chat_channel_member.insert({
      id,
      channelId,
      identity,
      role: 'member',
      joinedAt: ctx.timestamp,
    });
  },
);

export const sendChatMessage = spacetimedb.reducer(
  { channelId: t.u64(), body: t.string() },
  (ctx, { channelId, body }) => {
    requireAuthorizedSender(ctx.senderAuth.jwt, ctx.db.membership.identity.find(ctx.sender));
    if (ctx.db.character_profile.identity.find(ctx.sender)?.nameChosen !== true) {
      throw new SenderError('character_name_required');
    }
    const messageBody = normalizeChatMessage(body);
    if (messageBody === null) throw new SenderError('invalid_chat_message');
    const channel = ctx.db.chat_channel.id.find(channelId);
    if (channel === null) throw new SenderError('chat_channel_not_found');
    if (ctx.db.chat_channel_member.id.find(chatMembershipId(channelId, ctx.sender.toHexString())) === null) {
      throw new SenderError('chat_channel_not_joined');
    }
    const senderState = ctx.db.chat_sender_state.identity.find(ctx.sender);
    const sentAtMicros = ctx.timestamp.microsSinceUnixEpoch;
    if (senderState !== null && sentAtMicros - senderState.lastSentAtMicros < CHAT_SEND_COOLDOWN_MICROS) {
      throw new SenderError('chat_rate_limited');
    }
    if (senderState === null) ctx.db.chat_sender_state.insert({ identity: ctx.sender, lastSentAtMicros: sentAtMicros });
    else ctx.db.chat_sender_state.identity.update({ ...senderState, lastSentAtMicros: sentAtMicros });
    const profile = ctx.db.player_public.identity.find(ctx.sender);
    if (profile === null) throw new SenderError('player_not_ready');
    const conversationKey = channelConversationKey(channelId);
    ctx.db.chat_message.insert({
      id: 0n,
      conversationKey,
      channelId,
      sender: ctx.sender,
      senderDisplayName: profile.displayName,
      recipient: undefined,
      kind: 'channel',
      body: messageBody,
      itemLinksJson: '[]',
      sentAt: ctx.timestamp,
    });
    const history = [...ctx.db.chat_message.by_conversation.filter(conversationKey)]
      .sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
    for (const expired of history.slice(0, Math.max(0, history.length - CHAT_CHANNEL_HISTORY_LIMIT))) {
      ctx.db.chat_message.id.delete(expired.id);
    }
  },
);

export const sendWhisper = spacetimedb.reducer(
  { recipient: t.identity(), body: t.string() },
  (ctx, { recipient, body }) => {
    requireAuthorizedSender(ctx.senderAuth.jwt, ctx.db.membership.identity.find(ctx.sender));
    if (ctx.db.character_profile.identity.find(ctx.sender)?.nameChosen !== true) {
      throw new SenderError('character_name_required');
    }
    if (recipient.isEqual(ctx.sender)) throw new SenderError('chat_whisper_self');
    if (ctx.db.player_public.identity.find(recipient) === null) throw new SenderError('chat_player_not_found');
    const messageBody = normalizeChatMessage(body);
    if (messageBody === null) throw new SenderError('invalid_chat_message');
    const senderState = ctx.db.chat_sender_state.identity.find(ctx.sender);
    const sentAtMicros = ctx.timestamp.microsSinceUnixEpoch;
    if (senderState !== null && sentAtMicros - senderState.lastSentAtMicros < CHAT_SEND_COOLDOWN_MICROS) {
      throw new SenderError('chat_rate_limited');
    }
    if (senderState === null) ctx.db.chat_sender_state.insert({ identity: ctx.sender, lastSentAtMicros: sentAtMicros });
    else ctx.db.chat_sender_state.identity.update({ ...senderState, lastSentAtMicros: sentAtMicros });
    const profile = ctx.db.player_public.identity.find(ctx.sender);
    if (profile === null) throw new SenderError('player_not_ready');
    const conversationKey = whisperConversationKey(ctx.sender.toHexString(), recipient.toHexString());
    ctx.db.chat_message.insert({
      id: 0n,
      conversationKey,
      channelId: 0n,
      sender: ctx.sender,
      senderDisplayName: profile.displayName,
      recipient,
      kind: 'whisper',
      body: messageBody,
      itemLinksJson: '[]',
      sentAt: ctx.timestamp,
    });
    const history = [...ctx.db.chat_message.by_conversation.filter(conversationKey)]
      .sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
    for (const expired of history.slice(0, Math.max(0, history.length - CHAT_CHANNEL_HISTORY_LIMIT))) {
      ctx.db.chat_message.id.delete(expired.id);
    }
  },
);

export const sendWorldSpeech = spacetimedb.reducer(
  { kind: t.string(), body: t.string() },
  (ctx, { kind, body }) => {
    requireAuthorizedSender(ctx.senderAuth.jwt, ctx.db.membership.identity.find(ctx.sender));
    if (kind !== 'say' && kind !== 'shout') throw new SenderError('invalid_speech_kind');
    if (ctx.db.character_profile.identity.find(ctx.sender)?.nameChosen !== true) {
      throw new SenderError('character_name_required');
    }
    const messageBody = normalizeChatMessage(body);
    if (messageBody === null) throw new SenderError('invalid_speech_message');
    const senderState = ctx.db.chat_sender_state.identity.find(ctx.sender);
    const sentAtMicros = ctx.timestamp.microsSinceUnixEpoch;
    if (senderState !== null && sentAtMicros - senderState.lastSentAtMicros < CHAT_SEND_COOLDOWN_MICROS) {
      throw new SenderError('chat_rate_limited');
    }
    if (senderState === null) ctx.db.chat_sender_state.insert({ identity: ctx.sender, lastSentAtMicros: sentAtMicros });
    else ctx.db.chat_sender_state.identity.update({ ...senderState, lastSentAtMicros: sentAtMicros });
    const profile = ctx.db.player_public.identity.find(ctx.sender);
    const position = ctx.db.player_position.identity.find(ctx.sender);
    const clock = ctx.db.world_clock.id.find(0);
    if (profile === null || position === null || clock === null) throw new SenderError('player_not_ready');
    for (const previous of ctx.db.world_speech.by_speaker.filter(ctx.sender)) {
      ctx.db.world_speech.id.delete(previous.id);
    }
    const readingTicks = 80n + BigInt(Math.min(80, [...messageBody].length));
    ctx.db.world_speech.insert({
      id: 0n,
      speaker: ctx.sender,
      speakerDisplayName: profile.displayName,
      kind,
      body: messageBody,
      x: position.x,
      y: position.y,
      createdTick: clock.authorityTick,
      expiresTick: clock.authorityTick + readingTicks,
    });
  },
);

export const approveMember = spacetimedb.reducer(
  { identity: t.identity(), role: t.string() },
  (ctx, { identity, role }) => {
    if (!productionAuthEnabled()) throw new SenderError('membership_management_disabled');
    const actor = requireAuthorizedSender(
      ctx.senderAuth.jwt,
      ctx.db.membership.identity.find(ctx.sender),
    );
    if (!membershipRole(role) || !canManageMembership(actor.role, role)) {
      throw new SenderError('membership_role_forbidden');
    }
    const existing = ctx.db.membership.identity.find(identity);
    const approved = {
      identity,
      role,
      approvedAt: ctx.timestamp,
      approvedBy: ctx.sender,
      revokedAt: undefined,
      blocked: false,
    };
    if (existing === null) ctx.db.membership.insert(approved);
    else ctx.db.membership.identity.update(approved);
    ctx.db.membership_audit.insert({
      id: 0n,
      actor: ctx.sender,
      target: identity,
      action: existing === null ? 'approve' : 'restore',
      role,
      occurredAt: ctx.timestamp,
    });
  },
);

export const revokeMember = spacetimedb.reducer(
  { identity: t.identity(), blocked: t.bool() },
  (ctx, { identity, blocked }) => {
    if (!productionAuthEnabled()) throw new SenderError('membership_management_disabled');
    const actor = requireAuthorizedSender(
      ctx.senderAuth.jwt,
      ctx.db.membership.identity.find(ctx.sender),
    );
    const target = ctx.db.membership.identity.find(identity);
    if (target === null) throw new SenderError('membership_not_found');
    if (!canManageMembership(actor.role, target.role)) throw new SenderError('membership_role_forbidden');
    if (target.role === 'owner') {
      const activeOwners = [...ctx.db.membership.iter()].filter((candidate) => (
        candidate.role === 'owner' && candidate.revokedAt === undefined && !candidate.blocked
      ));
      if (activeOwners.length <= 1) throw new SenderError('last_owner_cannot_be_revoked');
    }
    ctx.db.membership.identity.update({ ...target, revokedAt: ctx.timestamp, blocked });
    ctx.db.membership_audit.insert({
      id: 0n,
      actor: ctx.sender,
      target: identity,
      action: blocked ? 'block' : 'revoke',
      role: target.role,
      occurredAt: ctx.timestamp,
    });
    for (const presence of ctx.db.connection_presence_v2.by_identity.filter(identity)) {
      ctx.db.connection_presence_v2.connectionId.delete(presence.connectionId);
    }
    const profile = ctx.db.player_public.identity.find(identity);
    if (profile !== null) ctx.db.player_public.identity.update({ ...profile, online: false });
    const input = ctx.db.player_input.identity.find(identity);
    if (input !== null) ctx.db.player_input.identity.update({
      ...input,
      direction: 'idle',
      settleDirection: 'idle',
      settleSteps: 0,
      settledSequence: input.sequence,
      pendingSequence: 0n,
    });
  },
);

export const setWorldTime = spacetimedb.reducer(
  { calendarTick: t.u64() },
  (ctx, { calendarTick }) => {
    requireWorldOwner(ctx.senderAuth.jwt, ctx.db.membership.identity.find(ctx.sender));
    if (calendarTick > MAX_WORLD_CALENDAR_TICK) throw new SenderError('world_time_out_of_range');
    const environment = ctx.db.world_environment.id.find(0);
    const next = { id: 0, calendarTick, weatherMode: environment?.weatherMode ?? 'auto' };
    if (environment === null) ctx.db.world_environment.insert(next);
    else ctx.db.world_environment.id.update(next);
    ctx.db.world_admin_audit.insert({
      id: 0n,
      actor: ctx.sender,
      action: 'set_world_time',
      value: calendarTick.toString(),
      occurredAt: ctx.timestamp,
    });
  },
);

export const setWorldWeather = spacetimedb.reducer(
  { weatherMode: t.string() },
  (ctx, { weatherMode }) => {
    requireWorldOwner(ctx.senderAuth.jwt, ctx.db.membership.identity.find(ctx.sender));
    if (!isWeatherMode(weatherMode)) throw new SenderError('invalid_weather_mode');
    const environment = ctx.db.world_environment.id.find(0);
    const next = {
      id: 0,
      calendarTick: environment?.calendarTick ?? ctx.db.world_clock.id.find(0)?.authorityTick ?? 0n,
      weatherMode,
    };
    if (environment === null) ctx.db.world_environment.insert(next);
    else ctx.db.world_environment.id.update(next);
    ctx.db.world_admin_audit.insert({
      id: 0n,
      actor: ctx.sender,
      action: 'set_world_weather',
      value: weatherMode,
      occurredAt: ctx.timestamp,
    });
  },
);

export const setWorldWindDirection = spacetimedb.reducer(
  { direction: t.string() },
  (ctx, { direction }) => {
    requireWorldOwner(ctx.senderAuth.jwt, ctx.db.membership.identity.find(ctx.sender));
    if (!isWindDirectionMode(direction)) throw new SenderError('invalid_wind_direction');
    const existing = ctx.db.world_wind.id.find(0);
    const next = { id: 0, direction };
    if (existing === null) ctx.db.world_wind.insert(next);
    else ctx.db.world_wind.id.update(next);
    ctx.db.world_admin_audit.insert({
      id: 0n,
      actor: ctx.sender,
      action: 'set_world_wind_direction',
      value: direction,
      occurredAt: ctx.timestamp,
    });
  },
);

export const setMessageOfDay = spacetimedb.reducer(
  { body: t.string() },
  (ctx, { body }) => {
    requireWorldOwner(ctx.senderAuth.jwt, ctx.db.membership.identity.find(ctx.sender));
    const normalized = normalizeMessageOfDay(body);
    if (normalized === null) throw new SenderError('invalid_message_of_day');
    const next = { id: 0, body: normalized, updatedAt: ctx.timestamp, updatedBy: ctx.sender };
    const existing = ctx.db.world_motd.id.find(0);
    if (existing === null) ctx.db.world_motd.insert(next);
    else ctx.db.world_motd.id.update(next);
    ctx.db.world_admin_audit.insert({
      id: 0n,
      actor: ctx.sender,
      action: 'set_message_of_day',
      value: normalized,
      occurredAt: ctx.timestamp,
    });
  },
);

export const adminTeleport = spacetimedb.reducer(
  { destination: t.string() },
  (ctx, { destination }) => {
    requireWorldOwner(ctx.senderAuth.jwt, ctx.db.membership.identity.find(ctx.sender));
    const argument = destination.normalize('NFC').replace(/\s+/g, ' ').trim();
    if (argument.length === 0 || [...argument].length > 64) throw new SenderError('teleport_usage');
    const coordinates = /^(-?\d+) (-?\d+)$/.exec(argument);
    let nextX: number;
    let nextY: number;
    let auditValue: string;
    if (coordinates !== null) {
      const tileX = Number(coordinates[1]);
      const tileY = Number(coordinates[2]);
      if (!Number.isSafeInteger(tileX) || !Number.isSafeInteger(tileY)
        || tileX < 0 || tileY < 0 || tileX >= SURVIVAL_WORLD_SIZE || tileY >= SURVIVAL_WORLD_SIZE) {
        throw new SenderError('teleport_coordinates_out_of_bounds');
      }
      nextX = tileX * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2;
      nextY = tileY * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2;
      const collision = createAuthoritySurvivalCollisionMap([...ctx.db.world_resource.iter()], [...ctx.db.world_chest.iter()]);
      if (positionCollides({ x: nextX, y: nextY }, collision)) {
        throw new SenderError('teleport_destination_blocked');
      }
      auditValue = `${tileX},${tileY}`;
    } else {
      const target = [...ctx.db.player_public.iter()].find((profile) => (
        profile.online && profile.displayName.toLocaleLowerCase('en-US') === argument.toLocaleLowerCase('en-US')
      ));
      if (target === undefined) throw new SenderError('teleport_player_not_found');
      const targetPosition = ctx.db.player_position.identity.find(target.identity);
      if (targetPosition === null) throw new SenderError('teleport_player_not_ready');
      nextX = targetPosition.x;
      nextY = targetPosition.y;
      auditValue = `player:${target.identity.toHexString()}:${target.displayName}`;
    }

    const position = ctx.db.player_position.identity.find(ctx.sender);
    if (position === null) throw new SenderError('player_not_ready');
    const clock = ctx.db.world_clock.id.find(0);
    const authorityTick = clock?.authorityTick ?? position.authorityTick;
    ctx.db.player_position.identity.update({
      ...position,
      x: nextX,
      y: nextY,
      chunkX: chunkAt(nextX),
      chunkY: chunkAt(nextY),
      moving: false,
      authorityTick,
      actionKind: 'none',
      actionStartedTick: authorityTick,
      jumpFromX: undefined,
      jumpFromY: undefined,
      jumpUntilTick: undefined,
    });
    const input = ctx.db.player_input.identity.find(ctx.sender);
    if (input !== null) {
      ctx.db.player_input.identity.update({
        ...input,
        direction: 'idle',
        settleDirection: 'idle',
        settleSteps: 0,
        settledSequence: input.sequence,
        pendingSequence: 0n,
        appliedSteps: 0n,
        updatedAtMicros: ctx.timestamp.microsSinceUnixEpoch,
      });
    }
    for (const npc of ctx.db.world_npc.iter()) {
      if (npc.rider?.isEqual(ctx.sender) !== true) continue;
      ctx.db.world_npc.id.update({
        ...npc,
        x: nextX,
        y: nextY,
        homeX: nextX,
        homeY: nextY,
        chunkX: chunkAt(nextX),
        chunkY: chunkAt(nextY),
        moving: false,
        wanderDirection: 'idle',
        authorityTick,
      });
    }
    ctx.db.world_admin_audit.insert({
      id: 0n,
      actor: ctx.sender,
      action: 'admin_teleport',
      value: auditValue,
      occurredAt: ctx.timestamp,
    });
  },
);

export const setDisplayName = spacetimedb.reducer(
  { displayName: t.string() },
  (ctx, { displayName }) => {
    requireAuthorizedSender(ctx.senderAuth.jwt, ctx.db.membership.identity.find(ctx.sender));
    const profile = ctx.db.player_public.identity.find(ctx.sender);
    if (profile === null) throw new SenderError('player_not_ready');
    const validName = validateDisplayName(displayName);
    const character = ctx.db.character_profile.identity.find(ctx.sender);
    if (character === null) throw new SenderError('character_profile_not_ready');
    if (character.nameChosen) {
      if (profile.displayName.toLocaleLowerCase('en-US') === validName.toLocaleLowerCase('en-US')) return;
      throw new SenderError('character_name_already_set');
    }
    const duplicate = [...ctx.db.player_public.iter()].some((candidate) => (
      !candidate.identity.isEqual(ctx.sender)
      && ctx.db.character_profile.identity.find(candidate.identity)?.nameChosen === true
      && candidate.displayName.toLocaleLowerCase('en-US') === validName.toLocaleLowerCase('en-US')
    ));
    if (duplicate) throw new SenderError('display_name_taken');
    ctx.db.player_public.identity.update({
      ...profile,
      displayName: validName,
    });
    ctx.db.character_profile.identity.update({
      ...character,
      nameChosen: true,
      chosenAt: ctx.timestamp,
    });
    const conversationKey = channelConversationKey(GENERAL_CHAT_CHANNEL_ID);
    ctx.db.chat_message.insert({
      id: 0n,
      conversationKey,
      channelId: GENERAL_CHAT_CHANNEL_ID,
      sender: ctx.databaseIdentity,
      senderDisplayName: 'World',
      recipient: undefined,
      kind: 'system',
      body: worldEntryMessage(validName),
      itemLinksJson: '[]',
      sentAt: ctx.timestamp,
    });
    const history = [...ctx.db.chat_message.by_conversation.filter(conversationKey)]
      .sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
    for (const expired of history.slice(0, Math.max(0, history.length - CHAT_CHANNEL_HISTORY_LIMIT))) {
      ctx.db.chat_message.id.delete(expired.id);
    }
    const parcel = [...ctx.db.farm_parcel.by_owner.filter(ctx.sender)][0];
    if (parcel !== undefined) {
      ctx.db.farm_parcel.id.update({ ...parcel, name: `${validName}'s Farm` });
    }
  },
);

export const heartbeat = spacetimedb.reducer((ctx) => {
  requireAuthorizedSender(ctx.senderAuth.jwt, ctx.db.membership.identity.find(ctx.sender));
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
    requireAuthorizedSender(ctx.senderAuth.jwt, ctx.db.membership.identity.find(ctx.sender));
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
    requireAuthorizedSender(ctx.senderAuth.jwt, ctx.db.membership.identity.find(ctx.sender));
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

export const moveInventoryItem = spacetimedb.reducer(
  {
    fromContainer: t.string(),
    fromIndex: t.u8(),
    toContainer: t.string(),
    toIndex: t.u8(),
    quantity: t.u16(),
  },
  (ctx, request) => {
    requireAuthorizedSender(ctx.senderAuth.jwt, ctx.db.membership.identity.find(ctx.sender));
    if (!isInventoryContainerId(request.fromContainer) || !isInventoryContainerId(request.toContainer)) {
      throw new SenderError('container_not_found');
    }
    const rows = [...ctx.db.inventory_slot.by_identity.filter(ctx.sender)];
    const hasBackpack = rows.some((row) => row.itemKind === 'backpack' && row.quantity > 0);
    const rowBySlot = new Map(rows.map((row) => [row.slot, row]));
    const container = (id: InventoryContainerId): ContainerSnapshot => {
      const capacity = accessibleInventoryContainerCapacity(id, hasBackpack);
      const offset = inventorySlotOffset(id);
      return {
        id,
        capacity,
        slots: Array.from({ length: capacity }, (_, index) => {
          const row = rowBySlot.get(offset + index);
          return row === undefined || row.itemKind === 'empty' || row.quantity === 0
            ? null
            : { itemKind: row.itemKind, quantity: row.quantity };
        }),
        ...(id === 'equipment' ? { restrictions: EQUIPMENT_RESTRICTIONS } : {}),
      };
    };
    const containers = {
      hotbar: container('hotbar'),
      backpack: container('backpack'),
      equipment: container('equipment'),
      crafting: container('crafting'),
    };
    const result = moveItemStacks(containers, request);
    if (!result.ok) throw new SenderError(result.code);
    for (const containerId of ['hotbar', 'backpack', 'equipment', 'crafting'] as const) {
      const before = containers[containerId];
      const after = result.containers[containerId]!;
      const offset = inventorySlotOffset(containerId);
      for (let index = 0; index < after.capacity; index += 1) {
        const previous = before.slots[index];
        const next = after.slots[index];
        if (previous?.itemKind === next?.itemKind && previous?.quantity === next?.quantity) continue;
        const row = rowBySlot.get(offset + index);
        if (row === undefined) throw new SenderError('inventory_slot_missing');
        ctx.db.inventory_slot.id.update({
          ...row,
          itemKind: next?.itemKind ?? 'empty',
          quantity: next?.quantity ?? 0,
        });
      }
    }
    const survival = ctx.db.player_survival.identity.find(ctx.sender);
    const position = ctx.db.player_position.identity.find(ctx.sender);
    if (survival !== null && position !== null) {
      const selected = result.containers.hotbar!.slots[survival.selectedSlot];
      ctx.db.player_position.identity.update({ ...position, equippedKind: selected?.itemKind ?? 'empty' });
    }
  },
);

export const quickMoveInventoryItem = spacetimedb.reducer(
  { fromContainer: t.string(), fromIndex: t.u8(), toContainers: t.array(t.string()) },
  (ctx, request) => {
    requireAuthorizedSender(ctx.senderAuth.jwt, ctx.db.membership.identity.find(ctx.sender));
    if (!isInventoryContainerId(request.fromContainer)
      || request.toContainers.some((id) => !isInventoryContainerId(id))) throw new SenderError('container_not_found');
    const rows = [...ctx.db.inventory_slot.by_identity.filter(ctx.sender)];
    const hasBackpack = rows.some((row) => row.itemKind === 'backpack' && row.quantity > 0);
    const rowBySlot = new Map(rows.map((row) => [row.slot, row]));
    const container = (id: InventoryContainerId): ContainerSnapshot => {
      const capacity = accessibleInventoryContainerCapacity(id, hasBackpack); const offset = inventorySlotOffset(id);
      return { id, capacity, slots: Array.from({ length: capacity }, (_, index) => {
        const row = rowBySlot.get(offset + index);
        return row === undefined || row.itemKind === 'empty' || row.quantity === 0 ? null : { itemKind: row.itemKind, quantity: row.quantity };
      }), ...(id === 'equipment' ? { restrictions: EQUIPMENT_RESTRICTIONS } : {}) };
    };
    const containers = { hotbar: container('hotbar'), backpack: container('backpack'), equipment: container('equipment'), crafting: container('crafting') };
    const result = quickMoveItemStack(containers, request);
    if (!result.ok) throw new SenderError(result.code);
    for (const containerId of ['hotbar', 'backpack', 'equipment', 'crafting'] as const) {
      const before = containers[containerId]; const after = result.containers[containerId]!; const offset = inventorySlotOffset(containerId);
      for (let index = 0; index < after.capacity; index += 1) {
        const previous = before.slots[index]; const next = after.slots[index];
        if (previous?.itemKind === next?.itemKind && previous?.quantity === next?.quantity) continue;
        const row = rowBySlot.get(offset + index); if (row === undefined) throw new SenderError('inventory_slot_missing');
        ctx.db.inventory_slot.id.update({ ...row, itemKind: next?.itemKind ?? 'empty', quantity: next?.quantity ?? 0 });
      }
    }
    const survival = ctx.db.player_survival.identity.find(ctx.sender); const position = ctx.db.player_position.identity.find(ctx.sender);
    if (survival !== null && position !== null) {
      const selected = ctx.db.inventory_slot.id.find(`${ctx.sender.toHexString()}:${survival.selectedSlot}`);
      ctx.db.player_position.identity.update({ ...position, equippedKind: selected?.itemKind ?? 'empty' });
    }
  },
);

export const distributeInventoryItem = spacetimedb.reducer(
  {
    fromContainer: t.string(), fromIndex: t.u8(),
    targetContainers: t.array(t.string()), targetIndexes: t.array(t.u8()), quantity: t.u16(),
  },
  (ctx, request) => {
    requireAuthorizedSender(ctx.senderAuth.jwt, ctx.db.membership.identity.find(ctx.sender));
    if (request.targetContainers.length !== request.targetIndexes.length
      || !isInventoryContainerId(request.fromContainer)
      || request.targetContainers.some((id) => !isInventoryContainerId(id))) throw new SenderError('container_not_found');
    const rows = [...ctx.db.inventory_slot.by_identity.filter(ctx.sender)];
    const hasBackpack = rows.some((row) => row.itemKind === 'backpack' && row.quantity > 0);
    const rowBySlot = new Map(rows.map((row) => [row.slot, row]));
    const container = (id: InventoryContainerId): ContainerSnapshot => {
      const capacity = accessibleInventoryContainerCapacity(id, hasBackpack); const offset = inventorySlotOffset(id);
      return { id, capacity, slots: Array.from({ length: capacity }, (_, index) => {
        const row = rowBySlot.get(offset + index);
        return row === undefined || row.itemKind === 'empty' || row.quantity === 0 ? null : { itemKind: row.itemKind, quantity: row.quantity };
      }), ...(id === 'equipment' ? { restrictions: EQUIPMENT_RESTRICTIONS } : {}) };
    };
    const containers = { hotbar: container('hotbar'), backpack: container('backpack'), equipment: container('equipment'), crafting: container('crafting') };
    const result = distributeItemStack(containers, {
      fromContainer: request.fromContainer, fromIndex: request.fromIndex, quantity: request.quantity,
      targets: request.targetContainers.map((containerId, index) => ({ container: containerId, index: request.targetIndexes[index]! })),
    });
    if (!result.ok) throw new SenderError(result.code);
    for (const containerId of ['hotbar', 'backpack', 'equipment', 'crafting'] as const) {
      const before = containers[containerId]; const after = result.containers[containerId]!; const offset = inventorySlotOffset(containerId);
      for (let index = 0; index < after.capacity; index += 1) {
        const previous = before.slots[index]; const next = after.slots[index];
        if (previous?.itemKind === next?.itemKind && previous?.quantity === next?.quantity) continue;
        const row = rowBySlot.get(offset + index); if (row === undefined) throw new SenderError('inventory_slot_missing');
        ctx.db.inventory_slot.id.update({ ...row, itemKind: next?.itemKind ?? 'empty', quantity: next?.quantity ?? 0 });
      }
    }
    const survival = ctx.db.player_survival.identity.find(ctx.sender); const position = ctx.db.player_position.identity.find(ctx.sender);
    if (survival !== null && position !== null) {
      const selected = ctx.db.inventory_slot.id.find(`${ctx.sender.toHexString()}:${survival.selectedSlot}`);
      ctx.db.player_position.identity.update({ ...position, equippedKind: selected?.itemKind ?? 'empty' });
    }
  },
);

export const craftInventoryRecipe = spacetimedb.reducer(
  { recipeId: t.string() },
  (ctx, { recipeId }) => {
    requireAuthorizedSender(ctx.senderAuth.jwt, ctx.db.membership.identity.find(ctx.sender));
    const rows = [...ctx.db.inventory_slot.by_identity.filter(ctx.sender)];
    const rowBySlot = new Map(rows.map((row) => [row.slot, row]));
    const hasBackpack = rows.some((row) => row.itemKind === 'backpack' && row.quantity > 0);
    const make = (id: InventoryContainerId): ContainerSnapshot => {
      const capacity = accessibleInventoryContainerCapacity(id, hasBackpack); const offset = inventorySlotOffset(id);
      return { id, capacity, slots: Array.from({ length: capacity }, (_, index) => {
        const row = rowBySlot.get(offset + index);
        return row === undefined || row.itemKind === 'empty' || row.quantity === 0 ? null : { itemKind: row.itemKind, quantity: row.quantity };
      }) };
    };
    const crafting = make('crafting');
    if (matchingRecipeId(crafting) !== recipeId) throw new SenderError('recipe_inputs_missing');
    const consumed = consumeCraftingRecipe(crafting, recipeId);
    if (!consumed.ok) throw new SenderError(consumed.code);
    const hotbar = make('hotbar'); const backpack = make('backpack');
    const inserted = quickMoveItemStack({
      output: { id: 'output', capacity: 1, slots: [consumed.crafted] }, hotbar, backpack,
    }, { fromContainer: 'output', fromIndex: 0, toContainers: ['hotbar', 'backpack'] });
    if (!inserted.ok || inserted.movedQuantity !== consumed.crafted.quantity) throw new SenderError('recipe_output_blocked');
    const results = { crafting: consumed.container, hotbar: inserted.containers.hotbar!, backpack: inserted.containers.backpack! };
    for (const containerId of ['crafting', 'hotbar', 'backpack'] as const) {
      const before = containerId === 'crafting' ? crafting : containerId === 'hotbar' ? hotbar : backpack;
      const after = results[containerId]; const offset = inventorySlotOffset(containerId);
      for (let index = 0; index < after.capacity; index += 1) {
        const previous = before.slots[index]; const next = after.slots[index];
        if (previous?.itemKind === next?.itemKind && previous?.quantity === next?.quantity) continue;
        const row = rowBySlot.get(offset + index); if (row === undefined) throw new SenderError('inventory_slot_missing');
        ctx.db.inventory_slot.id.update({ ...row, itemKind: next?.itemKind ?? 'empty', quantity: next?.quantity ?? 0 });
      }
    }
    const survival = ctx.db.player_survival.identity.find(ctx.sender); const position = ctx.db.player_position.identity.find(ctx.sender);
    if (survival !== null && position !== null) {
      const selected = ctx.db.inventory_slot.id.find(`${ctx.sender.toHexString()}:${survival.selectedSlot}`);
      ctx.db.player_position.identity.update({ ...position, equippedKind: selected?.itemKind ?? 'empty' });
    }
  },
);

/** Crafting cells are transient work space, never persistent storage. Closing
 * the window returns every input to accessible inventory cells and drops only
 * the overflow beside the player. */
export const closeCrafting = spacetimedb.reducer({}, (ctx) => {
  requireAuthorizedSender(ctx.senderAuth.jwt, ctx.db.membership.identity.find(ctx.sender));
  const position = ctx.db.player_position.identity.find(ctx.sender);
  const clock = ctx.db.world_clock.id.find(0);
  if (position === null || clock === null) throw new SenderError('player_not_ready');
  const rows = [...ctx.db.inventory_slot.by_identity.filter(ctx.sender)];
  const rowBySlot = new Map(rows.map((row) => [row.slot, row]));
  const hasBackpack = rows.some((row) => row.itemKind === 'backpack' && row.quantity > 0);
  const make = (id: 'hotbar' | 'backpack' | 'crafting'): ContainerSnapshot => {
    const capacity = accessibleInventoryContainerCapacity(id, hasBackpack);
    const offset = inventorySlotOffset(id);
    return { id, capacity, slots: Array.from({ length: capacity }, (_, index) => {
      const row = rowBySlot.get(offset + index);
      return row === undefined || row.itemKind === 'empty' || row.quantity === 0
        ? null
        : { itemKind: row.itemKind, quantity: row.quantity };
    }) };
  };
  const original = { hotbar: make('hotbar'), backpack: make('backpack'), crafting: make('crafting') };
  let containers: Readonly<Record<string, ContainerSnapshot>> = original;
  const overflow: { readonly itemKind: string; readonly quantity: number }[] = [];
  for (let index = 0; index < CRAFTING_CAPACITY; index += 1) {
    if (containers.crafting?.slots[index] === null) continue;
    const moved = quickMoveItemStack(containers, {
      fromContainer: 'crafting', fromIndex: index, toContainers: ['hotbar', 'backpack'],
    });
    if (moved.ok) containers = moved.containers;
    const remainder = containers.crafting?.slots[index] ?? null;
    if (remainder === null) continue;
    overflow.push(remainder);
    const crafting = containers.crafting!;
    const slots = [...crafting.slots];
    slots[index] = null;
    containers = { ...containers, crafting: { ...crafting, slots } };
  }
  for (const id of ['hotbar', 'backpack', 'crafting'] as const) {
    const before = original[id];
    const after = containers[id]!;
    const offset = inventorySlotOffset(id);
    for (let index = 0; index < after.capacity; index += 1) {
      const previous = before.slots[index];
      const next = after.slots[index];
      if (previous?.itemKind === next?.itemKind && previous?.quantity === next?.quantity) continue;
      const row = rowBySlot.get(offset + index);
      if (row === undefined) throw new SenderError('inventory_slot_missing');
      ctx.db.inventory_slot.id.update({ ...row, itemKind: next?.itemKind ?? 'empty', quantity: next?.quantity ?? 0 });
    }
  }
  const drop = itemDropPosition(position.x, position.y, parseDirection(position.facing) ?? 'down');
  overflow.forEach((stack, index) => ctx.db.world_item.insert({
    id: 0n,
    itemKind: stack.itemKind,
    quantity: stack.quantity,
    x: drop.x + (index % 3 - 1) * 2 * FIXED_UNITS_PER_PIXEL,
    y: drop.y + Math.floor(index / 3) * 2 * FIXED_UNITS_PER_PIXEL,
    chunkX: chunkAt(drop.x),
    chunkY: chunkAt(drop.y),
    droppedAtTick: clock.authorityTick,
  }));
  const survival = ctx.db.player_survival.identity.find(ctx.sender);
  if (survival !== null) {
    const selected = containers.hotbar?.slots[survival.selectedSlot];
    ctx.db.player_position.identity.update({ ...position, equippedKind: selected?.itemKind ?? 'empty' });
  }
});

/** F: place a carried/new chest, or pick up the chest in the facing tile. */
export const useHands = spacetimedb.reducer(
  {},
  (ctx) => {
    requireAuthorizedSender(ctx.senderAuth.jwt, ctx.db.membership.identity.find(ctx.sender));
    const position = ctx.db.player_position.identity.find(ctx.sender);
    const survival = ctx.db.player_survival.identity.find(ctx.sender);
    if (position === null || survival === null) throw new SenderError('player_not_ready');
    if ([...ctx.db.world_npc.iter()].some((npc) => npc.rider?.isEqual(ctx.sender))) throw new SenderError('mounted_action_forbidden');
    const target = facingTile(position.x, position.y, position.facing);
    if (target.tileX < 0 || target.tileY < 0 || target.tileX >= SURVIVAL_WORLD_SIZE || target.tileY >= SURVIVAL_WORLD_SIZE) {
      throw new SenderError('invalid_chest_tile');
    }
    const carried = [...ctx.db.world_chest.iter()].find((chest) => chest.carriedBy?.isEqual(ctx.sender));
    if (carried !== undefined) {
      const occupied = [...ctx.db.world_chest.iter()].some((chest) => chest.carriedBy === undefined
        && chest.tileX === target.tileX && chest.tileY === target.tileY);
      const terrain = createAuthoritySurvivalCollisionMap([], []);
      if (occupied || terrain.blocked[target.tileY * terrain.width + target.tileX]) throw new SenderError('chest_tile_blocked');
      ctx.db.world_chest.id.update({
        ...carried, tileX: target.tileX, tileY: target.tileY,
        chunkX: Math.floor(target.tileX / SURVIVAL_CHUNK_TILES), chunkY: Math.floor(target.tileY / SURVIVAL_CHUNK_TILES),
        carriedBy: undefined,
      });
      const selected = ctx.db.inventory_slot.id.find(`${ctx.sender.toHexString()}:${survival.selectedSlot}`);
      ctx.db.player_position.identity.update({ ...position, equippedKind: selected?.itemKind ?? 'empty' });
      return;
    }

    const targetChest = [...ctx.db.world_chest.iter()].find((chest) => chest.carriedBy === undefined
      && chest.tileX === target.tileX && chest.tileY === target.tileY);
    if (targetChest !== undefined) {
      const slots = [...ctx.db.world_chest_slot.by_chest.filter(targetChest.id)];
      const hasContents = slots.some((slot) => slot.itemKind !== 'empty' && slot.quantity > 0);
      const active = ctx.db.active_chest.identity.find(ctx.sender);
      if (active !== null) ctx.db.active_chest.identity.delete(ctx.sender);
      if (hasContents) {
        ctx.db.world_chest.id.update({ ...targetChest, carriedBy: ctx.sender });
        ctx.db.player_position.identity.update({ ...position, equippedKind: 'empty', actionKind: 'none' });
        return;
      }
      const rows = [...ctx.db.inventory_slot.by_identity.filter(ctx.sender)];
      const rowBySlot = new Map(rows.map((row) => [row.slot, row]));
      const hasBackpack = rows.some((row) => row.itemKind === 'backpack' && row.quantity > 0);
      const make = (id: 'hotbar' | 'backpack'): ContainerSnapshot => {
        const capacity = accessibleInventoryContainerCapacity(id, hasBackpack); const offset = inventorySlotOffset(id);
        return { id, capacity, slots: Array.from({ length: capacity }, (_, index) => {
          const row = rowBySlot.get(offset + index);
          return row === undefined || row.itemKind === 'empty' || row.quantity === 0 ? null : { itemKind: row.itemKind, quantity: row.quantity };
        }) };
      };
      const hotbar = make('hotbar'); const backpack = make('backpack');
      const inserted = quickMoveItemStack({ source: { id: 'source', capacity: 1, slots: [{ itemKind: 'chest', quantity: 1 }] }, hotbar, backpack },
        { fromContainer: 'source', fromIndex: 0, toContainers: ['hotbar', 'backpack'] });
      if (!inserted.ok) throw new SenderError('inventory_full');
      for (const id of ['hotbar', 'backpack'] as const) {
        const before = id === 'hotbar' ? hotbar : backpack; const after = inserted.containers[id]!; const offset = inventorySlotOffset(id);
        for (let index = 0; index < after.capacity; index += 1) {
          const previous = before.slots[index]; const next = after.slots[index];
          if (previous?.itemKind === next?.itemKind && previous?.quantity === next?.quantity) continue;
          const row = rowBySlot.get(offset + index); if (row !== undefined) ctx.db.inventory_slot.id.update({ ...row, itemKind: next?.itemKind ?? 'empty', quantity: next?.quantity ?? 0 });
        }
      }
      for (const slot of slots) ctx.db.world_chest_slot.id.delete(slot.id);
      ctx.db.world_chest.id.delete(targetChest.id);
      return;
    }

    const selected = ctx.db.inventory_slot.id.find(`${ctx.sender.toHexString()}:${survival.selectedSlot}`);
    if (selected?.itemKind !== 'chest' || selected.quantity === 0) throw new SenderError('hands_empty');
    const occupied = [...ctx.db.world_chest.iter()].some((chest) => chest.carriedBy === undefined
      && chest.tileX === target.tileX && chest.tileY === target.tileY);
    const terrain = createAuthoritySurvivalCollisionMap([], []);
    if (occupied || terrain.blocked[target.tileY * terrain.width + target.tileX]) throw new SenderError('chest_tile_blocked');
    const chest = ctx.db.world_chest.insert({
      id: 0n, owner: ctx.sender, tileX: target.tileX, tileY: target.tileY,
      chunkX: Math.floor(target.tileX / SURVIVAL_CHUNK_TILES), chunkY: Math.floor(target.tileY / SURVIVAL_CHUNK_TILES), carriedBy: undefined,
    });
    for (let slot = 0; slot < CHEST_CAPACITY; slot += 1) ctx.db.world_chest_slot.insert({
      id: `${chest.id}:${slot}`, chestId: chest.id, slot, itemKind: 'empty', quantity: 0,
    });
    ctx.db.inventory_slot.id.update({ ...selected, itemKind: selected.quantity === 1 ? 'empty' : selected.itemKind, quantity: selected.quantity - 1 });
    ctx.db.player_position.identity.update({ ...position, equippedKind: selected.quantity === 1 ? 'empty' : 'chest' });
  },
);

/** E: open the chest in the facing tile. */
export const interactChest = spacetimedb.reducer(
  {},
  (ctx) => {
    requireAuthorizedSender(ctx.senderAuth.jwt, ctx.db.membership.identity.find(ctx.sender));
    const position = ctx.db.player_position.identity.find(ctx.sender); if (position === null) throw new SenderError('player_not_ready');
    if ([...ctx.db.world_npc.iter()].some((npc) => npc.rider?.isEqual(ctx.sender))) throw new SenderError('mounted_action_forbidden');
    const target = facingTile(position.x, position.y, position.facing);
    const chest = [...ctx.db.world_chest.iter()].find((row) => row.carriedBy === undefined && row.tileX === target.tileX && row.tileY === target.tileY);
    if (chest === undefined) throw new SenderError('chest_not_found');
    const current = ctx.db.active_chest.identity.find(ctx.sender);
    if (current === null) ctx.db.active_chest.insert({ identity: ctx.sender, chestId: chest.id });
    else ctx.db.active_chest.identity.update({ ...current, chestId: chest.id });
  },
);

export const closeChest = spacetimedb.reducer({}, (ctx) => {
  const active = ctx.db.active_chest.identity.find(ctx.sender);
  if (active !== null) ctx.db.active_chest.identity.delete(ctx.sender);
});

export const moveChestItem = spacetimedb.reducer(
  { fromContainer: t.string(), fromIndex: t.u8(), toContainer: t.string(), toIndex: t.u8(), quantity: t.u16() },
  (ctx, request) => {
    requireAuthorizedSender(ctx.senderAuth.jwt, ctx.db.membership.identity.find(ctx.sender));
    if (![request.fromContainer, request.toContainer].every((id) => id === 'chest' || isInventoryContainerId(id))) {
      throw new SenderError('container_not_found');
    }
    const active = ctx.db.active_chest.identity.find(ctx.sender); if (active === null) throw new SenderError('chest_not_open');
    const chest = ctx.db.world_chest.id.find(active.chestId); if (chest === null || chest.carriedBy !== undefined) throw new SenderError('chest_not_open');
    const position = ctx.db.player_position.identity.find(ctx.sender);
    if (position === null || !chestWithinReach(position.x, position.y, chest)) throw new SenderError('chest_out_of_range');
    const rows = [...ctx.db.inventory_slot.by_identity.filter(ctx.sender)]; const rowBySlot = new Map(rows.map((row) => [row.slot, row]));
    const hasBackpack = rows.some((row) => row.itemKind === 'backpack' && row.quantity > 0);
    const chestRows = [...ctx.db.world_chest_slot.by_chest.filter(chest.id)]; const chestBySlot = new Map(chestRows.map((row) => [row.slot, row]));
    const makeInventory = (id: InventoryContainerId): ContainerSnapshot => {
      const capacity = accessibleInventoryContainerCapacity(id, hasBackpack); const offset = inventorySlotOffset(id);
      return { id, capacity, slots: Array.from({ length: capacity }, (_, index) => {
        const row = rowBySlot.get(offset + index); return row === undefined || row.itemKind === 'empty' || row.quantity === 0 ? null : { itemKind: row.itemKind, quantity: row.quantity };
      }), ...(id === 'equipment' ? { restrictions: EQUIPMENT_RESTRICTIONS } : {}) };
    };
    const containers: Record<string, ContainerSnapshot> = { chest: { id: 'chest', capacity: CHEST_CAPACITY, slots: Array.from({ length: CHEST_CAPACITY }, (_, index) => {
      const row = chestBySlot.get(index); return row === undefined || row.itemKind === 'empty' || row.quantity === 0 ? null : { itemKind: row.itemKind, quantity: row.quantity };
    }) } };
    for (const id of ['hotbar', 'backpack', 'equipment', 'crafting'] as const) containers[id] = makeInventory(id);
    const result = moveItemStacks(containers, request); if (!result.ok) throw new SenderError(result.code);
    for (const id of new Set([request.fromContainer, request.toContainer])) {
      const after = result.containers[id]!;
      for (let index = 0; index < after.capacity; index += 1) {
        const next = after.slots[index];
        if (id === 'chest') {
          const row = chestBySlot.get(index); if (row !== undefined && (row.itemKind !== (next?.itemKind ?? 'empty') || row.quantity !== (next?.quantity ?? 0))) {
            ctx.db.world_chest_slot.id.update({ ...row, itemKind: next?.itemKind ?? 'empty', quantity: next?.quantity ?? 0 });
          }
        } else {
          const inventoryId = id as InventoryContainerId; const row = rowBySlot.get(inventorySlotOffset(inventoryId) + index);
          if (row !== undefined && (row.itemKind !== (next?.itemKind ?? 'empty') || row.quantity !== (next?.quantity ?? 0))) {
            ctx.db.inventory_slot.id.update({ ...row, itemKind: next?.itemKind ?? 'empty', quantity: next?.quantity ?? 0 });
          }
        }
      }
    }
    const survival = ctx.db.player_survival.identity.find(ctx.sender);
    if (survival !== null) {
      const selected = ctx.db.inventory_slot.id.find(`${ctx.sender.toHexString()}:${survival.selectedSlot}`);
      ctx.db.player_position.identity.update({ ...position, equippedKind: selected?.itemKind ?? 'empty' });
    }
  },
);

export const quickMoveChestItem = spacetimedb.reducer(
  { fromContainer: t.string(), fromIndex: t.u8(), toContainers: t.array(t.string()) },
  (ctx, request) => {
    requireAuthorizedSender(ctx.senderAuth.jwt, ctx.db.membership.identity.find(ctx.sender));
    if (![request.fromContainer, ...request.toContainers].every((id) => id === 'chest' || isInventoryContainerId(id))) throw new SenderError('container_not_found');
    const active = ctx.db.active_chest.identity.find(ctx.sender); if (active === null) throw new SenderError('chest_not_open');
    const chest = ctx.db.world_chest.id.find(active.chestId); if (chest === null || chest.carriedBy !== undefined) throw new SenderError('chest_not_open');
    const position = ctx.db.player_position.identity.find(ctx.sender);
    if (position === null || !chestWithinReach(position.x, position.y, chest)) throw new SenderError('chest_out_of_range');
    const rows = [...ctx.db.inventory_slot.by_identity.filter(ctx.sender)]; const rowBySlot = new Map(rows.map((row) => [row.slot, row]));
    const hasBackpack = rows.some((row) => row.itemKind === 'backpack' && row.quantity > 0);
    const chestRows = [...ctx.db.world_chest_slot.by_chest.filter(chest.id)]; const chestBySlot = new Map(chestRows.map((row) => [row.slot, row]));
    const make = (id: InventoryContainerId): ContainerSnapshot => { const capacity = accessibleInventoryContainerCapacity(id, hasBackpack); const offset = inventorySlotOffset(id); return {
      id, capacity, slots: Array.from({ length: capacity }, (_, index) => { const row = rowBySlot.get(offset + index); return row === undefined || row.itemKind === 'empty' || row.quantity === 0 ? null : { itemKind: row.itemKind, quantity: row.quantity }; }),
      ...(id === 'equipment' ? { restrictions: EQUIPMENT_RESTRICTIONS } : {}),
    }; };
    const containers: Record<string, ContainerSnapshot> = { chest: { id: 'chest', capacity: CHEST_CAPACITY, slots: Array.from({ length: CHEST_CAPACITY }, (_, index) => { const row = chestBySlot.get(index); return row === undefined || row.itemKind === 'empty' || row.quantity === 0 ? null : { itemKind: row.itemKind, quantity: row.quantity }; }) } };
    for (const id of ['hotbar', 'backpack', 'equipment', 'crafting'] as const) containers[id] = make(id);
    const result = quickMoveItemStack(containers, request); if (!result.ok) throw new SenderError(result.code);
    for (const id of ['chest', 'hotbar', 'backpack', 'equipment', 'crafting'] as const) {
      const before = containers[id]!; const after = result.containers[id]!;
      for (let index = 0; index < after.capacity; index += 1) {
        const previous = before.slots[index]; const next = after.slots[index]; if (previous?.itemKind === next?.itemKind && previous?.quantity === next?.quantity) continue;
        if (id === 'chest') { const row = chestBySlot.get(index); if (row !== undefined) ctx.db.world_chest_slot.id.update({ ...row, itemKind: next?.itemKind ?? 'empty', quantity: next?.quantity ?? 0 }); }
        else { const row = rowBySlot.get(inventorySlotOffset(id) + index); if (row !== undefined) ctx.db.inventory_slot.id.update({ ...row, itemKind: next?.itemKind ?? 'empty', quantity: next?.quantity ?? 0 }); }
      }
    }
    const survival = ctx.db.player_survival.identity.find(ctx.sender);
    if (survival !== null) {
      const selected = ctx.db.inventory_slot.id.find(`${ctx.sender.toHexString()}:${survival.selectedSlot}`);
      ctx.db.player_position.identity.update({ ...position, equippedKind: selected?.itemKind ?? 'empty' });
    }
  },
);

export const distributeChestItem = spacetimedb.reducer(
  { fromContainer: t.string(), fromIndex: t.u8(), targetContainers: t.array(t.string()), targetIndexes: t.array(t.u8()), quantity: t.u16() },
  (ctx, request) => {
    requireAuthorizedSender(ctx.senderAuth.jwt, ctx.db.membership.identity.find(ctx.sender));
    if (request.targetContainers.length !== request.targetIndexes.length
      || ![request.fromContainer, ...request.targetContainers].every((id) => id === 'chest' || isInventoryContainerId(id))) throw new SenderError('container_not_found');
    const active = ctx.db.active_chest.identity.find(ctx.sender); if (active === null) throw new SenderError('chest_not_open');
    const chest = ctx.db.world_chest.id.find(active.chestId); if (chest === null || chest.carriedBy !== undefined) throw new SenderError('chest_not_open');
    const position = ctx.db.player_position.identity.find(ctx.sender);
    if (position === null || !chestWithinReach(position.x, position.y, chest)) throw new SenderError('chest_out_of_range');
    const rows = [...ctx.db.inventory_slot.by_identity.filter(ctx.sender)]; const rowBySlot = new Map(rows.map((row) => [row.slot, row]));
    const hasBackpack = rows.some((row) => row.itemKind === 'backpack' && row.quantity > 0);
    const chestRows = [...ctx.db.world_chest_slot.by_chest.filter(chest.id)]; const chestBySlot = new Map(chestRows.map((row) => [row.slot, row]));
    const make = (id: InventoryContainerId): ContainerSnapshot => { const capacity = accessibleInventoryContainerCapacity(id, hasBackpack); const offset = inventorySlotOffset(id); return {
      id, capacity, slots: Array.from({ length: capacity }, (_, index) => { const row = rowBySlot.get(offset + index); return row === undefined || row.itemKind === 'empty' || row.quantity === 0 ? null : { itemKind: row.itemKind, quantity: row.quantity }; }),
      ...(id === 'equipment' ? { restrictions: EQUIPMENT_RESTRICTIONS } : {}),
    }; };
    const containers: Record<string, ContainerSnapshot> = { chest: { id: 'chest', capacity: CHEST_CAPACITY, slots: Array.from({ length: CHEST_CAPACITY }, (_, index) => { const row = chestBySlot.get(index); return row === undefined || row.itemKind === 'empty' || row.quantity === 0 ? null : { itemKind: row.itemKind, quantity: row.quantity }; }) } };
    for (const id of ['hotbar', 'backpack', 'equipment', 'crafting'] as const) containers[id] = make(id);
    const result = distributeItemStack(containers, { fromContainer: request.fromContainer, fromIndex: request.fromIndex, quantity: request.quantity,
      targets: request.targetContainers.map((containerId, index) => ({ container: containerId, index: request.targetIndexes[index]! })) });
    if (!result.ok) throw new SenderError(result.code);
    for (const id of ['chest', 'hotbar', 'backpack', 'equipment', 'crafting'] as const) {
      const before = containers[id]!; const after = result.containers[id]!;
      for (let index = 0; index < after.capacity; index += 1) {
        const previous = before.slots[index]; const next = after.slots[index]; if (previous?.itemKind === next?.itemKind && previous?.quantity === next?.quantity) continue;
        if (id === 'chest') { const row = chestBySlot.get(index); if (row !== undefined) ctx.db.world_chest_slot.id.update({ ...row, itemKind: next?.itemKind ?? 'empty', quantity: next?.quantity ?? 0 }); }
        else { const row = rowBySlot.get(inventorySlotOffset(id) + index); if (row !== undefined) ctx.db.inventory_slot.id.update({ ...row, itemKind: next?.itemKind ?? 'empty', quantity: next?.quantity ?? 0 }); }
      }
    }
    const survival = ctx.db.player_survival.identity.find(ctx.sender);
    if (survival !== null) {
      const selected = ctx.db.inventory_slot.id.find(`${ctx.sender.toHexString()}:${survival.selectedSlot}`);
      ctx.db.player_position.identity.update({ ...position, equippedKind: selected?.itemKind ?? 'empty' });
    }
  },
);

export const interactHorse = spacetimedb.reducer(
  { horseId: t.u64() },
  (ctx, { horseId }) => {
    requireAuthorizedSender(ctx.senderAuth.jwt, ctx.db.membership.identity.find(ctx.sender));
    if ([...ctx.db.world_chest.iter()].some((chest) => chest.carriedBy?.isEqual(ctx.sender))) throw new SenderError('hands_occupied');
    const position = ctx.db.player_position.identity.find(ctx.sender);
    const clock = ctx.db.world_clock.id.find(0);
    if (position === null || clock === null) throw new SenderError('player_not_ready');
    const collision = createAuthoritySurvivalCollisionMap([...ctx.db.world_resource.iter()], [...ctx.db.world_chest.iter()]);
    const currentMount = [...ctx.db.world_npc.iter()]
      .find((npc) => npc.rider?.isEqual(ctx.sender) === true);

    if (currentMount !== undefined) {
      const landing = findHorseDismountPosition(
        { x: currentMount.x, y: currentMount.y },
        parseNpcFacing(currentMount.facing),
        collision,
      );
      if (landing === null) throw new SenderError('no_safe_dismount_position');
      ctx.db.world_npc.id.update({
        ...currentMount,
        rider: undefined,
        moving: false,
        wanderDirection: 'idle',
        nextDecisionTick: clock.authorityTick + 20n,
        authorityTick: clock.authorityTick,
      });
      ctx.db.player_position.identity.update({
        ...position,
        x: landing.x,
        y: landing.y,
        chunkX: chunkAt(landing.x),
        chunkY: chunkAt(landing.y),
        moving: false,
        actionKind: 'none',
        actionStartedTick: clock.authorityTick,
        authorityTick: clock.authorityTick,
        jumpFromX: undefined,
        jumpFromY: undefined,
        jumpUntilTick: undefined,
      });
      return;
    }

    const horse = ctx.db.world_npc.id.find(horseId);
    if (horse === null || horse.kind !== 'horse') throw new SenderError('horse_not_ready');
    if (horse.rider !== undefined) throw new SenderError('horse_already_ridden');
    if (!isHorseWithinMountReach(
      { x: position.x, y: position.y },
      { x: horse.x, y: horse.y },
    )) throw new SenderError('horse_out_of_range');
    ctx.db.world_npc.id.update({
      ...horse,
      rider: ctx.sender,
      moving: false,
      wanderDirection: 'idle',
      authorityTick: clock.authorityTick,
    });
    ctx.db.player_position.identity.update({
      ...position,
      x: horse.x,
      y: horse.y,
      chunkX: horse.chunkX,
      chunkY: horse.chunkY,
      facing: horse.facing,
      moving: false,
      actionKind: 'none',
      actionStartedTick: clock.authorityTick,
      authorityTick: clock.authorityTick,
      jumpFromX: undefined,
      jumpFromY: undefined,
      jumpUntilTick: undefined,
    });
  },
);

export const jumpHorse = spacetimedb.reducer((ctx) => {
  requireAuthorizedSender(ctx.senderAuth.jwt, ctx.db.membership.identity.find(ctx.sender));
  const position = ctx.db.player_position.identity.find(ctx.sender);
  const clock = ctx.db.world_clock.id.find(0);
  if (position === null || clock === null) throw new SenderError('player_not_ready');
  const horse = [...ctx.db.world_npc.iter()]
    .find((npc) => npc.rider?.isEqual(ctx.sender) === true);
  if (horse === undefined) throw new SenderError('horse_jump_requires_mount');
  if (position.jumpUntilTick !== undefined && position.jumpUntilTick >= clock.authorityTick) {
    throw new SenderError('horse_jump_cooldown');
  }
  const facing = parseNpcFacing(horse.facing);
  const collision = createAuthoritySurvivalCollisionMap([...ctx.db.world_resource.iter()], [...ctx.db.world_chest.iter()]);
  const landing = findHorseJumpLanding({ x: position.x, y: position.y }, facing, collision);
  if (landing === null) throw new SenderError('horse_jump_no_safe_landing');
  const jumpUntilTick = clock.authorityTick + BigInt(HORSE_JUMP_DURATION_TICKS);
  ctx.db.player_position.identity.update({
    ...position,
    x: landing.x,
    y: landing.y,
    chunkX: chunkAt(landing.x),
    chunkY: chunkAt(landing.y),
    facing,
    moving: false,
    authorityTick: clock.authorityTick,
    actionKind: 'horse_jump',
    actionStartedTick: clock.authorityTick,
    jumpFromX: position.x,
    jumpFromY: position.y,
    jumpUntilTick,
  });
  ctx.db.world_npc.id.update({
    ...horse,
    x: landing.x,
    y: landing.y,
    chunkX: chunkAt(landing.x),
    chunkY: chunkAt(landing.y),
    facing,
    moving: true,
    wanderDirection: 'idle',
    authorityTick: clock.authorityTick,
  });
  const input = ctx.db.player_input.identity.find(ctx.sender);
  if (input !== null) ctx.db.player_input.identity.update({
    ...input,
    direction: 'idle',
    appliedSteps: 0n,
    settleDirection: 'idle',
    settleSteps: 0,
    settledSequence: input.sequence,
    pendingSequence: 0n,
  });
});

export const dropSelected = spacetimedb.reducer((ctx) => {
  requireAuthorizedSender(ctx.senderAuth.jwt, ctx.db.membership.identity.find(ctx.sender));
  const position = ctx.db.player_position.identity.find(ctx.sender);
  const survival = ctx.db.player_survival.identity.find(ctx.sender);
  const clock = ctx.db.world_clock.id.find(0);
  if (position === null || survival === null || clock === null) throw new SenderError('player_not_ready');
  if ([...ctx.db.world_chest.iter()].some((chest) => chest.carriedBy?.isEqual(ctx.sender))) throw new SenderError('hands_occupied');
  if ([...ctx.db.world_npc.iter()].some((npc) => npc.rider?.isEqual(ctx.sender) === true)) {
    throw new SenderError('mounted_action_forbidden');
  }
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
    requireAuthorizedSender(ctx.senderAuth.jwt, ctx.db.membership.identity.find(ctx.sender));
    const position = ctx.db.player_position.identity.find(ctx.sender);
    const item = ctx.db.world_item.id.find(itemId);
    const clock = ctx.db.world_clock.id.find(0);
    if (position === null || item === null || clock === null) throw new SenderError('item_not_ready');
    if (!itemWithinPickupReach(position.x, position.y, item.x, item.y)) throw new SenderError('item_out_of_range');
    const slots = [...ctx.db.inventory_slot.by_identity.filter(ctx.sender)].sort((left, right) => left.slot - right.slot);
    const hasBackpack = slots.some((slot) => slot.itemKind === 'backpack' && slot.quantity > 0);
    const capacity = BACKPACK_SLOT_OFFSET + (hasBackpack ? BACKPACK_CAPACITY : DEFAULT_BACKPACK_CAPACITY);
    const carried: ContainerSnapshot = {
      id: 'carried',
      capacity,
      slots: Array.from({ length: capacity }, (_, index) => {
        const row = slots.find((slot) => slot.slot === index);
        return row === undefined || row.itemKind === 'empty' || row.quantity === 0
          ? null
          : { itemKind: row.itemKind, quantity: row.quantity };
      }),
    };
    const inserted = insertItemStack(carried, { itemKind: item.itemKind, quantity: item.quantity });
    if (!inserted.ok) throw new SenderError(inserted.code === 'container_full' ? 'inventory_full' : inserted.code);
    let destinationSlot: number | null = null;
    for (let slot = 0; slot < inserted.container.capacity; slot += 1) {
      const before = carried.slots[slot];
      const after = inserted.container.slots[slot];
      if (before?.itemKind === after?.itemKind && before?.quantity === after?.quantity) continue;
      const row = slots.find((candidate) => candidate.slot === slot);
      if (row === undefined) throw new SenderError('inventory_slot_missing');
      ctx.db.inventory_slot.id.update({
        ...row,
        itemKind: after?.itemKind ?? 'empty',
        quantity: after?.quantity ?? 0,
      });
      if (destinationSlot === null) destinationSlot = slot;
    }
    const survival = ctx.db.player_survival.identity.find(ctx.sender);
    ctx.db.player_position.identity.update({
      ...position,
      equippedKind: survival?.selectedSlot === destinationSlot ? item.itemKind : position.equippedKind,
      actionKind: 'pickup',
      actionStartedTick: nextActionStartedTick(position.actionStartedTick, clock.authorityTick),
    });
    ctx.db.world_item.id.delete(item.id);
  },
);

export const gatherWorldResource = spacetimedb.reducer(
  { resourceId: t.u64() },
  (ctx, { resourceId }) => {
    requireAuthorizedSender(ctx.senderAuth.jwt, ctx.db.membership.identity.find(ctx.sender));
    const position = ctx.db.player_position.identity.find(ctx.sender);
    const resource = ctx.db.world_resource.id.find(resourceId);
    const clock = ctx.db.world_clock.id.find(0);
    if (position === null || resource === null || clock === null) throw new SenderError('target_not_ready');
    if ([...ctx.db.world_chest.iter()].some((chest) => chest.carriedBy?.isEqual(ctx.sender))) {
      throw new SenderError('hands_occupied');
    }
    if ([...ctx.db.world_npc.iter()].some((npc) => npc.rider?.isEqual(ctx.sender) === true)) {
      throw new SenderError('mounted_action_forbidden');
    }
    const result = resourceGatherResult(position.x, position.y, resource);
    if (result !== 'ok') throw new SenderError(result);
    const drop = survivalGatherableDrop(resource.kind);
    if (drop === null || !isGatherableResourceKind(resource.kind)) throw new SenderError('not_gatherable');

    const slots = [...ctx.db.inventory_slot.by_identity.filter(ctx.sender)].sort((left, right) => left.slot - right.slot);
    const hasBackpack = slots.some((slot) => slot.itemKind === 'backpack' && slot.quantity > 0);
    const capacity = BACKPACK_SLOT_OFFSET + (hasBackpack ? BACKPACK_CAPACITY : DEFAULT_BACKPACK_CAPACITY);
    const carried: ContainerSnapshot = {
      id: 'carried',
      capacity,
      slots: Array.from({ length: capacity }, (_, index) => {
        const row = slots.find((slot) => slot.slot === index);
        return row === undefined || row.itemKind === 'empty' || row.quantity === 0
          ? null
          : { itemKind: row.itemKind, quantity: row.quantity };
      }),
    };
    const inserted = insertItemStack(carried, drop);
    if (!inserted.ok) throw new SenderError(inserted.code === 'container_full' ? 'inventory_full' : inserted.code);
    let destinationSlot: number | null = null;
    for (let slot = 0; slot < inserted.container.capacity; slot += 1) {
      const before = carried.slots[slot];
      const after = inserted.container.slots[slot];
      if (before?.itemKind === after?.itemKind && before?.quantity === after?.quantity) continue;
      const row = slots.find((candidate) => candidate.slot === slot);
      if (row === undefined) throw new SenderError('inventory_slot_missing');
      ctx.db.inventory_slot.id.update({
        ...row,
        itemKind: after?.itemKind ?? 'empty',
        quantity: after?.quantity ?? 0,
      });
      if (destinationSlot === null) destinationSlot = slot;
    }
    const survival = ctx.db.player_survival.identity.find(ctx.sender);
    const resourceFacing = directionFromAim(
      resource.tileX * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2 - position.x,
      resource.tileY * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2 - position.y,
    );
    ctx.db.player_position.identity.update({
      ...position,
      facing: resourceFacing ?? position.facing,
      equippedKind: survival?.selectedSlot === destinationSlot ? drop.itemKind : position.equippedKind,
      actionKind: 'pickup',
      actionStartedTick: nextActionStartedTick(position.actionStartedTick, clock.authorityTick),
    });
    ctx.db.world_resource.id.update({ ...resource, health: 0, depleted: true });
  },
);

export const harvestResource = spacetimedb.reducer(
  { resourceId: t.u64() },
  (ctx, { resourceId }) => {
    requireAuthorizedSender(ctx.senderAuth.jwt, ctx.db.membership.identity.find(ctx.sender));
    const position = ctx.db.player_position.identity.find(ctx.sender);
    const survival = ctx.db.player_survival.identity.find(ctx.sender);
    const clock = ctx.db.world_clock.id.find(0);
    if (position === null || survival === null || clock === null) throw new SenderError('player_not_ready');
    if ([...ctx.db.world_chest.iter()].some((chest) => chest.carriedBy?.isEqual(ctx.sender))) throw new SenderError('hands_occupied');
    if ([...ctx.db.world_npc.iter()].some((npc) => npc.rider?.isEqual(ctx.sender) === true)) {
      throw new SenderError('mounted_action_forbidden');
    }
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
    const resourceFacing = directionFromAim(
      resource.tileX * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2 - position.x,
      resource.tileY * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2 - position.y,
    );

    ctx.db.player_position.identity.update({
      ...position,
      facing: resourceFacing ?? position.facing,
      actionKind,
      actionStartedTick: nextActionStartedTick(position.actionStartedTick, clock.authorityTick),
    });

    const nextHealth = Math.max(0, resource.health - 1);
    ctx.db.world_resource.id.update({ ...resource, health: nextHealth, depleted: nextHealth === 0 });
    const drops = survivalResourceDropsAfterHit(resource.kind, nextHealth);
    if (drops.length === 0) return;
    const itemX = resource.tileX * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2 + 10 * FIXED_UNITS_PER_PIXEL;
    const itemY = (resource.tileY + 1) * TILE_SIZE_FIXED + 3 * FIXED_UNITS_PER_PIXEL;
    for (const [index, drop] of drops.entries()) {
      const dropX = itemX + index * 4 * FIXED_UNITS_PER_PIXEL;
      ctx.db.world_item.insert({
        id: 0n,
        itemKind: drop.itemKind,
        quantity: drop.quantity,
        x: dropX,
        y: itemY,
        chunkX: chunkAt(dropX),
        chunkY: chunkAt(itemY),
        droppedAtTick: clock.authorityTick,
      });
    }
  },
);

export const fireBow = spacetimedb.reducer(
  { aimX: t.i16(), aimY: t.i16(), chargeMs: t.u16() },
  (ctx, { aimX, aimY, chargeMs }) => {
    requireAuthorizedSender(ctx.senderAuth.jwt, ctx.db.membership.identity.find(ctx.sender));
    const position = ctx.db.player_position.identity.find(ctx.sender);
    const survival = ctx.db.player_survival.identity.find(ctx.sender);
    const clock = ctx.db.world_clock.id.find(0);
    if (position === null || survival === null || clock === null) throw new SenderError('player_not_ready');
    if ([...ctx.db.world_chest.iter()].some((chest) => chest.carriedBy?.isEqual(ctx.sender))) {
      throw new SenderError('hands_occupied');
    }
    const mount = [...ctx.db.world_npc.iter()]
      .find((npc) => npc.rider?.isEqual(ctx.sender) === true);
    const selected = ctx.db.inventory_slot.id.find(`${ctx.sender.toHexString()}:${survival.selectedSlot}`);
    if (selected?.itemKind !== 'bow' || selected.quantity < 1) throw new SenderError('wrong_tool');
    const arrow = [...ctx.db.inventory_slot.by_identity.filter(ctx.sender)]
      .filter((row) => row.itemKind === 'arrow' && row.quantity > 0)
      .sort((left, right) => left.slot - right.slot)[0];
    if (arrow === undefined) throw new SenderError('out_of_arrows');
    const aim = normalizedBowAim(aimX, aimY);
    const shot = bowShotForCharge(aimX, aimY, chargeMs);
    const facing = directionFromAim(aimX, aimY);
    if (aim === null || shot === null || facing === null) throw new SenderError('invalid_aim');

    ctx.db.inventory_slot.id.update({
      ...arrow,
      itemKind: arrow.quantity === 1 ? 'empty' : 'arrow',
      quantity: arrow.quantity - 1,
    });
    const origin = bowProjectileOrigin(position, aim, mount !== undefined);
    const { x, y } = origin;
    ctx.db.world_projectile.insert({
      id: 0n,
      owner: ctx.sender,
      x,
      y,
      velocityX: shot.velocityX,
      velocityY: shot.velocityY,
      chunkX: chunkAt(x),
      chunkY: chunkAt(y),
      spawnedTick: clock.authorityTick,
      expiresTick: clock.authorityTick + BigInt(shot.lifetimeTicks),
      state: 'flying',
      hitKind: '',
      hitId: '',
    });
    ctx.db.player_position.identity.update({
      ...position,
      facing,
      actionKind: 'ranged_weapon',
      actionStartedTick: nextActionStartedTick(position.actionStartedTick, clock.authorityTick),
      equippedKind: 'bow',
    });
  },
);

export const useFarmTool = spacetimedb.reducer(
  { tileX: t.i16(), tileY: t.i16() },
  (ctx, { tileX, tileY }) => {
    requireAuthorizedSender(ctx.senderAuth.jwt, ctx.db.membership.identity.find(ctx.sender));
    const position = ctx.db.player_position.identity.find(ctx.sender);
    const survival = ctx.db.player_survival.identity.find(ctx.sender);
    const clock = ctx.db.world_clock.id.find(0);
    const seed = ctx.db.world_seed.id.find(0);
    if (position === null || survival === null || clock === null || seed === null) {
      throw new SenderError('player_not_ready');
    }
    if ([...ctx.db.world_npc.iter()].some((npc) => npc.rider?.isEqual(ctx.sender) === true)) {
      throw new SenderError('mounted_action_forbidden');
    }
    const slot = ctx.db.inventory_slot.id.find(`${ctx.sender.toHexString()}:${survival.selectedSlot}`);
    const selectedItem = slot?.itemKind ?? 'empty';
    const actionKind = avatarActionForEquippedKind(selectedItem);
    if (actionKind !== 'swing_hoe' && actionKind !== 'water') throw new SenderError('wrong_tool');
    const id = `${tileX}:${tileY}`;
    const soil = ctx.db.world_soil.id.find(id);
    const occupied = [...ctx.db.world_resource.iter()].some((resource) => (
      !resource.depleted && resource.tileX === tileX && resource.tileY === tileY
    ));
    const result = farmToolUseResult(
      seed.seed,
      position.x,
      position.y,
      selectedItem,
      tileX,
      tileY,
      soil,
      occupied,
    );
    if (result !== 'ok') throw new SenderError(result);
    const toolFacing = directionFromAim(
      tileX * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2 - position.x,
      tileY * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2 - position.y,
    );

    if (selectedItem === 'hoe') {
      ctx.db.world_soil.insert({
        id,
        tileX,
        tileY,
        chunkX: Math.floor(tileX / SURVIVAL_CHUNK_TILES),
        chunkY: Math.floor(tileY / SURVIVAL_CHUNK_TILES),
        watered: false,
        tilledAtTick: clock.authorityTick,
        wateredAtTick: 0n,
      });
    } else if (soil !== null) {
      ctx.db.world_soil.id.update({ ...soil, watered: true, wateredAtTick: clock.authorityTick });
    }
    ctx.db.player_position.identity.update({
      ...position,
      facing: toolFacing ?? position.facing,
      actionKind,
      actionStartedTick: nextActionStartedTick(position.actionStartedTick, clock.authorityTick),
    });
  },
);

export const restoreFarmTile = spacetimedb.reducer(
  { tileX: t.i16(), tileY: t.i16() },
  (ctx, { tileX, tileY }) => {
    requireAuthorizedSender(ctx.senderAuth.jwt, ctx.db.membership.identity.find(ctx.sender));
    const position = ctx.db.player_position.identity.find(ctx.sender);
    const survival = ctx.db.player_survival.identity.find(ctx.sender);
    const clock = ctx.db.world_clock.id.find(0);
    if (position === null || survival === null || clock === null) throw new SenderError('player_not_ready');
    if ([...ctx.db.world_npc.iter()].some((npc) => npc.rider?.isEqual(ctx.sender) === true)) {
      throw new SenderError('mounted_action_forbidden');
    }
    const slot = ctx.db.inventory_slot.id.find(`${ctx.sender.toHexString()}:${survival.selectedSlot}`);
    const selectedItem = slot?.itemKind ?? 'empty';
    const id = `${tileX}:${tileY}`;
    const soil = ctx.db.world_soil.id.find(id);
    const result = farmSoilRestoreResult(position.x, position.y, selectedItem, tileX, tileY, soil);
    if (result !== 'ok') throw new SenderError(result);
    const toolFacing = directionFromAim(
      tileX * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2 - position.x,
      tileY * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2 - position.y,
    );

    ctx.db.world_soil.id.delete(id);
    ctx.db.player_position.identity.update({
      ...position,
      facing: toolFacing ?? position.facing,
      actionKind: 'swing_hoe',
      actionStartedTick: nextActionStartedTick(position.actionStartedTick, clock.authorityTick),
    });
  },
);

export const tendTree = spacetimedb.reducer(
  { treeId: t.u64() },
  (ctx, { treeId }) => {
    requireAuthorizedSender(ctx.senderAuth.jwt, ctx.db.membership.identity.find(ctx.sender));
    if ([...ctx.db.world_chest.iter()].some((chest) => chest.carriedBy?.isEqual(ctx.sender))) throw new SenderError('hands_occupied');
    const position = ctx.db.player_position.identity.find(ctx.sender);
    const tree = ctx.db.world_tree.id.find(treeId);
    const clock = ctx.db.world_clock.id.find(0);
    if (position === null || tree === null || clock === null) {
      throw new SenderError('target_not_ready');
    }
    if ([...ctx.db.world_npc.iter()].some((npc) => npc.rider?.isEqual(ctx.sender) === true)) {
      throw new SenderError('mounted_action_forbidden');
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
    requireAuthorizedSender(ctx.senderAuth.jwt, ctx.db.membership.identity.find(ctx.sender));
    if ([...ctx.db.world_chest.iter()].some((chest) => chest.carriedBy?.isEqual(ctx.sender))) throw new SenderError('hands_occupied');
    const position = ctx.db.player_position.identity.find(ctx.sender);
    const clock = ctx.db.world_clock.id.find(0);
    if (position === null || clock === null) throw new SenderError('player_not_ready');
    if ([...ctx.db.world_npc.iter()].some((npc) => npc.rider?.isEqual(ctx.sender) === true)) {
      throw new SenderError('mounted_action_forbidden');
    }
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
    const installedWorld = ctx.db.world_seed.id.find(0);
    if (installedWorld === null || installedWorld.version < SURVIVAL_WORLD_VERSION) {
      if (installedWorld !== null) migrateWorldForOceanExpansion(ctx, installedWorld.version);
      if (installedWorld !== null && installedWorld.version < 3) {
        for (const crop of ctx.db.crop_patch.iter()) ctx.db.crop_patch.id.delete(crop.id);
        for (const parcel of ctx.db.farm_parcel.iter()) ctx.db.farm_parcel.id.delete(parcel.id);
      }
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
          health: survivalResourceInitialHealth(resource.kind),
          depleted: false,
        });
      }
    }
    let environment = ctx.db.world_environment.id.find(0);
    if (environment === null) {
      environment = ctx.db.world_environment.insert({
        id: 0,
        calendarTick: clock.authorityTick,
        weatherMode: 'auto',
      });
    }
    if (ctx.db.world_wind.id.find(0) === null) {
      ctx.db.world_wind.insert({ id: 0, direction: 'auto' });
    }
    const wildlifeGeneration = ctx.db.world_wildlife_generation.id.find(0);
    if (wildlifeGeneration === null || wildlifeGeneration.version < WILDLIFE_GENERATION_VERSION) {
      // Only this deterministic layer is replaced. Player identities, farms,
      // inventory, resources, and the authored starter horse are untouched.
      for (const profile of ctx.db.world_wildlife_profile.iter()) {
        ctx.db.world_wildlife_profile.npcId.delete(profile.npcId);
      }
      for (const npc of ctx.db.world_npc.iter()) {
        if (npc.id >= BigInt(WILDLIFE_FIRST_NPC_ID)) ctx.db.world_npc.id.delete(npc.id);
      }
      for (const hive of ctx.db.world_hive.iter()) ctx.db.world_hive.id.delete(hive.id);
      ctx.db.world_wildlife_profile.insert(starterHorseWildlifeProfileRow());
      for (const animal of generateSurvivalWildlife()) {
        ctx.db.world_npc.insert(generatedWildlifeNpcRow(animal));
        ctx.db.world_wildlife_profile.insert(generatedWildlifeProfileRow(animal));
      }
      for (const hive of generateSurvivalWildlifeHives()) {
        ctx.db.world_hive.insert(generatedHiveRow(hive));
      }
      const nextGeneration = { id: 0, version: WILDLIFE_GENERATION_VERSION };
      if (wildlifeGeneration === null) ctx.db.world_wildlife_generation.insert(nextGeneration);
      else ctx.db.world_wildlife_generation.id.update(nextGeneration);
    }

    for (const presence of ctx.db.connection_presence_v2.iter()) {
      if (!presenceLeaseExpired(
        presence.lastSeenAt.microsSinceUnixEpoch,
        ctx.timestamp.microsSinceUnixEpoch,
      )) continue;
      ctx.db.connection_presence_v2.connectionId.delete(presence.connectionId);
      const abandonedNotice = ctx.db.connection_notice.connectionId.find(presence.connectionId);
      if (abandonedNotice !== null) {
        const abandonedProfile = ctx.db.player_public.identity.find(presence.identity);
        ctx.db.connection_audit.insert({
          id: 0n,
          connectionId: presence.connectionId,
          identity: presence.identity,
          eventKind: 'lease_expired',
          displayName: abandonedProfile?.displayName ?? 'Unknown',
          occurredAt: ctx.timestamp,
        });
        ctx.db.connection_notice.connectionId.delete(presence.connectionId);
      }
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
          actionKind: 'none',
          jumpFromX: undefined,
          jumpFromY: undefined,
          jumpUntilTick: undefined,
          lastProcessedSequence: input?.sequence ?? position.lastProcessedSequence,
        });
      }
      for (const npc of ctx.db.world_npc.iter()) {
        if (npc.rider?.isEqual(presence.identity) !== true) continue;
        ctx.db.world_npc.id.update({
          ...npc,
          rider: undefined,
          moving: false,
          wanderDirection: 'idle',
          nextDecisionTick: clock.authorityTick + 20n,
        });
      }
    }

    if ([...ctx.db.connection_presence_v2.iter()].length === 0) return;
    const authorityTick = clock.authorityTick + 1n;
    ctx.db.world_clock.id.update({ ...clock, authorityTick });
    const calendarTick = environment.calendarTick + 1n;
    ctx.db.world_environment.id.update({ ...environment, calendarTick });
    const wildlifeSeed = ctx.db.world_seed.id.find(0)?.seed ?? SURVIVAL_WORLD_SEED;
    if (hiveProducesHoneyAtTick(calendarTick)) {
      for (const hive of ctx.db.world_hive.iter()) {
        if (hive.nextProductionTick > authorityTick || hive.honey >= HIVE_HONEY_CAPACITY) continue;
        ctx.db.world_hive.id.update({
          ...hive,
          honey: Math.min(HIVE_HONEY_CAPACITY, hive.honey + Math.max(1, hive.beeCount)),
          nextProductionTick: authorityTick + HIVE_PRODUCTION_INTERVAL_TICKS,
        });
      }
    }
    // Hives own a deterministic roster. A missing bee is recreated inside its
    // hive on a coarse cadence, preserving a fixed population without a timer
    // or lifecycle row per insect.
    if (authorityTick % 600n === 0n) {
      const generatedHives = generateSurvivalWildlifeHives(wildlifeSeed);
      const hivesByHome = new Map<string, { readonly beeCount: number }>(
        generatedHives.map((hive) => [`${hive.tileX},${hive.tileY}`, hive]),
      );
      const rosterCounts = new Map<string, number>();
      const npcIds = new Set([...ctx.db.world_npc.iter()].map((npc) => npc.id));
      const profileIds = new Set([...ctx.db.world_wildlife_profile.iter()].map((profile) => profile.npcId));
      for (const animal of generateSurvivalWildlife(wildlifeSeed)) {
        if (animal.species !== 'bee') continue;
        const key = `${animal.homeTileX},${animal.homeTileY}`;
        const hive = hivesByHome.get(key);
        if (hive === undefined) continue;
        const rosterIndex = rosterCounts.get(key) ?? 0;
        rosterCounts.set(key, rosterIndex + 1);
        if (rosterIndex >= hive.beeCount) continue;
        const npcId = BigInt(animal.id);
        if (!profileIds.has(npcId)) {
          ctx.db.world_wildlife_profile.insert(generatedWildlifeProfileRow(animal));
          profileIds.add(npcId);
        }
        if (!npcIds.has(npcId)) {
          ctx.db.world_npc.insert(generatedWildlifeNpcRow(animal, authorityTick));
          npcIds.add(npcId);
        }
      }
    }
    for (const speech of ctx.db.world_speech.iter()) {
      if (speech.expiresTick <= authorityTick) ctx.db.world_speech.id.delete(speech.id);
    }
    const collision = createAuthoritySurvivalCollisionMap([...ctx.db.world_resource.iter()], [...ctx.db.world_chest.iter()]);
    const waterCollision = createAuthoritySurvivalCollisionMap([], [], 'water');

    for (const projectile of ctx.db.world_projectile.iter()) {
      if (projectile.expiresTick <= authorityTick) {
        ctx.db.world_projectile.id.delete(projectile.id);
        continue;
      }
      if (projectile.state !== 'flying') continue;
      const from = { x: projectile.x, y: projectile.y };
      const to = { x: projectile.x + projectile.velocityX, y: projectile.y + projectile.velocityY };
      const targets = [];
      for (const player of ctx.db.player_position.iter()) {
        if (player.identity.isEqual(projectile.owner)) continue;
        const online = [
          ...ctx.db.connection_presence_v2.by_identity.filter(player.identity),
        ].length > 0;
        if (!online) continue;
        const bounds = playerHitboxBounds({ x: player.x, y: player.y });
        targets.push({ kind: 'player', id: player.identity.toHexString(), ...bounds });
      }
      for (const npc of ctx.db.world_npc.iter()) {
        if (npc.rider?.isEqual(projectile.owner) === true) continue;
        targets.push({
        kind: 'npc', id: npc.id.toString(),
        left: npc.x - 7 * FIXED_UNITS_PER_PIXEL,
        right: npc.x + 7 * FIXED_UNITS_PER_PIXEL,
        top: npc.y - 15 * FIXED_UNITS_PER_PIXEL,
        bottom: npc.y,
        });
      }
      for (const resource of ctx.db.world_resource.iter()) {
        if (resource.depleted) continue;
        if (!survivalResourceBlocksMovement(resource.kind)) continue;
        targets.push({ kind: 'resource', id: resource.id.toString(), ...survivalResourceObstacle(
          resource.kind,
          resource.tileX,
          resource.tileY,
        ) });
      }
      for (const chest of ctx.db.world_chest.iter()) {
        if (chest.carriedBy !== undefined) continue;
        targets.push({
          kind: 'chest', id: chest.id.toString(),
          left: chest.tileX * TILE_SIZE_FIXED,
          right: (chest.tileX + 1) * TILE_SIZE_FIXED,
          top: chest.tileY * TILE_SIZE_FIXED,
          bottom: (chest.tileY + 1) * TILE_SIZE_FIXED,
        });
      }
      const entityHit = firstProjectileTargetHit(from, to, targets);
      const terrainHit = firstProjectileTerrainHit(from, to, collision);
      const hit = entityHit === null ? terrainHit
        : terrainHit === null || entityHit.fraction <= terrainHit.fraction ? entityHit : terrainHit;
      if (hit !== null) {
        ctx.db.world_projectile.id.update({
          ...projectile,
          x: hit.x,
          y: hit.y,
          chunkX: chunkAt(hit.x),
          chunkY: chunkAt(hit.y),
          state: 'hit',
          hitKind: hit.kind,
          hitId: hit.id,
          expiresTick: authorityTick + 6n,
        });
        continue;
      }
      ctx.db.world_projectile.id.update({
        ...projectile,
        x: to.x,
        y: to.y,
        chunkX: chunkAt(to.x),
        chunkY: chunkAt(to.y),
      });
    }

    for (const row of ctx.db.player_position.iter()) {
      const online = [
        ...ctx.db.connection_presence_v2.by_identity.filter(row.identity),
      ].length > 0;
      if (!online) continue;
      const input = ctx.db.player_input.identity.find(row.identity);
      const mounted = [...ctx.db.world_npc.iter()]
        .some((npc) => npc.rider?.isEqual(row.identity) === true);
      const stale = input === null || inputIsStale(
        input.updatedAtMicros,
        ctx.timestamp.microsSinceUnixEpoch,
      );
      const jumpActive = mounted
        && row.jumpUntilTick !== undefined
        && authorityTick <= row.jumpUntilTick;
      let player: PlayerState = {
        position: { x: row.x, y: row.y },
        facing: parseDirection(row.facing) ?? 'down',
        moving: row.moving,
        location: 'estate',
      };
      const startedX = player.position.x;
      const startedY = player.position.y;
      let lastProcessedSequence = row.lastProcessedSequence;
      if (input !== null && !stale && !jumpActive) {
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
          player = mounted
            ? movePlayerAtSpeed(player, settleDirection, collision, 2)
            : movePlayer(player, settleDirection, collision);
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
      if (input !== null && jumpActive) {
        ctx.db.player_input.identity.update({
          ...input,
          appliedSteps: 0n,
          settleDirection: 'idle',
          settleSteps: 0,
          settledSequence: input.sequence,
          pendingSequence: 0n,
        });
        lastProcessedSequence = input.sequence;
      }
      const moved = player.position.x !== startedX || player.position.y !== startedY;
      const nextActionKind = jumpActive
        ? 'horse_jump'
        : mounted
          ? row.actionKind === 'ranged_weapon' ? row.actionKind : 'none'
          : avatarActionAfterMovement(row.actionKind, moved);
      const clearAction = nextActionKind === 'none' && row.actionKind !== 'none';
      ctx.db.player_position.identity.update({
        ...row,
        x: player.position.x,
        y: player.position.y,
        chunkX: chunkAt(player.position.x),
        chunkY: chunkAt(player.position.y),
        facing: player.facing,
        moving: jumpActive ? false : moved,
        lastProcessedSequence,
        authorityTick,
        actionKind: nextActionKind,
        actionStartedTick: clearAction ? authorityTick : row.actionStartedTick,
        jumpFromX: jumpActive ? row.jumpFromX : undefined,
        jumpFromY: jumpActive ? row.jumpFromY : undefined,
        jumpUntilTick: jumpActive ? row.jumpUntilTick : undefined,
      });
      for (const chest of ctx.db.world_chest.iter()) {
        if (chest.carriedBy?.isEqual(row.identity) !== true) continue;
        const tileX = Math.floor(player.position.x / TILE_SIZE_FIXED);
        const tileY = Math.floor(player.position.y / TILE_SIZE_FIXED);
        const chunkX = Math.floor(tileX / SURVIVAL_CHUNK_TILES); const chunkY = Math.floor(tileY / SURVIVAL_CHUNK_TILES);
        if (chest.tileX !== tileX || chest.tileY !== tileY || chest.chunkX !== chunkX || chest.chunkY !== chunkY) {
          ctx.db.world_chest.id.update({ ...chest, tileX, tileY, chunkX, chunkY });
        }
      }
    }

    const onlineIdentityHex = new Set(
      [...ctx.db.connection_presence_v2.iter()].map((presence) => presence.identity.toHexString()),
    );
    const wildlifePlayerChunks = [...ctx.db.player_position.iter()]
      .filter((player) => onlineIdentityHex.has(player.identity.toHexString()))
      .map((player) => [player.chunkX, player.chunkY] as const);
    const wildlifeProfiles = new Map(
      [...ctx.db.world_wildlife_profile.iter()].map((profile) => [profile.npcId, profile] as const),
    );
    for (const npc of ctx.db.world_npc.iter()) {
      if (npc.rider !== undefined) {
        const rider = ctx.db.player_position.identity.find(npc.rider);
        if (rider === null) {
          ctx.db.world_npc.id.update({
            ...npc,
            rider: undefined,
            moving: false,
            wanderDirection: 'idle',
            nextDecisionTick: authorityTick + 20n,
            authorityTick,
          });
          continue;
        }
        const facing = mountedHorseFacing(
          parseNpcFacing(npc.facing),
          parseDirection(rider.facing) ?? 'down',
          rider.moving,
        );
        ctx.db.world_npc.id.update({
          ...npc,
          x: rider.x,
          y: rider.y,
          chunkX: rider.chunkX,
          chunkY: rider.chunkY,
          facing,
          moving: rider.moving,
          wanderDirection: 'idle',
          authorityTick,
        });
        continue;
      }

      const wildlifeProfile = wildlifeProfiles.get(npc.id);
      if (wildlifeProfile !== undefined && isWildlifeSpecies(wildlifeProfile.species)) {
        if (!wildlifeActivityNearPlayers(npc.chunkX, npc.chunkY, wildlifePlayerChunks)) continue;
        const stepped = stepAmbientWildlife({
          id: npc.id,
          position: { x: npc.x, y: npc.y },
          home: { x: npc.homeX, y: npc.homeY },
          facing: parseNpcFacing(npc.facing),
          moving: npc.moving,
          activity: npc.wanderDirection,
          nextDecisionTick: Number(npc.nextDecisionTick),
        }, {
          species: wildlifeProfile.species,
          seed: wildlifeSeed,
          authorityTick: Number(authorityTick),
          calendarTick,
          collision: wildlifeMovementMedium(wildlifeProfile.species) === 'water' ? waterCollision : collision,
        });
        const nextChunkX = chunkAt(stepped.position.x);
        const nextChunkY = chunkAt(stepped.position.y);
        if (stepped.position.x === npc.x && stepped.position.y === npc.y
          && stepped.facing === npc.facing && stepped.moving === npc.moving
          && stepped.activity === npc.wanderDirection
          && BigInt(stepped.nextDecisionTick) === npc.nextDecisionTick) continue;
        ctx.db.world_npc.id.update({
          ...npc,
          x: stepped.position.x,
          y: stepped.position.y,
          chunkX: nextChunkX,
          chunkY: nextChunkY,
          facing: stepped.facing,
          moving: stepped.moving,
          wanderDirection: stepped.activity,
          nextDecisionTick: BigInt(stepped.nextDecisionTick),
          authorityTick,
        });
        continue;
      }

      const stepped = stepWanderingNpc({
        id: npc.id,
        position: { x: npc.x, y: npc.y },
        home: { x: npc.homeX, y: npc.homeY },
        facing: parseNpcFacing(npc.facing),
        moving: npc.moving,
        wanderDirection: npcDirection(npc.wanderDirection),
        nextDecisionTick: Number(npc.nextDecisionTick),
      }, Number(authorityTick), collision);
      ctx.db.world_npc.id.update({
        ...npc,
        x: stepped.position.x,
        y: stepped.position.y,
        chunkX: chunkAt(stepped.position.x),
        chunkY: chunkAt(stepped.position.y),
        facing: stepped.facing,
        moving: stepped.moving,
        wanderDirection: stepped.wanderDirection ?? 'idle',
        nextDecisionTick: BigInt(stepped.nextDecisionTick),
        authorityTick,
      });
    }
  },
);
