import { parseChunkRuntimeMode } from '@orchard/sim/chunk-runtime';
import { ChunkRuntimeController } from '../chunk-runtime-controller.js';
import {
  INPUT_REFRESH_STEPS, REMOTE_SNAPSHOT_CAPACITY, CURRENT_INVENTORY_PROTOCOL_VERSION,
  SURVIVAL_CHUNK_TILES, SURVIVAL_WORLD_SIZE, TILE_SIZE_FIXED, TILE_SIZE_PIXELS, TOPSIDE_SPACE_ID,
  instanceSpaceRowFor,
  LIVE_ISLAND_MAP_ID, runtimeResourcePerception,
  runtimeChestObjectDefinition,
  type ContentRegistry,
  type CollisionMap, type ItemStack, type MerchantCartLine, type MoveItemRequest, type PlayerState,
} from '@orchard/sim';
import { clientSpaceDefinition, spaceStreamingKey } from '../content/space-authority.js';
import type { Identity } from 'spacetimedb';
import { DbConnection, tables, type SubscriptionHandle } from '@orchard/world-bindings';
import { ensureOidcSession, localProfilesEnabled, oidcConfigured, readOidcSession } from '@orchard/auth';
import type {
  VillageOrderQuote, HearthStashSlot, OutdoorEnemyProfile, OutdoorRewardClaim, PlayerCombatState, EnemyAttack, CellarExcavation, CharacterProfile, ChatChannel, ChatMessage, ConnectionNotice, RuntimeContentDefinition, ContentHead, FishingCast, Homestead, HomesteadGuest, HomesteadUpgrade, InventorySlot, Membership, PlayerAppearance, PlayerCookingJob, PlayerEffect, PlayerJumpState, PlayerKnownRecipe, PlayerPosition, PlayerPredictionState, PlayerPublic, PlayerQuest, PlayerQuestBaseline as StoredPlayerQuestBaseline, PlayerSkillNode, PlayerSkillTrack, PlayerStatistic, PlayerStats, PlayerSurvival, PlayerThought, QuestWorldItem, RogueEnemyProfile, RogueRewardOffer, RogueRoomExit, RogueRun, RogueRunUpgrade, SessionChatNotice,
  LiveMapDocument, SpacePortal, WorldCampfireState, WorldChest, WorldChestSlot, WorldClock, WorldCombatTarget, WorldCrop, WorldEnvironment, WorldHive, WorldItem, WorldMerchant, WorldNpc, WorldPlaceable, WorldPlaceableSlot, WorldProjectile, WorldResource, WorldSeed, WorldSoil, WorldSpeech, WorldWildlifeProfile, WorldWind,
  WorldSurface,
} from '@orchard/world-bindings/types';
import type { WeatherMode, WindDirectionMode } from '@orchard/sim';
import { BoundedKeyedQueue, KeyedStore, type ReadonlyKeyedStore } from './keyed-store.js';
import {
  LatencyInjector, LocalPredictionBuffer, latencyFromSearch,
  inputRefreshDue,
  type InputDirection, type ReconciliationResult,
} from './netcode.js';
import {
  LiveContentRegistry,
  type ContentDraftOverlay,
  type LiveContentState,
} from '../content/live-content.js';
import { clientErrorReporter } from '../client-error-reporter.js';
import { resourceDiscoveryQueries, resourceDiscoveryRadii } from './resource-discovery-queries.js';
import { ConnectionRecovery, type ConnectionRecoveryState } from './connection-recovery.js';

type PlayerQuestBaseline=StoredPlayerQuestBaseline & {readonly currentValue?:bigint};

const DEFAULT_DATABASE = 'orchard-cellar-world';
const SURVIVAL_CHUNK_COUNT = Math.ceil(SURVIVAL_WORLD_SIZE / SURVIVAL_CHUNK_TILES);
const SURVIVAL_CHUNK_PIXELS = SURVIVAL_CHUNK_TILES * TILE_SIZE_PIXELS;
const RADIUS_SETTLE_MS = 180;
const RTT_SAMPLE_CAPACITY = 256;
const WORLD_REGION_RANGE_QUERIES = 17;
const ROGUE_REGION_RANGE_QUERIES = 6;
export const MAX_VIEW_RADIUS = 9;
export const REGION_CENTER_DEADBAND_TILES = 8;

export interface ViewRadius {
  readonly x: number;
  readonly y: number;
}

function clampViewRadius(radius: number): number {
  return Math.max(1, Math.min(MAX_VIEW_RADIUS, SURVIVAL_CHUNK_COUNT, Math.ceil(radius)));
}

export function viewRadiusForViewport(canvasWidth: number, canvasHeight: number, zoom: number): ViewRadius {
  const chunkDiameter = Math.max(0.01, zoom) * SURVIVAL_CHUNK_PIXELS * 2;
  return {
    x: clampViewRadius(Math.ceil(canvasWidth / chunkDiameter) + 1),
    y: clampViewRadius(Math.ceil(canvasHeight / chunkDiameter) + 1),
  };
}

export function subscriptionChunkBounds(
  chunkX: number,
  chunkY: number,
  radius: ViewRadius,
  sizeTiles = SURVIVAL_WORLD_SIZE,
): {
  readonly minX: number; readonly minY: number; readonly maxX: number; readonly maxY: number;
} {
  const chunkCount = Math.max(1, Math.ceil(sizeTiles / SURVIVAL_CHUNK_TILES));
  return { minX: Math.max(0, chunkX - radius.x), minY: Math.max(0, chunkY - radius.y),
    maxX: Math.min(chunkCount - 1, chunkX + radius.x),
    maxY: Math.min(chunkCount - 1, chunkY + radius.y) };
}

export function outsideRegionCenterDeadband(
  subscribedCenter: readonly [number, number] | null,
  tileX: number,
  tileY: number,
): boolean {
  return subscribedCenter === null
    || Math.abs(tileX - subscribedCenter[0]) > REGION_CENTER_DEADBAND_TILES
    || Math.abs(tileY - subscribedCenter[1]) > REGION_CENTER_DEADBAND_TILES;
}

export function regionSubscriptionQueryCount(
  bounds: ReturnType<typeof subscriptionChunkBounds>,
  spaceId = TOPSIDE_SPACE_ID,
  generator?: string,
): number {
  void bounds;
  if (generator === 'roguelike') return ROGUE_REGION_RANGE_QUERIES;
  return WORLD_REGION_RANGE_QUERIES
    + (spaceId === TOPSIDE_SPACE_ID ? 2 : 0)
    + (generator === 'cellar' ? 1 : 0);
}

export function rogueRunRequiresRegionRefresh(
  previous: Pick<RogueRun, 'spaceId'> | null,
  next: Pick<RogueRun, 'spaceId'> | null,
  currentSpaceId: number,
): boolean {
  return next !== null
    && next.spaceId === currentSpaceId
    && previous?.spaceId !== next.spaceId;
}

export interface ActiveDialogue {
  readonly identity: Identity;
  readonly npcId: bigint;
  readonly dialogueId: string;
  readonly nodeId: string;
}

export interface PlayerWallet {
  readonly identity: Identity;
  readonly balanceBronze: bigint;
}

export interface PlayerTradeSession {
  readonly id: string;
  readonly requester: Identity;
  readonly recipient: Identity;
  readonly state: string;
  readonly requesterAccepted: boolean;
  readonly recipientAccepted: boolean;
  readonly requesterBronze: bigint;
  readonly recipientBronze: bigint;
  readonly revision: bigint;
  readonly createdTick: bigint;
}

export interface PlayerTradeOffer {
  readonly id: string;
  readonly tradeId: string;
  readonly owner: Identity;
  readonly slot: number;
  readonly itemKind: string;
  readonly quantity: number;
  readonly durability: number;
  readonly lit: boolean;
}

export interface OperationalChatNotice {
  readonly id: bigint;
  readonly kind: 'last' | 'baltop';
  readonly body: string;
  readonly issuedAtMicros: bigint;
}

export interface OverworldView {
  readonly connected: boolean; readonly error: string | null; readonly identityHex: string | null;
  readonly content: LiveContentState;
  readonly region: readonly [number, number];
  readonly profiles: ReadonlyKeyedStore<string, PlayerPublic>;
  readonly appearances: ReadonlyKeyedStore<string, PlayerAppearance>;
  readonly players: ReadonlyKeyedStore<string, PlayerPosition>;
  readonly playerJumps: ReadonlyKeyedStore<string, PlayerJumpState>;
  readonly fishingCasts: ReadonlyKeyedStore<string, FishingCast>;
  readonly resources: ReadonlyKeyedStore<bigint, WorldResource>;
  readonly soil: ReadonlyKeyedStore<string, WorldSoil>;
  readonly crops: ReadonlyKeyedStore<string, WorldCrop>;
  readonly worldItems: ReadonlyKeyedStore<bigint, WorldItem>;
  readonly projectiles: ReadonlyKeyedStore<bigint, WorldProjectile>;
  readonly combatTargets: ReadonlyKeyedStore<bigint, WorldCombatTarget>;
  readonly chests: ReadonlyKeyedStore<bigint, WorldChest>;
  readonly placeables: ReadonlyKeyedStore<bigint, WorldPlaceable>;
  readonly campfires?: ReadonlyKeyedStore<bigint, WorldCampfireState>;
  readonly npcs: ReadonlyKeyedStore<bigint, WorldNpc>;
  readonly merchants: ReadonlyKeyedStore<bigint, WorldMerchant>;
  readonly wildlifeProfiles: ReadonlyKeyedStore<bigint, WorldWildlifeProfile>;
  readonly outdoorEnemyProfiles?: ReadonlyKeyedStore<bigint, OutdoorEnemyProfile>;
  readonly outdoorRewardsRevision?: number;
  readonly outdoorRewards?: ReadonlyKeyedStore<string, OutdoorRewardClaim>;
  readonly rogueEnemyProfiles: ReadonlyKeyedStore<bigint, RogueEnemyProfile>;
  readonly enemyAttacks?: ReadonlyKeyedStore<bigint, EnemyAttack>;
  readonly hives: ReadonlyKeyedStore<bigint, WorldHive>;
  readonly portals: ReadonlyKeyedStore<number, SpacePortal>;
  readonly homesteads: ReadonlyKeyedStore<number, Homestead>;
  readonly homesteadUpgrades: ReadonlyKeyedStore<string, HomesteadUpgrade>;
  readonly activeFarmUpgrades?: ReadonlyKeyedStore<string, HomesteadUpgrade>;
  readonly homesteadMembers: ReadonlyKeyedStore<string, HomesteadGuest>;
  readonly cellarExcavations: ReadonlyKeyedStore<string, CellarExcavation>;
  readonly surfaces: ReadonlyKeyedStore<bigint, WorldSurface>;
  readonly inventorySlots: ReadonlyKeyedStore<number, InventorySlot>;
  readonly knownRecipes: ReadonlyKeyedStore<string, PlayerKnownRecipe>;
  readonly inventoryCursor: ItemStack | null;
  readonly effects: ReadonlyKeyedStore<bigint, PlayerEffect>;
  readonly openChestSlots: ReadonlyKeyedStore<number, WorldChestSlot>;
  readonly villageOrders?:ReadonlyKeyedStore<string,VillageOrderQuote>;
  readonly hearthStashOpen?:boolean;
  readonly hearthStashSlots?:ReadonlyKeyedStore<number,HearthStashSlot>;
  readonly openPlaceableSlots: ReadonlyKeyedStore<number, WorldPlaceableSlot>;
  readonly chatChannels: ReadonlyKeyedStore<bigint, ChatChannel>;
  readonly chatMessages: ReadonlyKeyedStore<bigint, ChatMessage>;
  readonly sessionChatNotices: ReadonlyKeyedStore<bigint, SessionChatNotice>;
  readonly operationalChatNotices: ReadonlyKeyedStore<bigint, OperationalChatNotice>;
  readonly worldSpeech: ReadonlyKeyedStore<bigint, WorldSpeech>;
  readonly motd: string | null;
  readonly characterProfile: CharacterProfile | null; readonly membership: Membership | null; readonly survival: PlayerSurvival | null;
  readonly stats: PlayerStats | null;
  readonly activeChest: WorldChest | null;
  readonly activePlaceable: WorldPlaceable | null;
  readonly cookingJob: PlayerCookingJob | null;
  readonly fishingCast: FishingCast | null;
  readonly activeDialogue: ActiveDialogue | null; readonly wallet: PlayerWallet | null;
  readonly tradeSession: PlayerTradeSession | null;
  readonly tradeOffers: ReadonlyKeyedStore<string, PlayerTradeOffer>;
  readonly quests: ReadonlyKeyedStore<string, PlayerQuest>;
  readonly questBaselines: ReadonlyKeyedStore<string, PlayerQuestBaseline>;
  readonly playerStatistics: ReadonlyKeyedStore<string, PlayerStatistic>;
  readonly skillTracks: ReadonlyKeyedStore<string, PlayerSkillTrack>;
  readonly combatState?: PlayerCombatState | null;
  readonly equipmentSkillPriority?: readonly string[];
  readonly skillNodes: ReadonlyKeyedStore<string, PlayerSkillNode>;
  readonly activeFarmSkillNodes?: ReadonlyKeyedStore<string, PlayerSkillNode>;
  readonly questWorldItems: ReadonlyKeyedStore<string, QuestWorldItem>;
  readonly thought: PlayerThought | null;
  readonly rogueRun: RogueRun | null;
  readonly rogueRoomExits: ReadonlyKeyedStore<number, RogueRoomExit>;
  readonly rogueRewardOffers: ReadonlyKeyedStore<number, RogueRewardOffer>;
  readonly rogueRunUpgrades: ReadonlyKeyedStore<string, RogueRunUpgrade>;
  readonly liveMapDocument: LiveMapDocument | null;
  readonly worldSeed: WorldSeed | null; readonly clock: WorldClock | null; readonly environment: WorldEnvironment | null; readonly wind: WorldWind | null;
}

export interface OverworldSnapshot {
  readonly connected: boolean; readonly error: string | null; readonly identityHex: string | null;
  readonly content: LiveContentState;
  readonly region: readonly [number, number]; readonly profiles: readonly PlayerPublic[];
  readonly appearances: readonly PlayerAppearance[];
  readonly players: readonly PlayerPosition[];
  readonly playerJumps: readonly PlayerJumpState[];
  readonly fishingCasts: readonly FishingCast[];
  readonly resources: readonly WorldResource[]; readonly soil: readonly WorldSoil[]; readonly crops: readonly WorldCrop[];
  readonly worldItems: readonly WorldItem[]; readonly projectiles: readonly WorldProjectile[]; readonly combatTargets: readonly WorldCombatTarget[]; readonly chests: readonly WorldChest[]; readonly placeables: readonly WorldPlaceable[]; readonly campfires?: readonly WorldCampfireState[]; readonly npcs: readonly WorldNpc[]; readonly merchants: readonly WorldMerchant[];
  readonly wildlifeProfiles: readonly WorldWildlifeProfile[]; readonly hives: readonly WorldHive[];
  readonly outdoorEnemyProfiles?: readonly OutdoorEnemyProfile[];
  readonly outdoorRewardsRevision?: number;
  readonly outdoorRewards?: readonly OutdoorRewardClaim[];
  readonly rogueEnemyProfiles: readonly RogueEnemyProfile[];
  readonly enemyAttacks?: readonly EnemyAttack[];
  readonly portals: readonly SpacePortal[];
  readonly homesteads: readonly Homestead[];
  readonly homesteadUpgrades: readonly HomesteadUpgrade[];
  readonly activeFarmUpgrades?: readonly HomesteadUpgrade[];
  readonly homesteadMembers: readonly HomesteadGuest[];
  readonly cellarExcavations: readonly CellarExcavation[];
  readonly surfaces: readonly WorldSurface[];
  readonly villageOrders?:readonly VillageOrderQuote[];
  readonly hearthStashOpen?:boolean;readonly hearthStashSlots?:readonly HearthStashSlot[];
  readonly inventorySlots: readonly InventorySlot[]; readonly knownRecipes: readonly PlayerKnownRecipe[]; readonly openChestSlots: readonly WorldChestSlot[]; readonly openPlaceableSlots: readonly WorldPlaceableSlot[]; readonly chatChannels: readonly ChatChannel[];
  readonly inventoryCursor: ItemStack | null;
  readonly effects: readonly PlayerEffect[];
  readonly chatMessages: readonly ChatMessage[]; readonly sessionChatNotices: readonly SessionChatNotice[]; readonly operationalChatNotices: readonly OperationalChatNotice[]; readonly worldSpeech: readonly WorldSpeech[];
  readonly motd: string | null; readonly characterProfile: CharacterProfile | null;
  readonly membership: Membership | null; readonly survival: PlayerSurvival | null; readonly stats: PlayerStats | null; readonly activeChest: WorldChest | null; readonly activePlaceable: WorldPlaceable | null; readonly cookingJob: PlayerCookingJob | null; readonly fishingCast: FishingCast | null;
  readonly activeDialogue: ActiveDialogue | null; readonly wallet: PlayerWallet | null;
  readonly tradeSession: PlayerTradeSession | null; readonly tradeOffers: readonly PlayerTradeOffer[];
  readonly quests: readonly PlayerQuest[]; readonly questBaselines: readonly PlayerQuestBaseline[];
  readonly playerStatistics: readonly PlayerStatistic[]; readonly skillTracks: readonly PlayerSkillTrack[];
  readonly combatState?: PlayerCombatState | null;
  readonly equipmentSkillPriority?: readonly string[];
  readonly skillNodes: readonly PlayerSkillNode[];
  readonly activeFarmSkillNodes?: readonly PlayerSkillNode[];
  readonly questWorldItems: readonly QuestWorldItem[]; readonly thought: PlayerThought | null;
  readonly rogueRun: RogueRun | null; readonly rogueRoomExits: readonly RogueRoomExit[];
  readonly rogueRewardOffers: readonly RogueRewardOffer[]; readonly rogueRunUpgrades: readonly RogueRunUpgrade[];
  readonly liveMapDocument: LiveMapDocument | null;
  readonly worldSeed: WorldSeed | null; readonly clock: WorldClock | null; readonly environment: WorldEnvironment | null; readonly wind: WorldWind | null;
}

