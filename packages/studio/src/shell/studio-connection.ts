import { localProfilesEnabled, oidcConfigured, readOidcSession } from '@orchard/auth';
import { DbConnection, tables, type SubscriptionHandle } from '@orchard/world-bindings';
import type { Identity } from 'spacetimedb';
import type { StudioEnvironment } from './session.js';
import type { StudioLiveRows } from './outliners.js';
import { TILE_SIZE_FIXED, type MapDocumentV3 } from '@orchard/sim';
import type {
  ContentDefinition,
  ContentEditorGrant,
  ContentHead,
  ContentRevision,
  SupportGrant,
} from '@orchard/world-bindings/types';
import type { AdminObjectsApi } from '../admin/objects-api.js';
import type { AdminApi } from '../admin/api.js';
import { fetchStudioSpaceRegistry, StudioLiveAdminServices, StudioLiveAdminWorldService } from '../admin/live-services.js';
import type { AdminWorldApi } from '../admin/world-api.js';
import type { MembershipApi } from '../tools/membership/model.js';
import type { ObserveApi } from '../tools/observe/model.js';
import type { MissingContainerRemedyApi } from '../tools/playbooks/model.js';
import type { WorldPlaytestAdapter } from '../admin/world-playtest-api.js';
import { StudioLiveWorldPlaytestAdapter } from '../admin/live-world-playtest.js';
import { resolveStudioEffectiveRole, studioRoleCan, type StudioRole } from './access.js';
import {
  StudioConnectionRefreshScheduler,
  studioDynamicRowsEqual,
  type StudioConnectionRefreshBatch,
  type StudioConnectionRefreshKind,
} from './studio-connection-refresh.js';
import {
  StudioMapRegionHandover,
  type StudioMapChunkBounds,
  type StudioMapViewport,
} from './studio-map-region.js';

const DEFAULT_DATABASE = 'orchard-cellar-world';
const LIVE_MAP_ID = 'live-island';
/** The authoring map is the complete public overworld. Interior and homestead
 * spaces are separate maps and must not feed this canvas or its live outliner. */
export const STUDIO_LIVE_ISLAND_SPACE_ID = 0;

/** Seven high-volume tables share the generated (space, chunkX, chunkY) index.
 * A single rectangular query per table keeps query count constant as the
 * camera pans or zooms. */
export function studioSpaceSpatialQueries(spaceId: number, bounds: StudioMapChunkBounds) {
  if (!Number.isInteger(spaceId) || spaceId < 0 || spaceId > 65_535) throw new Error('invalid_space_id');
  return Object.freeze([
    tables.worldPlaceable.where((row) => row.spaceId.eq(spaceId))
      .where((row) => row.chunkX.gte(bounds.minimumX)).where((row) => row.chunkX.lte(bounds.maximumX))
      .where((row) => row.chunkY.gte(bounds.minimumY)).where((row) => row.chunkY.lte(bounds.maximumY)),
    tables.worldCombatTarget.where((row) => row.spaceId.eq(spaceId))
      .where((row) => row.chunkX.gte(bounds.minimumX)).where((row) => row.chunkX.lte(bounds.maximumX))
      .where((row) => row.chunkY.gte(bounds.minimumY)).where((row) => row.chunkY.lte(bounds.maximumY)),
    tables.worldResource.where((row) => row.spaceId.eq(spaceId))
      .where((row) => row.chunkX.gte(bounds.minimumX)).where((row) => row.chunkX.lte(bounds.maximumX))
      .where((row) => row.chunkY.gte(bounds.minimumY)).where((row) => row.chunkY.lte(bounds.maximumY)),
    tables.worldSurface.where((row) => row.spaceId.eq(spaceId))
      .where((row) => row.chunkX.gte(bounds.minimumX)).where((row) => row.chunkX.lte(bounds.maximumX))
      .where((row) => row.chunkY.gte(bounds.minimumY)).where((row) => row.chunkY.lte(bounds.maximumY)),
    tables.worldNpc.where((row) => row.spaceId.eq(spaceId))
      .where((row) => row.chunkX.gte(bounds.minimumX)).where((row) => row.chunkX.lte(bounds.maximumX))
      .where((row) => row.chunkY.gte(bounds.minimumY)).where((row) => row.chunkY.lte(bounds.maximumY)),
    tables.worldWildlifeProfile.where((row) => row.spaceId.eq(spaceId))
      .where((row) => row.chunkX.gte(bounds.minimumX)).where((row) => row.chunkX.lte(bounds.maximumX))
      .where((row) => row.chunkY.gte(bounds.minimumY)).where((row) => row.chunkY.lte(bounds.maximumY)),
    tables.worldCrop.where((row) => row.spaceId.eq(spaceId))
      .where((row) => row.chunkX.gte(bounds.minimumX)).where((row) => row.chunkX.lte(bounds.maximumX))
      .where((row) => row.chunkY.gte(bounds.minimumY)).where((row) => row.chunkY.lte(bounds.maximumY)),
  ]);
}

export function studioLiveIslandSpatialQueries(bounds: StudioMapChunkBounds) {
  return studioSpaceSpatialQueries(STUDIO_LIVE_ISLAND_SPACE_ID, bounds);
}

