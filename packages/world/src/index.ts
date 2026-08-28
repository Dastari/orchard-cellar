import {
  AUTHORITY_TICKS_PER_DAY,
  AUTHORITY_HZ,
  AUTHORITY_TICK_MICROS,
  CROP_WATERING_TICKS,
  BRONZE_PER_GOLD,
  BACKPACK_SLOT_COUNT,
  BACKPACK_SLOT_OFFSET,
  BASE_BACKPACK_CAPACITY,
  CRAFTING_SLOT_COUNT,
  EQUIPMENT_SLOT_COUNT,
  EQUIPMENT_SLOT_OFFSET,
  CHEST_INTERACTION_REACH_FIXED,
  CHEST_STORAGE_CAPACITY,
  BASE_ATTRIBUTES,
  EFFECT_KINDS,
  REGEN_SWEEP_TICKS,
  ARCHERY_TARGET_MAX_HEALTH_CENTI,
  ARCHERY_TARGET_REGEN_CENTI_PER_SECOND,
  ARCHERY_TARGET_REGEN_INTERVAL_TICKS,
  ANVIL_REPAIR_COST_BRONZE,
  BOW_BASE_DAMAGE_CENTI,
  ITEM_DESPAWN_TICKS,
  CRAFTING_STATION_REACH_TILES,
  DAYS_PER_SEASON,
  FIXED_UNITS_PER_PIXEL,
  HOTBAR_SLOT_COUNT,
  INVENTORY_SLOT_COUNT,
  MARLOW_CAMP,
  MARLOW_CAMPFIRE_ID,
  MARLOW_CAMPFIRE_TILE,
  NPC_INTERACTION_REACH_FIXED,
  STARTER_HORSE_ID,
  STARTER_HORSE_NAME,
  SURVIVAL_CHUNK_TILES,
  SURVIVAL_ISLAND_OFFSET_TILES,
  SURVIVAL_WORLD_SEED,
  SURVIVAL_WORLD_VERSION,
  TILE_SIZE_FIXED,
  DEBUG_SPACE_ID,
  MARLOW_TENT_SPACE_ID,
  TOPSIDE_SPACE_ID,
  FIRST_HOMESTEAD_SPACE_ID,
  HOMESTEAD_ENTRY_TILE,
  HOMESTEAD_EXIT_TILE,
  HOMESTEAD_TENT_TILE,
  HOMESTEAD_GATE_TILE,
  HOMESTEAD_PLOT_MIN_TILE,
  HOMESTEAD_PLOT_MAX_TILE,
  RESIDENCE_ENTRY_TILE,
  RESIDENCE_EXIT_TILE,
  RESIDENCE_TRAPDOOR_TILE,
  CELLAR_ENTRY_TILE,
  CELLAR_EXIT_TILE,
  interiorFurnitureBlockingTiles,
  instanceSpaceRowFor,
  homesteadTentFootprint,
  homesteadMarkerPlacementTiles,
  homesteadBoundaryTiles,
  homesteadPlayableTile,
  cellarPlayableTile,
  avatarActionAfterMovement,
  avatarActionForEquippedKind,
  generateSurvivalResources,
  findSurvivalSpawnTile,
  generateSurvivalWildlife,
  generateSurvivalWildlifeHives,
  hiveProducesHoneyAtTick,
  insertItemStack,
  insertItemStackPartial,
  fiberDropsFromTilling,
  craftingStationWithinReach,
  cropDefinition,
  cropDefinitionForSeed,
  cropGrowthAt,
  itemDefinition,
  inventoryContainerSlotCount,
  inventoryContainerSlotOffset,
  isHotbarSlot,
  itemStacksCompatible,
  placeableDefinition,
  recipeDefinition,
  recipeIngredientStacks,
  itemModifiers,
  planMerchantPurchase,
  planMerchantSale,
  MAX_MERCHANT_CART_LINES,
  type MerchantCartLine,
  isDurableToolKind,
  isSwitchableLightKind,
  maxStackFor,
  modifiersForEffects,
  nearestTileTarget,
  normalizeToolDurability,
  findHorseDismountPosition,
  findHorseJumpLanding,
  generatePlayerAppearance,
  isPlayerAppearanceSelection,
  isSkillTrack,
  skillNodeDefinition,
  skillPurchaseRejection,
  skillRespecCostBronze,
  HORSE_JUMP_DURATION_TICKS,
  isHorseWithinMountReach,
  isWildlifeSpecies,
  isWindDirectionMode,
  isWeatherMode,
  rainForWeatherMode,
  consumeCraftingRecipe,
  clickContainerSlot,
  quickCraftCursorStack,
  pickupAllToCursor,
  distributeItemStack,
  matchingRecipeId,
  moveItemStacks,
  quickMoveItemStack,
  quickMoveAllMatchingStacks,
  sortAndStackContainer,
  movePlayer,
  movePlayerAtSpeed,
  movePlayerAtSpeedPermille,
  mountedHorseFacing,
  BOW_MAX_CHARGE_MS,
  BOW_MAX_TARGET_RANGE_PIXELS,
  RECOVERABLE_ARROW_LIFETIME_TICKS,
  bowChargedRangePixels,
  bowChargeScaledDamageCenti,
  bowChargeVigourCostCenti,
  bowProjectileOrigin,
  bowShotForTarget,
  boundsOverlap,
  directionFromAim,
  firstProjectileTerrainHit,
  isRecoverableArrow,
  normalizedBowAim,
  projectileTargetAtLanding,
  recoverableArrowAngle,
  playerHitboxBounds,
  positionCollides,
  tileTargetBounds,
  tileTargetWithinFixedReach,
  isGatherableResourceKind,
  isBreakableRockKind,
  isAxeHarvestableResourceKind,
  isChoppableTreeKind,
  isMineableOreKind,
  survivalGatherableDrop,
  survivalResourceBlocksMovement,
  survivalResourceObstacle,
  survivalResourceDropsAfterHit,
  survivalResourceInitialHealth,
  cellarOreKindAt,
  cellarOreResourceId,
  cellarWallHitsRequired,
  cellarWallStoneQuantity,
  CELLAR_SIZE_TILES,
  CELLAR_WALL_TOOL_WEAR,
  TREE_GROWTH_STAGE_BIG,
  TREE_REGROWTH_PROGRESS_MAX,
  TREE_REGROWTH_SWEEP_TICKS,
  normalizeTreeGrowthStage,
  treeGrowthStageForProgress,
  treeHealthForGrowthStage,
  treeRegrowthProgressAtSweep,
  TOOL_VIGOUR_BALANCE,
  advanceVitals,
  createFullVitalState,
  repairTool,
  refreshEffect,
  resolveCreatureStats,
  resolveCombatDamage,
  regeneratedCombatTargetHealth,
  resolveModifierTarget,
  resolveStats,
  resolveSprintAbility,
  sprintVigourCostForSteps,
  forageFindBonus,
  playerStatisticDefinition,
  statisticMilestonesCrossed,
  statisticSubjectIsValid,
  statisticValueAfter,
  toolDurabilityDefinition,
  wearTool,
  normalizeCharacterName,
  TOOL_MERCHANT_DIALOGUE,
  dialogueChoice,
  dialogueDefinition,
  MARLOW_BOOK_QUEST_ID,
  questAcceptBaselines,
  questDefinition,
  questIsComplete,
  questLocationContains,
  npcFacingTowardPoint,
  stepWanderingNpc,
  stepNpcTowardPoint,
  marlowCampfireShouldBeLit,
  stepAmbientWildlife,
  survivalSpawnPosition,
  wildlifeActivityNearPlayers,
  wildlifeMovementMedium,
  wildlifePosition,
  spaceDefinitionFor,
  WILDLIFE_FIRST_NPC_ID,
  WILDLIFE_GENERATION_VERSION,
  type GeneratedWildlife,
  type GeneratedWildlifeHive,
  type Direction,
  type ContainerSnapshot,
  type ItemStack,
  type EffectKind,
  type Modifier,
  type NpcFacing,
  type PlayerState,
  type PlayerStatisticKind,
  type QuestDefinition,
  type QuestProgressSource,
  type SkillTrack,
  type VitalState,
  type VitalsToolKind,
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
  createAuthoritySpaceCollisionMap,
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
  tilePlacementResult,
  nextActionStartedTick,
  presenceLeaseExpired,
  portalUseResult,
  resourceHarvestResult,
  toolSpendResult,
  resourceGatherResult,
  settleMovementRun,
} from './world-rules.js';
import {
  AUDIT_TRIM_CADENCE_TICKS,
  connectionAuditExpired,
  emptyTickUpdateCounters,
  recordTickRowTouch,
  updateRowWhenChanged,
  worldItemExpired,
} from './scalability.js';
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
  BALANCE_LEADERBOARD_LIMIT,
  CHAT_CHANNEL_HISTORY_LIMIT,
  CHAT_SEND_COOLDOWN_MICROS,
  DEFAULT_MESSAGE_OF_DAY,
  GENERAL_CHAT_CHANNEL_ID,
  GENERAL_CHAT_CHANNEL_SLUG,
  SESSION_CHAT_NOTICE_LIMIT,
  balanceLeaderboardMessage,
  canJoinChatChannel,
  channelConversationKey,
  chatMembershipId,
  isLegacyPersistentLifecycleMessage,
  lastConnectionEventMessage,
  normalizeChatChannelName,
  normalizeChatMessage,
  normalizeMessageOfDay,
  recentConnectionEvents,
  topBalanceLeaderboard,
  validCreatableChatChannelKind,
  whisperConversationKey,
  worldDisconnectMessage,
  worldEntryMessage,
} from './chat-policy.js';

const STARTER_HOTBAR_ITEMS = ['axe', 'pickaxe', 'hoe', 'watering_can', 'bow', 'arrow'] as const;
const STARTER_ITEM_QUANTITIES: Readonly<Record<string, number>> = { arrow: 32 };
const DEFAULT_BACKPACK_CAPACITY = BASE_BACKPACK_CAPACITY;
/** Persistent layout history. Add the outgoing shared count before changing
 * HOTBAR_SLOT_COUNT again so existing global inventory slots shift atomically. */
const HOTBAR_LAYOUT_SLOT_COUNTS = [9, HOTBAR_SLOT_COUNT] as const;
const CURRENT_HOTBAR_LAYOUT_VERSION = HOTBAR_LAYOUT_SLOT_COUNTS.length - 1;

function hotbarSlotCountForLayoutVersion(version: number): number {
  const bounded = Math.max(0, Math.min(CURRENT_HOTBAR_LAYOUT_VERSION, Math.floor(version)));
  return HOTBAR_LAYOUT_SLOT_COUNTS[bounded] ?? HOTBAR_SLOT_COUNT;
}
const TOOL_MERCHANT_ID = 2n;
const STARTING_CURRENCY_BRONZE = BRONZE_PER_GOLD;
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
const DEBUG_PORTAL_TOPSIDE_TILE = { x: SURVIVAL_ISLAND_OFFSET_TILES + 20, y: SURVIVAL_ISLAND_OFFSET_TILES + 20 } as const;
const DEBUG_PORTAL_INTERIOR_TILE = { x: 4, y: 4 } as const;
const DEBUG_PORTAL_TOPSIDE_ID = 4_294_967_000;
const DEBUG_PORTAL_INTERIOR_ID = 4_294_967_001;
const MARLOW_TENT_PORTAL_TOPSIDE_ID = 4_294_966_900;
const MARLOW_TENT_PORTAL_INTERIOR_ID = 4_294_966_901;
const MARLOW_TENT_SURFACE_ID = 4_000_000_100n;
const MARLOW_TENT_TILE = { tileX: MARLOW_CAMP.centerTileX - 4, tileY: MARLOW_CAMP.centerTileY + 1 } as const;
const MARLOW_TENT_TABLE_TILE = { tileX: 10, tileY: 6 } as const;
const ARCHERY_TARGET_KIND = 'archery_target';
const ARCHERY_TARGET_EMBEDDED_ARROW_TICKS = BigInt(RECOVERABLE_ARROW_LIFETIME_TICKS);
const ARCHERY_TARGET_SPAWNS = [
  { id: 4_294_966_900n, tileX: 342, tileY: 376 },
  { id: 4_294_966_901n, tileX: 346, tileY: 376 },
  { id: 4_294_966_902n, tileX: 350, tileY: 376 },
] as const;

type InventoryContainerId = 'hotbar' | 'backpack' | 'equipment' | 'crafting';

function inventorySlotOffset(containerId: InventoryContainerId): number {
  return inventoryContainerSlotOffset(containerId);
}

function inventoryContainerCapacity(containerId: InventoryContainerId): number {
  return inventoryContainerSlotCount(containerId);
}

function accessibleInventoryContainerCapacity(containerId: InventoryContainerId, hasBackpack: boolean, debugBackpackSlots = 0): number {
  if (containerId !== 'backpack') return inventoryContainerCapacity(containerId);
  const normalCapacity = hasBackpack ? inventoryContainerCapacity(containerId) : DEFAULT_BACKPACK_CAPACITY;
  return Math.max(normalCapacity, Math.min(inventoryContainerCapacity(containerId), debugBackpackSlots));
}

function playerDebugBackpackSlots(ctx: WorldReducerContext, identity: WorldReducerContext['sender']): number {
  return ctx.db.player_survival.identity.find(identity)?.debugBackpackSlots ?? 0;
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
  return tileTargetWithinFixedReach(playerX, playerY, chest, CHEST_INTERACTION_REACH_FIXED);
}

function npcWithinInteractionReach(
  player: { readonly x: number; readonly y: number },
  npc: { readonly x: number; readonly y: number },
): boolean {
  const dx = npc.x - player.x;
  const dy = npc.y - player.y;
  return dx * dx + dy * dy <= (3 * TILE_SIZE_FIXED) ** 2;
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
      { accessor: 'by_chunk', algorithm: 'btree', columns: ['spaceId', 'chunkX', 'chunkY'] },
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
    spaceId: t.u16().default(0),
    /** Additive migration: switchable held lights default to on. */
    equippedLit: t.bool().default(true),
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
    /** Append-only migration: whether the current movement run requests Sprint. */
    sprinting: t.bool().default(false),
  },
);

/** Private one-row draw state prevents clients from fabricating bow charge
 * duration and makes each begin token single-use at fire/cancel. */
const bow_charge = table(
  { name: 'bow_charge' },
  {
    identity: t.identity().primaryKey(),
    startedTick: t.u64(),
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
    debugBackpackSlots: t.u16().default(0),
  },
);

/** Additive exact spawn storage supersedes player_survival.spawnSlot's u8 ceiling. */
const player_spawn = table(
  { name: 'player_spawn' },
  {
    identity: t.identity().primaryKey(),
    tileX: t.i16(),
    tileY: t.i16(),
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
    durability: t.u16().default(0),
    lit: t.bool().default(true),
  },
);

/** Durable last-resort custody for items which cannot safely remain in a
 * transient UI and cannot be placed in the normal inventory. Rows are private
 * and automatically drain into the hotbar/backpack whenever capacity opens. */
const inventory_overflow = table(
  {
    name: 'inventory_overflow',
    indexes: [
      { accessor: 'by_identity', algorithm: 'btree', columns: ['identity'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    identity: t.identity(),
    itemKind: t.string(),
    quantity: t.u16(),
    durability: t.u16().default(0),
    lit: t.bool().default(true),
  },
);

/** The carried menu stack is server-owned inventory custody, not client drag
 * state. A missing row means an empty Minecraft-style cursor. */
const inventory_cursor = table(
  { name: 'inventory_cursor' },
  {
    identity: t.identity().primaryKey(),
    itemKind: t.string(),
    quantity: t.u16(),
    durability: t.u16().default(0),
    lit: t.bool().default(true),
  },
);

/** Marks completion of one-time metadata backfills without conflating a real
 * broken tool (durability zero) with a legacy row that predated durability. */
const inventory_migration = table(
  { name: 'inventory_migration' },
  {
    identity: t.identity().primaryKey(),
    durabilityVersion: t.u8(),
    hotbarLayoutVersion: t.u8().default(0),
  },
);

const player_stats = table(
  { name: 'player_stats' },
  {
    identity: t.identity().primaryKey(),
    str: t.u8(), dex: t.u8(), con: t.u8(), int: t.u8(), wis: t.u8(), cha: t.u8(),
    healthCenti: t.u32(), manaCenti: t.u32(), vigourCenti: t.u32(),
    healthRemainder: t.u32(), manaRemainder: t.u32(), vigourRemainder: t.u32(),
    regenTick: t.u64(),
    lastSwingTick: t.u64(),
  },
);

/** Coin balances are character state, never inventory stacks. The canonical
 * balance uses the smallest denomination; clients derive gold/silver/bronze. */
const player_wallet = table(
  { name: 'player_wallet' },
  {
    identity: t.identity().primaryKey(),
    balanceBronze: t.u64(),
  },
);

const player_effect = table(
  {
    name: 'player_effect',
    indexes: [{ accessor: 'by_identity', algorithm: 'btree', columns: ['identity'] }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    identity: t.identity(),
    effectKind: t.string(),
    stacks: t.u8(),
    appliedTick: t.u64(),
    expiresTick: t.u64(),
  },
);

/** One-shot additive backfills must never be inferred forever from a gameplay
 * value such as zero health, which becomes meaningful when combat ships. */
const stats_migration = table(
  { name: 'stats_migration' },
  {
    id: t.u8().primaryKey(),
    creatureHealthVersion: t.u8(),
  },
);

/** Private lifetime counters. The string kind is constrained by the canonical
 * sim registry at every write; subjectKind provides stable per-item/resource
 * breakdowns without adding a database column for every future feature. */
const player_statistic = table(
  {
    name: 'player_statistic',
    indexes: [{ accessor: 'by_identity', algorithm: 'btree', columns: ['identity'] }],
  },
  {
    id: t.string().primaryKey(),
    identity: t.identity(),
    statisticKind: t.string(),
    subjectKind: t.string(),
    value: t.u64(),
    createdTick: t.u64(),
    updatedTick: t.u64(),
  },
);

/** Immutable threshold crossings. These rows let a later journal/achievement
 * UI show when a milestone happened without reconstructing history from a
 * lifetime counter's current value. */
const player_statistic_milestone = table(
  {
    name: 'player_statistic_milestone',
    indexes: [{ accessor: 'by_identity', algorithm: 'btree', columns: ['identity'] }],
  },
  {
    id: t.string().primaryKey(),
    identity: t.identity(),
    statisticKind: t.string(),
    subjectKind: t.string(),
    threshold: t.u64(),
    achievedTick: t.u64(),
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

// Presence notices are copied into each live connection's private session inbox.
// They are intentionally separate from durable channel history and are deleted
// when the recipient connection ends or its presence lease expires.
const session_chat_notice = table(
  {
    name: 'session_chat_notice',
    indexes: [
      { accessor: 'by_recipient_identity', algorithm: 'btree', columns: ['recipientIdentity'] },
      { accessor: 'by_recipient_connection', algorithm: 'btree', columns: ['recipientConnectionId'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    recipientIdentity: t.identity(),
    recipientConnectionId: t.connectionId(),
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

const chat_migration = table(
  { name: 'chat_migration' },
  {
    id: t.u8().primaryKey(),
    sessionNoticesVersion: t.u8(),
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
    spaceId: t.u16().default(0),
  },
);

const world_tree = table(
  {
    name: 'world_tree',
    public: true,
    indexes: [
      { accessor: 'by_chunk', algorithm: 'btree', columns: ['spaceId', 'chunkX', 'chunkY'] },
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
    spaceId: t.u16().default(0),
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

/** Stateful authored fires live separately from generated decoration geometry.
 * This keeps the seeded landmark stable while allowing server-authoritative
 * lighting and a permanent player override of NPC automation. */
const world_campfire_state = table(
  { name: 'world_campfire_state', public: true },
  {
    id: t.u64().primaryKey(),
    tileX: t.i16(),
    tileY: t.i16(),
    spaceId: t.u16().default(0),
    lit: t.bool().default(true),
    manualOverride: t.bool().default(false),
    automatedByNpc: t.option(t.u64()),
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
    mineVersion: t.u16().default(0),
  },
);

const space_portal = table(
  {
    name: 'space_portal',
    public: true,
    indexes: [
      { accessor: 'by_from_space', algorithm: 'btree', columns: ['fromSpace'] },
    ],
  },
  {
    id: t.u32().primaryKey(),
    kind: t.string(),
    fromSpace: t.u16(),
    fromTileX: t.u16(),
    fromTileY: t.u16(),
    toSpace: t.u16(),
    toTileX: t.u16(),
    toTileY: t.u16(),
  },
);

/** One authoritative row owns the overworld marker and its instanced exterior.
 * accessMode is public_demo for the vertical slice; owner/invite authorization
 * is already represented so opening the demo does not require a schema change. */
const homestead = table(
  {
    name: 'homestead',
    public: true,
    indexes: [{ accessor: 'by_owner', algorithm: 'hash', columns: ['owner'] }],
  },
  {
    spaceId: t.u16().primaryKey(), owner: t.identity(), ownerName: t.string(),
    overworldTileX: t.u16(), overworldTileY: t.u16(), sizeTier: t.u8(),
    siteSeed: t.u32(), accessMode: t.string(), establishedTick: t.u64(),
    residenceSpaceId: t.option(t.u16()),
    gateOpen: t.bool().default(false),
  },
);

/** Public, static furniture surfaces. Their contents may still be private;
 * quest_world_item is exposed only through the owning player's view. */
const world_surface = table(
  {
    name: 'world_surface',
    public: true,
    indexes: [{ accessor: 'by_chunk', algorithm: 'btree', columns: ['spaceId', 'chunkX', 'chunkY'] }],
  },
  {
    id: t.u64().primaryKey(), kind: t.string(), tileX: t.i16(), tileY: t.i16(),
    chunkX: t.i16(), chunkY: t.i16(), capacity: t.u8(), spaceId: t.u16(),
  },
);

const player_quest = table(
  { name: 'player_quest', indexes: [{ accessor: 'by_identity', algorithm: 'btree', columns: ['identity'] }] },
  {
    id: t.string().primaryKey(), identity: t.identity(), questId: t.string(), state: t.string(),
    acceptedTick: t.u64(), completedTick: t.option(t.u64()), turnedInTick: t.option(t.u64()), pinned: t.bool(),
  },
);

const player_quest_baseline = table(
  { name: 'player_quest_baseline', indexes: [{ accessor: 'by_identity', algorithm: 'btree', columns: ['identity'] }] },
  {
    id: t.string().primaryKey(), identity: t.identity(), questId: t.string(),
    objectiveId: t.string(), value: t.u64(),
  },
);

const player_skill_track = table(
  { name: 'player_skill_track', indexes: [{ accessor: 'by_identity', algorithm: 'btree', columns: ['identity'] }] },
  {
    id: t.string().primaryKey(), identity: t.identity(), track: t.string(),
    experience: t.u64(), spentPoints: t.u16(),
    bonusPoints: t.u16().default(0), respecCount: t.u16().default(0),
  },
);

const player_skill_node = table(
  { name: 'player_skill_node', indexes: [{ accessor: 'by_identity', algorithm: 'btree', columns: ['identity'] }] },
  {
    id: t.string().primaryKey(), identity: t.identity(), track: t.string(),
    nodeId: t.string(), rank: t.u8(),
  },
);

/** Instanced quest props are not public rows. The owning player subscribes to
 * a view, preventing another client from discovering or spoofing the book. */
const quest_world_item = table(
  { name: 'quest_world_item', indexes: [{ accessor: 'by_identity', algorithm: 'btree', columns: ['identity'] }] },
  {
    id: t.string().primaryKey(), identity: t.identity(), questId: t.string(), objectiveId: t.string(),
    surfaceId: t.u64(), slot: t.u8(), itemKind: t.string(),
  },
);

const player_quest_reach_presence = table(
  { name: 'player_quest_reach_presence', indexes: [{ accessor: 'by_identity', algorithm: 'btree', columns: ['identity'] }] },
  {
    id: t.string().primaryKey(), identity: t.identity(), questId: t.string(), objectiveId: t.string(),
  },
);

const player_quest_flag = table(
  { name: 'player_quest_flag', indexes: [{ accessor: 'by_identity', algorithm: 'btree', columns: ['identity'] }] },
  { id: t.string().primaryKey(), identity: t.identity(), flag: t.string() },
);

const player_thought = table(
  { name: 'player_thought' },
  {
    identity: t.identity().primaryKey(), body: t.string(), tone: t.string(),
    issuedTick: t.u64(), expiresTick: t.u64(),
  },
);

const homestead_guest = table(
  {
    name: 'homestead_guest',
    indexes: [
      { accessor: 'by_space', algorithm: 'btree', columns: ['spaceId'] },
      { accessor: 'by_guest', algorithm: 'btree', columns: ['guest'] },
    ],
  },
  { id: t.string().primaryKey(), spaceId: t.u16(), guest: t.identity(), invitedBy: t.identity() },
);

const homestead_deed_claim = table(
  { name: 'homestead_deed_claim' },
  { identity: t.identity().primaryKey(), purchasedAtTick: t.u64() },
);

/** Sparse authoritative overlay for the 1024-square cellar field. Starter
 * rooms remain generator-owned; this table stores only player excavations. */
const cellar_excavation = table(
  {
    name: 'cellar_excavation',
    public: true,
    indexes: [
      { accessor: 'by_space', algorithm: 'btree', columns: ['spaceId'] },
      { accessor: 'by_chunk', algorithm: 'btree', columns: ['spaceId', 'chunkX', 'chunkY'] },
    ],
  },
  {
    id: t.string().primaryKey(),
    spaceId: t.u16(),
    tileX: t.i16(),
    tileY: t.i16(),
    chunkX: t.i16(),
    chunkY: t.i16(),
    dugAtTick: t.u64(),
  },
);

/** Shared partial damage prevents two players from maintaining divergent wall
 * counters. It is private because terrain changes only after the final hit. */
const cellar_dig_progress = table(
  { name: 'cellar_dig_progress' },
  {
    id: t.string().primaryKey(),
    spaceId: t.u16(),
    tileX: t.i16(),
    tileY: t.i16(),
    hits: t.u8(),
    lastHitTick: t.u64(),
  },
);

const world_resource = table(
  {
    name: 'world_resource',
    public: true,
    indexes: [
      { accessor: 'by_chunk', algorithm: 'btree', columns: ['spaceId', 'chunkX', 'chunkY'] },
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
    spaceId: t.u16().default(0),
    growthStage: t.u8().default(3),
    regrowthProgress: t.u8().default(24),
  },
);

/** Player-authored ground state. Visual edge/corner frames are deliberately
 * not stored: every client derives the blob47 frame from neighbouring rows. */
const world_soil = table(
  {
    name: 'world_soil',
    public: true,
    indexes: [
      { accessor: 'by_chunk', algorithm: 'btree', columns: ['spaceId', 'chunkX', 'chunkY'] },
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
    spaceId: t.u16().default(0),
  },
);

/** One authoritative crop per tilled tile. Progress is settled only at water
 * boundaries and interactions; clients derive the live in-window remainder. */
const world_crop = table(
  {
    name: 'world_crop',
    public: true,
    indexes: [
      { accessor: 'by_chunk', algorithm: 'btree', columns: ['spaceId', 'chunkX', 'chunkY'] },
    ],
  },
  {
    id: t.string().primaryKey(),
    owner: t.identity(),
    cropKind: t.string(),
    tileX: t.i16(),
    tileY: t.i16(),
    chunkX: t.i16(),
    chunkY: t.i16(),
    plantedAtTick: t.u64(),
    growthTicks: t.u64(),
    growthUpdatedAtTick: t.u64(),
    spaceId: t.u16().default(0),
  },
);

const world_item = table(
  {
    name: 'world_item',
    public: true,
    indexes: [
      { accessor: 'by_chunk', algorithm: 'btree', columns: ['spaceId', 'chunkX', 'chunkY'] },
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
    durability: t.u16().default(0),
    spaceId: t.u16().default(0),
    /** Additive migration: switchable dropped lights default to on. */
    lit: t.bool().default(true),
  },
);

/** Server-authoritative arrows are visible to every nearby player. A hit is
 * retained briefly so clients can render the impact without applying damage. */
const world_projectile = table(
  {
    name: 'world_projectile',
    public: true,
    indexes: [
      { accessor: 'by_chunk', algorithm: 'btree', columns: ['spaceId', 'chunkX', 'chunkY'] },
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
    spaceId: t.u16().default(0),
  },
);

/** Charge is authority-only impact metadata. Keeping it off the public,
 * high-frequency projectile row avoids expanding every client update and lets
 * pre-charge projectiles safely fall back to the minimum draw. */
const projectile_charge = table(
  { name: 'projectile_charge' },
  {
    projectileId: t.u64().primaryKey(),
    chargeMs: t.u16(),
  },
);

/** Reusable non-player damageable entity substrate. Training targets are the
 * first kind; hostiles may later use their richer world_npc state while still
 * sharing combat damage and feedback rules. */
const world_combat_target = table(
  {
    name: 'world_combat_target',
    public: true,
    indexes: [
      { accessor: 'by_chunk', algorithm: 'btree', columns: ['spaceId', 'chunkX', 'chunkY'] },
      { accessor: 'by_carrier', algorithm: 'btree', columns: ['carriedBy'] },
    ],
  },
  {
    id: t.u64().primaryKey(),
    kind: t.string(),
    x: t.i32(),
    y: t.i32(),
    chunkX: t.i16(),
    chunkY: t.i16(),
    carriedBy: t.option(t.identity()),
    healthCenti: t.u32(),
    maxHealthCenti: t.u32(),
    regenTick: t.u64(),
    lastDamagedTick: t.u64(),
    spaceId: t.u16().default(0),
    /** Append-only combat-feedback migration. */
    lastHitCritical: t.bool().default(false),
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
      { accessor: 'by_chunk', algorithm: 'btree', columns: ['spaceId', 'chunkX', 'chunkY'] },
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
    spaceId: t.u16().default(0),
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
    durability: t.u16().default(0),
    lit: t.bool().default(true),
  },
);

/** Kept separate from the public spatial chest row so existing worlds can add
 * break progress without rewriting every placed chest. Missing means pristine. */
const world_chest_damage = table(
  { name: 'world_chest_damage' },
  {
    chestId: t.u64().primaryKey(),
    hits: t.u8(),
  },
);

/** Generic authored placement shared by crafting today and build mode next.
 * Chests retain their legacy carry-with-contents authority; every other
 * craftable prop starts space-aware and region-indexed. */
const world_placeable = table(
  {
    name: 'world_placeable',
    public: true,
    indexes: [
      { accessor: 'by_chunk', algorithm: 'btree', columns: ['spaceId', 'chunkX', 'chunkY'] },
      { accessor: 'by_carrier', algorithm: 'btree', columns: ['carriedBy'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    kind: t.string(),
    tileX: t.i16(),
    tileY: t.i16(),
    chunkX: t.i16(),
    chunkY: t.i16(),
    spaceId: t.u16().default(0),
    placedBy: t.identity(),
    facing: t.string(),
    open: t.bool(),
    smeltStartTick: t.option(t.u64()),
    /** Additive migration: switchable placed lights default to on. */
    lit: t.bool().default(true),
    /** Additive migration: existing placeables begin on the ground. */
    carriedBy: t.option(t.identity()).default(undefined),
  },
);

const world_placeable_slot = table(
  {
    name: 'world_placeable_slot',
    indexes: [
      { accessor: 'by_placeable', algorithm: 'btree', columns: ['placeableId'] },
    ],
  },
  {
    id: t.string().primaryKey(),
    placeableId: t.u64(),
    slot: t.u8(),
    itemKind: t.string(),
    quantity: t.u16(),
    durability: t.u16().default(0),
    lit: t.bool().default(true),
  },
);

const active_chest = table(
  { name: 'active_chest' },
  {
    identity: t.identity().primaryKey(),
    chestId: t.u64(),
  },
);

const active_placeable = table(
  {
    name: 'active_placeable',
    indexes: [{ accessor: 'by_placeable', algorithm: 'btree', columns: ['placeableId'] }],
  },
  {
    identity: t.identity().primaryKey(),
    placeableId: t.u64(),
  },
);

const active_dialogue = table(
  {
    name: 'active_dialogue',
    indexes: [{ accessor: 'by_npc', algorithm: 'btree', columns: ['npcId'] }],
  },
  {
    identity: t.identity().primaryKey(),
    npcId: t.u64(),
    dialogueId: t.string(),
    nodeId: t.string(),
  },
);

const world_npc = table(
  {
    name: 'world_npc',
    public: true,
    indexes: [
      { accessor: 'by_chunk', algorithm: 'btree', columns: ['spaceId', 'chunkX', 'chunkY'] },
      { accessor: 'by_rider', algorithm: 'hash', columns: ['rider'] },
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
    health: t.u16().default(0),
    spaceId: t.u16().default(0),
  },
);

/** Static species/appearance metadata is split from the high-frequency NPC row
 * so future health, breeding, and ownership migrations remain additive. */
const world_wildlife_profile = table(
  {
    name: 'world_wildlife_profile',
    public: true,
    indexes: [
      { accessor: 'by_chunk', algorithm: 'btree', columns: ['spaceId', 'chunkX', 'chunkY'] },
    ],
  },
  {
    npcId: t.u64().primaryKey(),
    species: t.string(),
    variant: t.u8(),
    packId: t.u64(),
    habitat: t.string(),
    chunkX: t.i16().default(0),
    chunkY: t.i16().default(0),
    spaceId: t.u16().default(0),
  },
);

/** Low-frequency interaction metadata stays separate from the high-frequency
 * wandering NPC row. This also lets future NPC roles reuse the same AI row. */
const world_merchant = table(
  { name: 'world_merchant', public: true },
  {
    npcId: t.u64().primaryKey(),
    dialogueId: t.string(),
    shopId: t.string(),
  },
);

const world_hive = table(
  {
    name: 'world_hive',
    public: true,
    indexes: [
      { accessor: 'by_chunk', algorithm: 'btree', columns: ['spaceId', 'chunkX', 'chunkY'] },
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
    spaceId: t.u16().default(0),
  },
);

const world_wildlife_generation = table(
  { name: 'world_wildlife_generation' },
  { id: t.u8().primaryKey(), version: t.u16() },
);

const world_scalability_migration = table(
  { name: 'world_scalability_migration' },
  {
    id: t.u8().primaryKey(),
    wildlifeProfileChunkVersion: t.u8(),
    /** One-time repair for the two white horses snapped back to their generated
     * homes by the pre-fix dismount habitat recovery. */
    horseDismountRecoveryVersion: t.u8().default(0),
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
      { accessor: 'by_chunk', algorithm: 'btree', columns: ['spaceId', 'chunkX', 'chunkY'] },
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
    spaceId: t.u16().default(0),
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
  bow_charge,
  private_inventory,
  player_survival,
  player_spawn,
  player_stats,
  player_wallet,
  player_effect,
  stats_migration,
  player_statistic,
  player_statistic_milestone,
  inventory_slot,
  inventory_overflow,
  inventory_cursor,
  inventory_migration,
  connection_presence_v2,
  connection_audit,
  world_motd,
  connection_notice,
  session_chat_notice,
  membership,
  membership_audit,
  world_admin_audit,
  chat_channel,
  chat_channel_member,
  chat_message,
  chat_sender_state,
  chat_migration,
  world_speech,
  world_tree,
  world_clock,
  world_environment,
  world_campfire_state,
  world_wind,
  world_seed,
  space_portal,
  homestead,
  world_surface,
  homestead_guest,
  homestead_deed_claim,
  cellar_excavation,
  cellar_dig_progress,
  player_quest,
  player_quest_baseline,
  player_skill_track,
  player_skill_node,
  quest_world_item,
  player_quest_reach_presence,
  player_quest_flag,
  player_thought,
  world_resource,
  world_soil,
  world_crop,
  world_item,
  world_projectile,
  projectile_charge,
  world_combat_target,
  world_chest,
  world_chest_slot,
  world_chest_damage,
  world_placeable,
  world_placeable_slot,
  active_chest,
  active_placeable,
  active_dialogue,
  world_npc,
  world_wildlife_profile,
  world_merchant,
  world_hive,
  world_wildlife_generation,
  world_scalability_migration,
  farm_parcel,
  crop_patch,
  farm_activity,
  movement_timer,
});

export default spacetimedb;

type WorldReducerContext = Parameters<Parameters<typeof spacetimedb.init>[1]>[0];
type WorldConnectionId = NonNullable<WorldReducerContext['connectionId']>;
type WorldNpcRow = NonNullable<ReturnType<WorldReducerContext['db']['world_npc']['id']['find']>>;
type PlayerPositionRow = NonNullable<ReturnType<WorldReducerContext['db']['player_position']['identity']['find']>>;
type WorldResourceRow = NonNullable<ReturnType<WorldReducerContext['db']['world_resource']['id']['find']>>;
type WorldChestRow = NonNullable<ReturnType<WorldReducerContext['db']['world_chest']['id']['find']>>;
type WorldChestSlotRow = NonNullable<ReturnType<WorldReducerContext['db']['world_chest_slot']['id']['find']>>;
type WorldPlaceableRow = NonNullable<ReturnType<WorldReducerContext['db']['world_placeable']['id']['find']>>;
type WorldItemRow = NonNullable<ReturnType<WorldReducerContext['db']['world_item']['id']['find']>>;
type WorldCombatTargetRow = NonNullable<ReturnType<WorldReducerContext['db']['world_combat_target']['id']['find']>>;

function combatTargetPositionAtTile(tileX: number, tileY: number): { readonly x: number; readonly y: number } {
  return {
    x: tileX * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2,
    y: (tileY + 1) * TILE_SIZE_FIXED,
  };
}

function combatTargetTile(target: Pick<WorldCombatTargetRow, 'x' | 'y'>): { readonly tileX: number; readonly tileY: number } {
  return {
    tileX: Math.floor(target.x / TILE_SIZE_FIXED),
    tileY: Math.floor(target.y / TILE_SIZE_FIXED) - 1,
  };
}

function combatTargetProjectileBounds(target: Pick<WorldCombatTargetRow, 'x' | 'y'>) {
  return {
    left: target.x - 14 * FIXED_UNITS_PER_PIXEL,
    right: target.x + 14 * FIXED_UNITS_PER_PIXEL,
    top: target.y - 29 * FIXED_UNITS_PER_PIXEL,
    bottom: target.y,
  };
}

/** Retains each arrow's exact impact offset when a struck target is carried.
 * Initial impact coordinates are never replaced with a synthetic target anchor. */
function moveEmbeddedArrowsWithTarget(
  ctx: WorldReducerContext,
  target: Pick<WorldCombatTargetRow, 'id' | 'x' | 'y' | 'spaceId'>,
  nextX: number,
  nextY: number,
  nextSpaceId: number,
): void {
  const deltaX = nextX - target.x;
  const deltaY = nextY - target.y;
  if (deltaX === 0 && deltaY === 0 && nextSpaceId === target.spaceId) return;
  for (const projectile of ctx.db.world_projectile.by_chunk.filter(target.spaceId)) {
    if (projectile.state !== 'hit' || projectile.hitKind !== 'combat_target'
      || projectile.hitId !== target.id.toString()) continue;
    const x = projectile.x + deltaX;
    const y = projectile.y + deltaY;
    ctx.db.world_projectile.id.update({
      ...projectile,
      x,
      y,
      chunkX: chunkAt(x),
      chunkY: chunkAt(y),
      spaceId: nextSpaceId,
    });
  }
}

function ensureArcheryTargets(ctx: WorldReducerContext): void {
  const authorityTick = ctx.db.world_clock.id.find(0)?.authorityTick ?? 0n;
  for (const spawn of ARCHERY_TARGET_SPAWNS) {
    if (ctx.db.world_combat_target.id.find(spawn.id) !== null) continue;
    const position = combatTargetPositionAtTile(spawn.tileX, spawn.tileY);
    ctx.db.world_combat_target.insert({
      id: spawn.id,
      kind: ARCHERY_TARGET_KIND,
      ...position,
      chunkX: chunkAt(position.x),
      chunkY: chunkAt(position.y),
      carriedBy: undefined,
      healthCenti: ARCHERY_TARGET_MAX_HEALTH_CENTI,
      maxHealthCenti: ARCHERY_TARGET_MAX_HEALTH_CENTI,
      regenTick: authorityTick,
      lastDamagedTick: 0n,
      lastHitCritical: false,
      spaceId: TOPSIDE_SPACE_ID,
    });
  }
}

function regenerateCombatTarget(
  ctx: WorldReducerContext,
  target: WorldCombatTargetRow,
  authorityTick: bigint,
): WorldCombatTargetRow {
  if (target.healthCenti >= target.maxHealthCenti || authorityTick <= target.regenTick) return target;
  const healthCenti = regeneratedCombatTargetHealth(
    target.healthCenti,
    target.maxHealthCenti,
    ARCHERY_TARGET_REGEN_CENTI_PER_SECOND,
    target.regenTick,
    authorityTick,
    AUTHORITY_HZ,
  );
  const next = { ...target, healthCenti, regenTick: authorityTick };
  ctx.db.world_combat_target.id.update(next);
  return next;
}

/** Lazily normalizes chests created under an older capacity. Stacks are first
 * compacted entirely in memory; persistence is changed only after everything
 * is proven to fit, so shrinking a chest can never silently discard contents. */
function ensureChestStorageRows(ctx: WorldReducerContext, chestId: bigint): WorldChestSlotRow[] {
  const rows = [...ctx.db.world_chest_slot.by_chest.filter(chestId)];
  const legacyRows = rows.filter((row) => row.slot >= CHEST_STORAGE_CAPACITY);
  if (legacyRows.length > 0) {
    let compacted: ContainerSnapshot = {
      id: 'chest',
      capacity: CHEST_STORAGE_CAPACITY,
      slots: Array.from({ length: CHEST_STORAGE_CAPACITY }, () => null),
    };
    for (const row of rows
      .filter((candidate) => candidate.itemKind !== 'empty' && candidate.quantity > 0)
      .sort((left, right) => left.slot - right.slot)) {
      const stack = storedStack(row.itemKind, row.quantity, row.durability, row.lit);
      if (stack === null) continue;
      const inserted = insertItemStackPartial(compacted, stack);
      if (!inserted.ok || inserted.remainderQuantity > 0) throw new SenderError('legacy_chest_over_capacity');
      compacted = inserted.container;
    }

    const bySlot = new Map(rows.map((row) => [row.slot, row]));
    const normalizedRows: WorldChestSlotRow[] = [];
    for (let slot = 0; slot < CHEST_STORAGE_CAPACITY; slot += 1) {
      const next = compacted.slots[slot];
      const existing = bySlot.get(slot);
      const values = {
        itemKind: next?.itemKind ?? 'empty',
        quantity: next?.quantity ?? 0,
        durability: storedDurability(next?.itemKind ?? 'empty', next?.durability),
        lit: storedLit(next?.itemKind ?? 'empty', next?.lit),
      };
      normalizedRows.push(existing === undefined
        ? ctx.db.world_chest_slot.insert({ id: `${chestId}:${slot}`, chestId, slot, ...values })
        : ctx.db.world_chest_slot.id.update({ ...existing, ...values }));
    }
    for (const row of legacyRows) ctx.db.world_chest_slot.id.delete(row.id);
    return normalizedRows;
  }

  const occupiedIndexes = new Set(rows.map((row) => row.slot));
  for (let slot = 0; slot < CHEST_STORAGE_CAPACITY; slot += 1) {
    if (occupiedIndexes.has(slot)) continue;
    rows.push(ctx.db.world_chest_slot.insert({
      id: `${chestId}:${slot}`,
      chestId,
      slot,
      itemKind: 'empty',
      quantity: 0,
      durability: 0,
      lit: true,
    }));
  }
  return rows;
}

function migrateSessionChatNotices(ctx: WorldReducerContext): void {
  const migration = ctx.db.chat_migration.id.find(0);
  if ((migration?.sessionNoticesVersion ?? 0) >= 1) return;
  for (const message of ctx.db.chat_message.iter()) {
    if (isLegacyPersistentLifecycleMessage(message.kind)) ctx.db.chat_message.id.delete(message.id);
  }
  const next = { id: 0, sessionNoticesVersion: 1 };
  if (migration === null) ctx.db.chat_migration.insert(next);
  else ctx.db.chat_migration.id.update(next);
}

function deleteSessionChatNoticesForConnection(
  ctx: WorldReducerContext,
  connectionId: WorldConnectionId,
): void {
  for (const notice of ctx.db.session_chat_notice.by_recipient_connection.filter(connectionId)) {
    ctx.db.session_chat_notice.id.delete(notice.id);
  }
}

function insertSessionChatNotice(
  ctx: WorldReducerContext,
  recipientIdentity: WorldReducerContext['sender'],
  recipientConnectionId: WorldConnectionId,
  kind: string,
  body: string,
): void {
  ctx.db.session_chat_notice.insert({
    id: 0n,
    recipientIdentity,
    recipientConnectionId,
    kind,
    body,
    issuedAt: ctx.timestamp,
  });
  const notices = [...ctx.db.session_chat_notice.by_recipient_connection.filter(recipientConnectionId)]
    .sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
  for (const expired of notices.slice(0, Math.max(0, notices.length - SESSION_CHAT_NOTICE_LIMIT))) {
    ctx.db.session_chat_notice.id.delete(expired.id);
  }
}

function broadcastSessionChatNotice(
  ctx: WorldReducerContext,
  kind: 'entry' | 'disconnect',
  body: string,
): void {
  for (const presence of ctx.db.connection_presence_v2.iter()) {
    if (presenceLeaseExpired(
      presence.lastSeenAt.microsSinceUnixEpoch,
      ctx.timestamp.microsSinceUnixEpoch,
    )) continue;
    if (ctx.db.connection_notice.connectionId.find(presence.connectionId) === null) continue;
    insertSessionChatNotice(ctx, presence.identity, presence.connectionId, kind, body);
  }
}

function installDebugPortals(ctx: WorldReducerContext): void {
  if (ctx.db.space_portal.id.find(DEBUG_PORTAL_TOPSIDE_ID) === null) {
    ctx.db.space_portal.insert({
      id: DEBUG_PORTAL_TOPSIDE_ID,
      kind: 'debug_door',
      fromSpace: TOPSIDE_SPACE_ID,
      fromTileX: DEBUG_PORTAL_TOPSIDE_TILE.x,
      fromTileY: DEBUG_PORTAL_TOPSIDE_TILE.y,
      toSpace: DEBUG_SPACE_ID,
      toTileX: DEBUG_PORTAL_INTERIOR_TILE.x,
      toTileY: DEBUG_PORTAL_INTERIOR_TILE.y,
    });
  }
  if (ctx.db.space_portal.id.find(DEBUG_PORTAL_INTERIOR_ID) === null) {
    ctx.db.space_portal.insert({
      id: DEBUG_PORTAL_INTERIOR_ID,
      kind: 'debug_door',
      fromSpace: DEBUG_SPACE_ID,
      fromTileX: DEBUG_PORTAL_INTERIOR_TILE.x,
      fromTileY: DEBUG_PORTAL_INTERIOR_TILE.y,
      toSpace: TOPSIDE_SPACE_ID,
      toTileX: DEBUG_PORTAL_TOPSIDE_TILE.x,
      toTileY: DEBUG_PORTAL_TOPSIDE_TILE.y,
    });
  }
}

function installMarlowTent(ctx: WorldReducerContext): void {
  const portals = [
    {
      id: MARLOW_TENT_PORTAL_TOPSIDE_ID,
      kind: 'marlow_tent_enter',
      fromSpace: TOPSIDE_SPACE_ID,
      fromTileX: MARLOW_TENT_TILE.tileX,
      fromTileY: MARLOW_TENT_TILE.tileY,
      toSpace: MARLOW_TENT_SPACE_ID,
      toTileX: RESIDENCE_ENTRY_TILE.tileX,
      toTileY: RESIDENCE_ENTRY_TILE.tileY,
    },
    {
      id: MARLOW_TENT_PORTAL_INTERIOR_ID,
      kind: 'marlow_tent_exit',
      fromSpace: MARLOW_TENT_SPACE_ID,
      fromTileX: RESIDENCE_EXIT_TILE.tileX,
      fromTileY: RESIDENCE_EXIT_TILE.tileY,
      toSpace: TOPSIDE_SPACE_ID,
      toTileX: MARLOW_TENT_TILE.tileX,
      toTileY: MARLOW_TENT_TILE.tileY + 1,
    },
  ] as const;
  for (const portal of portals) {
    const existing = ctx.db.space_portal.id.find(portal.id);
    if (existing === null) ctx.db.space_portal.insert(portal);
    else ctx.db.space_portal.id.update(portal);
  }
  const surface = {
    id: MARLOW_TENT_SURFACE_ID,
    kind: 'wooden_table',
    tileX: MARLOW_TENT_TABLE_TILE.tileX,
    tileY: MARLOW_TENT_TABLE_TILE.tileY,
    chunkX: Math.floor(MARLOW_TENT_TABLE_TILE.tileX / SURVIVAL_CHUNK_TILES),
    chunkY: Math.floor(MARLOW_TENT_TABLE_TILE.tileY / SURVIVAL_CHUNK_TILES),
    capacity: 4,
    spaceId: MARLOW_TENT_SPACE_ID,
  };
  if (ctx.db.world_surface.id.find(surface.id) === null) ctx.db.world_surface.insert(surface);
  else ctx.db.world_surface.id.update(surface);
}

function teleportPlayer(
  ctx: WorldReducerContext,
  position: PlayerPositionRow,
  spaceId: number,
  nextX: number,
  nextY: number,
): void {
  const authorityTick = ctx.db.world_clock.id.find(0)?.authorityTick ?? position.authorityTick;
  const nextPosition = {
    ...position,
    x: nextX,
    y: nextY,
    spaceId,
    chunkX: chunkAt(nextX),
    chunkY: chunkAt(nextY),
    moving: false,
    authorityTick,
    actionKind: 'none',
    actionStartedTick: authorityTick,
    jumpFromX: undefined,
    jumpFromY: undefined,
    jumpUntilTick: undefined,
  };
  ctx.db.player_position.identity.update(nextPosition);
  const input = ctx.db.player_input.identity.find(position.identity);
  if (input !== null) {
    ctx.db.player_input.identity.update({
      ...input,
      direction: 'idle',
      sprinting: false,
      settleDirection: 'idle',
      settleSteps: 0,
      settledSequence: input.sequence,
      pendingSequence: 0n,
      appliedSteps: 0n,
      updatedAtMicros: ctx.timestamp.microsSinceUnixEpoch,
    });
  }
  for (const chest of ctx.db.world_chest.by_carrier.filter(position.identity)) {
    const tileX = Math.floor(nextX / TILE_SIZE_FIXED);
    const tileY = Math.floor(nextY / TILE_SIZE_FIXED);
    ctx.db.world_chest.id.update({
      ...chest,
      tileX,
      tileY,
      chunkX: chunkAt(nextX),
      chunkY: chunkAt(nextY),
      spaceId,
    });
  }
  for (const target of ctx.db.world_combat_target.by_carrier.filter(position.identity)) {
    moveEmbeddedArrowsWithTarget(ctx, target, nextX, nextY, spaceId);
    ctx.db.world_combat_target.id.update({
      ...target,
      x: nextX,
      y: nextY,
      chunkX: chunkAt(nextX),
      chunkY: chunkAt(nextY),
      spaceId,
    });
  }
  const mount = mountedNpcFor(ctx, position.identity);
  if (mount !== null) {
    updateWorldNpc(ctx, {
      ...mount,
      x: nextX,
      y: nextY,
      homeX: nextX,
      homeY: nextY,
      chunkX: chunkAt(nextX),
      chunkY: chunkAt(nextY),
      spaceId,
      moving: false,
      wanderDirection: 'idle',
      authorityTick,
    });
    const wildlife = ctx.db.world_wildlife_profile.npcId.find(mount.id);
    if (wildlife !== null) ctx.db.world_wildlife_profile.npcId.update({
      ...wildlife,
      chunkX: chunkAt(nextX),
      chunkY: chunkAt(nextY),
      spaceId,
    });
  }
  ctx.db.active_chest.identity.delete(position.identity);
  ctx.db.active_placeable.identity.delete(position.identity);
  ctx.db.active_dialogue.identity.delete(position.identity);
  refreshPlayerQuestLocations(ctx, nextPosition, authorityTick);
}

function usePortalRow(
  ctx: WorldReducerContext,
  position: PlayerPositionRow,
  portal: NonNullable<ReturnType<WorldReducerContext['db']['space_portal']['id']['find']>>,
  requireRange: boolean,
): void {
  const sourceHomestead = homesteadForSpace(ctx, portal.fromSpace);
  const destinationHomestead = homesteadForSpace(ctx, portal.toSpace);
  const source = spaceDefinitionFor(portal.fromSpace, sourceHomestead);
  const destination = spaceDefinitionFor(portal.toSpace, destinationHomestead);
  if (source === undefined || destination === undefined) throw new SenderError('portal_destination_unavailable');
  const mounted = mountedNpcFor(ctx, position.identity) !== null;
  const allowMounted = mounted
    && (source.generator === 'island' || source.generator === 'homestead')
    && (destination.generator === 'island' || destination.generator === 'homestead');
  if (requireRange) {
    const result = portalUseResult(position, portal, mounted, allowMounted);
    if (result !== 'ok') throw new SenderError(result);
  } else if (mounted && !allowMounted) {
    throw new SenderError('no_horses_underground');
  }
  if (destinationHomestead !== null && portal.toSpace === destinationHomestead.spaceId
    && destinationHomestead.owner.toHexString() !== position.identity.toHexString()
    && !destinationHomestead.gateOpen) {
    throw new SenderError('homestead_private');
  }
  if (destinationHomestead !== null && portal.toSpace === destinationHomestead.spaceId) {
    const exitPortal = ctx.db.space_portal.id.find(destinationHomestead.spaceId * 2 + 1);
    if (exitPortal !== null && (exitPortal.fromTileX !== HOMESTEAD_EXIT_TILE.tileX
      || exitPortal.fromTileY !== HOMESTEAD_EXIT_TILE.tileY)) {
      ctx.db.space_portal.id.update({
        ...exitPortal,
        fromTileX: HOMESTEAD_EXIT_TILE.tileX,
        fromTileY: HOMESTEAD_EXIT_TILE.tileY,
      });
    }
  }
  teleportPlayer(
    ctx,
    position,
    portal.toSpace,
    portal.toTileX * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2,
    portal.toTileY * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2,
  );
  if (portal.toSpace === MARLOW_TENT_SPACE_ID) {
    const flag = 'marlow_tent_bigger_inside';
    const flagId = JSON.stringify([position.identity.toHexString(), flag]);
    if (ctx.db.player_quest_flag.id.find(flagId) === null) {
      const authorityTick = ctx.db.world_clock.id.find(0)?.authorityTick ?? position.authorityTick;
      ctx.db.player_quest_flag.insert({ id: flagId, identity: position.identity, flag });
      const thought = {
        identity: position.identity,
        body: 'Hey, it\'s bigger on the inside.',
        tone: 'thought',
        issuedTick: authorityTick,
        expiresTick: authorityTick + BigInt(AUTHORITY_HZ * 6),
      };
      if (ctx.db.player_thought.identity.find(position.identity) === null) ctx.db.player_thought.insert(thought);
      else ctx.db.player_thought.identity.update(thought);
    }
  }
}

function collisionForSpace(ctx: WorldReducerContext, spaceId: number) {
  const placeables = [...ctx.db.world_placeable.by_chunk.filter(spaceId)]
    .filter((row) => row.carriedBy === undefined)
    .map((row) => ({
    tileX: row.tileX,
    tileY: row.tileY,
    blocksMovement: placeableDefinition(row.kind)?.blocksMovement ?? true,
    open: row.open,
  }));
  const collision = createAuthoritySpaceCollisionMap(
    spaceId,
    [...ctx.db.world_resource.by_chunk.filter(spaceId)],
    [...ctx.db.world_chest.by_chunk.filter(spaceId)],
    'ground',
    placeables,
    homesteadForSpace(ctx, spaceId),
    [...ctx.db.cellar_excavation.by_space.filter(spaceId)],
  );
  const homes = spaceId === TOPSIDE_SPACE_ID
    ? [...ctx.db.homestead.iter()]
    : [...ctx.db.homestead.iter()].filter((home) => home.spaceId === spaceId);
  const obstacles = [...(collision.obstacles ?? [])];
  for (const target of ctx.db.world_combat_target.by_chunk.filter(spaceId)) {
    if (target.carriedBy !== undefined) continue;
    const tile = combatTargetTile(target);
    obstacles.push({
      left: tile.tileX * TILE_SIZE_FIXED,
      top: tile.tileY * TILE_SIZE_FIXED,
      right: (tile.tileX + 1) * TILE_SIZE_FIXED - 1,
      bottom: (tile.tileY + 1) * TILE_SIZE_FIXED - 1,
    });
  }
  for (const surface of ctx.db.world_surface.by_chunk.filter(spaceId)) {
    const halfWidth = surface.kind === 'wooden_table' ? 1 : 0;
    obstacles.push({
      left: (surface.tileX - halfWidth) * TILE_SIZE_FIXED,
      top: surface.tileY * TILE_SIZE_FIXED,
      right: (surface.tileX + halfWidth + 1) * TILE_SIZE_FIXED - 1,
      bottom: (surface.tileY + 1) * TILE_SIZE_FIXED - 1,
    });
  }
  const spaceDefinition = spaceDefinitionFor(spaceId, homesteadForSpace(ctx, spaceId));
  for (const tile of interiorFurnitureBlockingTiles(spaceDefinition?.generator ?? 'debug_flat')) {
    obstacles.push({
      left: tile.tileX * TILE_SIZE_FIXED,
      top: tile.tileY * TILE_SIZE_FIXED,
      right: (tile.tileX + 1) * TILE_SIZE_FIXED - 1,
      bottom: (tile.tileY + 1) * TILE_SIZE_FIXED - 1,
    });
  }
  for (const home of homes) {
    const interior = spaceId !== TOPSIDE_SPACE_ID;
    const footprint = homesteadTentFootprint(
      interior ? HOMESTEAD_TENT_TILE.tileX : home.overworldTileX,
      interior ? HOMESTEAD_TENT_TILE.tileY : home.overworldTileY,
      interior,
    );
    obstacles.push({
      left: footprint.minX * TILE_SIZE_FIXED, top: footprint.minY * TILE_SIZE_FIXED,
      right: (footprint.maxX + 1) * TILE_SIZE_FIXED - 1,
      bottom: (footprint.maxY + 1) * TILE_SIZE_FIXED - 1,
    });
  }
  if (spaceId !== TOPSIDE_SPACE_ID && homes.length > 0) {
    for (const tile of homesteadBoundaryTiles()) {
      if (tile.kind === 'gate' && homes[0]?.gateOpen) continue;
      obstacles.push({
        left: tile.tileX * TILE_SIZE_FIXED, top: tile.tileY * TILE_SIZE_FIXED,
        right: (tile.tileX + 1) * TILE_SIZE_FIXED - 1,
        bottom: (tile.tileY + 1) * TILE_SIZE_FIXED - 1,
      });
    }
  }
  return { ...collision, obstacles };
}

function homesteadForOwner(ctx: WorldReducerContext, owner: WorldReducerContext['sender']) {
  return firstIndexRow(ctx.db.homestead.by_owner.filter(owner));
}

function homesteadForSpace(ctx: WorldReducerContext, spaceId: number) {
  return instanceSpaceRowFor(spaceId, ctx.db.homestead.iter()) ?? null;
}

function worldSoilId(spaceId: number, tileX: number, tileY: number): string {
  return spaceId === TOPSIDE_SPACE_ID ? `${tileX}:${tileY}` : `${spaceId}:${tileX}:${tileY}`;
}

function mutableFarmTileAuthorized(
  ctx: WorldReducerContext,
  position: PlayerPositionRow,
  tileX: number,
  tileY: number,
): boolean {
  if (position.spaceId === TOPSIDE_SPACE_ID) return true;
  const home = homesteadForSpace(ctx, position.spaceId);
  return home !== null
    && home.spaceId === position.spaceId
    && home.owner.toHexString() === position.identity.toHexString()
    && homesteadPlayableTile(tileX, tileY);
}

/** Homesteads are private build authorities even while their entrance gate is
 * open. Visitors may enter and leave, but they cannot mutate the owner's
 * terrain, furniture, resources, or storage. */
function requireWorldModificationAuthorized(
  ctx: WorldReducerContext,
  position: PlayerPositionRow,
): void {
  if (position.spaceId === TOPSIDE_SPACE_ID) return;
  const home = homesteadForSpace(ctx, position.spaceId);
  if (home !== null && home.owner.toHexString() === position.identity.toHexString()) return;
  throw new SenderError('homestead_owner_required');
}

function nextResidenceSpacePair(ctx: WorldReducerContext): number {
  for (let spaceId = 30_000; spaceId < DEBUG_SPACE_ID - 1; spaceId += 2) {
    if (spaceDefinitionFor(spaceId) !== undefined || spaceDefinitionFor(spaceId + 1) !== undefined) continue;
    if (homesteadForSpace(ctx, spaceId) === null && homesteadForSpace(ctx, spaceId + 1) === null) return spaceId;
  }
  throw new SenderError('homestead_capacity_reached');
}

const HOMESTEAD_CHILD_PORTAL_BASE = 100_000_000;

function installHomesteadChildSpaces(ctx: WorldReducerContext): void {
  for (const existing of ctx.db.homestead.iter()) {
    let home = existing;
    if (home.residenceSpaceId === undefined) {
      home = { ...home, residenceSpaceId: nextResidenceSpacePair(ctx) };
      ctx.db.homestead.spaceId.update(home);
    }
    const residenceSpaceId = home.residenceSpaceId;
    if (residenceSpaceId === undefined) throw new SenderError('homestead_residence_unavailable');
    const cellarSpaceId = residenceSpaceId + 1;
    const base = HOMESTEAD_CHILD_PORTAL_BASE + home.spaceId * 4;
    const portals = [
      { id: base, kind: `residence_enter:${home.ownerName}`, fromSpace: home.spaceId,
        fromTileX: HOMESTEAD_TENT_TILE.tileX, fromTileY: HOMESTEAD_TENT_TILE.tileY,
        toSpace: residenceSpaceId, toTileX: RESIDENCE_ENTRY_TILE.tileX, toTileY: RESIDENCE_ENTRY_TILE.tileY },
      { id: base + 1, kind: `residence_exit:${home.ownerName}`, fromSpace: residenceSpaceId,
        fromTileX: RESIDENCE_EXIT_TILE.tileX, fromTileY: RESIDENCE_EXIT_TILE.tileY,
        toSpace: home.spaceId, toTileX: HOMESTEAD_TENT_TILE.tileX, toTileY: HOMESTEAD_TENT_TILE.tileY + 1 },
      { id: base + 2, kind: `cellar_enter:${home.ownerName}`, fromSpace: residenceSpaceId,
        fromTileX: RESIDENCE_TRAPDOOR_TILE.tileX, fromTileY: RESIDENCE_TRAPDOOR_TILE.tileY,
        toSpace: cellarSpaceId, toTileX: CELLAR_ENTRY_TILE.tileX, toTileY: CELLAR_ENTRY_TILE.tileY },
      { id: base + 3, kind: `cellar_exit:${home.ownerName}`, fromSpace: cellarSpaceId,
        fromTileX: CELLAR_EXIT_TILE.tileX, fromTileY: CELLAR_EXIT_TILE.tileY,
        toSpace: residenceSpaceId, toTileX: RESIDENCE_TRAPDOOR_TILE.tileX, toTileY: RESIDENCE_TRAPDOOR_TILE.tileY + 1 },
    ] as const;
    for (const portal of portals) {
      if (ctx.db.space_portal.id.find(portal.id) === null) ctx.db.space_portal.insert(portal);
      else ctx.db.space_portal.id.update(portal);
    }
  }
}

function nextHomesteadSpaceId(ctx: WorldReducerContext): number {
  for (let spaceId = FIRST_HOMESTEAD_SPACE_ID; spaceId < DEBUG_SPACE_ID; spaceId += 1) {
    if (homesteadForSpace(ctx, spaceId) === null) return spaceId;
  }
  throw new SenderError('homestead_capacity_reached');
}

function firstIndexRow<T>(rows: Iterable<T>): T | null {
  for (const row of rows) return row;
  return null;
}

function carriedChestFor(
  ctx: WorldReducerContext,
  identity: WorldReducerContext['sender'],
) {
  return firstIndexRow(ctx.db.world_chest.by_carrier.filter(identity));
}

function carriedCombatTargetFor(
  ctx: WorldReducerContext,
  identity: WorldReducerContext['sender'],
) {
  return firstIndexRow(ctx.db.world_combat_target.by_carrier.filter(identity));
}

function carriedPlaceableFor(
  ctx: WorldReducerContext,
  identity: WorldReducerContext['sender'],
) {
  return firstIndexRow(ctx.db.world_placeable.by_carrier.filter(identity));
}

function handsOccupiedFor(
  ctx: WorldReducerContext,
  identity: WorldReducerContext['sender'],
): boolean {
  return carriedChestFor(ctx, identity) !== null
    || carriedCombatTargetFor(ctx, identity) !== null
    || carriedPlaceableFor(ctx, identity) !== null;
}

function mountedNpcFor(
  ctx: WorldReducerContext,
  identity: WorldReducerContext['sender'],
) {
  return firstIndexRow(ctx.db.world_npc.by_rider.filter(identity));
}

function horseAllowedInSpace(ctx: WorldReducerContext, spaceId: number): boolean {
  const definition = spaceDefinitionFor(spaceId, homesteadForSpace(ctx, spaceId));
  return definition?.generator === 'island' || definition?.generator === 'homestead';
}

function updateWorldNpc(ctx: WorldReducerContext, row: WorldNpcRow): void {
  ctx.db.world_npc.id.update(row);
  const profile = ctx.db.world_wildlife_profile.npcId.find(row.id);
  if (profile !== null && (profile.chunkX !== row.chunkX || profile.chunkY !== row.chunkY
    || profile.spaceId !== row.spaceId)) {
    ctx.db.world_wildlife_profile.npcId.update({
      ...profile,
      chunkX: row.chunkX,
      chunkY: row.chunkY,
      spaceId: row.spaceId,
    });
  }
}

const LEGACY_DISMOUNT_HORSE_RECOVERY = [
  { id: STARTER_HORSE_ID, tileX: 334, tileY: 359 },
  { id: BigInt(WILDLIFE_FIRST_NPC_ID + 5), tileX: 335, tileY: 359 },
] as const;

function recoverLegacyDismountHorses(ctx: WorldReducerContext, authorityTick: bigint): void {
  const migration = ctx.db.world_scalability_migration.id.find(0);
  if ((migration?.horseDismountRecoveryVersion ?? 0) >= 1) return;
  let allRecoverable = true;
  for (const recovery of LEGACY_DISMOUNT_HORSE_RECOVERY) {
    const horse = ctx.db.world_npc.id.find(recovery.id);
    if (horse === null || horse.kind !== 'horse') continue;
    if (horse.rider !== undefined) {
      allRecoverable = false;
      continue;
    }
    const x = recovery.tileX * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2;
    const y = recovery.tileY * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2;
    updateWorldNpc(ctx, {
      ...horse,
      x,
      y,
      homeX: x,
      homeY: y,
      chunkX: chunkAt(x),
      chunkY: chunkAt(y),
      spaceId: TOPSIDE_SPACE_ID,
      facing: 'down',
      moving: false,
      wanderDirection: 'rest',
      nextDecisionTick: authorityTick + 60n,
      authorityTick,
    });
  }
  if (!allRecoverable) return;
  const nextMigration = {
    id: 0,
    wildlifeProfileChunkVersion: migration?.wildlifeProfileChunkVersion ?? 1,
    horseDismountRecoveryVersion: 1,
  };
  if (migration === null) ctx.db.world_scalability_migration.insert(nextMigration);
  else ctx.db.world_scalability_migration.id.update(nextMigration);
}

const TICK_TELEMETRY_LOG_TICKS = 20n;
let tickTelemetryTicks = 0;
let tickTelemetryRowsTouched = 0;
let tickTelemetryPlayerPositionUpdates = 0;
let tickTelemetryPlayerPositionNoopSkips = 0;
let tickTelemetryNpcUpdates = 0;
let tickTelemetryNonWildlifeNpcUpdates = 0;
let tickTelemetryNonWildlifeNpcNoopSkips = 0;
let tickTelemetryChestUpdates = 0;
let tickTelemetryItemDeletes = 0;
let tickTelemetryAuditDeletes = 0;
let tickTelemetryObstacleTotal = 0;

function finishTickTelemetry(
  authorityTick: bigint,
  counters: ReturnType<typeof emptyTickUpdateCounters>,
  obstacleCount: number,
): void {
  tickTelemetryTicks += 1;
  tickTelemetryRowsTouched += counters.rowsTouched;
  tickTelemetryPlayerPositionUpdates += counters.playerPositionUpdates;
  tickTelemetryPlayerPositionNoopSkips += counters.playerPositionNoopSkips;
  tickTelemetryNpcUpdates += counters.npcUpdates;
  tickTelemetryNonWildlifeNpcUpdates += counters.nonWildlifeNpcUpdates;
  tickTelemetryNonWildlifeNpcNoopSkips += counters.nonWildlifeNpcNoopSkips;
  tickTelemetryChestUpdates += counters.chestUpdates;
  tickTelemetryItemDeletes += counters.itemDeletes;
  tickTelemetryAuditDeletes += counters.auditDeletes;
  tickTelemetryObstacleTotal += obstacleCount;
  if (authorityTick % TICK_TELEMETRY_LOG_TICKS === 0n) {
    console.info(JSON.stringify({
      event: 'tick_telemetry_1hz',
      ticks: tickTelemetryTicks,
      rowsTouched: tickTelemetryRowsTouched,
      playerPositionUpdates: tickTelemetryPlayerPositionUpdates,
      playerPositionNoopSkips: tickTelemetryPlayerPositionNoopSkips,
      npcUpdates: tickTelemetryNpcUpdates,
      nonWildlifeNpcUpdates: tickTelemetryNonWildlifeNpcUpdates,
      nonWildlifeNpcNoopSkips: tickTelemetryNonWildlifeNpcNoopSkips,
      chestUpdates: tickTelemetryChestUpdates,
      itemDeletes: tickTelemetryItemDeletes,
      auditDeletes: tickTelemetryAuditDeletes,
      averageObstacleCount: tickTelemetryTicks === 0
        ? 0
        : Math.round(tickTelemetryObstacleTotal / tickTelemetryTicks),
      alertThresholdMs: 30,
      timingSpans: ['expiry', 'collision', 'projectiles', 'movement', 'npc'],
    }));
    tickTelemetryTicks = 0;
    tickTelemetryRowsTouched = 0;
    tickTelemetryPlayerPositionUpdates = 0;
    tickTelemetryPlayerPositionNoopSkips = 0;
    tickTelemetryNpcUpdates = 0;
    tickTelemetryNonWildlifeNpcUpdates = 0;
    tickTelemetryNonWildlifeNpcNoopSkips = 0;
    tickTelemetryChestUpdates = 0;
    tickTelemetryItemDeletes = 0;
    tickTelemetryAuditDeletes = 0;
    tickTelemetryObstacleTotal = 0;
  }
  if (authorityTick % TICK_TELEMETRY_LOG_TICKS === 0n) {
    console.timeEnd('step_world.tick');
  }
}

function tickStageTiming(enabled: boolean, stage: string, ending = false): void {
  if (!enabled) return;
  const label = `step_world.${stage}`;
  if (ending) console.timeEnd(label);
  else console.time(label);
}

const STATISTIC_TIME_FLUSH_TICKS = 20n;

function playerStatisticRowId(identityHex: string, kind: PlayerStatisticKind, subjectKind: string): string {
  return JSON.stringify([identityHex, kind, subjectKind]);
}

function playerStatisticMilestoneId(
  identityHex: string,
  kind: PlayerStatisticKind,
  subjectKind: string,
  threshold: bigint,
): string {
  return JSON.stringify([identityHex, kind, subjectKind, threshold.toString()]);
}

/** The only authority write path for lifetime statistics. Keeping this helper
 * typed means a reducer cannot silently create a misspelled permanent key. */
function recordPlayerStatistic(
  ctx: WorldReducerContext,
  identity: WorldReducerContext['sender'],
  kind: PlayerStatisticKind,
  input: bigint,
  authorityTick: bigint,
  subjectKind = '',
): void {
  if (playerStatisticDefinition(kind)?.reserved === true) throw new Error(`reserved_statistic:${kind}`);
  if (!statisticSubjectIsValid(kind, subjectKind)) throw new Error(`invalid_statistic_subject:${kind}`);
  if (input === 0n) return;
  const identityHex = identity.toHexString();
  const id = playerStatisticRowId(identityHex, kind, subjectKind);
  const existing = ctx.db.player_statistic.id.find(id);
  const previous = existing?.value ?? 0n;
  const value = statisticValueAfter(kind, previous, input);
  if (value === previous) return;
  if (existing === null) {
    ctx.db.player_statistic.insert({
      id, identity, statisticKind: kind, subjectKind, value,
      createdTick: authorityTick, updatedTick: authorityTick,
    });
  } else {
    ctx.db.player_statistic.id.update({ ...existing, value, updatedTick: authorityTick });
  }
  for (const threshold of statisticMilestonesCrossed(kind, previous, value)) {
    const milestoneId = playerStatisticMilestoneId(identityHex, kind, subjectKind, threshold);
    if (ctx.db.player_statistic_milestone.id.find(milestoneId) !== null) continue;
    ctx.db.player_statistic_milestone.insert({
      id: milestoneId,
      identity,
      statisticKind: kind,
      subjectKind,
      threshold,
      achievedTick: authorityTick,
    });
  }
  refreshPlayerQuests(ctx, identity, authorityTick);
}

function playerQuestId(identityHex: string, questId: string): string {
  return JSON.stringify([identityHex, questId]);
}

function playerQuestBaselineId(identityHex: string, questId: string, objectiveId: string): string {
  return JSON.stringify([identityHex, questId, objectiveId]);
}

function playerSkillTrackId(identityHex: string, track: string): string {
  return JSON.stringify([identityHex, track]);
}

function playerSkillNodeId(identityHex: string, nodeId: string): string {
  return JSON.stringify([identityHex, nodeId]);
}

function ensurePlayerSkillTrack(
  ctx: WorldReducerContext,
  identity: WorldReducerContext['sender'],
  track: SkillTrack,
) {
  const id = playerSkillTrackId(identity.toHexString(), track);
  const existing = ctx.db.player_skill_track.id.find(id);
  if (existing !== null) return existing;
  return ctx.db.player_skill_track.insert({
    id, identity, track, experience: 0n, spentPoints: 0, bonusPoints: 0, respecCount: 0,
  });
}

function playerSkillRanks(
  ctx: WorldReducerContext,
  identity: WorldReducerContext['sender'],
): Readonly<Record<string, number>> {
  return Object.fromEntries(
    [...ctx.db.player_skill_node.by_identity.filter(identity)].map((row) => [row.nodeId, row.rank]),
  );
}

function questWorldItemId(identityHex: string, questId: string, objectiveId: string): string {
  return JSON.stringify([identityHex, questId, objectiveId]);
}

function questProgressSourceFor(
  ctx: WorldReducerContext,
  identity: WorldReducerContext['sender'],
): QuestProgressSource {
  const statistics = new Map<string, bigint>();
  for (const row of ctx.db.player_statistic.by_identity.filter(identity)) {
    statistics.set(`${row.statisticKind}:${row.subjectKind}`, row.value);
  }
  const itemCounts = new Map<string, number>();
  for (const row of ctx.db.inventory_slot.by_identity.filter(identity)) {
    if (row.itemKind === 'empty' || row.quantity === 0) continue;
    itemCounts.set(row.itemKind, (itemCounts.get(row.itemKind) ?? 0) + row.quantity);
  }
  const cursor = ctx.db.inventory_cursor.identity.find(identity);
  if (cursor !== null && cursor.itemKind !== 'empty' && cursor.quantity > 0) {
    itemCounts.set(cursor.itemKind, (itemCounts.get(cursor.itemKind) ?? 0) + cursor.quantity);
  }
  return {
    statistic: (kind, subject) => statistics.get(`${kind}:${subject}`) ?? 0n,
    itemCount: (itemKind) => itemCounts.get(itemKind) ?? 0,
  };
}

function questBaselinesFor(
  ctx: WorldReducerContext,
  identity: WorldReducerContext['sender'],
  questId: string,
): Readonly<Record<string, bigint>> {
  return Object.fromEntries(
    [...ctx.db.player_quest_baseline.by_identity.filter(identity)]
      .filter((row) => row.questId === questId)
      .map((row) => [row.objectiveId, row.value]),
  );
}

function refreshPlayerQuests(
  ctx: WorldReducerContext,
  identity: WorldReducerContext['sender'],
  authorityTick: bigint,
): void {
  const rows = [...ctx.db.player_quest.by_identity.filter(identity)];
  if (!rows.some((row) => row.state === 'active' || row.state === 'complete')) return;
  const source = questProgressSourceFor(ctx, identity);
  for (const row of rows) {
    if (row.state !== 'active' && row.state !== 'complete') continue;
    const definition = questDefinition(row.questId);
    if (definition === null) continue;
    const complete = questIsComplete(
      definition,
      questBaselinesFor(ctx, identity, row.questId),
      source,
    );
    if (complete && row.state === 'active') {
      ctx.db.player_quest.id.update({ ...row, state: 'complete', completedTick: authorityTick });
    } else if (!complete && row.state === 'complete') {
      ctx.db.player_quest.id.update({ ...row, state: 'active', completedTick: undefined });
    }
  }
}

function refreshSenderQuestsFromInventory(ctx: WorldReducerContext): void {
  refreshPlayerQuests(
    ctx,
    ctx.sender,
    ctx.db.world_clock.id.find(0)?.authorityTick ?? 0n,
  );
}

function acceptQuest(
  ctx: WorldReducerContext,
  definition: QuestDefinition,
  authorityTick: bigint,
): void {
  const identityHex = ctx.sender.toHexString();
  const id = playerQuestId(identityHex, definition.id);
  if (ctx.db.player_quest.id.find(id) !== null) throw new SenderError('quest_not_available');
  const source = questProgressSourceFor(ctx, ctx.sender);
  const baselines = questAcceptBaselines(definition, source);
  ctx.db.player_quest.insert({
    id, identity: ctx.sender, questId: definition.id, state: 'active',
    acceptedTick: authorityTick, completedTick: undefined, turnedInTick: undefined, pinned: true,
  });
  for (const objective of definition.objectives) {
    ctx.db.player_quest_baseline.insert({
      id: playerQuestBaselineId(identityHex, definition.id, objective.id),
      identity: ctx.sender,
      questId: definition.id,
      objectiveId: objective.id,
      value: baselines[objective.id] ?? 0n,
    });
  }
  if (definition.id === MARLOW_BOOK_QUEST_ID) {
    ctx.db.quest_world_item.insert({
      id: questWorldItemId(identityHex, definition.id, 'recover_book'),
      identity: ctx.sender,
      questId: definition.id,
      objectiveId: 'recover_book',
      surfaceId: MARLOW_TENT_SURFACE_ID,
      slot: 0,
      itemKind: 'marlow_book',
    });
  }
  recordPlayerStatistic(ctx, ctx.sender, 'quests_accepted', 1n, authorityTick, definition.id);
}

function grantQuestRewards(
  ctx: WorldReducerContext,
  definition: QuestDefinition,
): void {
  for (const item of definition.rewards.items) {
    if (!insertPlayerCarriedItem(ctx, item.itemKind, item.count)) throw new SenderError('quest_reward_inventory_full');
  }
  const wallet = ctx.db.player_wallet.identity.find(ctx.sender);
  if (wallet === null) throw new SenderError('wallet_not_ready');
  ctx.db.player_wallet.identity.update({ ...wallet, balanceBronze: wallet.balanceBronze + definition.rewards.bronze });
  const identityHex = ctx.sender.toHexString();
  for (const reward of definition.rewards.experience) {
    const id = playerSkillTrackId(identityHex, reward.track);
    const existing = ctx.db.player_skill_track.id.find(id);
    if (existing === null) {
      ctx.db.player_skill_track.insert({
        id, identity: ctx.sender, track: reward.track, experience: reward.amount, spentPoints: 0,
        bonusPoints: 0, respecCount: 0,
      });
    } else {
      ctx.db.player_skill_track.id.update({ ...existing, experience: existing.experience + reward.amount });
    }
  }
}

function turnInQuest(
  ctx: WorldReducerContext,
  definition: QuestDefinition,
  authorityTick: bigint,
): void {
  refreshPlayerQuests(ctx, ctx.sender, authorityTick);
  const id = playerQuestId(ctx.sender.toHexString(), definition.id);
  const row = ctx.db.player_quest.id.find(id);
  if (row === null || row.state !== 'complete') throw new SenderError('quest_objectives_incomplete');
  const source = questProgressSourceFor(ctx, ctx.sender);
  if (!questIsComplete(definition, questBaselinesFor(ctx, ctx.sender, definition.id), source)) {
    throw new SenderError('quest_objectives_incomplete');
  }
  // Deliver objectives are re-derived and consumed inside this transaction.
  // The first shipped quest uses an action item, but later definitions can add
  // collection objectives without trusting a client inventory snapshot.
  for (const objective of definition.objectives) {
    if (objective.kind !== 'collect' || objective.consumeOnTurnIn !== true) continue;
    for (const item of objective.items) removePlayerCarriedItem(ctx, item.itemKind, item.count);
  }
  grantQuestRewards(ctx, definition);
  ctx.db.player_quest.id.update({ ...row, state: 'turned_in', turnedInTick: authorityTick });
  recordPlayerStatistic(ctx, ctx.sender, 'quests_completed', 1n, authorityTick, definition.id);
}

function refreshPlayerQuestLocations(
  ctx: WorldReducerContext,
  position: PlayerPositionRow,
  authorityTick: bigint,
): void {
  const identityHex = position.identity.toHexString();
  for (const row of ctx.db.player_quest.by_identity.filter(position.identity)) {
    if (row.state !== 'active') continue;
    const definition = questDefinition(row.questId);
    if (definition === null) continue;
    for (const objective of definition.objectives) {
      if (objective.kind !== 'location') continue;
      const id = playerQuestBaselineId(identityHex, row.questId, objective.id);
      const present = ctx.db.player_quest_reach_presence.id.find(id);
      const inside = questLocationContains(objective, position);
      if (inside && present === null) {
        ctx.db.player_quest_reach_presence.insert({
          id, identity: position.identity, questId: row.questId, objectiveId: objective.id,
        });
        recordPlayerStatistic(
          ctx, position.identity, 'quest_locations_reached', 1n, authorityTick,
          `${row.questId}:${objective.id}`,
        );
      } else if (!inside && present !== null) ctx.db.player_quest_reach_presence.id.delete(id);
    }
  }
}

/** Reset the online-time anchor without adding offline ticks. */
function beginPlayerStatisticSession(
  ctx: WorldReducerContext,
  identity: WorldReducerContext['sender'],
  authorityTick: bigint,
): void {
  const id = playerStatisticRowId(identity.toHexString(), 'time_played', '');
  const existing = ctx.db.player_statistic.id.find(id);
  if (existing === null) {
    ctx.db.player_statistic.insert({
      id,
      identity,
      statisticKind: 'time_played',
      subjectKind: '',
      value: 0n,
      createdTick: authorityTick,
      updatedTick: authorityTick,
    });
  } else if (existing.updatedTick !== authorityTick) {
    ctx.db.player_statistic.id.update({ ...existing, updatedTick: authorityTick });
  }
}

function flushPlayerStatisticTime(
  ctx: WorldReducerContext,
  identity: WorldReducerContext['sender'],
  authorityTick: bigint,
  force: boolean,
): void {
  const id = playerStatisticRowId(identity.toHexString(), 'time_played', '');
  const existing = ctx.db.player_statistic.id.find(id);
  if (existing === null) {
    beginPlayerStatisticSession(ctx, identity, authorityTick);
    return;
  }
  if (authorityTick <= existing.updatedTick) return;
  const elapsed = authorityTick - existing.updatedTick;
  if (!force && elapsed < STATISTIC_TIME_FLUSH_TICKS) return;
  recordPlayerStatistic(ctx, identity, 'time_played', elapsed, authorityTick);
}

function storedStack(
  itemKind: string,
  quantity: number,
  durability: number,
  lit = true,
): ContainerSnapshot['slots'][number] {
  return itemKind === 'empty' || quantity === 0
    ? null
    : {
        itemKind,
        quantity,
        ...(isDurableToolKind(itemKind) ? { durability } : {}),
        ...(isSwitchableLightKind(itemKind) ? { lit } : {}),
      };
}

function storedDurability(itemKind: string, durability?: number): number {
  return isDurableToolKind(itemKind) ? normalizeToolDurability(itemKind, durability) : 0;
}

function storedLit(itemKind: string, lit?: boolean): boolean {
  return isSwitchableLightKind(itemKind) ? lit ?? true : true;
}

function sameStoredStack(
  left: ContainerSnapshot['slots'][number] | undefined,
  right: ContainerSnapshot['slots'][number] | undefined,
): boolean {
  return left?.itemKind === right?.itemKind
    && left?.quantity === right?.quantity
    && left?.durability === right?.durability
    && left?.lit === right?.lit;
}

const WORLD_ITEM_MERGE_RADIUS_FIXED = 8 * FIXED_UNITS_PER_PIXEL;
const PROJECTILE_HIT_RETENTION_TICKS = 6n;

interface WorldItemDrop {
  readonly itemKind: string;
  readonly quantity: number;
  readonly x: number;
  readonly y: number;
  readonly droppedAtTick: bigint;
  readonly durability: number;
  readonly lit?: boolean;
  readonly spaceId: number;
}

function worldItemExpiredForRow(item: WorldItemRow, authorityTick: bigint): boolean {
  const lifetimeTicks = isRecoverableArrow(item.itemKind, item.durability)
    ? RECOVERABLE_ARROW_LIFETIME_TICKS
    : ITEM_DESPAWN_TICKS;
  return worldItemExpired(item.droppedAtTick, authorityTick, lifetimeTicks);
}

/** Adds a recoverable world stack without proliferating rows at one drop
 * point. Compatible nearby rows fill first, then capped remainder rows are
 * inserted. Durable/non-stackable items intentionally remain distinct. */
function dropWorldItemStack(ctx: WorldReducerContext, drop: WorldItemDrop): void {
  const maximum = maxStackFor(drop.itemKind);
  if (maximum === null || !Number.isSafeInteger(drop.quantity) || drop.quantity <= 0) {
    throw new SenderError('invalid_item_stack');
  }
  let remaining = drop.quantity;
  const lit = storedLit(drop.itemKind, drop.lit);
  // Projectile-landed arrows retain an angle in their otherwise-unused
  // durability column. Keep them as individual timed pickups rather than
  // merging them into an ordinary manually dropped arrow stack.
  if (maximum > 1 && !isRecoverableArrow(drop.itemKind, drop.durability)) {
    const mergeRadiusSquared = WORLD_ITEM_MERGE_RADIUS_FIXED ** 2;
    const compatible = [...ctx.db.world_item.iter()]
      .filter((item) => {
        if (item.spaceId !== drop.spaceId || item.itemKind !== drop.itemKind
          || item.durability !== drop.durability || item.lit !== lit
          || isRecoverableArrow(item.itemKind, item.durability)
          || item.quantity >= maximum) return false;
        const dx = item.x - drop.x;
        const dy = item.y - drop.y;
        return dx * dx + dy * dy <= mergeRadiusSquared;
      })
      .sort((left, right) => {
        const leftDistance = (left.x - drop.x) ** 2 + (left.y - drop.y) ** 2;
        const rightDistance = (right.x - drop.x) ** 2 + (right.y - drop.y) ** 2;
        if (leftDistance !== rightDistance) return leftDistance - rightDistance;
        return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
      });
    for (const item of compatible) {
      const inserted = Math.min(remaining, maximum - item.quantity);
      if (inserted <= 0) continue;
      ctx.db.world_item.id.update({
        ...item,
        quantity: item.quantity + inserted,
        droppedAtTick: drop.droppedAtTick,
      });
      remaining -= inserted;
      if (remaining === 0) return;
    }
  }
  while (remaining > 0) {
    const quantity = Math.min(remaining, maximum);
    ctx.db.world_item.insert({
      id: 0n,
      itemKind: drop.itemKind,
      quantity,
      x: drop.x,
      y: drop.y,
      chunkX: chunkAt(drop.x),
      chunkY: chunkAt(drop.y),
      droppedAtTick: drop.droppedAtTick,
      durability: drop.durability,
      lit,
      spaceId: drop.spaceId,
    });
    remaining -= quantity;
  }
}

function isEffectKind(value: string): value is EffectKind {
  return (EFFECT_KINDS as readonly string[]).includes(value);
}

function isVitalsToolKind(value: string): value is VitalsToolKind {
  return Object.prototype.hasOwnProperty.call(TOOL_VIGOUR_BALANCE, value);
}

function activePlayerModifiers(
  ctx: WorldReducerContext,
  identity: WorldReducerContext['sender'],
  authorityTick: bigint,
): readonly Modifier[] {
  const effects = [...ctx.db.player_effect.by_identity.filter(identity)]
    .filter((effect) => isEffectKind(effect.effectKind))
    .map((effect) => ({
      id: effect.id,
      effectKind: effect.effectKind as EffectKind,
      stacks: effect.stacks,
      appliedTick: effect.appliedTick,
      expiresTick: effect.expiresTick,
    }));
  const equipment = [...ctx.db.inventory_slot.by_identity.filter(identity)]
    .filter((slot) => slot.slot >= EQUIPMENT_SLOT_OFFSET
      && slot.slot < EQUIPMENT_SLOT_OFFSET + EQUIPMENT_SLOT_COUNT
      && slot.itemKind !== 'empty' && slot.quantity > 0)
    .flatMap((slot) => itemModifiers(slot.itemKind).map((modifier) => ({
      ...modifier,
      id: `equipment.${slot.slot}.${modifier.id}`,
      source: 'equipment' as const,
    })));
  return [...equipment, ...modifiersForEffects(effects, authorityTick)];
}

function vitalStateFromRow(row: {
  readonly healthCenti: number; readonly manaCenti: number; readonly vigourCenti: number;
  readonly healthRemainder: number; readonly manaRemainder: number; readonly vigourRemainder: number;
  readonly regenTick: bigint;
}): VitalState {
  return {
    healthCenti: row.healthCenti, manaCenti: row.manaCenti, vigourCenti: row.vigourCenti,
    healthRemainder: row.healthRemainder, manaRemainder: row.manaRemainder,
    vigourRemainder: row.vigourRemainder, regenTick: row.regenTick,
  };
}

function resolvedStatsForRow(
  ctx: WorldReducerContext,
  row: { readonly str: number; readonly dex: number; readonly con: number; readonly int: number; readonly wis: number; readonly cha: number },
  identity: WorldReducerContext['sender'],
  authorityTick: bigint,
) {
  return resolveStats({ str: row.str, dex: row.dex, con: row.con, int: row.int, wis: row.wis, cha: row.cha },
    activePlayerModifiers(ctx, identity, authorityTick));
}

function ensurePlayerStats(
  ctx: WorldReducerContext,
  identity: WorldReducerContext['sender'],
  authorityTick: bigint,
) {
  const existing = ctx.db.player_stats.identity.find(identity);
  if (existing !== null) return existing;
  const resolved = resolveStats(BASE_ATTRIBUTES);
  const vitals = createFullVitalState(resolved, authorityTick);
  return ctx.db.player_stats.insert({
    identity,
    ...BASE_ATTRIBUTES,
    ...vitals,
    lastSwingTick: 0n,
  });
}

function advancePlayerStats(
  ctx: WorldReducerContext,
  identity: WorldReducerContext['sender'],
  authorityTick: bigint,
  suppressVigourRegen = false,
) {
  const row = ensurePlayerStats(ctx, identity, authorityTick);
  const resolved = resolvedStatsForRow(ctx, row, identity, authorityTick);
  const advanced = advanceVitals(
    vitalStateFromRow(row),
    suppressVigourRegen ? { ...resolved, vigourRegenCentiPerSecond: 0 } : resolved,
    authorityTick,
  );
  if (advanced.healthCenti === row.healthCenti && advanced.manaCenti === row.manaCenti
    && advanced.vigourCenti === row.vigourCenti && advanced.healthRemainder === row.healthRemainder
    && advanced.manaRemainder === row.manaRemainder && advanced.vigourRemainder === row.vigourRemainder
    && advanced.regenTick === row.regenTick) return row;
  return ctx.db.player_stats.identity.update({ ...row, ...advanced });
}

function spendToolVigour(
  ctx: WorldReducerContext,
  identity: WorldReducerContext['sender'],
  itemKind: VitalsToolKind,
  authorityTick: bigint,
  whiff: boolean,
  baseCostOverride?: number,
  suppressVigourRegen = false,
): void {
  const row = advancePlayerStats(ctx, identity, authorityTick, suppressVigourRegen);
  const modifiers = activePlayerModifiers(ctx, identity, authorityTick);
  const balance = TOOL_VIGOUR_BALANCE[itemKind];
  const interval = Math.max(1, resolveModifierTarget('swingSpeed', balance.minimumSwingTicks, modifiers));
  const fullCost = resolveModifierTarget(
    'toolVigourCost', baseCostOverride ?? balance.costCenti, modifiers,
  );
  const result = toolSpendResult(
    row.vigourCenti,
    row.lastSwingTick,
    authorityTick,
    fullCost,
    interval,
    whiff,
  );
  if (!result.ok) throw new SenderError(result.code);
  ctx.db.player_stats.identity.update({
    ...row,
    vigourCenti: result.vigourCenti,
    lastSwingTick: result.lastSwingTick,
  });
}

function requireUsableTool<T extends { readonly itemKind: string; readonly durability: number }>(
  slot: T | null,
): asserts slot is T {
  if (slot === null || !isDurableToolKind(slot.itemKind)) throw new SenderError('wrong_tool');
  if (slot.durability === 0) throw new SenderError('tool_broken');
}

function wearInventoryTool(
  ctx: WorldReducerContext,
  slot: {
    readonly id: string;
    readonly identity: WorldReducerContext['sender'];
    readonly itemKind: string;
    readonly durability: number;
  },
  wear = 1,
): void {
  const worn = wearTool(slot.itemKind, slot.durability, wear);
  const row = ctx.db.inventory_slot.id.find(slot.id);
  if (row === null) throw new SenderError('inventory_slot_missing');
  ctx.db.inventory_slot.id.update({ ...row, durability: worn.durability });
  if (worn.broken) {
    recordPlayerStatistic(
      ctx,
      slot.identity,
      'tools_broken',
      1n,
      ctx.db.world_clock.id.find(0)?.authorityTick ?? 0n,
      slot.itemKind,
    );
  }
}

function loadPlayerInventory(ctx: WorldReducerContext, identity: WorldReducerContext['sender']) {
  const rows = [...ctx.db.inventory_slot.by_identity.filter(identity)];
  const rowBySlot = new Map(rows.map((row) => [row.slot, row]));
  const hasBackpack = rows.some((row) => row.itemKind === 'backpack' && row.quantity > 0);
  const make = (id: InventoryContainerId): ContainerSnapshot => {
    const capacity = accessibleInventoryContainerCapacity(id, hasBackpack, playerDebugBackpackSlots(ctx, identity));
    const offset = inventorySlotOffset(id);
    return {
      id,
      capacity,
      slots: Array.from({ length: capacity }, (_, index) => {
        const row = rowBySlot.get(offset + index);
        return row === undefined ? null : storedStack(row.itemKind, row.quantity, row.durability, row.lit);
      }),
      ...(id === 'equipment' ? { restrictions: EQUIPMENT_RESTRICTIONS } : {}),
    };
  };
  return {
    rows,
    rowBySlot,
    containers: {
      hotbar: make('hotbar'),
      backpack: make('backpack'),
      equipment: make('equipment'),
      crafting: make('crafting'),
    },
  };
}

function writePlayerInventory(
  ctx: WorldReducerContext,
  rowBySlot: ReturnType<typeof loadPlayerInventory>['rowBySlot'],
  before: Readonly<Record<string, ContainerSnapshot>>,
  after: Readonly<Record<string, ContainerSnapshot>>,
): void {
  for (const id of ['hotbar', 'backpack', 'equipment', 'crafting'] as const) {
    const previousContainer = before[id];
    const nextContainer = after[id];
    if (previousContainer === undefined || nextContainer === undefined) continue;
    const offset = inventorySlotOffset(id);
    for (let index = 0; index < nextContainer.capacity; index += 1) {
      const previous = previousContainer.slots[index];
      const next = nextContainer.slots[index];
      if (sameStoredStack(previous, next)) continue;
      const row = rowBySlot.get(offset + index);
      if (row === undefined) throw new SenderError('inventory_slot_missing');
      ctx.db.inventory_slot.id.update({
        ...row,
        itemKind: next?.itemKind ?? 'empty',
        quantity: next?.quantity ?? 0,
        durability: storedDurability(next?.itemKind ?? 'empty', next?.durability),
        lit: storedLit(next?.itemKind ?? 'empty', next?.lit),
      });
    }
  }
}

function playerInventoryCursor(
  ctx: WorldReducerContext,
  identity: WorldReducerContext['sender'],
): ItemStack | null {
  const row = ctx.db.inventory_cursor.identity.find(identity);
  return row === null ? null : storedStack(row.itemKind, row.quantity, row.durability, row.lit);
}

function writePlayerInventoryCursor(
  ctx: WorldReducerContext,
  identity: WorldReducerContext['sender'],
  stack: ItemStack | null,
): void {
  const current = ctx.db.inventory_cursor.identity.find(identity);
  if (stack === null) {
    if (current !== null) ctx.db.inventory_cursor.identity.delete(identity);
    return;
  }
  const next = {
    identity,
    itemKind: stack.itemKind,
    quantity: stack.quantity,
    durability: storedDurability(stack.itemKind, stack.durability),
    lit: storedLit(stack.itemKind, stack.lit),
  };
  if (current === null) ctx.db.inventory_cursor.insert(next);
  else ctx.db.inventory_cursor.identity.update({ ...current, ...next });
}

interface OpenMenuInventory {
  readonly inventory: ReturnType<typeof loadPlayerInventory>;
  readonly containers: Readonly<Record<string, ContainerSnapshot>>;
  readonly chest?: {
    readonly container: ContainerSnapshot;
    readonly rowsBySlot: ReadonlyMap<number, ReturnType<typeof ensureChestStorageRows>[number]>;
  };
  readonly placeable?: {
    readonly container: ContainerSnapshot;
    readonly rowsBySlot: ReadonlyMap<number, ReturnType<typeof loadOpenPlaceableRows>[number]>;
  };
}

function loadOpenPlaceableRows(ctx: WorldReducerContext, placeableId: bigint) {
  return [...ctx.db.world_placeable_slot.by_placeable.filter(placeableId)];
}

/** Resolves the complete menu visible to this sender. Private active-menu rows
 * and reach checks prevent a forged container id from accessing remote data. */
function loadOpenMenuInventory(ctx: WorldReducerContext): OpenMenuInventory {
  const inventory = loadPlayerInventory(ctx, ctx.sender);
  const containers: Record<string, ContainerSnapshot> = { ...inventory.containers };
  let chestResult: OpenMenuInventory['chest'];
  const activeChest = ctx.db.active_chest.identity.find(ctx.sender);
  if (activeChest !== null) {
    const chest = ctx.db.world_chest.id.find(activeChest.chestId);
    const position = ctx.db.player_position.identity.find(ctx.sender);
    if (chest !== null && chest.carriedBy === undefined && position !== null
      && chest.spaceId === position.spaceId && chestWithinReach(position.x, position.y, chest)) {
      const rows = ensureChestStorageRows(ctx, chest.id);
      const rowsBySlot = new Map(rows.map((row) => [row.slot, row]));
      const container: ContainerSnapshot = {
        id: 'chest', capacity: CHEST_STORAGE_CAPACITY,
        slots: Array.from({ length: CHEST_STORAGE_CAPACITY }, (_, index) => {
          const row = rowsBySlot.get(index);
          return row === undefined ? null : storedStack(row.itemKind, row.quantity, row.durability, row.lit);
        }),
      };
      containers.chest = container;
      chestResult = { container, rowsBySlot };
    }
  }
  let placeableResult: OpenMenuInventory['placeable'];
  const activePlaceable = ctx.db.active_placeable.identity.find(ctx.sender);
  if (activePlaceable !== null) {
    const placeable = ctx.db.world_placeable.id.find(activePlaceable.placeableId);
    const position = ctx.db.player_position.identity.find(ctx.sender);
    const definition = placeable === null ? null : placeableDefinition(placeable.kind);
    if (placeable !== null && position !== null && placeable.spaceId === position.spaceId
      && chestWithinReach(position.x, position.y, placeable) && definition?.slotCapacity !== undefined) {
      const rows = loadOpenPlaceableRows(ctx, placeable.id);
      const rowsBySlot = new Map(rows.map((row) => [row.slot, row]));
      const container: ContainerSnapshot = {
        id: 'placeable', capacity: definition.slotCapacity,
        slots: Array.from({ length: definition.slotCapacity }, (_, index) => {
          const row = rowsBySlot.get(index);
          return row === undefined ? null : storedStack(row.itemKind, row.quantity, row.durability, row.lit);
        }),
      };
      containers.placeable = container;
      placeableResult = { container, rowsBySlot };
    }
  }
  return {
    inventory, containers,
    ...(chestResult === undefined ? {} : { chest: chestResult }),
    ...(placeableResult === undefined ? {} : { placeable: placeableResult }),
  };
}

function writeOpenMenuInventory(
  ctx: WorldReducerContext,
  menu: OpenMenuInventory,
  containers: Readonly<Record<string, ContainerSnapshot>>,
): void {
  writePlayerInventory(ctx, menu.inventory.rowBySlot, menu.inventory.containers, containers);
  if (menu.chest !== undefined) {
    const after = containers.chest!;
    for (let index = 0; index < after.capacity; index += 1) {
      const previous = menu.chest.container.slots[index];
      const next = after.slots[index];
      if (sameStoredStack(previous, next)) continue;
      const position = ctx.db.player_position.identity.find(ctx.sender);
      if (position === null) throw new SenderError('player_not_ready');
      requireWorldModificationAuthorized(ctx, position);
      const row = menu.chest.rowsBySlot.get(index);
      if (row === undefined) throw new SenderError('chest_slot_missing');
      ctx.db.world_chest_slot.id.update({
        ...row, itemKind: next?.itemKind ?? 'empty', quantity: next?.quantity ?? 0,
        durability: storedDurability(next?.itemKind ?? 'empty', next?.durability),
        lit: storedLit(next?.itemKind ?? 'empty', next?.lit),
      });
    }
  }
  if (menu.placeable !== undefined) {
    const after = containers.placeable!;
    for (let index = 0; index < after.capacity; index += 1) {
      const previous = menu.placeable.container.slots[index];
      const next = after.slots[index];
      if (sameStoredStack(previous, next)) continue;
      const position = ctx.db.player_position.identity.find(ctx.sender);
      if (position === null) throw new SenderError('player_not_ready');
      requireWorldModificationAuthorized(ctx, position);
      const row = menu.placeable.rowsBySlot.get(index);
      if (row === undefined) throw new SenderError('placeable_slot_missing');
      ctx.db.world_placeable_slot.id.update({
        ...row, itemKind: next?.itemKind ?? 'empty', quantity: next?.quantity ?? 0,
        durability: storedDurability(next?.itemKind ?? 'empty', next?.durability),
        lit: storedLit(next?.itemKind ?? 'empty', next?.lit),
      });
    }
  }
  const survival = ctx.db.player_survival.identity.find(ctx.sender);
  const position = ctx.db.player_position.identity.find(ctx.sender);
  if (survival !== null && position !== null) {
    const selected = containers.hotbar!.slots[survival.selectedSlot];
    ctx.db.player_position.identity.update({
      ...position, equippedKind: selected?.itemKind ?? 'empty',
      equippedLit: storedLit(selected?.itemKind ?? 'empty', selected?.lit),
    });
  }
}

function stashOverflow(
  ctx: WorldReducerContext,
  identity: WorldReducerContext['sender'],
  stack: { readonly itemKind: string; readonly quantity: number; readonly durability?: number; readonly lit?: boolean },
): void {
  const maximum = maxStackFor(stack.itemKind);
  if (maximum === null || stack.quantity <= 0) throw new SenderError('invalid_overflow_item');
  let remaining = stack.quantity;
  while (remaining > 0) {
    const quantity = Math.min(remaining, maximum);
    ctx.db.inventory_overflow.insert({
      id: 0n, identity, itemKind: stack.itemKind, quantity,
      durability: storedDurability(stack.itemKind, stack.durability),
      lit: storedLit(stack.itemKind, stack.lit),
    });
    remaining -= quantity;
  }
}

/** Recovery is deterministic and transactional: an overflow row is only
 * changed after its exact moved quantity has been written into player slots. */
function drainPlayerOverflow(ctx: WorldReducerContext, identity: WorldReducerContext['sender']): void {
  const overflowRows = [...ctx.db.inventory_overflow.by_identity.filter(identity)]
    .sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
  if (overflowRows.length === 0) return;
  const inventory = loadPlayerInventory(ctx, identity);
  let containers: Readonly<Record<string, ContainerSnapshot>> = inventory.containers;
  for (const row of overflowRows) {
    const sourceId = `overflow:${row.id}`;
    const moved = quickMoveItemStack({
      ...containers,
      [sourceId]: { id: sourceId, capacity: 1, slots: [{
        itemKind: row.itemKind, quantity: row.quantity,
        ...(isDurableToolKind(row.itemKind) ? { durability: row.durability } : {}),
        ...(isSwitchableLightKind(row.itemKind) ? { lit: row.lit } : {}),
      }] },
    }, { fromContainer: sourceId, fromIndex: 0, toContainers: ['hotbar', 'backpack'] });
    if (!moved.ok) {
      if (moved.code === 'container_full') break;
      throw new SenderError(moved.code);
    }
    containers = {
      hotbar: moved.containers.hotbar!,
      backpack: moved.containers.backpack!,
      equipment: moved.containers.equipment!,
      crafting: moved.containers.crafting!,
    };
    const remainder = moved.containers[sourceId]!.slots[0];
    if (remainder == null) ctx.db.inventory_overflow.id.delete(row.id);
    else ctx.db.inventory_overflow.id.update({
      ...row, quantity: remainder.quantity,
      durability: storedDurability(remainder.itemKind, remainder.durability),
      lit: storedLit(remainder.itemKind, remainder.lit),
    });
  }
  writePlayerInventory(ctx, inventory.rowBySlot, inventory.containers, containers);
  const survival = ctx.db.player_survival.identity.find(identity);
  const position = ctx.db.player_position.identity.find(identity);
  if (survival !== null && position !== null) {
    const selected = containers.hotbar?.slots[survival.selectedSlot];
    if (position.equippedKind !== (selected?.itemKind ?? 'empty')
      || position.equippedLit !== storedLit(selected?.itemKind ?? 'empty', selected?.lit)) {
      ctx.db.player_position.identity.update({ ...position, equippedKind: selected?.itemKind ?? 'empty', equippedLit: storedLit(selected?.itemKind ?? 'empty', selected?.lit) });
    }
  }
}

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
  ctx.db.world_projectile.clear();
  ctx.db.projectile_charge.clear();
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
    updateWorldNpc(ctx, {
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

type GeneratedSurvivalResource = ReturnType<typeof generateSurvivalResources>[number];

function generatedWorldResourceRow(resource: GeneratedSurvivalResource) {
  return {
    id: BigInt(resource.id),
    kind: resource.kind,
    tileX: resource.tileX,
    tileY: resource.tileY,
    chunkX: Math.floor(resource.tileX / SURVIVAL_CHUNK_TILES),
    chunkY: Math.floor(resource.tileY / SURVIVAL_CHUNK_TILES),
    health: survivalResourceInitialHealth(resource.kind),
    depleted: false,
    growthStage: TREE_GROWTH_STAGE_BIG,
    regrowthProgress: TREE_REGROWTH_PROGRESS_MAX,
    spaceId: TOPSIDE_SPACE_ID,
  };
}

/** A terrain version may move generated resources off new contour walls, but
 * unchanged rows retain depletion and regrowth progress. Player inventories,
 * soil, chests, and placeables are never part of this reconciliation. */
function reconcileGeneratedSurvivalResources(ctx: WorldReducerContext): void {
  const desired = new Map(generateSurvivalResources().map((resource) => [BigInt(resource.id), resource]));
  for (const existing of [...ctx.db.world_resource.iter()]) {
    if (existing.spaceId !== TOPSIDE_SPACE_ID) continue;
    const generated = desired.get(existing.id);
    if (generated === undefined) {
      ctx.db.world_resource.id.delete(existing.id);
      continue;
    }
    desired.delete(existing.id);
    const nextBase = generatedWorldResourceRow(generated);
    if (existing.kind !== generated.kind) {
      ctx.db.world_resource.id.update(nextBase);
      continue;
    }
    if (existing.tileX !== generated.tileX || existing.tileY !== generated.tileY
      || existing.chunkX !== nextBase.chunkX || existing.chunkY !== nextBase.chunkY) {
      ctx.db.world_resource.id.update({
        ...existing,
        tileX: generated.tileX,
        tileY: generated.tileY,
        chunkX: nextBase.chunkX,
        chunkY: nextBase.chunkY,
      });
    }
  }
  for (const resource of desired.values()) ctx.db.world_resource.insert(generatedWorldResourceRow(resource));
}

export const ownSurvival = spacetimedb.view(
  { name: 'own_survival', public: true },
  t.option(player_survival.rowType),
  (ctx) => ctx.db.player_survival.identity.find(ctx.sender) ?? undefined,
);

// The 30-second presence lease is the recently-seen grace window. These views
// are the Stage-2 fallback after 2.8.2 RLS accepted publish but rejected the
// appearance join when an ordinary client subscribed.
export const onlinePlayerPublic = spacetimedb.view(
  { name: 'online_player_public', public: true },
  t.array(player_public.rowType),
  (ctx) => [...ctx.db.player_public.iter()].filter((profile) => profile.online),
);

export const onlinePlayerAppearances = spacetimedb.view(
  { name: 'online_player_appearances', public: true },
  t.array(player_appearance.rowType),
  (ctx) => [...ctx.db.player_appearance.iter()].filter((appearance) => (
    ctx.db.player_public.identity.find(appearance.identity)?.online === true
  )),
);

export const ownStats = spacetimedb.view(
  { name: 'own_stats', public: true },
  t.option(player_stats.rowType),
  (ctx) => ctx.db.player_stats.identity.find(ctx.sender) ?? undefined,
);

export const ownWallet = spacetimedb.view(
  { name: 'own_wallet', public: true },
  t.option(player_wallet.rowType),
  (ctx) => ctx.db.player_wallet.identity.find(ctx.sender) ?? undefined,
);

export const ownEffects = spacetimedb.view(
  { name: 'own_effects', public: true },
  t.array(player_effect.rowType),
  (ctx) => {
    const authorityTick = ctx.db.world_clock.id.find(0)?.authorityTick ?? 0n;
    return [...ctx.db.player_effect.by_identity.filter(ctx.sender)]
      .filter((effect) => effect.expiresTick > authorityTick);
  },
);

export const ownPlayerStatistics = spacetimedb.view(
  { name: 'own_player_statistics', public: true },
  t.array(player_statistic.rowType),
  (ctx) => [...ctx.db.player_statistic.by_identity.filter(ctx.sender)],
);

export const ownPlayerStatisticMilestones = spacetimedb.view(
  { name: 'own_player_statistic_milestones', public: true },
  t.array(player_statistic_milestone.rowType),
  (ctx) => [...ctx.db.player_statistic_milestone.by_identity.filter(ctx.sender)],
);

export const ownInventorySlots = spacetimedb.view(
  { name: 'own_inventory_slots', public: true },
  t.array(inventory_slot.rowType),
  (ctx) => [...ctx.db.inventory_slot.by_identity.filter(ctx.sender)],
);

export const ownInventoryCursor = spacetimedb.view(
  { name: 'own_inventory_cursor', public: true },
  t.option(inventory_cursor.rowType),
  (ctx) => ctx.db.inventory_cursor.identity.find(ctx.sender) ?? undefined,
);

export const ownInventoryOverflow = spacetimedb.view(
  { name: 'own_inventory_overflow', public: true },
  t.array(inventory_overflow.rowType),
  (ctx) => [...ctx.db.inventory_overflow.by_identity.filter(ctx.sender)],
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

export const ownActivePlaceable = spacetimedb.view(
  { name: 'own_active_placeable', public: true },
  t.option(world_placeable.rowType),
  (ctx) => {
    const active = ctx.db.active_placeable.identity.find(ctx.sender);
    return active === null ? undefined : ctx.db.world_placeable.id.find(active.placeableId) ?? undefined;
  },
);

export const ownOpenPlaceableSlots = spacetimedb.view(
  { name: 'own_open_placeable_slots', public: true },
  t.array(world_placeable_slot.rowType),
  (ctx) => {
    const active = ctx.db.active_placeable.identity.find(ctx.sender);
    return active === null ? [] : [...ctx.db.world_placeable_slot.by_placeable.filter(active.placeableId)];
  },
);

export const ownActiveDialogue = spacetimedb.view(
  { name: 'own_active_dialogue', public: true },
  t.option(active_dialogue.rowType),
  (ctx) => ctx.db.active_dialogue.identity.find(ctx.sender) ?? undefined,
);

export const ownPlayerQuests = spacetimedb.view(
  { name: 'own_player_quests', public: true },
  t.array(player_quest.rowType),
  (ctx) => [...ctx.db.player_quest.by_identity.filter(ctx.sender)],
);

export const ownPlayerQuestBaselines = spacetimedb.view(
  { name: 'own_player_quest_baselines', public: true },
  t.array(player_quest_baseline.rowType),
  (ctx) => [...ctx.db.player_quest_baseline.by_identity.filter(ctx.sender)],
);

export const ownPlayerSkillTracks = spacetimedb.view(
  { name: 'own_player_skill_tracks', public: true },
  t.array(player_skill_track.rowType),
  (ctx) => [...ctx.db.player_skill_track.by_identity.filter(ctx.sender)],
);

export const ownPlayerSkillNodes = spacetimedb.view(
  { name: 'own_player_skill_nodes', public: true },
  t.array(player_skill_node.rowType),
  (ctx) => [...ctx.db.player_skill_node.by_identity.filter(ctx.sender)],
);

export const ownQuestWorldItems = spacetimedb.view(
  { name: 'own_quest_world_items', public: true },
  t.array(quest_world_item.rowType),
  (ctx) => [...ctx.db.quest_world_item.by_identity.filter(ctx.sender)],
);

export const ownPlayerThought = spacetimedb.view(
  { name: 'own_player_thought', public: true },
  t.option(player_thought.rowType),
  (ctx) => ctx.db.player_thought.identity.find(ctx.sender) ?? undefined,
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

export const ownSessionChatNotices = spacetimedb.view(
  { name: 'own_session_chat_notices', public: true },
  t.array(session_chat_notice.rowType),
  (ctx) => [...ctx.db.session_chat_notice.by_recipient_identity.filter(ctx.sender)],
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
      if (isLegacyPersistentLifecycleMessage(message.kind)) return false;
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
      if (speech.spaceId !== caller.spaceId) return false;
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

const TOOL_MERCHANT_HOME = (() => {
  return {
    x: MARLOW_CAMP.homeTileX * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2,
    y: MARLOW_CAMP.homeTileY * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2,
  };
})();

function toolMerchantRow(authorityTick = 0n) {
  return {
    id: TOOL_MERCHANT_ID,
    kind: 'merchant',
    displayName: 'Marlow',
    x: TOOL_MERCHANT_HOME.x,
    y: TOOL_MERCHANT_HOME.y,
    homeX: TOOL_MERCHANT_HOME.x,
    homeY: TOOL_MERCHANT_HOME.y,
    chunkX: chunkAt(TOOL_MERCHANT_HOME.x),
    chunkY: chunkAt(TOOL_MERCHANT_HOME.y),
    facing: 'down',
    moving: false,
    rider: undefined,
    wanderDirection: 'idle',
    nextDecisionTick: authorityTick + 30n,
    authorityTick,
    health: 100,
    spaceId: TOPSIDE_SPACE_ID,
  };
}

function toolMerchantProfileRow() {
  return { npcId: TOOL_MERCHANT_ID, dialogueId: TOOL_MERCHANT_DIALOGUE.id, shopId: 'general_tools' };
}

function starterHorseRow() {
  const health = Math.ceil(resolveCreatureStats('horse').maxHealthCenti / 100);
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
    health,
    spaceId: TOPSIDE_SPACE_ID,
  };
}

function starterHorseWildlifeProfileRow() {
  return {
    npcId: STARTER_HORSE_ID,
    species: 'horse',
    variant: 0,
    packId: 0n,
    habitat: 'pasture',
    chunkX: chunkAt(STARTER_HORSE_HOME.x),
    chunkY: chunkAt(STARTER_HORSE_HOME.y),
    spaceId: TOPSIDE_SPACE_ID,
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
    health: Math.ceil(resolveCreatureStats(animal.species).maxHealthCenti / 100),
    spaceId: TOPSIDE_SPACE_ID,
  };
}

function generatedWildlifeProfileRow(animal: GeneratedWildlife) {
  const npc = generatedWildlifeNpcRow(animal);
  return {
    npcId: BigInt(animal.id),
    species: animal.species,
    variant: animal.variant,
    packId: BigInt(animal.packId),
    habitat: animal.habitat,
    chunkX: npc.chunkX,
    chunkY: npc.chunkY,
    spaceId: TOPSIDE_SPACE_ID,
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
    spaceId: TOPSIDE_SPACE_ID,
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
  ctx.db.world_campfire_state.insert({
    id: MARLOW_CAMPFIRE_ID,
    tileX: MARLOW_CAMPFIRE_TILE.tileX,
    tileY: MARLOW_CAMPFIRE_TILE.tileY,
    spaceId: TOPSIDE_SPACE_ID,
    lit: true,
    manualOverride: false,
    automatedByNpc: TOOL_MERCHANT_ID,
  });
  ctx.db.world_wind.insert({ id: 0, direction: 'auto' });
  ctx.db.world_seed.insert({ id: 0, seed: SURVIVAL_WORLD_SEED, version: SURVIVAL_WORLD_VERSION, mineVersion: 0 });
  installDebugPortals(ctx);
  installMarlowTent(ctx);
  ensureArcheryTargets(ctx);
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
    ctx.db.world_resource.insert(generatedWorldResourceRow(resource));
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
    spaceId: TOPSIDE_SPACE_ID,
  });
  ctx.db.world_npc.insert(starterHorseRow());
  ctx.db.world_npc.insert(toolMerchantRow());
  ctx.db.world_merchant.insert(toolMerchantProfileRow());
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
  installHomesteadChildSpaces(ctx);
  installMarlowTent(ctx);
  ensureArcheryTargets(ctx);
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
  migrateSessionChatNotices(ctx);
  deleteSessionChatNoticesForConnection(ctx, ctx.connectionId);
  installDebugPortals(ctx);
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
  for (const track of ['combat', 'explorer', 'farming'] as const) {
    ensurePlayerSkillTrack(ctx, ctx.sender, track);
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
    updateWorldNpc(ctx, {
      ...starterHorse,
      displayName: STARTER_HORSE_NAME,
    });
  }
  const toolMerchant = ctx.db.world_npc.id.find(TOOL_MERCHANT_ID);
  if (toolMerchant === null) {
    ctx.db.world_npc.insert(toolMerchantRow(ctx.db.world_clock.id.find(0)?.authorityTick ?? 0n));
  } else if (toolMerchant.homeX !== TOOL_MERCHANT_HOME.x || toolMerchant.homeY !== TOOL_MERCHANT_HOME.y) {
    const camped = toolMerchantRow(ctx.db.world_clock.id.find(0)?.authorityTick ?? toolMerchant.authorityTick);
    updateWorldNpc(ctx, { ...toolMerchant, ...camped });
  }
  if (ctx.db.world_merchant.npcId.find(TOOL_MERCHANT_ID) === null) {
    ctx.db.world_merchant.insert(toolMerchantProfileRow());
  }
  if (ctx.db.world_campfire_state.id.find(MARLOW_CAMPFIRE_ID) === null) {
    ctx.db.world_campfire_state.insert({
      id: MARLOW_CAMPFIRE_ID,
      tileX: MARLOW_CAMPFIRE_TILE.tileX,
      tileY: MARLOW_CAMPFIRE_TILE.tileY,
      spaceId: TOPSIDE_SPACE_ID,
      lit: marlowCampfireShouldBeLit(ctx.db.world_environment.id.find(0)?.calendarTick ?? 0n),
      manualOverride: false,
      automatedByNpc: TOOL_MERCHANT_ID,
    });
  }
  const scalabilityMigration = ctx.db.world_scalability_migration.id.find(0);
  if (scalabilityMigration === null || scalabilityMigration.wildlifeProfileChunkVersion < 1) {
    for (const wildlifeProfile of ctx.db.world_wildlife_profile.iter()) {
      const npc = ctx.db.world_npc.id.find(wildlifeProfile.npcId);
      if (npc === null || (wildlifeProfile.chunkX === npc.chunkX && wildlifeProfile.chunkY === npc.chunkY)) continue;
      ctx.db.world_wildlife_profile.npcId.update({
        ...wildlifeProfile,
        chunkX: npc.chunkX,
        chunkY: npc.chunkY,
      });
    }
    const nextScalabilityMigration = {
      id: 0,
      wildlifeProfileChunkVersion: 1,
      horseDismountRecoveryVersion: scalabilityMigration?.horseDismountRecoveryVersion ?? 0,
    };
    if (scalabilityMigration === null) ctx.db.world_scalability_migration.insert(nextScalabilityMigration);
    else ctx.db.world_scalability_migration.id.update(nextScalabilityMigration);
  }
  if (ctx.db.player_wallet.identity.find(ctx.sender) === null) {
    ctx.db.player_wallet.insert({ identity: ctx.sender, balanceBronze: STARTING_CURRENCY_BRONZE });
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
      ctx.db.crop_patch.clear();
      ctx.db.farm_parcel.clear();
    }
    reconcileGeneratedSurvivalResources(ctx);
    const nextWorld = {
      id: 0,
      seed: SURVIVAL_WORLD_SEED,
      version: SURVIVAL_WORLD_VERSION,
      mineVersion: installedWorld?.mineVersion ?? 0,
    };
    if (installedWorld === null) ctx.db.world_seed.insert(nextWorld);
    else ctx.db.world_seed.id.update(nextWorld);
  }
  const existingPresences = [...ctx.db.connection_presence_v2.by_identity.filter(ctx.sender)];
  const firstLiveConnection = existingPresences
    .every((presence) => presenceLeaseExpired(
      presence.lastSeenAt.microsSinceUnixEpoch,
      ctx.timestamp.microsSinceUnixEpoch,
    ));
  const firstStatisticSession = existingPresences.every((presence) => (
    presenceLeaseExpired(
      presence.lastSeenAt.microsSinceUnixEpoch,
      ctx.timestamp.microsSinceUnixEpoch,
    ) || ctx.db.connection_notice.connectionId.find(presence.connectionId) === null
  ));
  ctx.db.connection_presence_v2.insert({
    connectionId: ctx.connectionId,
    identity: ctx.sender,
    lastSeenAt: ctx.timestamp,
  });
  let survival = ctx.db.player_survival.identity.find(ctx.sender);
  let playerSpawn = ctx.db.player_spawn.identity.find(ctx.sender);
  const enteringSurvivalWorld = survival === null;
  if (survival === null) {
    const occupiedSpawnTiles = new Set<string>();
    for (const resource of ctx.db.world_resource.iter()) {
      if (!resource.depleted) occupiedSpawnTiles.add(`${resource.tileX},${resource.tileY}`);
    }
    for (const chest of ctx.db.world_chest.iter()) {
      if (chest.carriedBy === undefined) occupiedSpawnTiles.add(`${chest.tileX},${chest.tileY}`);
    }
    for (const npc of ctx.db.world_npc.iter()) {
      occupiedSpawnTiles.add(`${Math.floor(npc.x / TILE_SIZE_FIXED)},${Math.floor(npc.y / TILE_SIZE_FIXED)}`);
    }
    for (const row of ctx.db.player_survival.iter()) {
      const storedSpawn = ctx.db.player_spawn.identity.find(row.identity);
      if (storedSpawn !== null) {
        occupiedSpawnTiles.add(`${storedSpawn.tileX},${storedSpawn.tileY}`);
        continue;
      }
      const legacySpawn = survivalSpawnPosition(row.spawnSlot);
      if (legacySpawn !== null) occupiedSpawnTiles.add(
        `${Math.floor(legacySpawn.x / TILE_SIZE_FIXED)},${Math.floor(legacySpawn.y / TILE_SIZE_FIXED)}`,
      );
    }
    const spawnTile = findSurvivalSpawnTile(occupiedSpawnTiles);
    if (spawnTile === null) throw new SenderError('survival_world_full');
    survival = ctx.db.player_survival.insert({
      identity: ctx.sender,
      // Retained for additive compatibility; exact spawn coordinates have no
      // u8/player-count ceiling and are authoritative from this schema version.
      spawnSlot: Number(ctx.db.player_survival.count() % 256n),
      wood: 0,
      stone: 0,
      selectedSlot: 0,
      debugBackpackSlots: 0,
    });
    playerSpawn = ctx.db.player_spawn.insert({
      identity: ctx.sender,
      tileX: spawnTile.tileX,
      tileY: spawnTile.tileY,
    });
    for (let slot = 0; slot < INVENTORY_SLOT_COUNT; slot += 1) {
      const itemKind = STARTER_HOTBAR_ITEMS[slot] ?? 'empty';
      ctx.db.inventory_slot.insert({
        id: `${ctx.sender.toHexString()}:${slot}`,
        identity: ctx.sender,
        slot,
        itemKind,
        quantity: itemKind === 'empty' ? 0 : STARTER_ITEM_QUANTITIES[itemKind] ?? 1,
        durability: storedDurability(itemKind),
        lit: storedLit(itemKind),
      });
    }
  }
  if (playerSpawn === null) {
    const legacySpawn = survivalSpawnPosition(survival.spawnSlot);
    if (legacySpawn === null) throw new SenderError('invalid_spawn_slot');
    playerSpawn = ctx.db.player_spawn.insert({
      identity: ctx.sender,
      tileX: Math.floor(legacySpawn.x / TILE_SIZE_FIXED),
      tileY: Math.floor(legacySpawn.y / TILE_SIZE_FIXED),
    });
  }
  const inventoryMigration = ctx.db.inventory_migration.identity.find(ctx.sender);
  const storedHotbarLayoutVersion = inventoryMigration?.hotbarLayoutVersion ?? 0;
  if (!enteringSurvivalWorld && storedHotbarLayoutVersion < CURRENT_HOTBAR_LAYOUT_VERSION) {
    const previousHotbarSlotCount = hotbarSlotCountForLayoutVersion(storedHotbarLayoutVersion);
    if (previousHotbarSlotCount > HOTBAR_SLOT_COUNT) throw new SenderError('hotbar_layout_shrink_unsupported');
    const addedHotbarSlots = HOTBAR_SLOT_COUNT - previousHotbarSlotCount;
    const shifted = [...ctx.db.inventory_slot.by_identity.filter(ctx.sender)]
      .filter((row) => row.slot >= previousHotbarSlotCount)
      .sort((left, right) => right.slot - left.slot);
    for (const row of shifted) {
      ctx.db.inventory_slot.id.delete(row.id);
      ctx.db.inventory_slot.insert({
        ...row,
        id: `${ctx.sender.toHexString()}:${row.slot + addedHotbarSlots}`,
        slot: row.slot + addedHotbarSlots,
      });
    }
    for (let slot = previousHotbarSlotCount; slot < HOTBAR_SLOT_COUNT; slot += 1) {
      ctx.db.inventory_slot.insert({
        id: `${ctx.sender.toHexString()}:${slot}`, identity: ctx.sender, slot,
        itemKind: 'empty', quantity: 0, durability: 0, lit: true,
      });
    }
    if (inventoryMigration !== null) {
      ctx.db.inventory_migration.identity.update({
        ...inventoryMigration,
        hotbarLayoutVersion: CURRENT_HOTBAR_LAYOUT_VERSION,
      });
    }
  }
  for (let slot = HOTBAR_SLOT_COUNT; slot < INVENTORY_SLOT_COUNT; slot += 1) {
    const id = `${ctx.sender.toHexString()}:${slot}`;
    if (ctx.db.inventory_slot.id.find(id) === null) ctx.db.inventory_slot.insert({
      id,
      identity: ctx.sender,
      slot,
      itemKind: 'empty',
      quantity: 0,
      durability: 0,
      lit: true,
    });
  }
  // Existing characters receive the ranged starter kit only in genuinely
  // empty hotbar cells; no collected item is displaced by an additive publish.
  const currentInventory = [...ctx.db.inventory_slot.by_identity.filter(ctx.sender)];
  for (const [itemKind, quantity] of [['bow', 1], ['arrow', 32]] as const) {
    if (currentInventory.some((row) => row.itemKind === itemKind && row.quantity > 0)) continue;
    const empty = currentInventory
      .filter((row) => row.slot < HOTBAR_SLOT_COUNT && (row.itemKind === 'empty' || row.quantity === 0))
      .sort((left, right) => left.slot - right.slot)[0];
    if (empty === undefined) continue;
    const filled = { ...empty, itemKind, quantity, durability: storedDurability(itemKind) };
    ctx.db.inventory_slot.id.update(filled);
    currentInventory.splice(currentInventory.indexOf(empty), 1, filled);
  }
  if (ctx.db.inventory_migration.identity.find(ctx.sender) === null) {
    for (const row of ctx.db.inventory_slot.by_identity.filter(ctx.sender)) {
      if (!isDurableToolKind(row.itemKind)) continue;
      ctx.db.inventory_slot.id.update({
        ...row,
        durability: normalizeToolDurability(row.itemKind),
      });
    }
    ctx.db.inventory_migration.insert({
      identity: ctx.sender,
      durabilityVersion: 1,
      hotbarLayoutVersion: CURRENT_HOTBAR_LAYOUT_VERSION,
    });
  }
  ensurePlayerStats(ctx, ctx.sender, ctx.db.world_clock.id.find(0)?.authorityTick ?? 0n);
  const spawn = {
    x: playerSpawn.tileX * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2,
    y: playerSpawn.tileY * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2,
  };
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
      equippedKind: STARTER_HOTBAR_ITEMS[0],
      equippedLit: true,
      jumpFromX: undefined,
      jumpFromY: undefined,
      jumpUntilTick: undefined,
      spaceId: TOPSIDE_SPACE_ID,
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
      sprinting: false,
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
        equippedKind: STARTER_HOTBAR_ITEMS[0],
        equippedLit: true,
        jumpFromX: undefined,
        jumpFromY: undefined,
        jumpUntilTick: undefined,
        spaceId: TOPSIDE_SPACE_ID,
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
        spaceId: TOPSIDE_SPACE_ID,
      });
    }
    const connectedPosition = ctx.db.player_position.identity.find(ctx.sender);
    if (connectedPosition !== null) {
      const connectedHomestead = homesteadForSpace(ctx, connectedPosition.spaceId);
      const connectedSpace = spaceDefinitionFor(connectedPosition.spaceId, connectedHomestead);
      const tileX = Math.floor(connectedPosition.x / TILE_SIZE_FIXED);
      const tileY = Math.floor(connectedPosition.y / TILE_SIZE_FIXED);
      // Cellars grew from the early 32×32 technology demo into the centred
      // 1024×1024 dig field. Repair persisted demo coordinates on reconnect.
      if (connectedSpace?.generator === 'cellar' && !cellarTileIsDug(ctx, connectedSpace.spaceId, tileX, tileY)) {
        teleportPlayer(
          ctx,
          connectedPosition,
          connectedPosition.spaceId,
          CELLAR_ENTRY_TILE.tileX * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2,
          CELLAR_ENTRY_TILE.tileY * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2,
        );
      }
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
        sprinting: false,
      });
    } else {
      const input = ctx.db.player_input.identity.find(ctx.sender);
      if (input !== null) {
        ctx.db.player_input.identity.update({
          ...input,
          direction: 'idle',
          sprinting: false,
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
  drainPlayerOverflow(ctx, ctx.sender);
  const selected = ctx.db.inventory_slot.id.find(`${ctx.sender.toHexString()}:${survival.selectedSlot}`);
  const equippedItem = selected?.itemKind ?? 'empty';
  const position = ctx.db.player_position.identity.find(ctx.sender);
  if (position !== null && (position.equippedKind !== equippedItem
    || position.equippedLit !== storedLit(equippedItem, selected?.lit))) {
      ctx.db.player_position.identity.update({ ...position, equippedKind: equippedItem, equippedLit: storedLit(equippedItem, selected?.lit) });
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
  const statisticsTick = ctx.db.world_clock.id.find(0)?.authorityTick ?? 0n;
  recordPlayerStatistic(ctx, ctx.sender, 'connections_opened', 1n, statisticsTick);
  const timePlayedId = playerStatisticRowId(ctx.sender.toHexString(), 'time_played', '');
  if (firstStatisticSession || ctx.db.player_statistic.id.find(timePlayedId) === null) {
    beginPlayerStatisticSession(ctx, ctx.sender, statisticsTick);
  }
  if (firstStatisticSession) {
    recordPlayerStatistic(ctx, ctx.sender, 'world_entries', 1n, statisticsTick);
  }
  if (firstLiveConnection
    && connectedProfile !== null
    && ctx.db.character_profile.identity.find(ctx.sender)?.nameChosen === true) {
    broadcastSessionChatNotice(ctx, 'entry', worldEntryMessage(connectedProfile.displayName));
  }
});

// Keep the lease row after a transport disconnect. A killed process must stop
// through the 2 s stale-input failsafe while remaining visibly online until the
// existing 30 s presence lease expires; stepWorld owns that cleanup.
export const onDisconnect = spacetimedb.clientDisconnected((ctx) => {
  if (ctx.connectionId === null) return;
  deleteSessionChatNoticesForConnection(ctx, ctx.connectionId);
  if (ctx.db.bow_charge.identity.find(ctx.sender) !== null) ctx.db.bow_charge.identity.delete(ctx.sender);
  returnInventoryCursorToStorage(ctx, ctx.sender);
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
  const authorityTick = ctx.db.world_clock.id.find(0)?.authorityTick;
  if (authorityTick !== undefined) flushPlayerStatisticTime(ctx, ctx.sender, authorityTick, true);
  ctx.db.connection_notice.connectionId.delete(ctx.connectionId);
});

/** Owner-only operational history. Results are copied only into the caller's
 * ephemeral session inbox and never become channel messages or world speech. */
export const requestLastConnections = spacetimedb.reducer({}, (ctx) => {
  requireWorldOwner(ctx.senderAuth.jwt, ctx.db.membership.identity.find(ctx.sender));
  if (ctx.connectionId === null
    || ctx.db.connection_notice.connectionId.find(ctx.connectionId) === null) {
    throw new SenderError('connection_not_ready');
  }
  const recent = recentConnectionEvents([...ctx.db.connection_audit.iter()].map((event) => ({
    id: event.id,
    identityHex: event.identity.toHexString(),
    displayName: event.displayName,
    eventKind: event.eventKind,
    occurredAtMicros: event.occurredAt.microsSinceUnixEpoch,
    occurredAtIso: event.occurredAt.toISOString(),
  })));
  if (recent.length === 0) {
    insertSessionChatNotice(
      ctx, ctx.sender, ctx.connectionId, 'last', 'NO CONNECTION EVENTS RECORDED',
    );
    return;
  }
  insertSessionChatNotice(
    ctx,
    ctx.sender,
    ctx.connectionId,
    'last',
    `RECENT CONNECTIONS — NEWEST FIRST (${recent.length}, UTC)`,
  );
  for (const event of recent) {
    insertSessionChatNotice(
      ctx,
      ctx.sender,
      ctx.connectionId,
      'last',
      lastConnectionEventMessage(event.displayName, event.eventKind, event.occurredAtIso),
    );
  }
});

/** Public, read-only economy ranking. Raw wallets remain private and only the
 * bounded, display-name projection is copied into the caller's session inbox. */
export const requestBalanceTop = spacetimedb.reducer({}, (ctx) => {
  requireAuthorizedSender(ctx.senderAuth.jwt, ctx.db.membership.identity.find(ctx.sender));
  if (ctx.connectionId === null
    || ctx.db.connection_notice.connectionId.find(ctx.connectionId) === null) {
    throw new SenderError('connection_not_ready');
  }
  const ranked = topBalanceLeaderboard(
    [...ctx.db.player_wallet.iter()].flatMap((wallet) => {
      const profile = ctx.db.player_public.identity.find(wallet.identity);
      return profile === null ? [] : [{
        identityHex: wallet.identity.toHexString(),
        displayName: profile.displayName,
        balanceBronze: wallet.balanceBronze,
      }];
    }),
  );
  insertSessionChatNotice(
    ctx,
    ctx.sender,
    ctx.connectionId,
    'baltop',
    `TOP ${BALANCE_LEADERBOARD_LIMIT} PLAYER BALANCES`,
  );
  if (ranked.length === 0) {
    insertSessionChatNotice(ctx, ctx.sender, ctx.connectionId, 'baltop', 'NO PLAYER BALANCES FOUND');
    return;
  }
  for (const [index, entry] of ranked.entries()) {
    insertSessionChatNotice(
      ctx,
      ctx.sender,
      ctx.connectionId,
      'baltop',
      balanceLeaderboardMessage(index + 1, entry),
    );
  }
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
    recordPlayerStatistic(
      ctx, ctx.sender, 'chat_channels_created', 1n,
      ctx.db.world_clock.id.find(0)?.authorityTick ?? 0n,
    );
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
    recordPlayerStatistic(
      ctx, ctx.sender, 'chat_channels_joined', 1n,
      ctx.db.world_clock.id.find(0)?.authorityTick ?? 0n,
    );
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
    recordPlayerStatistic(
      ctx, ctx.sender, 'chat_invitations_sent', 1n,
      ctx.db.world_clock.id.find(0)?.authorityTick ?? 0n,
    );
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
    recordPlayerStatistic(
      ctx, ctx.sender, 'messages_sent', 1n,
      ctx.db.world_clock.id.find(0)?.authorityTick ?? 0n,
      'channel',
    );
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
    recordPlayerStatistic(
      ctx, ctx.sender, 'messages_sent', 1n,
      ctx.db.world_clock.id.find(0)?.authorityTick ?? 0n,
      'whisper',
    );
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
      spaceId: position.spaceId,
    });
    recordPlayerStatistic(ctx, ctx.sender, 'messages_sent', 1n, clock.authorityTick, kind);
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
      deleteSessionChatNoticesForConnection(ctx, presence.connectionId);
    }
    const profile = ctx.db.player_public.identity.find(identity);
    if (profile !== null) ctx.db.player_public.identity.update({ ...profile, online: false });
    const input = ctx.db.player_input.identity.find(identity);
    if (input !== null) ctx.db.player_input.identity.update({
      ...input,
      direction: 'idle',
      sprinting: false,
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

export const usePortal = spacetimedb.reducer(
  { portalId: t.u32() },
  (ctx, { portalId }) => {
    requireAuthorizedSender(ctx.senderAuth.jwt, ctx.db.membership.identity.find(ctx.sender));
    const position = ctx.db.player_position.identity.find(ctx.sender);
    if (position === null) throw new SenderError('player_not_ready');
    const portal = ctx.db.space_portal.id.find(portalId);
    if (portal === null) throw new SenderError('portal_not_found');
    if (spaceDefinitionFor(portal.toSpace)?.ownerOnly === true) {
      requireWorldOwner(ctx.senderAuth.jwt, ctx.db.membership.identity.find(ctx.sender));
    }
    usePortalRow(ctx, position, portal, true);
  },
);

/** The gate is a property of the homestead, not a client-side animation.
 * Owners may toggle it from inside; guests can leave through the exit portal
 * regardless of state but cannot change admission policy. */
export const toggleHomesteadGate = spacetimedb.reducer({}, (ctx) => {
  requireAuthorizedSender(ctx.senderAuth.jwt, ctx.db.membership.identity.find(ctx.sender));
  const position = ctx.db.player_position.identity.find(ctx.sender);
  if (position === null) throw new SenderError('player_not_ready');
  const home = homesteadForSpace(ctx, position.spaceId);
  if (home === null || position.spaceId !== home.spaceId) throw new SenderError('homestead_gate_unavailable');
  if (home.owner.toHexString() !== ctx.sender.toHexString()) throw new SenderError('homestead_gate_owner_only');
  if (!tileTargetWithinFixedReach(
    position.x,
    position.y,
    HOMESTEAD_GATE_TILE,
    2 * TILE_SIZE_FIXED,
  )) throw new SenderError('homestead_gate_out_of_range');
  ctx.db.homestead.spaceId.update({ ...home, gateOpen: !home.gateOpen });
});

export const pickupQuestWorldItem = spacetimedb.reducer(
  { itemId: t.string() },
  (ctx, { itemId }) => {
    requireAuthorizedSender(ctx.senderAuth.jwt, ctx.db.membership.identity.find(ctx.sender));
    const position = ctx.db.player_position.identity.find(ctx.sender);
    const item = ctx.db.quest_world_item.id.find(itemId);
    if (position === null || item === null
      || item.identity.toHexString() !== ctx.sender.toHexString()) throw new SenderError('quest_item_not_found');
    const quest = ctx.db.player_quest.id.find(playerQuestId(ctx.sender.toHexString(), item.questId));
    const surface = ctx.db.world_surface.id.find(item.surfaceId);
    if (quest === null || quest.state !== 'active' || surface === null || surface.spaceId !== position.spaceId) {
      throw new SenderError('quest_item_unavailable');
    }
    if (!tileTargetWithinFixedReach(
      position.x,
      position.y,
      { tileX: surface.tileX, tileY: surface.tileY },
      2 * TILE_SIZE_FIXED,
    )) throw new SenderError('quest_item_out_of_range');
    const definition = questDefinition(item.questId);
    const objective = definition?.objectives.find((candidate) => candidate.id === item.objectiveId);
    const objectiveAcceptsItem = objective?.kind === 'action'
      || (objective?.kind === 'collect'
        && objective.items.some((requirement) => requirement.itemKind === item.itemKind));
    if (objective === undefined || !objectiveAcceptsItem) throw new SenderError('quest_item_invalid');
    // The prop remains on the table unless the complete stack can be placed in
    // authoritative carried inventory. This makes the quest book a real item,
    // rather than an action counter represented only by UI.
    if (!insertPlayerCarriedItem(ctx, item.itemKind, 1)) throw new SenderError('inventory_full');
    ctx.db.quest_world_item.id.delete(item.id);
    const authorityTick = ctx.db.world_clock.id.find(0)?.authorityTick ?? 0n;
    if (objective.kind === 'action') {
      recordPlayerStatistic(ctx, ctx.sender, 'quest_actions', 1n, authorityTick, objective.actionKind);
    }
    refreshPlayerQuests(ctx, ctx.sender, authorityTick);
  },
);

export const setQuestPinned = spacetimedb.reducer(
  { questId: t.string(), pinned: t.bool() },
  (ctx, { questId, pinned }) => {
    requireAuthorizedSender(ctx.senderAuth.jwt, ctx.db.membership.identity.find(ctx.sender));
    const row = ctx.db.player_quest.id.find(playerQuestId(ctx.sender.toHexString(), questId));
    if (row === null || row.state === 'turned_in') throw new SenderError('quest_not_active');
    ctx.db.player_quest.id.update({ ...row, pinned });
  },
);

/** Player-owned quest removal. Abandoning deletes only this quest's private
 * baselines, reach sensors, instanced props, and explicitly quest-owned items;
 * ordinary gathered objective materials remain untouched. The absent quest
 * row makes the definition offerable again through its normal dialogue. */
export const abandonQuest = spacetimedb.reducer(
  { questId: t.string() },
  (ctx, { questId }) => {
    requireAuthorizedSender(ctx.senderAuth.jwt, ctx.db.membership.identity.find(ctx.sender));
    const identityHex = ctx.sender.toHexString();
    const row = ctx.db.player_quest.id.find(playerQuestId(identityHex, questId));
    if (row === null || (row.state !== 'active' && row.state !== 'complete')) {
      throw new SenderError('quest_not_active');
    }
    const definition = questDefinition(questId);
    if (definition === null) throw new SenderError('quest_not_found');
    const carried = questProgressSourceFor(ctx, ctx.sender);
    for (const item of definition.abandonRemovesItems ?? []) {
      const quantity = Math.min(item.count, carried.itemCount(item.itemKind));
      if (quantity > 0) removePlayerCarriedItem(ctx, item.itemKind, quantity);
    }
    for (const baseline of [...ctx.db.player_quest_baseline.by_identity.filter(ctx.sender)]) {
      if (baseline.questId === questId) ctx.db.player_quest_baseline.id.delete(baseline.id);
    }
    for (const item of [...ctx.db.quest_world_item.by_identity.filter(ctx.sender)]) {
      if (item.questId === questId) ctx.db.quest_world_item.id.delete(item.id);
    }
    for (const presence of [...ctx.db.player_quest_reach_presence.by_identity.filter(ctx.sender)]) {
      if (presence.questId === questId) ctx.db.player_quest_reach_presence.id.delete(presence.id);
    }
    ctx.db.player_quest.id.delete(row.id);
    recordPlayerStatistic(
      ctx,
      ctx.sender,
      'quests_abandoned',
      1n,
      ctx.db.world_clock.id.find(0)?.authorityTick ?? 0n,
      questId,
    );
  },
);

/** Developer-only replay tool. It resets only the caller, and removes private
 * quest-owned state so accepting a quest recreates its props and baselines. */
export const resetMyQuestProgress = spacetimedb.reducer((ctx) => {
  requireWorldOwner(ctx.senderAuth.jwt, ctx.db.membership.identity.find(ctx.sender));
  for (const row of [...ctx.db.player_quest.by_identity.filter(ctx.sender)]) ctx.db.player_quest.id.delete(row.id);
  for (const row of [...ctx.db.player_quest_baseline.by_identity.filter(ctx.sender)]) ctx.db.player_quest_baseline.id.delete(row.id);
  for (const row of [...ctx.db.quest_world_item.by_identity.filter(ctx.sender)]) ctx.db.quest_world_item.id.delete(row.id);
  for (const row of [...ctx.db.player_quest_reach_presence.by_identity.filter(ctx.sender)]) ctx.db.player_quest_reach_presence.id.delete(row.id);
  for (const row of [...ctx.db.player_quest_flag.by_identity.filter(ctx.sender)]) ctx.db.player_quest_flag.id.delete(row.id);
  if (ctx.db.player_thought.identity.find(ctx.sender) !== null) ctx.db.player_thought.identity.delete(ctx.sender);
  const carried = questProgressSourceFor(ctx, ctx.sender).itemCount('marlow_book');
  if (carried > 0) removePlayerCarriedItem(ctx, 'marlow_book', carried);
  ctx.db.world_admin_audit.insert({
    id: 0n, actor: ctx.sender, action: 'reset_my_quest_progress',
    value: ctx.sender.toHexString(), occurredAt: ctx.timestamp,
  });
});

/** Owner-only inventory-capacity probe. Capacity may never be reduced far
 * enough to hide an occupied backpack cell. Returning to normal capacity
 * clears the override. */
export const adjustDebugBackpackSlots = spacetimedb.reducer(
  { increase: t.bool() },
  (ctx, { increase }) => {
    requireWorldOwner(ctx.senderAuth.jwt, ctx.db.membership.identity.find(ctx.sender));
    const survival = ctx.db.player_survival.identity.find(ctx.sender);
    if (survival === null) throw new SenderError('player_not_ready');
    const rows = [...ctx.db.inventory_slot.by_identity.filter(ctx.sender)];
    const hasBackpack = rows.some((row) => row.itemKind === 'backpack' && row.quantity > 0);
    const normalCapacity = hasBackpack ? BACKPACK_SLOT_COUNT : DEFAULT_BACKPACK_CAPACITY;
    let occupiedCapacity = DEFAULT_BACKPACK_CAPACITY;
    for (const row of rows) {
      const index = row.slot - BACKPACK_SLOT_OFFSET;
      if (index >= 0 && index < BACKPACK_SLOT_COUNT && row.itemKind !== 'empty' && row.quantity > 0) {
        occupiedCapacity = Math.max(occupiedCapacity, index + 1);
      }
    }
    const current = Math.max(normalCapacity, survival.debugBackpackSlots);
    const minimum = Math.max(normalCapacity, occupiedCapacity);
    const next = Math.max(minimum, Math.min(BACKPACK_SLOT_COUNT, current + (increase ? 1 : -1)));
    ctx.db.player_survival.identity.update({
      ...survival,
      debugBackpackSlots: next > normalCapacity ? next : 0,
    });
  },
);

/** Owner-only verification vehicle. It exercises the same transition helper
 * while allowing F3/browser checks without walking to the authored test door. */
export const debugUsePortal = spacetimedb.reducer((ctx) => {
  requireWorldOwner(ctx.senderAuth.jwt, ctx.db.membership.identity.find(ctx.sender));
  installDebugPortals(ctx);
  const position = ctx.db.player_position.identity.find(ctx.sender);
  if (position === null) throw new SenderError('player_not_ready');
  const portalId = position.spaceId === DEBUG_SPACE_ID
    ? DEBUG_PORTAL_INTERIOR_ID
    : DEBUG_PORTAL_TOPSIDE_ID;
  const portal = ctx.db.space_portal.id.find(portalId);
  if (portal === null) throw new SenderError('portal_not_found');
  usePortalRow(ctx, position, portal, false);
});

export const adminTeleport = spacetimedb.reducer(
  { destination: t.string() },
  (ctx, { destination }) => {
    requireWorldOwner(ctx.senderAuth.jwt, ctx.db.membership.identity.find(ctx.sender));
    const callerPosition = ctx.db.player_position.identity.find(ctx.sender);
    if (callerPosition === null) throw new SenderError('player_not_ready');
    const argument = destination.normalize('NFC').replace(/\s+/g, ' ').trim();
    if (argument.length === 0 || [...argument].length > 64) throw new SenderError('teleport_usage');
    const coordinates = /^(-?\d+) (-?\d+)$/.exec(argument);
    let nextX: number;
    let nextY: number;
    let nextSpaceId = callerPosition.spaceId;
    let teleportedPosition = callerPosition;
    let auditValue: string;
    if (coordinates !== null) {
      const tileX = Number(coordinates[1]);
      const tileY = Number(coordinates[2]);
      const definition = spaceDefinitionFor(
        callerPosition.spaceId,
        homesteadForSpace(ctx, callerPosition.spaceId),
      );
      if (!Number.isSafeInteger(tileX) || !Number.isSafeInteger(tileY)
        || definition === undefined
        || tileX < 0 || tileY < 0 || tileX >= definition.sizeTiles || tileY >= definition.sizeTiles) {
        throw new SenderError('teleport_coordinates_out_of_bounds');
      }
      nextX = tileX * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2;
      nextY = tileY * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2;
      const collision = collisionForSpace(ctx, callerPosition.spaceId);
      if (positionCollides({ x: nextX, y: nextY }, collision)) {
        throw new SenderError('teleport_destination_blocked');
      }
      auditValue = `${callerPosition.spaceId}:${tileX},${tileY}`;
    } else {
      const normalizedArgument = argument.toLocaleLowerCase('en-US');
      const onlinePlayers = [...ctx.db.player_public.iter()].filter((profile) => profile.online);
      const npcs = [...ctx.db.world_npc.iter()];
      const playerNamed = (name: string) => onlinePlayers.find((profile) => (
        profile.displayName.toLocaleLowerCase('en-US') === name.toLocaleLowerCase('en-US')
      ));
      const npcNamed = (name: string) => npcs.find((npc) => (
        npc.displayName.toLocaleLowerCase('en-US') === name.toLocaleLowerCase('en-US')
      ));
      const directPlayer = playerNamed(argument);
      const directNpc = npcNamed(argument);
      if (directPlayer !== undefined) {
        const targetPosition = ctx.db.player_position.identity.find(directPlayer.identity);
        if (targetPosition === null) throw new SenderError('teleport_player_not_ready');
        nextX = targetPosition.x;
        nextY = targetPosition.y;
        nextSpaceId = targetPosition.spaceId;
        auditValue = `player:${directPlayer.identity.toHexString()}:${directPlayer.displayName}`;
      } else if (directNpc !== undefined) {
        nextX = directNpc.x;
        nextY = directNpc.y;
        nextSpaceId = directNpc.spaceId;
        auditValue = `npc:${directNpc.id}:${directNpc.displayName}`;
      } else {
        const subject = [...onlinePlayers]
          .sort((left, right) => right.displayName.length - left.displayName.length)
          .find((profile) => normalizedArgument.startsWith(
            `${profile.displayName.toLocaleLowerCase('en-US')} `,
          ));
        if (subject === undefined) throw new SenderError('teleport_destination_not_found');
        const namedDestination = argument.slice(subject.displayName.length + 1);
        const destinationNpc = npcNamed(namedDestination);
        const destinationPlayer = playerNamed(namedDestination);
        if (destinationNpc === undefined && destinationPlayer === undefined) {
          throw new SenderError('teleport_destination_not_found');
        }
        const subjectPosition = ctx.db.player_position.identity.find(subject.identity);
        if (subjectPosition === null) throw new SenderError('teleport_player_not_ready');
        teleportedPosition = subjectPosition;
        if (destinationNpc !== undefined) {
          nextX = destinationNpc.x;
          nextY = destinationNpc.y;
          nextSpaceId = destinationNpc.spaceId;
          auditValue = `player:${subject.identity.toHexString()}:${subject.displayName}->npc:${destinationNpc.id}:${destinationNpc.displayName}`;
        } else {
          const destinationPosition = ctx.db.player_position.identity.find(destinationPlayer!.identity);
          if (destinationPosition === null) throw new SenderError('teleport_player_not_ready');
          nextX = destinationPosition.x;
          nextY = destinationPosition.y;
          nextSpaceId = destinationPosition.spaceId;
          auditValue = `player:${subject.identity.toHexString()}:${subject.displayName}->player:${destinationPlayer!.identity.toHexString()}:${destinationPlayer!.displayName}`;
        }
      }
    }

    const clock = ctx.db.world_clock.id.find(0);
    const authorityTick = clock?.authorityTick ?? teleportedPosition.authorityTick;
    teleportPlayer(ctx, teleportedPosition, nextSpaceId, nextX, nextY);
    for (const npc of ctx.db.world_npc.by_rider.filter(teleportedPosition.identity)) {
      updateWorldNpc(ctx, {
        ...npc,
        x: nextX,
        y: nextY,
        homeX: nextX,
        homeY: nextY,
        chunkX: chunkAt(nextX),
        chunkY: chunkAt(nextY),
        spaceId: nextSpaceId,
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
    recordPlayerStatistic(ctx, ctx.sender, 'admin_teleports', 1n, authorityTick);
  },
);

/** Owner recovery tool for durable horses that have been left somewhere
 * inaccessible. This deliberately relocates only an explicit, unridden horse
 * and re-homes its wildlife leash at the destination. */
export const adminRelocateHorse = spacetimedb.reducer(
  { horseId: t.u64(), tileX: t.u16(), tileY: t.u16() },
  (ctx, { horseId, tileX, tileY }) => {
    requireWorldOwner(ctx.senderAuth.jwt, ctx.db.membership.identity.find(ctx.sender));
    const horse = ctx.db.world_npc.id.find(horseId);
    if (horse === null || horse.kind !== 'horse') throw new SenderError('horse_not_ready');
    if (horse.rider !== undefined) throw new SenderError('horse_is_mounted');
    const definition = spaceDefinitionFor(TOPSIDE_SPACE_ID);
    if (definition === undefined || tileX >= definition.sizeTiles || tileY >= definition.sizeTiles) {
      throw new SenderError('horse_destination_out_of_bounds');
    }
    const x = tileX * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2;
    const y = tileY * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2;
    if (positionCollides({ x, y }, collisionForSpace(ctx, TOPSIDE_SPACE_ID))) {
      throw new SenderError('horse_destination_blocked');
    }
    const authorityTick = ctx.db.world_clock.id.find(0)?.authorityTick ?? horse.authorityTick;
    updateWorldNpc(ctx, {
      ...horse,
      x,
      y,
      homeX: x,
      homeY: y,
      chunkX: chunkAt(x),
      chunkY: chunkAt(y),
      spaceId: TOPSIDE_SPACE_ID,
      facing: 'down',
      moving: false,
      wanderDirection: 'rest',
      nextDecisionTick: authorityTick + 60n,
      authorityTick,
    });
    ctx.db.world_admin_audit.insert({
      id: 0n,
      actor: ctx.sender,
      action: 'admin_relocate_horse',
      value: `${horseId}:${tileX},${tileY}`,
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
    recordPlayerStatistic(
      ctx, ctx.sender, 'character_names_chosen', 1n,
      ctx.db.world_clock.id.find(0)?.authorityTick ?? 0n,
    );
    broadcastSessionChatNotice(ctx, 'entry', worldEntryMessage(validName));
    const parcel = [...ctx.db.farm_parcel.by_owner.filter(ctx.sender)][0];
    if (parcel !== undefined) {
      ctx.db.farm_parcel.id.update({ ...parcel, name: `${validName}'s Farm` });
    }
  },
);

export const setAppearance = spacetimedb.reducer(
  { hairKind: t.string(), shirtKind: t.string(), pantsKind: t.string(), shoesKind: t.string() },
  (ctx, appearance) => {
    requireAuthorizedSender(ctx.senderAuth.jwt, ctx.db.membership.identity.find(ctx.sender));
    if (!isPlayerAppearanceSelection(appearance)) throw new SenderError('invalid_appearance');
    const existing = ctx.db.player_appearance.identity.find(ctx.sender);
    if (existing === null) throw new SenderError('appearance_not_ready');
    if (existing.hairKind === appearance.hairKind && existing.shirtKind === appearance.shirtKind
      && existing.pantsKind === appearance.pantsKind && existing.shoesKind === appearance.shoesKind) return;
    ctx.db.player_appearance.identity.update({ identity: ctx.sender, ...appearance });
    recordPlayerStatistic(
      ctx, ctx.sender, 'appearance_changes', 1n,
      ctx.db.world_clock.id.find(0)?.authorityTick ?? 0n,
    );
  },
);

export const purchaseSkillNode = spacetimedb.reducer(
  { nodeId: t.string() },
  (ctx, { nodeId }) => {
    requireAuthorizedSender(ctx.senderAuth.jwt, ctx.db.membership.identity.find(ctx.sender));
    const node = skillNodeDefinition(nodeId);
    if (node === null) throw new SenderError('skill_not_found');
    const track = ensurePlayerSkillTrack(ctx, ctx.sender, node.track);
    const ranks = playerSkillRanks(ctx, ctx.sender);
    const rejection = skillPurchaseRejection(nodeId, {
      experience: track.experience,
      spentPoints: track.spentPoints,
      bonusPoints: track.bonusPoints,
      ranks,
    });
    if (rejection !== null) throw new SenderError(rejection);
    const id = playerSkillNodeId(ctx.sender.toHexString(), nodeId);
    const current = ctx.db.player_skill_node.id.find(id);
    if (current === null) {
      ctx.db.player_skill_node.insert({
        id, identity: ctx.sender, track: node.track, nodeId, rank: 1,
      });
    } else {
      ctx.db.player_skill_node.id.update({ ...current, rank: current.rank + 1 });
    }
    ctx.db.player_skill_track.id.update({
      ...track,
      spentPoints: track.spentPoints + node.pointCost,
    });
    recordPlayerStatistic(
      ctx, ctx.sender, 'skill_points_spent', BigInt(node.pointCost),
      ctx.db.world_clock.id.find(0)?.authorityTick ?? 0n, node.track,
    );
  },
);

export const resetSkillTree = spacetimedb.reducer(
  { track: t.string() },
  (ctx, { track }) => {
    requireAuthorizedSender(ctx.senderAuth.jwt, ctx.db.membership.identity.find(ctx.sender));
    if (!isSkillTrack(track)) throw new SenderError('invalid_skill_track');
    const progress = ensurePlayerSkillTrack(ctx, ctx.sender, track);
    if (progress.spentPoints === 0) throw new SenderError('skill_tree_empty');
    const cost = skillRespecCostBronze(progress.respecCount);
    const wallet = ctx.db.player_wallet.identity.find(ctx.sender);
    if (wallet === null) throw new SenderError('wallet_not_ready');
    if (wallet.balanceBronze < cost) throw new SenderError('insufficient_funds');
    for (const row of [...ctx.db.player_skill_node.by_identity.filter(ctx.sender)]) {
      if (row.track === track) ctx.db.player_skill_node.id.delete(row.id);
    }
    if (cost > 0n) ctx.db.player_wallet.identity.update({ ...wallet, balanceBronze: wallet.balanceBronze - cost });
    ctx.db.player_skill_track.id.update({
      ...progress,
      spentPoints: 0,
      respecCount: Math.min(65_535, progress.respecCount + 1),
    });
    recordPlayerStatistic(
      ctx, ctx.sender, 'skill_respecs', 1n,
      ctx.db.world_clock.id.find(0)?.authorityTick ?? 0n, track,
    );
  },
);

export const grantDebugSkillPoints = spacetimedb.reducer(
  { track: t.string(), points: t.u16() },
  (ctx, { track, points }) => {
    requireWorldOwner(ctx.senderAuth.jwt, ctx.db.membership.identity.find(ctx.sender));
    if (!isSkillTrack(track)) throw new SenderError('invalid_skill_track');
    if (points < 1 || points > 100) throw new SenderError('invalid_skill_point_grant');
    const progress = ensurePlayerSkillTrack(ctx, ctx.sender, track);
    if (progress.bonusPoints + points > 65_535) throw new SenderError('skill_point_limit');
    ctx.db.player_skill_track.id.update({
      ...progress,
      bonusPoints: progress.bonusPoints + points,
    });
    ctx.db.world_admin_audit.insert({
      id: 0n,
      actor: ctx.sender,
      action: 'grant_debug_skill_points',
      value: `${track}:${points}`,
      occurredAt: ctx.timestamp,
    });
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
  { direction: t.string(), sequence: t.u64(), clientTick: t.u64(), sprinting: t.bool() },
  (ctx, { direction, sequence, clientTick, sprinting }) => {
    requireAuthorizedSender(ctx.senderAuth.jwt, ctx.db.membership.identity.find(ctx.sender));
    parseDirection(direction);
    const input = ctx.db.player_input.identity.find(ctx.sender);
    if (input === null) throw new SenderError('player_not_ready');
    if (sequence <= input.sequence) return;
    if (sprinting && !input.sprinting) {
      const clock = ctx.db.world_clock.id.find(0);
      if (clock !== null) advancePlayerStats(ctx, ctx.sender, clock.authorityTick);
    }
    const settled = settleMovementRun(
      input.direction,
      input.sprinting,
      input.runStartClientTick,
      clientTick,
      input.settleDirection,
      input.settleSteps,
    );
    ctx.db.player_input.identity.update({
      ...input,
      direction,
      sprinting,
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
    if (!isHotbarSlot(slot)) throw new SenderError('invalid_hotbar_slot');
    const survival = ctx.db.player_survival.identity.find(ctx.sender);
    if (survival === null) throw new SenderError('player_not_ready');
    ctx.db.player_survival.identity.update({ ...survival, selectedSlot: slot });
    const selected = ctx.db.inventory_slot.id.find(`${ctx.sender.toHexString()}:${slot}`);
    const position = ctx.db.player_position.identity.find(ctx.sender);
    const equippedKind = selected?.itemKind ?? 'empty';
    if (position !== null) ctx.db.player_position.identity.update({ ...position, equippedKind });
  },
);

function repairSelectedToolAtAnvil(ctx: WorldReducerContext): void {
  const survival = ctx.db.player_survival.identity.find(ctx.sender);
  if (survival === null) throw new SenderError('player_not_ready');
  const selected = ctx.db.inventory_slot.id.find(`${ctx.sender.toHexString()}:${survival.selectedSlot}`);
  if (selected === null || !isDurableToolKind(selected.itemKind)) throw new SenderError('wrong_tool');
  const definition = toolDurabilityDefinition(selected.itemKind)!;
  if (selected.durability >= definition.maximum) throw new SenderError('tool_not_damaged');
  const wallet = ctx.db.player_wallet.identity.find(ctx.sender);
  if (wallet === null) throw new SenderError('wallet_not_ready');
  const repairCost = BigInt(ANVIL_REPAIR_COST_BRONZE);
  if (wallet.balanceBronze < repairCost) throw new SenderError('anvil_copper_missing');
  ctx.db.player_wallet.identity.update({ ...wallet, balanceBronze: wallet.balanceBronze - repairCost });
  ctx.db.inventory_slot.id.update({ ...selected, durability: repairTool(selected.itemKind) });
  const authorityTick = ctx.db.world_clock.id.find(0)?.authorityTick ?? 0n;
  recordPlayerStatistic(ctx, ctx.sender, 'bronze_spent', repairCost, authorityTick);
  recordPlayerStatistic(ctx, ctx.sender, 'tools_repaired', 1n, authorityTick, selected.itemKind);
  recordPlayerStatistic(
    ctx,
    ctx.sender,
    'durability_restored',
    BigInt(definition.maximum - selected.durability),
    authorityTick,
    selected.itemKind,
  );
}

/** Kept for binding compatibility, but the authority still requires the same
 * faced anvil as E interaction so older clients cannot field-repair remotely. */
export const repairSelectedTool = spacetimedb.reducer({}, (ctx) => {
  requireAuthorizedSender(ctx.senderAuth.jwt, ctx.db.membership.identity.find(ctx.sender));
  const position = ctx.db.player_position.identity.find(ctx.sender);
  if (position === null) throw new SenderError('player_not_ready');
  if (placeableAtFacingTile(ctx, position)?.kind !== 'anvil') throw new SenderError('anvil_not_in_reach');
  repairSelectedToolAtAnvil(ctx);
});

export const consumeOrchardTea = spacetimedb.reducer({}, (ctx) => {
  requireAuthorizedSender(ctx.senderAuth.jwt, ctx.db.membership.identity.find(ctx.sender));
  const survival = ctx.db.player_survival.identity.find(ctx.sender);
  const clock = ctx.db.world_clock.id.find(0);
  if (survival === null || clock === null) throw new SenderError('player_not_ready');
  const selected = ctx.db.inventory_slot.id.find(`${ctx.sender.toHexString()}:${survival.selectedSlot}`);
  if (selected?.itemKind !== 'orchard_tea' || selected.quantity === 0) throw new SenderError('wrong_item');
  const existing = [...ctx.db.player_effect.by_identity.filter(ctx.sender)]
    .find((effect) => effect.effectKind === 'orchard_tea') ?? null;
  const refreshed = refreshEffect(existing === null ? null : {
    id: existing.id,
    effectKind: 'orchard_tea',
    stacks: existing.stacks,
    appliedTick: existing.appliedTick,
    expiresTick: existing.expiresTick,
  }, 'orchard_tea', clock.authorityTick, existing?.id);
  if (existing === null) ctx.db.player_effect.insert({ ...refreshed, identity: ctx.sender });
  else ctx.db.player_effect.id.update({ ...existing, ...refreshed });
  ctx.db.inventory_slot.id.update({
    ...selected,
    itemKind: selected.quantity === 1 ? 'empty' : selected.itemKind,
    quantity: selected.quantity - 1,
    durability: 0,
  });
  // Re-resolve immediately so the +CON maximum clamps/rises consistently with
  // the effect row observed in the same transaction.
  advancePlayerStats(ctx, ctx.sender, clock.authorityTick);
  recordPlayerStatistic(ctx, ctx.sender, 'orchard_tea_consumed', 1n, clock.authorityTick);
});

export const inventoryCursorClick = spacetimedb.reducer(
  { container: t.string(), index: t.u8(), button: t.string() },
  (ctx, request) => {
    requireAuthorizedSender(ctx.senderAuth.jwt, ctx.db.membership.identity.find(ctx.sender));
    if (request.button !== 'left' && request.button !== 'right') throw new SenderError('invalid_click_button');
    const menu = loadOpenMenuInventory(ctx);
    const result = clickContainerSlot(menu.containers, playerInventoryCursor(ctx, ctx.sender), {
      container: request.container, index: request.index, button: request.button,
    });
    if (!result.ok) throw new SenderError(result.code);
    writeOpenMenuInventory(ctx, menu, result.containers);
    writePlayerInventoryCursor(ctx, ctx.sender, result.cursor);
    refreshSenderQuestsFromInventory(ctx);
  },
);

export const sortMenuContainer = spacetimedb.reducer(
  { container: t.string() },
  (ctx, { container }) => {
    requireAuthorizedSender(ctx.senderAuth.jwt, ctx.db.membership.identity.find(ctx.sender));
    if (container !== 'backpack' && container !== 'chest' && container !== 'placeable') {
      throw new SenderError('container_not_sortable');
    }
    if (playerInventoryCursor(ctx, ctx.sender) !== null) throw new SenderError('inventory_cursor_not_empty');
    const menu = loadOpenMenuInventory(ctx);
    const source = menu.containers[container];
    if (source === undefined) throw new SenderError('container_not_found');
    const result = sortAndStackContainer(source);
    if (!result.ok) throw new SenderError(result.code);
    writeOpenMenuInventory(ctx, menu, { ...menu.containers, [container]: result.container });
  },
);

export const inventoryCursorQuickCraft = spacetimedb.reducer(
  {
    targetContainers: t.array(t.string()), targetIndexes: t.array(t.u8()), mode: t.string(),
  },
  (ctx, request) => {
    requireAuthorizedSender(ctx.senderAuth.jwt, ctx.db.membership.identity.find(ctx.sender));
    if (request.targetContainers.length !== request.targetIndexes.length
      || (request.mode !== 'even' && request.mode !== 'one_each')) throw new SenderError('invalid_quick_craft');
    const menu = loadOpenMenuInventory(ctx);
    const result = quickCraftCursorStack(menu.containers, playerInventoryCursor(ctx, ctx.sender), {
      mode: request.mode,
      targets: request.targetContainers.map((container, index) => ({ container, index: request.targetIndexes[index]! })),
    });
    if (!result.ok) throw new SenderError(result.code);
    writeOpenMenuInventory(ctx, menu, result.containers);
    writePlayerInventoryCursor(ctx, ctx.sender, result.cursor);
    refreshSenderQuestsFromInventory(ctx);
  },
);

export const inventoryCursorPickupAll = spacetimedb.reducer(
  { containerOrder: t.array(t.string()) },
  (ctx, { containerOrder }) => {
    requireAuthorizedSender(ctx.senderAuth.jwt, ctx.db.membership.identity.find(ctx.sender));
    const menu = loadOpenMenuInventory(ctx);
    const result = pickupAllToCursor(menu.containers, playerInventoryCursor(ctx, ctx.sender), containerOrder);
    if (!result.ok) throw new SenderError(result.code);
    writeOpenMenuInventory(ctx, menu, result.containers);
    writePlayerInventoryCursor(ctx, ctx.sender, result.cursor);
    refreshSenderQuestsFromInventory(ctx);
  },
);

export const inventoryCursorSwapHotbar = spacetimedb.reducer(
  { container: t.string(), index: t.u8(), hotbarIndex: t.u8() },
  (ctx, request) => {
    requireAuthorizedSender(ctx.senderAuth.jwt, ctx.db.membership.identity.find(ctx.sender));
    if (!isHotbarSlot(request.hotbarIndex)) throw new SenderError('index_out_of_capacity');
    if (request.container === 'hotbar' && request.index === request.hotbarIndex) return;
    const menu = loadOpenMenuInventory(ctx);
    const source = menu.containers[request.container]?.slots[request.index] ?? null;
    const hotbar = menu.containers.hotbar!.slots[request.hotbarIndex] ?? null;
    if (source === null && hotbar === null) return;
    const fromContainer = source === null ? 'hotbar' : request.container;
    const fromIndex = source === null ? request.hotbarIndex : request.index;
    const toContainer = source === null ? request.container : 'hotbar';
    const toIndex = source === null ? request.index : request.hotbarIndex;
    const moved = moveItemStacks(menu.containers, {
      fromContainer, fromIndex, toContainer, toIndex,
      quantity: (source ?? hotbar)!.quantity,
    });
    if (!moved.ok) throw new SenderError(moved.code);
    writeOpenMenuInventory(ctx, menu, moved.containers);
    refreshSenderQuestsFromInventory(ctx);
  },
);

export const quickMoveMenuItem = spacetimedb.reducer(
  { fromContainer: t.string(), fromIndex: t.u8(), toContainers: t.array(t.string()) },
  (ctx, request) => {
    requireAuthorizedSender(ctx.senderAuth.jwt, ctx.db.membership.identity.find(ctx.sender));
    const menu = loadOpenMenuInventory(ctx);
    const result = quickMoveItemStack(menu.containers, request);
    if (!result.ok) throw new SenderError(result.code);
    writeOpenMenuInventory(ctx, menu, result.containers);
    refreshSenderQuestsFromInventory(ctx);
  },
);

export const quickMoveAllMenuItems = spacetimedb.reducer(
  { itemKind: t.string(), fromContainers: t.array(t.string()), toContainers: t.array(t.string()) },
  (ctx, request) => {
    requireAuthorizedSender(ctx.senderAuth.jwt, ctx.db.membership.identity.find(ctx.sender));
    const menu = loadOpenMenuInventory(ctx);
    const result = quickMoveAllMatchingStacks(menu.containers, request);
    if (!result.ok) throw new SenderError(result.code);
    writeOpenMenuInventory(ctx, menu, result.containers);
    refreshSenderQuestsFromInventory(ctx);
  },
);

export const throwMenuItem = spacetimedb.reducer(
  { container: t.string(), index: t.u8(), wholeStack: t.bool() },
  (ctx, request) => {
    requireAuthorizedSender(ctx.senderAuth.jwt, ctx.db.membership.identity.find(ctx.sender));
    const menu = loadOpenMenuInventory(ctx);
    const stack = menu.containers[request.container]?.slots[request.index] ?? null;
    if (stack === null) throw new SenderError('source_empty');
    const position = ctx.db.player_position.identity.find(ctx.sender);
    const clock = ctx.db.world_clock.id.find(0);
    if (position === null || clock === null) throw new SenderError('player_not_ready');
    const quantity = request.wholeStack ? stack.quantity : 1;
    const moved = moveItemStacks({
      ...menu.containers,
      thrown: { id: 'thrown', capacity: 1, slots: [null] },
    }, {
      fromContainer: request.container, fromIndex: request.index,
      toContainer: 'thrown', toIndex: 0, quantity,
    });
    if (!moved.ok) throw new SenderError(moved.code);
    writeOpenMenuInventory(ctx, menu, moved.containers);
    dropWorldItemStack(ctx, {
      itemKind: stack.itemKind, quantity, x: position.x, y: position.y,
      droppedAtTick: clock.authorityTick, durability: storedDurability(stack.itemKind, stack.durability),
      lit: storedLit(stack.itemKind, stack.lit), spaceId: position.spaceId,
    });
    refreshSenderQuestsFromInventory(ctx);
  },
);

function dropCursorStack(ctx: WorldReducerContext, button: 'left' | 'right'): void {
  const cursor = playerInventoryCursor(ctx, ctx.sender);
  if (cursor === null) throw new SenderError('source_empty');
  const position = ctx.db.player_position.identity.find(ctx.sender);
  const clock = ctx.db.world_clock.id.find(0);
  if (position === null || clock === null) throw new SenderError('player_not_ready');
  const quantity = button === 'right' ? 1 : cursor.quantity;
  dropWorldItemStack(ctx, {
    itemKind: cursor.itemKind, quantity, x: position.x, y: position.y,
    droppedAtTick: clock.authorityTick, durability: storedDurability(cursor.itemKind, cursor.durability),
    lit: storedLit(cursor.itemKind, cursor.lit), spaceId: position.spaceId,
  });
  writePlayerInventoryCursor(ctx, ctx.sender, quantity === cursor.quantity
    ? null
    : { ...cursor, quantity: cursor.quantity - quantity });
  refreshSenderQuestsFromInventory(ctx);
}

export const dropInventoryCursor = spacetimedb.reducer(
  { button: t.string() },
  (ctx, { button }) => {
    requireAuthorizedSender(ctx.senderAuth.jwt, ctx.db.membership.identity.find(ctx.sender));
    if (button !== 'left' && button !== 'right') throw new SenderError('invalid_click_button');
    dropCursorStack(ctx, button);
  },
);

function returnInventoryCursorToStorage(ctx: WorldReducerContext, identity: WorldReducerContext['sender']): void {
  const cursor = playerInventoryCursor(ctx, identity);
  if (cursor === null) return;
  const inventory = loadPlayerInventory(ctx, identity);
  const moved = quickMoveItemStack({
    ...inventory.containers,
    cursor: { id: 'cursor', capacity: 1, slots: [cursor] },
  }, { fromContainer: 'cursor', fromIndex: 0, toContainers: ['hotbar', 'backpack'] });
  if (moved.ok) {
    writePlayerInventory(ctx, inventory.rowBySlot, inventory.containers, moved.containers);
    const remainder = moved.containers.cursor!.slots[0];
    if (remainder != null) stashOverflow(ctx, identity, remainder);
  } else if (moved.code === 'container_full') {
    stashOverflow(ctx, identity, cursor);
  } else {
    throw new SenderError(moved.code);
  }
  writePlayerInventoryCursor(ctx, identity, null);
}

export const returnInventoryCursor = spacetimedb.reducer({}, (ctx) => {
  requireAuthorizedSender(ctx.senderAuth.jwt, ctx.db.membership.identity.find(ctx.sender));
  returnInventoryCursorToStorage(ctx, ctx.sender);
  refreshSenderQuestsFromInventory(ctx);
});

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
      const capacity = accessibleInventoryContainerCapacity(id, hasBackpack, playerDebugBackpackSlots(ctx, ctx.sender));
      const offset = inventorySlotOffset(id);
      return {
        id,
        capacity,
        slots: Array.from({ length: capacity }, (_, index) => {
          const row = rowBySlot.get(offset + index);
          return row === undefined ? null : storedStack(row.itemKind, row.quantity, row.durability, row.lit);
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
        if (sameStoredStack(previous, next)) continue;
        const row = rowBySlot.get(offset + index);
        if (row === undefined) throw new SenderError('inventory_slot_missing');
        ctx.db.inventory_slot.id.update({
          ...row,
          itemKind: next?.itemKind ?? 'empty',
          quantity: next?.quantity ?? 0,
        durability: storedDurability(next?.itemKind ?? 'empty', next?.durability),
        lit: storedLit(next?.itemKind ?? 'empty', next?.lit),
      });
      }
    }
    const survival = ctx.db.player_survival.identity.find(ctx.sender);
    const position = ctx.db.player_position.identity.find(ctx.sender);
    if (survival !== null && position !== null) {
      const selected = result.containers.hotbar!.slots[survival.selectedSlot];
      ctx.db.player_position.identity.update({ ...position, equippedKind: selected?.itemKind ?? 'empty', equippedLit: storedLit(selected?.itemKind ?? 'empty', selected?.lit) });
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
      const capacity = accessibleInventoryContainerCapacity(id, hasBackpack, playerDebugBackpackSlots(ctx, ctx.sender)); const offset = inventorySlotOffset(id);
      return { id, capacity, slots: Array.from({ length: capacity }, (_, index) => {
        const row = rowBySlot.get(offset + index);
        return row === undefined ? null : storedStack(row.itemKind, row.quantity, row.durability, row.lit);
      }), ...(id === 'equipment' ? { restrictions: EQUIPMENT_RESTRICTIONS } : {}) };
    };
    const containers = { hotbar: container('hotbar'), backpack: container('backpack'), equipment: container('equipment'), crafting: container('crafting') };
    const result = quickMoveItemStack(containers, request);
    if (!result.ok) throw new SenderError(result.code);
    for (const containerId of ['hotbar', 'backpack', 'equipment', 'crafting'] as const) {
      const before = containers[containerId]; const after = result.containers[containerId]!; const offset = inventorySlotOffset(containerId);
      for (let index = 0; index < after.capacity; index += 1) {
        const previous = before.slots[index]; const next = after.slots[index];
        if (sameStoredStack(previous, next)) continue;
        const row = rowBySlot.get(offset + index); if (row === undefined) throw new SenderError('inventory_slot_missing');
        ctx.db.inventory_slot.id.update({
          ...row, itemKind: next?.itemKind ?? 'empty', quantity: next?.quantity ?? 0,
        durability: storedDurability(next?.itemKind ?? 'empty', next?.durability),
        lit: storedLit(next?.itemKind ?? 'empty', next?.lit),
      });
      }
    }
    const survival = ctx.db.player_survival.identity.find(ctx.sender); const position = ctx.db.player_position.identity.find(ctx.sender);
    if (survival !== null && position !== null) {
      const selected = ctx.db.inventory_slot.id.find(`${ctx.sender.toHexString()}:${survival.selectedSlot}`);
      ctx.db.player_position.identity.update({ ...position, equippedKind: selected?.itemKind ?? 'empty', equippedLit: storedLit(selected?.itemKind ?? 'empty', selected?.lit) });
    }
  },
);

export const quickMoveAllInventoryItems = spacetimedb.reducer(
  { itemKind: t.string(), fromContainers: t.array(t.string()), toContainers: t.array(t.string()) },
  (ctx, request) => {
    requireAuthorizedSender(ctx.senderAuth.jwt, ctx.db.membership.identity.find(ctx.sender));
    if ([...request.fromContainers, ...request.toContainers].some((id) => !isInventoryContainerId(id))) {
      throw new SenderError('container_not_found');
    }
    const inventory = loadPlayerInventory(ctx, ctx.sender);
    const result = quickMoveAllMatchingStacks(inventory.containers, request);
    if (!result.ok) throw new SenderError(result.code);
    writePlayerInventory(ctx, inventory.rowBySlot, inventory.containers, result.containers);
    const survival = ctx.db.player_survival.identity.find(ctx.sender);
    const position = ctx.db.player_position.identity.find(ctx.sender);
    if (survival !== null && position !== null) {
      const selected = result.containers.hotbar!.slots[survival.selectedSlot];
      ctx.db.player_position.identity.update({ ...position, equippedKind: selected?.itemKind ?? 'empty', equippedLit: storedLit(selected?.itemKind ?? 'empty', selected?.lit) });
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
      const capacity = accessibleInventoryContainerCapacity(id, hasBackpack, playerDebugBackpackSlots(ctx, ctx.sender)); const offset = inventorySlotOffset(id);
      return { id, capacity, slots: Array.from({ length: capacity }, (_, index) => {
        const row = rowBySlot.get(offset + index);
        return row === undefined ? null : storedStack(row.itemKind, row.quantity, row.durability, row.lit);
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
        if (sameStoredStack(previous, next)) continue;
        const row = rowBySlot.get(offset + index); if (row === undefined) throw new SenderError('inventory_slot_missing');
        ctx.db.inventory_slot.id.update({
          ...row, itemKind: next?.itemKind ?? 'empty', quantity: next?.quantity ?? 0,
        durability: storedDurability(next?.itemKind ?? 'empty', next?.durability),
        lit: storedLit(next?.itemKind ?? 'empty', next?.lit),
      });
      }
    }
    const survival = ctx.db.player_survival.identity.find(ctx.sender); const position = ctx.db.player_position.identity.find(ctx.sender);
    if (survival !== null && position !== null) {
      const selected = ctx.db.inventory_slot.id.find(`${ctx.sender.toHexString()}:${survival.selectedSlot}`);
      ctx.db.player_position.identity.update({ ...position, equippedKind: selected?.itemKind ?? 'empty', equippedLit: storedLit(selected?.itemKind ?? 'empty', selected?.lit) });
    }
  },
);

export const craftInventoryRecipe = spacetimedb.reducer(
  { recipeId: t.string(), craftAll: t.bool() },
  (ctx, { recipeId, craftAll }) => {
    requireAuthorizedSender(ctx.senderAuth.jwt, ctx.db.membership.identity.find(ctx.sender));
    const requestedRecipe = recipeDefinition(recipeId);
    if (requestedRecipe?.station !== undefined) {
      const position = ctx.db.player_position.identity.find(ctx.sender);
      if (position === null) throw new SenderError('player_not_ready');
      const playerTileX = Math.floor(position.x / TILE_SIZE_FIXED);
      const playerTileY = Math.floor(position.y / TILE_SIZE_FIXED);
      const stationInReach = [...ctx.db.world_placeable.by_chunk.filter(position.spaceId)].some((row) => (
        row.carriedBy === undefined
        && placeableDefinition(row.kind)?.station === requestedRecipe.station
        && craftingStationWithinReach(
          { spaceId: position.spaceId, tileX: playerTileX, tileY: playerTileY },
          row,
          CRAFTING_STATION_REACH_TILES,
        )
      ));
      if (!stationInReach) throw new SenderError('station_required');
    }
    const rows = [...ctx.db.inventory_slot.by_identity.filter(ctx.sender)];
    const rowBySlot = new Map(rows.map((row) => [row.slot, row]));
    const hasBackpack = rows.some((row) => row.itemKind === 'backpack' && row.quantity > 0);
    const make = (id: InventoryContainerId): ContainerSnapshot => {
      const capacity = accessibleInventoryContainerCapacity(id, hasBackpack, playerDebugBackpackSlots(ctx, ctx.sender)); const offset = inventorySlotOffset(id);
      return { id, capacity, slots: Array.from({ length: capacity }, (_, index) => {
        const row = rowBySlot.get(offset + index);
        return row === undefined ? null : storedStack(row.itemKind, row.quantity, row.durability, row.lit);
      }) };
    };
    const original = { crafting: make('crafting'), hotbar: make('hotbar'), backpack: make('backpack') };
    let results = original;
    const originalCursor = playerInventoryCursor(ctx, ctx.sender);
    let cursor = originalCursor;
    let craftedQuantity = 0;
    let craftingActions = 0;
    let craftedItemKind: string | null = null;
    let craftedAtLeastOnce = false;
    while (matchingRecipeId(results.crafting) === recipeId) {
      const consumed = consumeCraftingRecipe(results.crafting, recipeId);
      if (!consumed.ok) break;
      const maximum = maxStackFor(consumed.crafted.itemKind);
      if (maximum === null) throw new SenderError('unknown_item_kind');
      if (craftAll) {
        const inserted = quickMoveItemStack({
          output: { id: 'output', capacity: 1, slots: [consumed.crafted] },
          hotbar: results.hotbar,
          backpack: results.backpack,
        }, { fromContainer: 'output', fromIndex: 0, toContainers: ['hotbar', 'backpack'] });
        if (!inserted.ok || inserted.movedQuantity !== consumed.crafted.quantity) break;
        results = {
          crafting: consumed.container,
          hotbar: inserted.containers.hotbar!,
          backpack: inserted.containers.backpack!,
        };
      } else {
        if (cursor !== null && (!itemStacksCompatible(cursor, consumed.crafted)
          || cursor.quantity + consumed.crafted.quantity > maximum)) break;
        cursor = cursor === null
          ? { ...consumed.crafted }
          : { ...cursor, quantity: cursor.quantity + consumed.crafted.quantity };
        results = { ...results, crafting: consumed.container };
      }
      craftedQuantity += consumed.crafted.quantity;
      craftingActions += 1;
      craftedItemKind = consumed.crafted.itemKind;
      craftedAtLeastOnce = true;
      if (!craftAll) break;
    }
    if (!craftAll) writePlayerInventoryCursor(ctx, ctx.sender, cursor);
    if (!craftedAtLeastOnce) {
      if (matchingRecipeId(original.crafting) !== recipeId) throw new SenderError('recipe_inputs_missing');
      throw new SenderError('recipe_output_blocked');
    }
    for (const containerId of ['crafting', 'hotbar', 'backpack'] as const) {
      const before = original[containerId];
      const after = results[containerId]; const offset = inventorySlotOffset(containerId);
      for (let index = 0; index < after.capacity; index += 1) {
        const previous = before.slots[index]; const next = after.slots[index];
        if (sameStoredStack(previous, next)) continue;
        const row = rowBySlot.get(offset + index); if (row === undefined) throw new SenderError('inventory_slot_missing');
        ctx.db.inventory_slot.id.update({
          ...row, itemKind: next?.itemKind ?? 'empty', quantity: next?.quantity ?? 0,
        durability: storedDurability(next?.itemKind ?? 'empty', next?.durability),
        lit: storedLit(next?.itemKind ?? 'empty', next?.lit),
      });
      }
    }
    const survival = ctx.db.player_survival.identity.find(ctx.sender); const position = ctx.db.player_position.identity.find(ctx.sender);
    if (survival !== null && position !== null) {
      const selected = ctx.db.inventory_slot.id.find(`${ctx.sender.toHexString()}:${survival.selectedSlot}`);
      ctx.db.player_position.identity.update({ ...position, equippedKind: selected?.itemKind ?? 'empty', equippedLit: storedLit(selected?.itemKind ?? 'empty', selected?.lit) });
    }
    if (craftedItemKind !== null) {
      const authorityTick = ctx.db.world_clock.id.find(0)?.authorityTick ?? 0n;
      recordPlayerStatistic(ctx, ctx.sender, 'crafting_actions', BigInt(craftingActions), authorityTick);
      recordPlayerStatistic(ctx, ctx.sender, 'items_crafted', BigInt(craftedQuantity), authorityTick, craftedItemKind);
      recordPlayerStatistic(ctx, ctx.sender, 'items_obtained', BigInt(craftedQuantity), authorityTick, craftedItemKind);
      recordPlayerStatistic(ctx, ctx.sender, 'largest_craft_batch', BigInt(craftedQuantity), authorityTick, craftedItemKind);
    }
  },
);

/** Crafting cells are transient work space, never persistent storage. Closing
 * returns every input to accessible inventory cells; anything that cannot fit
 * enters durable overflow custody rather than depending on a ground drop. */
export const closeCrafting = spacetimedb.reducer({}, (ctx) => {
  requireAuthorizedSender(ctx.senderAuth.jwt, ctx.db.membership.identity.find(ctx.sender));
  const position = ctx.db.player_position.identity.find(ctx.sender);
  if (position === null) throw new SenderError('player_not_ready');
  const rows = [...ctx.db.inventory_slot.by_identity.filter(ctx.sender)];
  const rowBySlot = new Map(rows.map((row) => [row.slot, row]));
  const hasBackpack = rows.some((row) => row.itemKind === 'backpack' && row.quantity > 0);
  const make = (id: 'hotbar' | 'backpack' | 'crafting'): ContainerSnapshot => {
    const capacity = accessibleInventoryContainerCapacity(id, hasBackpack, playerDebugBackpackSlots(ctx, ctx.sender));
    const offset = inventorySlotOffset(id);
    return { id, capacity, slots: Array.from({ length: capacity }, (_, index) => {
      const row = rowBySlot.get(offset + index);
      return row === undefined || row.itemKind === 'empty' || row.quantity === 0
        ? null
        : storedStack(row.itemKind, row.quantity, row.durability, row.lit);
    }) };
  };
  const original = { hotbar: make('hotbar'), backpack: make('backpack'), crafting: make('crafting') };
  let containers: Readonly<Record<string, ContainerSnapshot>> = original;
  const overflow: { readonly itemKind: string; readonly quantity: number }[] = [];
  for (let index = 0; index < CRAFTING_SLOT_COUNT; index += 1) {
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
      if (sameStoredStack(previous, next)) continue;
      const row = rowBySlot.get(offset + index);
      if (row === undefined) throw new SenderError('inventory_slot_missing');
      ctx.db.inventory_slot.id.update({
        ...row, itemKind: next?.itemKind ?? 'empty', quantity: next?.quantity ?? 0,
        durability: storedDurability(next?.itemKind ?? 'empty', next?.durability),
        lit: storedLit(next?.itemKind ?? 'empty', next?.lit),
      });
    }
  }
  overflow.forEach((stack) => stashOverflow(ctx, ctx.sender, stack));
  const survival = ctx.db.player_survival.identity.find(ctx.sender);
  if (survival !== null) {
    const selected = containers.hotbar?.slots[survival.selectedSlot];
      ctx.db.player_position.identity.update({ ...position, equippedKind: selected?.itemKind ?? 'empty', equippedLit: storedLit(selected?.itemKind ?? 'empty', selected?.lit) });
  }
});

function tileOverlapsAnyPlayer(
  ctx: WorldReducerContext,
  spaceId: number,
  tileX: number,
  tileY: number,
): boolean {
  const tileBounds = tileTargetBounds({ tileX, tileY });
  return [...ctx.db.player_position.iter()].some((player) => {
    if (player.spaceId !== spaceId) return false;
    if (ctx.db.player_public.identity.find(player.identity)?.online !== true) return false;
    return boundsOverlap(tileBounds, playerHitboxBounds({ x: player.x, y: player.y }));
  });
}

function tileOverlapsAnyOtherPlayer(
  ctx: WorldReducerContext,
  identity: WorldReducerContext['sender'],
  spaceId: number,
  tileX: number,
  tileY: number,
): boolean {
  const identityHex = identity.toHexString();
  const tileBounds = tileTargetBounds({ tileX, tileY });
  return [...ctx.db.player_position.iter()].some((player) => (
    player.identity.toHexString() !== identityHex
    && player.spaceId === spaceId
    && ctx.db.player_public.identity.find(player.identity)?.online === true
    && boundsOverlap(tileBounds, playerHitboxBounds({ x: player.x, y: player.y }))
  ));
}

function requireChestPlacementTile(
  ctx: WorldReducerContext,
  position: { readonly x: number; readonly y: number; readonly spaceId: number },
  tileX: number,
  tileY: number,
): void {
  const collision = collisionForSpace(ctx, position.spaceId);
  const result = tilePlacementResult(
    position.x,
    position.y,
    tileX,
    tileY,
    collision,
    tileOverlapsAnyPlayer(ctx, position.spaceId, tileX, tileY),
  );
  if (result === 'invalid_tile') throw new SenderError('invalid_chest_tile');
  if (result === 'out_of_range') throw new SenderError('chest_out_of_range');
  if (result === 'tile_blocked') throw new SenderError('chest_tile_blocked');
}

function requirePlaceablePlacementTile(
  ctx: WorldReducerContext,
  position: { readonly x: number; readonly y: number; readonly spaceId: number },
  tileX: number,
  tileY: number,
): void {
  const result = tilePlacementResult(
    position.x,
    position.y,
    tileX,
    tileY,
    collisionForSpace(ctx, position.spaceId),
    tileOverlapsAnyPlayer(ctx, position.spaceId, tileX, tileY),
  );
  if (result !== 'ok') throw new SenderError('placement_blocked');
}

function insertPlayerCarriedItem(
  ctx: WorldReducerContext,
  itemKind: string,
  quantity: number,
): boolean {
  const inventory = loadPlayerInventory(ctx, ctx.sender);
  const sourceId = 'placeable-pickup';
  const moved = quickMoveItemStack({
    ...inventory.containers,
    [sourceId]: { id: sourceId, capacity: 1, slots: [{ itemKind, quantity }] },
  }, { fromContainer: sourceId, fromIndex: 0, toContainers: ['hotbar', 'backpack'] });
  if (!moved.ok || moved.movedQuantity !== quantity) return false;
  writePlayerInventory(ctx, inventory.rowBySlot, inventory.containers, {
    ...inventory.containers,
    hotbar: moved.containers.hotbar!,
    backpack: moved.containers.backpack!,
  });
  return true;
}

function removePlayerCarriedItem(
  ctx: WorldReducerContext,
  itemKind: string,
  quantity: number,
): void {
  if (!Number.isSafeInteger(quantity) || quantity <= 0) throw new SenderError('invalid_item_quantity');
  const rows = [...ctx.db.inventory_slot.by_identity.filter(ctx.sender)]
    .filter((row) => row.itemKind === itemKind && row.quantity > 0)
    .sort((left, right) => left.slot - right.slot);
  const cursor = ctx.db.inventory_cursor.identity.find(ctx.sender);
  const available = rows.reduce((sum, row) => sum + row.quantity, 0)
    + (cursor?.itemKind === itemKind ? cursor.quantity : 0);
  if (available < quantity) throw new SenderError('quest_delivery_items_missing');
  let remaining = quantity;
  for (const row of rows) {
    if (remaining === 0) break;
    const removed = Math.min(remaining, row.quantity);
    const nextQuantity = row.quantity - removed;
    ctx.db.inventory_slot.id.update({
      ...row,
      itemKind: nextQuantity === 0 ? 'empty' : row.itemKind,
      quantity: nextQuantity,
      durability: nextQuantity === 0 ? 0 : row.durability,
      lit: nextQuantity === 0 ? true : row.lit,
    });
    remaining -= removed;
  }
  if (remaining > 0 && cursor !== null && cursor.itemKind === itemKind) {
    const nextQuantity = cursor.quantity - remaining;
    if (nextQuantity === 0) ctx.db.inventory_cursor.identity.delete(ctx.sender);
    else ctx.db.inventory_cursor.identity.update({ ...cursor, quantity: nextQuantity });
  }
}

function placeableAtFacingTile(
  ctx: WorldReducerContext,
  position: PlayerPositionRow,
): WorldPlaceableRow | null {
  const target = facingTile(position.x, position.y, position.facing);
  return [...ctx.db.world_placeable.by_chunk.filter(position.spaceId)].find((row) => (
    row.carriedBy === undefined && row.tileX === target.tileX && row.tileY === target.tileY
  )) ?? null;
}

function combatTargetAtFacingTile(
  ctx: WorldReducerContext,
  position: PlayerPositionRow,
): WorldCombatTargetRow | null {
  const faced = facingTile(position.x, position.y, position.facing);
  for (const target of ctx.db.world_combat_target.by_chunk.filter(position.spaceId)) {
    const tile = combatTargetTile(target);
    if (target.carriedBy === undefined && tile.tileX === faced.tileX && tile.tileY === faced.tileY) return target;
  }
  return null;
}

/** F dispatches placement from the selected item's registry tags. Chests keep
 * their carry-with-contents behavior; anvils remain world entities after first
 * placement and are subsequently relocated in the player's hands. */
export const useHands = spacetimedb.reducer(
  { tileX: t.i16(), tileY: t.i16() },
  (ctx, { tileX, tileY }) => {
    requireAuthorizedSender(ctx.senderAuth.jwt, ctx.db.membership.identity.find(ctx.sender));
    const position = ctx.db.player_position.identity.find(ctx.sender);
    const survival = ctx.db.player_survival.identity.find(ctx.sender);
    if (position === null || survival === null) throw new SenderError('player_not_ready');
    requireWorldModificationAuthorized(ctx, position);
    if (mountedNpcFor(ctx, ctx.sender) !== null) throw new SenderError('mounted_action_forbidden');
    const carried = carriedChestFor(ctx, ctx.sender);
    const carriedTarget = carriedCombatTargetFor(ctx, ctx.sender);
    const carriedPlaceable = carriedPlaceableFor(ctx, ctx.sender);
    const selected = ctx.db.inventory_slot.id.find(`${ctx.sender.toHexString()}:${survival.selectedSlot}`);
    if (carriedTarget !== null) {
      requireChestPlacementTile(ctx, position, tileX, tileY);
      const placed = combatTargetPositionAtTile(tileX, tileY);
      moveEmbeddedArrowsWithTarget(
        ctx, carriedTarget, placed.x, placed.y, carriedTarget.spaceId,
      );
      ctx.db.world_combat_target.id.update({
        ...carriedTarget,
        ...placed,
        chunkX: chunkAt(placed.x),
        chunkY: chunkAt(placed.y),
        carriedBy: undefined,
        regenTick: ctx.db.world_clock.id.find(0)?.authorityTick ?? carriedTarget.regenTick,
      });
      ctx.db.player_position.identity.update({
        ...position,
        equippedKind: selected?.itemKind ?? 'empty',
        equippedLit: storedLit(selected?.itemKind ?? 'empty', selected?.lit),
      });
      return;
    }
    if (carriedPlaceable !== null) {
      requirePlaceablePlacementTile(ctx, position, tileX, tileY);
      ctx.db.world_placeable.id.update({
        ...carriedPlaceable,
        tileX,
        tileY,
        chunkX: Math.floor(tileX / SURVIVAL_CHUNK_TILES),
        chunkY: Math.floor(tileY / SURVIVAL_CHUNK_TILES),
        spaceId: position.spaceId,
        facing: position.facing,
        carriedBy: undefined,
      });
      ctx.db.player_position.identity.update({
        ...position,
        equippedKind: selected?.itemKind ?? 'empty',
        equippedLit: storedLit(selected?.itemKind ?? 'empty', selected?.lit),
      });
      recordPlayerStatistic(
        ctx, ctx.sender, 'placeables_placed', 1n,
        ctx.db.world_clock.id.find(0)?.authorityTick ?? 0n,
        carriedPlaceable.kind,
      );
      return;
    }
    if (selected?.itemKind === 'homestead_deed' && selected.quantity > 0) {
      if (position.spaceId !== TOPSIDE_SPACE_ID) throw new SenderError('homestead_topside_only');
      if (homesteadForOwner(ctx, ctx.sender) !== null) throw new SenderError('homestead_already_established');
      requirePlaceablePlacementTile(ctx, position, tileX, tileY);
      const collision = collisionForSpace(ctx, TOPSIDE_SPACE_ID);
      const footprint = homesteadMarkerPlacementTiles(tileX, tileY);
      if (footprint.some((tile) => tile.tileX < 1 || tile.tileY < 1 || tile.tileX >= collision.width - 1
        || tile.tileY >= collision.height - 1 || collision.blocked[tile.tileY * collision.width + tile.tileX]
        || collision.obstacles?.some((obstacle) => boundsOverlap(tileTargetBounds(tile), obstacle))
        || tileOverlapsAnyOtherPlayer(ctx, ctx.sender, TOPSIDE_SPACE_ID, tile.tileX, tile.tileY))) {
        throw new SenderError('homestead_site_blocked');
      }
      for (const other of ctx.db.homestead.iter()) {
        if (Math.abs(other.overworldTileX - tileX) <= 4 && Math.abs(other.overworldTileY - tileY) <= 4) {
          throw new SenderError('homestead_site_blocked');
        }
      }
      const ownerName = ctx.db.player_public.identity.find(ctx.sender)?.displayName ?? 'Farmer';
      const spaceId = nextHomesteadSpaceId(ctx);
      const residenceSpaceId = nextResidenceSpacePair(ctx);
      const authorityTick = ctx.db.world_clock.id.find(0)?.authorityTick ?? 0n;
      ctx.db.homestead.insert({
        spaceId, owner: ctx.sender, ownerName, overworldTileX: tileX, overworldTileY: tileY,
        sizeTier: 0, siteSeed: ((tileX * 73_856_093) ^ (tileY * 19_349_663) ^ spaceId) >>> 0,
        accessMode: 'owner_gate', establishedTick: authorityTick, residenceSpaceId, gateOpen: false,
      });
      ctx.db.space_portal.insert({
        id: spaceId * 2, kind: `homestead_enter:${ownerName}`, fromSpace: TOPSIDE_SPACE_ID,
        fromTileX: tileX, fromTileY: tileY + 1, toSpace: spaceId,
        toTileX: HOMESTEAD_ENTRY_TILE.tileX, toTileY: HOMESTEAD_ENTRY_TILE.tileY,
      });
      installHomesteadChildSpaces(ctx);
      ctx.db.space_portal.insert({
        id: spaceId * 2 + 1, kind: `homestead_exit:${ownerName}`, fromSpace: spaceId,
        fromTileX: HOMESTEAD_EXIT_TILE.tileX, fromTileY: HOMESTEAD_EXIT_TILE.tileY,
        toSpace: TOPSIDE_SPACE_ID, toTileX: tileX, toTileY: tileY + 2,
      });
      ctx.db.inventory_slot.id.update({ ...selected, itemKind: 'empty', quantity: 0, durability: 0 });
      ctx.db.player_position.identity.update({ ...position, equippedKind: 'empty', equippedLit: true });
      return;
    }
    if (carried !== null) {
      requireChestPlacementTile(ctx, position, tileX, tileY);
      ctx.db.world_chest.id.update({
        ...carried, tileX, tileY,
        chunkX: Math.floor(tileX / SURVIVAL_CHUNK_TILES), chunkY: Math.floor(tileY / SURVIVAL_CHUNK_TILES),
        carriedBy: undefined,
      });
      ctx.db.player_position.identity.update({ ...position, equippedKind: selected?.itemKind ?? 'empty', equippedLit: storedLit(selected?.itemKind ?? 'empty', selected?.lit) });
      recordPlayerStatistic(
        ctx, ctx.sender, 'chests_placed', 1n,
        ctx.db.world_clock.id.find(0)?.authorityTick ?? 0n,
      );
      return;
    }

    const facedCombatTarget = combatTargetAtFacingTile(ctx, position);
    if (facedCombatTarget !== null) {
      moveEmbeddedArrowsWithTarget(
        ctx, facedCombatTarget, position.x, position.y, position.spaceId,
      );
      ctx.db.world_combat_target.id.update({
        ...facedCombatTarget,
        x: position.x,
        y: position.y,
        chunkX: position.chunkX,
        chunkY: position.chunkY,
        carriedBy: ctx.sender,
      });
      ctx.db.player_position.identity.update({
        ...position,
        equippedKind: 'empty',
        equippedLit: true,
        actionKind: 'none',
      });
      return;
    }

    if (selected?.itemKind === 'chest' && selected.quantity > 0) {
      requireChestPlacementTile(ctx, position, tileX, tileY);
      const chest = ctx.db.world_chest.insert({
        id: 0n, owner: ctx.sender, tileX, tileY,
        chunkX: Math.floor(tileX / SURVIVAL_CHUNK_TILES), chunkY: Math.floor(tileY / SURVIVAL_CHUNK_TILES), carriedBy: undefined,
        spaceId: position.spaceId,
      });
      for (let slot = 0; slot < CHEST_STORAGE_CAPACITY; slot += 1) ctx.db.world_chest_slot.insert({
        id: `${chest.id}:${slot}`, chestId: chest.id, slot, itemKind: 'empty', quantity: 0, durability: 0, lit: true,
      });
      ctx.db.inventory_slot.id.update({
        ...selected,
        itemKind: selected.quantity === 1 ? 'empty' : selected.itemKind,
        quantity: selected.quantity - 1,
        durability: selected.quantity === 1 ? 0 : selected.durability,
      });
      ctx.db.player_position.identity.update({ ...position, equippedKind: selected.quantity === 1 ? 'empty' : 'chest', equippedLit: true });
      recordPlayerStatistic(
        ctx, ctx.sender, 'chests_placed', 1n,
        ctx.db.world_clock.id.find(0)?.authorityTick ?? 0n,
      );
      return;
    }

    const selectedDefinition = selected === null ? null : itemDefinition(selected.itemKind);
    const selectedPlaceable = selected === null ? null : placeableDefinition(selected.itemKind);
    if (selected !== null && selected.quantity > 0
      && selectedDefinition?.tags.includes('item.placeable') === true
      && selectedPlaceable !== null) {
      requirePlaceablePlacementTile(ctx, position, tileX, tileY);
      const placed = ctx.db.world_placeable.insert({
        id: 0n,
        kind: selected.itemKind,
        tileX,
        tileY,
        chunkX: Math.floor(tileX / SURVIVAL_CHUNK_TILES),
        chunkY: Math.floor(tileY / SURVIVAL_CHUNK_TILES),
        spaceId: position.spaceId,
        carriedBy: undefined,
        placedBy: ctx.sender,
        facing: position.facing,
        open: false,
        lit: true,
        smeltStartTick: undefined,
      });
      for (let slot = 0; slot < selectedPlaceable.slotCapacity; slot += 1) {
        ctx.db.world_placeable_slot.insert({
          id: `${placed.id}:${slot}`,
          placeableId: placed.id,
          slot,
          itemKind: 'empty',
          quantity: 0,
          durability: 0,
          lit: true,
        });
      }
      const remaining = selected.quantity - 1;
      ctx.db.inventory_slot.id.update({
        ...selected,
        itemKind: remaining === 0 ? 'empty' : selected.itemKind,
        quantity: remaining,
        durability: remaining === 0 ? 0 : selected.durability,
      });
      ctx.db.player_position.identity.update({
        ...position,
        equippedKind: remaining === 0 ? 'empty' : selected.itemKind,
        equippedLit: storedLit(remaining === 0 ? 'empty' : selected.itemKind, selected.lit),
      });
      recordPlayerStatistic(
        ctx, ctx.sender, 'placeables_placed', 1n,
        ctx.db.world_clock.id.find(0)?.authorityTick ?? 0n,
        selected.itemKind,
      );
      return;
    }

    const targetPlaceable = placeableAtFacingTile(ctx, position);
    if (targetPlaceable !== null) {
      const slots = [...ctx.db.world_placeable_slot.by_placeable.filter(targetPlaceable.id)];
      if (slots.some((slot) => slot.itemKind !== 'empty' && slot.quantity > 0)) {
        throw new SenderError('placeable_not_empty');
      }
      for (const active of ctx.db.active_placeable.by_placeable.filter(targetPlaceable.id)) {
        ctx.db.active_placeable.identity.delete(active.identity);
      }
      if (targetPlaceable.kind === 'anvil') {
        ctx.db.world_placeable.id.update({
          ...targetPlaceable,
          tileX: Math.floor(position.x / TILE_SIZE_FIXED),
          tileY: Math.floor(position.y / TILE_SIZE_FIXED),
          chunkX: position.chunkX,
          chunkY: position.chunkY,
          carriedBy: ctx.sender,
        });
        ctx.db.player_position.identity.update({
          ...position,
          equippedKind: 'empty',
          equippedLit: true,
          actionKind: 'none',
        });
        return;
      }
      if (!insertPlayerCarriedItem(ctx, targetPlaceable.kind, 1)) throw new SenderError('inventory_full');
      for (const slot of slots) ctx.db.world_placeable_slot.id.delete(slot.id);
      ctx.db.world_placeable.id.delete(targetPlaceable.id);
      return;
    }

    const target = facingTile(position.x, position.y, position.facing);
    const definition = spaceDefinitionFor(position.spaceId, homesteadForSpace(ctx, position.spaceId));
    if (definition === undefined || target.tileX < 0 || target.tileY < 0
      || target.tileX >= definition.sizeTiles || target.tileY >= definition.sizeTiles) {
      throw new SenderError('invalid_chest_tile');
    }

    const targetChest = [...ctx.db.world_chest.by_chunk.filter(position.spaceId)].find((chest) => chest.carriedBy === undefined
      && chest.tileX === target.tileX && chest.tileY === target.tileY);
    if (targetChest !== undefined) {
      const slots = [...ctx.db.world_chest_slot.by_chest.filter(targetChest.id)];
      const hasContents = slots.some((slot) => slot.itemKind !== 'empty' && slot.quantity > 0);
      if (ctx.db.world_chest_damage.chestId.find(targetChest.id) !== null) {
        ctx.db.world_chest_damage.chestId.delete(targetChest.id);
      }
      const active = ctx.db.active_chest.identity.find(ctx.sender);
      if (active !== null) ctx.db.active_chest.identity.delete(ctx.sender);
      if (hasContents) {
        ctx.db.world_chest.id.update({ ...targetChest, carriedBy: ctx.sender });
      ctx.db.player_position.identity.update({ ...position, equippedKind: 'empty', equippedLit: true, actionKind: 'none' });
        recordPlayerStatistic(
          ctx, ctx.sender, 'chests_picked_up', 1n,
          ctx.db.world_clock.id.find(0)?.authorityTick ?? 0n,
        );
        return;
      }
      const rows = [...ctx.db.inventory_slot.by_identity.filter(ctx.sender)];
      const rowBySlot = new Map(rows.map((row) => [row.slot, row]));
      const hasBackpack = rows.some((row) => row.itemKind === 'backpack' && row.quantity > 0);
      const make = (id: 'hotbar' | 'backpack'): ContainerSnapshot => {
        const capacity = accessibleInventoryContainerCapacity(id, hasBackpack, playerDebugBackpackSlots(ctx, ctx.sender)); const offset = inventorySlotOffset(id);
        return { id, capacity, slots: Array.from({ length: capacity }, (_, index) => {
          const row = rowBySlot.get(offset + index);
          return row === undefined ? null : storedStack(row.itemKind, row.quantity, row.durability, row.lit);
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
          if (sameStoredStack(previous, next)) continue;
          const row = rowBySlot.get(offset + index); if (row !== undefined) ctx.db.inventory_slot.id.update({
            ...row, itemKind: next?.itemKind ?? 'empty', quantity: next?.quantity ?? 0,
        durability: storedDurability(next?.itemKind ?? 'empty', next?.durability),
        lit: storedLit(next?.itemKind ?? 'empty', next?.lit),
      });
        }
      }
      for (const slot of slots) ctx.db.world_chest_slot.id.delete(slot.id);
      ctx.db.world_chest.id.delete(targetChest.id);
      recordPlayerStatistic(
        ctx, ctx.sender, 'chests_picked_up', 1n,
        ctx.db.world_clock.id.find(0)?.authorityTick ?? 0n,
      );
      return;
    }
    throw new SenderError('hands_empty');
  },
);

/** E: open the nearest chest inside the shared radial interaction reach. */
export const interactChest = spacetimedb.reducer(
  {},
  (ctx) => {
    requireAuthorizedSender(ctx.senderAuth.jwt, ctx.db.membership.identity.find(ctx.sender));
    const position = ctx.db.player_position.identity.find(ctx.sender); if (position === null) throw new SenderError('player_not_ready');
    if (mountedNpcFor(ctx, ctx.sender) !== null) throw new SenderError('mounted_action_forbidden');
    const chest = nearestTileTarget(
      position.x,
      position.y,
      [...ctx.db.world_chest.by_chunk.filter(position.spaceId)]
        .filter((row) => row.carriedBy === undefined),
      CHEST_INTERACTION_REACH_FIXED,
    );
    if (chest === null) throw new SenderError('chest_not_found');
    ensureChestStorageRows(ctx, chest.id);
    if (ctx.db.active_placeable.identity.find(ctx.sender) !== null) {
      ctx.db.active_placeable.identity.delete(ctx.sender);
    }
    const current = ctx.db.active_chest.identity.find(ctx.sender);
    if (current === null) ctx.db.active_chest.insert({ identity: ctx.sender, chestId: chest.id });
    else ctx.db.active_chest.identity.update({ ...current, chestId: chest.id });
    recordPlayerStatistic(
      ctx, ctx.sender, 'chests_opened', 1n,
      ctx.db.world_clock.id.find(0)?.authorityTick ?? 0n,
    );
  },
);

export const closeChest = spacetimedb.reducer({}, (ctx) => {
  const active = ctx.db.active_chest.identity.find(ctx.sender);
  if (active !== null) ctx.db.active_chest.identity.delete(ctx.sender);
});

/** E toggles gates, opens barrels, or repairs the selected tool at an anvil. */
export const interactPlaceable = spacetimedb.reducer({}, (ctx) => {
  requireAuthorizedSender(ctx.senderAuth.jwt, ctx.db.membership.identity.find(ctx.sender));
  const position = ctx.db.player_position.identity.find(ctx.sender);
  if (position === null) throw new SenderError('player_not_ready');
  if (mountedNpcFor(ctx, ctx.sender) !== null) throw new SenderError('mounted_action_forbidden');
  const placeable = placeableAtFacingTile(ctx, position);
  if (placeable === null) throw new SenderError('placeable_not_found');
  if (placeable.kind === 'fence_gate') {
    requireWorldModificationAuthorized(ctx, position);
    ctx.db.world_placeable.id.update({ ...placeable, open: !placeable.open });
    return;
  }
  if (placeable.kind === 'anvil') {
    repairSelectedToolAtAnvil(ctx);
    return;
  }
  if (placeable.kind !== 'barrel') throw new SenderError('placeable_not_interactable');
  if (ctx.db.active_chest.identity.find(ctx.sender) !== null) ctx.db.active_chest.identity.delete(ctx.sender);
  const active = ctx.db.active_placeable.identity.find(ctx.sender);
  if (active === null) ctx.db.active_placeable.insert({ identity: ctx.sender, placeableId: placeable.id });
  else ctx.db.active_placeable.identity.update({ ...active, placeableId: placeable.id });
});

/** F controls a nearby fire. Authored campfires use radial interaction like
 * their cooking prompt; placed campfires use the normal facing-tile contract.
 * Touching an NPC-managed fire permanently hands its schedule to the player. */
export const toggleCampfire = spacetimedb.reducer(
  { targetKind: t.string(), targetId: t.u64() },
  (ctx, { targetKind, targetId }) => {
    requireAuthorizedSender(ctx.senderAuth.jwt, ctx.db.membership.identity.find(ctx.sender));
    const position = ctx.db.player_position.identity.find(ctx.sender);
    if (position === null) throw new SenderError('player_not_ready');
    if (mountedNpcFor(ctx, ctx.sender) !== null) throw new SenderError('mounted_action_forbidden');
    if (targetKind === 'landmark') {
      const fire = ctx.db.world_campfire_state.id.find(targetId);
      if (fire === null || fire.spaceId !== position.spaceId) throw new SenderError('campfire_not_found');
      const x = fire.tileX * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2;
      const y = fire.tileY * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2;
      const dx = x - position.x;
      const dy = y - position.y;
      if (dx * dx + dy * dy > (2 * TILE_SIZE_FIXED) ** 2) throw new SenderError('campfire_out_of_range');
      requireWorldModificationAuthorized(ctx, position);
      ctx.db.world_campfire_state.id.update({ ...fire, lit: !fire.lit, manualOverride: true });
      return;
    }
    if (targetKind !== 'placeable') throw new SenderError('campfire_target_invalid');
    const fire = ctx.db.world_placeable.id.find(targetId);
    const faced = placeableAtFacingTile(ctx, position);
    if (fire === null || fire.kind !== 'campfire' || faced?.id !== fire.id) throw new SenderError('campfire_not_found');
    requireWorldModificationAuthorized(ctx, position);
    ctx.db.world_placeable.id.update({ ...fire, lit: !fire.lit });
  },
);

export const closePlaceable = spacetimedb.reducer({}, (ctx) => {
  requireAuthorizedSender(ctx.senderAuth.jwt, ctx.db.membership.identity.find(ctx.sender));
  const active = ctx.db.active_placeable.identity.find(ctx.sender);
  if (active !== null) ctx.db.active_placeable.identity.delete(ctx.sender);
});

export const movePlaceableItem = spacetimedb.reducer(
  { fromContainer: t.string(), fromIndex: t.u8(), toContainer: t.string(), toIndex: t.u8(), quantity: t.u16() },
  (ctx, request) => {
    requireAuthorizedSender(ctx.senderAuth.jwt, ctx.db.membership.identity.find(ctx.sender));
    if (![request.fromContainer, request.toContainer].every((id) => id === 'placeable' || isInventoryContainerId(id))) {
      throw new SenderError('container_not_found');
    }
    const active = ctx.db.active_placeable.identity.find(ctx.sender);
    if (active === null) throw new SenderError('placeable_not_open');
    const placeable = ctx.db.world_placeable.id.find(active.placeableId);
    const position = ctx.db.player_position.identity.find(ctx.sender);
    const definition = placeable === null ? null : placeableDefinition(placeable.kind);
    if (placeable === null || position === null || placeable.spaceId !== position.spaceId
      || !chestWithinReach(position.x, position.y, placeable)
      || definition?.slotCapacity !== 8) throw new SenderError('placeable_not_open');
    requireWorldModificationAuthorized(ctx, position);
    const inventory = loadPlayerInventory(ctx, ctx.sender);
    const placeableRows = [...ctx.db.world_placeable_slot.by_placeable.filter(placeable.id)];
    const placeableBySlot = new Map(placeableRows.map((row) => [row.slot, row]));
    const containers: Record<string, ContainerSnapshot> = {
      ...inventory.containers,
      placeable: {
        id: 'placeable',
        capacity: definition.slotCapacity,
        slots: Array.from({ length: definition.slotCapacity }, (_, index) => {
          const row = placeableBySlot.get(index);
          return row === undefined ? null : storedStack(row.itemKind, row.quantity, row.durability, row.lit);
        }),
      },
    };
    const moved = moveItemStacks(containers, request);
    if (!moved.ok) throw new SenderError(moved.code);
    writePlayerInventory(ctx, inventory.rowBySlot, inventory.containers, moved.containers);
    const after = moved.containers.placeable!;
    for (let index = 0; index < after.capacity; index += 1) {
      const row = placeableBySlot.get(index);
      const next = after.slots[index];
      if (row !== undefined && !sameStoredStack(storedStack(row.itemKind, row.quantity, row.durability, row.lit), next)) {
        ctx.db.world_placeable_slot.id.update({
          ...row,
          itemKind: next?.itemKind ?? 'empty',
          quantity: next?.quantity ?? 0,
        durability: storedDurability(next?.itemKind ?? 'empty', next?.durability),
        lit: storedLit(next?.itemKind ?? 'empty', next?.lit),
      });
      }
    }
  },
);

function activeMerchantSession(ctx: WorldReducerContext, requireShop: boolean) {
  const active = ctx.db.active_dialogue.identity.find(ctx.sender);
  const position = ctx.db.player_position.identity.find(ctx.sender);
  if (active === null || position === null || active.dialogueId !== TOOL_MERCHANT_DIALOGUE.id) {
    throw new SenderError('merchant_dialogue_not_open');
  }
  if (requireShop && active.nodeId !== 'shop') throw new SenderError('merchant_shop_not_open');
  const merchant = ctx.db.world_merchant.npcId.find(active.npcId);
  const npc = ctx.db.world_npc.id.find(active.npcId);
  if (merchant === null || npc === null || npc.spaceId !== position.spaceId || !npcWithinInteractionReach(position, npc)) {
    throw new SenderError('merchant_out_of_range');
  }
  return { active, merchant, npc, position };
}

function questRequirementMatches(
  ctx: WorldReducerContext,
  questId: string,
  requires: 'available' | 'active' | 'complete' | 'turned_in',
): boolean {
  const row = ctx.db.player_quest.id.find(playerQuestId(ctx.sender.toHexString(), questId));
  return requires === 'available' ? row === null : row?.state === requires;
}

/** E starts an authority-backed conversation. The active row is private to the
 * caller, while the reusable dialogue definition determines available nodes. */
export const interactNpc = spacetimedb.reducer(
  { npcId: t.u64() },
  (ctx, { npcId }) => {
    requireAuthorizedSender(ctx.senderAuth.jwt, ctx.db.membership.identity.find(ctx.sender));
    const position = ctx.db.player_position.identity.find(ctx.sender);
    const npc = ctx.db.world_npc.id.find(npcId);
    const merchant = ctx.db.world_merchant.npcId.find(npcId);
    if (position === null || npc === null || merchant === null || npc.spaceId !== position.spaceId) {
      throw new SenderError('npc_not_interactable');
    }
    if (mountedNpcFor(ctx, ctx.sender) !== null) {
      throw new SenderError('mounted_action_forbidden');
    }
    if (!npcWithinInteractionReach(position, npc)) throw new SenderError('npc_out_of_range');
    const authorityTick = ctx.db.world_clock.id.find(0)?.authorityTick ?? npc.authorityTick;
    updateWorldNpc(ctx, {
      ...npc,
      facing: npcFacingTowardPoint(
        { x: npc.x, y: npc.y },
        { x: position.x, y: position.y },
        parseNpcFacing(npc.facing),
      ),
      moving: false,
      wanderDirection: 'idle',
      nextDecisionTick: authorityTick + 30n,
      authorityTick,
    });
    const current = ctx.db.active_dialogue.identity.find(ctx.sender);
    const definition = dialogueDefinition(merchant.dialogueId);
    if (definition === null) throw new SenderError('npc_dialogue_unavailable');
    const next = {
      identity: ctx.sender,
      npcId,
      dialogueId: merchant.dialogueId,
      nodeId: definition.initialNodeId,
    };
    if (current === null) ctx.db.active_dialogue.insert(next);
    else ctx.db.active_dialogue.identity.update(next);
    recordPlayerStatistic(
      ctx, ctx.sender, 'npc_interactions', 1n,
      ctx.db.world_clock.id.find(0)?.authorityTick ?? 0n,
      npc.kind,
    );
    recordPlayerStatistic(
      ctx, ctx.sender, 'quest_npc_talks', 1n,
      authorityTick,
      npc.id.toString(),
    );
  },
);

export const chooseDialogueOption = spacetimedb.reducer(
  { choiceId: t.string() },
  (ctx, { choiceId }) => {
    requireAuthorizedSender(ctx.senderAuth.jwt, ctx.db.membership.identity.find(ctx.sender));
    const { active } = activeMerchantSession(ctx, false);
    const definition = dialogueDefinition(active.dialogueId);
    if (definition === null) throw new SenderError('npc_dialogue_unavailable');
    const authorityTick = ctx.db.world_clock.id.find(0)?.authorityTick ?? 0n;
    refreshPlayerQuests(ctx, ctx.sender, authorityTick);
    const choice = dialogueChoice(definition, active.nodeId, choiceId);
    if (choice === null) throw new SenderError('dialogue_choice_not_found');
    if (choice.quest !== undefined && !questRequirementMatches(
      ctx, choice.quest.questId, choice.quest.requires,
    )) throw new SenderError('dialogue_choice_unavailable');
    if (choice.quest?.action !== undefined) {
      const quest = questDefinition(choice.quest.questId);
      if (quest === null) throw new SenderError('quest_not_found');
      if (choice.quest.action === 'accept') acceptQuest(ctx, quest, authorityTick);
      else turnInQuest(ctx, quest, authorityTick);
    }
    if (choice.nextNodeId === null) {
      ctx.db.active_dialogue.identity.delete(ctx.sender);
      recordPlayerStatistic(
        ctx, ctx.sender, 'dialogue_choices', 1n,
        authorityTick,
      );
      return;
    }
    ctx.db.active_dialogue.identity.update({ ...active, nodeId: choice.nextNodeId });
    recordPlayerStatistic(
      ctx, ctx.sender, 'dialogue_choices', 1n,
      authorityTick,
    );
  },
);

export const closeNpcDialogue = spacetimedb.reducer({}, (ctx) => {
  const active = ctx.db.active_dialogue.identity.find(ctx.sender);
  if (active !== null) ctx.db.active_dialogue.identity.delete(ctx.sender);
});

function merchantCartLines(itemKinds: readonly string[], quantities: readonly number[]): MerchantCartLine[] {
  if (itemKinds.length !== quantities.length) throw new SenderError('merchant_cart_malformed');
  if (itemKinds.length > MAX_MERCHANT_CART_LINES) throw new SenderError('merchant_cart_too_large');
  return itemKinds.map((itemKind, index) => ({ itemKind, quantity: quantities[index] ?? 0 }));
}

function updateEquippedFromInventory(
  ctx: WorldReducerContext,
  containers: Readonly<Record<string, ContainerSnapshot>>,
): void {
  const survival = ctx.db.player_survival.identity.find(ctx.sender);
  const position = ctx.db.player_position.identity.find(ctx.sender);
  if (survival === null || position === null) return;
  const selected = containers.hotbar?.slots[survival.selectedSlot];
  ctx.db.player_position.identity.update({
    ...position,
    equippedKind: selected?.itemKind ?? 'empty',
    equippedLit: storedLit(selected?.itemKind ?? 'empty', selected?.lit),
  });
}

/** Purchases re-read wallet and inventory, preflight the complete mixed cart,
 * and commit inventory, deed claim, currency, and statistics in one reducer
 * transaction. Any rejection rolls the entire cart back. */
function purchaseMerchantCart(ctx: WorldReducerContext, lines: readonly MerchantCartLine[]): void {
  activeMerchantSession(ctx, true);
  const inventory = loadPlayerInventory(ctx, ctx.sender);
  const planned = planMerchantPurchase(inventory.containers, lines);
  if (!planned.ok) throw new SenderError(planned.code);
  const deed = lines.find((line) => line.itemKind === 'homestead_deed');
  if (deed !== undefined) {
    if (deed.quantity !== 1 || homesteadForOwner(ctx, ctx.sender) !== null
      || ctx.db.homestead_deed_claim.identity.find(ctx.sender) !== null) {
      throw new SenderError('homestead_deed_unavailable');
    }
    if (inventory.rows.some((slot) => slot.itemKind === deed.itemKind && slot.quantity > 0)) {
      throw new SenderError('homestead_deed_already_owned');
    }
  }
  const wallet = ctx.db.player_wallet.identity.find(ctx.sender);
  if (wallet === null) throw new SenderError('wallet_not_ready');
  if (wallet.balanceBronze < planned.totalBronze) throw new SenderError('insufficient_funds');
  writePlayerInventory(ctx, inventory.rowBySlot, inventory.containers, planned.containers);
  ctx.db.player_wallet.identity.update({
    ...wallet,
    balanceBronze: wallet.balanceBronze - planned.totalBronze,
  });
  updateEquippedFromInventory(ctx, planned.containers);
  const authorityTick = ctx.db.world_clock.id.find(0)?.authorityTick ?? 0n;
  if (deed !== undefined) {
    ctx.db.homestead_deed_claim.insert({ identity: ctx.sender, purchasedAtTick: authorityTick });
  }
  recordPlayerStatistic(ctx, ctx.sender, 'merchant_transactions', 1n, authorityTick, 'buy');
  for (const line of lines) {
    recordPlayerStatistic(ctx, ctx.sender, 'items_bought', BigInt(line.quantity), authorityTick, line.itemKind);
    recordPlayerStatistic(ctx, ctx.sender, 'items_obtained', BigInt(line.quantity), authorityTick, line.itemKind);
  }
  recordPlayerStatistic(ctx, ctx.sender, 'bronze_spent', planned.totalBronze, authorityTick);
}

/** Sales remove the exact mixed cart from the current authoritative hotbar and
 * backpack snapshot before paying anything. Moving or dropping an item before
 * this reducer executes therefore rejects the whole stale cart. */
function sellMerchantCartTransaction(ctx: WorldReducerContext, lines: readonly MerchantCartLine[]): void {
  activeMerchantSession(ctx, true);
  const inventory = loadPlayerInventory(ctx, ctx.sender);
  const planned = planMerchantSale(inventory.containers, lines);
  if (!planned.ok) throw new SenderError(planned.code);
  const wallet = ctx.db.player_wallet.identity.find(ctx.sender);
  if (wallet === null) throw new SenderError('wallet_not_ready');
  const nextBalance = wallet.balanceBronze + planned.totalBronze;
  if (nextBalance > (1n << 64n) - 1n) throw new SenderError('wallet_full');
  writePlayerInventory(ctx, inventory.rowBySlot, inventory.containers, planned.containers);
  ctx.db.player_wallet.identity.update({ ...wallet, balanceBronze: nextBalance });
  updateEquippedFromInventory(ctx, planned.containers);
  const authorityTick = ctx.db.world_clock.id.find(0)?.authorityTick ?? 0n;
  recordPlayerStatistic(ctx, ctx.sender, 'merchant_transactions', 1n, authorityTick, 'sell');
  for (const line of lines) {
    recordPlayerStatistic(ctx, ctx.sender, 'items_sold', BigInt(line.quantity), authorityTick, line.itemKind);
  }
  recordPlayerStatistic(ctx, ctx.sender, 'bronze_earned', planned.totalBronze, authorityTick);
}

export const buyMerchantItem = spacetimedb.reducer(
  { itemKind: t.string(), quantity: t.u16() },
  (ctx, line) => {
    requireAuthorizedSender(ctx.senderAuth.jwt, ctx.db.membership.identity.find(ctx.sender));
    purchaseMerchantCart(ctx, [line]);
  },
);

export const buyMerchantCart = spacetimedb.reducer(
  { itemKinds: t.array(t.string()), quantities: t.array(t.u16()) },
  (ctx, { itemKinds, quantities }) => {
    requireAuthorizedSender(ctx.senderAuth.jwt, ctx.db.membership.identity.find(ctx.sender));
    purchaseMerchantCart(ctx, merchantCartLines(itemKinds, quantities));
  },
);

export const sellMerchantItem = spacetimedb.reducer(
  { itemKind: t.string(), quantity: t.u16() },
  (ctx, line) => {
    requireAuthorizedSender(ctx.senderAuth.jwt, ctx.db.membership.identity.find(ctx.sender));
    sellMerchantCartTransaction(ctx, [line]);
  },
);

export const sellMerchantCart = spacetimedb.reducer(
  { itemKinds: t.array(t.string()), quantities: t.array(t.u16()) },
  (ctx, { itemKinds, quantities }) => {
    requireAuthorizedSender(ctx.senderAuth.jwt, ctx.db.membership.identity.find(ctx.sender));
    sellMerchantCartTransaction(ctx, merchantCartLines(itemKinds, quantities));
  },
);

/** Axe strikes break a placed chest after three authoritative hits. The final
 * transaction closes every viewer and spills its recipe components plus every
 * stored stack into recoverable world-item rows. */
export const harvestChest = spacetimedb.reducer(
  { chestId: t.u64() },
  (ctx, { chestId }) => {
    requireAuthorizedSender(ctx.senderAuth.jwt, ctx.db.membership.identity.find(ctx.sender));
    const position = ctx.db.player_position.identity.find(ctx.sender);
    const survival = ctx.db.player_survival.identity.find(ctx.sender);
    const clock = ctx.db.world_clock.id.find(0);
    const chest = ctx.db.world_chest.id.find(chestId);
    if (position === null || survival === null || clock === null || chest === null
      || chest.spaceId !== position.spaceId || chest.carriedBy !== undefined) {
      throw new SenderError('target_not_ready');
    }
    requireWorldModificationAuthorized(ctx, position);
    if (mountedNpcFor(ctx, ctx.sender) !== null) {
      throw new SenderError('mounted_action_forbidden');
    }
    const selected = ctx.db.inventory_slot.id.find(`${ctx.sender.toHexString()}:${survival.selectedSlot}`);
    if (selected?.itemKind !== 'axe') throw new SenderError('wrong_tool');
    requireUsableTool(selected);
    if (!chestWithinReach(position.x, position.y, chest)) throw new SenderError('target_out_of_range');
    spendToolVigour(ctx, ctx.sender, 'axe', clock.authorityTick, false);
    const facing = directionFromAim(
      chest.tileX * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2 - position.x,
      chest.tileY * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2 - position.y,
    );
    ctx.db.player_position.identity.update({
      ...position,
      facing: facing ?? position.facing,
      actionKind: 'swing_axe',
      actionStartedTick: nextActionStartedTick(position.actionStartedTick, clock.authorityTick),
    });
    const damage = ctx.db.world_chest_damage.chestId.find(chest.id);
    const hits = (damage?.hits ?? 0) + 1;
    wearInventoryTool(ctx, selected);
    recordPlayerStatistic(ctx, ctx.sender, 'tool_uses', 1n, clock.authorityTick, 'axe');
    if (hits < 3) {
      if (damage === null) ctx.db.world_chest_damage.insert({ chestId: chest.id, hits });
      else ctx.db.world_chest_damage.chestId.update({ ...damage, hits });
      return;
    }
    const stacks: Array<{ itemKind: string; quantity: number; durability: number; lit: boolean }> = [...ctx.db.world_chest_slot.by_chest.filter(chest.id)]
      .filter((slot) => slot.itemKind !== 'empty' && slot.quantity > 0)
      .sort((left, right) => left.slot - right.slot)
      .map((slot) => ({ itemKind: slot.itemKind, quantity: slot.quantity, durability: slot.durability, lit: slot.lit }));
    const chestRecipe = recipeDefinition('chest');
    if (chestRecipe === null) throw new SenderError('salvage_recipe_missing');
    stacks.unshift(...recipeIngredientStacks(chestRecipe)
      .map((stack) => ({ ...stack, durability: 0, lit: true })));
    const centerX = chest.tileX * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2;
    const centerY = chest.tileY * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2;
    for (const [index, stack] of stacks.entries()) {
      const offsetX = (index % 5 - 2) * 2 * FIXED_UNITS_PER_PIXEL;
      const offsetY = (Math.floor(index / 5) - 1) * 2 * FIXED_UNITS_PER_PIXEL;
      const x = centerX + offsetX;
      const y = centerY + offsetY;
      dropWorldItemStack(ctx, {
        itemKind: stack.itemKind,
        quantity: stack.quantity,
        x,
        y,
        droppedAtTick: clock.authorityTick,
        durability: stack.durability,
        lit: stack.lit,
        spaceId: chest.spaceId,
      });
    }
    for (const active of ctx.db.active_chest.iter()) {
      if (active.chestId === chest.id) ctx.db.active_chest.identity.delete(active.identity);
    }
    recordPlayerStatistic(ctx, ctx.sender, 'chests_broken', 1n, clock.authorityTick);
    for (const slot of [...ctx.db.world_chest_slot.by_chest.filter(chest.id)]) {
      ctx.db.world_chest_slot.id.delete(slot.id);
    }
    if (damage !== null) ctx.db.world_chest_damage.chestId.delete(chest.id);
    ctx.db.world_chest.id.delete(chest.id);
  },
);

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
    requireWorldModificationAuthorized(ctx, position);
    const rows = [...ctx.db.inventory_slot.by_identity.filter(ctx.sender)]; const rowBySlot = new Map(rows.map((row) => [row.slot, row]));
    const hasBackpack = rows.some((row) => row.itemKind === 'backpack' && row.quantity > 0);
    const chestRows = ensureChestStorageRows(ctx, chest.id); const chestBySlot = new Map(chestRows.map((row) => [row.slot, row]));
    const makeInventory = (id: InventoryContainerId): ContainerSnapshot => {
      const capacity = accessibleInventoryContainerCapacity(id, hasBackpack, playerDebugBackpackSlots(ctx, ctx.sender)); const offset = inventorySlotOffset(id);
      return { id, capacity, slots: Array.from({ length: capacity }, (_, index) => {
        const row = rowBySlot.get(offset + index); return row === undefined ? null : storedStack(row.itemKind, row.quantity, row.durability, row.lit);
      }), ...(id === 'equipment' ? { restrictions: EQUIPMENT_RESTRICTIONS } : {}) };
    };
    const containers: Record<string, ContainerSnapshot> = { chest: { id: 'chest', capacity: CHEST_STORAGE_CAPACITY, slots: Array.from({ length: CHEST_STORAGE_CAPACITY }, (_, index) => {
      const row = chestBySlot.get(index); return row === undefined ? null : storedStack(row.itemKind, row.quantity, row.durability, row.lit);
    }) } };
    for (const id of ['hotbar', 'backpack', 'equipment', 'crafting'] as const) containers[id] = makeInventory(id);
    const result = moveItemStacks(containers, request); if (!result.ok) throw new SenderError(result.code);
    for (const id of new Set([request.fromContainer, request.toContainer])) {
      const after = result.containers[id]!;
      for (let index = 0; index < after.capacity; index += 1) {
        const next = after.slots[index];
        if (id === 'chest') {
          const row = chestBySlot.get(index); if (row !== undefined
            && !sameStoredStack(storedStack(row.itemKind, row.quantity, row.durability, row.lit), next)) {
            ctx.db.world_chest_slot.id.update({
              ...row, itemKind: next?.itemKind ?? 'empty', quantity: next?.quantity ?? 0,
        durability: storedDurability(next?.itemKind ?? 'empty', next?.durability),
        lit: storedLit(next?.itemKind ?? 'empty', next?.lit),
      });
          }
        } else {
          const inventoryId = id as InventoryContainerId; const row = rowBySlot.get(inventorySlotOffset(inventoryId) + index);
          if (row !== undefined
            && !sameStoredStack(storedStack(row.itemKind, row.quantity, row.durability, row.lit), next)) {
            ctx.db.inventory_slot.id.update({
              ...row, itemKind: next?.itemKind ?? 'empty', quantity: next?.quantity ?? 0,
        durability: storedDurability(next?.itemKind ?? 'empty', next?.durability),
        lit: storedLit(next?.itemKind ?? 'empty', next?.lit),
      });
          }
        }
      }
    }
    const survival = ctx.db.player_survival.identity.find(ctx.sender);
    if (survival !== null) {
      const selected = ctx.db.inventory_slot.id.find(`${ctx.sender.toHexString()}:${survival.selectedSlot}`);
      ctx.db.player_position.identity.update({ ...position, equippedKind: selected?.itemKind ?? 'empty', equippedLit: storedLit(selected?.itemKind ?? 'empty', selected?.lit) });
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
    requireWorldModificationAuthorized(ctx, position);
    const rows = [...ctx.db.inventory_slot.by_identity.filter(ctx.sender)]; const rowBySlot = new Map(rows.map((row) => [row.slot, row]));
    const hasBackpack = rows.some((row) => row.itemKind === 'backpack' && row.quantity > 0);
    const chestRows = ensureChestStorageRows(ctx, chest.id); const chestBySlot = new Map(chestRows.map((row) => [row.slot, row]));
    const make = (id: InventoryContainerId): ContainerSnapshot => { const capacity = accessibleInventoryContainerCapacity(id, hasBackpack, playerDebugBackpackSlots(ctx, ctx.sender)); const offset = inventorySlotOffset(id); return {
      id, capacity, slots: Array.from({ length: capacity }, (_, index) => { const row = rowBySlot.get(offset + index); return row === undefined ? null : storedStack(row.itemKind, row.quantity, row.durability, row.lit); }),
      ...(id === 'equipment' ? { restrictions: EQUIPMENT_RESTRICTIONS } : {}),
    }; };
    const containers: Record<string, ContainerSnapshot> = { chest: { id: 'chest', capacity: CHEST_STORAGE_CAPACITY, slots: Array.from({ length: CHEST_STORAGE_CAPACITY }, (_, index) => { const row = chestBySlot.get(index); return row === undefined ? null : storedStack(row.itemKind, row.quantity, row.durability, row.lit); }) } };
    for (const id of ['hotbar', 'backpack', 'equipment', 'crafting'] as const) containers[id] = make(id);
    const result = quickMoveItemStack(containers, request); if (!result.ok) throw new SenderError(result.code);
    for (const id of ['chest', 'hotbar', 'backpack', 'equipment', 'crafting'] as const) {
      const before = containers[id]!; const after = result.containers[id]!;
      for (let index = 0; index < after.capacity; index += 1) {
        const previous = before.slots[index]; const next = after.slots[index]; if (sameStoredStack(previous, next)) continue;
        if (id === 'chest') { const row = chestBySlot.get(index); if (row !== undefined) ctx.db.world_chest_slot.id.update({ ...row, itemKind: next?.itemKind ?? 'empty', quantity: next?.quantity ?? 0, durability: storedDurability(next?.itemKind ?? 'empty', next?.durability), lit: storedLit(next?.itemKind ?? 'empty', next?.lit) }); }
        else { const row = rowBySlot.get(inventorySlotOffset(id) + index); if (row !== undefined) ctx.db.inventory_slot.id.update({ ...row, itemKind: next?.itemKind ?? 'empty', quantity: next?.quantity ?? 0, durability: storedDurability(next?.itemKind ?? 'empty', next?.durability), lit: storedLit(next?.itemKind ?? 'empty', next?.lit) }); }
      }
    }
    const survival = ctx.db.player_survival.identity.find(ctx.sender);
    if (survival !== null) {
      const selected = ctx.db.inventory_slot.id.find(`${ctx.sender.toHexString()}:${survival.selectedSlot}`);
      ctx.db.player_position.identity.update({ ...position, equippedKind: selected?.itemKind ?? 'empty', equippedLit: storedLit(selected?.itemKind ?? 'empty', selected?.lit) });
    }
  },
);

export const quickMoveAllChestItems = spacetimedb.reducer(
  { itemKind: t.string(), fromContainers: t.array(t.string()), toContainers: t.array(t.string()) },
  (ctx, request) => {
    requireAuthorizedSender(ctx.senderAuth.jwt, ctx.db.membership.identity.find(ctx.sender));
    if ([...request.fromContainers, ...request.toContainers]
      .some((id) => id !== 'chest' && !isInventoryContainerId(id))) throw new SenderError('container_not_found');
    const active = ctx.db.active_chest.identity.find(ctx.sender);
    if (active === null) throw new SenderError('chest_not_open');
    const chest = ctx.db.world_chest.id.find(active.chestId);
    const position = ctx.db.player_position.identity.find(ctx.sender);
    if (chest === null || chest.carriedBy !== undefined || position === null
      || !chestWithinReach(position.x, position.y, chest)) throw new SenderError('chest_out_of_range');
    requireWorldModificationAuthorized(ctx, position);
    const inventory = loadPlayerInventory(ctx, ctx.sender);
    const chestRows = ensureChestStorageRows(ctx, chest.id);
    const chestBySlot = new Map(chestRows.map((row) => [row.slot, row]));
    const chestContainer: ContainerSnapshot = {
      id: 'chest',
      capacity: CHEST_STORAGE_CAPACITY,
      slots: Array.from({ length: CHEST_STORAGE_CAPACITY }, (_, index) => {
        const row = chestBySlot.get(index);
        return row === undefined || row.itemKind === 'empty' || row.quantity === 0
          ? null
          : storedStack(row.itemKind, row.quantity, row.durability, row.lit);
      }),
    };
    const containers = { ...inventory.containers, chest: chestContainer };
    const result = quickMoveAllMatchingStacks(containers, request);
    if (!result.ok) throw new SenderError(result.code);
    writePlayerInventory(ctx, inventory.rowBySlot, inventory.containers, result.containers);
    const afterChest = result.containers.chest!;
    for (let index = 0; index < afterChest.capacity; index += 1) {
      const previous = chestContainer.slots[index];
      const next = afterChest.slots[index];
      if (sameStoredStack(previous, next)) continue;
      const row = chestBySlot.get(index);
      if (row === undefined) throw new SenderError('chest_slot_missing');
      ctx.db.world_chest_slot.id.update({
        ...row,
        itemKind: next?.itemKind ?? 'empty',
        quantity: next?.quantity ?? 0,
        durability: storedDurability(next?.itemKind ?? 'empty', next?.durability),
        lit: storedLit(next?.itemKind ?? 'empty', next?.lit),
      });
    }
    const survival = ctx.db.player_survival.identity.find(ctx.sender);
    if (survival !== null) {
      const selected = result.containers.hotbar!.slots[survival.selectedSlot];
      ctx.db.player_position.identity.update({ ...position, equippedKind: selected?.itemKind ?? 'empty', equippedLit: storedLit(selected?.itemKind ?? 'empty', selected?.lit) });
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
    requireWorldModificationAuthorized(ctx, position);
    const rows = [...ctx.db.inventory_slot.by_identity.filter(ctx.sender)]; const rowBySlot = new Map(rows.map((row) => [row.slot, row]));
    const hasBackpack = rows.some((row) => row.itemKind === 'backpack' && row.quantity > 0);
    const chestRows = ensureChestStorageRows(ctx, chest.id); const chestBySlot = new Map(chestRows.map((row) => [row.slot, row]));
    const make = (id: InventoryContainerId): ContainerSnapshot => { const capacity = accessibleInventoryContainerCapacity(id, hasBackpack, playerDebugBackpackSlots(ctx, ctx.sender)); const offset = inventorySlotOffset(id); return {
      id, capacity, slots: Array.from({ length: capacity }, (_, index) => { const row = rowBySlot.get(offset + index); return row === undefined ? null : storedStack(row.itemKind, row.quantity, row.durability, row.lit); }),
      ...(id === 'equipment' ? { restrictions: EQUIPMENT_RESTRICTIONS } : {}),
    }; };
    const containers: Record<string, ContainerSnapshot> = { chest: { id: 'chest', capacity: CHEST_STORAGE_CAPACITY, slots: Array.from({ length: CHEST_STORAGE_CAPACITY }, (_, index) => { const row = chestBySlot.get(index); return row === undefined ? null : storedStack(row.itemKind, row.quantity, row.durability, row.lit); }) } };
    for (const id of ['hotbar', 'backpack', 'equipment', 'crafting'] as const) containers[id] = make(id);
    const result = distributeItemStack(containers, { fromContainer: request.fromContainer, fromIndex: request.fromIndex, quantity: request.quantity,
      targets: request.targetContainers.map((containerId, index) => ({ container: containerId, index: request.targetIndexes[index]! })) });
    if (!result.ok) throw new SenderError(result.code);
    for (const id of ['chest', 'hotbar', 'backpack', 'equipment', 'crafting'] as const) {
      const before = containers[id]!; const after = result.containers[id]!;
      for (let index = 0; index < after.capacity; index += 1) {
        const previous = before.slots[index]; const next = after.slots[index]; if (sameStoredStack(previous, next)) continue;
        if (id === 'chest') { const row = chestBySlot.get(index); if (row !== undefined) ctx.db.world_chest_slot.id.update({ ...row, itemKind: next?.itemKind ?? 'empty', quantity: next?.quantity ?? 0, durability: storedDurability(next?.itemKind ?? 'empty', next?.durability), lit: storedLit(next?.itemKind ?? 'empty', next?.lit) }); }
        else { const row = rowBySlot.get(inventorySlotOffset(id) + index); if (row !== undefined) ctx.db.inventory_slot.id.update({ ...row, itemKind: next?.itemKind ?? 'empty', quantity: next?.quantity ?? 0, durability: storedDurability(next?.itemKind ?? 'empty', next?.durability), lit: storedLit(next?.itemKind ?? 'empty', next?.lit) }); }
      }
    }
    const survival = ctx.db.player_survival.identity.find(ctx.sender);
    if (survival !== null) {
      const selected = ctx.db.inventory_slot.id.find(`${ctx.sender.toHexString()}:${survival.selectedSlot}`);
      ctx.db.player_position.identity.update({ ...position, equippedKind: selected?.itemKind ?? 'empty', equippedLit: storedLit(selected?.itemKind ?? 'empty', selected?.lit) });
    }
  },
);

export const interactHorse = spacetimedb.reducer(
  { horseId: t.u64() },
  (ctx, { horseId }) => {
    requireAuthorizedSender(ctx.senderAuth.jwt, ctx.db.membership.identity.find(ctx.sender));
    if (handsOccupiedFor(ctx, ctx.sender)) throw new SenderError('hands_occupied');
    const position = ctx.db.player_position.identity.find(ctx.sender);
    const clock = ctx.db.world_clock.id.find(0);
    if (position === null || clock === null) throw new SenderError('player_not_ready');
    if (!horseAllowedInSpace(ctx, position.spaceId)) throw new SenderError('horses_outdoors_only');
    const collision = collisionForSpace(ctx, position.spaceId);
    const currentMount = mountedNpcFor(ctx, ctx.sender);

    if (currentMount !== null) {
      const landing = findHorseDismountPosition(
        { x: currentMount.x, y: currentMount.y },
        parseNpcFacing(currentMount.facing),
        collision,
      );
      if (landing === null) throw new SenderError('no_safe_dismount_position');
      updateWorldNpc(ctx, {
        ...currentMount,
        rider: undefined,
        // A ridden horse may be left far outside the habitat around its
        // generated spawn. Re-anchor its wildlife leash here so the habitat
        // recovery step cannot snap it back to that old spawn after dismount.
        homeX: currentMount.x,
        homeY: currentMount.y,
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
      recordPlayerStatistic(ctx, ctx.sender, 'horse_dismounts', 1n, clock.authorityTick);
      return;
    }

    const horse = ctx.db.world_npc.id.find(horseId);
    if (horse === null || horse.kind !== 'horse') throw new SenderError('horse_not_ready');
    if (horse.spaceId !== position.spaceId || !horseAllowedInSpace(ctx, horse.spaceId)) {
      throw new SenderError('horses_outdoors_only');
    }
    if (horse.rider !== undefined) throw new SenderError('horse_already_ridden');
    if (!isHorseWithinMountReach(
      { x: position.x, y: position.y },
      { x: horse.x, y: horse.y },
    )) throw new SenderError('horse_out_of_range');
    updateWorldNpc(ctx, {
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
    recordPlayerStatistic(ctx, ctx.sender, 'horse_mounts', 1n, clock.authorityTick);
  },
);

export const jumpHorse = spacetimedb.reducer((ctx) => {
  requireAuthorizedSender(ctx.senderAuth.jwt, ctx.db.membership.identity.find(ctx.sender));
  const position = ctx.db.player_position.identity.find(ctx.sender);
  const clock = ctx.db.world_clock.id.find(0);
  if (position === null || clock === null) throw new SenderError('player_not_ready');
  if (!horseAllowedInSpace(ctx, position.spaceId)) throw new SenderError('horses_outdoors_only');
  const horse = mountedNpcFor(ctx, ctx.sender);
  if (horse === null) throw new SenderError('horse_jump_requires_mount');
  if (position.jumpUntilTick !== undefined && position.jumpUntilTick >= clock.authorityTick) {
    throw new SenderError('horse_jump_cooldown');
  }
  const facing = parseNpcFacing(horse.facing);
  const collision = collisionForSpace(ctx, position.spaceId);
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
  updateWorldNpc(ctx, {
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
    sprinting: false,
    appliedSteps: 0n,
    settleDirection: 'idle',
    settleSteps: 0,
    settledSequence: input.sequence,
    pendingSequence: 0n,
  });
  const jumpDistance = BigInt(Math.abs(landing.x - position.x) + Math.abs(landing.y - position.y));
  recordPlayerStatistic(ctx, ctx.sender, 'horse_jumps', 1n, clock.authorityTick);
  recordPlayerStatistic(ctx, ctx.sender, 'distance_travelled', jumpDistance, clock.authorityTick, 'horse');
  recordPlayerStatistic(ctx, ctx.sender, 'longest_horse_jump', jumpDistance, clock.authorityTick);
});

export const dropSelected = spacetimedb.reducer((ctx) => {
  requireAuthorizedSender(ctx.senderAuth.jwt, ctx.db.membership.identity.find(ctx.sender));
  const position = ctx.db.player_position.identity.find(ctx.sender);
  const survival = ctx.db.player_survival.identity.find(ctx.sender);
  const clock = ctx.db.world_clock.id.find(0);
  if (position === null || survival === null || clock === null) throw new SenderError('player_not_ready');
  if (handsOccupiedFor(ctx, ctx.sender)) throw new SenderError('hands_occupied');
  if (mountedNpcFor(ctx, ctx.sender) !== null) {
    throw new SenderError('mounted_action_forbidden');
  }
  const slot = ctx.db.inventory_slot.id.find(`${ctx.sender.toHexString()}:${survival.selectedSlot}`);
  if (slot === null || slot.itemKind === 'empty' || slot.quantity === 0) throw new SenderError('selected_slot_empty');
  if (slot.itemKind === 'homestead_deed') throw new SenderError('item_not_droppable');
  const facing = parseDirection(position.facing) ?? 'down';
  const drop = itemDropPosition(position.x, position.y, facing);
  ctx.db.inventory_slot.id.update({ ...slot, itemKind: 'empty', quantity: 0, durability: 0, lit: true });
  ctx.db.player_position.identity.update({
    ...position,
    equippedKind: 'empty',
    equippedLit: true,
    actionKind: 'drop',
    actionStartedTick: nextActionStartedTick(position.actionStartedTick, clock.authorityTick),
  });
  dropWorldItemStack(ctx, {
    itemKind: slot.itemKind,
    quantity: slot.quantity,
    x: drop.x,
    y: drop.y,
    droppedAtTick: clock.authorityTick,
    durability: slot.durability,
    lit: slot.lit,
    spaceId: position.spaceId,
  });
  recordPlayerStatistic(
    ctx, ctx.sender, 'items_dropped', BigInt(slot.quantity), clock.authorityTick, slot.itemKind,
  );
});

export const pickupWorldItem = spacetimedb.reducer(
  { itemId: t.u64() },
  (ctx, { itemId }) => {
    requireAuthorizedSender(ctx.senderAuth.jwt, ctx.db.membership.identity.find(ctx.sender));
    const position = ctx.db.player_position.identity.find(ctx.sender);
    const item = ctx.db.world_item.id.find(itemId);
    const clock = ctx.db.world_clock.id.find(0);
    if (position === null || item === null || clock === null) throw new SenderError('item_not_ready');
    if (worldItemExpiredForRow(item, clock.authorityTick)) throw new SenderError('item_not_ready');
    if (item.spaceId !== position.spaceId) throw new SenderError('item_not_ready');
    if (!itemWithinPickupReach(position.x, position.y, item.x, item.y)) throw new SenderError('item_out_of_range');
    const maximum = maxStackFor(item.itemKind);
    if (maximum === null) throw new SenderError('unknown_item_kind');
    const slots = [...ctx.db.inventory_slot.by_identity.filter(ctx.sender)].sort((left, right) => left.slot - right.slot);
    const hasBackpack = slots.some((slot) => slot.itemKind === 'backpack' && slot.quantity > 0);
    const capacity = BACKPACK_SLOT_OFFSET + accessibleInventoryContainerCapacity(
      'backpack', hasBackpack, playerDebugBackpackSlots(ctx, ctx.sender),
    );
    const carried: ContainerSnapshot = {
      id: 'carried',
      capacity,
      slots: Array.from({ length: capacity }, (_, index) => {
        const row = slots.find((slot) => slot.slot === index);
        return row === undefined || row.itemKind === 'empty' || row.quantity === 0
          ? null
          : storedStack(row.itemKind, row.quantity, row.durability, row.lit);
      }),
    };
    const candidates: WorldItemRow[] = maximum === 1
      ? [item]
      : [...ctx.db.world_item.iter()]
        .filter((candidate) => candidate.spaceId === position.spaceId
          && candidate.itemKind === item.itemKind
          && candidate.durability === item.durability
          && candidate.lit === item.lit
          && !worldItemExpiredForRow(candidate, clock.authorityTick)
          && itemWithinPickupReach(position.x, position.y, candidate.x, candidate.y))
        .sort((left, right) => {
          if (left.id === item.id) return -1;
          if (right.id === item.id) return 1;
          const leftDistance = (left.x - position.x) ** 2 + (left.y - position.y) ** 2;
          const rightDistance = (right.x - position.x) ** 2 + (right.y - position.y) ** 2;
          if (leftDistance !== rightDistance) return leftDistance - rightDistance;
          return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
        });
    let nextCarried = carried;
    let totalInserted = 0;
    const consumed: { readonly row: WorldItemRow; readonly quantity: number }[] = [];
    for (const candidate of candidates) {
      const inserted = insertItemStackPartial(nextCarried, {
        itemKind: candidate.itemKind,
        quantity: candidate.quantity,
        ...(isDurableToolKind(candidate.itemKind) ? { durability: candidate.durability } : {}),
        ...(isSwitchableLightKind(candidate.itemKind) ? { lit: candidate.lit } : {}),
      });
      if (!inserted.ok) {
        if (inserted.code === 'container_full') break;
        throw new SenderError(inserted.code);
      }
      nextCarried = inserted.container;
      totalInserted += inserted.insertedQuantity;
      consumed.push({ row: candidate, quantity: inserted.insertedQuantity });
      if (inserted.remainderQuantity > 0) break;
    }
    if (totalInserted === 0) throw new SenderError('inventory_full');
    let destinationSlot: number | null = null;
    for (let slot = 0; slot < nextCarried.capacity; slot += 1) {
      const before = carried.slots[slot];
      const after = nextCarried.slots[slot];
      if (sameStoredStack(before, after)) continue;
      const row = slots.find((candidate) => candidate.slot === slot);
      if (row === undefined) throw new SenderError('inventory_slot_missing');
      ctx.db.inventory_slot.id.update({
        ...row,
        itemKind: after?.itemKind ?? 'empty',
        quantity: after?.quantity ?? 0,
        durability: storedDurability(after?.itemKind ?? 'empty', after?.durability),
        lit: storedLit(after?.itemKind ?? 'empty', after?.lit),
      });
      if (destinationSlot === null) destinationSlot = slot;
    }
    const survival = ctx.db.player_survival.identity.find(ctx.sender);
    ctx.db.player_position.identity.update({
      ...position,
      equippedKind: survival?.selectedSlot === destinationSlot ? item.itemKind : position.equippedKind,
      equippedLit: survival?.selectedSlot === destinationSlot ? storedLit(item.itemKind, item.lit) : position.equippedLit,
      actionKind: 'pickup',
      actionStartedTick: nextActionStartedTick(position.actionStartedTick, clock.authorityTick),
    });
    recordPlayerStatistic(
      ctx, ctx.sender, 'items_picked_up', BigInt(totalInserted), clock.authorityTick, item.itemKind,
    );
    recordPlayerStatistic(
      ctx, ctx.sender, 'items_obtained', BigInt(totalInserted), clock.authorityTick, item.itemKind,
    );
    for (const entry of consumed) {
      const remainder = entry.row.quantity - entry.quantity;
      if (remainder === 0) ctx.db.world_item.id.delete(entry.row.id);
      else ctx.db.world_item.id.update({ ...entry.row, quantity: remainder });
    }
  },
);

/** Recovers an arrow while it is visibly embedded in a combat target. The
 * projectile id is only a lookup hint: state, kind, lifetime, space, reach,
 * and destination capacity are all revalidated by the authority. */
export const pickupEmbeddedArrow = spacetimedb.reducer(
  { projectileId: t.u64() },
  (ctx, { projectileId }) => {
    requireAuthorizedSender(ctx.senderAuth.jwt, ctx.db.membership.identity.find(ctx.sender));
    const position = ctx.db.player_position.identity.find(ctx.sender);
    const projectile = ctx.db.world_projectile.id.find(projectileId);
    const clock = ctx.db.world_clock.id.find(0);
    if (position === null || projectile === null || clock === null
      || projectile.state !== 'hit' || projectile.hitKind !== 'combat_target'
      || projectile.expiresTick <= clock.authorityTick
      || projectile.spaceId !== position.spaceId) throw new SenderError('arrow_not_recoverable');
    if (!itemWithinPickupReach(position.x, position.y, projectile.x, projectile.y)) {
      throw new SenderError('item_out_of_range');
    }
    if (!insertPlayerCarriedItem(ctx, 'arrow', 1)) throw new SenderError('inventory_full');
    ctx.db.world_projectile.id.delete(projectile.id);
    ctx.db.projectile_charge.projectileId.delete(projectile.id);
    ctx.db.player_position.identity.update({
      ...position,
      actionKind: 'pickup',
      actionStartedTick: nextActionStartedTick(position.actionStartedTick, clock.authorityTick),
    });
    recordPlayerStatistic(ctx, ctx.sender, 'items_picked_up', 1n, clock.authorityTick, 'arrow');
    recordPlayerStatistic(ctx, ctx.sender, 'items_obtained', 1n, clock.authorityTick, 'arrow');
  },
);

/** Switches the selected carried lantern. The slot is authoritative so its
 * state follows the item through later drops and container transfers. */
export const toggleHeldLantern = spacetimedb.reducer((ctx) => {
  requireAuthorizedSender(ctx.senderAuth.jwt, ctx.db.membership.identity.find(ctx.sender));
  const survival = ctx.db.player_survival.identity.find(ctx.sender);
  const position = ctx.db.player_position.identity.find(ctx.sender);
  if (survival === null || position === null) throw new SenderError('player_not_ready');
  const slot = ctx.db.inventory_slot.id.find(`${ctx.sender.toHexString()}:${survival.selectedSlot}`);
  if (slot === null || slot.itemKind !== 'lantern' || slot.quantity !== 1) {
    throw new SenderError('lantern_not_selected');
  }
  const lit = !slot.lit;
  ctx.db.inventory_slot.id.update({ ...slot, lit });
  ctx.db.player_position.identity.update({ ...position, equippedKind: 'lantern', equippedLit: lit });
});

/** Switches a dropped lantern without collecting it. The same radial reach as
 * E-pickup is enforced server-side; spoofed or cross-space ids are rejected. */
export const toggleWorldLantern = spacetimedb.reducer(
  { itemId: t.u64() },
  (ctx, { itemId }) => {
    requireAuthorizedSender(ctx.senderAuth.jwt, ctx.db.membership.identity.find(ctx.sender));
    const position = ctx.db.player_position.identity.find(ctx.sender);
    const item = ctx.db.world_item.id.find(itemId);
    if (position === null || item === null || item.itemKind !== 'lantern'
      || item.spaceId !== position.spaceId) throw new SenderError('lantern_not_ready');
    if (!itemWithinPickupReach(position.x, position.y, item.x, item.y)) {
      throw new SenderError('lantern_out_of_range');
    }
    ctx.db.world_item.id.update({ ...item, lit: !item.lit });
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
    if (resource.spaceId !== position.spaceId) throw new SenderError('target_not_ready');
    requireWorldModificationAuthorized(ctx, position);
    if (handsOccupiedFor(ctx, ctx.sender)) {
      throw new SenderError('hands_occupied');
    }
    if (mountedNpcFor(ctx, ctx.sender) !== null) {
      throw new SenderError('mounted_action_forbidden');
    }
    const result = resourceGatherResult(position.x, position.y, resource);
    if (result !== 'ok') throw new SenderError(result);
    const drop = survivalGatherableDrop(resource.kind);
    if (drop === null || !isGatherableResourceKind(resource.kind)) throw new SenderError('not_gatherable');
    const seed = ctx.db.world_seed.id.find(0)?.seed ?? SURVIVAL_WORLD_SEED;
    const statsRow = advancePlayerStats(ctx, ctx.sender, clock.authorityTick);
    const modifiers = activePlayerModifiers(ctx, ctx.sender, clock.authorityTick);
    const resolved = resolvedStatsForRow(ctx, statsRow, ctx.sender, clock.authorityTick);
    const forageBonus = forageFindBonus(
      [seed, ctx.sender.toHexString(), clock.authorityTick, resource.id],
      resolved.attributes.wis,
      modifiers,
    );
    const found = { ...drop, quantity: drop.quantity + forageBonus };

    const slots = [...ctx.db.inventory_slot.by_identity.filter(ctx.sender)].sort((left, right) => left.slot - right.slot);
    const hasBackpack = slots.some((slot) => slot.itemKind === 'backpack' && slot.quantity > 0);
    const capacity = BACKPACK_SLOT_OFFSET + accessibleInventoryContainerCapacity(
      'backpack', hasBackpack, playerDebugBackpackSlots(ctx, ctx.sender),
    );
    const carried: ContainerSnapshot = {
      id: 'carried',
      capacity,
      slots: Array.from({ length: capacity }, (_, index) => {
        const row = slots.find((slot) => slot.slot === index);
        return row === undefined || row.itemKind === 'empty' || row.quantity === 0
          ? null
          : storedStack(row.itemKind, row.quantity, row.durability, row.lit);
      }),
    };
    const inserted = insertItemStack(carried, found);
    if (!inserted.ok) throw new SenderError(inserted.code === 'container_full' ? 'inventory_full' : inserted.code);
    let destinationSlot: number | null = null;
    for (let slot = 0; slot < inserted.container.capacity; slot += 1) {
      const before = carried.slots[slot];
      const after = inserted.container.slots[slot];
      if (sameStoredStack(before, after)) continue;
      const row = slots.find((candidate) => candidate.slot === slot);
      if (row === undefined) throw new SenderError('inventory_slot_missing');
      ctx.db.inventory_slot.id.update({
        ...row,
        itemKind: after?.itemKind ?? 'empty',
        quantity: after?.quantity ?? 0,
        durability: storedDurability(after?.itemKind ?? 'empty', after?.durability),
        lit: storedLit(after?.itemKind ?? 'empty', after?.lit),
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
      equippedKind: survival?.selectedSlot === destinationSlot ? found.itemKind : position.equippedKind,
      equippedLit: survival?.selectedSlot === destinationSlot
        ? storedLit(found.itemKind)
        : position.equippedLit,
      actionKind: 'pickup',
      actionStartedTick: nextActionStartedTick(position.actionStartedTick, clock.authorityTick),
    });
    ctx.db.world_resource.id.update({ ...resource, health: 0, depleted: true });
    recordPlayerStatistic(ctx, ctx.sender, 'resources_gathered', 1n, clock.authorityTick, resource.kind);
    recordPlayerStatistic(ctx, ctx.sender, 'resources_depleted', 1n, clock.authorityTick, resource.kind);
    recordPlayerStatistic(
      ctx, ctx.sender, 'items_obtained', BigInt(found.quantity), clock.authorityTick, found.itemKind,
    );
    if (forageBonus > 0) {
      recordPlayerStatistic(
        ctx, ctx.sender, 'forage_bonus_items', BigInt(forageBonus), clock.authorityTick, found.itemKind,
      );
    }
  },
);

function cellarExcavationId(spaceId: number, tileX: number, tileY: number): string {
  return JSON.stringify([spaceId, tileX, tileY]);
}

function cellarTileIsDug(ctx: WorldReducerContext, spaceId: number, tileX: number, tileY: number): boolean {
  return cellarPlayableTile(tileX, tileY)
    || ctx.db.cellar_excavation.id.find(cellarExcavationId(spaceId, tileX, tileY)) !== null;
}

/** Pickaxe strikes turn solid cellar tiles into persistent walkable terrain.
 * Damage is shared; an ore node is materialised only after its tile opens. */
export const digCellarTile = spacetimedb.reducer(
  { tileX: t.i16(), tileY: t.i16() },
  (ctx, { tileX, tileY }) => {
    requireAuthorizedSender(ctx.senderAuth.jwt, ctx.db.membership.identity.find(ctx.sender));
    const position = ctx.db.player_position.identity.find(ctx.sender);
    const survival = ctx.db.player_survival.identity.find(ctx.sender);
    const clock = ctx.db.world_clock.id.find(0);
    if (position === null || survival === null || clock === null) throw new SenderError('player_not_ready');
    if (handsOccupiedFor(ctx, ctx.sender)) throw new SenderError('hands_occupied');
    if (mountedNpcFor(ctx, ctx.sender) !== null) throw new SenderError('mounted_action_forbidden');
    const definition = spaceDefinitionFor(position.spaceId, homesteadForSpace(ctx, position.spaceId));
    if (definition?.generator !== 'cellar') throw new SenderError('cellar_only');
    requireWorldModificationAuthorized(ctx, position);
    if (tileX <= 0 || tileY <= 0 || tileX >= CELLAR_SIZE_TILES - 1 || tileY >= CELLAR_SIZE_TILES - 1) {
      throw new SenderError('cellar_boundary_reached');
    }
    if (!tileTargetWithinFixedReach(position.x, position.y, { tileX, tileY }, 2 * TILE_SIZE_FIXED)) {
      throw new SenderError('target_out_of_range');
    }
    if (cellarTileIsDug(ctx, position.spaceId, tileX, tileY)) throw new SenderError('cellar_tile_already_dug');
    const neighbours = [[0, -1], [1, 0], [0, 1], [-1, 0]] as const;
    if (!neighbours.some(([offsetX, offsetY]) => (
      cellarTileIsDug(ctx, position.spaceId, tileX + offsetX, tileY + offsetY)
    ))) throw new SenderError('cellar_wall_not_exposed');

    const slot = ctx.db.inventory_slot.id.find(`${ctx.sender.toHexString()}:${survival.selectedSlot}`);
    requireUsableTool(slot);
    if (slot.itemKind !== 'pickaxe') throw new SenderError('wrong_tool');
    spendToolVigour(ctx, ctx.sender, slot.itemKind, clock.authorityTick, false);
    wearInventoryTool(ctx, slot, CELLAR_WALL_TOOL_WEAR);
    const wallFacing = directionFromAim(
      tileX * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2 - position.x,
      tileY * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2 - position.y,
    );
    ctx.db.player_position.identity.update({
      ...position,
      facing: wallFacing ?? position.facing,
      actionKind: avatarActionForEquippedKind('pickaxe') ?? 'tool',
      actionStartedTick: nextActionStartedTick(position.actionStartedTick, clock.authorityTick),
    });
    recordPlayerStatistic(ctx, ctx.sender, 'tool_uses', 1n, clock.authorityTick, 'pickaxe');

    const seed = ctx.db.world_seed.id.find(0)?.seed ?? SURVIVAL_WORLD_SEED;
    const id = cellarExcavationId(position.spaceId, tileX, tileY);
    const progress = ctx.db.cellar_dig_progress.id.find(id);
    const hits = (progress?.hits ?? 0) + 1;
    if (hits < cellarWallHitsRequired(seed, position.spaceId, tileX, tileY)) {
      const row = { id, spaceId: position.spaceId, tileX, tileY, hits, lastHitTick: clock.authorityTick };
      if (progress === null) ctx.db.cellar_dig_progress.insert(row);
      else ctx.db.cellar_dig_progress.id.update(row);
      return;
    }

    if (progress !== null) ctx.db.cellar_dig_progress.id.delete(id);
    ctx.db.cellar_excavation.insert({
      id,
      spaceId: position.spaceId,
      tileX,
      tileY,
      chunkX: Math.floor(tileX / SURVIVAL_CHUNK_TILES),
      chunkY: Math.floor(tileY / SURVIVAL_CHUNK_TILES),
      dugAtTick: clock.authorityTick,
    });
    const oreKind = cellarOreKindAt(seed, position.spaceId, tileX, tileY);
    if (oreKind !== null) {
      const resourceId = cellarOreResourceId(position.spaceId, tileX, tileY);
      if (ctx.db.world_resource.id.find(resourceId) === null) ctx.db.world_resource.insert({
        id: resourceId,
        kind: oreKind,
        tileX,
        tileY,
        chunkX: Math.floor(tileX / SURVIVAL_CHUNK_TILES),
        chunkY: Math.floor(tileY / SURVIVAL_CHUNK_TILES),
        health: survivalResourceInitialHealth(oreKind),
        depleted: false,
        growthStage: TREE_GROWTH_STAGE_BIG,
        regrowthProgress: TREE_REGROWTH_PROGRESS_MAX,
        spaceId: position.spaceId,
      });
    }
    dropWorldItemStack(ctx, {
      itemKind: 'stone',
      quantity: cellarWallStoneQuantity(seed, position.spaceId, tileX, tileY),
      x: tileX * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2,
      y: tileY * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2,
      droppedAtTick: clock.authorityTick,
      durability: 0,
      spaceId: position.spaceId,
    });
    recordPlayerStatistic(ctx, ctx.sender, 'rocks_broken', 1n, clock.authorityTick);
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
    if (handsOccupiedFor(ctx, ctx.sender)) throw new SenderError('hands_occupied');
    if (mountedNpcFor(ctx, ctx.sender) !== null) {
      throw new SenderError('mounted_action_forbidden');
    }
    const slot = ctx.db.inventory_slot.id.find(`${ctx.sender.toHexString()}:${survival.selectedSlot}`);
    const actionKind = avatarActionForEquippedKind(slot?.itemKind ?? 'empty');
    if (actionKind === null) throw new SenderError('selected_tool_has_no_action');
    requireUsableTool(slot);
    if (!isVitalsToolKind(slot.itemKind)) throw new SenderError('wrong_tool');

    if (resourceId === 0n) {
      spendToolVigour(ctx, ctx.sender, slot.itemKind, clock.authorityTick, true);
      ctx.db.player_position.identity.update({
        ...position,
        actionKind,
        actionStartedTick: nextActionStartedTick(position.actionStartedTick, clock.authorityTick),
      });
      recordPlayerStatistic(ctx, ctx.sender, 'tool_whiffs', 1n, clock.authorityTick, slot.itemKind);
      return;
    }

    const resource = ctx.db.world_resource.id.find(resourceId);
    if (resource === null) throw new SenderError('target_not_ready');
    if (resource.spaceId !== position.spaceId) throw new SenderError('target_not_ready');
    requireWorldModificationAuthorized(ctx, position);
    const result = resourceHarvestResult(position.x, position.y, slot?.itemKind ?? 'empty', resource);
    if (result === 'depleted') throw new SenderError('resource_depleted');
    if (result === 'wrong_tool') throw new SenderError('wrong_tool');
    if (result === 'out_of_range') throw new SenderError('target_out_of_range');
    spendToolVigour(ctx, ctx.sender, slot.itemKind, clock.authorityTick, false);
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
    const treeGrowthStage = normalizeTreeGrowthStage(resource.growthStage);
    ctx.db.world_resource.id.update({
      ...resource,
      health: nextHealth,
      depleted: nextHealth === 0,
      regrowthProgress: nextHealth === 0 && isAxeHarvestableResourceKind(resource.kind)
        ? 0
        : resource.regrowthProgress,
    });
    wearInventoryTool(ctx, slot);
    recordPlayerStatistic(ctx, ctx.sender, 'tool_uses', 1n, clock.authorityTick, slot.itemKind);
    recordPlayerStatistic(ctx, ctx.sender, 'resource_hits', 1n, clock.authorityTick, resource.kind);
    if (nextHealth === 0) {
      recordPlayerStatistic(ctx, ctx.sender, 'resources_depleted', 1n, clock.authorityTick, resource.kind);
      if (isChoppableTreeKind(resource.kind)) {
        recordPlayerStatistic(ctx, ctx.sender, 'trees_cut_down', 1n, clock.authorityTick);
      } else if (resource.kind === 'cactus') {
        recordPlayerStatistic(ctx, ctx.sender, 'cacti_cut_down', 1n, clock.authorityTick);
      } else if (isBreakableRockKind(resource.kind)) {
        recordPlayerStatistic(ctx, ctx.sender, 'rocks_broken', 1n, clock.authorityTick);
      } else if (isMineableOreKind(resource.kind)) {
        recordPlayerStatistic(ctx, ctx.sender, 'ore_nodes_depleted', 1n, clock.authorityTick, resource.kind);
      }
    }
    const drops = survivalResourceDropsAfterHit(resource.kind, nextHealth, treeGrowthStage);
    if (drops.length === 0) return;
    const itemX = resource.tileX * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2 + 10 * FIXED_UNITS_PER_PIXEL;
    const itemY = (resource.tileY + 1) * TILE_SIZE_FIXED + 3 * FIXED_UNITS_PER_PIXEL;
    for (const [index, drop] of drops.entries()) {
      const dropX = itemX + index * 4 * FIXED_UNITS_PER_PIXEL;
      dropWorldItemStack(ctx, {
        itemKind: drop.itemKind,
        quantity: drop.quantity,
        x: dropX,
        y: itemY,
        droppedAtTick: clock.authorityTick,
        durability: 0,
        spaceId: resource.spaceId,
      });
    }
  },
);

function authorityBowChargeMs(
  startedTick: bigint,
  authorityTick: bigint,
  requestedChargeMs: number,
): number {
  const elapsedTicks = authorityTick > startedTick
    ? authorityTick - startedTick
    : 0n;
  const elapsedMs = Math.floor(Number(elapsedTicks) * 1_000 / AUTHORITY_HZ);
  return Math.min(BOW_MAX_CHARGE_MS, requestedChargeMs, elapsedMs);
}

/** Registers the authority timestamp that bounds both eventual range and
 * Vigour cost. fireBow accepts the client's duration only as a lower cap, so
 * it can request a cheaper shorter shot but can never fabricate extra charge. */
export const beginBowCharge = spacetimedb.reducer({}, (ctx) => {
  requireAuthorizedSender(ctx.senderAuth.jwt, ctx.db.membership.identity.find(ctx.sender));
  const position = ctx.db.player_position.identity.find(ctx.sender);
  const survival = ctx.db.player_survival.identity.find(ctx.sender);
  const clock = ctx.db.world_clock.id.find(0);
  if (position === null || survival === null || clock === null) throw new SenderError('player_not_ready');
  if (handsOccupiedFor(ctx, ctx.sender)) {
    throw new SenderError('hands_occupied');
  }
  const selected = ctx.db.inventory_slot.id.find(`${ctx.sender.toHexString()}:${survival.selectedSlot}`);
  if (selected?.itemKind !== 'bow' || selected.quantity < 1) throw new SenderError('wrong_tool');
  requireUsableTool(selected);
  const hasArrow = [...ctx.db.inventory_slot.by_identity.filter(ctx.sender)]
    .some((row) => row.itemKind === 'arrow' && row.quantity > 0);
  if (!hasArrow) throw new SenderError('out_of_arrows');
  // Settle all regeneration before draw starts; release/cancel then suppresses
  // regeneration across exactly the charging interval.
  const stats = advancePlayerStats(ctx, ctx.sender, clock.authorityTick);
  const modifiers = activePlayerModifiers(ctx, ctx.sender, clock.authorityTick);
  const minimumCost = resolveModifierTarget(
    'toolVigourCost', bowChargeVigourCostCenti(0), modifiers,
  );
  const minimumInterval = Math.max(
    1,
    resolveModifierTarget(
      'swingSpeed', TOOL_VIGOUR_BALANCE.bow.minimumSwingTicks, modifiers,
    ),
  );
  const readiness = toolSpendResult(
    stats.vigourCenti,
    stats.lastSwingTick,
    clock.authorityTick,
    minimumCost,
    minimumInterval,
    false,
  );
  if (!readiness.ok) throw new SenderError(readiness.code);
  const existingCharge = ctx.db.bow_charge.identity.find(ctx.sender);
  if (existingCharge !== null) throw new SenderError('bow_already_charging');
  ctx.db.bow_charge.insert({
    identity: ctx.sender,
    startedTick: clock.authorityTick,
  });
  ctx.db.player_position.identity.update({
    ...position,
    actionKind: 'ranged_weapon',
    actionStartedTick: clock.authorityTick,
    equippedKind: 'bow',
    equippedLit: true,
  });
});

export const cancelBowCharge = spacetimedb.reducer(
  { chargeMs: t.u16() },
  (ctx, { chargeMs }) => {
    requireAuthorizedSender(ctx.senderAuth.jwt, ctx.db.membership.identity.find(ctx.sender));
    const position = ctx.db.player_position.identity.find(ctx.sender);
    const clock = ctx.db.world_clock.id.find(0);
    if (position === null || clock === null) throw new SenderError('player_not_ready');
    const charge = ctx.db.bow_charge.identity.find(ctx.sender);
    if (charge === null) throw new SenderError('bow_not_charged');
    const authoritativeChargeMs = authorityBowChargeMs(charge.startedTick, clock.authorityTick, chargeMs);
    spendToolVigour(
      ctx, ctx.sender, 'bow', clock.authorityTick, false,
      bowChargeVigourCostCenti(authoritativeChargeMs),
      true,
    );
    ctx.db.bow_charge.identity.delete(ctx.sender);
    ctx.db.player_position.identity.update({
      ...position,
      actionKind: 'none',
      actionStartedTick: clock.authorityTick,
    });
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
    if (handsOccupiedFor(ctx, ctx.sender)) {
      throw new SenderError('hands_occupied');
    }
    const mount = mountedNpcFor(ctx, ctx.sender);
    const selected = ctx.db.inventory_slot.id.find(`${ctx.sender.toHexString()}:${survival.selectedSlot}`);
    if (selected?.itemKind !== 'bow' || selected.quantity < 1) throw new SenderError('wrong_tool');
    requireUsableTool(selected);
    const arrow = [...ctx.db.inventory_slot.by_identity.filter(ctx.sender)]
      .filter((row) => row.itemKind === 'arrow' && row.quantity > 0)
      .sort((left, right) => left.slot - right.slot)[0];
    if (arrow === undefined) throw new SenderError('out_of_arrows');
    const charge = ctx.db.bow_charge.identity.find(ctx.sender);
    if (charge === null) throw new SenderError('bow_not_charged');
    const authoritativeChargeMs = authorityBowChargeMs(charge.startedTick, clock.authorityTick, chargeMs);
    const chargedRangePixels = bowChargedRangePixels(
      authoritativeChargeMs, BOW_MAX_TARGET_RANGE_PIXELS,
    );
    const aim = normalizedBowAim(aimX, aimY);
    const shot = bowShotForTarget(aimX, aimY, chargedRangePixels);
    const facing = directionFromAim(aimX, aimY);
    if (aim === null || shot === null || facing === null) throw new SenderError('invalid_aim');
    spendToolVigour(
      ctx,
      ctx.sender,
      'bow',
      clock.authorityTick,
      false,
      bowChargeVigourCostCenti(authoritativeChargeMs),
      true,
    );
    ctx.db.bow_charge.identity.delete(ctx.sender);
    wearInventoryTool(ctx, selected);

    ctx.db.inventory_slot.id.update({
      ...arrow,
      itemKind: arrow.quantity === 1 ? 'empty' : 'arrow',
      quantity: arrow.quantity - 1,
    });
    const origin = bowProjectileOrigin(position, aim, mount !== undefined);
    const { x, y } = origin;
    const projectile = ctx.db.world_projectile.insert({
      id: 0n,
      owner: ctx.sender,
      x,
      y,
      velocityX: shot.velocityX,
      velocityY: shot.velocityY,
      chunkX: chunkAt(x),
      chunkY: chunkAt(y),
      spawnedTick: clock.authorityTick,
      // The projectile is stepped on ticks after spawn. The extra tick lets it
      // complete exactly `lifetimeTicks` moves before becoming a ground item.
      expiresTick: clock.authorityTick + BigInt(shot.lifetimeTicks) + 1n,
      state: 'flying',
      hitKind: '',
      hitId: '',
      spaceId: position.spaceId,
    });
    ctx.db.projectile_charge.insert({
      projectileId: projectile.id,
      chargeMs: authoritativeChargeMs,
    });
    ctx.db.player_position.identity.update({
      ...position,
      facing,
      actionKind: 'ranged_weapon',
      actionStartedTick: nextActionStartedTick(position.actionStartedTick, clock.authorityTick),
      equippedKind: 'bow',
      equippedLit: true,
    });
    recordPlayerStatistic(ctx, ctx.sender, 'tool_uses', 1n, clock.authorityTick, 'bow');
    recordPlayerStatistic(ctx, ctx.sender, 'arrows_fired', 1n, clock.authorityTick);
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
    if (!mutableFarmTileAuthorized(ctx, position, tileX, tileY)) {
      throw new SenderError('homestead_owner_required');
    }
    if (mountedNpcFor(ctx, ctx.sender) !== null) {
      throw new SenderError('mounted_action_forbidden');
    }
    const slot = ctx.db.inventory_slot.id.find(`${ctx.sender.toHexString()}:${survival.selectedSlot}`);
    const selectedItem = slot?.itemKind ?? 'empty';
    const actionKind = avatarActionForEquippedKind(selectedItem);
    if (actionKind !== 'swing_hoe' && actionKind !== 'water') throw new SenderError('wrong_tool');
    requireUsableTool(slot);
    if (!isVitalsToolKind(selectedItem)) throw new SenderError('wrong_tool');
    const id = worldSoilId(position.spaceId, tileX, tileY);
    const soil = ctx.db.world_soil.id.find(id);
    const farmCollision = collisionForSpace(ctx, position.spaceId);
    const occupied = tilePlacementResult(
      position.x,
      position.y,
      tileX,
      tileY,
      farmCollision,
      tileOverlapsAnyPlayer(ctx, position.spaceId, tileX, tileY),
    ) === 'tile_blocked';
    const result = farmToolUseResult(
      seed.seed,
      position.x,
      position.y,
      selectedItem,
      tileX,
      tileY,
      soil === null ? null : {
        watered: soil.watered && clock.authorityTick < soil.wateredAtTick + CROP_WATERING_TICKS,
      },
      occupied,
      position.spaceId === TOPSIDE_SPACE_ID ? undefined : true,
    );
    if (result !== 'ok') throw new SenderError(result);
    spendToolVigour(ctx, ctx.sender, selectedItem, clock.authorityTick, false);
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
        spaceId: position.spaceId,
      });
      if (fiberDropsFromTilling(seed.seed, position.spaceId, tileX, tileY, clock.authorityTick)) {
        if (!insertPlayerCarriedItem(ctx, 'fiber', 1)) {
          const x = tileX * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2;
          const y = tileY * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2;
          dropWorldItemStack(ctx, {
            itemKind: 'fiber',
            quantity: 1,
            x,
            y,
            droppedAtTick: clock.authorityTick,
            durability: 0,
            spaceId: position.spaceId,
          });
        }
        recordPlayerStatistic(ctx, ctx.sender, 'items_obtained', 1n, clock.authorityTick, 'fiber');
      }
    } else if (soil !== null) {
      const cropRow = ctx.db.world_crop.id.find(id);
      const definition = cropRow === null ? null : cropDefinition(cropRow.cropKind);
      if (cropRow !== null && definition !== null) {
        const settled = cropGrowthAt(
          definition,
          cropRow.growthTicks,
          cropRow.growthUpdatedAtTick,
          soil.wateredAtTick,
          clock.authorityTick,
          soil.watered,
        );
        ctx.db.world_crop.id.update({
          ...cropRow,
          growthTicks: settled.growthTicks,
          growthUpdatedAtTick: clock.authorityTick,
        });
      }
      ctx.db.world_soil.id.update({ ...soil, watered: true, wateredAtTick: clock.authorityTick });
    }
    ctx.db.player_position.identity.update({
      ...position,
      facing: toolFacing ?? position.facing,
      actionKind,
      actionStartedTick: nextActionStartedTick(position.actionStartedTick, clock.authorityTick),
    });
    wearInventoryTool(ctx, slot);
    recordPlayerStatistic(ctx, ctx.sender, 'tool_uses', 1n, clock.authorityTick, selectedItem);
    recordPlayerStatistic(
      ctx,
      ctx.sender,
      selectedItem === 'hoe' ? 'farm_tiles_tilled' : 'farm_tiles_watered',
      1n,
      clock.authorityTick,
    );
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
    if (!mutableFarmTileAuthorized(ctx, position, tileX, tileY)) {
      throw new SenderError('homestead_owner_required');
    }
    if (mountedNpcFor(ctx, ctx.sender) !== null) {
      throw new SenderError('mounted_action_forbidden');
    }
    const slot = ctx.db.inventory_slot.id.find(`${ctx.sender.toHexString()}:${survival.selectedSlot}`);
    const selectedItem = slot?.itemKind ?? 'empty';
    const id = worldSoilId(position.spaceId, tileX, tileY);
    const soil = ctx.db.world_soil.id.find(id);
    if (ctx.db.world_crop.id.find(id) !== null) throw new SenderError('crop_occupies_tile');
    const result = farmSoilRestoreResult(position.x, position.y, selectedItem, tileX, tileY, soil);
    if (result !== 'ok') throw new SenderError(result);
    requireUsableTool(slot);
    if (!isVitalsToolKind(selectedItem)) throw new SenderError('wrong_tool');
    spendToolVigour(ctx, ctx.sender, selectedItem, clock.authorityTick, false);
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
    wearInventoryTool(ctx, slot);
    recordPlayerStatistic(ctx, ctx.sender, 'tool_uses', 1n, clock.authorityTick, selectedItem);
    recordPlayerStatistic(ctx, ctx.sender, 'farm_tiles_restored', 1n, clock.authorityTick);
  },
);

export const useCropTile = spacetimedb.reducer(
  { tileX: t.i16(), tileY: t.i16() },
  (ctx, { tileX, tileY }) => {
    requireAuthorizedSender(ctx.senderAuth.jwt, ctx.db.membership.identity.find(ctx.sender));
    if (handsOccupiedFor(ctx, ctx.sender)) throw new SenderError('hands_occupied');
    const position = ctx.db.player_position.identity.find(ctx.sender);
    const survival = ctx.db.player_survival.identity.find(ctx.sender);
    const clock = ctx.db.world_clock.id.find(0);
    if (position === null || survival === null || clock === null) throw new SenderError('player_not_ready');
    if (!mutableFarmTileAuthorized(ctx, position, tileX, tileY)) {
      throw new SenderError('homestead_owner_required');
    }
    if (mountedNpcFor(ctx, ctx.sender) !== null) throw new SenderError('mounted_action_forbidden');
    if (!tileTargetWithinFixedReach(position.x, position.y, { tileX, tileY }, 3 * TILE_SIZE_FIXED)) {
      throw new SenderError('farm_tile_out_of_range');
    }
    const id = worldSoilId(position.spaceId, tileX, tileY);
    const soil = ctx.db.world_soil.id.find(id);
    if (soil === null) throw new SenderError('not_tilled');
    const existing = ctx.db.world_crop.id.find(id);
    const activity = ctx.db.farm_activity.identity.find(ctx.sender);
    if (activity === null) throw new SenderError('farm_activity_not_ready');

    if (existing === null) {
      const slot = ctx.db.inventory_slot.id.find(`${ctx.sender.toHexString()}:${survival.selectedSlot}`);
      const definition = cropDefinitionForSeed(slot?.itemKind ?? 'empty');
      if (definition === null || slot === null || slot.quantity <= 0) throw new SenderError('select_seed_packet');
      const nextQuantity = slot.quantity - 1;
      ctx.db.inventory_slot.id.update({
        ...slot,
        itemKind: nextQuantity === 0 ? 'empty' : slot.itemKind,
        quantity: nextQuantity,
        durability: nextQuantity === 0 ? 0 : slot.durability,
        lit: nextQuantity === 0 ? true : slot.lit,
      });
      ctx.db.world_crop.insert({
        id,
        owner: ctx.sender,
        cropKind: definition.kind,
        tileX,
        tileY,
        chunkX: Math.floor(tileX / SURVIVAL_CHUNK_TILES),
        chunkY: Math.floor(tileY / SURVIVAL_CHUNK_TILES),
        plantedAtTick: clock.authorityTick,
        growthTicks: 0n,
        growthUpdatedAtTick: clock.authorityTick,
        spaceId: position.spaceId,
      });
      ctx.db.farm_activity.identity.update({ ...activity, planted: activity.planted + 1 });
      recordPlayerStatistic(ctx, ctx.sender, 'crops_planted', 1n, clock.authorityTick, definition.kind);
      return;
    }

    if (!existing.owner.isEqual(ctx.sender)) throw new SenderError('owner_only_harvest');
    const definition = cropDefinition(existing.cropKind);
    if (definition === null) throw new SenderError('unknown_crop_kind');
    const growth = cropGrowthAt(
      definition,
      existing.growthTicks,
      existing.growthUpdatedAtTick,
      soil.wateredAtTick,
      clock.authorityTick,
      soil.watered,
    );
    if (!growth.mature) throw new SenderError('crop_still_growing');
    if (!insertPlayerCarriedItem(ctx, definition.harvestItemKind, definition.harvestQuantity)) {
      throw new SenderError('inventory_full');
    }
    ctx.db.world_crop.id.delete(id);
    ctx.db.farm_activity.identity.update({ ...activity, harvested: activity.harvested + 1 });
    recordPlayerStatistic(ctx, ctx.sender, 'crops_harvested', 1n, clock.authorityTick, definition.kind);
    recordPlayerStatistic(
      ctx,
      ctx.sender,
      'items_obtained',
      BigInt(definition.harvestQuantity),
      clock.authorityTick,
      definition.harvestItemKind,
    );
  },
);

export const tendTree = spacetimedb.reducer(
  { treeId: t.u64() },
  (ctx, { treeId }) => {
    requireAuthorizedSender(ctx.senderAuth.jwt, ctx.db.membership.identity.find(ctx.sender));
    if (handsOccupiedFor(ctx, ctx.sender)) throw new SenderError('hands_occupied');
    const position = ctx.db.player_position.identity.find(ctx.sender);
    const tree = ctx.db.world_tree.id.find(treeId);
    const clock = ctx.db.world_clock.id.find(0);
    if (position === null || tree === null || clock === null) {
      throw new SenderError('target_not_ready');
    }
    if (mountedNpcFor(ctx, ctx.sender) !== null) {
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
    recordPlayerStatistic(ctx, ctx.sender, 'orchard_trees_tended', 1n, clock.authorityTick);
  },
);

export const useFarmTile = spacetimedb.reducer(
  { tileX: t.i16(), tileY: t.i16() },
  (ctx, { tileX, tileY }) => {
    requireAuthorizedSender(ctx.senderAuth.jwt, ctx.db.membership.identity.find(ctx.sender));
    if (handsOccupiedFor(ctx, ctx.sender)) throw new SenderError('hands_occupied');
    const position = ctx.db.player_position.identity.find(ctx.sender);
    const clock = ctx.db.world_clock.id.find(0);
    if (position === null || clock === null) throw new SenderError('player_not_ready');
    if (position.spaceId !== TOPSIDE_SPACE_ID) throw new SenderError('topside_only');
    if (mountedNpcFor(ctx, ctx.sender) !== null) {
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
        spaceId: position.spaceId,
      });
      ctx.db.farm_activity.identity.update({ ...actor, planted: actor.planted + 1 });
      recordPlayerStatistic(ctx, ctx.sender, 'crops_planted', 1n, clock.authorityTick, 'legacy_crop');
      return;
    }
    if (!crop.watered) {
      ctx.db.crop_patch.id.update({ ...crop, watered: true, wateredAtTick: clock.authorityTick });
      ctx.db.farm_activity.identity.update({ ...actor, watered: actor.watered + 1 });
      recordPlayerStatistic(ctx, ctx.sender, 'farm_tiles_watered', 1n, clock.authorityTick);
      return;
    }
    if (clock.authorityTick - crop.wateredAtTick < CROP_GROWTH_TICKS) {
      throw new SenderError('crop_still_growing');
    }
    if (!crop.owner.isEqual(ctx.sender)) throw new SenderError('owner_only_harvest');
    ctx.db.crop_patch.id.delete(crop.id);
    ctx.db.farm_activity.identity.update({ ...actor, harvested: actor.harvested + 1 });
    recordPlayerStatistic(ctx, ctx.sender, 'crops_harvested', 1n, clock.authorityTick, 'legacy_crop');
  },
);

export const stepWorld = spacetimedb.reducer(
  { onSchedule: movement_timer },
  { scheduledMessage: movement_timer.rowType },
  (ctx) => {
    const clock = ctx.db.world_clock.id.find(0);
    if (clock === null) return;
    const telemetryTimingSample = (clock.authorityTick + 1n) % TICK_TELEMETRY_LOG_TICKS === 0n;
    tickStageTiming(telemetryTimingSample, 'tick');
    const updateCounters = emptyTickUpdateCounters();
    let obstacleCount = 0;
    const installedWorld = ctx.db.world_seed.id.find(0);
    if (installedWorld === null || installedWorld.version < SURVIVAL_WORLD_VERSION) {
      if (installedWorld !== null) migrateWorldForOceanExpansion(ctx, installedWorld.version);
      if (installedWorld !== null && installedWorld.version < 3) {
        ctx.db.crop_patch.clear();
        ctx.db.farm_parcel.clear();
      }
      reconcileGeneratedSurvivalResources(ctx);
      const nextWorld = {
        id: 0,
        seed: SURVIVAL_WORLD_SEED,
        version: SURVIVAL_WORLD_VERSION,
        mineVersion: installedWorld?.mineVersion ?? 0,
      };
      if (installedWorld === null) ctx.db.world_seed.insert(nextWorld);
      else ctx.db.world_seed.id.update(nextWorld);
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
    const overflowOwners = new Map<string, WorldReducerContext['sender']>();
    for (const row of ctx.db.inventory_overflow.iter()) {
      overflowOwners.set(row.identity.toHexString(), row.identity);
    }
    for (const identity of overflowOwners.values()) drainPlayerOverflow(ctx, identity);
    const wildlifeGeneration = ctx.db.world_wildlife_generation.id.find(0);
    if (wildlifeGeneration === null || wildlifeGeneration.version < WILDLIFE_GENERATION_VERSION) {
      // Only this deterministic layer is replaced. Player identities, farms,
      // inventory, resources, and the authored starter horse are untouched.
      ctx.db.world_wildlife_profile.clear();
      for (const npc of ctx.db.world_npc.iter()) {
        if (npc.id >= BigInt(WILDLIFE_FIRST_NPC_ID)) ctx.db.world_npc.id.delete(npc.id);
      }
      ctx.db.world_hive.clear();
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
    recoverLegacyDismountHorses(ctx, clock.authorityTick);
    // Additive health-column backfill runs once. The marker prevents future
    // combat-era zero-health NPCs from being mistaken for legacy rows.
    if (ctx.db.stats_migration.id.find(0) === null) {
      for (const npc of ctx.db.world_npc.iter()) {
        if (npc.health !== 0 || !isWildlifeSpecies(npc.kind)) continue;
        updateWorldNpc(ctx, {
          ...npc,
          health: Math.ceil(resolveCreatureStats(npc.kind).maxHealthCenti / 100),
        });
      }
      ctx.db.stats_migration.insert({ id: 0, creatureHealthVersion: 1 });
    }

    for (const presence of ctx.db.connection_presence_v2.iter()) {
      if (!presenceLeaseExpired(
        presence.lastSeenAt.microsSinceUnixEpoch,
        ctx.timestamp.microsSinceUnixEpoch,
      )) continue;
      ctx.db.connection_presence_v2.connectionId.delete(presence.connectionId);
      deleteSessionChatNoticesForConnection(ctx, presence.connectionId);
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
        flushPlayerStatisticTime(ctx, presence.identity, clock.authorityTick, true);
        ctx.db.connection_notice.connectionId.delete(presence.connectionId);
      }
      const stillOnline = [
        ...ctx.db.connection_presence_v2.by_identity.filter(presence.identity),
      ].length > 0;
      if (stillOnline) continue;
      const profile = ctx.db.player_public.identity.find(presence.identity);
      if (profile !== null) {
        if (ctx.db.character_profile.identity.find(presence.identity)?.nameChosen === true) {
          broadcastSessionChatNotice(ctx, 'disconnect', worldDisconnectMessage(profile.displayName));
        }
        ctx.db.player_public.identity.update({ ...profile, online: false });
      }
      const input = ctx.db.player_input.identity.find(presence.identity);
      if (input !== null) ctx.db.player_input.identity.update({
        ...input,
        direction: 'idle',
        sprinting: false,
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
      for (const npc of ctx.db.world_npc.by_rider.filter(presence.identity)) {
        updateWorldNpc(ctx, {
          ...npc,
          rider: undefined,
          moving: false,
          wanderDirection: 'idle',
          nextDecisionTick: clock.authorityTick + 20n,
        });
      }
    }

    const activePresenceCount = ctx.db.connection_presence_v2.count();
    const activePresences = activePresenceCount === 0n
      ? []
      : [...ctx.db.connection_presence_v2.iter()];
    const authorityTick = clock.authorityTick + 1n;
    ctx.db.world_clock.id.update({ ...clock, authorityTick });
    const calendarTick = environment.calendarTick + 1n;
    ctx.db.world_environment.id.update({ ...environment, calendarTick });
    recordTickRowTouch(updateCounters, undefined, 2);
    if (authorityTick % BigInt(TREE_REGROWTH_SWEEP_TICKS) === 0n) {
      const weatherMode = isWeatherMode(environment.weatherMode) ? environment.weatherMode : 'auto';
      const raining = rainForWeatherMode(weatherMode, calendarTick);
      for (const resource of ctx.db.world_resource.iter()) {
        if (!isAxeHarvestableResourceKind(resource.kind)) continue;
        const storedProgress = resource.depleted && resource.health === 0
          && resource.regrowthProgress >= TREE_REGROWTH_PROGRESS_MAX
          ? 0
          : resource.regrowthProgress;
        if (storedProgress >= TREE_REGROWTH_PROGRESS_MAX) continue;
        const progress = treeRegrowthProgressAtSweep(storedProgress, authorityTick, raining, Number(resource.id & 0xffffffffn));
        const nextStage = treeGrowthStageForProgress(progress);
        const stageChanged = nextStage !== null && nextStage !== resource.growthStage;
        const returnsToLife = nextStage !== null && resource.depleted;
        ctx.db.world_resource.id.update({
          ...resource,
          growthStage: nextStage ?? resource.growthStage,
          regrowthProgress: progress,
          health: stageChanged || returnsToLife
            ? treeHealthForGrowthStage(nextStage ?? resource.growthStage)
            : resource.health,
          depleted: nextStage === null ? resource.depleted : false,
        });
        recordTickRowTouch(updateCounters);
      }
    }
    const statisticSessions = new Map<string, WorldReducerContext['sender']>();
    for (const presence of activePresences) {
      if (ctx.db.connection_notice.connectionId.find(presence.connectionId) === null) continue;
      statisticSessions.set(presence.identity.toHexString(), presence.identity);
    }
    for (const identity of statisticSessions.values()) {
      flushPlayerStatisticTime(ctx, identity, authorityTick, false);
      // A one-hertz indexed re-derivation closes gaps from legacy inventory
      // reducer paths while keeping quest truth independent of client events.
      if (authorityTick % BigInt(AUTHORITY_HZ) === 0n) {
        refreshPlayerQuests(ctx, identity, authorityTick);
      }
    }
    tickStageTiming(telemetryTimingSample, 'expiry');
    for (const effect of ctx.db.player_effect.iter()) {
      if (effect.expiresTick > authorityTick) continue;
      ctx.db.player_effect.id.delete(effect.id);
      recordTickRowTouch(updateCounters);
    }
    for (const item of ctx.db.world_item.iter()) {
      if (!worldItemExpiredForRow(item, authorityTick)) continue;
      ctx.db.world_item.id.delete(item.id);
      recordTickRowTouch(updateCounters, 'itemDeletes');
    }
    if (authorityTick % AUDIT_TRIM_CADENCE_TICKS === 0n) {
      for (const audit of ctx.db.connection_audit.iter()) {
        if (!connectionAuditExpired(
          audit.occurredAt.microsSinceUnixEpoch,
          ctx.timestamp.microsSinceUnixEpoch,
        )) continue;
        ctx.db.connection_audit.id.delete(audit.id);
        recordTickRowTouch(updateCounters, 'auditDeletes');
      }
    }
    for (const speech of ctx.db.world_speech.iter()) {
      if (speech.expiresTick > authorityTick) continue;
      ctx.db.world_speech.id.delete(speech.id);
      recordTickRowTouch(updateCounters);
    }
    tickStageTiming(telemetryTimingSample, 'expiry', true);
    // The coarse world/NPC simulation may sleep with no connected players, but
    // authority time must continue so effects expire and lazy vital regen can
    // catch up exactly on the next connection.
    if (activePresenceCount === 0n) {
      finishTickTelemetry(authorityTick, updateCounters, obstacleCount);
      return;
    }
    if (authorityTick % BigInt(REGEN_SWEEP_TICKS) === 0n) {
      const online = new Map<string, WorldReducerContext['sender']>();
      for (const presence of activePresences) {
        online.set(presence.identity.toHexString(), presence.identity);
      }
      for (const identity of online.values()) {
        const input = ctx.db.player_input.identity.find(identity);
        const activelySprinting = input !== null
          && ((input.sprinting && input.direction !== 'idle')
            || input.settleDirection.includes('!'))
          && !inputIsStale(input.updatedAtMicros, ctx.timestamp.microsSinceUnixEpoch)
          && mountedNpcFor(ctx, identity) === null;
        const activelyChargingBow = ctx.db.bow_charge.identity.find(identity) !== null;
        advancePlayerStats(
          ctx,
          identity,
          authorityTick,
          activelySprinting || activelyChargingBow,
        );
      }
    }
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
    tickStageTiming(telemetryTimingSample, 'collision');
    const onlinePlayerByIdentity = new Map<string, PlayerPositionRow>();
    for (const presence of activePresences) {
      let player = ctx.db.player_position.identity.find(presence.identity);
      if (player !== null && ctx.db.homestead.spaceId.find(player.spaceId) !== null) {
        const tileX = Math.floor(player.x / TILE_SIZE_FIXED);
        const tileY = Math.floor(player.y / TILE_SIZE_FIXED);
        // Recover only genuinely stranded legacy positions. Fence contact is
        // resolved by ordinary movement collision; teleporting on contact made
        // the closed gate feel like a rubber band.
        if (!homesteadPlayableTile(tileX, tileY)
          && (tileX < HOMESTEAD_PLOT_MIN_TILE - 1 || tileX > HOMESTEAD_PLOT_MAX_TILE + 1
            || tileY < HOMESTEAD_PLOT_MIN_TILE - 1 || tileY > HOMESTEAD_PLOT_MAX_TILE + 1)) {
          teleportPlayer(
            ctx,
            player,
            player.spaceId,
            HOMESTEAD_ENTRY_TILE.tileX * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2,
            HOMESTEAD_ENTRY_TILE.tileY * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2,
          );
          player = ctx.db.player_position.identity.find(presence.identity);
        }
      }
      if (player !== null) onlinePlayerByIdentity.set(presence.identity.toHexString(), player);
    }
    const onlinePlayers = [...onlinePlayerByIdentity.values()];
    const playersBySpace = new Map<number, PlayerPositionRow[]>();
    for (const player of onlinePlayers) {
      const players = playersBySpace.get(player.spaceId) ?? [];
      players.push(player);
      playersBySpace.set(player.spaceId, players);
    }
    const collisionBySpace = new Map<number, ReturnType<typeof createAuthoritySpaceCollisionMap>>();
    const waterCollisionBySpace = new Map<number, ReturnType<typeof createAuthoritySpaceCollisionMap>>();
    const resourcesBySpace = new Map<number, WorldResourceRow[]>();
    const chestsBySpace = new Map<number, WorldChestRow[]>();
    const combatTargetsBySpace = new Map<number, WorldCombatTargetRow[]>();
    for (const spaceId of playersBySpace.keys()) {
      // Prefix scans over the reshaped chunk indexes preserve complete collision
      // for every stepped entity while avoiding scans of unoccupied spaces.
      const resources = [...ctx.db.world_resource.by_chunk.filter(spaceId)];
      const chests = [...ctx.db.world_chest.by_chunk.filter(spaceId)];
      const combatTargets = [...ctx.db.world_combat_target.by_chunk.filter(spaceId)];
      resourcesBySpace.set(spaceId, resources);
      chestsBySpace.set(spaceId, chests);
      combatTargetsBySpace.set(spaceId, combatTargets);
      // Use the same augmented map as reducers and clients. This adds dynamic
      // Homestead POIs/tents; constructing the base map directly here caused
      // authority to walk through them while prediction correctly stopped.
      const collision = collisionForSpace(ctx, spaceId);
      collisionBySpace.set(spaceId, collision);
      waterCollisionBySpace.set(spaceId, createAuthoritySpaceCollisionMap(
        spaceId, [], [], 'water', [], homesteadForSpace(ctx, spaceId),
      ));
      obstacleCount += collision.obstacles?.length ?? 0;
    }
    tickStageTiming(telemetryTimingSample, 'collision', true);

    if (authorityTick % BigInt(ARCHERY_TARGET_REGEN_INTERVAL_TICKS) === 0n) {
      for (const targets of combatTargetsBySpace.values()) {
        for (const target of targets) regenerateCombatTarget(ctx, target, authorityTick);
      }
    }

    tickStageTiming(telemetryTimingSample, 'projectiles');
    const occupiedProjectiles = [...playersBySpace.keys()]
      .flatMap((spaceId) => [...ctx.db.world_projectile.by_chunk.filter(spaceId)]);
    for (const projectile of occupiedProjectiles) {
      const collision = collisionBySpace.get(projectile.spaceId);
      if (collision === undefined) continue;
      if (projectile.expiresTick <= authorityTick) {
        ctx.db.world_projectile.id.delete(projectile.id);
        ctx.db.projectile_charge.projectileId.delete(projectile.id);
        const landedAtTick = projectile.hitKind === 'combat_target'
          ? authorityTick
          : projectile.state === 'hit'
            ? projectile.expiresTick - PROJECTILE_HIT_RETENTION_TICKS
          : projectile.expiresTick - 1n;
        if (!worldItemExpired(
          landedAtTick,
          authorityTick,
          RECOVERABLE_ARROW_LIFETIME_TICKS,
        )) {
          dropWorldItemStack(ctx, {
            itemKind: 'arrow',
            quantity: 1,
            x: projectile.x,
            y: projectile.y,
            droppedAtTick: landedAtTick,
            durability: recoverableArrowAngle(projectile.velocityX, projectile.velocityY),
            spaceId: projectile.spaceId,
          });
        }
        continue;
      }
      if (projectile.state !== 'flying') {
        continue;
      }
      const from = { x: projectile.x, y: projectile.y };
      const to = { x: projectile.x + projectile.velocityX, y: projectile.y + projectile.velocityY };
      const targets = [];
      for (const player of playersBySpace.get(projectile.spaceId) ?? []) {
        if (player.identity.isEqual(projectile.owner)) continue;
        const online = [
          ...ctx.db.connection_presence_v2.by_identity.filter(player.identity),
        ].length > 0;
        if (!online) continue;
        const bounds = playerHitboxBounds({ x: player.x, y: player.y });
        targets.push({ kind: 'player', id: player.identity.toHexString(), ...bounds });
      }
      for (const npc of ctx.db.world_npc.by_chunk.filter(projectile.spaceId)) {
        if (npc.rider?.isEqual(projectile.owner) === true) continue;
        targets.push({
        kind: 'npc', id: npc.id.toString(),
        left: npc.x - 7 * FIXED_UNITS_PER_PIXEL,
        right: npc.x + 7 * FIXED_UNITS_PER_PIXEL,
        top: npc.y - 15 * FIXED_UNITS_PER_PIXEL,
        bottom: npc.y,
        });
      }
      for (const resource of resourcesBySpace.get(projectile.spaceId) ?? []) {
        if (resource.depleted) continue;
        if (!survivalResourceBlocksMovement(resource.kind)) continue;
        targets.push({ kind: 'resource', id: resource.id.toString(), ...survivalResourceObstacle(
          resource.kind,
          resource.tileX,
          resource.tileY,
        ) });
      }
      for (const chest of chestsBySpace.get(projectile.spaceId) ?? []) {
        if (chest.carriedBy !== undefined) continue;
        targets.push({
          kind: 'chest', id: chest.id.toString(),
          left: chest.tileX * TILE_SIZE_FIXED,
          right: (chest.tileX + 1) * TILE_SIZE_FIXED,
          top: chest.tileY * TILE_SIZE_FIXED,
          bottom: (chest.tileY + 1) * TILE_SIZE_FIXED,
        });
      }
      for (const target of combatTargetsBySpace.get(projectile.spaceId) ?? []) {
        if (target.carriedBy !== undefined) continue;
        targets.push({
          kind: 'combat_target',
          id: target.id.toString(),
          ...combatTargetProjectileBounds(target),
        });
      }
      // The parabola meets the entity plane only at its cursor-selected
      // endpoint. Earlier segments may cross a target in screen space, but
      // must not snap the embedded arrow to that leading collision edge.
      const landingStep = projectile.expiresTick === authorityTick + 1n;
      const entityHit = landingStep ? projectileTargetAtLanding(to, targets) : null;
      const terrainHit = firstProjectileTerrainHit(from, to, collision);
      const hit = entityHit === null ? terrainHit
        : terrainHit === null || entityHit.fraction <= terrainHit.fraction ? entityHit : terrainHit;
      if (hit !== null) {
        if (hit.kind === 'combat_target') {
          const storedTarget = ctx.db.world_combat_target.id.find(BigInt(hit.id));
          if (storedTarget !== null && storedTarget.spaceId === projectile.spaceId
            && storedTarget.carriedBy === undefined) {
            const target = regenerateCombatTarget(ctx, storedTarget, authorityTick);
            const statsRow = advancePlayerStats(ctx, projectile.owner, authorityTick);
            const modifiers = activePlayerModifiers(ctx, projectile.owner, authorityTick);
            const resolved = resolveStats({
              str: statsRow.str, dex: statsRow.dex, con: statsRow.con,
              int: statsRow.int, wis: statsRow.wis, cha: statsRow.cha,
            }, modifiers);
            const seed = ctx.db.world_seed.id.find(0)?.seed ?? SURVIVAL_WORLD_SEED;
            const damage = resolveCombatDamage({
              attackKind: 'ranged',
              weaponBaseCenti: BOW_BASE_DAMAGE_CENTI,
              scalingAttribute: resolved.attributes.dex,
              armorCenti: 0,
              armorPctBasisPoints: 0,
              seedParts: [seed, projectile.owner.toHexString(), authorityTick, projectile.id, 'bow'],
              attackerModifiers: modifiers,
            });
            const chargedDamageCenti = bowChargeScaledDamageCenti(
              damage.damageCenti,
              ctx.db.projectile_charge.projectileId.find(projectile.id)?.chargeMs ?? 0,
            );
            const nextHealth = Math.max(1, target.healthCenti - chargedDamageCenti);
            const appliedDamage = target.healthCenti - nextHealth;
            if (appliedDamage > 0) {
              ctx.db.world_combat_target.id.update({
                ...target,
                healthCenti: nextHealth,
                regenTick: authorityTick,
                lastDamagedTick: authorityTick,
                lastHitCritical: damage.critical,
              });
              recordPlayerStatistic(
                ctx, projectile.owner, 'damage_dealt', BigInt(appliedDamage), authorityTick, target.kind,
              );
            }
          }
        }
        ctx.db.world_projectile.id.update({
          ...projectile,
          x: hit.x,
          y: hit.y,
          chunkX: chunkAt(hit.x),
          chunkY: chunkAt(hit.y),
          state: 'hit',
          hitKind: hit.kind,
          hitId: hit.id,
          expiresTick: authorityTick + (hit.kind === 'combat_target'
            ? ARCHERY_TARGET_EMBEDDED_ARROW_TICKS
            : PROJECTILE_HIT_RETENTION_TICKS),
        });
        recordPlayerStatistic(
          ctx, projectile.owner, 'arrows_hit', 1n, authorityTick, hit.kind,
        );
        ctx.db.projectile_charge.projectileId.delete(projectile.id);
        continue;
      }
      ctx.db.world_projectile.id.update({
        ...projectile,
        x: to.x,
        y: to.y,
        chunkX: chunkAt(to.x),
        chunkY: chunkAt(to.y),
      });
      recordTickRowTouch(updateCounters);
    }
    tickStageTiming(telemetryTimingSample, 'projectiles', true);

    tickStageTiming(telemetryTimingSample, 'movement');
    for (const row of onlinePlayers) {
      const collision = collisionBySpace.get(row.spaceId);
      if (collision === undefined) continue;
      const input = ctx.db.player_input.identity.find(row.identity);
      const mounted = mountedNpcFor(ctx, row.identity) !== null;
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
        const hasSprintIntent = !mounted && drained.intents.some((intent) => intent.sprinting);
        const sprintStatsRow = hasSprintIntent
          ? advancePlayerStats(ctx, row.identity, authorityTick, true)
          : null;
        const sprintModifiers = sprintStatsRow === null
          ? []
          : activePlayerModifiers(ctx, row.identity, authorityTick);
        const sprintResolvedStats = sprintStatsRow === null
          ? null
          : resolveStats({
            str: sprintStatsRow.str,
            dex: sprintStatsRow.dex,
            con: sprintStatsRow.con,
            int: sprintStatsRow.int,
            wis: sprintStatsRow.wis,
            cha: sprintStatsRow.cha,
          }, sprintModifiers);
        const sprintAbility = sprintResolvedStats === null
          ? null
          : resolveSprintAbility(sprintResolvedStats.attributes, sprintModifiers);
        let sprintStepsMoved = 0;
        let sprintCostCenti = 0;
        for (const intent of drained.intents) {
          const nextSprintCost = sprintAbility === null
            ? 0
            : sprintVigourCostForSteps(
              sprintAbility.vigourDrainCentiPerSecond,
              sprintStepsMoved + 1,
            );
          const canSprint = intent.sprinting
            && sprintStatsRow !== null
            && sprintAbility !== null
            && sprintStatsRow.vigourCenti >= nextSprintCost;
          const beforeX = player.position.x;
          const beforeY = player.position.y;
          player = mounted
            ? movePlayerAtSpeed(player, intent.direction, collision, 2)
            : canSprint
              ? movePlayerAtSpeedPermille(
                player, intent.direction, collision, sprintAbility.speedPermille,
              )
              : movePlayer(player, intent.direction, collision);
          if (canSprint && (player.position.x !== beforeX || player.position.y !== beforeY)) {
            sprintStepsMoved += 1;
            sprintCostCenti = nextSprintCost;
          }
        }
        if (sprintStatsRow !== null && sprintCostCenti > 0) {
          ctx.db.player_stats.identity.update({
            ...sprintStatsRow,
            vigourCenti: sprintStatsRow.vigourCenti - sprintCostCenti,
            vigourRemainder: 0,
            regenTick: authorityTick,
          });
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
      if (moved) {
        const distance = BigInt(Math.abs(player.position.x - startedX) + Math.abs(player.position.y - startedY));
        recordPlayerStatistic(
          ctx,
          row.identity,
          'distance_travelled',
          distance,
          authorityTick,
          mounted ? 'horse' : 'foot',
        );
      }
      const nextActionKind = jumpActive
        ? 'horse_jump'
        : mounted
          ? row.actionKind === 'ranged_weapon' ? row.actionKind : 'none'
          : avatarActionAfterMovement(row.actionKind, moved);
      const clearAction = nextActionKind === 'none' && row.actionKind !== 'none';
      const nextPosition = {
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
      };
      const positionUpdated = updateRowWhenChanged(row, nextPosition, [
        'x', 'y', 'chunkX', 'chunkY', 'facing', 'moving',
        'lastProcessedSequence', 'actionKind', 'actionStartedTick',
        'jumpFromX', 'jumpFromY', 'jumpUntilTick',
      ], updateCounters, 'playerPositionUpdates', (next) => {
        ctx.db.player_position.identity.update(next);
      });
      if (!positionUpdated) updateCounters.playerPositionNoopSkips += 1;
      if (moved) refreshPlayerQuestLocations(ctx, nextPosition, authorityTick);
      for (const chest of ctx.db.world_chest.by_carrier.filter(row.identity)) {
        const tileX = Math.floor(player.position.x / TILE_SIZE_FIXED);
        const tileY = Math.floor(player.position.y / TILE_SIZE_FIXED);
        const chunkX = Math.floor(tileX / SURVIVAL_CHUNK_TILES); const chunkY = Math.floor(tileY / SURVIVAL_CHUNK_TILES);
        if (chest.tileX !== tileX || chest.tileY !== tileY || chest.chunkX !== chunkX || chest.chunkY !== chunkY) {
          ctx.db.world_chest.id.update({ ...chest, tileX, tileY, chunkX, chunkY });
          recordTickRowTouch(updateCounters, 'chestUpdates');
        }
      }
      for (const target of ctx.db.world_combat_target.by_carrier.filter(row.identity)) {
        const chunkX = chunkAt(player.position.x);
        const chunkY = chunkAt(player.position.y);
        if (target.x !== player.position.x || target.y !== player.position.y
          || target.chunkX !== chunkX || target.chunkY !== chunkY || target.spaceId !== row.spaceId) {
          moveEmbeddedArrowsWithTarget(
            ctx, target, player.position.x, player.position.y, row.spaceId,
          );
          ctx.db.world_combat_target.id.update({
            ...target,
            x: player.position.x,
            y: player.position.y,
            chunkX,
            chunkY,
            spaceId: row.spaceId,
          });
          recordTickRowTouch(updateCounters);
        }
      }
      for (const placeable of ctx.db.world_placeable.by_carrier.filter(row.identity)) {
        const tileX = Math.floor(player.position.x / TILE_SIZE_FIXED);
        const tileY = Math.floor(player.position.y / TILE_SIZE_FIXED);
        const chunkX = Math.floor(tileX / SURVIVAL_CHUNK_TILES);
        const chunkY = Math.floor(tileY / SURVIVAL_CHUNK_TILES);
        if (placeable.tileX !== tileX || placeable.tileY !== tileY
          || placeable.chunkX !== chunkX || placeable.chunkY !== chunkY
          || placeable.spaceId !== row.spaceId) {
          ctx.db.world_placeable.id.update({
            ...placeable,
            tileX,
            tileY,
            chunkX,
            chunkY,
            spaceId: row.spaceId,
          });
          recordTickRowTouch(updateCounters);
        }
      }
    }
    tickStageTiming(telemetryTimingSample, 'movement', true);

    const wildlifePlayerChunks = onlinePlayers
      .filter((player) => player.spaceId === TOPSIDE_SPACE_ID)
      .map((player) => [player.chunkX, player.chunkY] as const);
    tickStageTiming(telemetryTimingSample, 'npc');
    const occupiedNpcs = [...playersBySpace.keys()]
      .flatMap((spaceId) => [...ctx.db.world_npc.by_chunk.filter(spaceId)]);
    for (const npc of occupiedNpcs) {
      const collision = collisionBySpace.get(npc.spaceId);
      const waterCollision = waterCollisionBySpace.get(npc.spaceId);
      if (collision === undefined || waterCollision === undefined) continue;
      if (npc.rider !== undefined) {
        const rider = ctx.db.player_position.identity.find(npc.rider);
        if (rider === null) {
          updateWorldNpc(ctx, {
            ...npc,
            rider: undefined,
            moving: false,
            wanderDirection: 'idle',
            nextDecisionTick: authorityTick + 20n,
            authorityTick,
          });
          recordTickRowTouch(updateCounters, 'npcUpdates');
          continue;
        }
        const facing = mountedHorseFacing(
          parseNpcFacing(npc.facing),
          parseDirection(rider.facing) ?? 'down',
          rider.moving,
        );
        const nextNpc = {
          ...npc,
          x: rider.x,
          y: rider.y,
          chunkX: rider.chunkX,
          chunkY: rider.chunkY,
          spaceId: rider.spaceId,
          facing,
          moving: rider.moving,
          wanderDirection: 'idle',
          authorityTick,
        };
        updateRowWhenChanged(npc, nextNpc, [
          'x', 'y', 'chunkX', 'chunkY', 'facing', 'moving', 'wanderDirection',
        ], updateCounters, 'npcUpdates', (next) => {
          updateWorldNpc(ctx, next);
        });
        continue;
      }

      const wildlifeProfile = ctx.db.world_wildlife_profile.npcId.find(npc.id) ?? undefined;
      const wildlifeNpc = wildlifeProfile !== undefined && isWildlifeSpecies(wildlifeProfile.species);
      if (firstIndexRow(ctx.db.active_dialogue.by_npc.filter(npc.id)) !== null) {
        if (npc.moving || npc.wanderDirection !== 'idle') {
          updateWorldNpc(ctx, {
            ...npc,
            moving: false,
            wanderDirection: 'idle',
            nextDecisionTick: authorityTick + 30n,
            authorityTick,
          });
          recordTickRowTouch(updateCounters, 'npcUpdates');
          if (!wildlifeNpc) updateCounters.nonWildlifeNpcUpdates += 1;
        } else if (!wildlifeNpc) {
          updateCounters.nonWildlifeNpcNoopSkips += 1;
        }
        continue;
      }

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
        updateWorldNpc(ctx, {
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
        recordTickRowTouch(updateCounters, 'npcUpdates');
        continue;
      }

      const marlowFire = npc.id === TOOL_MERCHANT_ID
        ? ctx.db.world_campfire_state.id.find(MARLOW_CAMPFIRE_ID)
        : null;
      const marlowReturningToFire = marlowFire !== null
        && !marlowFire.manualOverride
        && marlowFire.lit !== marlowCampfireShouldBeLit(calendarTick);
      const marlowTarget = {
        x: MARLOW_CAMPFIRE_TILE.tileX * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2,
        y: MARLOW_CAMPFIRE_TILE.tileY * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2,
      };
      if (marlowReturningToFire && marlowFire !== null) {
        const dx = marlowTarget.x - npc.x;
        const dy = marlowTarget.y - npc.y;
        if (dx * dx + dy * dy <= NPC_INTERACTION_REACH_FIXED * NPC_INTERACTION_REACH_FIXED) {
          ctx.db.world_campfire_state.id.update({
            ...marlowFire,
            lit: marlowCampfireShouldBeLit(calendarTick),
          });
        }
      }
      const wanderingState = {
        id: npc.id,
        position: { x: npc.x, y: npc.y },
        home: { x: npc.homeX, y: npc.homeY },
        facing: parseNpcFacing(npc.facing),
        moving: npc.moving,
        wanderDirection: npcDirection(npc.wanderDirection),
        nextDecisionTick: Number(npc.nextDecisionTick),
      };
      const stepped = marlowReturningToFire
        ? stepNpcTowardPoint(wanderingState, marlowTarget, Number(authorityTick), collision)
        : stepWanderingNpc(wanderingState, Number(authorityTick), collision);
      const nextNpc = {
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
      };
      const npcUpdated = updateRowWhenChanged(npc, nextNpc, [
        'x', 'y', 'chunkX', 'chunkY', 'facing', 'moving',
        'wanderDirection', 'nextDecisionTick',
      ], updateCounters, 'npcUpdates', (next) => {
        updateWorldNpc(ctx, next);
      });
      if (npcUpdated) updateCounters.nonWildlifeNpcUpdates += 1;
      else updateCounters.nonWildlifeNpcNoopSkips += 1;
    }
    tickStageTiming(telemetryTimingSample, 'npc', true);
    finishTickTelemetry(authorityTick, updateCounters, obstacleCount);
  },
);