export interface NetcodeMetrics {
  readonly rttMs: number; readonly replayDepth: number; readonly reconciliationErrorFixed: number;
  readonly inputRefreshAgeSteps: number; readonly handoverCount: number;
  readonly persistentInputError: string | null; readonly lagMs: number; readonly jitterMs: number;
  readonly subscriptionQueryCount: number;
  readonly spaceId: number;
  readonly perSpaceSubscriptionCounts: Readonly<Record<string, number>>;
  readonly cacheSizes: Readonly<Record<string, number>>;
}

export interface TimedProjectileCommit {
  readonly row: WorldProjectile;
  readonly authorityTick: bigint;
}

export interface CombatTextCommit {
  readonly targetKind: 'combat_target' | 'npc';
  readonly targetId: bigint;
  readonly amountCenti: number;
  readonly critical: boolean;
  readonly x: number;
  readonly y: number;
}

export type NetworkDirection = InputDirection;
function identityHex(identity: Identity): string { return identity.toHexString(); }

function isUnifiedChest(
  registry: Pick<ContentRegistry, 'objects' | 'items'>,
  row: Pick<WorldPlaceable, 'kind' | 'definitionId'>,
): boolean {
  return runtimeChestObjectDefinition(registry, row) !== null;
}

export function chestLifecycleTargetKind(
  chestId: bigint,
  placeable: Pick<WorldPlaceable, 'id' | 'kind' | 'definitionId'> | null | undefined,
  registry: Pick<ContentRegistry, 'objects' | 'items'>,
): 'placeable' | 'chest' {
  return placeable?.id === chestId && isUnifiedChest(registry, placeable)
    ? 'placeable'
    : 'chest';
}

function compatibilityChest(row: WorldPlaceable): WorldChest {
  return {
    id: row.id,
    owner: row.placedBy,
    tileX: row.tileX,
    tileY: row.tileY,
    chunkX: row.chunkX,
    chunkY: row.chunkY,
    carriedBy: row.carriedBy,
    spaceId: row.spaceId,
  };
}

function compatibilityChestSlot(row: WorldPlaceableSlot): WorldChestSlot {
  return {
    id: row.id,
    chestId: row.placeableId,
    slot: row.slot,
    itemKind: row.itemKind,
    quantity: row.quantity,
    durability: row.durability,
    lit: row.lit,
  };
}

export class OverworldConnection {
  private connection: DbConnection | null = null;
  private chunkRuntime: ChunkRuntimeController | undefined;
  // Validated by the build gate; `on` still follows the server's chunkAuthority (not yet connected: S2a seam).
  private readonly chunkRuntimeMode = parseChunkRuntimeMode(import.meta.env.VITE_CHUNK_RUNTIME_MODE);
  get chunkRuntimeStatus() { return this.chunkRuntime?.status; }
  private connected = false;
  private error: string | null = null;
  private identity: Identity | null = null;
  private region: readonly [number, number] = [0, 0];
  private viewRadius: ViewRadius = { x: 1, y: 1 };
  private requestedRadius: ViewRadius = { x: 1, y: 1 };
  private subscribedRadius: ViewRadius = { x: 0, y: 0 };
  private subscribedSpaceId = TOPSIDE_SPACE_ID;
  private ownSpaceId = TOPSIDE_SPACE_ID;
  private subscribedCenterTiles: readonly [number, number] | null = null;
  private subscribedSpaceDefinitionKey = '';
  private radiusTimer: number | null = null;
  private pendingRegion: string | null = null;
  private timeSubscription: SubscriptionHandle | null = null;
  private readonly timeRecoverySubscriptions: SubscriptionHandle[] = [];
  private globalSubscription: SubscriptionHandle | null = null;
  private selfSubscription: SubscriptionHandle | null = null;
  private regionSubscription: SubscriptionHandle | null = null;
  private regionAuxiliarySubscription: SubscriptionHandle | null = null;
  private cellarExcavationSubscription: SubscriptionHandle | null = null;
  private subscribedCellarSpaceId: number | null = null;
  private pendingCellarSpaceId: number | null = null;
  private timeSubscriptionPending = false;
  private globalBootstrapComplete = false;
  private timeRecoveryTimer: number | null = null;
  private timeCacheWatchdogTimer: number | null = null;
  private heartbeatTimer: number | null = null;
  private activitySinceHeartbeat = true;
  private sequence = 0n;
  private inputReady = false;
  private desiredDirection: NetworkDirection = 'idle';
  private desiredSprinting = false;
  private idleRefreshPending = false;
  private lastIdleSequence = 0n;
  private inputRefreshAge = 0;
  private retryArmed = true;
  private persistentInputError: string | null = null;
  private resourceRevisionValue = 0;
  private presenceRevisionValue = 0;
  private handoverCount = 0;
  private globalSubscriptionQueryCount = 0;
  private selfSubscriptionQueryCount = 0;
  private activeRegionQueryCount = 0;
  private pendingRegionQueryCount = 0;
  private rttEmaMs = 0;
  private readonly sentAt = new Map<bigint, number>();
  private replayDepth = 0;
  private reconciliationErrorFixed = 0;
  private lastReconciledRowKey = '';
  private readonly positionCommits = new BoundedKeyedQueue<string, PlayerPosition>(REMOTE_SNAPSHOT_CAPACITY);
  private readonly deletedPositionIds = new Set<string>();
  private readonly npcCommits = new BoundedKeyedQueue<bigint, WorldNpc>(REMOTE_SNAPSHOT_CAPACITY);
  private readonly deletedNpcIds = new Set<bigint>();
  private readonly projectileCommits = new BoundedKeyedQueue<bigint, TimedProjectileCommit>(REMOTE_SNAPSHOT_CAPACITY);
  private readonly deletedProjectileIds = new Set<bigint>();
  private readonly lastProjectileAuthorityTicks = new Map<bigint, bigint>();
  private readonly prediction = new LocalPredictionBuffer();
  private latency: LatencyInjector;
  private readonly profiles = new KeyedStore<string, PlayerPublic>();
  private readonly appearances = new KeyedStore<string, PlayerAppearance>();
  private readonly positions = new KeyedStore<string, PlayerPosition>();
  private readonly visiblePlayers = new KeyedStore<string, PlayerPosition>();
  private readonly playerJumps = new KeyedStore<string, PlayerJumpState>();
  private readonly fishingCasts = new KeyedStore<string, FishingCast>();
  private predictionState: PlayerPredictionState | null = null;
  private readonly resources = new KeyedStore<bigint, WorldResource>();
  private readonly soil = new KeyedStore<string, WorldSoil>();
  private readonly crops = new KeyedStore<string, WorldCrop>();
  private readonly worldItems = new KeyedStore<bigint, WorldItem>();
  private readonly projectiles = new KeyedStore<bigint, WorldProjectile>();
  private readonly combatTargets = new KeyedStore<bigint, WorldCombatTarget>();
  private readonly combatTextCommits: CombatTextCommit[] = [];
  private readonly chests = new KeyedStore<bigint, WorldChest>();
  private readonly chestPlaceableSources = new KeyedStore<bigint, WorldPlaceable>();
  private readonly placeables = new KeyedStore<bigint, WorldPlaceable>();
  private readonly campfires = new KeyedStore<bigint, WorldCampfireState>();
  private readonly npcs = new KeyedStore<bigint, WorldNpc>();
  private readonly merchants = new KeyedStore<bigint, WorldMerchant>();
  private readonly wildlifeProfiles = new KeyedStore<bigint, WorldWildlifeProfile>();
  private readonly enemyAttacks = new KeyedStore<bigint, EnemyAttack>();
  private readonly outdoorEnemyProfiles = new KeyedStore<bigint, OutdoorEnemyProfile>();
  private outdoorRewardsRevision = 0;
  private readonly outdoorRewards = new KeyedStore<string, OutdoorRewardClaim>();
  private readonly rogueEnemyProfiles = new KeyedStore<bigint, RogueEnemyProfile>();
  private readonly hives = new KeyedStore<bigint, WorldHive>();
  private readonly portals = new KeyedStore<number, SpacePortal>();
  private readonly homesteads = new KeyedStore<number, Homestead>();
  private readonly activeFarmUpgrades = new KeyedStore<string, HomesteadUpgrade>();
  private readonly homesteadUpgrades = new KeyedStore<string, HomesteadUpgrade>();
  private readonly homesteadMembers = new KeyedStore<string, HomesteadGuest>();
  private readonly cellarExcavations = new KeyedStore<string, CellarExcavation>();
  private readonly surfaces = new KeyedStore<bigint, WorldSurface>();
  private readonly inventorySlots = new KeyedStore<number, InventorySlot>();
  private readonly knownRecipes = new KeyedStore<string, PlayerKnownRecipe>();
  private inventoryCursor: ItemStack | null = null;
  private readonly effects = new KeyedStore<bigint, PlayerEffect>();
  private readonly openChestSlots = new KeyedStore<number, WorldChestSlot>();
  private readonly villageOrders=new KeyedStore<string,VillageOrderQuote>();
  private hearthStashOpen=false;
  private readonly hearthStashSlots=new KeyedStore<number,HearthStashSlot>();
  private readonly openPlaceableSlots = new KeyedStore<number, WorldPlaceableSlot>();
  private readonly chatChannels = new KeyedStore<bigint, ChatChannel>();
  private readonly chatMessages = new KeyedStore<bigint, ChatMessage>();
  private readonly sessionChatNotices = new KeyedStore<bigint, SessionChatNotice>();
  private readonly operationalChatNotices = new KeyedStore<bigint, OperationalChatNotice>();
  private nextOperationalChatNoticeId = 1n;
  private readonly worldSpeech = new KeyedStore<bigint, WorldSpeech>();
  private motd: string | null = null;
  private characterProfile: CharacterProfile | null = null;
  private membership: Membership | null = null;
  private survival: PlayerSurvival | null = null;
  private stats: PlayerStats | null = null;
  private activeChest: WorldChest | null = null;
  private activePlaceable: WorldPlaceable | null = null;
  private cookingJob: PlayerCookingJob | null = null;
  private fishingCast: FishingCast | null = null;
  private activeDialogue: ActiveDialogue | null = null;
  private readonly quests = new KeyedStore<string, PlayerQuest>();
  private readonly questBaselines = new KeyedStore<string, PlayerQuestBaseline>();
  private readonly playerStatistics = new KeyedStore<string, PlayerStatistic>();
  private readonly skillTracks = new KeyedStore<string, PlayerSkillTrack>();
  private combatState: PlayerCombatState | null = null;
  private defenseSequence = 0n;
  private equipmentSkillPriority: readonly string[] = [];
  private readonly activeFarmSkillNodes = new KeyedStore<string, PlayerSkillNode>();
  private readonly skillNodes = new KeyedStore<string, PlayerSkillNode>();
  private readonly questWorldItems = new KeyedStore<string, QuestWorldItem>();
  private thought: PlayerThought | null = null;
  private rogueRun: RogueRun | null = null;
  private readonly rogueRoomExits = new KeyedStore<number, RogueRoomExit>();
  private readonly rogueRewardOffers = new KeyedStore<number, RogueRewardOffer>();
  private readonly rogueRunUpgrades = new KeyedStore<string, RogueRunUpgrade>();
  private wallet: PlayerWallet | null = null;
  private tradeSession: PlayerTradeSession | null = null;
  private readonly tradeOffers = new KeyedStore<string, PlayerTradeOffer>();
  private liveMapDocument: LiveMapDocument | null = null;
  private worldSeed: WorldSeed | null = null;
  private clock: WorldClock | null = null;
  private environment: WorldEnvironment | null = null;
  private wind: WorldWind | null = null;
  private cellarExcavationRevisionValue = 0;
  private readonly content: LiveContentRegistry;
  private contentRefreshQueued = false;
  private readonly recovery: ConnectionRecovery;
  private readonly connectionMonitorTimer: number;
  private accountSubject: string | null = null;
  private connectionGeneration = 0;
  get sessionGeneration(): number { return this.connectionGeneration; }
  private selfHydrated = false;
  private initialRegionHydrated = false;
  private globalsHydrated = false;

  constructor(
    private readonly slot: string,
    private readonly onChanged: () => void,
    private readonly host = import.meta.env['VITE_SPACETIMEDB_URI'] ?? location.origin,
    private readonly database = import.meta.env['VITE_SPACETIMEDB_DATABASE'] ?? DEFAULT_DATABASE,
    latency = latencyFromSearch(location.search),
  ) {
    this.latency = latency;
    this.content = new LiveContentRegistry(`${host}:${database}`);
    if (!oidcConfigured && !localProfilesEnabled) throw new Error('account_login_not_configured');
    this.accountSubject = readOidcSession()?.subject ?? null;
    this.recovery = new ConnectionRecovery({
      connect: (generation) => this.connect(generation),
      disconnect: () => this.releaseConnection(),
      changed: (error) => { if (error !== undefined) this.error = error; this.onChanged(); },
      online: () => navigator.onLine !== false,
      visible: () => !document.hidden,
      socketClosed: () => this.connection?.isSocketClosed === true,
    });
    this.connectionMonitorTimer = window.setInterval(() => this.recovery.check(), 1_000);
    this.recovery.resume();
  }

  get gameplayReady(): boolean { return this.connected && this.inputReady && this.recovery.state === 'ready'; }
  get recoveryState(): ConnectionRecoveryState { return this.recovery.state; }
  pause(): void {
    this.clearHeldInput();
    if (this.gameplayReady) this.sendDesiredDirection();
    this.recovery.pause();
  }
  resume(): void { this.clearHeldInput(); this.recovery.resume(); this.onChanged(); }
  retryConnection(): void { this.clearHeldInput(); this.recovery.retry(); }
  dispose(): void { window.clearInterval(this.connectionMonitorTimer); this.recovery.stop(); }

  private async connect(generation: number): Promise<void> {
    const oidcSession = oidcConfigured ? await ensureOidcSession() : readOidcSession();
    if (!this.recovery.isCurrent(generation)) return;
    if (oidcConfigured && oidcSession === null) {
      this.recovery.fail(generation, 'authentication_required', true);
      return;
    }
    if (oidcSession !== null) {
      if (this.accountSubject !== null && this.accountSubject !== oidcSession.subject) {
        this.recovery.fail(generation, 'authentication_identity_changed', true);
        return;
      }
      this.accountSubject = oidcSession.subject;
    }
    const tokenKey = `orchard:world:${this.host}:${this.database}:${this.slot}:token`;
    const localToken = localProfilesEnabled ? localStorage.getItem(tokenKey) ?? undefined : undefined;
    const savedToken = oidcSession?.idToken ?? localToken;
    this.connectionGeneration = generation;
    this.connection = DbConnection.builder().withUri(this.host).withDatabaseName(this.database).withToken(savedToken)
      .onConnect(async (connection, identity, token) => {
        if (!this.recovery.isCurrent(generation)) { connection.disconnect(); return; }
        if (this.identity !== null && !this.identity.isEqual(identity)) {
          this.recovery.fail(generation, 'authentication_identity_changed', true);
          return;
        }
        if (localProfilesEnabled && oidcSession === null && savedToken === undefined) localStorage.setItem(tokenKey, token);
        try {
          await connection.reducers.acknowledgeInventoryProtocol({ version: CURRENT_INVENTORY_PROTOCOL_VERSION });
        } catch (error) {
          if (!this.recovery.isCurrent(generation)) return;
          const message = error instanceof Error ? error.message : 'inventory_client_update_required';
          this.recovery.fail(generation, message, true);
          connection.disconnect();
          return;
        }
        if (!this.recovery.isCurrent(generation)) { connection.disconnect(); return; }
        this.connected = true; this.error = null; this.identity = identity;
        clientErrorReporter.attach({ reportClientError: async (report) => {
          if (!this.currentConnection(connection)) return;
          await connection.reducers.reportClientError({
            clientMutationId: report.clientMutationId,
            kind: report.kind,
            message: report.message,
            stack: report.stack,
            route: report.route,
            buildId: report.buildId,
            fingerprint: report.fingerprint,
            observedAtMs: report.observedAtMs,
          });
        } });
        this.bindTableEvents(connection); this.subscribeTimeState(connection, identity);
        if (localProfilesEnabled && oidcSession === null) {
          void this.call(() => connection.reducers.setDisplayName({ displayName: this.displayName() })).catch(() => undefined);
        }
        this.heartbeatTimer = window.setInterval(() => {
          if (!this.currentConnection(connection) || document.hidden || !navigator.onLine) return;
          const active = this.activitySinceHeartbeat;
          this.activitySinceHeartbeat = false;
          void this.call(() => connection.reducers.heartbeat({ active })).catch(() => {
            if (active && this.currentConnection(connection)) this.activitySinceHeartbeat = true;
          });
        }, 10_000);
        this.timeCacheWatchdogTimer = window.setInterval(() => {
          if (!this.currentConnection(connection) || document.hidden || !navigator.onLine) return;
          if (!this.hasTimeState(connection)) this.scheduleTimeStateRecovery(connection, identity);
        }, 500);
        this.onChanged();
      })
      .onConnectError((_context, error) => {
        if (!this.recovery.isCurrent(generation)) return;
        clientErrorReporter.capture('connection', error);
        this.recovery.fail(generation, error.message, /^authentication_|^unauthorized$|membership_required/.test(error.message));
      })
      .onDisconnect((_context, error) => {
        if (!this.recovery.isCurrent(generation)) return;
        if (error !== undefined) clientErrorReporter.capture('connection', error);
        this.recovery.fail(generation, error?.message ?? this.error ?? 'disconnected');
      }).build();
  }

  private clearHeldInput(): void {
    this.desiredDirection = 'idle'; this.desiredSprinting = false;
    this.idleRefreshPending = false; this.inputRefreshAge = 0;
  }

  private currentConnection(connection: DbConnection): boolean {
    return this.connection === connection && this.recovery.isCurrent(this.connectionGeneration);
  }