/** The stable read-only metadata subscription owned by Studio. Camera-bounded
 * spatial rows use a separate make-before-break subscription. Keeping this
 * construction exported makes its bandwidth boundary directly testable without
 * opening a socket or relying on a deployed database. */
export function studioInitialSubscriptionQueries() {
  return Object.freeze([
    tables.ownMembership,
    tables.ownAdminMutationPreviews,
    tables.ownConnectionNotices,
    tables.spaceAdminFlag,
    tables.spacePortal,
    tables.worldEnvironment,
    tables.worldWind,
    tables.liveMapDocument.where((row) => row.mapId.eq(LIVE_MAP_ID)),
    tables.homestead,
    tables.playerPosition,
    tables.playerPublic,
    tables.playerAppearance,
    tables.contentHead.where((row) => row.packId.eq('live')),
    tables.contentDefinition,
    tables.ownContentRevisions,
    tables.ownContentEditorGrant,
    tables.ownSupportGrant,
  ]);
}

export function studioEnvironmentHost(environment: Exclude<StudioEnvironment, 'sandbox'>): string {
  if (environment === 'local') return import.meta.env['VITE_SPACETIMEDB_LOCAL_URI']
    ?? import.meta.env['VITE_SPACETIMEDB_URI'] ?? location.origin;
  return import.meta.env['VITE_SPACETIMEDB_PRODUCTION_URI']
    ?? import.meta.env['VITE_SPACETIMEDB_URI']
    ?? (location.hostname === 'cellar.dastari.net' ? location.origin : 'https://cellar.dastari.net');
}

export interface StudioConnectionView {
  readonly connected: boolean;
  readonly synchronizing: boolean;
  readonly identity: string | null;
  readonly role: StudioRole | null;
  readonly contentRevision: bigint | null;
  readonly contentHead?: ContentHead | null;
  readonly contentDefinitions?: readonly ContentDefinition[];
  readonly contentRevisions?: readonly ContentRevision[];
  readonly contentEditorGrant?: ContentEditorGrant | null;
  readonly supportGrant?: SupportGrant | null;
  readonly mapRevision: number | null;
  readonly mapDocument: StudioMapHead | null;
  readonly publishingMap: boolean;
  readonly worldMutating: boolean;
  readonly error: string | null;
  readonly rows: StudioLiveRows;
}

export interface StudioMapHead {
  readonly mapId: string;
  readonly revision: number;
  readonly contentHash: string;
  readonly documentJson: string;
}

export interface StudioLiveAdapter {
  view(): StudioConnectionView;
  connect(): void;
  disconnect(): void;
  /** Supplies the visible live-map camera. Connected adapters use this only to
   * bound read-only subscriptions; it never changes authoritative world state. */
  setMapViewport?(viewport: StudioMapViewport): void;
  spaceRegistry?(): Promise<readonly import('@orchard/sim').SpaceRegistryEntry[]>;
  /** Optional until final generated W4 bindings land. Connected U4 tools fail
   * closed when a live adapter does not implement this boundary. */
  readonly adminObjects?: AdminObjectsApi;
  readonly adminApi?: AdminApi;
  readonly membershipApi?: MembershipApi;
  readonly observeApi?: ObserveApi;
  readonly missingContainerRemedyApi?: MissingContainerRemedyApi;
  /** Final live-service seam for W5 World Control. Anonymous construction and
   * connected adapters without generated W5 bindings remain fail-closed. */
  readonly adminWorld?: AdminWorldApi;
  readonly worldPlaytest?: WorldPlaytestAdapter;
  publishMap?(document: MapDocumentV3, documentJson: string, expectedRevision: number): Promise<void>;
  moveHomestead?(spaceId: number, tileX: number, tileY: number): Promise<void>;
  publishContentChangeSet?(request: {
    readonly packId: string; readonly expectedRevision: bigint;
    readonly clientMutationId: string; readonly upserts: string;
    readonly deletes: string; readonly note: string;
  }): Promise<void>;
  restoreContentRevision?(request: {
    readonly revision: bigint; readonly expectedRevision: bigint;
    readonly clientMutationId: string; readonly note: string;
  }): Promise<void>;
}

const EMPTY_ROWS: StudioLiveRows = Object.freeze({
  placeables: Object.freeze([]), chests: Object.freeze([]),
  combatTargets: Object.freeze([]), resources: Object.freeze([]), surfaces: Object.freeze([]),
  npcs: Object.freeze([]), homesteads: Object.freeze([]), players: Object.freeze([]),
});

interface IdentityProjection {
  toHexString(): string;
}

interface IterableProjectionTable<Row> {
  iter(): Iterable<Row>;
}

interface PlaceableProjectionSource {
  readonly id: bigint; readonly kind: string; readonly tileX: number; readonly tileY: number;
  readonly spaceId: number; readonly facing: string; readonly open: boolean; readonly lit: boolean;
  readonly carriedBy?: unknown; readonly definitionId: string;
  readonly stateJson: string;
  readonly smeltStartTick?: bigint; readonly processStartTick?: bigint;
  readonly barrelSealedTick?: bigint; readonly cookStartTick?: bigint;
}

function isProjectedJsonValue(value: unknown, depth = 0): boolean {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (depth >= 8) return false;
  if (Array.isArray(value)) return value.length <= 1_024
    && value.every((entry) => isProjectedJsonValue(entry, depth + 1));
  return typeof value === 'object' && value !== null
    && Object.keys(value).length <= 1_024
    && Object.values(value).every((entry) => isProjectedJsonValue(entry, depth + 1));
}

