import {
  SURVIVAL_CHUNK_TILES,
  SURVIVAL_WORLD_SIZE,
  TILE_SIZE_PIXELS,
  type Direction,
} from '@orchard/sim';
import type { Identity } from 'spacetimedb';
import {
  DbConnection,
  tables,
  type SubscriptionHandle,
} from './generated/index.js';
import type {
  InventorySlot,
  PlayerPosition,
  PlayerPublic,
  PlayerSurvival,
  WorldClock,
  WorldResource,
  WorldSeed,
} from './generated/types.js';

const DEFAULT_DATABASE = 'orchard-cellar-world';
const SURVIVAL_CHUNK_COUNT = Math.ceil(SURVIVAL_WORLD_SIZE / SURVIVAL_CHUNK_TILES);
const SURVIVAL_CHUNK_PIXELS = SURVIVAL_CHUNK_TILES * TILE_SIZE_PIXELS;

export function viewRadiusForViewport(canvasWidth: number, canvasHeight: number, zoom: number): number {
  const halfSpanChunks = Math.ceil(Math.max(canvasWidth, canvasHeight) / (Math.max(1, zoom) * SURVIVAL_CHUNK_PIXELS * 2));
  return Math.max(1, Math.min(SURVIVAL_CHUNK_COUNT, halfSpanChunks + 1));
}

export function subscriptionChunkBounds(chunkX: number, chunkY: number, radius: number): {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
} {
  return {
    minX: Math.max(0, chunkX - radius),
    minY: Math.max(0, chunkY - radius),
    maxX: Math.min(SURVIVAL_CHUNK_COUNT - 1, chunkX + radius),
    maxY: Math.min(SURVIVAL_CHUNK_COUNT - 1, chunkY + radius),
  };
}

export interface OverworldSnapshot {
  readonly connected: boolean;
  readonly error: string | null;
  readonly identityHex: string | null;
  readonly region: readonly [number, number];
  readonly profiles: readonly PlayerPublic[];
  readonly players: readonly PlayerPosition[];
  readonly resources: readonly WorldResource[];
  readonly inventorySlots: readonly InventorySlot[];
  readonly survival: PlayerSurvival | null;
  readonly worldSeed: WorldSeed | null;
  readonly clock: WorldClock | null;
}

export type NetworkDirection = Direction | 'idle';

function identityHex(identity: Identity): string {
  return identity.toHexString();
}

export class OverworldConnection {
  private connection: DbConnection | null = null;
  private connected = false;
  private error: string | null = null;
  private identity: Identity | null = null;
  private region: readonly [number, number] = [0, 0];
  private viewRadius = 1;
  private subscribedRadius = 0;
  private pendingRegion: string | null = null;
  private regionSubscription: SubscriptionHandle | null = null;
  private heartbeatTimer: number | null = null;
  private sequence = 0n;
  private inputReady = false;
  private desiredDirection: NetworkDirection = 'idle';

  constructor(
    private readonly slot: string,
    private readonly onChanged: () => void,
    host = import.meta.env['VITE_SPACETIMEDB_URI'] ?? location.origin,
    database = import.meta.env['VITE_SPACETIMEDB_DATABASE'] ?? DEFAULT_DATABASE,
  ) {
    const tokenKey = `orchard:world:${host}:${database}:${slot}:token`;
    const savedToken = localStorage.getItem(tokenKey) ?? undefined;
    this.connection = DbConnection.builder()
      .withUri(host)
      .withDatabaseName(database)
      .withToken(savedToken)
      .onConnect((connection, identity, token) => {
        if (savedToken === undefined) localStorage.setItem(tokenKey, token);
        this.connected = true;
        this.error = null;
        this.identity = identity;
        this.bindTableEvents(connection);
        this.subscribeGlobals(connection);
        this.subscribeSelf(connection, identity);
        void connection.reducers.setDisplayName({ displayName: this.displayName() });
        this.heartbeatTimer = window.setInterval(() => {
          void connection.reducers.heartbeat({})
            .then(() => this.sendDesiredDirection())
            .catch(() => undefined);
        }, 10_000);
        this.onChanged();
      })
      .onConnectError((_context, error) => {
        this.error = error.message;
        this.onChanged();
      })
      .onDisconnect((_context, error) => {
        if (this.heartbeatTimer !== null) window.clearInterval(this.heartbeatTimer);
        this.heartbeatTimer = null;
        this.inputReady = false;
        this.connected = false;
        this.error = error?.message ?? 'disconnected';
        this.onChanged();
      })
      .build();
  }

