import {
  INPUT_REFRESH_STEPS, REMOTE_SNAPSHOT_CAPACITY,
  SURVIVAL_CHUNK_TILES, SURVIVAL_WORLD_SIZE, TILE_SIZE_FIXED, TILE_SIZE_PIXELS, TOPSIDE_SPACE_ID,
  spaceDefinitionFor,
  instanceSpaceRowFor,
  type CollisionMap, type ItemStack, type MerchantCartLine, type MoveItemRequest, type PlayerState,
} from '@orchard/sim';
import type { Identity } from 'spacetimedb';
import { DbConnection, tables, type SubscriptionHandle } from './generated/index.js';
import { localProfilesEnabled, oidcConfigured, readOidcSession } from '../auth/oidc.js';
import type {
  CellarExcavation, CharacterProfile, ChatChannel, ChatMessage, ConnectionNotice, Homestead, InventorySlot, Membership, PlayerAppearance, PlayerEffect, PlayerPosition, PlayerPublic, PlayerQuest, PlayerQuestBaseline, PlayerSkillNode, PlayerSkillTrack, PlayerStatistic, PlayerStats, PlayerSurvival, PlayerThought, QuestWorldItem, SessionChatNotice,
  SpacePortal, WorldCampfireState, WorldChest, WorldChestSlot, WorldClock, WorldCombatTarget, WorldCrop, WorldEnvironment, WorldHive, WorldItem, WorldMerchant, WorldNpc, WorldPlaceable, WorldPlaceableSlot, WorldProjectile, WorldResource, WorldSeed, WorldSoil, WorldSpeech, WorldWildlifeProfile, WorldWind,
  WorldSurface,
} from './generated/types.js';
import type { WeatherMode, WindDirectionMode } from '@orchard/sim';
import { BoundedKeyedQueue, KeyedStore, type ReadonlyKeyedStore } from './keyed-store.js';
import {
  LatencyInjector, LocalPredictionBuffer, latencyFromSearch,
  inputRefreshDue,
  type InputDirection, type ReconciliationResult,
} from './netcode.js';

