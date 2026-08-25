import {
  INPUT_REFRESH_STEPS, REMOTE_SNAPSHOT_CAPACITY,
  SURVIVAL_CHUNK_TILES, SURVIVAL_WORLD_SIZE, TILE_SIZE_PIXELS,
  type CollisionMap, type MoveItemRequest, type PlayerState,
} from '@orchard/sim';
import type { Identity } from 'spacetimedb';
import { DbConnection, tables, type SubscriptionHandle } from './generated/index.js';
import { localProfilesEnabled, oidcConfigured, readOidcSession } from '../auth/oidc.js';
import type {
  CharacterProfile, ChatChannel, ChatMessage, ConnectionNotice, InventorySlot, Membership, PlayerAppearance, PlayerPosition, PlayerPublic, PlayerSurvival,
  WorldChest, WorldChestSlot, WorldClock, WorldEnvironment, WorldHive, WorldItem, WorldNpc, WorldProjectile, WorldResource, WorldSeed, WorldSoil, WorldSpeech, WorldWildlifeProfile, WorldWind,
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

export function viewRadiusForViewport(canvasWidth: number, canvasHeight: number, zoom: number): number {
  const halfSpanChunks = Math.ceil(Math.max(canvasWidth, canvasHeight) / (Math.max(0.01, zoom) * SURVIVAL_CHUNK_PIXELS * 2));
  return Math.max(1, Math.min(SURVIVAL_CHUNK_COUNT, halfSpanChunks + 1));
}

export function subscriptionChunkBounds(chunkX: number, chunkY: number, radius: number): {
  readonly minX: number; readonly minY: number; readonly maxX: number; readonly maxY: number;
} {
  return { minX: Math.max(0, chunkX - radius), minY: Math.max(0, chunkY - radius),
    maxX: Math.min(SURVIVAL_CHUNK_COUNT - 1, chunkX + radius),
    maxY: Math.min(SURVIVAL_CHUNK_COUNT - 1, chunkY + radius) };
}

export interface OverworldView {
  readonly connected: boolean; readonly error: string | null; readonly identityHex: string | null;
  readonly region: readonly [number, number];
  readonly profiles: ReadonlyKeyedStore<string, PlayerPublic>;
  readonly appearances: ReadonlyKeyedStore<string, PlayerAppearance>;
  readonly players: ReadonlyKeyedStore<string, PlayerPosition>;
  readonly resources: ReadonlyKeyedStore<bigint, WorldResource>;
  readonly soil: ReadonlyKeyedStore<string, WorldSoil>;
  readonly worldItems: ReadonlyKeyedStore<bigint, WorldItem>;
  readonly projectiles: ReadonlyKeyedStore<bigint, WorldProjectile>;
  readonly chests: ReadonlyKeyedStore<bigint, WorldChest>;
  readonly npcs: ReadonlyKeyedStore<bigint, WorldNpc>;
  readonly wildlifeProfiles: ReadonlyKeyedStore<bigint, WorldWildlifeProfile>;
  readonly hives: ReadonlyKeyedStore<bigint, WorldHive>;
  readonly inventorySlots: ReadonlyKeyedStore<number, InventorySlot>;
  readonly openChestSlots: ReadonlyKeyedStore<number, WorldChestSlot>;
  readonly chatChannels: ReadonlyKeyedStore<bigint, ChatChannel>;
  readonly chatMessages: ReadonlyKeyedStore<bigint, ChatMessage>;
  readonly worldSpeech: ReadonlyKeyedStore<bigint, WorldSpeech>;
  readonly motd: string | null;
  readonly characterProfile: CharacterProfile | null; readonly membership: Membership | null; readonly survival: PlayerSurvival | null;
  readonly activeChest: WorldChest | null;
  readonly worldSeed: WorldSeed | null; readonly clock: WorldClock | null; readonly environment: WorldEnvironment | null; readonly wind: WorldWind | null;
}

export interface OverworldSnapshot {
  readonly connected: boolean; readonly error: string | null; readonly identityHex: string | null;
  readonly region: readonly [number, number]; readonly profiles: readonly PlayerPublic[];
  readonly appearances: readonly PlayerAppearance[];
  readonly players: readonly PlayerPosition[];
  readonly resources: readonly WorldResource[]; readonly soil: readonly WorldSoil[];
  readonly worldItems: readonly WorldItem[]; readonly projectiles: readonly WorldProjectile[]; readonly chests: readonly WorldChest[]; readonly npcs: readonly WorldNpc[];
  readonly wildlifeProfiles: readonly WorldWildlifeProfile[]; readonly hives: readonly WorldHive[];
  readonly inventorySlots: readonly InventorySlot[]; readonly openChestSlots: readonly WorldChestSlot[]; readonly chatChannels: readonly ChatChannel[];
  readonly chatMessages: readonly ChatMessage[]; readonly worldSpeech: readonly WorldSpeech[];
  readonly motd: string | null; readonly characterProfile: CharacterProfile | null;
  readonly membership: Membership | null; readonly survival: PlayerSurvival | null; readonly activeChest: WorldChest | null;
  readonly worldSeed: WorldSeed | null; readonly clock: WorldClock | null; readonly environment: WorldEnvironment | null; readonly wind: WorldWind | null;
}

export interface NetcodeMetrics {
  readonly rttMs: number; readonly replayDepth: number; readonly reconciliationErrorFixed: number;
  readonly inputRefreshAgeSteps: number; readonly handoverCount: number;
  readonly persistentInputError: string | null; readonly lagMs: number; readonly jitterMs: number;
}

export interface TimedProjectileCommit {
  readonly row: WorldProjectile;
  readonly authorityTick: bigint;
}

export type NetworkDirection = InputDirection;
function identityHex(identity: Identity): string { return identity.toHexString(); }

export class OverworldConnection {
  private connection: DbConnection | null = null;
  private connected = false;
  private error: string | null = null;
  private identity: Identity | null = null;
  private region: readonly [number, number] = [0, 0];
  private viewRadius = 1;
  private requestedRadius = 1;
  private subscribedRadius = 0;
  private radiusTimer: number | null = null;
  private pendingRegion: string | null = null;
  private regionSubscription: SubscriptionHandle | null = null;
  private heartbeatTimer: number | null = null;
  private sequence = 0n;
  private inputReady = false;
  private desiredDirection: NetworkDirection = 'idle';
  private idleRefreshPending = false;
  private lastIdleSequence = 0n;
  private inputRefreshAge = 0;
  private retryArmed = true;
  private persistentInputError: string | null = null;
  private resourceRevisionValue = 0;
  private handoverCount = 0;
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
  private readonly worldItems = new KeyedStore<bigint, WorldItem>();
  private readonly projectiles = new KeyedStore<bigint, WorldProjectile>();
  private readonly chests = new KeyedStore<bigint, WorldChest>();
  private readonly npcs = new KeyedStore<bigint, WorldNpc>();
  private readonly wildlifeProfiles = new KeyedStore<bigint, WorldWildlifeProfile>();
  private readonly hives = new KeyedStore<bigint, WorldHive>();
  private readonly inventorySlots = new KeyedStore<number, InventorySlot>();
  private readonly openChestSlots = new KeyedStore<number, WorldChestSlot>();
  private readonly chatChannels = new KeyedStore<bigint, ChatChannel>();
  private readonly chatMessages = new KeyedStore<bigint, ChatMessage>();
  private readonly worldSpeech = new KeyedStore<bigint, WorldSpeech>();
  private motd: string | null = null;
  private characterProfile: CharacterProfile | null = null;
  private membership: Membership | null = null;
  private survival: PlayerSurvival | null = null;
  private activeChest: WorldChest | null = null;
  private worldSeed: WorldSeed | null = null;
  private clock: WorldClock | null = null;
  private environment: WorldEnvironment | null = null;
  private wind: WorldWind | null = null;

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
        this.bindTableEvents(connection); this.subscribeGlobals(connection); this.subscribeSelf(connection, identity);
        if (localProfilesEnabled && oidcSession === null) {
          void this.call(() => connection.reducers.setDisplayName({ displayName: this.displayName() })).catch(() => undefined);
        }
        this.heartbeatTimer = window.setInterval(() => { void this.call(() => connection.reducers.heartbeat({})).catch(() => undefined); }, 10_000);
        this.onChanged();
      })
      .onConnectError((_context, error) => { this.error = error.message; this.onChanged(); })
      .onDisconnect((_context, error) => {
        if (this.heartbeatTimer !== null) window.clearInterval(this.heartbeatTimer);
        this.heartbeatTimer = null; this.inputReady = false; this.connected = false;
        this.error = error?.message ?? 'disconnected'; this.prediction.reset(); this.sentAt.clear(); this.onChanged();
      }).build();
  }

  view(): OverworldView {
    return { connected: this.connected, error: this.error,
      identityHex: this.identity === null ? null : identityHex(this.identity), region: this.region,
      profiles: this.profiles, appearances: this.appearances, players: this.visiblePlayers,
      resources: this.resources, soil: this.soil, worldItems: this.worldItems, projectiles: this.projectiles, chests: this.chests, npcs: this.npcs,
      wildlifeProfiles: this.wildlifeProfiles, hives: this.hives, inventorySlots: this.inventorySlots,
      openChestSlots: this.openChestSlots,
      chatChannels: this.chatChannels, chatMessages: this.chatMessages, worldSpeech: this.worldSpeech, motd: this.motd,
      characterProfile: this.characterProfile, membership: this.membership, survival: this.survival, activeChest: this.activeChest, worldSeed: this.worldSeed,
      clock: this.clock, environment: this.environment, wind: this.wind };
  }

  /** Materialized compatibility view for tests and browser diagnostics only. */
  snapshot(): OverworldSnapshot {
    const view = this.view();
    return { ...view, profiles: this.profiles.toArray(), appearances: this.appearances.toArray(),
      players: this.visiblePlayers.toArray(), resources: this.resources.toArray(), soil: this.soil.toArray(), worldItems: this.worldItems.toArray(), projectiles: this.projectiles.toArray(), chests: this.chests.toArray(), npcs: this.npcs.toArray(),
      wildlifeProfiles: this.wildlifeProfiles.toArray(), hives: this.hives.toArray(),
      inventorySlots: this.inventorySlots.toArray().sort((left, right) => left.slot - right.slot),
      openChestSlots: this.openChestSlots.toArray().sort((left, right) => left.slot - right.slot),
      chatChannels: this.chatChannels.toArray(),
      chatMessages: this.chatMessages.toArray().sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0),
      worldSpeech: this.worldSpeech.toArray().sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0) };
  }

  ownPosition(): PlayerPosition | null { return this.identity === null ? null : this.positions.get(identityHex(this.identity)) ?? null; }
  get resourceRevision(): number { return this.resourceRevisionValue; }

  setDirection(direction: NetworkDirection): void {
    if (direction === this.desiredDirection) return;
    this.desiredDirection = direction;
    if (direction === 'idle') this.idleRefreshPending = true;
    this.retryArmed = true; this.sendDesiredDirection();
  }
  recordPredictedStep(direction: NetworkDirection, state: PlayerState): void {
    this.prediction.recordStep(direction, state);
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
    return { rttMs: this.rttEmaMs, replayDepth: this.replayDepth,
      reconciliationErrorFixed: this.reconciliationErrorFixed, inputRefreshAgeSteps: this.inputRefreshAge,
      handoverCount: this.handoverCount, persistentInputError: this.persistentInputError,
      lagMs: this.latency.lagMs, jitterMs: this.latency.jitterMs };
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
  drainDeletedProjectileIds(visit: (id: bigint) => void): void {
    for (const id of this.deletedProjectileIds) visit(id);
    this.deletedProjectileIds.clear();
  }

  setViewRadius(radius: number): void {
    const next = Math.max(1, Math.min(SURVIVAL_CHUNK_COUNT, Math.ceil(radius)));
    if (next === this.requestedRadius) return;
    this.requestedRadius = next;
    if (this.radiusTimer !== null) window.clearTimeout(this.radiusTimer);
    this.radiusTimer = window.setTimeout(() => {
      this.radiusTimer = null; this.viewRadius = this.requestedRadius;
      const position = this.ownPosition();
      if (position !== null && this.connection !== null) this.subscribeRegion(this.connection, position.chunkX, position.chunkY);
    }, RADIUS_SETTLE_MS);
  }

  selectHotbar(slot: number): Promise<void> { return this.reducer((c) => c.reducers.selectHotbar({ slot })); }
  moveInventoryItem(request: MoveItemRequest): Promise<void> {
    const involvesChest = request.fromContainer === 'chest' || request.toContainer === 'chest';
    return this.reducer((connection) => involvesChest
      ? connection.reducers.moveChestItem(request)
      : connection.reducers.moveInventoryItem(request));
  }
  quickMoveInventoryItem(fromContainer: string, fromIndex: number, toContainers: readonly string[]): Promise<void> {
    const involvesChest = fromContainer === 'chest' || toContainers.includes('chest');
    return this.reducer((connection) => involvesChest
      ? connection.reducers.quickMoveChestItem({ fromContainer, fromIndex, toContainers: [...toContainers] })
      : connection.reducers.quickMoveInventoryItem({ fromContainer, fromIndex, toContainers: [...toContainers] }));
  }
  distributeInventoryItem(fromContainer: string, fromIndex: number, targets: readonly { container: string; index: number }[], quantity: number): Promise<void> {
    const request = { fromContainer, fromIndex, targetContainers: targets.map((target) => target.container),
      targetIndexes: Uint8Array.from(targets.map((target) => target.index)), quantity };
    const involvesChest = fromContainer === 'chest' || targets.some((target) => target.container === 'chest');
    return this.reducer((connection) => involvesChest
      ? connection.reducers.distributeChestItem(request)
      : connection.reducers.distributeInventoryItem(request));
  }
  craftInventoryRecipe(recipeId: string): Promise<void> { return this.reducer((c) => c.reducers.craftInventoryRecipe({ recipeId })); }
  closeCrafting(): Promise<void> { return this.reducer((c) => c.reducers.closeCrafting({})); }
  useHands(): Promise<void> { return this.reducer((c) => c.reducers.useHands({})); }
  interactChest(): Promise<void> { return this.reducer((c) => c.reducers.interactChest({})); }
  closeChest(): Promise<void> { return this.reducer((c) => c.reducers.closeChest({})); }
  harvestResource(resourceId: bigint): Promise<void> { return this.reducer((c) => c.reducers.harvestResource({ resourceId })); }
  useFarmTool(tileX: number, tileY: number): Promise<void> {
    return this.reducer((connection) => connection.reducers.useFarmTool({ tileX, tileY }));
  }
  restoreFarmTile(tileX: number, tileY: number): Promise<void> {
    return this.reducer((connection) => connection.reducers.restoreFarmTile({ tileX, tileY }));
  }
  fireBow(aimX: number, aimY: number, chargeMs: number): Promise<void> {
    return this.reducer((connection) => connection.reducers.fireBow({ aimX, aimY, chargeMs }));
  }
  dropSelected(): Promise<void> { return this.reducer((c) => c.reducers.dropSelected({})); }
  pickupWorldItem(itemId: bigint): Promise<void> { return this.reducer((c) => c.reducers.pickupWorldItem({ itemId })); }
  gatherWorldResource(resourceId: bigint): Promise<void> {
    return this.reducer((connection) => connection.reducers.gatherWorldResource({ resourceId }));
  }
  interactHorse(horseId: bigint): Promise<void> { return this.reducer((c) => c.reducers.interactHorse({ horseId })); }
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
    const command = this.prediction.recordSend(this.sequence, this.desiredDirection);
    if (command.direction === 'idle') this.lastIdleSequence = command.sequence;
    this.sentAt.set(command.sequence, performance.now());
    if (this.sentAt.size > RTT_SAMPLE_CAPACITY) {
      const oldest = this.sentAt.keys().next().value as bigint | undefined;
      if (oldest !== undefined) this.sentAt.delete(oldest);
    }
    void this.call(() => connection.reducers.setInput({ direction: command.direction, sequence: command.sequence, clientTick: command.clientTick }))
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

  private subscribeGlobals(connection: DbConnection): void {
    connection.subscriptionBuilder().onApplied(() => this.hydrateGlobals(connection)).onError(() => {
      this.error = 'global_subscription_failed'; this.onChanged();
    }).subscribe([tables.playerPublic, tables.playerAppearance, tables.worldClock, tables.worldEnvironment, tables.worldWind, tables.worldSeed, tables.worldWildlifeProfile, tables.worldHive]);
  }
  private subscribeSelf(connection: DbConnection, identity: Identity): void {
    connection.subscriptionBuilder().onApplied(() => this.latency.incoming(() => {
      this.hydrateSelf(connection);
      const row = connection.db.playerPosition.identity.find(identity);
      if (row === null) { this.error = 'self_position_missing'; this.onChanged(); return; }
      this.sequence = row.lastProcessedSequence > this.sequence ? row.lastProcessedSequence : this.sequence;
      this.prediction.reset(row.lastProcessedSequence); this.inputReady = true;
      this.subscribeRegion(connection, row.chunkX, row.chunkY); this.sendDesiredDirection(); this.onChanged();
    })).onError(() => { this.error = 'self_subscription_failed'; this.onChanged(); })
      .subscribe([
        tables.playerPosition.where((row) => row.identity.eq(identity)),
        tables.ownSurvival,
        tables.ownInventorySlots,
        tables.ownActiveChest,
        tables.ownOpenChestSlots,
        tables.ownCharacterProfile,
        tables.ownMembership,
        tables.ownConnectionNotices,
        tables.ownChatChannels,
        tables.visibleChatMessages,
        tables.visibleWorldSpeech,
      ]);
  }
  private subscribeRegion(connection: DbConnection, chunkX: number, chunkY: number): void {
    const radius = this.viewRadius; const regionKey = `${chunkX},${chunkY},${radius}`;
    if (this.pendingRegion === regionKey || (`${this.region[0]},${this.region[1]},${this.subscribedRadius}` === regionKey && this.regionSubscription !== null)) return;
    this.pendingRegion = regionKey;
    const positions = []; const resources = []; const soil = []; const worldItems = []; const projectiles = []; const chests = []; const npcs = [];
    const bounds = subscriptionChunkBounds(chunkX, chunkY, radius);
    for (let y = bounds.minY; y <= bounds.maxY; y += 1) for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
      positions.push(tables.playerPosition.where((row) => row.chunkX.eq(x)).where((row) => row.chunkY.eq(y)));
      resources.push(tables.worldResource.where((row) => row.chunkX.eq(x)).where((row) => row.chunkY.eq(y)));
      soil.push(tables.worldSoil.where((row) => row.chunkX.eq(x)).where((row) => row.chunkY.eq(y)));
      worldItems.push(tables.worldItem.where((row) => row.chunkX.eq(x)).where((row) => row.chunkY.eq(y)));
      projectiles.push(tables.worldProjectile.where((row) => row.chunkX.eq(x)).where((row) => row.chunkY.eq(y)));
      chests.push(tables.worldChest.where((row) => row.chunkX.eq(x)).where((row) => row.chunkY.eq(y)));
      npcs.push(tables.worldNpc.where((row) => row.chunkX.eq(x)).where((row) => row.chunkY.eq(y)));
    }
    const previous = this.regionSubscription;
    this.regionSubscription = connection.subscriptionBuilder().onApplied(() => this.latency.incoming(() => {
      this.hydrateRegion(connection); this.region = [chunkX, chunkY]; this.subscribedRadius = radius; this.pendingRegion = null;
      if (previous?.isActive()) previous.unsubscribe();
      this.handoverCount += 1; this.resourceRevisionValue += 1; this.onChanged();
    })).onError(() => { this.pendingRegion = null; this.error = 'region_subscription_failed'; this.onChanged(); })
      .subscribe([...positions, ...resources, ...soil, ...worldItems, ...projectiles, ...chests, ...npcs]);
  }

  private bindTableEvents(connection: DbConnection): void {
    const incoming = (eventId: string, apply: () => void): void => {
      this.latency.incomingGrouped(eventId, () => { apply(); this.onChanged(); });
    };
    connection.db.playerPublic.onInsert((context, row) => incoming(context.event.id, () => this.setProfile(row)));
    connection.db.playerPublic.onUpdate((context, _old, row) => incoming(context.event.id, () => this.setProfile(row)));
    connection.db.playerPublic.onDelete((context, row) => incoming(context.event.id, () => { const id = identityHex(row.identity); this.profiles.delete(id); this.visiblePlayers.delete(id); }));
    connection.db.playerAppearance.onInsert((context, row) => incoming(context.event.id, () => this.appearances.set(identityHex(row.identity), row)));
    connection.db.playerAppearance.onUpdate((context, _old, row) => incoming(context.event.id, () => this.appearances.set(identityHex(row.identity), row)));
    connection.db.playerAppearance.onDelete((context, row) => incoming(context.event.id, () => this.appearances.delete(identityHex(row.identity))));
    connection.db.worldClock.onInsert((context, row) => incoming(context.event.id, () => { this.clock = row; }));
    connection.db.worldClock.onUpdate((context, _old, row) => incoming(context.event.id, () => { this.clock = row; }));
    connection.db.worldEnvironment.onInsert((context, row) => incoming(context.event.id, () => { this.environment = row; }));
    connection.db.worldEnvironment.onUpdate((context, _old, row) => incoming(context.event.id, () => { this.environment = row; }));
    connection.db.worldWind.onInsert((context, row) => incoming(context.event.id, () => { this.wind = row; }));
    connection.db.worldWind.onUpdate((context, _old, row) => incoming(context.event.id, () => { this.wind = row; }));
    connection.db.worldWildlifeProfile.onInsert((context, row) => incoming(context.event.id, () => this.wildlifeProfiles.set(row.npcId, row)));
    connection.db.worldWildlifeProfile.onUpdate((context, _old, row) => incoming(context.event.id, () => this.wildlifeProfiles.set(row.npcId, row)));
    connection.db.worldWildlifeProfile.onDelete((context, row) => incoming(context.event.id, () => this.wildlifeProfiles.delete(row.npcId)));
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
    connection.db.worldChest.onInsert((context, row) => resource(context.event.id, () => this.chests.set(row.id, row)));
    connection.db.worldChest.onUpdate((context, _old, row) => resource(context.event.id, () => this.chests.set(row.id, row)));
    connection.db.worldChest.onDelete((context, row) => resource(context.event.id, () => this.chests.delete(row.id)));
    connection.db.worldNpc.onInsert((context, row) => incoming(context.event.id, () => this.setNpc(row)));
    connection.db.worldNpc.onUpdate((context, _old, row) => incoming(context.event.id, () => this.setNpc(row)));
    connection.db.worldNpc.onDelete((context, row) => incoming(context.event.id, () => {
      this.npcs.delete(row.id); this.deletedNpcIds.add(row.id);
    }));
    connection.db.ownSurvival.onInsert((context, row) => incoming(context.event.id, () => { this.survival = row; }));
    connection.db.ownSurvival.onUpdate((context, _old, row) => incoming(context.event.id, () => { this.survival = row; }));
    connection.db.ownSurvival.onDelete((context) => incoming(context.event.id, () => { this.survival = null; }));
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
    connection.db.ownInventorySlots.onInsert((context, row) => incoming(context.event.id, () => this.inventorySlots.set(row.slot, row)));
    connection.db.ownInventorySlots.onUpdate((context, _old, row) => incoming(context.event.id, () => this.inventorySlots.set(row.slot, row)));
    connection.db.ownInventorySlots.onDelete((context, row) => incoming(context.event.id, () => this.inventorySlots.delete(row.slot)));
    connection.db.ownActiveChest.onInsert((context, row) => incoming(context.event.id, () => { this.activeChest = row; }));
    connection.db.ownActiveChest.onUpdate((context, _old, row) => incoming(context.event.id, () => { this.activeChest = row; }));
    connection.db.ownActiveChest.onDelete((context) => incoming(context.event.id, () => { this.activeChest = null; this.openChestSlots.clear(); }));
    connection.db.ownOpenChestSlots.onInsert((context, row) => incoming(context.event.id, () => this.openChestSlots.set(row.slot, row)));
    connection.db.ownOpenChestSlots.onUpdate((context, _old, row) => incoming(context.event.id, () => this.openChestSlots.set(row.slot, row)));
    connection.db.ownOpenChestSlots.onDelete((context, row) => incoming(context.event.id, () => this.openChestSlots.delete(row.slot)));
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
    const id = identityHex(row.identity); this.profiles.set(id, row); const position = this.positions.get(id);
    if (row.online && position !== undefined) this.visiblePlayers.set(id, position); else this.visiblePlayers.delete(id);
  }
  private setPosition(row: PlayerPosition): void {
    const id = identityHex(row.identity); this.positions.set(id, row);
    this.positionCommits.push(id, row);
    if (this.profiles.get(id)?.online ?? true) this.visiblePlayers.set(id, row); else this.visiblePlayers.delete(id);
    if (this.identity !== null && row.identity.isEqual(this.identity)) {
      if (row.lastProcessedSequence > this.sequence) this.sequence = row.lastProcessedSequence;
      if (this.idleRefreshPending && row.lastProcessedSequence >= this.lastIdleSequence) {
        this.idleRefreshPending = false;
        this.inputRefreshAge = 0;
      }
      for (const [sequence, started] of this.sentAt) if (sequence <= row.lastProcessedSequence) {
        const sample = performance.now() - started; this.rttEmaMs = this.rttEmaMs === 0 ? sample : this.rttEmaMs * 0.8 + sample * 0.2;
        this.sentAt.delete(sequence);
      }
      if (this.connection !== null) this.subscribeRegion(this.connection, row.chunkX, row.chunkY);
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
      this.wildlifeProfiles.clear();
      for (const row of connection.db.worldWildlifeProfile.iter()) this.wildlifeProfiles.set(row.npcId, row);
      this.hives.clear();
      for (const row of connection.db.worldHive.iter()) this.hives.set(row.id, row);
      this.worldSeed = [...connection.db.worldSeed.iter()][0] ?? null; this.onChanged();
    });
  }
  private hydrateSelf(connection: DbConnection): void {
    for (const row of connection.db.ownInventorySlots.iter()) this.inventorySlots.set(row.slot, row);
    this.activeChest = [...connection.db.ownActiveChest.iter()][0] ?? null;
    this.openChestSlots.clear(); for (const row of connection.db.ownOpenChestSlots.iter()) this.openChestSlots.set(row.slot, row);
    for (const row of connection.db.ownChatChannels.iter()) this.chatChannels.set(row.id, row);
    for (const row of connection.db.visibleChatMessages.iter()) this.chatMessages.set(row.id, row);
    for (const row of connection.db.visibleWorldSpeech.iter()) this.worldSpeech.set(row.id, row);
    this.motd = null;
    for (const row of connection.db.ownConnectionNotices.iter()) this.setConnectionNotice(connection, row);
    this.survival = [...connection.db.ownSurvival.iter()][0] ?? null;
    this.characterProfile = [...connection.db.ownCharacterProfile.iter()][0] ?? null;
    this.membership = [...connection.db.ownMembership.iter()][0] ?? null;
    if (this.identity !== null) { const row = connection.db.playerPosition.identity.find(this.identity); if (row !== null) this.setPosition(row); }
  }
  private hydrateRegion(connection: DbConnection): void {
    for (const row of connection.db.playerPosition.iter()) this.setPosition(row);
    for (const row of connection.db.worldResource.iter()) this.resources.set(row.id, row);
    for (const row of connection.db.worldSoil.iter()) this.soil.set(row.id, row);
    for (const row of connection.db.worldItem.iter()) this.worldItems.set(row.id, row);
    for (const row of connection.db.worldProjectile.iter()) this.setProjectile(row);
    for (const row of connection.db.worldChest.iter()) this.chests.set(row.id, row);
    for (const row of connection.db.worldNpc.iter()) this.setNpc(row);
  }
}