  snapshot(): OverworldSnapshot {
    const connection = this.connection;
    const profiles = connection === null ? [] : [...connection.db.playerPublic.iter()];
    const online = new Set(
      profiles.filter((profile) => profile.online).map((profile) => identityHex(profile.identity)),
    );
    return {
      connected: this.connected,
      error: this.error,
      identityHex: this.identity === null ? null : identityHex(this.identity),
      region: this.region,
      profiles,
      players: connection === null
        ? []
        : [...connection.db.playerPosition.iter()].filter((row) => online.has(identityHex(row.identity))),
      resources: connection === null ? [] : [...connection.db.worldResource.iter()],
      inventorySlots: connection === null
        ? []
        : [...connection.db.ownInventorySlots.iter()].sort((left, right) => left.slot - right.slot),
      survival: connection === null ? null : [...connection.db.ownSurvival.iter()][0] ?? null,
      worldSeed: connection === null ? null : [...connection.db.worldSeed.iter()][0] ?? null,
      clock: connection === null ? null : [...connection.db.worldClock.iter()][0] ?? null,
    };
  }

  ownPosition(): PlayerPosition | null {
    const connection = this.connection;
    const identity = this.identity;
    if (connection === null || identity === null) return null;
    return connection.db.playerPosition.identity.find(identity) ?? null;
  }

  setDirection(direction: NetworkDirection): void {
    this.desiredDirection = direction;
    this.sendDesiredDirection();
  }

  setViewRadius(radius: number): void {
    const next = Math.max(1, Math.min(SURVIVAL_CHUNK_COUNT, Math.ceil(radius)));
    if (next === this.viewRadius) return;
    this.viewRadius = next;
    const position = this.ownPosition();
    if (position !== null && this.connection !== null) {
      this.subscribeRegion(this.connection, position.chunkX, position.chunkY);
    }
  }

  private sendDesiredDirection(): void {
    const connection = this.connection;
    if (!this.connected || !this.inputReady || connection === null) return;
    this.sequence += 1n;
    void connection.reducers.setInput({
      direction: this.desiredDirection,
      sequence: this.sequence,
    }).catch((error: unknown) => {
      this.error = error instanceof Error ? error.message : String(error);
      this.onChanged();
    });
  }

  selectHotbar(slot: number): Promise<void> {
    const connection = this.connection;
    if (!this.connected || connection === null) return Promise.reject(new Error('not_connected'));
    return connection.reducers.selectHotbar({ slot }).then(() => undefined);
  }

  harvestResource(resourceId: bigint): Promise<void> {
    const connection = this.connection;
    if (!this.connected || connection === null) return Promise.reject(new Error('not_connected'));
    return connection.reducers.harvestResource({ resourceId }).then(() => undefined);
  }

