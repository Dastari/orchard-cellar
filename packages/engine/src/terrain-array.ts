/** The terrain arrays renderers, collision and lighting read for one space.
 * A type-only leaf (static-world S6a) so generator-free modules can name it
 * without importing `terrain.ts`, which re-exports it. */
import type {
  RaisedTerrainTileSet,
  RuntimeTilesetResolver,
  SpaceDefinition,
  TerrainOverride,
  TerrainSurfaceFamilyId,
  TerrainTransition,
} from '@orchard/sim';

export interface TerrainArray {
  readonly traversalChannels?: import('@orchard/sim').MediumCollisionChannels;
  readonly spaceId: number;
  readonly seed: number;
  readonly version: number;
  readonly width: number;
  readonly height: number;
  /** World tile of the arrays' top-left cell (default 0, 0). Every per-cell
   * channel is a `width` x `height` window starting here; index it through
   * `terrainIndexAt`, never by hand. */
  readonly originX?: number;
  readonly originY?: number;
  /** Size of the whole map in tiles when this terrain is a chunk render window
   * (static world S4c); defaults to `width` x `height`. Map-border rules (the
   * fixed-plane border ring) use it rather than the window edge. */
  readonly worldWidth?: number;
  readonly worldHeight?: number;
  /** Map-wide elevation extremes for a chunk render window, whose own cells
   * may not include them; plane channels are indexed from the map minimum.
   * Whole maps omit it and measure `elevations`. */
  readonly elevationRange?: { readonly minimum: number; readonly maximum: number };
  readonly generator?: SpaceDefinition["generator"];
  readonly rogueTheme?: string;
  readonly rogueHazards?: Uint8Array;
  readonly rogueRoomRevision?: string;
  readonly hearthLobbyFloorThresholdY?: number;
  /** Authored interior materials: 0 rustic wood, 1 townhouse parquet, 2 stone, 3 planting soil. */
  readonly hearthInteriorFloorStyles?: Uint8Array;
  readonly defaultCliffFamily?: string;
  /** Space-wide projection contract. Per-cell cliff families select artwork;
   * they must not change the map's datum, projection, or collision plane. */
  readonly projectionStyle?: RaisedTerrainTileSet["projectionStyle"];
  readonly baseDatum?: number;
  /** `null` explicitly opts out of a family default fixed plane. */
  readonly fixedTerrainPlane?: number | null;
  /** Optional per-cell family ordinals into `cliffFamilyIds`. Legacy terrain
   * without a palette continues to use TERRAIN_CLIFF_FAMILY_IDS. */
  readonly cliffFamilies?: Uint8Array;
  readonly cliffFamilyIds?: readonly string[];
  /** Active authored family resolver retained by live/editor map compilation. */
  readonly tilesets?: RuntimeTilesetResolver;
  readonly defaultSurfaceFamily?: TerrainSurfaceFamilyId;
  /** Optional per-cell surface-family ordinals; zero inherits the default. */
  readonly surfaceFamilies?: Uint8Array;
  /** Sparse authoritative final substitutions from MapDocumentV2. */
  readonly terrainOverrides?: readonly (TerrainOverride | null)[];
  /** Sparse authored cell part stacks (wiki: Studio/Map Editor, Cell parts), keyed by
   * `terrainIndexAt(terrain, tileX, tileY)`. Only non-contour exact parts are read here;
   * contour parts arrive through `terrainOverrides`. Absent on pre-parts maps. */
  readonly cellParts?: ReadonlyMap<number, readonly import('@orchard/sim').CellPart[]>;
  /** Visual-only authored farmland from MapDocument features. This dry mask is
   * deliberately separate from authority-backed world soil and crop state. */
  readonly authoredFarmland?: Uint8Array;
  /** Compiled authored substrate, retained for per-cell interior floor rendering. */
  readonly authoredSurfaces?: readonly import('@orchard/sim').MapSurfaceKind[];
  /** Per-cell zero-height ledge/lip mask. */
  readonly ledges?: Uint8Array;
  readonly biomes: Uint8Array;
  readonly blocked: readonly boolean[];
  readonly residenceEnvelopeBlocked?: readonly boolean[];
  readonly residenceArchitecture?: readonly import('@orchard/sim').HearthArchitectureCell[];
  readonly horseJumpableTerrain: readonly boolean[];
  /** Integer logical terrain height. This is the editor/generator source of
   * truth; every raised contour is derived independently from it. */
  readonly elevations: Int16Array;
  /** Present on v2/generated/editor terrain. Omission preserves the legacy
   * island's collision-authored ramps; an empty list means no crossings. */
  readonly terrainTransitions?: readonly TerrainTransition[];
  /** Elevation-owned wall geometry. Cellars rebuild this sparse mask whenever
   * excavation changes so prediction and the terrain inspector agree. */
  readonly terrainPlaneBlocked?: Uint8Array;
  /** True when `blocked`/biomes already include every nested contour plan. */
  readonly raisedTerrainCollisionClassified?: true;
  readonly dirtCliffRoles: Uint8Array;
  readonly dirtTerraces: Uint8Array;
}
