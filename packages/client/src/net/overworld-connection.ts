import type { Direction } from '@orchard/sim';
import type { Identity } from 'spacetimedb';
import {
  DbConnection,
  tables,
  type SubscriptionHandle,
} from './generated/index.js';
import type {
  CropPatch,
  FarmActivity,
  FarmParcel,
  PlayerPosition,
  PlayerPublic,
  WorldClock,
  WorldTree,
} from './generated/types.js';

const DEFAULT_DATABASE = 'orchard-cellar-world';

export interface OverworldSnapshot {
  readonly connected: boolean;
  readonly error: string | null;
  readonly identityHex: string | null;
  readonly region: readonly [number, number];
  readonly profiles: readonly PlayerPublic[];
  readonly players: readonly PlayerPosition[];
  readonly parcels: readonly FarmParcel[];
  readonly crops: readonly CropPatch[];
  readonly activity: readonly FarmActivity[];
  readonly trees: readonly WorldTree[];
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
      parcels: connection === null ? [] : [...connection.db.farmParcel.iter()],
      crops: connection === null ? [] : [...connection.db.cropPatch.iter()],
      activity: connection === null ? [] : [...connection.db.farmActivity.iter()],
      trees: connection === null ? [] : [...connection.db.worldTree.iter()],
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

  tendTree(treeId: bigint): Promise<void> {
    const connection = this.connection;
    if (!this.connected || connection === null) return Promise.reject(new Error('not_connected'));
    return connection.reducers.tendTree({ treeId }).then(() => undefined);
  }

  useFarmTile(tileX: number, tileY: number): Promise<void> {
    const connection = this.connection;
    if (!this.connected || connection === null) return Promise.reject(new Error('not_connected'));
    return connection.reducers.useFarmTile({ tileX, tileY }).then(() => undefined);
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
      .subscribe([tables.playerPublic, tables.worldClock, tables.farmParcel, tables.farmActivity]);
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
      .subscribe(tables.playerPosition.where((row) => row.identity.eq(identity)));
  }

  private subscribeRegion(connection: DbConnection, chunkX: number, chunkY: number): void {
    const regionKey = `${chunkX},${chunkY}`;
    if (
      this.pendingRegion === regionKey ||
      (`${this.region[0]},${this.region[1]}` === regionKey && this.regionSubscription !== null)
    ) return;
    this.pendingRegion = regionKey;
    const positions = [];
    const trees = [];
    const crops = [];
    for (let y = chunkY - 1; y <= chunkY + 1; y += 1) {
      for (let x = chunkX - 1; x <= chunkX + 1; x += 1) {
        positions.push(
          tables.playerPosition.where((row) => row.chunkX.eq(x)).where((row) => row.chunkY.eq(y)),
        );
        trees.push(
          tables.worldTree.where((row) => row.chunkX.eq(x)).where((row) => row.chunkY.eq(y)),
        );
        crops.push(
          tables.cropPatch.where((row) => row.chunkX.eq(x)).where((row) => row.chunkY.eq(y)),
        );
      }
    }
    const previous = this.regionSubscription;
    this.regionSubscription = connection.subscriptionBuilder()
      .onApplied(() => {
        this.region = [chunkX, chunkY];
        this.pendingRegion = null;
        if (previous?.isActive()) previous.unsubscribe();
        this.onChanged();
      })
      .onError(() => {
        this.pendingRegion = null;
        this.error = 'region_subscription_failed';
        this.onChanged();
      })
      .subscribe([...positions, ...trees, ...crops]);
  }

  private bindTableEvents(connection: DbConnection): void {
    const changed = (): void => this.onChanged();
    connection.db.playerPublic.onInsert(changed);
    connection.db.playerPublic.onUpdate(changed);
    connection.db.playerPublic.onDelete(changed);
    connection.db.worldTree.onInsert(changed);
    connection.db.worldTree.onUpdate(changed);
    connection.db.worldTree.onDelete(changed);
    connection.db.farmParcel.onInsert(changed);
    connection.db.farmParcel.onUpdate(changed);
    connection.db.farmParcel.onDelete(changed);
    connection.db.cropPatch.onInsert(changed);
    connection.db.cropPatch.onUpdate(changed);
    connection.db.cropPatch.onDelete(changed);
    connection.db.farmActivity.onInsert(changed);
    connection.db.farmActivity.onUpdate(changed);
    connection.db.farmActivity.onDelete(changed);
    connection.db.worldClock.onInsert(changed);
    connection.db.worldClock.onUpdate(changed);
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