function projectedPlaceableState(row: PlaceableProjectionSource) {
  let authored: unknown;
  try { authored = JSON.parse(row.stateJson) as unknown; } catch { authored = {}; }
  const state = typeof authored === 'object' && authored !== null && !Array.isArray(authored)
    && isProjectedJsonValue(authored) ? authored : {};
  return Object.freeze({ ...state, open: row.open, lit: row.lit, facing: row.facing });
}

interface CombatTargetProjectionSource {
  readonly id: bigint; readonly kind: string; readonly x: number; readonly y: number;
  readonly spaceId: number; readonly carriedBy?: unknown;
  readonly definitionId?: string;
  readonly healthCenti: number; readonly maxHealthCenti: number;
}

interface ResourceProjectionSource {
  readonly definitionId?: string;
  readonly id: bigint; readonly kind: string; readonly tileX: number; readonly tileY: number;
  readonly spaceId: number; readonly health: number; readonly depleted: boolean;
  readonly growthStage: number; readonly miningClass: string; readonly richness: number;
  readonly maximumRichness: number;
}

interface SurfaceProjectionSource {
  readonly id: bigint; readonly kind: string; readonly tileX: number; readonly tileY: number;
  readonly spaceId: number;
}

interface NpcProjectionSource {
  readonly id: bigint; readonly kind: string; readonly displayName: string;
  readonly definitionId?: string;
  readonly x: number; readonly y: number; readonly homeX: number; readonly homeY: number;
  readonly rider?: IdentityProjection; readonly facing: string; readonly moving: boolean;
  readonly wanderDirection: string; readonly health: number; readonly spaceId: number;
}

interface WildlifeProjectionSource {
  readonly npcId: bigint; readonly species: string; readonly variant: number;
}

interface PlayerPositionProjectionSource {
  readonly identity: IdentityProjection; readonly spaceId: number;
  readonly x: number; readonly y: number; readonly facing: string; readonly moving: boolean;
  readonly equippedKind: string;
}

interface PlayerPublicProjectionSource {
  readonly identity: IdentityProjection; readonly displayName: string; readonly online: boolean;
}

interface PlayerAppearanceProjectionSource {
  readonly identity: IdentityProjection; readonly hairKind: string; readonly shirtKind: string;
  readonly pantsKind: string; readonly shoesKind: string;
}

interface HomesteadProjectionSource {
  readonly spaceId: number; readonly owner: IdentityProjection; readonly ownerName: string;
  readonly overworldTileX: number; readonly overworldTileY: number;
  readonly sizeTier: number; readonly accessMode: string;
}

export interface StudioRowsProjectionSource {
  readonly worldPlaceable: IterableProjectionTable<PlaceableProjectionSource>;
  readonly worldCombatTarget: IterableProjectionTable<CombatTargetProjectionSource>;
  readonly worldResource: IterableProjectionTable<ResourceProjectionSource>;
  readonly worldSurface: IterableProjectionTable<SurfaceProjectionSource>;
  readonly worldNpc: IterableProjectionTable<NpcProjectionSource>;
  readonly worldWildlifeProfile: IterableProjectionTable<WildlifeProjectionSource>;
  readonly playerPosition: IterableProjectionTable<PlayerPositionProjectionSource>;
  readonly playerPublic: IterableProjectionTable<PlayerPublicProjectionSource>;
  readonly playerAppearance: IterableProjectionTable<PlayerAppearanceProjectionSource>;
  readonly homestead: IterableProjectionTable<HomesteadProjectionSource>;
}

export const STUDIO_ROWS_PROJECTION_TABLES = [
  'placeables', 'combat_targets', 'resources', 'surfaces', 'npcs',
  'wildlife_profiles', 'player_positions', 'player_profiles', 'player_appearances', 'homesteads',
] as const;
export type StudioRowsProjectionTable = typeof STUDIO_ROWS_PROJECTION_TABLES[number];
export type StudioRowsProjectionScanCounts = Readonly<Record<StudioRowsProjectionTable, number>>;

function sameProjectedRows<Row>(
  left: readonly Row[],
  right: readonly Row[],
  same: (left: Row, right: Row) => boolean,
): boolean {
  return left === right || (left.length === right.length
    && left.every((row, index) => right[index] !== undefined && same(row, right[index]!)));
}

const samePlaceable = (left: StudioLiveRows['placeables'][number], right: StudioLiveRows['placeables'][number]): boolean => (
  left.id === right.id && left.spaceId === right.spaceId && left.kind === right.kind
  && left.definitionId === right.definitionId && JSON.stringify(left.state) === JSON.stringify(right.state)
  && left.tileX === right.tileX && left.tileY === right.tileY && left.facing === right.facing
  && left.open === right.open && left.lit === right.lit
  && left.smeltStartTick === right.smeltStartTick && left.processStartTick === right.processStartTick
  && left.barrelSealedTick === right.barrelSealedTick && left.cookStartTick === right.cookStartTick
);

const sameChest = (left: NonNullable<StudioLiveRows['chests']>[number], right: NonNullable<StudioLiveRows['chests']>[number]): boolean => (
  left.id === right.id && left.spaceId === right.spaceId && left.tileX === right.tileX
  && left.tileY === right.tileY && left.open === right.open && left.facing === right.facing
  && left.definitionId === right.definitionId && JSON.stringify(left.state) === JSON.stringify(right.state)
);

