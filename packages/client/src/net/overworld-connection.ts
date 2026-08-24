import {
  INPUT_REFRESH_STEPS, REMOTE_SNAPSHOT_CAPACITY,
  SURVIVAL_CHUNK_TILES, SURVIVAL_WORLD_SIZE, TILE_SIZE_PIXELS,
  type CollisionMap, type PlayerState,
} from '@orchard/sim';
import type { Identity } from 'spacetimedb';
import { DbConnection, tables, type SubscriptionHandle } from './generated/index.js';
import { readOidcSession } from '../auth/oidc.js';
import type {
  InventorySlot, PlayerPosition, PlayerPublic, PlayerSurvival,
  WorldClock, WorldItem, WorldResource, WorldSeed,
} from './generated/types.js';
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
  readonly players: ReadonlyKeyedStore<string, PlayerPosition>;
  readonly resources: ReadonlyKeyedStore<bigint, WorldResource>;
  readonly worldItems: ReadonlyKeyedStore<bigint, WorldItem>;
  readonly inventorySlots: ReadonlyKeyedStore<number, InventorySlot>;
  readonly survival: PlayerSurvival | null; readonly worldSeed: WorldSeed | null; readonly clock: WorldClock | null;
}

export interface OverworldSnapshot {
  readonly connected: boolean; readonly error: string | null; readonly identityHex: string | null;
  readonly region: readonly [number, number]; readonly profiles: readonly PlayerPublic[];
  readonly players: readonly PlayerPosition[];
  readonly resources: readonly WorldResource[]; readonly worldItems: readonly WorldItem[];
  readonly inventorySlots: readonly InventorySlot[]; readonly survival: PlayerSurvival | null;
  readonly worldSeed: WorldSeed | null; readonly clock: WorldClock | null;
}

export interface NetcodeMetrics {
  readonly rttMs: number; readonly replayDepth: number; readonly reconciliationErrorFixed: number;
  readonly inputRefreshAgeSteps: number; readonly handoverCount: number;
  readonly persistentInputError: string | null; readonly lagMs: number; readonly jitterMs: number;
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
  private readonly prediction = new LocalPredictionBuffer();
  private readonly latency: LatencyInjector;
  private readonly profiles = new KeyedStore<string, PlayerPublic>();
  private readonly positions = new KeyedStore<string, PlayerPosition>();
  private readonly visiblePlayers = new KeyedStore<string, PlayerPosition>();
  private readonly resources = new KeyedStore<bigint, WorldResource>();
  private readonly worldItems = new KeyedStore<bigint, WorldItem>();
  private readonly inventorySlots = new KeyedStore<number, InventorySlot>();
  private survival: PlayerSurvival | null = null;
  private worldSeed: WorldSeed | null = null;
  private clock: WorldClock | null = null;

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
    const savedToken = oidcSession?.idToken ?? localStorage.getItem(tokenKey) ?? undefined;
    this.connection = DbConnection.builder().withUri(host).withDatabaseName(database).withToken(savedToken)
      .onConnect((connection, identity, token) => {
        if (oidcSession === null && savedToken === undefined) localStorage.setItem(tokenKey, token);
        this.connected = true; this.error = null; this.identity = identity;
        this.bindTableEvents(connection); this.subscribeGlobals(connection); this.subscribeSelf(connection, identity);
        void this.call(() => connection.reducers.setDisplayName({ displayName: this.displayName() }));
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
      profiles: this.profiles, players: this.visiblePlayers,
      resources: this.resources, worldItems: this.worldItems, inventorySlots: this.inventorySlots,
      survival: this.survival, worldSeed: this.worldSeed, clock: this.clock };
  }