  private displayName(): string {
    const cleaned = this.slot.replace(/[^A-Za-z0-9 '-]/g, '').trim();
    return cleaned.length >= 3 ? cleaned.slice(0, 20) : 'Farmer One';
  }

  private subscribeGlobals(connection: DbConnection): void {
    connection.subscriptionBuilder()
      .onApplied(() => this.onChanged())
      .onError(() => {
        this.error = 'global_subscription_failed';
        this.onChanged();
      })
      .subscribe([
        tables.playerPublic,
        tables.worldClock,
        tables.worldSeed,
      ]);
  }

  private subscribeSelf(connection: DbConnection, identity: Identity): void {
    connection.subscriptionBuilder()
      .onApplied(() => {
        const row = connection.db.playerPosition.identity.find(identity);
        if (row === null) {
          this.error = 'self_position_missing';
          this.onChanged();
          return;
        }
        this.sequence = row.lastProcessedSequence > this.sequence
          ? row.lastProcessedSequence
          : this.sequence;
        this.inputReady = true;
        this.subscribeRegion(connection, row.chunkX, row.chunkY);
        this.sendDesiredDirection();
        this.onChanged();
      })
      .onError(() => {
        this.error = 'self_subscription_failed';
        this.onChanged();
      })
      .subscribe([
        tables.playerPosition.where((row) => row.identity.eq(identity)),
        tables.ownSurvival,
        tables.ownInventorySlots,
      ]);
  }

  private subscribeRegion(connection: DbConnection, chunkX: number, chunkY: number): void {
    const radius = this.viewRadius;
    const regionKey = `${chunkX},${chunkY},${radius}`;
    if (
      this.pendingRegion === regionKey ||
      (`${this.region[0]},${this.region[1]},${this.subscribedRadius}` === regionKey && this.regionSubscription !== null)
    ) return;
    this.pendingRegion = regionKey;
    const positions = [];
    const resources = [];
    const bounds = subscriptionChunkBounds(chunkX, chunkY, radius);
    for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
      for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
        positions.push(
          tables.playerPosition.where((row) => row.chunkX.eq(x)).where((row) => row.chunkY.eq(y)),
        );
        resources.push(
          tables.worldResource.where((row) => row.chunkX.eq(x)).where((row) => row.chunkY.eq(y)),
        );
      }
    }
    const previous = this.regionSubscription;
    this.regionSubscription = connection.subscriptionBuilder()
      .onApplied(() => {
        this.region = [chunkX, chunkY];
        this.subscribedRadius = radius;
        this.pendingRegion = null;
        if (previous?.isActive()) previous.unsubscribe();
        this.onChanged();
      })
      .onError(() => {
        this.pendingRegion = null;
        this.error = 'region_subscription_failed';
        this.onChanged();
      })
      .subscribe([...positions, ...resources]);
  }

  private bindTableEvents(connection: DbConnection): void {
    const changed = (): void => this.onChanged();
    connection.db.playerPublic.onInsert(changed);
    connection.db.playerPublic.onUpdate(changed);
    connection.db.playerPublic.onDelete(changed);
    connection.db.worldClock.onInsert(changed);
    connection.db.worldClock.onUpdate(changed);
    connection.db.worldSeed.onInsert(changed);
    connection.db.worldSeed.onUpdate(changed);
    connection.db.worldResource.onInsert(changed);
    connection.db.worldResource.onUpdate(changed);
    connection.db.worldResource.onDelete(changed);
    connection.db.ownSurvival.onInsert(changed);
    connection.db.ownSurvival.onUpdate(changed);
    connection.db.ownSurvival.onDelete(changed);
    connection.db.ownInventorySlots.onInsert(changed);
    connection.db.ownInventorySlots.onUpdate(changed);
    connection.db.ownInventorySlots.onDelete(changed);
    connection.db.playerPosition.onInsert((_context, row) => {
      this.updateRegionFor(row);
      changed();
    });
    connection.db.playerPosition.onUpdate((_context, _oldRow, row) => {
      this.updateRegionFor(row);
      changed();
    });
    connection.db.playerPosition.onDelete(changed);
  }

  private updateRegionFor(row: PlayerPosition): void {
    if (this.connection === null || this.identity === null || !row.identity.isEqual(this.identity)) return;
    if (row.lastProcessedSequence > this.sequence) this.sequence = row.lastProcessedSequence;
    this.subscribeRegion(this.connection, row.chunkX, row.chunkY);
  }
}