const sameCombatTarget = (
  left: NonNullable<StudioLiveRows['combatTargets']>[number],
  right: NonNullable<StudioLiveRows['combatTargets']>[number],
): boolean => left.id === right.id && left.spaceId === right.spaceId && left.kind === right.kind
  && left.definitionId === right.definitionId
  && left.tileX === right.tileX && left.tileY === right.tileY
  && left.healthCenti === right.healthCenti && left.maxHealthCenti === right.maxHealthCenti;

const sameResource = (
  left: NonNullable<StudioLiveRows['resources']>[number],
  right: NonNullable<StudioLiveRows['resources']>[number],
): boolean => left.id === right.id && left.spaceId === right.spaceId && left.kind === right.kind
  && left.definitionId === right.definitionId
  && left.tileX === right.tileX && left.tileY === right.tileY && left.health === right.health
  && left.depleted === right.depleted && left.growthStage === right.growthStage
  && left.miningClass === right.miningClass && left.richness === right.richness
  && left.maximumRichness === right.maximumRichness;

const sameSurface = (
  left: NonNullable<StudioLiveRows['surfaces']>[number],
  right: NonNullable<StudioLiveRows['surfaces']>[number],
): boolean => left.id === right.id && left.spaceId === right.spaceId && left.kind === right.kind
  && left.tileX === right.tileX && left.tileY === right.tileY;

const sameHomestead = (
  left: StudioLiveRows['homesteads'][number],
  right: StudioLiveRows['homesteads'][number],
): boolean => left.spaceId === right.spaceId && left.owner.toHexString() === right.owner.toHexString()
  && left.ownerName === right.ownerName && left.tileX === right.tileX && left.tileY === right.tileY
  && left.sizeTier === right.sizeTier && left.accessMode === right.accessMode;

/** Per-table retained projection. A callback marks only the source table that
 * changed; dependent player/NPC arrays are rebuilt without walking unrelated
 * world collections. Equal semantic projections retain their array and rows
 * object identities, allowing the shell to skip a repaint. */