const DEFAULT_DATABASE = 'orchard-cellar-world';
const SURVIVAL_CHUNK_COUNT = Math.ceil(SURVIVAL_WORLD_SIZE / SURVIVAL_CHUNK_TILES);
const SURVIVAL_CHUNK_PIXELS = SURVIVAL_CHUNK_TILES * TILE_SIZE_PIXELS;
const RADIUS_SETTLE_MS = 180;
const RTT_SAMPLE_CAPACITY = 256;
const REGION_RANGE_QUERIES = 19;
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
): number {
  void bounds;
  return REGION_RANGE_QUERIES + (spaceId === TOPSIDE_SPACE_ID ? 1 : 2);
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

export interface OverworldView {
  readonly connected: boolean; readonly error: string | null; readonly identityHex: string | null;
  readonly region: readonly [number, number];
  readonly profiles: ReadonlyKeyedStore<string, PlayerPublic>;
  readonly appearances: ReadonlyKeyedStore<string, PlayerAppearance>;
  readonly players: ReadonlyKeyedStore<string, PlayerPosition>;
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
  readonly hives: ReadonlyKeyedStore<bigint, WorldHive>;
  readonly portals: ReadonlyKeyedStore<number, SpacePortal>;
  readonly homesteads: ReadonlyKeyedStore<number, Homestead>;
  readonly cellarExcavations: ReadonlyKeyedStore<string, CellarExcavation>;
  readonly surfaces: ReadonlyKeyedStore<bigint, WorldSurface>;
  readonly inventorySlots: ReadonlyKeyedStore<number, InventorySlot>;
  readonly inventoryCursor: ItemStack | null;
  readonly effects: ReadonlyKeyedStore<bigint, PlayerEffect>;
  readonly openChestSlots: ReadonlyKeyedStore<number, WorldChestSlot>;
  readonly openPlaceableSlots: ReadonlyKeyedStore<number, WorldPlaceableSlot>;
  readonly chatChannels: ReadonlyKeyedStore<bigint, ChatChannel>;
  readonly chatMessages: ReadonlyKeyedStore<bigint, ChatMessage>;
  readonly sessionChatNotices: ReadonlyKeyedStore<bigint, SessionChatNotice>;
  readonly worldSpeech: ReadonlyKeyedStore<bigint, WorldSpeech>;
  readonly motd: string | null;
  readonly characterProfile: CharacterProfile | null; readonly membership: Membership | null; readonly survival: PlayerSurvival | null;
  readonly stats: PlayerStats | null;
  readonly activeChest: WorldChest | null;
  readonly activePlaceable: WorldPlaceable | null;
  readonly activeDialogue: ActiveDialogue | null; readonly wallet: PlayerWallet | null;
  readonly tradeSession: PlayerTradeSession | null;
  readonly tradeOffers: ReadonlyKeyedStore<string, PlayerTradeOffer>;
  readonly quests: ReadonlyKeyedStore<string, PlayerQuest>;
  readonly questBaselines: ReadonlyKeyedStore<string, PlayerQuestBaseline>;
  readonly playerStatistics: ReadonlyKeyedStore<string, PlayerStatistic>;
  readonly skillTracks: ReadonlyKeyedStore<string, PlayerSkillTrack>;
  readonly skillNodes: ReadonlyKeyedStore<string, PlayerSkillNode>;
  readonly questWorldItems: ReadonlyKeyedStore<string, QuestWorldItem>;
  readonly thought: PlayerThought | null;
  readonly worldSeed: WorldSeed | null; readonly clock: WorldClock | null; readonly environment: WorldEnvironment | null; readonly wind: WorldWind | null;
}

export interface OverworldSnapshot {
  readonly connected: boolean; readonly error: string | null; readonly identityHex: string | null;
  readonly region: readonly [number, number]; readonly profiles: readonly PlayerPublic[];
  readonly appearances: readonly PlayerAppearance[];
  readonly players: readonly PlayerPosition[];
  readonly resources: readonly WorldResource[]; readonly soil: readonly WorldSoil[]; readonly crops: readonly WorldCrop[];
  readonly worldItems: readonly WorldItem[]; readonly projectiles: readonly WorldProjectile[]; readonly combatTargets: readonly WorldCombatTarget[]; readonly chests: readonly WorldChest[]; readonly placeables: readonly WorldPlaceable[]; readonly campfires?: readonly WorldCampfireState[]; readonly npcs: readonly WorldNpc[]; readonly merchants: readonly WorldMerchant[];
  readonly wildlifeProfiles: readonly WorldWildlifeProfile[]; readonly hives: readonly WorldHive[];
  readonly portals: readonly SpacePortal[];
  readonly homesteads: readonly Homestead[];
  readonly cellarExcavations: readonly CellarExcavation[];
  readonly surfaces: readonly WorldSurface[];
  readonly inventorySlots: readonly InventorySlot[]; readonly openChestSlots: readonly WorldChestSlot[]; readonly openPlaceableSlots: readonly WorldPlaceableSlot[]; readonly chatChannels: readonly ChatChannel[];
  readonly inventoryCursor: ItemStack | null;
  readonly effects: readonly PlayerEffect[];
  readonly chatMessages: readonly ChatMessage[]; readonly sessionChatNotices: readonly SessionChatNotice[]; readonly worldSpeech: readonly WorldSpeech[];
  readonly motd: string | null; readonly characterProfile: CharacterProfile | null;
  readonly membership: Membership | null; readonly survival: PlayerSurvival | null; readonly stats: PlayerStats | null; readonly activeChest: WorldChest | null; readonly activePlaceable: WorldPlaceable | null;
  readonly activeDialogue: ActiveDialogue | null; readonly wallet: PlayerWallet | null;
  readonly tradeSession: PlayerTradeSession | null; readonly tradeOffers: readonly PlayerTradeOffer[];
  readonly quests: readonly PlayerQuest[]; readonly questBaselines: readonly PlayerQuestBaseline[];
  readonly playerStatistics: readonly PlayerStatistic[]; readonly skillTracks: readonly PlayerSkillTrack[];
  readonly skillNodes: readonly PlayerSkillNode[];
  readonly questWorldItems: readonly QuestWorldItem[]; readonly thought: PlayerThought | null;
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
  readonly targetId: bigint;
  readonly amountCenti: number;
  readonly critical: boolean;
  readonly x: number;
  readonly y: number;
}

export type NetworkDirection = InputDirection;
function identityHex(identity: Identity): string { return identity.toHexString(); }

export class OverworldConnection {
  private connection: DbConnection | null = null;
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
  private radiusTimer: number | null = null;
  private pendingRegion: string | null = null;
  private timeSubscription: SubscriptionHandle | null = null;
  private readonly timeRecoverySubscriptions: SubscriptionHandle[] = [];
  private globalSubscription: SubscriptionHandle | null = null;
  private selfSubscription: SubscriptionHandle | null = null;
  private regionSubscription: SubscriptionHandle | null = null;
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
  private readonly latency: LatencyInjector;
  private readonly profiles = new KeyedStore<string, PlayerPublic>();
  private readonly appearances = new KeyedStore<string, PlayerAppearance>();
  private readonly positions = new KeyedStore<string, PlayerPosition>();
  private readonly visiblePlayers = new KeyedStore<string, PlayerPosition>();
  private readonly resources = new KeyedStore<bigint, WorldResource>();
  private readonly soil = new KeyedStore<string, WorldSoil>();
  private readonly crops = new KeyedStore<string, WorldCrop>();
  private readonly worldItems = new KeyedStore<bigint, WorldItem>();
  private readonly projectiles = new KeyedStore<bigint, WorldProjectile>();
  private readonly combatTargets = new KeyedStore<bigint, WorldCombatTarget>();
  private readonly combatTextCommits: CombatTextCommit[] = [];
  private readonly chests = new KeyedStore<bigint, WorldChest>();
  private readonly placeables = new KeyedStore<bigint, WorldPlaceable>();
  private readonly campfires = new KeyedStore<bigint, WorldCampfireState>();
  private readonly npcs = new KeyedStore<bigint, WorldNpc>();
  private readonly merchants = new KeyedStore<bigint, WorldMerchant>();
  private readonly wildlifeProfiles = new KeyedStore<bigint, WorldWildlifeProfile>();
  private readonly hives = new KeyedStore<bigint, WorldHive>();
  private readonly portals = new KeyedStore<number, SpacePortal>();
  private readonly homesteads = new KeyedStore<number, Homestead>();
  private readonly cellarExcavations = new KeyedStore<string, CellarExcavation>();
  private readonly surfaces = new KeyedStore<bigint, WorldSurface>();
  private readonly inventorySlots = new KeyedStore<number, InventorySlot>();
  private inventoryCursor: ItemStack | null = null;
  private readonly effects = new KeyedStore<bigint, PlayerEffect>();
  private readonly openChestSlots = new KeyedStore<number, WorldChestSlot>();
  private readonly openPlaceableSlots = new KeyedStore<number, WorldPlaceableSlot>();
  private readonly chatChannels = new KeyedStore<bigint, ChatChannel>();
  private readonly chatMessages = new KeyedStore<bigint, ChatMessage>();
  private readonly sessionChatNotices = new KeyedStore<bigint, SessionChatNotice>();
  private readonly worldSpeech = new KeyedStore<bigint, WorldSpeech>();
  private motd: string | null = null;
  private characterProfile: CharacterProfile | null = null;
  private membership: Membership | null = null;
  private survival: PlayerSurvival | null = null;
  private stats: PlayerStats | null = null;
  private activeChest: WorldChest | null = null;
  private activePlaceable: WorldPlaceable | null = null;
  private activeDialogue: ActiveDialogue | null = null;
  private readonly quests = new KeyedStore<string, PlayerQuest>();
  private readonly questBaselines = new KeyedStore<string, PlayerQuestBaseline>();
  private readonly playerStatistics = new KeyedStore<string, PlayerStatistic>();
  private readonly skillTracks = new KeyedStore<string, PlayerSkillTrack>();
  private readonly skillNodes = new KeyedStore<string, PlayerSkillNode>();
  private readonly questWorldItems = new KeyedStore<string, QuestWorldItem>();
  private thought: PlayerThought | null = null;
  private wallet: PlayerWallet | null = null;
  private tradeSession: PlayerTradeSession | null = null;
  private readonly tradeOffers = new KeyedStore<string, PlayerTradeOffer>();
  private worldSeed: WorldSeed | null = null;
  private clock: WorldClock | null = null;
  private environment: WorldEnvironment | null = null;
  private wind: WorldWind | null = null;
  private cellarExcavationRevisionValue = 0;

  constructor(
    private readonly slot: string,
    private readonly onChanged: () => void,
    host = import.meta.env['VITE_SPACETIMEDB_URI'] ?? location.origin,
    database = import.meta.env['VITE_SPACETIMEDB_DATABASE'] ?? DEFAULT_DATABASE,
    latency = latencyFromSearch(location.search),
  ) {
    this.latency = latency;
    const tokenKey = `orchard:world:${host}:${database}:${slot}:token`;
    const oidcSession = readOidcSession();
    if (oidcConfigured && oidcSession === null) throw new Error('authentication_required');
    if (!oidcConfigured && !localProfilesEnabled) throw new Error('account_login_not_configured');
    const localToken = localProfilesEnabled ? localStorage.getItem(tokenKey) ?? undefined : undefined;
    const savedToken = oidcSession?.idToken ?? localToken;
    this.connection = DbConnection.builder().withUri(host).withDatabaseName(database).withToken(savedToken)
      .onConnect((connection, identity, token) => {
        if (localProfilesEnabled && oidcSession === null && savedToken === undefined) localStorage.setItem(tokenKey, token);
        this.connected = true; this.error = null; this.identity = identity;
        this.bindTableEvents(connection); this.subscribeTimeState(connection, identity);
        if (localProfilesEnabled && oidcSession === null) {
          void this.call(() => connection.reducers.setDisplayName({ displayName: this.displayName() })).catch(() => undefined);
        }
        this.heartbeatTimer = window.setInterval(() => {
          const active = this.activitySinceHeartbeat;
          this.activitySinceHeartbeat = false;
          void this.call(() => connection.reducers.heartbeat({ active })).catch(() => {
            if (active) this.activitySinceHeartbeat = true;
          });
        }, 10_000);
        this.timeCacheWatchdogTimer = window.setInterval(() => {
          if (!this.hasTimeState(connection)) this.scheduleTimeStateRecovery(connection, identity);
        }, 500);
        this.onChanged();
      })
      .onConnectError((_context, error) => { this.error = error.message; this.onChanged(); })
      .onDisconnect((_context, error) => {
        if (this.heartbeatTimer !== null) window.clearInterval(this.heartbeatTimer);
        if (this.timeCacheWatchdogTimer !== null) window.clearInterval(this.timeCacheWatchdogTimer);
        if (this.timeRecoveryTimer !== null) window.clearTimeout(this.timeRecoveryTimer);
        this.heartbeatTimer = null; this.timeCacheWatchdogTimer = null; this.timeRecoveryTimer = null;
        this.inputReady = false; this.connected = false;
        this.error = error?.message ?? 'disconnected'; this.prediction.reset(); this.sentAt.clear();
        this.sessionChatNotices.clear(); this.inventoryCursor = null;
        this.tradeSession = null; this.tradeOffers.clear();
        this.timeSubscription = null; this.timeRecoverySubscriptions.length = 0;
        this.globalSubscription = null; this.selfSubscription = null; this.regionSubscription = null;
        this.timeSubscriptionPending = false; this.globalBootstrapComplete = false;
        this.globalSubscriptionQueryCount = 0; this.selfSubscriptionQueryCount = 0;
        this.activeRegionQueryCount = 0; this.pendingRegionQueryCount = 0; this.onChanged();
      }).build();
  }

  view(): OverworldView {
    return { connected: this.connected, error: this.error,
      identityHex: this.identity === null ? null : identityHex(this.identity), region: this.region,
      profiles: this.profiles, appearances: this.appearances, players: this.visiblePlayers,
      resources: this.resources, soil: this.soil, crops: this.crops, worldItems: this.worldItems, projectiles: this.projectiles, combatTargets: this.combatTargets, chests: this.chests, placeables: this.placeables, campfires: this.campfires, npcs: this.npcs, merchants: this.merchants,
      wildlifeProfiles: this.wildlifeProfiles, hives: this.hives, portals: this.portals, homesteads: this.homesteads, cellarExcavations: this.cellarExcavations, surfaces: this.surfaces, inventorySlots: this.inventorySlots, inventoryCursor: this.inventoryCursor, effects: this.effects,
      openChestSlots: this.openChestSlots,
      openPlaceableSlots: this.openPlaceableSlots,
      chatChannels: this.chatChannels, chatMessages: this.chatMessages, sessionChatNotices: this.sessionChatNotices, worldSpeech: this.worldSpeech, motd: this.motd,
      characterProfile: this.characterProfile, membership: this.membership, survival: this.survival, stats: this.stats, activeChest: this.activeChest, activePlaceable: this.activePlaceable,
      activeDialogue: this.activeDialogue, wallet: this.wallet,
      tradeSession: this.tradeSession, tradeOffers: this.tradeOffers,
      quests: this.quests, questBaselines: this.questBaselines, playerStatistics: this.playerStatistics,
      skillTracks: this.skillTracks, skillNodes: this.skillNodes, questWorldItems: this.questWorldItems, thought: this.thought,
      worldSeed: this.worldSeed,
      clock: this.clock, environment: this.environment, wind: this.wind };
  }

  /** Materialized compatibility view for tests and browser diagnostics only. */
  snapshot(): OverworldSnapshot {
    const view = this.view();
    return { ...view, profiles: this.profiles.toArray(), appearances: this.appearances.toArray(),
      players: this.visiblePlayers.toArray(), resources: this.resources.toArray(), soil: this.soil.toArray(), crops: this.crops.toArray(), worldItems: this.worldItems.toArray(), projectiles: this.projectiles.toArray(), combatTargets: this.combatTargets.toArray(), chests: this.chests.toArray(), placeables: this.placeables.toArray(), campfires: this.campfires.toArray(), npcs: this.npcs.toArray(), merchants: this.merchants.toArray(),
      wildlifeProfiles: this.wildlifeProfiles.toArray(), hives: this.hives.toArray(), portals: this.portals.toArray(), homesteads: this.homesteads.toArray(), cellarExcavations: this.cellarExcavations.toArray(), surfaces: this.surfaces.toArray(),
      inventorySlots: this.inventorySlots.toArray().sort((left, right) => left.slot - right.slot),
      effects: this.effects.toArray().sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0),
      openChestSlots: this.openChestSlots.toArray().sort((left, right) => left.slot - right.slot),
      openPlaceableSlots: this.openPlaceableSlots.toArray().sort((left, right) => left.slot - right.slot),
      chatChannels: this.chatChannels.toArray(),
      chatMessages: this.chatMessages.toArray().sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0),
      sessionChatNotices: this.sessionChatNotices.toArray().sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0),
      worldSpeech: this.worldSpeech.toArray().sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0),
      quests: this.quests.toArray(), questBaselines: this.questBaselines.toArray(),
      playerStatistics: this.playerStatistics.toArray(), skillTracks: this.skillTracks.toArray(), skillNodes: this.skillNodes.toArray(),
      questWorldItems: this.questWorldItems.toArray(), thought: this.thought,
      tradeOffers: this.tradeOffers.toArray().sort((left, right) => left.slot - right.slot) };
  }

  ownPosition(): PlayerPosition | null { return this.identity === null ? null : this.positions.get(identityHex(this.identity)) ?? null; }
  get resourceRevision(): number { return this.resourceRevisionValue; }
  get presenceRevision(): number { return this.presenceRevisionValue; }
  get cellarExcavationRevision(): number { return this.cellarExcavationRevisionValue; }

  noteUserActivity(): void {
    this.activitySinceHeartbeat = true;
  }

  setDirection(direction: NetworkDirection): void {
    this.setMovementIntent(direction, false);
  }
  setMovementIntent(direction: NetworkDirection, sprinting: boolean): void {
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
    const row = this.ownPosition(); if (row === null) return null;
    const key = `${row.authorityTick}:${row.lastProcessedSequence}:${row.x}:${row.y}`;
    if (key === this.lastReconciledRowKey) return null;
    this.lastReconciledRowKey = key;
    const result = this.prediction.reconcile(predicted, authoritative, row.lastProcessedSequence, collision);
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
        merchant: this.merchants.size,
        inventory: this.inventorySlots.size,
        effects: this.effects.size,
        chat: this.chatMessages.size,
        chatNotices: this.sessionChatNotices.size,
        speech: this.worldSpeech.size,
      } };
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
  useHands(tileX: number, tileY: number): Promise<void> {
    return this.reducer((connection) => connection.reducers.useHands({ tileX, tileY }));
  }
  interactPlaceable(): Promise<void> { return this.reducer((connection) => connection.reducers.interactPlaceable({})); }
  toggleCampfire(targetKind: 'landmark' | 'placeable', targetId: bigint): Promise<void> {
    return this.reducer((connection) => connection.reducers.toggleCampfire({ targetKind, targetId }));
  }
  closePlaceable(): Promise<void> { return this.reducer((connection) => connection.reducers.closePlaceable({})); }
  interactChest(): Promise<void> { return this.reducer((c) => c.reducers.interactChest({})); }
  closeChest(): Promise<void> { return this.reducer((c) => c.reducers.closeChest({})); }
  harvestResource(resourceId: bigint): Promise<void> { return this.reducer((c) => c.reducers.harvestResource({ resourceId })); }
  attackCombatTarget(targetId: bigint): Promise<void> {
    return this.reducer((connection) => connection.reducers.attackCombatTarget({ targetId }));
  }
  harvestChest(chestId: bigint): Promise<void> { return this.reducer((connection) => connection.reducers.harvestChest({ chestId })); }
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
  useFarmTool(tileX: number, tileY: number): Promise<void> {
    return this.reducer((connection) => connection.reducers.useFarmTool({ tileX, tileY }));
  }
  restoreFarmTile(tileX: number, tileY: number): Promise<void> {
    return this.reducer((connection) => connection.reducers.restoreFarmTile({ tileX, tileY }));
  }
  useCropTile(tileX: number, tileY: number): Promise<void> {
    return this.reducer((connection) => connection.reducers.useCropTile({ tileX, tileY }));
  }
  repairSelectedTool(): Promise<void> {
    return this.reducer((connection) => connection.reducers.repairSelectedTool({}));
  }
  consumeOrchardTea(): Promise<void> {
    return this.reducer((connection) => connection.reducers.consumeOrchardTea({}));
  }
  fireBow(aimX: number, aimY: number, chargeMs: number): Promise<void> {
    return this.reducer((connection) => connection.reducers.fireBow({ aimX, aimY, chargeMs }));
  }
  beginBowCharge(): Promise<void> {
    return this.reducer((connection) => connection.reducers.beginBowCharge({}));
  }
  cancelBowCharge(chargeMs: number): Promise<void> {
    return this.reducer((connection) => connection.reducers.cancelBowCharge({ chargeMs }));
  }
  dropSelected(): Promise<void> { return this.reducer((c) => c.reducers.dropSelected({})); }
  pickupWorldItem(itemId: bigint): Promise<void> { return this.reducer((c) => c.reducers.pickupWorldItem({ itemId })); }
  pickupEmbeddedArrow(projectileId: bigint): Promise<void> {
    return this.reducer((connection) => connection.reducers.pickupEmbeddedArrow({ projectileId }));
  }
  toggleHeldLantern(): Promise<void> { return this.reducer((c) => c.reducers.toggleHeldLantern({})); }
  toggleWorldLantern(itemId: bigint): Promise<void> {
    return this.reducer((connection) => connection.reducers.toggleWorldLantern({ itemId }));
  }
  gatherWorldResource(resourceId: bigint): Promise<void> {
    return this.reducer((connection) => connection.reducers.gatherWorldResource({ resourceId }));
  }
  interactHorse(horseId: bigint): Promise<void> { return this.reducer((c) => c.reducers.interactHorse({ horseId })); }
  jumpHorse(): Promise<void> { return this.reducer((c) => c.reducers.jumpHorse({})); }
  sendChatMessage(channelId: bigint, body: string): Promise<void> {
    return this.reducer((connection) => connection.reducers.sendChatMessage({ channelId, body }));
  }
  requestLastConnections(): Promise<void> {
    return this.reducer((connection) => connection.reducers.requestLastConnections({}));
  }
  requestBalanceTop(): Promise<void> {
    return this.reducer((connection) => connection.reducers.requestBalanceTop({}));
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
  purchaseSkillNode(nodeId: string): Promise<void> {
    return this.reducer((connection) => connection.reducers.purchaseSkillNode({ nodeId }));
  }
  resetSkillTree(track: string): Promise<void> {
    return this.reducer((connection) => connection.reducers.resetSkillTree({ track }));
  }
  grantDebugSkillPoints(track: string, points: number): Promise<void> {
    return this.reducer((connection) => connection.reducers.grantDebugSkillPoints({ track, points }));
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
  adminTeleport(destination: string): Promise<void> {
    return this.reducer((connection) => connection.reducers.adminTeleport({ destination }));
  }
  resetMyQuestProgress(): Promise<void> {
    return this.reducer((connection) => connection.reducers.resetMyQuestProgress({}));
  }
  adjustDebugBackpackSlots(increase: boolean): Promise<void> {
    return this.reducer((connection) => connection.reducers.adjustDebugBackpackSlots({ increase }));
  }
  digCellarTile(tileX: number, tileY: number): Promise<void> {
    return this.reducer((connection) => connection.reducers.digCellarTile({ tileX, tileY }));
  }
  usePortal(portalId: number): Promise<void> {
    return this.reducer((connection) => connection.reducers.usePortal({ portalId }));
  }
  debugUsePortal(): Promise<void> {
    return this.reducer((connection) => connection.reducers.debugUsePortal({}));
  }
  private reducer(call: (connection: DbConnection) => Promise<unknown>): Promise<void> {
    const connection = this.connection;
    if (!this.connected || connection === null) return Promise.reject(new Error('not_connected'));
    return this.call(() => call(connection)).then(() => undefined);
  }
  private call<T>(call: () => Promise<T>): Promise<T> { return this.latency.outgoing(call); }
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
    void this.call(() => connection.reducers.setInput({
      direction: command.direction,
      sequence: command.sequence,
      clientTick: command.clientTick,
      sprinting: command.sprinting,
    }))
      .then(() => { this.persistentInputError = null; })
      .catch((error: unknown) => {
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
    if (!this.connected || this.timeSubscriptionPending || this.timeRecoveryTimer !== null) return;
    this.timeRecoveryTimer = window.setTimeout(() => {
      this.timeRecoveryTimer = null;
      if (!this.hasTimeState(connection)) this.subscribeTimeState(connection, identity, true);
    }, 50);
  }

  private subscribeTimeState(connection: DbConnection, identity: Identity, recovery = false): void {
    if (this.timeSubscriptionPending) return;
    this.timeSubscriptionPending = true;
    const handle = connection.subscriptionBuilder().onApplied(() => {
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
    }).onError(() => {
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
    const queries = [onlineProfiles, onlineAppearances, tables.worldWind, tables.worldSeed];
    this.globalSubscriptionQueryCount = queries.length + 2;
    this.globalSubscription = connection.subscriptionBuilder().onApplied(() => {
      this.hydrateGlobals(connection);
      this.subscribeSelf(connection, identity);
    }).onError(() => {
      this.error = 'global_subscription_failed'; this.onChanged();
    }).subscribe(queries);
  }
  private subscribeSelf(connection: DbConnection, identity: Identity): void {
    const queries = [
      tables.playerPosition.where((row) => row.identity.eq(identity)),
      tables.ownSurvival,
      tables.ownStats,
      tables.ownWallet,
      tables.ownTradeSession,
      tables.ownTradeOffers,
      tables.ownEffects,
      tables.ownInventorySlots,
      tables.ownInventoryCursor,
      tables.ownActiveChest,
      tables.ownOpenChestSlots,
      tables.ownActivePlaceable,
      tables.ownOpenPlaceableSlots,
      tables.ownActiveDialogue,
      tables.ownPlayerQuests,
      tables.ownPlayerQuestBaselines,
      tables.ownPlayerStatistics,
      tables.ownPlayerSkillTracks,
      tables.ownPlayerSkillNodes,
      tables.ownQuestWorldItems,
      tables.ownPlayerThought,
      tables.ownCharacterProfile,
      tables.ownMembership,
      tables.ownConnectionNotices,
      tables.ownSessionChatNotices,
      tables.ownChatChannels,
      tables.visibleChatMessages,
      tables.visibleWorldSpeech,
    ];
    this.selfSubscriptionQueryCount = queries.length;
    this.selfSubscription = connection.subscriptionBuilder().onApplied(() => this.latency.incoming(() => {
      this.hydrateSelf(connection);
      const row = connection.db.playerPosition.identity.find(identity);
      if (row === null) { this.error = 'self_position_missing'; this.onChanged(); return; }
      this.sequence = row.lastProcessedSequence > this.sequence ? row.lastProcessedSequence : this.sequence;
      this.prediction.reset(row.lastProcessedSequence); this.inputReady = true;
      this.subscribeRegion(connection, row); this.sendDesiredDirection(); this.onChanged();
    })).onError(() => { this.error = 'self_subscription_failed'; this.onChanged(); })
      .subscribe(queries);
  }
  private subscribeRegion(connection: DbConnection, position: PlayerPosition, force = false): void {
    const chunkX = position.chunkX; const chunkY = position.chunkY;
    const spaceId = position.spaceId;
    const centerTiles = [
      Math.floor(position.x / TILE_SIZE_FIXED),
      Math.floor(position.y / TILE_SIZE_FIXED),
    ] as const;
    const radius = this.viewRadius; const regionKey = `${spaceId}:${chunkX},${chunkY},${radius.x},${radius.y}`;
    const activeRegionKey = `${this.subscribedSpaceId}:${this.region[0]},${this.region[1]},${this.subscribedRadius.x},${this.subscribedRadius.y}`;
    if (this.pendingRegion !== null || (activeRegionKey === regionKey && this.regionSubscription !== null)) return;
    if (!force && this.regionSubscription !== null
      && !outsideRegionCenterDeadband(this.subscribedCenterTiles, centerTiles[0], centerTiles[1])) return;
    this.pendingRegion = regionKey;
    const definition = spaceDefinitionFor(spaceId, instanceSpaceRowFor(spaceId, this.homesteads));
    const bounds = subscriptionChunkBounds(chunkX, chunkY, radius, definition?.sizeTiles ?? SURVIVAL_WORLD_SIZE);
    const positions = tables.playerPosition
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
    const chests = tables.worldChest
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
    const hives = tables.worldHive
      .where((row) => row.spaceId.eq(spaceId))
      .where((row) => row.chunkX.gte(bounds.minX)).where((row) => row.chunkX.lte(bounds.maxX))
      .where((row) => row.chunkY.gte(bounds.minY)).where((row) => row.chunkY.lte(bounds.maxY));
    const surfaces = tables.worldSurface
      .where((row) => row.spaceId.eq(spaceId))
      .where((row) => row.chunkX.gte(bounds.minX)).where((row) => row.chunkX.lte(bounds.maxX))
      .where((row) => row.chunkY.gte(bounds.minY)).where((row) => row.chunkY.lte(bounds.maxY));
    const cellarExcavations = tables.cellarExcavation
      .where((row) => row.spaceId.eq(spaceId))
      .where((row) => row.chunkX.gte(bounds.minX)).where((row) => row.chunkX.lte(bounds.maxX))
      .where((row) => row.chunkY.gte(bounds.minY)).where((row) => row.chunkY.lte(bounds.maxY));
    const regionalProfiles = positions.rightSemijoin(
      tables.playerPublic,
      (regionalPosition, profile) => regionalPosition.identity.eq(profile.identity),
    );
    const regionalAppearances = positions.rightSemijoin(
      tables.playerAppearance,
      (regionalPosition, appearance) => regionalPosition.identity.eq(appearance.identity),
    );
    const merchants = npcs.rightSemijoin(
      tables.worldMerchant,
      (regionalNpc, merchant) => regionalNpc.id.eq(merchant.npcId),
    );
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
    const activeHomestead = tables.homestead.where((row) => row.spaceId.eq(spaceId));
    const activeResidence = tables.homestead.where((row) => row.residenceSpaceId.eq(spaceId));
    const homesteadQueries = spaceId === TOPSIDE_SPACE_ID
      ? [overworldHomesteads]
      : [activeHomestead, activeResidence];
    const queryCount = regionSubscriptionQueryCount(bounds, spaceId);
    this.pendingRegionQueryCount = queryCount;
    const previous = this.regionSubscription;
    this.regionSubscription = connection.subscriptionBuilder().onApplied(() => this.latency.incoming(() => {
      this.region = [chunkX, chunkY]; this.subscribedRadius = radius; this.subscribedSpaceId = spaceId;
      this.subscribedCenterTiles = centerTiles; this.pendingRegion = null;
      if (previous?.isActive()) previous.unsubscribe();
      this.activeRegionQueryCount = queryCount; this.pendingRegionQueryCount = 0;
      this.handoverCount += 1; this.resourceRevisionValue += 1; this.onChanged();
      const current = this.ownPosition();
      if (current !== null && current.spaceId !== this.subscribedSpaceId) this.subscribeRegion(connection, current, true);
    })).onError(() => {
      this.pendingRegion = null; this.pendingRegionQueryCount = 0;
      this.error = 'region_subscription_failed'; this.onChanged();
    }).subscribe([
      positions, regionalProfiles, regionalAppearances,
      resources, soil, crops, worldItems, projectiles, combatTargets, chests, placeables,
      npcs, merchants, wildlifeProfiles, hives, surfaces, cellarExcavations,
      portals, campfires, ...homesteadQueries,
    ]);
  }

  private bindTableEvents(connection: DbConnection): void {
    const incoming = (eventId: string, apply: () => void): void => {
      this.latency.incomingGrouped(eventId, () => { apply(); this.onChanged(); });
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
    connection.db.worldClock.onInsert((context, row) => incoming(context.event.id, () => { this.clock = row; }));
    connection.db.worldClock.onUpdate((context, _old, row) => incoming(context.event.id, () => { this.clock = row; }));
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
    connection.db.homestead.onDelete((context, row) => resource(context.event.id, () => this.homesteads.delete(row.spaceId)));
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
    connection.db.worldMerchant.onInsert((context, row) => incoming(context.event.id, () => this.merchants.set(row.npcId, row)));
    connection.db.worldMerchant.onUpdate((context, _old, row) => incoming(context.event.id, () => this.merchants.set(row.npcId, row)));
    connection.db.worldMerchant.onDelete((context, row) => incoming(context.event.id, () => this.merchants.delete(row.npcId)));
    connection.db.worldHive.onInsert((context, row) => incoming(context.event.id, () => this.hives.set(row.id, row)));
    connection.db.worldHive.onUpdate((context, _old, row) => incoming(context.event.id, () => this.hives.set(row.id, row)));
    connection.db.worldHive.onDelete((context, row) => incoming(context.event.id, () => this.hives.delete(row.id)));
    connection.db.worldSeed.onInsert((context, row) => incoming(context.event.id, () => { this.worldSeed = row; }));
    connection.db.worldSeed.onUpdate((context, _old, row) => incoming(context.event.id, () => { this.worldSeed = row; }));
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
    connection.db.worldChest.onInsert((context, row) => resource(context.event.id, () => this.chests.set(row.id, row)));
    connection.db.worldChest.onUpdate((context, _old, row) => resource(context.event.id, () => this.chests.set(row.id, row)));
    connection.db.worldChest.onDelete((context, row) => resource(context.event.id, () => this.chests.delete(row.id)));
    connection.db.worldPlaceable.onInsert((context, row) => resource(context.event.id, () => this.placeables.set(row.id, row)));
    connection.db.worldPlaceable.onUpdate((context, _old, row) => resource(context.event.id, () => this.placeables.set(row.id, row)));
    connection.db.worldPlaceable.onDelete((context, row) => resource(context.event.id, () => this.placeables.delete(row.id)));
    connection.db.worldNpc.onInsert((context, row) => incoming(context.event.id, () => this.setNpc(row)));
    connection.db.worldNpc.onUpdate((context, _old, row) => incoming(context.event.id, () => this.setNpc(row)));
    connection.db.worldNpc.onDelete((context, row) => incoming(context.event.id, () => {
      this.npcs.delete(row.id); this.deletedNpcIds.add(row.id);
    }));
    connection.db.ownSurvival.onInsert((context, row) => incoming(context.event.id, () => { this.survival = row; }));
    connection.db.ownSurvival.onUpdate((context, _old, row) => incoming(context.event.id, () => { this.survival = row; }));
    connection.db.ownSurvival.onDelete((context) => incoming(context.event.id, () => { this.survival = null; }));
    connection.db.ownStats.onInsert((context, row) => incoming(context.event.id, () => { this.stats = row; }));
    connection.db.ownStats.onUpdate((context, _old, row) => incoming(context.event.id, () => { this.stats = row; }));
    connection.db.ownStats.onDelete((context) => incoming(context.event.id, () => { this.stats = null; }));
    connection.db.ownWallet.onInsert((context, row) => incoming(context.event.id, () => { this.wallet = row; }));
    connection.db.ownWallet.onUpdate((context, _old, row) => incoming(context.event.id, () => { this.wallet = row; }));
    connection.db.ownWallet.onDelete((context) => incoming(context.event.id, () => { this.wallet = null; }));
    connection.db.ownTradeSession.onInsert((context, row) => incoming(context.event.id, () => { this.tradeSession = row; }));
    connection.db.ownTradeSession.onUpdate((context, _old, row) => incoming(context.event.id, () => { this.tradeSession = row; }));
    connection.db.ownTradeSession.onDelete((context) => incoming(context.event.id, () => { this.tradeSession = null; this.tradeOffers.clear(); }));
    connection.db.ownTradeOffers.onInsert((context, row) => incoming(context.event.id, () => this.tradeOffers.set(row.id, row)));
    connection.db.ownTradeOffers.onUpdate((context, _old, row) => incoming(context.event.id, () => this.tradeOffers.set(row.id, row)));
    connection.db.ownTradeOffers.onDelete((context, row) => incoming(context.event.id, () => this.tradeOffers.delete(row.id)));
    connection.db.ownEffects.onInsert((context, row) => incoming(context.event.id, () => this.effects.set(row.id, row)));
    connection.db.ownEffects.onUpdate((context, _old, row) => incoming(context.event.id, () => this.effects.set(row.id, row)));
    connection.db.ownEffects.onDelete((context, row) => incoming(context.event.id, () => this.effects.delete(row.id)));
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
    connection.db.ownInventoryCursor.onInsert((context, row) => incoming(context.event.id, () => {
      this.inventoryCursor = { itemKind: row.itemKind, quantity: row.quantity, durability: row.durability, lit: row.lit };
    }));
    connection.db.ownInventoryCursor.onUpdate((context, _old, row) => incoming(context.event.id, () => {
      this.inventoryCursor = { itemKind: row.itemKind, quantity: row.quantity, durability: row.durability, lit: row.lit };
    }));
    connection.db.ownInventoryCursor.onDelete((context) => incoming(context.event.id, () => { this.inventoryCursor = null; }));
    connection.db.ownActiveChest.onInsert((context, row) => incoming(context.event.id, () => { this.activeChest = row; }));
    connection.db.ownActiveChest.onUpdate((context, _old, row) => incoming(context.event.id, () => { this.activeChest = row; }));
    connection.db.ownActiveChest.onDelete((context) => incoming(context.event.id, () => { this.activeChest = null; this.openChestSlots.clear(); }));
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
    connection.db.ownPlayerSkillTracks.onInsert((context, row) => incoming(context.event.id, () => this.skillTracks.set(row.id, row)));
    connection.db.ownPlayerSkillTracks.onUpdate((context, _old, row) => incoming(context.event.id, () => this.skillTracks.set(row.id, row)));
    connection.db.ownPlayerSkillTracks.onDelete((context, row) => incoming(context.event.id, () => this.skillTracks.delete(row.id)));
    connection.db.ownPlayerSkillNodes.onInsert((context, row) => incoming(context.event.id, () => this.skillNodes.set(row.id, row)));
    connection.db.ownPlayerSkillNodes.onUpdate((context, _old, row) => incoming(context.event.id, () => this.skillNodes.set(row.id, row)));
    connection.db.ownPlayerSkillNodes.onDelete((context, row) => incoming(context.event.id, () => this.skillNodes.delete(row.id)));
    connection.db.ownQuestWorldItems.onInsert((context, row) => incoming(context.event.id, () => this.questWorldItems.set(row.id, row)));
    connection.db.ownQuestWorldItems.onUpdate((context, _old, row) => incoming(context.event.id, () => this.questWorldItems.set(row.id, row)));
    connection.db.ownQuestWorldItems.onDelete((context, row) => incoming(context.event.id, () => this.questWorldItems.delete(row.id)));
    connection.db.ownPlayerThought.onInsert((context, row) => incoming(context.event.id, () => { this.thought = row; }));
    connection.db.ownPlayerThought.onUpdate((context, _old, row) => incoming(context.event.id, () => { this.thought = row; }));
    connection.db.ownPlayerThought.onDelete((context) => incoming(context.event.id, () => { this.thought = null; }));
    connection.db.ownOpenChestSlots.onInsert((context, row) => incoming(context.event.id, () => this.openChestSlots.set(row.slot, row)));
    connection.db.ownOpenChestSlots.onUpdate((context, _old, row) => incoming(context.event.id, () => this.openChestSlots.set(row.slot, row)));
    connection.db.ownOpenChestSlots.onDelete((context, row) => incoming(context.event.id, () => this.openChestSlots.delete(row.slot)));
    connection.db.ownActivePlaceable.onInsert((context, row) => incoming(context.event.id, () => { this.activePlaceable = row; }));
    connection.db.ownActivePlaceable.onUpdate((context, _old, row) => incoming(context.event.id, () => { this.activePlaceable = row; }));
    connection.db.ownActivePlaceable.onDelete((context) => incoming(context.event.id, () => { this.activePlaceable = null; this.openPlaceableSlots.clear(); }));
    connection.db.ownOpenPlaceableSlots.onInsert((context, row) => incoming(context.event.id, () => this.openPlaceableSlots.set(row.slot, row)));
    connection.db.ownOpenPlaceableSlots.onUpdate((context, _old, row) => incoming(context.event.id, () => this.openPlaceableSlots.set(row.slot, row)));
    connection.db.ownOpenPlaceableSlots.onDelete((context, row) => incoming(context.event.id, () => this.openPlaceableSlots.delete(row.slot)));
    connection.db.ownChatChannels.onInsert((context, row) => incoming(context.event.id, () => this.chatChannels.set(row.id, row)));
    connection.db.ownChatChannels.onUpdate((context, _old, row) => incoming(context.event.id, () => this.chatChannels.set(row.id, row)));
    connection.db.ownChatChannels.onDelete((context, row) => incoming(context.event.id, () => this.chatChannels.delete(row.id)));
    connection.db.visibleChatMessages.onInsert((context, row) => incoming(context.event.id, () => this.chatMessages.set(row.id, row)));
    connection.db.visibleChatMessages.onUpdate((context, _old, row) => incoming(context.event.id, () => this.chatMessages.set(row.id, row)));
    connection.db.visibleChatMessages.onDelete((context, row) => incoming(context.event.id, () => this.chatMessages.delete(row.id)));
    connection.db.visibleWorldSpeech.onInsert((context, row) => incoming(context.event.id, () => this.worldSpeech.set(row.id, row)));
    connection.db.visibleWorldSpeech.onUpdate((context, _old, row) => incoming(context.event.id, () => this.worldSpeech.set(row.id, row)));
    connection.db.visibleWorldSpeech.onDelete((context, row) => incoming(context.event.id, () => this.worldSpeech.delete(row.id)));
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
    this.positions.clear(); this.visiblePlayers.clear(); this.resources.clear(); this.soil.clear(); this.crops.clear();
    this.worldItems.clear(); this.projectiles.clear(); this.chests.clear(); this.placeables.clear(); this.surfaces.clear(); this.cellarExcavations.clear(); this.npcs.clear();
    this.wildlifeProfiles.clear(); this.hives.clear(); this.worldSpeech.clear();
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
      if (row.lastProcessedSequence > this.sequence) this.sequence = row.lastProcessedSequence;
      if (this.idleRefreshPending && row.lastProcessedSequence >= this.lastIdleSequence) {
        this.idleRefreshPending = false;
        this.inputRefreshAge = 0;
      }
      for (const [sequence, started] of this.sentAt) if (sequence <= row.lastProcessedSequence) {
        const sample = performance.now() - started; this.rttEmaMs = this.rttEmaMs === 0 ? sample : this.rttEmaMs * 0.8 + sample * 0.2;
        this.sentAt.delete(sequence);
      }
      if (this.connection !== null) this.subscribeRegion(this.connection, row);
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
    this.latency.incoming(() => {
      for (const row of connection.db.playerPublic.iter()) this.setProfile(row);
      for (const row of connection.db.playerAppearance.iter()) this.appearances.set(identityHex(row.identity), row);
      this.clock = [...connection.db.worldClock.iter()][0] ?? null;
      this.environment = [...connection.db.worldEnvironment.iter()][0] ?? null;
      this.wind = [...connection.db.worldWind.iter()][0] ?? null;
      this.worldSeed = [...connection.db.worldSeed.iter()][0] ?? null; this.onChanged();
    });
  }
  private hydrateSelf(connection: DbConnection): void {
    for (const row of connection.db.ownInventorySlots.iter()) this.inventorySlots.set(row.slot, row);
    const cursor = [...connection.db.ownInventoryCursor.iter()][0];
    this.inventoryCursor = cursor === undefined ? null : {
      itemKind: cursor.itemKind, quantity: cursor.quantity, durability: cursor.durability, lit: cursor.lit,
    };
    this.activeChest = [...connection.db.ownActiveChest.iter()][0] ?? null;
    this.openChestSlots.clear(); for (const row of connection.db.ownOpenChestSlots.iter()) this.openChestSlots.set(row.slot, row);
    this.activePlaceable = [...connection.db.ownActivePlaceable.iter()][0] ?? null;
    this.openPlaceableSlots.clear(); for (const row of connection.db.ownOpenPlaceableSlots.iter()) this.openPlaceableSlots.set(row.slot, row);
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
    this.stats = [...connection.db.ownStats.iter()][0] ?? null;
    this.wallet = [...connection.db.ownWallet.iter()][0] ?? null;
    this.tradeSession = [...connection.db.ownTradeSession.iter()][0] ?? null;
    this.tradeOffers.clear(); for (const row of connection.db.ownTradeOffers.iter()) this.tradeOffers.set(row.id, row);
    this.activeDialogue = [...connection.db.ownActiveDialogue.iter()][0] ?? null;
    this.quests.clear(); for (const row of connection.db.ownPlayerQuests.iter()) this.quests.set(row.id, row);
    this.questBaselines.clear(); for (const row of connection.db.ownPlayerQuestBaselines.iter()) this.questBaselines.set(row.id, row);
    this.playerStatistics.clear(); for (const row of connection.db.ownPlayerStatistics.iter()) this.playerStatistics.set(row.id, row);
    this.skillTracks.clear(); for (const row of connection.db.ownPlayerSkillTracks.iter()) this.skillTracks.set(row.id, row);
    this.skillNodes.clear(); for (const row of connection.db.ownPlayerSkillNodes.iter()) this.skillNodes.set(row.id, row);
    this.questWorldItems.clear(); for (const row of connection.db.ownQuestWorldItems.iter()) this.questWorldItems.set(row.id, row);
    this.thought = [...connection.db.ownPlayerThought.iter()][0] ?? null;
    this.effects.clear(); for (const row of connection.db.ownEffects.iter()) this.effects.set(row.id, row);
    this.characterProfile = [...connection.db.ownCharacterProfile.iter()][0] ?? null;
    this.membership = [...connection.db.ownMembership.iter()][0] ?? null;
    if (this.identity !== null) { const row = connection.db.playerPosition.identity.find(this.identity); if (row !== null) this.setPosition(row); }
  }
}