  private maybeGameplayReady(connection: DbConnection): void {
    if (!this.currentConnection(connection) || this.inputReady || !this.selfHydrated
      || !this.globalsHydrated || !this.initialRegionHydrated) return;
    if (!localProfilesEnabled && this.membership === null) {
      this.recovery.fail(this.connectionGeneration, 'membership_required', true);
      return;
    }
    if (this.characterProfile === null || this.survival === null || this.worldSeed === null
      || this.clock === null || this.environment === null || this.ownPosition() === null
      || this.content.state.status !== 'ready') return;
    const position = this.ownPosition();
    if (position !== null) {
      const definition = clientSpaceDefinition(this.content.state.registry, position.spaceId,
        instanceSpaceRowFor(position.spaceId, this.homesteads));
      if (definition?.generator === 'cellar' && (this.pendingCellarSpaceId !== null
        || this.subscribedCellarSpaceId !== position.spaceId)) return;
    }
    this.inputReady = true;
    this.error = null;
    this.recovery.ready(this.connectionGeneration);
    this.sendDesiredDirection();
  }

  private releaseConnection(): void {
    const connection = this.connection;
    this.chunkRuntime?.dispose(); this.chunkRuntime = undefined;
    this.connection = null;
    clientErrorReporter.detach();
    this.clearHeldInput();
    this.latency = new LatencyInjector(this.latency.lagMs, this.latency.jitterMs);
    this.persistentInputError = null; this.retryArmed = false;
    if (this.heartbeatTimer !== null) window.clearInterval(this.heartbeatTimer);
    if (this.timeCacheWatchdogTimer !== null) window.clearInterval(this.timeCacheWatchdogTimer);
    if (this.timeRecoveryTimer !== null) window.clearTimeout(this.timeRecoveryTimer);
    this.heartbeatTimer = null; this.timeCacheWatchdogTimer = null; this.timeRecoveryTimer = null;
    this.inputReady = false; this.connected = false;
    this.prediction.reset(); this.sentAt.clear();
    this.predictionState = null; this.playerJumps.clear(); this.fishingCasts.clear();
    this.sessionChatNotices.clear(); this.operationalChatNotices.clear(); this.inventoryCursor = null; this.knownRecipes.clear();
    this.fishingCast = null;
    this.activeFarmUpgrades.clear(); this.homesteadUpgrades.clear();
    this.homesteadMembers.clear();
    this.rogueRun = null; this.rogueRoomExits.clear(); this.rogueRewardOffers.clear();
    this.rogueRunUpgrades.clear(); this.outdoorRewards.clear(); this.outdoorRewardsRevision++; this.outdoorEnemyProfiles.clear(); this.rogueEnemyProfiles.clear(); this.enemyAttacks.clear();
    this.tradeSession = null; this.tradeOffers.clear();
    this.liveMapDocument = null;
    this.timeSubscription = null; this.timeRecoverySubscriptions.length = 0;
    this.globalSubscription = null; this.selfSubscription = null; this.regionSubscription = null;
    this.regionAuxiliarySubscription = null;
    this.cellarExcavationSubscription = null;
    this.subscribedCellarSpaceId = null; this.pendingCellarSpaceId = null;
    this.timeSubscriptionPending = false; this.globalBootstrapComplete = false;
    this.globalSubscriptionQueryCount = 0; this.selfSubscriptionQueryCount = 0;
    this.activeRegionQueryCount = 0; this.pendingRegionQueryCount = 0;
    this.selfHydrated = false; this.initialRegionHydrated = false; this.globalsHydrated = false;
    this.pendingRegion = null; this.subscribedCenterTiles = null;
    this.subscribedRadius = { x: 0, y: 0 }; this.subscribedSpaceDefinitionKey = '';
    this.contentRefreshQueued = false; this.lastReconciledRowKey = '';
    this.clock = null; this.environment = null; this.worldSeed = null; this.wind = null;
    this.characterProfile = null; this.membership = null; this.survival = null; this.stats = null;
    this.villageOrders.clear();
    this.hearthStashOpen=false;this.hearthStashSlots.clear();
    this.activePlaceable = null; this.activeChest = null; this.cookingJob = null; this.activeDialogue = null;
    this.wallet = null; this.thought = null;
    this.clearSpaceScopedCaches();
    this.campfires.clear(); this.merchants.clear(); this.combatTargets.clear();
    this.combatTextCommits.length = 0; this.motd = null;
    this.profiles.clear(); this.appearances.clear(); this.portals.clear(); this.homesteads.clear();
    this.inventorySlots.clear(); this.effects.clear(); this.openChestSlots.clear(); this.openPlaceableSlots.clear();
    this.chatChannels.clear(); this.chatMessages.clear(); this.quests.clear(); this.questBaselines.clear();
    this.playerStatistics.clear(); this.skillTracks.clear(); this.skillNodes.clear(); this.activeFarmSkillNodes.clear(); this.equipmentSkillPriority=[]; this.combatState=null; this.questWorldItems.clear();
    this.positionCommits.drain(() => undefined); this.npcCommits.drain(() => undefined); this.projectileCommits.drain(() => undefined);
    this.deletedPositionIds.clear(); this.deletedNpcIds.clear(); this.deletedProjectileIds.clear();
    this.lastProjectileAuthorityTicks.clear();
    if (this.radiusTimer !== null) window.clearTimeout(this.radiusTimer);
    this.radiusTimer = null;
    connection?.disconnect();
  }

  view(): OverworldView {
    return { connected: this.connected, error: this.error,
      identityHex: this.identity === null ? null : identityHex(this.identity), region: this.region,
      content: this.content.state,
      profiles: this.profiles, appearances: this.appearances, players: this.visiblePlayers, playerJumps: this.playerJumps, fishingCasts: this.fishingCasts,
      resources: this.resources, soil: this.soil, crops: this.crops, worldItems: this.worldItems, projectiles: this.projectiles, combatTargets: this.combatTargets, chests: this.chests, placeables: this.placeables, campfires: this.campfires, npcs: this.npcs, merchants: this.merchants,
      wildlifeProfiles: this.wildlifeProfiles, outdoorEnemyProfiles:this.outdoorEnemyProfiles,outdoorRewards:this.outdoorRewards,outdoorRewardsRevision:this.outdoorRewardsRevision,rogueEnemyProfiles: this.rogueEnemyProfiles, enemyAttacks:this.enemyAttacks, hives: this.hives, portals: this.portals, homesteads: this.homesteads, homesteadUpgrades: this.homesteadUpgrades, activeFarmUpgrades: this.activeFarmUpgrades, homesteadMembers: this.homesteadMembers, cellarExcavations: this.cellarExcavations, surfaces: this.surfaces, inventorySlots: this.inventorySlots, knownRecipes: this.knownRecipes, inventoryCursor: this.inventoryCursor, effects: this.effects,
      openChestSlots: this.openChestSlots,
      villageOrders:this.villageOrders,
      hearthStashOpen:this.hearthStashOpen,hearthStashSlots:this.hearthStashSlots,
      openPlaceableSlots: this.openPlaceableSlots,
      chatChannels: this.chatChannels, chatMessages: this.chatMessages, sessionChatNotices: this.sessionChatNotices, operationalChatNotices: this.operationalChatNotices, worldSpeech: this.worldSpeech, motd: this.motd,
      characterProfile: this.characterProfile, membership: this.membership, survival: this.survival, stats: this.stats, activeChest: this.activeChest, activePlaceable: this.activePlaceable, cookingJob: this.cookingJob, fishingCast: this.fishingCast,
      activeDialogue: this.activeDialogue, wallet: this.wallet,
      tradeSession: this.tradeSession, tradeOffers: this.tradeOffers,
      quests: this.quests, questBaselines: this.questBaselines, playerStatistics: this.playerStatistics,
      combatState:this.combatState, equipmentSkillPriority:this.equipmentSkillPriority, skillTracks: this.skillTracks, skillNodes: this.skillNodes, activeFarmSkillNodes: this.activeFarmSkillNodes, questWorldItems: this.questWorldItems, thought: this.thought,
      rogueRun: this.rogueRun, rogueRoomExits: this.rogueRoomExits,
      rogueRewardOffers: this.rogueRewardOffers, rogueRunUpgrades: this.rogueRunUpgrades,
      liveMapDocument: this.liveMapDocument,
      worldSeed: this.worldSeed,
      clock: this.clock, environment: this.environment, wind: this.wind };
  }