export class StudioRowsProjection {
  #rows: StudioLiveRows = EMPTY_ROWS;
  readonly #dirty = new Set<StudioRowsProjectionTable>(STUDIO_ROWS_PROJECTION_TABLES);
  readonly #scanCounts = Object.fromEntries(
    STUDIO_ROWS_PROJECTION_TABLES.map((table) => [table, 0]),
  ) as Record<StudioRowsProjectionTable, number>;
  #playerProfiles = new Map<string, PlayerPublicProjectionSource>();
  #playerAppearances = new Map<string, PlayerAppearanceProjectionSource>();
  #wildlifeProfiles = new Map<bigint, WildlifeProjectionSource>();

  rows(): StudioLiveRows { return this.#rows; }

  scanCounts(): StudioRowsProjectionScanCounts {
    return Object.freeze({ ...this.#scanCounts });
  }

  mark(table: StudioRowsProjectionTable): void {
    this.#dirty.add(table);
    if (table === 'wildlife_profiles') this.#dirty.add('npcs');
    if (table === 'player_profiles' || table === 'player_appearances') {
      this.#dirty.add('player_positions');
    }
  }

  markAll(): void {
    for (const table of STUDIO_ROWS_PROJECTION_TABLES) this.#dirty.add(table);
  }

  reset(): void {
    this.#rows = EMPTY_ROWS;
    this.#playerProfiles.clear();
    this.#playerAppearances.clear();
    this.#wildlifeProfiles.clear();
    this.#dirty.clear();
    this.markAll();
  }

  refresh(source: StudioRowsProjectionSource): boolean {
    if (this.#dirty.size === 0) return false;
    const dirty = new Set(this.#dirty);
    this.#dirty.clear();
    const scan = <Row>(table: StudioRowsProjectionTable, rows: IterableProjectionTable<Row>): readonly Row[] => {
      this.#scanCounts[table] += 1;
      return [...rows.iter()];
    };

    if (dirty.has('player_profiles')) {
      this.#playerProfiles = new Map(scan('player_profiles', source.playerPublic)
        .map((row) => [row.identity.toHexString(), row] as const));
    }
    if (dirty.has('player_appearances')) {
      this.#playerAppearances = new Map(scan('player_appearances', source.playerAppearance)
        .map((row) => [row.identity.toHexString(), row] as const));
    }
    if (dirty.has('wildlife_profiles')) {
      this.#wildlifeProfiles = new Map(scan('wildlife_profiles', source.worldWildlifeProfile)
        .map((row) => [row.npcId, row] as const));
    }

    let placeables = this.#rows.placeables;
    let chests = this.#rows.chests ?? [];
    let combatTargets = this.#rows.combatTargets ?? [];
    let resources = this.#rows.resources ?? [];
    let surfaces = this.#rows.surfaces ?? [];
    let npcs = this.#rows.npcs;
    let homesteads = this.#rows.homesteads;
    let players = this.#rows.players;
    let changed = false;

    if (dirty.has('placeables')) {
      const rows = scan('placeables', source.worldPlaceable).filter((row) => row.carriedBy === undefined);
      const nextPlaceables = Object.freeze(rows.filter((row) => row.definitionId !== 'object:chest'
        && row.kind !== 'chest').map((row) => ({
        id: row.id, spaceId: row.spaceId, kind: row.kind, tileX: row.tileX, tileY: row.tileY,
        definitionId: row.definitionId,
        state: projectedPlaceableState(row), facing: row.facing, open: row.open, lit: row.lit,
        smeltStartTick: row.smeltStartTick, processStartTick: row.processStartTick,
        barrelSealedTick: row.barrelSealedTick, cookStartTick: row.cookStartTick,
      })));
      const nextChests = Object.freeze(rows.filter((row) => row.definitionId === 'object:chest'
        || row.kind === 'chest').map((row) => ({
        id: row.id, spaceId: row.spaceId, tileX: row.tileX, tileY: row.tileY,
        definitionId: row.definitionId, state: projectedPlaceableState(row),
        open: row.open, facing: row.facing,
      })));
      if (!sameProjectedRows(placeables, nextPlaceables, samePlaceable)) {
        placeables = nextPlaceables;
        changed = true;
      }
      if (!sameProjectedRows(chests, nextChests, sameChest)) {
        chests = nextChests;
        changed = true;
      }
    }

    if (dirty.has('combat_targets')) {
      const next = Object.freeze(scan('combat_targets', source.worldCombatTarget)
        .filter((row) => row.carriedBy === undefined).map((row) => ({
          id: row.id, spaceId: row.spaceId, kind: row.kind, definitionId: row.definitionId ?? '',
          tileX: Math.floor(row.x / TILE_SIZE_FIXED), tileY: Math.floor(row.y / TILE_SIZE_FIXED),
          healthCenti: row.healthCenti, maxHealthCenti: row.maxHealthCenti,
        })));
      if (!sameProjectedRows(combatTargets, next, sameCombatTarget)) {
        combatTargets = next;
        changed = true;
      }
    }

    if (dirty.has('resources')) {
      const next = Object.freeze(scan('resources', source.worldResource).map((row) => ({
        id: row.id, spaceId: row.spaceId, kind: row.kind, tileX: row.tileX, tileY: row.tileY,
        definitionId: row.definitionId,
        health: row.health, depleted: row.depleted, growthStage: row.growthStage,
        miningClass: row.miningClass, richness: row.richness, maximumRichness: row.maximumRichness,
      })));
      if (!sameProjectedRows(resources, next, sameResource)) {
        resources = next;
        changed = true;
      }
    }

    if (dirty.has('surfaces')) {
      const next = Object.freeze(scan('surfaces', source.worldSurface).map((row) => ({
        id: row.id, spaceId: row.spaceId, kind: row.kind, tileX: row.tileX, tileY: row.tileY,
      })));
      if (!sameProjectedRows(surfaces, next, sameSurface)) {
        surfaces = next;
        changed = true;
      }
    }

    if (dirty.has('homesteads')) {
      const next = Object.freeze(scan('homesteads', source.homestead).map((row) => ({
        spaceId: row.spaceId, owner: row.owner, ownerName: row.ownerName,
        tileX: row.overworldTileX, tileY: row.overworldTileY,
        sizeTier: row.sizeTier, accessMode: row.accessMode,
      })));
      if (!sameProjectedRows(homesteads, next, sameHomestead)) {
        homesteads = next;
        changed = true;
      }
    }

    if (dirty.has('npcs')) {
      const next = Object.freeze(scan('npcs', source.worldNpc).map((row) => ({
        id: row.id, spaceId: row.spaceId, kind: row.kind, definitionId: row.definitionId,
        displayName: row.displayName,
        x: row.x, y: row.y, homeX: row.homeX, homeY: row.homeY,
        riderIdentity: row.rider?.toHexString(), facing: row.facing, moving: row.moving,
        wanderDirection: row.wanderDirection, health: row.health,
        species: this.#wildlifeProfiles.get(row.id)?.species,
        variant: this.#wildlifeProfiles.get(row.id)?.variant,
      })));
      if (!studioDynamicRowsEqual({ npcs, players }, { npcs: next, players })) {
        npcs = next;
        changed = true;
      }
    }

    if (dirty.has('player_positions')) {
      const next = Object.freeze(scan('player_positions', source.playerPosition).map((row) => {
        const identity = row.identity.toHexString();
        const profile = this.#playerProfiles.get(identity);
        const appearance = this.#playerAppearances.get(identity);
        return {
          identity: row.identity, spaceId: row.spaceId,
          displayName: profile?.displayName, online: profile?.online,
          x: row.x, y: row.y, facing: row.facing, moving: row.moving,
          equippedKind: row.equippedKind,
          ...(appearance === undefined ? {} : { appearance: {
            hairKind: appearance.hairKind, shirtKind: appearance.shirtKind,
            pantsKind: appearance.pantsKind, shoesKind: appearance.shoesKind,
          } }),
        };
      }));
      if (!studioDynamicRowsEqual({ npcs, players }, { npcs, players: next })) {
        players = next;
        changed = true;
      }
    }

    if (changed) this.#rows = Object.freeze({
      placeables, chests, combatTargets, resources, surfaces, npcs, homesteads, players,
    });
    return changed;
  }
}

/** One explicitly-created connection for the entire Studio shell. Tools only
 * consume the structural view and never open their own subscriptions. */