  /** Materialized compatibility view for tests and browser diagnostics only. */
  snapshot(): OverworldSnapshot {
    const view = this.view();
    return { ...view, profiles: this.profiles.toArray(),
      players: this.visiblePlayers.toArray(), resources: this.resources.toArray(), worldItems: this.worldItems.toArray(),
      inventorySlots: this.inventorySlots.toArray().sort((left, right) => left.slot - right.slot) };
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
  harvestResource(resourceId: bigint): Promise<void> { return this.reducer((c) => c.reducers.harvestResource({ resourceId })); }
  dropSelected(): Promise<void> { return this.reducer((c) => c.reducers.dropSelected({})); }
  pickupWorldItem(itemId: bigint): Promise<void> { return this.reducer((c) => c.reducers.pickupWorldItem({ itemId })); }
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
    }).subscribe([tables.playerPublic, tables.worldClock, tables.worldSeed]);
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
      .subscribe([tables.playerPosition.where((row) => row.identity.eq(identity)), tables.ownSurvival, tables.ownInventorySlots]);
  }
  private subscribeRegion(connection: DbConnection, chunkX: number, chunkY: number): void {
    const radius = this.viewRadius; const regionKey = `${chunkX},${chunkY},${radius}`;
    if (this.pendingRegion === regionKey || (`${this.region[0]},${this.region[1]},${this.subscribedRadius}` === regionKey && this.regionSubscription !== null)) return;
    this.pendingRegion = regionKey;
    const positions = []; const resources = []; const worldItems = [];
    const bounds = subscriptionChunkBounds(chunkX, chunkY, radius);
    for (let y = bounds.minY; y <= bounds.maxY; y += 1) for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
      positions.push(tables.playerPosition.where((row) => row.chunkX.eq(x)).where((row) => row.chunkY.eq(y)));
      resources.push(tables.worldResource.where((row) => row.chunkX.eq(x)).where((row) => row.chunkY.eq(y)));
      worldItems.push(tables.worldItem.where((row) => row.chunkX.eq(x)).where((row) => row.chunkY.eq(y)));
    }
    const previous = this.regionSubscription;
    this.regionSubscription = connection.subscriptionBuilder().onApplied(() => this.latency.incoming(() => {
      this.hydrateRegion(connection); this.region = [chunkX, chunkY]; this.subscribedRadius = radius; this.pendingRegion = null;
      if (previous?.isActive()) previous.unsubscribe();
      this.handoverCount += 1; this.resourceRevisionValue += 1; this.onChanged();
    })).onError(() => { this.pendingRegion = null; this.error = 'region_subscription_failed'; this.onChanged(); })
      .subscribe([...positions, ...resources, ...worldItems]);
  }

  private bindTableEvents(connection: DbConnection): void {
    const incoming = (eventId: string, apply: () => void): void => {
      this.latency.incomingGrouped(eventId, () => { apply(); this.onChanged(); });
    };
    connection.db.playerPublic.onInsert((context, row) => incoming(context.event.id, () => this.setProfile(row)));
    connection.db.playerPublic.onUpdate((context, _old, row) => incoming(context.event.id, () => this.setProfile(row)));
    connection.db.playerPublic.onDelete((context, row) => incoming(context.event.id, () => { const id = identityHex(row.identity); this.profiles.delete(id); this.visiblePlayers.delete(id); }));
    connection.db.worldClock.onInsert((context, row) => incoming(context.event.id, () => { this.clock = row; }));
    connection.db.worldClock.onUpdate((context, _old, row) => incoming(context.event.id, () => { this.clock = row; }));
    connection.db.worldSeed.onInsert((context, row) => incoming(context.event.id, () => { this.worldSeed = row; }));
    connection.db.worldSeed.onUpdate((context, _old, row) => incoming(context.event.id, () => { this.worldSeed = row; }));
    const resource = (eventId: string, apply: () => void): void => incoming(eventId, () => { apply(); this.resourceRevisionValue += 1; });
    connection.db.worldResource.onInsert((context, row) => resource(context.event.id, () => this.resources.set(row.id, row)));
    connection.db.worldResource.onUpdate((context, _old, row) => resource(context.event.id, () => this.resources.set(row.id, row)));
    connection.db.worldResource.onDelete((context, row) => resource(context.event.id, () => this.resources.delete(row.id)));
    connection.db.worldItem.onInsert((context, row) => incoming(context.event.id, () => this.worldItems.set(row.id, row)));
    connection.db.worldItem.onUpdate((context, _old, row) => incoming(context.event.id, () => this.worldItems.set(row.id, row)));
    connection.db.worldItem.onDelete((context, row) => incoming(context.event.id, () => this.worldItems.delete(row.id)));
    connection.db.ownSurvival.onInsert((context, row) => incoming(context.event.id, () => { this.survival = row; }));
    connection.db.ownSurvival.onUpdate((context, _old, row) => incoming(context.event.id, () => { this.survival = row; }));
    connection.db.ownSurvival.onDelete((context) => incoming(context.event.id, () => { this.survival = null; }));
    connection.db.ownInventorySlots.onInsert((context, row) => incoming(context.event.id, () => this.inventorySlots.set(row.slot, row)));
    connection.db.ownInventorySlots.onUpdate((context, _old, row) => incoming(context.event.id, () => this.inventorySlots.set(row.slot, row)));
    connection.db.ownInventorySlots.onDelete((context, row) => incoming(context.event.id, () => this.inventorySlots.delete(row.slot)));
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
  private hydrateGlobals(connection: DbConnection): void {
    this.latency.incoming(() => {
      for (const row of connection.db.playerPublic.iter()) this.setProfile(row);
      this.clock = [...connection.db.worldClock.iter()][0] ?? null; this.worldSeed = [...connection.db.worldSeed.iter()][0] ?? null; this.onChanged();
    });
  }
  private hydrateSelf(connection: DbConnection): void {
    for (const row of connection.db.ownInventorySlots.iter()) this.inventorySlots.set(row.slot, row);
    this.survival = [...connection.db.ownSurvival.iter()][0] ?? null;
    if (this.identity !== null) { const row = connection.db.playerPosition.identity.find(this.identity); if (row !== null) this.setPosition(row); }
  }
  private hydrateRegion(connection: DbConnection): void {
    for (const row of connection.db.playerPosition.iter()) this.setPosition(row);
    for (const row of connection.db.worldResource.iter()) this.resources.set(row.id, row);
    for (const row of connection.db.worldItem.iter()) this.worldItems.set(row.id, row);
  }
}