  /** Materialized compatibility view for tests and browser diagnostics only. */
  snapshot(): OverworldSnapshot {
    const view = this.view();
    return { ...view, profiles: this.profiles.toArray(), appearances: this.appearances.toArray(),
      players: this.visiblePlayers.toArray(), playerJumps: this.playerJumps.toArray(), fishingCasts: this.fishingCasts.toArray(), resources: this.resources.toArray(), soil: this.soil.toArray(), crops: this.crops.toArray(), worldItems: this.worldItems.toArray(), projectiles: this.projectiles.toArray(), combatTargets: this.combatTargets.toArray(), chests: this.chests.toArray(), placeables: this.placeables.toArray(), campfires: this.campfires.toArray(), npcs: this.npcs.toArray(), merchants: this.merchants.toArray(),
      wildlifeProfiles: this.wildlifeProfiles.toArray(), outdoorEnemyProfiles:this.outdoorEnemyProfiles.toArray(),outdoorRewards:this.outdoorRewards.toArray(),outdoorRewardsRevision:this.outdoorRewardsRevision,rogueEnemyProfiles: this.rogueEnemyProfiles.toArray(), enemyAttacks:this.enemyAttacks.toArray(), hives: this.hives.toArray(), portals: this.portals.toArray(), homesteads: this.homesteads.toArray(), homesteadUpgrades: this.homesteadUpgrades.toArray(), activeFarmUpgrades: this.activeFarmUpgrades.toArray(), homesteadMembers: this.homesteadMembers.toArray(), cellarExcavations: this.cellarExcavations.toArray(), surfaces: this.surfaces.toArray(),
      inventorySlots: this.inventorySlots.toArray().sort((left, right) => left.slot - right.slot),
      knownRecipes: this.knownRecipes.toArray().sort((left, right) => left.recipeId.localeCompare(right.recipeId)),
      effects: this.effects.toArray().sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0),
      openChestSlots: this.openChestSlots.toArray().sort((left, right) => left.slot - right.slot),
      villageOrders:this.villageOrders.toArray(),
      hearthStashSlots:this.hearthStashSlots.toArray(),
      openPlaceableSlots: this.openPlaceableSlots.toArray().sort((left, right) => left.slot - right.slot),
      chatChannels: this.chatChannels.toArray(),
      chatMessages: this.chatMessages.toArray().sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0),
      sessionChatNotices: this.sessionChatNotices.toArray().sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0),
      operationalChatNotices: this.operationalChatNotices.toArray().sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0),
      worldSpeech: this.worldSpeech.toArray().sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0),
      quests: this.quests.toArray(), questBaselines: this.questBaselines.toArray(),
      combatState:this.combatState, equipmentSkillPriority:this.equipmentSkillPriority, playerStatistics: this.playerStatistics.toArray(), skillTracks: this.skillTracks.toArray(), skillNodes: this.skillNodes.toArray(), activeFarmSkillNodes: this.activeFarmSkillNodes.toArray(),
      questWorldItems: this.questWorldItems.toArray(), thought: this.thought,
      rogueRoomExits: this.rogueRoomExits.toArray().sort((left, right) => left.slot - right.slot),
      rogueRewardOffers: this.rogueRewardOffers.toArray().sort((left, right) => left.slot - right.slot),
      rogueRunUpgrades: this.rogueRunUpgrades.toArray(),
      tradeOffers: this.tradeOffers.toArray().sort((left, right) => left.slot - right.slot) };
  }

  ownPosition(): PlayerPosition | null { return this.identity === null ? null : this.positions.get(identityHex(this.identity)) ?? null; }
  get resourceRevision(): number { return this.resourceRevisionValue; }
  get presenceRevision(): number { return this.presenceRevisionValue; }
  get cellarExcavationRevision(): number { return this.cellarExcavationRevisionValue; }
  contentWithDraft(overlay: ContentDraftOverlay | null): LiveContentState {
    return this.content.withDraft(overlay);
  }

  noteUserActivity(): void {
    this.activitySinceHeartbeat = true;
  }

  setDirection(direction: NetworkDirection): void {
    this.setMovementIntent(direction, false);
  }
  setMovementIntent(direction: NetworkDirection, sprinting: boolean): void {
    if (!this.gameplayReady) { this.clearHeldInput(); return; }
    const nextSprinting = direction !== 'idle' && sprinting;
    if (direction === this.desiredDirection && nextSprinting === this.desiredSprinting) return;
    this.desiredDirection = direction;
    this.desiredSprinting = nextSprinting;
    if (direction === 'idle') this.idleRefreshPending = true;
    this.retryArmed = true; this.sendDesiredDirection();
  }
  recordPredictedStep(direction: NetworkDirection, state: PlayerState, speedPermille = 1_000): void {
    if (direction !== 'idle') this.activitySinceHeartbeat = true;
    this.prediction.recordStep(direction, state, speedPermille);
    if (direction === 'idle' && !this.idleRefreshPending) {
      this.inputRefreshAge = 0;
      return;
    }
    this.inputRefreshAge += 1;
    if (inputRefreshDue(direction, this.idleRefreshPending, this.inputRefreshAge, INPUT_REFRESH_STEPS)) {
      this.retryArmed = true; this.sendDesiredDirection();
    }
  }
  reconcile(predicted: PlayerState | null, authoritative: PlayerState, collision: CollisionMap): ReconciliationResult | null {
    const x = Math.floor(authoritative.position.x / TILE_SIZE_FIXED), y = Math.floor(authoritative.position.y / TILE_SIZE_FIXED);
    if (x >= 0 && y >= 0 && x < collision.width && y < collision.height) this.chunkRuntime?.compare(x, y, collision.blocked[y * collision.width + x] ?? true);
    const row = this.ownPosition(); if (row === null) return null;
    if(row.actionKind==='sitting'){
      this.prediction.discardPendingMovement();
      this.lastReconciledRowKey='';
      return {player:authoritative,replayDepth:0,errorFixed:0,hardSnap:true};
    }
    const lastProcessedSequence = this.predictionState?.lastProcessedSequence ?? 0n;
    const key = `${row.authorityTick}:${lastProcessedSequence}:${row.x}:${row.y}`;
    if (key === this.lastReconciledRowKey) return null;
    this.lastReconciledRowKey = key;
    if (this.combatState?.kind === 'dodge' || this.combatState?.kind === 'block') {
      this.prediction.discardPendingMovement();
      return { player: authoritative, replayDepth: 0, errorFixed: 0, hardSnap: true };
    }
    const result = this.prediction.reconcile(predicted, authoritative, lastProcessedSequence, collision);
    this.replayDepth = result.replayDepth; this.reconciliationErrorFixed = result.errorFixed;
    return result;
  }
  metrics(): NetcodeMetrics {
    const perSpaceSubscriptionCounts: Record<string, number> = {
      [String(this.subscribedSpaceId)]: this.activeRegionQueryCount,
    };
    if (this.pendingRegion !== null) {
      const key = String(this.ownSpaceId);
      perSpaceSubscriptionCounts[key] = (perSpaceSubscriptionCounts[key] ?? 0) + this.pendingRegionQueryCount;
    }
    return { rttMs: this.rttEmaMs, replayDepth: this.replayDepth,
      reconciliationErrorFixed: this.reconciliationErrorFixed, inputRefreshAgeSteps: this.inputRefreshAge,
      handoverCount: this.handoverCount, persistentInputError: this.persistentInputError,
      lagMs: this.latency.lagMs, jitterMs: this.latency.jitterMs,
      subscriptionQueryCount: this.globalSubscriptionQueryCount
        + this.selfSubscriptionQueryCount
        + this.activeRegionQueryCount
        + this.pendingRegionQueryCount,
      spaceId: this.ownSpaceId,
      perSpaceSubscriptionCounts,
      cacheSizes: {
        contentDefinition: this.content.state.registry.definitions.size,
        playerPublic: this.profiles.size,
        playerAppearance: this.appearances.size,
        playerPosition: this.positions.size,
        worldResource: this.resources.size,
        worldSoil: this.soil.size,
        worldCrop: this.crops.size,
        worldItem: this.worldItems.size,
        worldProjectile: this.projectiles.size,
        worldCombatTarget: this.combatTargets.size,
        worldChest: this.chests.size,
        worldPlaceable: this.placeables.size,
        worldNpc: this.npcs.size,
        worldHive: this.hives.size,
        wildlifeProfile: this.wildlifeProfiles.size,
        rogueEnemyProfile: this.rogueEnemyProfiles.size,
        enemyAttack: this.enemyAttacks.size,
        merchant: this.merchants.size,
        inventory: this.inventorySlots.size,
        effects: this.effects.size,
        chat: this.chatMessages.size,
        chatNotices: this.sessionChatNotices.size,
        speech: this.worldSpeech.size,
      } };
  }
  chestTargetKind(chestId: bigint): 'placeable' | 'chest' {
    return chestLifecycleTargetKind(
      chestId, this.chestPlaceableSources.get(chestId), this.content.state.registry,
    );
  }
  drainPositionCommits(visit: (row: PlayerPosition) => void): void {
    this.positionCommits.drain(visit);
  }
  drainDeletedPositionIds(visit: (identity: string) => void): void {
    for (const identity of this.deletedPositionIds) visit(identity);
    this.deletedPositionIds.clear();
  }
  drainNpcCommits(visit: (row: WorldNpc) => void): void { this.npcCommits.drain(visit); }
  drainDeletedNpcIds(visit: (id: bigint) => void): void {
    for (const id of this.deletedNpcIds) visit(id);
    this.deletedNpcIds.clear();
  }
  drainProjectileCommits(visit: (commit: TimedProjectileCommit) => void): void {
    this.projectileCommits.drain(visit);
  }
  drainCombatTextCommits(visit: (commit: CombatTextCommit) => void): void {
    for (const commit of this.combatTextCommits) visit(commit);
    this.combatTextCommits.length = 0;
  }
  drainDeletedProjectileIds(visit: (id: bigint) => void): void {
    for (const id of this.deletedProjectileIds) visit(id);
    this.deletedProjectileIds.clear();
  }

  setViewRadius(radius: ViewRadius): void {
    const next = { x: clampViewRadius(radius.x), y: clampViewRadius(radius.y) };
    if (next.x === this.requestedRadius.x && next.y === this.requestedRadius.y) return;
    this.requestedRadius = next;
    if (this.radiusTimer !== null) window.clearTimeout(this.radiusTimer);
    this.radiusTimer = window.setTimeout(() => {
      this.radiusTimer = null; this.viewRadius = this.requestedRadius;
      const position = this.ownPosition();
      if (position !== null && this.connection !== null) this.subscribeRegion(this.connection, position, true);
    }, RADIUS_SETTLE_MS);
  }

  combatDefense(action: 'dodge' | 'block' | 'release', aimX = 0, aimY = 1): Promise<void> {
    const sequence = ++this.defenseSequence;
    return this.reducer(connection => connection.reducers.combatDefense({action, aimX, aimY, sequence}));
  }
  travelHearthFerry(fromDock:string,toDock:string):Promise<void> {return this.reducer(connection=>connection.reducers.travelHearthFerry({fromDock,toDock}));}
  fulfillVillageOrder(orderId:string,expectedRevision:bigint,expectedContentHash:string,expectedTotalBronze:bigint):Promise<void>{
    return this.reducer(connection=>connection.reducers.fulfillVillageOrder({orderId,expectedRevision,expectedContentHash,expectedTotalBronze}));
  }
  unlockHearthLegendaryRecipe(recipeId:string,expectedContentHash:string,expectedSeals:number):Promise<void>{
    return this.reducer(connection=>connection.reducers.unlockHearthLegendaryRecipe({recipeId,expectedContentHash,expectedSeals}));
  }
  claimOutdoorReward(claimId:string):Promise<void> { return this.reducer(connection=>connection.reducers.claimOutdoorReward({claimId})); }
  selectHotbar(slot: number): Promise<void> { return this.reducer((c) => c.reducers.selectHotbar({ slot })); }
  moveInventoryItem(request: MoveItemRequest): Promise<void> {
    const involvesChest = request.fromContainer === 'chest' || request.toContainer === 'chest';
    const involvesPlaceable = request.fromContainer === 'placeable' || request.toContainer === 'placeable';
    return this.reducer((connection) => involvesPlaceable
      ? connection.reducers.movePlaceableItem(request)
      : involvesChest
      ? connection.reducers.moveChestItem(request)
      : connection.reducers.moveInventoryItem(request));
  }
  fillCraftingRecipe(recipeId: string): Promise<void> {
    return this.reducer((connection) => connection.reducers.fillCraftingRecipe({ recipeId }));
  }
  quickMoveInventoryItem(fromContainer: string, fromIndex: number, toContainers: readonly string[]): Promise<void> {
    return this.reducer((connection) => connection.reducers.quickMoveMenuItem({
      fromContainer, fromIndex, toContainers: [...toContainers],
    }));
  }
  quickMoveAllInventoryItems(itemKind: string, fromContainers: readonly string[], toContainers: readonly string[]): Promise<void> {
    const request = { itemKind, fromContainers: [...fromContainers], toContainers: [...toContainers] };
    return this.reducer((connection) => connection.reducers.quickMoveAllMenuItems(request));
  }
  distributeInventoryItem(fromContainer: string, fromIndex: number, targets: readonly { container: string; index: number }[], quantity: number): Promise<void> {
    const request = { fromContainer, fromIndex, targetContainers: targets.map((target) => target.container),
      targetIndexes: Uint8Array.from(targets.map((target) => target.index)), quantity };
    const involvesChest = fromContainer === 'chest' || targets.some((target) => target.container === 'chest');
    return this.reducer((connection) => involvesChest
      ? connection.reducers.distributeChestItem(request)
      : connection.reducers.distributeInventoryItem(request));
  }
  inventoryCursorClick(container: string, index: number, button: 'left' | 'right'): Promise<void> {
    return this.reducer((connection) => connection.reducers.inventoryCursorClick({ container, index, button }));
  }
  sortMenuContainer(container: 'backpack' | 'chest' | 'placeable'): Promise<void> {
    return this.reducer((connection) => connection.reducers.sortMenuContainer({ container }));
  }
  inventoryCursorQuickCraft(targets: readonly { container: string; index: number }[], mode: 'even' | 'one_each'): Promise<void> {
    return this.reducer((connection) => connection.reducers.inventoryCursorQuickCraft({
      targetContainers: targets.map((target) => target.container),
      targetIndexes: Uint8Array.from(targets.map((target) => target.index)), mode,
    }));
  }
  inventoryCursorPickupAll(containerOrder: readonly string[]): Promise<void> {
    return this.reducer((connection) => connection.reducers.inventoryCursorPickupAll({ containerOrder: [...containerOrder] }));
  }
  inventoryCursorSwapHotbar(container: string, index: number, hotbarIndex: number): Promise<void> {
    return this.reducer((connection) => connection.reducers.inventoryCursorSwapHotbar({ container, index, hotbarIndex }));
  }
  dropInventoryCursor(button: 'left' | 'right'): Promise<void> {
    return this.reducer((connection) => connection.reducers.dropInventoryCursor({ button }));
  }
  throwMenuItem(container: string, index: number, wholeStack: boolean): Promise<void> {
    return this.reducer((connection) => connection.reducers.throwMenuItem({ container, index, wholeStack }));
  }
  returnInventoryCursor(): Promise<void> { return this.reducer((connection) => connection.reducers.returnInventoryCursor({})); }
  craftInventoryRecipe(recipeId: string, craftAll = false): Promise<void> {
    return this.reducer((connection) => connection.reducers.craftInventoryRecipe({ recipeId, craftAll }));
  }
  closeCrafting(): Promise<void> { return this.reducer((c) => c.reducers.closeCrafting({})); }
  interactEntity(
    targetKind: 'placeable' | 'chest' | 'combat_target' | 'world_item' | 'landmark' | 'npc',
    entityId: bigint,
    verb: 'use' | 'pickup' | 'break',
  ): Promise<void> {
    return this.reducer((connection) => connection.reducers.interactEntity({ targetKind, entityId, verb }));
  }
  useSelected(
    verb: 'secondary' | 'equipment_use' | 'use_with' | 'use_at' | 'aimed_use' | 'place' | 'frame_action',
    options: { readonly targetKind?: string; readonly entityId?: bigint; readonly tileX?: number; readonly tileY?: number; readonly actionId?: string; readonly quantity?: number; readonly phase?: 'begin' | 'cancel' | 'fire'; readonly aimX?: number; readonly aimY?: number; readonly chargeMs?: number; readonly equipmentSlot?: number } = {},
  ): Promise<void> {
    return this.reducer((connection) => connection.reducers.useSelected({
      verb,
      targetKind: options.targetKind ?? '',
      entityId: options.entityId ?? 0n,
      tileX: options.tileX ?? 0,
      tileY: options.tileY ?? 0,
      actionId: options.actionId ?? '',
      quantity: options.quantity ?? 0,
      phase: options.phase ?? '',
      aimX: options.aimX ?? 0,
      aimY: options.aimY ?? 0,
      chargeMs: options.chargeMs ?? 0,
      equipmentSlot: options.equipmentSlot ?? 0,
    }));
  }
  frameAction(actionId: string): Promise<void> {
    return this.useSelected('frame_action', { actionId });
  }
  openHearthStash():Promise<void>{return this.reducer(connection=>connection.reducers.openHearthStash({}));}
  openHearthSupplyCache():Promise<void>{return this.reducer(connection=>connection.reducers.openHearthSupplyCache({}));}
  closeHearthStash():Promise<void>{return this.reducer(connection=>connection.reducers.closeHearthStash({}));}
  closePlaceable(): Promise<void> { return this.reducer((connection) => connection.reducers.closePlaceable({})); }
  closeChest(): Promise<void> { return this.reducer((c) => c.reducers.closeChest({})); }
  startRogueRun(): Promise<void> {
    return this.reducer((connection) => connection.reducers.startRogueRun({}));
  }
  chooseRogueReward(slot: number): Promise<void> {
    return this.reducer((connection) => connection.reducers.chooseRogueReward({ slot }));
  }
  skipRogueReward(): Promise<void> {
    return this.reducer((connection) => connection.reducers.skipRogueReward({}));
  }
  chooseRogueDoor(slot: number): Promise<void> {
    return this.reducer((connection) => connection.reducers.chooseRogueDoor({ slot }));
  }
  abandonRogueRun(): Promise<void> {
    return this.reducer((connection) => connection.reducers.abandonRogueRun({}));
  }
  activateOutdoorEncounter(encounterId:string):Promise<void>{return this.reducer(connection=>connection.reducers.activateOutdoorEncounter({encounterId}));}
  interactNpc(npcId: bigint): Promise<void> { return this.reducer((connection) => connection.reducers.interactNpc({ npcId })); }
  requestTrade(target: Identity): Promise<void> {
    return this.reducer((connection) => connection.reducers.requestTrade({ target }));
  }
  acceptTradeRequest(tradeId: string): Promise<void> {
    return this.reducer((connection) => connection.reducers.acceptTradeRequest({ tradeId }));
  }
  declineTrade(tradeId: string): Promise<void> {
    return this.reducer((connection) => connection.reducers.declineTrade({ tradeId }));
  }
  cancelTrade(tradeId: string): Promise<void> {
    return this.reducer((connection) => connection.reducers.cancelTrade({ tradeId }));
  }
  setTradeOfferItem(tradeId: string, inventorySlot: number, tradeSlot: number, quantity: number): Promise<void> {
    return this.reducer((connection) => connection.reducers.setTradeOfferItem({ tradeId, inventorySlot, tradeSlot, quantity }));
  }
  removeTradeOfferItem(tradeId: string, tradeSlot: number): Promise<void> {
    return this.reducer((connection) => connection.reducers.removeTradeOfferItem({ tradeId, tradeSlot }));
  }
  setTradeOfferBronze(tradeId: string, amount: bigint): Promise<void> {
    return this.reducer((connection) => connection.reducers.setTradeOfferBronze({ tradeId, amount }));
  }
  setTradeAccepted(tradeId: string, accepted: boolean, revision: bigint): Promise<void> {
    return this.reducer((connection) => connection.reducers.setTradeAccepted({ tradeId, accepted, revision }));
  }
  chooseDialogueOption(choiceId: string): Promise<void> {
    return this.reducer((connection) => connection.reducers.chooseDialogueOption({ choiceId }));
  }
  toggleHomesteadGate(): Promise<void> {
    return this.reducer((connection) => connection.reducers.toggleHomesteadGate({}));
  }
  pickupQuestWorldItem(itemId: string): Promise<void> {
    return this.reducer((connection) => connection.reducers.pickupQuestWorldItem({ itemId }));
  }
  setQuestPinned(questId: string, pinned: boolean): Promise<void> {
    return this.reducer((connection) => connection.reducers.setQuestPinned({ questId, pinned }));
  }
  abandonQuest(questId: string): Promise<void> {
    return this.reducer((connection) => connection.reducers.abandonQuest({ questId }));
  }
  closeNpcDialogue(): Promise<void> { return this.reducer((connection) => connection.reducers.closeNpcDialogue({})); }
  buyMerchantItem(itemKind: string, quantity: number): Promise<void> {
    return this.reducer((connection) => connection.reducers.buyMerchantItem({ itemKind, quantity }));
  }
  buyMerchantCart(lines: readonly MerchantCartLine[]): Promise<void> {
    return this.reducer((connection) => connection.reducers.buyMerchantCart({
      itemKinds: lines.map((line) => line.itemKind),
      quantities: lines.map((line) => line.quantity),
    }));
  }
  sellMerchantItem(itemKind: string, quantity: number): Promise<void> {
    return this.reducer((connection) => connection.reducers.sellMerchantItem({ itemKind, quantity }));
  }
  sellMerchantCart(lines: readonly MerchantCartLine[]): Promise<void> {
    return this.reducer((connection) => connection.reducers.sellMerchantCart({
      itemKinds: lines.map((line) => line.itemKind),
      quantities: lines.map((line) => line.quantity),
    }));
  }
  harvestCropTile(tileX: number, tileY: number): Promise<void> {
    return this.reducer((connection) => connection.reducers.harvestCropTile({ tileX, tileY }));
  }
  placeHomesteadBuildable(itemKind: string, tileX: number, tileY: number): Promise<void> {
    return this.reducer((connection) => connection.reducers.placeHomesteadBuildable({ itemKind, tileX, tileY }));
  }
  removeHomesteadBuildable(placeableId: bigint): Promise<void> {
    return this.reducer((connection) => connection.reducers.removeHomesteadBuildable({ placeableId }));
  }
  placeHearthFurniture(itemKind: string, tileX: number, tileY: number, supportId?: bigint): Promise<void> {
    return this.reducer(connection => connection.reducers.placeHearthFurniture({ itemKind, tileX, tileY, supportId }));
  }
  moveHearthFurniture(placeableId: bigint, tileX: number, tileY: number, expectedRevision: bigint, supportId?: bigint): Promise<void> {
    return this.reducer(connection => connection.reducers.moveHearthFurniture({ placeableId, tileX, tileY, supportId, expectedRevision }));
  }
  sitHearthFurniture(placeableId: bigint): Promise<void> {
    return this.reducer(connection => connection.reducers.sitHearthFurniture({placeableId}));
  }
  standHearthFurniture(): Promise<void> {
    return this.reducer(connection => connection.reducers.standHearthFurniture({}));
  }
  pickupHearthFurniture(placeableId: bigint): Promise<void> {
    return this.reducer(connection => connection.reducers.pickupHearthFurniture({ placeableId }));
  }
  editResidenceArchitecture(expectedRevision: bigint, edits: readonly import('@orchard/sim').HearthArchitectureEdit[]): Promise<void> {
    return this.reducer((connection) => connection.reducers.editResidenceArchitecture({expectedRevision, editsJson: JSON.stringify(edits)}));
  }

  purchaseResidenceExpansion(expectedRank: number): Promise<void> {
    return this.reducer((connection) => connection.reducers.purchaseResidenceExpansion({expectedRank}));
  }

  purchaseHomesteadUpgrade(upgradeKind: string): Promise<void> {
    return this.reducer((connection) => connection.reducers.purchaseHomesteadUpgrade({ upgradeKind }));
  }
  setHomesteadMemberRole(identity: Identity, role: string): Promise<void> {
    return this.reducer((connection) => connection.reducers.setHomesteadMemberRole({ identity, role }));
  }
  removeHomesteadMember(identity: Identity, kick: boolean): Promise<void> {
    return this.reducer((connection) => connection.reducers.removeHomesteadMember({ identity, kick }));
  }
  dropSelected(): Promise<void> { return this.reducer((c) => c.reducers.dropSelected({})); }
  pickupWorldItem(itemId: bigint): Promise<void> { return this.reducer((c) => c.reducers.pickupWorldItem({ itemId })); }
  pickupEmbeddedArrow(projectileId: bigint): Promise<void> {
    return this.reducer((connection) => connection.reducers.pickupEmbeddedArrow({ projectileId }));
  }
  gatherWorldResource(resourceId: bigint): Promise<void> {
    return this.reducer((connection) => connection.reducers.gatherWorldResource({ resourceId }));
  }
  interactHorse(horseId: bigint): Promise<void> { return this.interactEntity('npc', horseId, 'use'); }
  jumpHorse(): Promise<void> { return this.reducer((c) => c.reducers.jumpHorse({})); }
  sendChatMessage(channelId: bigint, body: string): Promise<void> {
    return this.reducer((connection) => connection.reducers.sendChatMessage({ channelId, body }));
  }
  sendWhisper(recipient: Identity, body: string): Promise<void> {
    return this.reducer((connection) => connection.reducers.sendWhisper({ recipient, body }));
  }
  sendWorldSpeech(kind: 'say' | 'shout', body: string): Promise<void> {
    return this.reducer((connection) => connection.reducers.sendWorldSpeech({ kind, body }));
  }
  createChatChannel(displayName: string, kind: 'custom' | 'group'): Promise<void> {
    return this.reducer((connection) => connection.reducers.createChatChannel({ displayName, kind }));
  }
  joinChatChannel(channelId: bigint): Promise<void> {
    return this.reducer((connection) => connection.reducers.joinChatChannel({ channelId }));
  }
  leaveChatChannel(channelId: bigint): Promise<void> {
    return this.reducer((connection) => connection.reducers.leaveChatChannel({ channelId }));
  }
  inviteChatMember(channelId: bigint, identity: Identity): Promise<void> {
    return this.reducer((connection) => connection.reducers.inviteChatMember({ channelId, identity }));
  }
  setCharacterName(displayName: string): Promise<void> {
    return this.reducer((connection) => connection.reducers.setDisplayName({ displayName }));
  }
  setAppearance(appearance: { readonly hairKind: string; readonly shirtKind: string; readonly pantsKind: string; readonly shoesKind: string }): Promise<void> {
    return this.reducer((connection) => connection.reducers.setAppearance(appearance));
  }
  prioritizeEquipmentSkill(nodeId:string):Promise<void> {
    return this.reducer(connection=>connection.reducers.prioritizeEquipmentSkill({nodeId}));
  }
  purchaseSkillNode(nodeId: string): Promise<void> {
    return this.reducer((connection) => connection.reducers.purchaseSkillNode({ nodeId }));
  }
  resetSkillTree(track: string): Promise<void> {
    return this.reducer((connection) => connection.reducers.resetSkillTree({ track }));
  }
  setWorldTime(calendarTick: bigint): Promise<void> {
    return this.reducer((connection) => connection.reducers.setWorldTime({ calendarTick }));
  }
  setWorldWeather(weatherMode: WeatherMode): Promise<void> {
    return this.reducer((connection) => connection.reducers.setWorldWeather({ weatherMode }));
  }
  setWorldWindDirection(direction: WindDirectionMode): Promise<void> {
    return this.reducer((connection) => connection.reducers.setWorldWindDirection({ direction }));
  }
  setMessageOfDay(body: string): Promise<void> {
    return this.reducer((connection) => connection.reducers.setMessageOfDay({ body }));
  }
  usePortal(portalId: number): Promise<void> {
    return this.reducer((connection) => connection.reducers.usePortal({ portalId }));
  }
  private reducer(call: (connection: DbConnection) => Promise<unknown>): Promise<void> {
    const connection = this.connection;
    if (!this.gameplayReady || connection === null) return Promise.reject(new Error('not_connected'));
    return this.call(() => {
      if (!this.currentConnection(connection) || !this.gameplayReady) throw new Error('not_connected');
      return call(connection);
    }).then(() => {
      if (!this.currentConnection(connection)) throw new Error('connection_changed');
    });
  }
  private appendOperationalChatNotices(kind: 'last' | 'baltop', bodies: readonly string[]): void {
    const issuedAtMicros = BigInt(Date.now()) * 1_000n;
    for (const [index, body] of bodies.entries()) {
      const id = this.nextOperationalChatNoticeId++;
      this.operationalChatNotices.set(id, { id, kind, body, issuedAtMicros: issuedAtMicros + BigInt(index) });
    }
    while (this.operationalChatNotices.size > 50) {
      const oldest = this.operationalChatNotices.toArray()[0]?.id;
      if (oldest === undefined) break;
      this.operationalChatNotices.delete(oldest);
    }
    this.onChanged();
  }
  private call<T>(call: () => Promise<T>): Promise<T> {
    const connection = this.connection;
    return this.latency.outgoing(() => {
      if (connection === null || !this.currentConnection(connection)) throw new Error('connection_changed');
      return call();
    }).then((result) => {
      if (connection === null || !this.currentConnection(connection)) throw new Error('connection_changed');
      return result;
    });
  }
  private sendDesiredDirection(): void {
    const connection = this.connection;
    if (!this.connected || !this.inputReady || connection === null) return;
    this.sequence += 1n; this.inputRefreshAge = 0;
    const command = this.prediction.recordSend(
      this.sequence, this.desiredDirection, this.desiredSprinting,
    );
    if (command.direction === 'idle') this.lastIdleSequence = command.sequence;
    this.sentAt.set(command.sequence, performance.now());
    if (this.sentAt.size > RTT_SAMPLE_CAPACITY) {
      const oldest = this.sentAt.keys().next().value as bigint | undefined;
      if (oldest !== undefined) this.sentAt.delete(oldest);
    }
    void this.call(() => {
      if (!this.currentConnection(connection)) throw new Error('not_connected');
      return connection.reducers.setInput({
      direction: command.direction,
      sequence: command.sequence,
      clientTick: command.clientTick,
      sprinting: command.sprinting,
      });
    })
      .then(() => { if (this.currentConnection(connection)) this.persistentInputError = null; })
      .catch((error: unknown) => {
        if (!this.currentConnection(connection)) return;
        this.persistentInputError = error instanceof Error ? error.message : String(error); this.onChanged();
        if (this.retryArmed) {
          this.retryArmed = false;
          this.sendDesiredDirection();
        }
      });
  }
  private displayName(): string {
    const cleaned = this.slot.replace(/[^A-Za-z0-9 '-]/g, '').trim();
    return cleaned.length >= 3 ? cleaned.slice(0, 20) : 'Farmer One';
  }

  private hasTimeState(connection: DbConnection): boolean {
    return connection.db.worldClock.id.find(0) !== null
      && connection.db.worldEnvironment.id.find(0) !== null;
  }

  private scheduleTimeStateRecovery(connection: DbConnection, identity: Identity): void {
    if (!this.currentConnection(connection) || !this.connected || this.timeSubscriptionPending || this.timeRecoveryTimer !== null) return;
    this.timeRecoveryTimer = window.setTimeout(() => {
      if (!this.currentConnection(connection)) return;
      this.timeRecoveryTimer = null;
      if (!this.hasTimeState(connection)) this.subscribeTimeState(connection, identity, true);
    }, 50);
  }

  private subscribeTimeState(connection: DbConnection, identity: Identity, recovery = false): void {
    if (!this.currentConnection(connection) || this.timeSubscriptionPending) return;
    this.timeSubscriptionPending = true;
    const handle = connection.subscriptionBuilder().onApplied(() => {
      if (!this.currentConnection(connection)) return;
      this.timeSubscriptionPending = false;
      this.clock = connection.db.worldClock.id.find(0);
      this.environment = connection.db.worldEnvironment.id.find(0);
      if (!this.hasTimeState(connection)) {
        this.scheduleTimeStateRecovery(connection, identity);
        return;
      }
      if (!this.globalBootstrapComplete) {
        this.globalBootstrapComplete = true;
        this.subscribeGlobals(connection, identity);
      }
      this.onChanged();
    }).onError(() => { if (!this.currentConnection(connection)) return;
      this.timeSubscriptionPending = false;
      this.scheduleTimeStateRecovery(connection, identity);
    }).subscribe([tables.worldClock, tables.worldEnvironment]);
    if (recovery) this.timeRecoverySubscriptions.push(handle);
    else this.timeSubscription = handle;
  }

  private subscribeGlobals(connection: DbConnection, identity: Identity): void {
    const onlineProfiles = tables.playerPublic.where((row) => row.online.eq(true));
    const onlineAppearances = onlineProfiles.rightSemijoin(
      tables.playerAppearance,
      (profile, appearance) => profile.identity.eq(appearance.identity),
    );
    const queries = [
      onlineProfiles,
      onlineAppearances,
      tables.activeFishingCasts,
      tables.worldWind,
      tables.worldSeed,
      tables.worldMerchant,
      tables.liveMapDocument.where((row) => row.mapId.eq(LIVE_ISLAND_MAP_ID)),
      tables.contentHead.where((row) => row.packId.eq('live')),
      tables.runtimeContentDefinitions,
    ];
    this.globalSubscriptionQueryCount = queries.length + 2;
    this.globalSubscription = connection.subscriptionBuilder().onApplied(() => {
      if (!this.currentConnection(connection)) return;
      this.hydrateGlobals(connection);
      this.subscribeSelf(connection, identity);
    }).onError(() => { if (!this.currentConnection(connection)) return;
      this.recovery.fail(this.connectionGeneration, 'global_subscription_failed');
    }).subscribe(queries);
  }
  private subscribeSelf(connection: DbConnection, identity: Identity): void {
    const queries = [
      tables.playerPosition.where((row) => row.identity.eq(identity)),
      tables.ownPlayerPrediction,
      tables.ownSurvival,
      tables.ownCookingJob,
      tables.ownFishingCast,
      tables.ownStats,
      tables.ownWallet,
      tables.ownTradeSession,
      tables.ownTradeOffers,
      tables.ownEffects,
      tables.ownRogueRun,
      tables.ownRogueRoomExits,
      tables.ownRogueRewardOffers,
      tables.ownRogueRunUpgrades,
      tables.ownInventorySlots,
      tables.ownKnownRecipes,
      tables.ownInventoryCursor,
      tables.ownActiveHearthStash,tables.ownHearthStashSlots,tables.ownVillageOrders,
      tables.ownActivePlaceable,
      tables.ownOpenPlaceableSlots,
      tables.ownActiveDialogue,
      tables.ownPlayerQuests,
      tables.ownPlayerQuestBaselines,
      tables.ownPlayerStatistics,
      tables.ownEquipmentPreferences,
      tables.ownCombatState,
      tables.ownOutdoorRewards,
      tables.ownPlayerSkillTracks,
      tables.ownPlayerSkillNodes,
      tables.activeFarmSkillNodes,
      tables.ownQuestWorldItems,
      tables.ownPlayerThought,
      tables.ownCharacterProfile,
      tables.ownMembership,
      tables.ownCurrentHomestead,
      tables.ownHomesteadUpgrades,
      tables.activeFarmUpgrades,
      tables.ownHomesteadMembers,
      tables.ownConnectionNotices,
      tables.ownSessionChatNotices,
      tables.ownChatChannels,
      tables.visibleChatMessages,
      tables.visibleWorldSpeech,
    ];
    this.selfSubscriptionQueryCount = queries.length;
    this.selfSubscription = connection.subscriptionBuilder().onApplied(() => this.incoming(connection, () => {
      if (!this.currentConnection(connection)) return;
      this.hydrateSelf(connection);
      const row = connection.db.playerPosition.identity.find(identity);
      if (row === null) { this.error = 'self_position_missing'; this.onChanged(); return; }
      const lastProcessedSequence = this.predictionState?.lastProcessedSequence ?? 0n;
      this.sequence = lastProcessedSequence > this.sequence ? lastProcessedSequence : this.sequence;
      this.prediction.reset(lastProcessedSequence); this.selfHydrated = true;
      this.subscribeRegion(connection, row); this.maybeGameplayReady(connection); this.onChanged();
    })).onError(() => { if (!this.currentConnection(connection)) return; this.recovery.fail(this.connectionGeneration, 'self_subscription_failed'); })
      .subscribe(queries);
  }
  private subscribeRegion(connection: DbConnection, position: PlayerPosition, force = false): void {
    if (!this.currentConnection(connection)) return;
    const chunkX = position.chunkX; const chunkY = position.chunkY;
    const spaceId = position.spaceId;
    const centerTiles = [
      Math.floor(position.x / TILE_SIZE_FIXED),
      Math.floor(position.y / TILE_SIZE_FIXED),
    ] as const;
    const radius = this.viewRadius;
    if (this.chunkRuntimeMode === 'shadow' || this.chunkRuntimeMode === 'on') {
      this.chunkRuntime ??= new ChunkRuntimeController({ buildMode: this.chunkRuntimeMode });
      this.chunkRuntime.update(connection, BigInt(spaceId), [centerTiles[0] - radius.x * SURVIVAL_CHUNK_TILES, centerTiles[1] - radius.y * SURVIVAL_CHUNK_TILES,
        centerTiles[0] + radius.x * SURVIVAL_CHUNK_TILES, centerTiles[1] + radius.y * SURVIVAL_CHUNK_TILES], {
          mapRevision: this.liveMapDocument?.revision ?? 0, mapHash: this.liveMapDocument?.contentHash ?? '', contentHash: this.content.state.registry.contentHash,
        });
    }
    const definition = clientSpaceDefinition(
      this.content.state.registry,
      spaceId,
      this.rogueRun?.spaceId === spaceId
        ? this.rogueRun
        : instanceSpaceRowFor(spaceId, this.homesteads),
    );
    const discoveryRadii = resourceDiscoveryRadii(runtimeResourcePerception(
      this.content.state.registry,
      Object.fromEntries([...this.skillNodes].map((row) => [row.nodeId, row.rank])),
    ));
    const definitionKey = `${spaceStreamingKey(definition)}:discovery:${discoveryRadii.ore}:${discoveryRadii.fishing}`;
    const regionKey = `${spaceId}:${chunkX},${chunkY},${radius.x},${radius.y}:${definitionKey}`;
    const activeRegionKey = `${this.subscribedSpaceId}:${this.region[0]},${this.region[1]},${this.subscribedRadius.x},${this.subscribedRadius.y}:${this.subscribedSpaceDefinitionKey}`;
    this.subscribeCellarExcavations(connection, spaceId, definition?.generator === 'cellar');
    if (this.pendingRegion !== null || (activeRegionKey === regionKey && this.regionSubscription !== null)) return;
    if (!force && this.regionSubscription !== null
      && !outsideRegionCenterDeadband(this.subscribedCenterTiles, centerTiles[0], centerTiles[1])) return;
    this.pendingRegion = regionKey;
    const bounds = subscriptionChunkBounds(chunkX, chunkY, radius, definition?.sizeTiles ?? SURVIVAL_WORLD_SIZE);
    const positions = tables.playerPosition
      .where((row) => row.spaceId.eq(spaceId))
      .where((row) => row.chunkX.gte(bounds.minX)).where((row) => row.chunkX.lte(bounds.maxX))
      .where((row) => row.chunkY.gte(bounds.minY)).where((row) => row.chunkY.lte(bounds.maxY));
    const playerJumps = tables.playerJumpState
      .where((row) => row.spaceId.eq(spaceId))
      .where((row) => row.chunkX.gte(bounds.minX)).where((row) => row.chunkX.lte(bounds.maxX))
      .where((row) => row.chunkY.gte(bounds.minY)).where((row) => row.chunkY.lte(bounds.maxY));
    const resources = tables.worldResource
      .where((row) => row.spaceId.eq(spaceId))
      .where((row) => row.chunkX.gte(bounds.minX)).where((row) => row.chunkX.lte(bounds.maxX))
      .where((row) => row.chunkY.gte(bounds.minY)).where((row) => row.chunkY.lte(bounds.maxY));
    const soil = tables.worldSoil
      .where((row) => row.spaceId.eq(spaceId))
      .where((row) => row.chunkX.gte(bounds.minX)).where((row) => row.chunkX.lte(bounds.maxX))
      .where((row) => row.chunkY.gte(bounds.minY)).where((row) => row.chunkY.lte(bounds.maxY));
    const crops = tables.worldCrop
      .where((row) => row.spaceId.eq(spaceId))
      .where((row) => row.chunkX.gte(bounds.minX)).where((row) => row.chunkX.lte(bounds.maxX))
      .where((row) => row.chunkY.gte(bounds.minY)).where((row) => row.chunkY.lte(bounds.maxY));
    const worldItems = tables.worldItem
      .where((row) => row.spaceId.eq(spaceId))
      .where((row) => row.chunkX.gte(bounds.minX)).where((row) => row.chunkX.lte(bounds.maxX))
      .where((row) => row.chunkY.gte(bounds.minY)).where((row) => row.chunkY.lte(bounds.maxY));
    const projectiles = tables.worldProjectile
      .where((row) => row.spaceId.eq(spaceId))
      .where((row) => row.chunkX.gte(bounds.minX)).where((row) => row.chunkX.lte(bounds.maxX))
      .where((row) => row.chunkY.gte(bounds.minY)).where((row) => row.chunkY.lte(bounds.maxY));
    const combatTargets = tables.worldCombatTarget
      .where((row) => row.spaceId.eq(spaceId))
      .where((row) => row.chunkX.gte(bounds.minX)).where((row) => row.chunkX.lte(bounds.maxX))
      .where((row) => row.chunkY.gte(bounds.minY)).where((row) => row.chunkY.lte(bounds.maxY));
    const placeables = tables.worldPlaceable
      .where((row) => row.spaceId.eq(spaceId))
      .where((row) => row.chunkX.gte(bounds.minX))
      .where((row) => row.chunkX.lte(bounds.maxX))
      .where((row) => row.chunkY.gte(bounds.minY))
      .where((row) => row.chunkY.lte(bounds.maxY));
    const npcs = tables.worldNpc
      .where((row) => row.spaceId.eq(spaceId))
      .where((row) => row.chunkX.gte(bounds.minX)).where((row) => row.chunkX.lte(bounds.maxX))
      .where((row) => row.chunkY.gte(bounds.minY)).where((row) => row.chunkY.lte(bounds.maxY));
    const wildlifeProfiles = tables.worldWildlifeProfile
      .where((row) => row.spaceId.eq(spaceId))
      .where((row) => row.chunkX.gte(bounds.minX)).where((row) => row.chunkX.lte(bounds.maxX))
      .where((row) => row.chunkY.gte(bounds.minY)).where((row) => row.chunkY.lte(bounds.maxY));
    const rogueEnemyProfiles = tables.rogueEnemyProfile
      .where((row) => row.spaceId.eq(spaceId))
      .where((row) => row.chunkX.gte(bounds.minX)).where((row) => row.chunkX.lte(bounds.maxX))
      .where((row) => row.chunkY.gte(bounds.minY)).where((row) => row.chunkY.lte(bounds.maxY));
    const outdoorProfiles = spaceId===TOPSIDE_SPACE_ID ? [tables.outdoorEnemyProfile
      .where(row=>row.spaceId.eq(spaceId))
      .where(row=>row.chunkX.gte(bounds.minX)).where(row=>row.chunkX.lte(bounds.maxX))
      .where(row=>row.chunkY.gte(bounds.minY)).where(row=>row.chunkY.lte(bounds.maxY))] : [];
    const enemyAttacks = tables.enemyAttack
      .where((row) => row.spaceId.eq(spaceId))
      .where((row) => row.chunkX.gte(bounds.minX)).where((row) => row.chunkX.lte(bounds.maxX))
      .where((row) => row.chunkY.gte(bounds.minY)).where((row) => row.chunkY.lte(bounds.maxY));
    const hives = tables.worldHive
      .where((row) => row.spaceId.eq(spaceId))
      .where((row) => row.chunkX.gte(bounds.minX)).where((row) => row.chunkX.lte(bounds.maxX))
      .where((row) => row.chunkY.gte(bounds.minY)).where((row) => row.chunkY.lte(bounds.maxY));
    const surfaces = tables.worldSurface
      .where((row) => row.spaceId.eq(spaceId))
      .where((row) => row.chunkX.gte(bounds.minX)).where((row) => row.chunkX.lte(bounds.maxX))
      .where((row) => row.chunkY.gte(bounds.minY)).where((row) => row.chunkY.lte(bounds.maxY));
    const portals = tables.spacePortal.where((row) => row.fromSpace.eq(spaceId));
    const minimumTileX = bounds.minX * SURVIVAL_CHUNK_TILES;
    const minimumTileY = bounds.minY * SURVIVAL_CHUNK_TILES;
    const maximumTileX = (bounds.maxX + 1) * SURVIVAL_CHUNK_TILES - 1;
    const maximumTileY = (bounds.maxY + 1) * SURVIVAL_CHUNK_TILES - 1;
    const campfires = tables.worldCampfireState
      .where((row) => row.spaceId.eq(spaceId))
      .where((row) => row.tileX.gte(minimumTileX)).where((row) => row.tileX.lte(maximumTileX))
      .where((row) => row.tileY.gte(minimumTileY)).where((row) => row.tileY.lte(maximumTileY));
    const overworldHomesteads = tables.homestead
      .where((row) => row.overworldTileX.gte(minimumTileX)).where((row) => row.overworldTileX.lte(maximumTileX))
      .where((row) => row.overworldTileY.gte(minimumTileY)).where((row) => row.overworldTileY.lte(maximumTileY));
    const homesteadQueries = spaceId === TOPSIDE_SPACE_ID
      ? [overworldHomesteads]
      : [];
    const rogueInstance = definition?.generator === 'roguelike';
    const discoveryQueries = resourceDiscoveryQueries(
      spaceId, chunkX, chunkY, definition?.sizeTiles ?? SURVIVAL_WORLD_SIZE,
      discoveryRadii, REGION_CENTER_DEADBAND_TILES,
      this.content.state.registry,
    );
    const coreQueries = rogueInstance
      ? [positions, playerJumps, projectiles, npcs, rogueEnemyProfiles, enemyAttacks, ...discoveryQueries]
      : [
          positions, playerJumps, resources, soil, crops, worldItems, projectiles, combatTargets,
          placeables, npcs, wildlifeProfiles, rogueEnemyProfiles, enemyAttacks, hives, surfaces, ...outdoorProfiles, ...discoveryQueries,
        ];
    const auxiliaryQueries = rogueInstance ? [] : [portals, campfires, ...homesteadQueries];
    const queryCount = regionSubscriptionQueryCount(bounds, spaceId, definition?.generator) + discoveryQueries.length;
    this.pendingRegionQueryCount = queryCount;
    const previous = this.regionSubscription;
    const previousAuxiliary = this.regionAuxiliarySubscription;
    this.regionAuxiliarySubscription = auxiliaryQueries.length === 0 ? null
      : connection.subscriptionBuilder().onError((context) => {
      if (!this.currentConnection(connection)) return;
          console.warn('[orchard] Regional metadata subscription failed; core world streaming remains active', context.event);
        }).subscribe(auxiliaryQueries);
    this.regionSubscription = connection.subscriptionBuilder().onApplied(() => this.incoming(connection, () => {
      if (!this.currentConnection(connection)) return;
      this.region = [chunkX, chunkY]; this.subscribedRadius = radius; this.subscribedSpaceId = spaceId;
      this.subscribedSpaceDefinitionKey = definitionKey;
      this.subscribedCenterTiles = centerTiles; this.pendingRegion = null;
      if (previous?.isActive()) previous.unsubscribe();
      if (previousAuxiliary?.isActive()) previousAuxiliary.unsubscribe();
      this.activeRegionQueryCount = queryCount; this.pendingRegionQueryCount = 0;
      this.handoverCount += 1; this.resourceRevisionValue += 1;
      this.initialRegionHydrated = true; this.maybeGameplayReady(connection); this.onChanged();
      const current = this.ownPosition();
      if (current !== null) this.subscribeRegion(connection, current, true);
    })).onError((context) => {
      if (!this.currentConnection(connection)) return;
      this.pendingRegion = null; this.pendingRegionQueryCount = 0;
      const detail = context.event?.message?.trim();
      this.error = detail === undefined || detail.length === 0
        ? 'region_subscription_failed'
        : `region_subscription_failed: ${detail}`;
      console.error('[orchard] Regional world subscription failed', context.event);
      this.recovery.fail(this.connectionGeneration, this.error);
    }).subscribe(coreQueries);
  }

  /** Cellar excavation is space state, not viewport state. Keeping it in its
   * own subscription prevents a camera-region handover from retaining SDK rows
   * while the materialized collision store has been cleared. */
  private subscribeCellarExcavations(
    connection: DbConnection,
    spaceId: number,
    cellar: boolean,
  ): void {
    if (!cellar) {
      if (this.cellarExcavationSubscription?.isActive()) this.cellarExcavationSubscription.unsubscribe();
      this.cellarExcavationSubscription = null;
      this.subscribedCellarSpaceId = null;
      this.pendingCellarSpaceId = null;
      return;
    }
    if (this.subscribedCellarSpaceId === spaceId || this.pendingCellarSpaceId === spaceId) return;
    const previous = this.cellarExcavationSubscription;
    this.pendingCellarSpaceId = spaceId;
    // Authority derives collision from every persisted anchor in the cellar,
    // so subscribe by indexed space ownership rather than denormalized chunks.
    const query = tables.cellarExcavation.where((row) => row.spaceId.eq(spaceId));
    let next: SubscriptionHandle | null = null;
    next = connection.subscriptionBuilder().onApplied(() => this.incoming(connection, () => {
      if (!this.currentConnection(connection)) return;
      if (next === null || this.cellarExcavationSubscription !== next) return;
      this.hydrateCellarExcavations(connection, spaceId);
      this.subscribedCellarSpaceId = spaceId;
      this.pendingCellarSpaceId = null;
      if (previous?.isActive()) previous.unsubscribe();
      this.maybeGameplayReady(connection); this.onChanged();
    })).onError((context) => {
      if (!this.currentConnection(connection)) return;
      if (this.cellarExcavationSubscription === next) {
        this.pendingCellarSpaceId = null;
        const detail = context.event?.message?.trim();
        this.error = detail === undefined || detail.length === 0
          ? 'cellar_excavation_subscription_failed'
          : `cellar_excavation_subscription_failed: ${detail}`;
        this.recovery.fail(this.connectionGeneration, this.error);
      }
    }).subscribe([query]);
    this.cellarExcavationSubscription = next;
  }

  private incoming(connection: DbConnection, apply: () => void, eventId?: string): void {
    const guarded = (): void => {
      if (!this.currentConnection(connection)) return;
      try { apply(); } catch (error) {
        clientErrorReporter.capture('connection', error);
        this.recovery.fail(this.connectionGeneration, 'subscription_hydration_failed');
      }
    };
    if (eventId === undefined) this.latency.incoming(guarded);
    else this.latency.incomingGrouped(eventId, guarded);
  }

  private bindTableEvents(connection: DbConnection): void {
    const incoming = (eventId: string, apply: () => void): void => {
      this.incoming(connection, () => {
        apply(); this.maybeGameplayReady(connection); this.onChanged();
      }, eventId);
    };
    connection.db.playerPublic.onInsert((context, row) => incoming(context.event.id, () => this.setProfile(row)));
    connection.db.playerPublic.onUpdate((context, _old, row) => incoming(context.event.id, () => this.setProfile(row)));
    connection.db.playerPublic.onDelete((context, row) => incoming(context.event.id, () => {
      const id = identityHex(row.identity);
      if (this.profiles.delete(id)) this.presenceRevisionValue += 1;
      this.visiblePlayers.delete(id);
    }));
    connection.db.playerAppearance.onInsert((context, row) => incoming(context.event.id, () => this.appearances.set(identityHex(row.identity), row)));
    connection.db.playerAppearance.onUpdate((context, _old, row) => incoming(context.event.id, () => this.appearances.set(identityHex(row.identity), row)));
    connection.db.playerAppearance.onDelete((context, row) => incoming(context.event.id, () => this.appearances.delete(identityHex(row.identity))));
    connection.db.contentHead.onInsert(() => this.scheduleContentRefresh(connection));
    connection.db.contentHead.onUpdate(() => this.scheduleContentRefresh(connection));
    connection.db.contentHead.onDelete(() => this.scheduleContentRefresh(connection));
    connection.db.runtimeContentDefinitions.onInsert(() => this.scheduleContentRefresh(connection));
    connection.db.runtimeContentDefinitions.onDelete(() => this.scheduleContentRefresh(connection));
    connection.db.activeFishingCasts.onInsert((context, row) => incoming(context.event.id, () => this.fishingCasts.set(identityHex(row.identity), row)));
    connection.db.activeFishingCasts.onUpdate((context, _old, row) => incoming(context.event.id, () => this.fishingCasts.set(identityHex(row.identity), row)));
    connection.db.activeFishingCasts.onDelete((context, row) => incoming(context.event.id, () => this.fishingCasts.delete(identityHex(row.identity))));
    connection.db.worldClock.onInsert((context, row) => incoming(context.event.id, () => { this.clock = row; this.recovery.observedTraffic(this.connectionGeneration); }));
    connection.db.worldClock.onUpdate((context, _old, row) => incoming(context.event.id, () => { this.clock = row; this.recovery.observedTraffic(this.connectionGeneration); }));
    connection.db.worldEnvironment.onInsert((context, row) => incoming(context.event.id, () => { this.environment = row; }));
    connection.db.worldEnvironment.onUpdate((context, _old, row) => incoming(context.event.id, () => { this.environment = row; }));
    connection.db.worldCampfireState.onInsert((context, row) => incoming(context.event.id, () => this.campfires.set(row.id, row)));
    connection.db.worldCampfireState.onUpdate((context, _old, row) => incoming(context.event.id, () => this.campfires.set(row.id, row)));
    connection.db.worldCampfireState.onDelete((context, row) => incoming(context.event.id, () => this.campfires.delete(row.id)));
    connection.db.worldWind.onInsert((context, row) => incoming(context.event.id, () => { this.wind = row; }));
    connection.db.worldWind.onUpdate((context, _old, row) => incoming(context.event.id, () => { this.wind = row; }));
    connection.db.spacePortal.onInsert((context, row) => incoming(context.event.id, () => this.portals.set(row.id, row)));
    connection.db.spacePortal.onUpdate((context, _old, row) => incoming(context.event.id, () => this.portals.set(row.id, row)));
    connection.db.spacePortal.onDelete((context, row) => incoming(context.event.id, () => this.portals.delete(row.id)));
    connection.db.homestead.onInsert((context, row) => resource(context.event.id, () => this.homesteads.set(row.spaceId, row)));
    connection.db.homestead.onUpdate((context, _old, row) => resource(context.event.id, () => this.homesteads.set(row.spaceId, row)));
    connection.db.homestead.onDelete((context, row) => resource(context.event.id, () => {
      const current = connection.db.ownCurrentHomestead.spaceId.find(row.spaceId);
      if (current === null) this.homesteads.delete(row.spaceId);
      else this.homesteads.set(current.spaceId, current);
    }));
    connection.db.ownCurrentHomestead.onInsert((context, row) => resource(context.event.id, () => this.homesteads.set(row.spaceId, row)));
    connection.db.ownCurrentHomestead.onUpdate((context, _old, row) => resource(context.event.id, () => this.homesteads.set(row.spaceId, row)));
    connection.db.ownCurrentHomestead.onDelete((context, row) => resource(context.event.id, () => {
      const regional = connection.db.homestead.spaceId.find(row.spaceId);
      if (regional === null) this.homesteads.delete(row.spaceId);
      else this.homesteads.set(regional.spaceId, regional);
    }));
    connection.db.cellarExcavation.onInsert((context, row) => resource(context.event.id, () => {
      this.cellarExcavations.set(row.id, row); this.cellarExcavationRevisionValue += 1;
    }));
    connection.db.cellarExcavation.onUpdate((context, _old, row) => resource(context.event.id, () => {
      this.cellarExcavations.set(row.id, row); this.cellarExcavationRevisionValue += 1;
    }));
    connection.db.cellarExcavation.onDelete((context, row) => resource(context.event.id, () => {
      this.cellarExcavations.delete(row.id); this.cellarExcavationRevisionValue += 1;
    }));
    connection.db.worldSurface.onInsert((context, row) => resource(context.event.id, () => this.surfaces.set(row.id, row)));
    connection.db.worldSurface.onUpdate((context, _old, row) => resource(context.event.id, () => this.surfaces.set(row.id, row)));
    connection.db.worldSurface.onDelete((context, row) => resource(context.event.id, () => this.surfaces.delete(row.id)));
    connection.db.worldWildlifeProfile.onInsert((context, row) => incoming(context.event.id, () => this.wildlifeProfiles.set(row.npcId, row)));
    connection.db.worldWildlifeProfile.onUpdate((context, _old, row) => incoming(context.event.id, () => this.wildlifeProfiles.set(row.npcId, row)));
    connection.db.worldWildlifeProfile.onDelete((context, row) => incoming(context.event.id, () => this.wildlifeProfiles.delete(row.npcId)));
    connection.db.enemyAttack.onInsert((context,row)=>incoming(context.event.id,()=>this.enemyAttacks.set(row.npcId,row)));
    connection.db.enemyAttack.onUpdate((context,_old,row)=>incoming(context.event.id,()=>this.enemyAttacks.set(row.npcId,row)));
    connection.db.enemyAttack.onDelete((context,row)=>incoming(context.event.id,()=>this.enemyAttacks.delete(row.npcId)));
    connection.db.outdoorEnemyProfile.onInsert((context,row)=>incoming(context.event.id,()=>this.outdoorEnemyProfiles.set(row.npcId,row)));
    connection.db.outdoorEnemyProfile.onUpdate((context,_old,row)=>incoming(context.event.id,()=>this.outdoorEnemyProfiles.set(row.npcId,row)));
    connection.db.outdoorEnemyProfile.onDelete((context,row)=>incoming(context.event.id,()=>this.outdoorEnemyProfiles.delete(row.npcId)));
    connection.db.ownOutdoorRewards.onInsert((context,row)=>incoming(context.event.id,()=>{this.outdoorRewards.set(row.id,row);this.outdoorRewardsRevision++;}));
    connection.db.ownOutdoorRewards.onUpdate((context,_old,row)=>incoming(context.event.id,()=>{this.outdoorRewards.set(row.id,row);this.outdoorRewardsRevision++;}));
    connection.db.ownOutdoorRewards.onDelete((context,row)=>incoming(context.event.id,()=>{this.outdoorRewards.delete(row.id);this.outdoorRewardsRevision++;}));
    connection.db.rogueEnemyProfile.onInsert((context, row) => incoming(context.event.id, () => this.rogueEnemyProfiles.set(row.npcId, row)));
    connection.db.rogueEnemyProfile.onUpdate((context, _old, row) => incoming(context.event.id, () => this.rogueEnemyProfiles.set(row.npcId, row)));
    connection.db.rogueEnemyProfile.onDelete((context, row) => incoming(context.event.id, () => this.rogueEnemyProfiles.delete(row.npcId)));
    connection.db.worldMerchant.onInsert((context, row) => incoming(context.event.id, () => this.merchants.set(row.npcId, row)));
    connection.db.worldMerchant.onUpdate((context, _old, row) => incoming(context.event.id, () => this.merchants.set(row.npcId, row)));
    connection.db.worldMerchant.onDelete((context, row) => incoming(context.event.id, () => this.merchants.delete(row.npcId)));
    connection.db.worldHive.onInsert((context, row) => incoming(context.event.id, () => this.hives.set(row.id, row)));
    connection.db.worldHive.onUpdate((context, _old, row) => incoming(context.event.id, () => this.hives.set(row.id, row)));
    connection.db.worldHive.onDelete((context, row) => incoming(context.event.id, () => this.hives.delete(row.id)));
    connection.db.worldSeed.onInsert((context, row) => incoming(context.event.id, () => { this.worldSeed = row; }));
    connection.db.worldSeed.onUpdate((context, _old, row) => incoming(context.event.id, () => { this.worldSeed = row; }));
    connection.db.liveMapDocument.onInsert((context, row) => incoming(context.event.id, () => {
      if (row.mapId === LIVE_ISLAND_MAP_ID) this.liveMapDocument = row;
    }));
    connection.db.liveMapDocument.onUpdate((context, _old, row) => incoming(context.event.id, () => {
      if (row.mapId === LIVE_ISLAND_MAP_ID) this.liveMapDocument = row;
    }));
    connection.db.liveMapDocument.onDelete((context, row) => incoming(context.event.id, () => {
      if (row.mapId === LIVE_ISLAND_MAP_ID) this.liveMapDocument = null;
    }));
    const resource = (eventId: string, apply: () => void): void => incoming(eventId, () => { apply(); this.resourceRevisionValue += 1; });
    connection.db.worldResource.onInsert((context, row) => resource(context.event.id, () => this.resources.set(row.id, row)));
    connection.db.worldResource.onUpdate((context, _old, row) => resource(context.event.id, () => this.resources.set(row.id, row)));
    connection.db.worldResource.onDelete((context, row) => resource(context.event.id, () => this.resources.delete(row.id)));
    connection.db.worldSoil.onInsert((context, row) => incoming(context.event.id, () => this.soil.set(row.id, row)));
    connection.db.worldSoil.onUpdate((context, _old, row) => incoming(context.event.id, () => this.soil.set(row.id, row)));
    connection.db.worldSoil.onDelete((context, row) => incoming(context.event.id, () => this.soil.delete(row.id)));
    connection.db.worldCrop.onInsert((context, row) => incoming(context.event.id, () => this.crops.set(row.id, row)));
    connection.db.worldCrop.onUpdate((context, _old, row) => incoming(context.event.id, () => this.crops.set(row.id, row)));
    connection.db.worldCrop.onDelete((context, row) => incoming(context.event.id, () => this.crops.delete(row.id)));
    connection.db.worldItem.onInsert((context, row) => incoming(context.event.id, () => this.worldItems.set(row.id, row)));
    connection.db.worldItem.onUpdate((context, _old, row) => incoming(context.event.id, () => this.worldItems.set(row.id, row)));
    connection.db.worldItem.onDelete((context, row) => incoming(context.event.id, () => this.worldItems.delete(row.id)));
    connection.db.worldProjectile.onInsert((context, row) => incoming(context.event.id, () => this.setProjectile(row)));
    connection.db.worldProjectile.onUpdate((context, _old, row) => incoming(context.event.id, () => this.setProjectile(row)));
    connection.db.worldProjectile.onDelete((context, row) => incoming(context.event.id, () => {
      this.projectiles.delete(row.id);
      this.lastProjectileAuthorityTicks.delete(row.id);
      this.deletedProjectileIds.add(row.id);
    }));
    connection.db.worldCombatTarget.onInsert((context, row) => resource(context.event.id, () => this.combatTargets.set(row.id, row)));
    connection.db.worldCombatTarget.onUpdate((context, old, row) => incoming(context.event.id, () => {
      this.combatTargets.set(row.id, row);
      if (row.healthCenti < old.healthCenti) {
        this.combatTextCommits.push({
          targetKind: 'combat_target',
          targetId: row.id,
          amountCenti: old.healthCenti - row.healthCenti,
          critical: row.lastHitCritical,
          x: row.x,
          y: row.y,
        });
        if (this.combatTextCommits.length > 64) this.combatTextCommits.shift();
      }
      if (row.x !== old.x || row.y !== old.y || row.spaceId !== old.spaceId
        || row.carriedBy?.toHexString() !== old.carriedBy?.toHexString()) this.resourceRevisionValue += 1;
    }));
    connection.db.worldCombatTarget.onDelete((context, row) => resource(context.event.id, () => this.combatTargets.delete(row.id)));
    connection.db.worldPlaceable.onInsert((context, row) => resource(context.event.id, () => {
      if (isUnifiedChest(this.content.state.registry, row)) {
        this.chestPlaceableSources.set(row.id, row);
        this.chests.set(row.id, compatibilityChest(row));
      }
      else this.placeables.set(row.id, row);
    }));
    connection.db.worldPlaceable.onUpdate((context, old, row) => resource(context.event.id, () => {
      if (isUnifiedChest(this.content.state.registry, row)) {
        this.placeables.delete(row.id);
        this.chestPlaceableSources.set(row.id, row);
        this.chests.set(row.id, compatibilityChest(row));
      } else {
        this.chestPlaceableSources.delete(row.id);
        this.placeables.set(row.id, row);
        if (isUnifiedChest(this.content.state.registry, old)) this.chests.delete(old.id);
      }
    }));
    connection.db.worldPlaceable.onDelete((context, row) => resource(context.event.id, () => {
      if (isUnifiedChest(this.content.state.registry, row)) {
        this.chestPlaceableSources.delete(row.id);
        this.chests.delete(row.id);
      }
      else this.placeables.delete(row.id);
    }));
    connection.db.worldNpc.onInsert((context, row) => incoming(context.event.id, () => this.setNpc(row)));
    connection.db.worldNpc.onUpdate((context, old, row) => incoming(context.event.id, () => {
      this.setNpc(row);
      if (row.health < old.health) {
        this.combatTextCommits.push({
          targetKind: 'npc',
          targetId: row.id,
          amountCenti: (old.health - row.health) * 100,
          critical: row.lastHitCritical,
          x: row.x,
          y: row.y,
        });
        if (this.combatTextCommits.length > 64) this.combatTextCommits.shift();
      }
    }));
    connection.db.worldNpc.onDelete((context, row) => incoming(context.event.id, () => {
      this.npcs.delete(row.id); this.deletedNpcIds.add(row.id);
    }));
    connection.db.ownSurvival.onInsert((context, row) => incoming(context.event.id, () => { this.survival = row; }));
    connection.db.ownSurvival.onUpdate((context, _old, row) => incoming(context.event.id, () => { this.survival = row; }));
    connection.db.ownSurvival.onDelete((context) => incoming(context.event.id, () => { this.survival = null; }));
    connection.db.ownCookingJob.onInsert((context, row) => incoming(context.event.id, () => { this.cookingJob = row; }));
    connection.db.ownCookingJob.onUpdate((context, _old, row) => incoming(context.event.id, () => { this.cookingJob = row; }));
    connection.db.ownCookingJob.onDelete((context) => incoming(context.event.id, () => { this.cookingJob = null; }));
    connection.db.ownFishingCast.onInsert((context, row) => incoming(context.event.id, () => { this.fishingCast = row; }));
    connection.db.ownFishingCast.onUpdate((context, _old, row) => incoming(context.event.id, () => { this.fishingCast = row; }));
    connection.db.ownFishingCast.onDelete((context) => incoming(context.event.id, () => { this.fishingCast = null; }));
    connection.db.ownStats.onInsert((context, row) => incoming(context.event.id, () => { this.stats = row; }));
    connection.db.ownStats.onUpdate((context, _old, row) => incoming(context.event.id, () => { this.stats = row; }));
    connection.db.ownStats.onDelete((context) => incoming(context.event.id, () => { this.stats = null; }));
    connection.db.ownWallet.onInsert((context, row) => incoming(context.event.id, () => { this.wallet = row; }));
    connection.db.ownWallet.onUpdate((context, _old, row) => incoming(context.event.id, () => { this.wallet = row; }));
    connection.db.ownWallet.onDelete((context) => incoming(context.event.id, () => { this.wallet = null; }));
    connection.db.ownHomesteadUpgrades.onInsert((context, row) => incoming(context.event.id, () => this.homesteadUpgrades.set(row.id, row)));
    connection.db.ownHomesteadUpgrades.onUpdate((context, _old, row) => incoming(context.event.id, () => this.homesteadUpgrades.set(row.id, row)));
    connection.db.ownHomesteadUpgrades.onDelete((context, row) => incoming(context.event.id, () => this.homesteadUpgrades.delete(row.id)));
    connection.db.activeFarmUpgrades.onInsert((context, row) => incoming(context.event.id, () => this.activeFarmUpgrades.set(row.id, row)));
    connection.db.activeFarmUpgrades.onUpdate((context, _old, row) => incoming(context.event.id, () => this.activeFarmUpgrades.set(row.id, row)));
    connection.db.activeFarmUpgrades.onDelete((context, row) => incoming(context.event.id, () => this.activeFarmUpgrades.delete(row.id)));
    connection.db.ownHomesteadMembers.onInsert((context, row) => incoming(context.event.id, () => this.homesteadMembers.set(row.id, row)));
    connection.db.ownHomesteadMembers.onUpdate((context, _old, row) => incoming(context.event.id, () => this.homesteadMembers.set(row.id, row)));
    connection.db.ownHomesteadMembers.onDelete((context, row) => incoming(context.event.id, () => this.homesteadMembers.delete(row.id)));
    connection.db.ownTradeSession.onInsert((context, row) => incoming(context.event.id, () => { this.tradeSession = row; }));
    connection.db.ownTradeSession.onUpdate((context, _old, row) => incoming(context.event.id, () => { this.tradeSession = row; }));
    connection.db.ownTradeSession.onDelete((context) => incoming(context.event.id, () => { this.tradeSession = null; this.tradeOffers.clear(); }));
    connection.db.ownTradeOffers.onInsert((context, row) => incoming(context.event.id, () => this.tradeOffers.set(row.id, row)));
    connection.db.ownTradeOffers.onUpdate((context, _old, row) => incoming(context.event.id, () => this.tradeOffers.set(row.id, row)));
    connection.db.ownTradeOffers.onDelete((context, row) => incoming(context.event.id, () => this.tradeOffers.delete(row.id)));
    connection.db.ownEffects.onInsert((context, row) => incoming(context.event.id, () => this.effects.set(row.id, row)));
    connection.db.ownEffects.onUpdate((context, _old, row) => incoming(context.event.id, () => this.effects.set(row.id, row)));
    connection.db.ownEffects.onDelete((context, row) => incoming(context.event.id, () => this.effects.delete(row.id)));
    const setRogueRun = (row: RogueRun | null): void => {
      const previous = this.rogueRun;
      this.rogueRun = row;
      if (this.connection === null || this.identity === null) return;
      const position = this.positions.get(identityHex(this.identity));
      if (position !== undefined && rogueRunRequiresRegionRefresh(previous, row, position.spaceId)) {
        this.subscribeRegion(this.connection, position, true);
      }
    };
    connection.db.ownRogueRun.onInsert((context, row) => incoming(context.event.id, () => setRogueRun(row)));
    connection.db.ownRogueRun.onUpdate((context, _old, row) => incoming(context.event.id, () => setRogueRun(row)));
    connection.db.ownRogueRun.onDelete((context) => incoming(context.event.id, () => setRogueRun(null)));
    connection.db.ownRogueRoomExits.onInsert((context, row) => incoming(context.event.id, () => this.rogueRoomExits.set(row.slot, row)));
    connection.db.ownRogueRoomExits.onUpdate((context, _old, row) => incoming(context.event.id, () => this.rogueRoomExits.set(row.slot, row)));
    connection.db.ownRogueRoomExits.onDelete((context, row) => incoming(context.event.id, () => this.rogueRoomExits.delete(row.slot)));
    connection.db.ownRogueRewardOffers.onInsert((context, row) => incoming(context.event.id, () => this.rogueRewardOffers.set(row.slot, row)));
    connection.db.ownRogueRewardOffers.onUpdate((context, _old, row) => incoming(context.event.id, () => this.rogueRewardOffers.set(row.slot, row)));
    connection.db.ownRogueRewardOffers.onDelete((context, row) => incoming(context.event.id, () => this.rogueRewardOffers.delete(row.slot)));
    connection.db.ownRogueRunUpgrades.onInsert((context, row) => incoming(context.event.id, () => this.rogueRunUpgrades.set(row.id, row)));
    connection.db.ownRogueRunUpgrades.onUpdate((context, _old, row) => incoming(context.event.id, () => this.rogueRunUpgrades.set(row.id, row)));
    connection.db.ownRogueRunUpgrades.onDelete((context, row) => incoming(context.event.id, () => this.rogueRunUpgrades.delete(row.id)));
    connection.db.ownCharacterProfile.onInsert((context, row) => incoming(context.event.id, () => { this.characterProfile = row; }));
    connection.db.ownCharacterProfile.onUpdate((context, _old, row) => incoming(context.event.id, () => { this.characterProfile = row; }));
    connection.db.ownCharacterProfile.onDelete((context) => incoming(context.event.id, () => { this.characterProfile = null; }));
    connection.db.ownMembership.onInsert((context, row) => incoming(context.event.id, () => { this.membership = row; }));
    connection.db.ownMembership.onUpdate((context, _old, row) => incoming(context.event.id, () => { this.membership = row; }));
    connection.db.ownMembership.onDelete((context) => incoming(context.event.id, () => { this.membership = null; }));
    connection.db.ownConnectionNotices.onInsert((context, row) => incoming(context.event.id, () => this.setConnectionNotice(connection, row)));
    connection.db.ownConnectionNotices.onUpdate((context, _old, row) => incoming(context.event.id, () => this.setConnectionNotice(connection, row)));
    connection.db.ownConnectionNotices.onDelete((context, row) => incoming(context.event.id, () => {
      if (row.connectionId.isEqual(connection.connectionId)) this.motd = null;
    }));
    connection.db.ownSessionChatNotices.onInsert((context, row) => incoming(context.event.id, () => {
      if (row.recipientConnectionId.isEqual(connection.connectionId)) this.sessionChatNotices.set(row.id, row);
    }));
    connection.db.ownSessionChatNotices.onUpdate((context, _old, row) => incoming(context.event.id, () => {
      if (row.recipientConnectionId.isEqual(connection.connectionId)) this.sessionChatNotices.set(row.id, row);
    }));
    connection.db.ownSessionChatNotices.onDelete((context, row) => incoming(context.event.id, () => {
      if (row.recipientConnectionId.isEqual(connection.connectionId)) this.sessionChatNotices.delete(row.id);
    }));
    connection.db.ownInventorySlots.onInsert((context, row) => incoming(context.event.id, () => this.inventorySlots.set(row.slot, row)));
    connection.db.ownInventorySlots.onUpdate((context, _old, row) => incoming(context.event.id, () => this.inventorySlots.set(row.slot, row)));
    connection.db.ownInventorySlots.onDelete((context, row) => incoming(context.event.id, () => this.inventorySlots.delete(row.slot)));
    connection.db.ownKnownRecipes.onInsert((context, row) => incoming(context.event.id, () => this.knownRecipes.set(row.recipeId, row)));
    connection.db.ownKnownRecipes.onUpdate((context, _old, row) => incoming(context.event.id, () => this.knownRecipes.set(row.recipeId, row)));
    connection.db.ownKnownRecipes.onDelete((context, row) => incoming(context.event.id, () => this.knownRecipes.delete(row.recipeId)));
    connection.db.ownInventoryCursor.onInsert((context, row) => incoming(context.event.id, () => {
      this.inventoryCursor = { itemKind: row.itemKind, quantity: row.quantity, durability: row.durability, lit: row.lit };
    }));
    connection.db.ownInventoryCursor.onUpdate((context, _old, row) => incoming(context.event.id, () => {
      this.inventoryCursor = { itemKind: row.itemKind, quantity: row.quantity, durability: row.durability, lit: row.lit };
    }));
    connection.db.ownInventoryCursor.onDelete((context) => incoming(context.event.id, () => { this.inventoryCursor = null; }));
    connection.db.ownActiveDialogue.onInsert((context, row) => incoming(context.event.id, () => { this.activeDialogue = row; }));
    connection.db.ownActiveDialogue.onUpdate((context, _old, row) => incoming(context.event.id, () => { this.activeDialogue = row; }));
    connection.db.ownActiveDialogue.onDelete((context) => incoming(context.event.id, () => { this.activeDialogue = null; }));
    connection.db.ownPlayerQuests.onInsert((context, row) => incoming(context.event.id, () => this.quests.set(row.id, row)));
    connection.db.ownPlayerQuests.onUpdate((context, _old, row) => incoming(context.event.id, () => this.quests.set(row.id, row)));
    connection.db.ownPlayerQuests.onDelete((context, row) => incoming(context.event.id, () => this.quests.delete(row.id)));
    connection.db.ownPlayerQuestBaselines.onInsert((context, row) => incoming(context.event.id, () => this.questBaselines.set(row.id, row)));
    connection.db.ownPlayerQuestBaselines.onUpdate((context, _old, row) => incoming(context.event.id, () => this.questBaselines.set(row.id, row)));
    connection.db.ownPlayerQuestBaselines.onDelete((context, row) => incoming(context.event.id, () => this.questBaselines.delete(row.id)));
    connection.db.ownPlayerStatistics.onInsert((context, row) => incoming(context.event.id, () => this.playerStatistics.set(row.id, row)));
    connection.db.ownPlayerStatistics.onUpdate((context, _old, row) => incoming(context.event.id, () => this.playerStatistics.set(row.id, row)));
    connection.db.ownPlayerStatistics.onDelete((context, row) => incoming(context.event.id, () => this.playerStatistics.delete(row.id)));
    connection.db.ownCombatState.onInsert((context,row)=>incoming(context.event.id,()=>{this.combatState=row;}));
    connection.db.ownCombatState.onUpdate((context,_old,row)=>incoming(context.event.id,()=>{this.combatState=row;}));
    connection.db.ownCombatState.onDelete(context=>incoming(context.event.id,()=>{this.combatState=null;}));
    connection.db.ownEquipmentPreferences.onInsert((context,row)=>incoming(context.event.id,()=>{this.equipmentSkillPriority=row.skillPriority;}));
    connection.db.ownEquipmentPreferences.onUpdate((context,_old,row)=>incoming(context.event.id,()=>{this.equipmentSkillPriority=row.skillPriority;}));
    connection.db.ownEquipmentPreferences.onDelete(context=>incoming(context.event.id,()=>{this.equipmentSkillPriority=[];}));
    connection.db.ownPlayerSkillTracks.onInsert((context, row) => incoming(context.event.id, () => this.skillTracks.set(row.id, row)));
    connection.db.ownPlayerSkillTracks.onUpdate((context, _old, row) => incoming(context.event.id, () => this.skillTracks.set(row.id, row)));
    connection.db.ownPlayerSkillTracks.onDelete((context, row) => incoming(context.event.id, () => this.skillTracks.delete(row.id)));
    connection.db.activeFarmSkillNodes.onInsert((context, row) => incoming(context.event.id, () => this.activeFarmSkillNodes.set(row.id, row)));
    connection.db.activeFarmSkillNodes.onUpdate((context, _old, row) => incoming(context.event.id, () => this.activeFarmSkillNodes.set(row.id, row)));
    connection.db.activeFarmSkillNodes.onDelete((context, row) => incoming(context.event.id, () => this.activeFarmSkillNodes.delete(row.id)));
    connection.db.ownPlayerSkillNodes.onInsert((context, row) => incoming(context.event.id, () => {
      this.skillNodes.set(row.id, row);
      const position = this.ownPosition();
      if (position !== null) this.subscribeRegion(connection, position, true);
    }));
    connection.db.ownPlayerSkillNodes.onUpdate((context, _old, row) => incoming(context.event.id, () => {
      this.skillNodes.set(row.id, row);
      const position = this.ownPosition();
      if (position !== null) this.subscribeRegion(connection, position, true);
    }));
    connection.db.ownPlayerSkillNodes.onDelete((context, row) => incoming(context.event.id, () => {
      this.skillNodes.delete(row.id);
      const position = this.ownPosition();
      if (position !== null) this.subscribeRegion(connection, position, true);
    }));
    connection.db.ownQuestWorldItems.onInsert((context, row) => incoming(context.event.id, () => this.questWorldItems.set(row.id, row)));
    connection.db.ownQuestWorldItems.onUpdate((context, _old, row) => incoming(context.event.id, () => this.questWorldItems.set(row.id, row)));
    connection.db.ownQuestWorldItems.onDelete((context, row) => incoming(context.event.id, () => this.questWorldItems.delete(row.id)));
    connection.db.ownPlayerThought.onInsert((context, row) => incoming(context.event.id, () => { this.thought = row; }));
    connection.db.ownPlayerThought.onUpdate((context, _old, row) => incoming(context.event.id, () => { this.thought = row; }));
    connection.db.ownPlayerThought.onDelete((context) => incoming(context.event.id, () => { this.thought = null; }));
    const setActivePlaceable = (row: WorldPlaceable): void => {
      this.activePlaceable = row;
      this.activeChest = isUnifiedChest(this.content.state.registry, row) ? compatibilityChest(row) : null;
      if (!isUnifiedChest(this.content.state.registry, row)) this.openChestSlots.clear();
    };
    const stashActive=(row:{connectionId:{toHexString:()=>string}})=>{
      this.hearthStashOpen=row.connectionId.toHexString()===connection.connectionId?.toHexString();
    };
    connection.db.ownActiveHearthStash.onInsert((context,row)=>incoming(context.event.id,()=>stashActive(row)));
    connection.db.ownActiveHearthStash.onUpdate((context,_old,row)=>incoming(context.event.id,()=>stashActive(row)));
    connection.db.ownActiveHearthStash.onDelete(context=>incoming(context.event.id,()=>{this.hearthStashOpen=false;}));
    connection.db.ownVillageOrders.onInsert((context,row)=>incoming(context.event.id,()=>this.villageOrders.set(row.id,row)));
    connection.db.ownVillageOrders.onUpdate((context,_old,row)=>incoming(context.event.id,()=>this.villageOrders.set(row.id,row)));
    connection.db.ownVillageOrders.onDelete((context,row)=>incoming(context.event.id,()=>this.villageOrders.delete(row.id)));
    connection.db.ownHearthStashSlots.onInsert((context,row)=>incoming(context.event.id,()=>this.hearthStashSlots.set(row.slot,row)));
    connection.db.ownHearthStashSlots.onUpdate((context,_old,row)=>incoming(context.event.id,()=>this.hearthStashSlots.set(row.slot,row)));
    connection.db.ownHearthStashSlots.onDelete((context,row)=>incoming(context.event.id,()=>this.hearthStashSlots.delete(row.slot)));
    connection.db.ownActivePlaceable.onInsert((context, row) => incoming(context.event.id, () => setActivePlaceable(row)));
    connection.db.ownActivePlaceable.onUpdate((context, _old, row) => incoming(context.event.id, () => setActivePlaceable(row)));
    connection.db.ownActivePlaceable.onDelete((context) => incoming(context.event.id, () => {
      this.activePlaceable = null; this.activeChest = null;
      this.openPlaceableSlots.clear(); this.openChestSlots.clear();
    }));
    const setOpenPlaceableSlot = (row: WorldPlaceableSlot): void => {
      this.openPlaceableSlots.set(row.slot, row);
      if (this.activePlaceable !== null && isUnifiedChest(this.content.state.registry, this.activePlaceable)) {
        this.openChestSlots.set(row.slot, compatibilityChestSlot(row));
      }
    };
    connection.db.ownOpenPlaceableSlots.onInsert((context, row) => incoming(context.event.id, () => setOpenPlaceableSlot(row)));
    connection.db.ownOpenPlaceableSlots.onUpdate((context, _old, row) => incoming(context.event.id, () => setOpenPlaceableSlot(row)));
    connection.db.ownOpenPlaceableSlots.onDelete((context, row) => incoming(context.event.id, () => {
      this.openPlaceableSlots.delete(row.slot); this.openChestSlots.delete(row.slot);
    }));
    connection.db.ownChatChannels.onInsert((context, row) => incoming(context.event.id, () => this.chatChannels.set(row.id, row)));
    connection.db.ownChatChannels.onUpdate((context, _old, row) => incoming(context.event.id, () => this.chatChannels.set(row.id, row)));
    connection.db.ownChatChannels.onDelete((context, row) => incoming(context.event.id, () => this.chatChannels.delete(row.id)));
    connection.db.visibleChatMessages.onInsert((context, row) => incoming(context.event.id, () => this.chatMessages.set(row.id, row)));
    connection.db.visibleChatMessages.onUpdate((context, _old, row) => incoming(context.event.id, () => this.chatMessages.set(row.id, row)));
    connection.db.visibleChatMessages.onDelete((context, row) => incoming(context.event.id, () => this.chatMessages.delete(row.id)));
    connection.db.visibleWorldSpeech.onInsert((context, row) => incoming(context.event.id, () => this.worldSpeech.set(row.id, row)));
    connection.db.visibleWorldSpeech.onUpdate((context, _old, row) => incoming(context.event.id, () => this.worldSpeech.set(row.id, row)));
    connection.db.visibleWorldSpeech.onDelete((context, row) => incoming(context.event.id, () => this.worldSpeech.delete(row.id)));
    connection.db.ownPlayerPrediction.onInsert((context, row) => incoming(context.event.id, () => this.setPredictionState(row)));
    connection.db.ownPlayerPrediction.onUpdate((context, _old, row) => incoming(context.event.id, () => this.setPredictionState(row)));
    connection.db.ownPlayerPrediction.onDelete((context) => incoming(context.event.id, () => { this.predictionState = null; }));
    connection.db.playerJumpState.onInsert((context, row) => incoming(context.event.id, () => this.playerJumps.set(identityHex(row.identity), row)));
    connection.db.playerJumpState.onUpdate((context, _old, row) => incoming(context.event.id, () => this.playerJumps.set(identityHex(row.identity), row)));
    connection.db.playerJumpState.onDelete((context, row) => incoming(context.event.id, () => this.playerJumps.delete(identityHex(row.identity))));
    connection.db.playerPosition.onInsert((context, row) => incoming(context.event.id, () => this.setPosition(row)));
    connection.db.playerPosition.onUpdate((context, _old, row) => incoming(context.event.id, () => this.setPosition(row)));
    connection.db.playerPosition.onDelete((context, row) => incoming(context.event.id, () => {
      const id = identityHex(row.identity); this.positions.delete(id); this.visiblePlayers.delete(id); this.deletedPositionIds.add(id);
    }));
  }

  private setProfile(row: PlayerPublic): void {
    const id = identityHex(row.identity);
    this.profiles.set(id, row);
    this.presenceRevisionValue += 1;
    const position = this.positions.get(id);
    if (position !== undefined && position.spaceId === this.ownSpaceId) {
      this.visiblePlayers.set(id, position);
    } else this.visiblePlayers.delete(id);
  }
  private clearSpaceScopedCaches(): void {
    this.positions.clear(); this.visiblePlayers.clear(); this.playerJumps.clear(); this.resources.clear(); this.soil.clear(); this.crops.clear();
    this.worldItems.clear(); this.projectiles.clear(); this.chests.clear(); this.chestPlaceableSources.clear(); this.placeables.clear(); this.surfaces.clear(); this.cellarExcavations.clear(); this.npcs.clear();
    this.wildlifeProfiles.clear(); this.outdoorEnemyProfiles.clear(); this.rogueEnemyProfiles.clear(); this.enemyAttacks.clear(); this.hives.clear(); this.worldSpeech.clear();
    this.resourceRevisionValue += 1;
    this.cellarExcavationRevisionValue += 1;
  }
  private setPosition(row: PlayerPosition): void {
    const id = identityHex(row.identity);
    const ownRow = this.identity !== null && row.identity.isEqual(this.identity);
    if (ownRow && row.spaceId !== this.ownSpaceId) {
      this.ownSpaceId = row.spaceId;
      this.clearSpaceScopedCaches();
    }
    this.positions.set(id, row);
    this.positionCommits.push(id, row);
    if ((ownRow || this.profiles.get(id) !== undefined) && row.spaceId === this.ownSpaceId) {
      this.visiblePlayers.set(id, row);
    } else this.visiblePlayers.delete(id);
    if (ownRow) {
      for (const player of this.positions) {
        const playerId = identityHex(player.identity);
        const ownPlayer = this.identity !== null && player.identity.isEqual(this.identity);
        if (player.spaceId === this.ownSpaceId && (ownPlayer || this.profiles.get(playerId) !== undefined)) {
          this.visiblePlayers.set(playerId, player);
        } else this.visiblePlayers.delete(playerId);
      }
      if (this.connection !== null) this.subscribeRegion(this.connection, row);
    }
  }
  private setPredictionState(row: PlayerPredictionState): void {
    this.predictionState = row;
    if (row.lastProcessedSequence > this.sequence) this.sequence = row.lastProcessedSequence;
    if (this.idleRefreshPending && row.lastProcessedSequence >= this.lastIdleSequence) {
      this.idleRefreshPending = false;
      this.inputRefreshAge = 0;
    }
    for (const [sequence, started] of this.sentAt) if (sequence <= row.lastProcessedSequence) {
      const sample = performance.now() - started;
      this.rttEmaMs = this.rttEmaMs === 0 ? sample : this.rttEmaMs * 0.8 + sample * 0.2;
      this.sentAt.delete(sequence);
    }
  }
  private setNpc(row: WorldNpc): void {
    this.npcs.set(row.id, row);
    this.npcCommits.push(row.id, row);
  }
  private setProjectile(row: WorldProjectile): void {
    const previous = this.projectiles.get(row.id);
    this.projectiles.set(row.id, row);
    if (previous !== undefined
      && previous.x === row.x && previous.y === row.y
      && previous.state === row.state
      && previous.velocityX === row.velocityX && previous.velocityY === row.velocityY) return;
    const observedTick = this.clock?.authorityTick ?? row.spawnedTick;
    const lastTick = this.lastProjectileAuthorityTicks.get(row.id);
    const authorityTick = lastTick !== undefined && observedTick <= lastTick
      ? lastTick + 1n
      : observedTick;
    this.lastProjectileAuthorityTicks.set(row.id, authorityTick);
    this.projectileCommits.push(row.id, { row, authorityTick });
  }
  private setConnectionNotice(connection: DbConnection, row: ConnectionNotice): void {
    if (row.kind === 'motd' && row.connectionId.isEqual(connection.connectionId)) this.motd = row.body;
  }
  private hydrateGlobals(connection: DbConnection): void {
    this.incoming(connection, () => {
      if (!this.currentConnection(connection)) return;
      for (const row of connection.db.playerPublic.iter()) this.setProfile(row);
      for (const row of connection.db.playerAppearance.iter()) this.appearances.set(identityHex(row.identity), row);
      this.fishingCasts.clear();
      for (const row of connection.db.activeFishingCasts.iter()) this.fishingCasts.set(identityHex(row.identity), row);
      this.clock = [...connection.db.worldClock.iter()][0] ?? null;
      this.environment = [...connection.db.worldEnvironment.iter()][0] ?? null;
      this.wind = [...connection.db.worldWind.iter()][0] ?? null;
      this.worldSeed = [...connection.db.worldSeed.iter()][0] ?? null;
      this.liveMapDocument = connection.db.liveMapDocument.mapId.find(LIVE_ISLAND_MAP_ID);
      this.globalsHydrated = true;
      this.refreshContent(connection);
      this.maybeGameplayReady(connection); this.onChanged();
    });
  }

  private scheduleContentRefresh(connection: DbConnection): void {
    if (!this.currentConnection(connection)) return;
    if (this.contentRefreshQueued) return;
    this.contentRefreshQueued = true;
    queueMicrotask(() => {
      if (!this.currentConnection(connection)) return;
      this.contentRefreshQueued = false;
      this.refreshContent(connection);
      this.maybeGameplayReady(connection); this.onChanged();
    });
  }

  private refreshContent(connection: DbConnection): void {
    const previousRegistry = this.content.state.registry;
    const head = connection.db.contentHead.packId.find('live') as ContentHead | null;
    const rows = [...connection.db.runtimeContentDefinitions.iter()] as RuntimeContentDefinition[];
    const priorWasContentError = this.error === 'content_engine_update_required'
      || this.error === 'content_registry_invalid';
    const state = this.content.update(head, rows);
    if (state.status === 'engine_update_required') this.error = 'content_engine_update_required';
    else if (state.status === 'invalid') this.error = 'content_registry_invalid';
    else if (priorWasContentError) this.error = null;
    if (state.status === 'ready' && state.registry !== previousRegistry) {
      const position = this.ownPosition();
      if (position !== null) this.subscribeRegion(connection, position, true);
    }
  }
  private hydrateCellarExcavations(connection: DbConnection, spaceId: number): void {
    this.cellarExcavations.clear();
    for (const row of connection.db.cellarExcavation.iter()) {
      if (row.spaceId === spaceId) this.cellarExcavations.set(row.id, row);
    }
    this.cellarExcavationRevisionValue += 1;
  }
  private hydrateSelf(connection: DbConnection): void {
    this.predictionState = [...connection.db.ownPlayerPrediction.iter()][0] ?? null;
    for (const row of connection.db.ownInventorySlots.iter()) this.inventorySlots.set(row.slot, row);
    this.knownRecipes.clear(); for (const row of connection.db.ownKnownRecipes.iter()) this.knownRecipes.set(row.recipeId, row);
    const cursor = [...connection.db.ownInventoryCursor.iter()][0];
    this.inventoryCursor = cursor === undefined ? null : {
      itemKind: cursor.itemKind, quantity: cursor.quantity, durability: cursor.durability, lit: cursor.lit,
    };
    this.hearthStashOpen=[...connection.db.ownActiveHearthStash.iter()].some(row=>row.connectionId.toHexString()===connection.connectionId?.toHexString());
    this.villageOrders.clear();for(const row of connection.db.ownVillageOrders.iter())this.villageOrders.set(row.id,row);
    this.hearthStashSlots.clear();for(const row of connection.db.ownHearthStashSlots.iter())this.hearthStashSlots.set(row.slot,row);
    this.activePlaceable = [...connection.db.ownActivePlaceable.iter()][0] ?? null;
    this.activeChest = this.activePlaceable !== null
      && isUnifiedChest(this.content.state.registry, this.activePlaceable)
      ? compatibilityChest(this.activePlaceable) : null;
    this.openChestSlots.clear(); this.openPlaceableSlots.clear();
    for (const row of connection.db.ownOpenPlaceableSlots.iter()) {
      this.openPlaceableSlots.set(row.slot, row);
      if (this.activePlaceable !== null
        && isUnifiedChest(this.content.state.registry, this.activePlaceable)) {
        this.openChestSlots.set(row.slot, compatibilityChestSlot(row));
      }
    }
    for (const row of connection.db.ownChatChannels.iter()) this.chatChannels.set(row.id, row);
    for (const row of connection.db.visibleChatMessages.iter()) this.chatMessages.set(row.id, row);
    this.sessionChatNotices.clear();
    for (const row of connection.db.ownSessionChatNotices.iter()) {
      if (row.recipientConnectionId.isEqual(connection.connectionId)) this.sessionChatNotices.set(row.id, row);
    }
    for (const row of connection.db.visibleWorldSpeech.iter()) this.worldSpeech.set(row.id, row);
    this.motd = null;
    for (const row of connection.db.ownConnectionNotices.iter()) this.setConnectionNotice(connection, row);
    this.survival = [...connection.db.ownSurvival.iter()][0] ?? null;
    this.cookingJob = [...connection.db.ownCookingJob.iter()][0] ?? null;
    this.fishingCast = [...connection.db.ownFishingCast.iter()][0] ?? null;
    this.stats = [...connection.db.ownStats.iter()][0] ?? null;
    this.wallet = [...connection.db.ownWallet.iter()][0] ?? null;
    this.tradeSession = [...connection.db.ownTradeSession.iter()][0] ?? null;
    this.tradeOffers.clear(); for (const row of connection.db.ownTradeOffers.iter()) this.tradeOffers.set(row.id, row);
    this.activeDialogue = [...connection.db.ownActiveDialogue.iter()][0] ?? null;
    const currentHomestead = [...connection.db.ownCurrentHomestead.iter()][0];
    if (currentHomestead !== undefined) this.homesteads.set(currentHomestead.spaceId, currentHomestead);
    this.activeFarmUpgrades.clear(); this.homesteadUpgrades.clear();
    for (const row of connection.db.ownHomesteadUpgrades.iter()) this.homesteadUpgrades.set(row.id, row);
    for (const row of connection.db.activeFarmUpgrades.iter()) this.activeFarmUpgrades.set(row.id, row);
    this.homesteadMembers.clear();
    for (const row of connection.db.ownHomesteadMembers.iter()) this.homesteadMembers.set(row.id, row);
    this.quests.clear(); for (const row of connection.db.ownPlayerQuests.iter()) this.quests.set(row.id, row);
    this.questBaselines.clear(); for (const row of connection.db.ownPlayerQuestBaselines.iter()) this.questBaselines.set(row.id, row);
    this.playerStatistics.clear(); for (const row of connection.db.ownPlayerStatistics.iter()) this.playerStatistics.set(row.id, row);
    this.outdoorRewards.clear(); this.outdoorRewardsRevision++;for(const row of connection.db.ownOutdoorRewards.iter())this.outdoorRewards.set(row.id,row);
    this.combatState=[...connection.db.ownCombatState.iter()][0]??null;
    this.equipmentSkillPriority=[...connection.db.ownEquipmentPreferences.iter()][0]?.skillPriority??[];
    this.skillTracks.clear(); for (const row of connection.db.ownPlayerSkillTracks.iter()) this.skillTracks.set(row.id, row);
    this.activeFarmSkillNodes.clear(); for (const row of connection.db.activeFarmSkillNodes.iter()) this.activeFarmSkillNodes.set(row.id, row);
    this.skillNodes.clear(); for (const row of connection.db.ownPlayerSkillNodes.iter()) this.skillNodes.set(row.id, row);
    this.questWorldItems.clear(); for (const row of connection.db.ownQuestWorldItems.iter()) this.questWorldItems.set(row.id, row);
    this.thought = [...connection.db.ownPlayerThought.iter()][0] ?? null;
    this.effects.clear(); for (const row of connection.db.ownEffects.iter()) this.effects.set(row.id, row);
    this.rogueRun = [...connection.db.ownRogueRun.iter()][0] ?? null;
    this.rogueRoomExits.clear(); for (const row of connection.db.ownRogueRoomExits.iter()) this.rogueRoomExits.set(row.slot, row);
    this.rogueRewardOffers.clear(); for (const row of connection.db.ownRogueRewardOffers.iter()) this.rogueRewardOffers.set(row.slot, row);
    this.rogueRunUpgrades.clear(); for (const row of connection.db.ownRogueRunUpgrades.iter()) this.rogueRunUpgrades.set(row.id, row);
    this.characterProfile = [...connection.db.ownCharacterProfile.iter()][0] ?? null;
    this.membership = [...connection.db.ownMembership.iter()][0] ?? null;
    if (this.identity !== null) { const row = connection.db.playerPosition.identity.find(this.identity); if (row !== null) this.setPosition(row); }
  }
}