export class StudioConnection implements StudioLiveAdapter {
  #connection: DbConnection | null = null;
  #subscription: SubscriptionHandle | null = null;
  #mapRegion: StudioMapRegionHandover<SubscriptionHandle> | null = null;
  #mapViewport: StudioMapViewport | null = null;
  #subscriptionReady = false;
  #connectionGeneration = 0;
  #connected = false;
  #synchronizing = false;
  #identity: Identity | null = null;
  #role: StudioRole | null = null;
  #mapRevision: number | null = null;
  #mapDocument: StudioMapHead | null = null;
  #contentHead: ContentHead | null = null;
  #contentDefinitions: readonly ContentDefinition[] = Object.freeze([]);
  #contentRevisions: readonly ContentRevision[] = Object.freeze([]);
  #contentEditorGrant: ContentEditorGrant | null = null;
  #supportGrant: SupportGrant | null = null;
  #publishingMap = false;
  #worldMutating = false;
  #error: string | null = null;
  #rows: StudioLiveRows = EMPTY_ROWS;
  readonly #rowsProjection = new StudioRowsProjection();
  readonly #refreshScheduler: StudioConnectionRefreshScheduler;
  readonly #adminServices = new StudioLiveAdminServices(() => this.#connected ? this.#connection : null);
  readonly #adminWorldService = new StudioLiveAdminWorldService(
    () => this.#connected ? this.#connection : null, this.#adminServices,
  );
  readonly #worldPlaytestService = new StudioLiveWorldPlaytestAdapter(
    () => this.#connected ? this.#connection : null,
  );

  get adminObjects(): AdminObjectsApi { return this.#adminServices; }
  get adminApi(): AdminApi { return this.#adminServices; }
  get membershipApi(): MembershipApi { return this.#adminServices; }
  get observeApi(): ObserveApi { return this.#adminServices; }
  get missingContainerRemedyApi(): MissingContainerRemedyApi { return this.#adminServices; }
  get adminWorld(): AdminWorldApi { return this.#adminWorldService; }
  get worldPlaytest(): WorldPlaytestAdapter { return this.#worldPlaytestService; }

  constructor(
    private readonly environment: Exclude<StudioEnvironment, 'sandbox'>,
    private readonly onChanged: () => void,
    private readonly host = studioEnvironmentHost(environment),
    private readonly database = import.meta.env['VITE_SPACETIMEDB_DATABASE'] ?? DEFAULT_DATABASE,
  ) {
    this.#refreshScheduler = new StudioConnectionRefreshScheduler(
      (batch) => this.flushScheduledRefresh(batch),
    );
  }

  view(): StudioConnectionView {
    return Object.freeze({
      connected: this.#connected, synchronizing: this.#synchronizing,
      identity: this.#identity?.toHexString() ?? null, role: this.#role,
      contentRevision: this.#contentHead?.revision ?? null,
      contentHead: this.#contentHead,
      contentDefinitions: this.#contentDefinitions,
      contentRevisions: this.#contentRevisions,
      contentEditorGrant: this.#contentEditorGrant,
      supportGrant: this.#supportGrant,
      mapRevision: this.#mapRevision,
      mapDocument: this.#mapDocument,
      publishingMap: this.#publishingMap,
      worldMutating: this.#worldMutating,
      error: this.#error,
      rows: this.#rows,
    });
  }

  async spaceRegistry() {
    if (this.#connection === null || !this.#connected) throw new Error('not_connected');
    return fetchStudioSpaceRegistry(this.#connection);
  }

  setMapViewport(viewport: StudioMapViewport): void {
    if (!Number.isInteger(viewport.spaceId) || viewport.spaceId < 0 || viewport.spaceId > 65_535) throw new Error('invalid_space_id');
    this.#mapViewport = Object.freeze({ ...viewport });
    if (this.#subscriptionReady) this.#mapRegion?.request(this.#mapViewport);
  }

  connect(): void {
    if (this.#connection !== null) return;
    const generation = ++this.#connectionGeneration;
    const oidc = readOidcSession();
    if (this.environment === 'production' && oidc === null) throw new Error('authentication_required');
    if (this.environment === 'local' && oidc === null && !localProfilesEnabled) {
      throw new Error(oidcConfigured ? 'authentication_required' : 'account_login_not_configured');
    }
    const tokenKey = `orchard:world:${this.host}:${this.database}:studio:token`;
    const localToken = this.environment === 'local' && localProfilesEnabled
      ? localStorage.getItem(tokenKey) ?? undefined : undefined;
    const savedToken = oidc?.idToken ?? localToken;
    this.#synchronizing = true;
    this.#error = null;
    this.onChanged();
    this.#connection = DbConnection.builder()
      .withUri(this.host)
      .withDatabaseName(this.database)
      .withToken(savedToken)
      .onConnect((connection, identity, token) => {
        if (generation !== this.#connectionGeneration) {
          connection.disconnect();
          return;
        }
        if (this.environment === 'local' && localProfilesEnabled && oidc === null && savedToken === undefined) {
          localStorage.setItem(tokenKey, token);
        }
        this.#connected = true;
        this.#identity = identity;
        this.bind(connection);
        this.#mapRegion = new StudioMapRegionHandover<SubscriptionHandle>(
          (plan, onApplied, onError) => connection.subscriptionBuilder()
            .onApplied(onApplied)
            .onError(onError)
            .subscribe([...studioSpaceSpatialQueries(plan.spaceId, plan.subscription)]),
          () => {
            if (generation !== this.#connectionGeneration || connection !== this.#connection) return;
            this.#rowsProjection.markAll();
            const changed = this.refreshRows(connection);
            this.#refreshScheduler.noteRowsRefresh();
            const recovered = this.#error === 'studio_region_subscription_failed';
            if (recovered) this.#error = null;
            if (changed || recovered) this.onChanged();
          },
          () => {
            if (generation !== this.#connectionGeneration || connection !== this.#connection) return;
            this.#error = 'studio_region_subscription_failed';
            this.onChanged();
          },
        );
        this.#subscription = connection.subscriptionBuilder()
          .onApplied(() => {
            if (generation !== this.#connectionGeneration || connection !== this.#connection) return;
            this.#refreshScheduler.cancel();
            this.refreshControl(connection);
            this.#rowsProjection.markAll();
            this.refreshRows(connection);
            this.#refreshScheduler.noteRowsRefresh();
            this.#subscriptionReady = true;
            this.#synchronizing = false;
            if (this.#mapViewport !== null) this.#mapRegion?.request(this.#mapViewport, true);
            this.onChanged();
          })
          .onError(() => {
            if (generation !== this.#connectionGeneration || connection !== this.#connection) return;
            this.#error = 'studio_subscription_failed';
            this.#synchronizing = false;
            this.onChanged();
          })
          .subscribe([...studioInitialSubscriptionQueries()]);
        this.onChanged();
      })
      .onConnectError((_context, error) => {
        if (generation === this.#connectionGeneration) this.reset(error.message);
      })
      .onDisconnect((_context, error) => {
        if (generation === this.#connectionGeneration) this.reset(error?.message ?? 'disconnected');
      })
      .build();
  }

  disconnect(): void {
    this.#connectionGeneration += 1;
    this.#mapRegion?.dispose();
    this.#mapRegion = null;
    if (this.#subscription?.isActive()) this.#subscription.unsubscribe();
    this.#subscription = null;
    const connection = this.#connection;
    this.#connection = null;
    connection?.disconnect();
    this.reset(null);
  }

  async publishMap(
    document: MapDocumentV3,
    documentJson: string,
    expectedRevision: number,
  ): Promise<void> {
    const connection = this.#connection;
    if (!this.#connected || connection === null) throw new Error('not_connected');
    if (!studioRoleCan(this.#role, 'publish_map')) {
      throw new Error('map_publish_role_required');
    }
    if (this.#publishingMap) throw new Error('publish_in_progress');
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0 || expectedRevision > 0xffff_ffff) {
      throw new Error('invalid_map_base_revision');
    }
    this.#publishingMap = true;
    this.#error = null;
    this.onChanged();
    try {
      await connection.reducers.publishLiveMapDocument({
        mapId: document.id,
        expectedRevision,
        documentJson,
        clientMutationId: crypto.randomUUID(),
      });
    } catch (error: unknown) {
      this.#error = error instanceof Error ? error.message : String(error);
      throw error;
    } finally {
      this.#publishingMap = false;
      this.onChanged();
    }
  }

  async moveHomestead(spaceId: number, tileX: number, tileY: number): Promise<void> {
    const connection = this.#connection;
    if (!this.#connected || connection === null) throw new Error('not_connected');
    if (this.#role !== 'owner' && this.#role !== 'admin') throw new Error('owner_or_admin_required');
    if (this.#worldMutating) throw new Error('world_mutation_in_progress');
    this.#worldMutating = true;
    this.#error = null;
    this.onChanged();
    try {
      await connection.reducers.adminMoveHomestead({ spaceId, tileX, tileY });
    } catch (error: unknown) {
      this.#error = error instanceof Error ? error.message : String(error);
      throw error;
    } finally {
      this.#worldMutating = false;
      this.onChanged();
    }
  }

  async publishContentChangeSet(request: {
    readonly packId: string; readonly expectedRevision: bigint;
    readonly clientMutationId: string; readonly upserts: string;
    readonly deletes: string; readonly note: string;
  }): Promise<void> {
    const connection = this.#connection;
    if (!this.#connected || connection === null) throw new Error('not_connected');
    if (!studioRoleCan(this.#role, 'publish_content')) {
      throw new Error('content_editor_required');
    }
    await connection.reducers.publishContentChangeSet(request);
  }

  async restoreContentRevision(request: {
    readonly revision: bigint; readonly expectedRevision: bigint;
    readonly clientMutationId: string; readonly note: string;
  }): Promise<void> {
    const connection = this.#connection;
    if (!this.#connected || connection === null) throw new Error('not_connected');
    if (!studioRoleCan(this.#role, 'publish_content')) {
      throw new Error('content_editor_required');
    }
    await connection.reducers.restoreContentRevision(request);
  }

  private bind(connection: DbConnection): void {
    const refresh = (kind: StudioConnectionRefreshKind): (() => void) => () => {
      if (connection !== this.#connection || this.#synchronizing) return;
      this.#refreshScheduler.mark(kind);
    };
    for (const table of [
      connection.db.ownMembership, connection.db.liveMapDocument,
      connection.db.contentHead, connection.db.contentDefinition,
      connection.db.ownContentRevisions, connection.db.ownContentEditorGrant,
      connection.db.ownSupportGrant,
    ]) {
      const listener = refresh('control');
      table.onInsert(listener);
      table.onUpdate(listener);
      table.onDelete(listener);
    }
    for (const [table, projection] of [
      [connection.db.homestead, 'homesteads'],
      [connection.db.worldPlaceable, 'placeables'],
      [connection.db.worldCombatTarget, 'combat_targets'],
      [connection.db.worldResource, 'resources'],
      [connection.db.worldSurface, 'surfaces'],
      [connection.db.worldWildlifeProfile, 'wildlife_profiles'],
      [connection.db.playerPublic, 'player_profiles'],
      [connection.db.playerAppearance, 'player_appearances'],
    ] as const) {
      const listener = (): void => {
        if (connection !== this.#connection || this.#synchronizing) return;
        this.#rowsProjection.mark(projection);
        this.#refreshScheduler.mark('structural_rows');
      };
      table.onInsert(listener);
      table.onUpdate(listener);
      table.onDelete(listener);
    }
    for (const [table, projection] of [
      [connection.db.worldNpc, 'npcs'],
      [connection.db.playerPosition, 'player_positions'],
    ] as const) {
      const listener = (): void => {
        if (connection !== this.#connection || this.#synchronizing) return;
        this.#rowsProjection.mark(projection);
        this.#refreshScheduler.mark('live_rows');
      };
      table.onInsert(listener);
      table.onUpdate(listener);
      table.onDelete(listener);
    }
  }

  private flushScheduledRefresh(batch: StudioConnectionRefreshBatch): void {
    const connection = this.#connection;
    if (connection === null || !this.#connected || this.#synchronizing) return;
    let changed = batch.control;
    if (batch.control) this.refreshControl(connection);
    if (batch.rowScope === 'all') {
      changed = this.refreshRows(connection) || changed;
    } else if (batch.rowScope === 'dynamic') {
      changed = this.refreshRows(connection) || changed;
    }
    if (changed) this.onChanged();
  }

  private refreshControl(connection: DbConnection): void {
    const membership = [...connection.db.ownMembership.iter()][0] ?? null;
    this.#contentEditorGrant = [...connection.db.ownContentEditorGrant.iter()][0] ?? null;
    this.#supportGrant = [...connection.db.ownSupportGrant.iter()][0] ?? null;
    this.#role = resolveStudioEffectiveRole(membership, this.#contentEditorGrant, this.#supportGrant);
    const mapDocument = connection.db.liveMapDocument.mapId.find(LIVE_MAP_ID);
    this.#mapRevision = mapDocument?.revision ?? null;
    if (mapDocument === undefined || mapDocument === null) this.#mapDocument = null;
    else if (this.#mapDocument === null || this.#mapDocument.mapId !== mapDocument.mapId
      || this.#mapDocument.revision !== mapDocument.revision
      || this.#mapDocument.contentHash !== mapDocument.contentHash
      || this.#mapDocument.documentJson !== mapDocument.documentJson) {
      this.#mapDocument = Object.freeze({
        mapId: mapDocument.mapId,
        revision: mapDocument.revision,
        contentHash: mapDocument.contentHash,
        documentJson: mapDocument.documentJson,
      });
    }
    this.#contentHead = connection.db.contentHead.packId.find('live');
    this.#contentDefinitions = Object.freeze([...connection.db.contentDefinition.iter()]
      .sort((left, right) => left.id.localeCompare(right.id)));
    this.#contentRevisions = Object.freeze([...connection.db.ownContentRevisions.iter()]
      .sort((left, right) => left.revision < right.revision ? 1 : left.revision > right.revision ? -1 : 0));
  }

  private refreshRows(connection: DbConnection): boolean {
    const changed = this.#rowsProjection.refresh({
      worldPlaceable: connection.db.worldPlaceable,
      worldCombatTarget: connection.db.worldCombatTarget,
      worldResource: connection.db.worldResource,
      worldSurface: connection.db.worldSurface,
      worldNpc: connection.db.worldNpc,
      worldWildlifeProfile: connection.db.worldWildlifeProfile,
      playerPosition: connection.db.playerPosition,
      playerPublic: connection.db.playerPublic,
      playerAppearance: connection.db.playerAppearance,
      homestead: connection.db.homestead,
    });
    if (changed) this.#rows = this.#rowsProjection.rows();
    return changed;
  }

  private reset(error: string | null): void {
    this.#refreshScheduler.cancel();
    this.#mapRegion?.dispose();
    this.#mapRegion = null;
    this.#subscriptionReady = false;
    this.#connection = null;
    this.#subscription = null;
    this.#connected = false;
    this.#synchronizing = false;
    this.#identity = null;
    this.#role = null;
    this.#mapRevision = null;
    this.#mapDocument = null;
    this.#contentHead = null;
    this.#contentDefinitions = Object.freeze([]);
    this.#contentRevisions = Object.freeze([]);
    this.#contentEditorGrant = null;
    this.#supportGrant = null;
    this.#publishingMap = false;
    this.#worldMutating = false;
    this.#rowsProjection.reset();
    this.#rows = EMPTY_ROWS;
    this.#error = error;
    this.onChanged();
  }
}
