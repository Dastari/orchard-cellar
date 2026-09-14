import {
  TERRAIN_SURFACE_FAMILY_IDS,
  type TerrainSurfaceFamilyId,
} from './terrain-tilesets.js';
import type { RaisedTerrainRole } from './raised-terrain-autotile.js';
import {
  TERRAIN_TRANSITION_KINDS,
  stairRunValid,
  terrainTransitionValid,
  type StairRun,
  type TerrainTransition,
} from './terrain-elevation.js';
import {
  SURVIVAL_WORLD_SEED,
  survivalBiomeAt,
  survivalTerrainBlocksTraversalAt,
  survivalTerrainHeightAt,
  type SurvivalBiome,
} from './survival-world.js';

export const MAP_DOCUMENT_SCHEMA_VERSION = 2 as const;
export const MAP_SURFACE_KINDS = [
  'grass', 'sand', 'stone', 'cave_floor', 'water', 'dirt',
] as const;
export type MapSurfaceKind = typeof MAP_SURFACE_KINDS[number];

export const MAP_FEATURE_KINDS = ['none', 'path', 'river', 'farmland'] as const;
export type MapFeatureKind = typeof MAP_FEATURE_KINDS[number];

export const MAP_COLLISION_OVERRIDES = ['inherit', 'force_block', 'force_walk'] as const;
export type MapCollisionOverride = typeof MAP_COLLISION_OVERRIDES[number];

export interface TerrainOverride {
  /** Exact independently-resolved contour this substitution belongs to. */
  readonly contourLevel: number;
  readonly role?: RaisedTerrainRole;
  readonly frameIndex?: number;
  readonly family?: string;
}

export interface MapCellOverride {
  readonly elevation?: number;
  readonly surface?: MapSurfaceKind;
  readonly feature?: MapFeatureKind;
  readonly collision?: MapCollisionOverride;
  readonly collisionReason?: string;
  readonly cliffFamily?: string;
  readonly surfaceFamily?: TerrainSurfaceFamilyId;
  readonly terrainOverride?: TerrainOverride;
  /** Zero-height lip/barrier overlay. This never changes logical elevation. */
  readonly ledge?: boolean;
}

export interface MapSceneryPlacement {
  readonly id: string;
  readonly assetId: string;
  readonly tileX: number;
  readonly tileY: number;
  readonly elevation: number;
  readonly state?: string;
}

export const MAP_GAMEPLAY_ANCHOR_KINDS = [
  'spawn', 'portal', 'poi', 'npc', 'resource', 'label',
] as const;
export type MapGameplayAnchorKind = typeof MAP_GAMEPLAY_ANCHOR_KINDS[number];
export const MAP_GAMEPLAY_ANCHOR_LABEL_MAX_LENGTH = 96;
export const MAP_GAMEPLAY_ANCHOR_ELEVATION_MINIMUM = -32;
export const MAP_GAMEPLAY_ANCHOR_ELEVATION_MAXIMUM = 32;

const MAP_GAMEPLAY_ANCHOR_ID = /^[a-z0-9][a-z0-9_-]{0,95}$/u;

export function mapGameplayAnchorIdValid(id: string): boolean {
  return MAP_GAMEPLAY_ANCHOR_ID.test(id);
}

export function mapGameplayAnchorKindRequiresLabel(kind: MapGameplayAnchorKind): boolean {
  return kind === 'poi' || kind === 'label';
}

export interface MapGameplayAnchor {
  readonly id: string;
  readonly kind: MapGameplayAnchorKind;
  readonly tileX: number;
  readonly tileY: number;
  readonly elevation: number;
  readonly label?: string;
}

export function parseMapGameplayAnchor(
  value: unknown,
  width: number,
  height: number,
): MapGameplayAnchor | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const kind = candidate['kind'];
  const label = typeof candidate['label'] === 'string' ? candidate['label'].trim() : undefined;
  if (typeof candidate['id'] !== 'string' || !mapGameplayAnchorIdValid(candidate['id'])
    || !MAP_GAMEPLAY_ANCHOR_KINDS.includes(kind as MapGameplayAnchorKind)
    || !Number.isInteger(candidate['tileX']) || (candidate['tileX'] as number) < 0
    || (candidate['tileX'] as number) >= width
    || !Number.isInteger(candidate['tileY']) || (candidate['tileY'] as number) < 0
    || (candidate['tileY'] as number) >= height
    || !Number.isInteger(candidate['elevation'])
    || (candidate['elevation'] as number) < MAP_GAMEPLAY_ANCHOR_ELEVATION_MINIMUM
    || (candidate['elevation'] as number) > MAP_GAMEPLAY_ANCHOR_ELEVATION_MAXIMUM
    || (candidate['label'] !== undefined && typeof candidate['label'] !== 'string')
    || (label !== undefined && (label.length < 1 || label.length > MAP_GAMEPLAY_ANCHOR_LABEL_MAX_LENGTH))
    || (mapGameplayAnchorKindRequiresLabel(kind as MapGameplayAnchorKind) && label === undefined)) return null;
  return {
    id: candidate['id'],
    kind: kind as MapGameplayAnchorKind,
    tileX: candidate['tileX'] as number,
    tileY: candidate['tileY'] as number,
    elevation: candidate['elevation'] as number,
    ...(label === undefined ? {} : { label }),
  };
}

export interface MapProvenance {
  readonly kind: 'authored' | 'generated' | 'imported';
  readonly source: string;
  readonly generator?: string;
  readonly generatorSeed?: number;
  readonly generatorVersion?: number;
}

/** Asset-independent source document. Keys in `cells` are canonical `x,y`
 * coordinates and store only authored differences from the base material. */
export interface MapDocumentV2 {
  readonly schemaVersion: typeof MAP_DOCUMENT_SCHEMA_VERSION;
  readonly id: string;
  readonly title: string;
  readonly width: number;
  readonly height: number;
  readonly tileSize: 16;
  readonly themeId: string;
  readonly baseElevation: number;
  readonly baseSurface: MapSurfaceKind;
  /** Missing only on pre-registry schema-v2 documents; normalization supplies
   * stone_1 so existing authored files migrate without a schema fork. */
  readonly defaultCliffFamily?: string;
  readonly defaultSurfaceFamily?: TerrainSurfaceFamilyId;
  readonly revision: number;
  readonly cells: Readonly<Record<string, MapCellOverride>>;
  readonly transitions: readonly TerrainTransition[];
  readonly stairRuns?: readonly StairRun[];
  readonly scenery: readonly MapSceneryPlacement[];
  readonly anchors: readonly MapGameplayAnchor[];
  readonly provenance: MapProvenance;
}

export interface ResolvedMapCell {
  readonly elevation: number;
  readonly surface: MapSurfaceKind;
  readonly feature: MapFeatureKind;
  readonly collision: MapCollisionOverride;
  readonly collisionReason: string | null;
  readonly cliffFamily: string;
  readonly surfaceFamily: TerrainSurfaceFamilyId;
  readonly terrainOverride: TerrainOverride | null;
  readonly ledge: boolean;
}

export interface TerrainMaterialDefinition {
  readonly surface: MapSurfaceKind;
  readonly medium: 'ground' | 'liquid';
  readonly walkable: boolean;
  readonly blocksLight: boolean;
  readonly topology: 'flat' | 'blob' | 'liquid';
}

export const TERRAIN_MATERIAL_DEFINITIONS: Readonly<Record<MapSurfaceKind, TerrainMaterialDefinition>> = {
  grass: { surface: 'grass', medium: 'ground', walkable: true, blocksLight: false, topology: 'flat' },
  sand: { surface: 'sand', medium: 'ground', walkable: true, blocksLight: false, topology: 'blob' },
  stone: { surface: 'stone', medium: 'ground', walkable: true, blocksLight: false, topology: 'flat' },
  cave_floor: { surface: 'cave_floor', medium: 'ground', walkable: true, blocksLight: false, topology: 'flat' },
  water: { surface: 'water', medium: 'liquid', walkable: false, blocksLight: false, topology: 'liquid' },
  dirt: { surface: 'dirt', medium: 'ground', walkable: true, blocksLight: false, topology: 'blob' },
};

export type MapTerrainRole =
  | `surface.${MapSurfaceKind}`
  | 'feature.path'
  | 'feature.river'
  | 'contour.edge'
  | 'contour.inset'
  | 'contour.face'
  | 'contour.face_foot'
  | 'crossing.slope'
  | 'crossing.stairs';

export interface MapThemeAssetRole {
  readonly assetId: string;
  readonly state?: string;
  readonly animation?: string;
}

export interface MapThemeManifest {
  readonly id: string;
  readonly title: string;
  readonly roles: Readonly<Partial<Record<MapTerrainRole, MapThemeAssetRole>>>;
}

export const ORCHARD_STONE_THEME: MapThemeManifest = {
  id: 'orchard_stone',
  title: 'Orchard Stone',
  roles: {
    'surface.grass': { assetId: 'tile_cf_grass' },
    'surface.sand': { assetId: 'tile_cf_beach' },
    'surface.stone': { assetId: 'tile_cf_grass' },
    'surface.cave_floor': { assetId: 'tile_cf_cave_floor' },
    'surface.water': { assetId: 'tile_cf_freshwater', animation: 'flow' },
    'surface.dirt': { assetId: 'tile_cf_path' },
    'feature.path': { assetId: 'tile_cf_path' },
    'feature.river': { assetId: 'tile_cf_freshwater', animation: 'flow' },
    'contour.edge': { assetId: 'tile_cf_stone_cliff_variants' },
    'contour.inset': { assetId: 'tile_cf_stone_cliff_inverse_overlay' },
    'contour.face': { assetId: 'tile_cf_stone_cliff_1' },
    'contour.face_foot': { assetId: 'tile_cf_stone_cliff_1' },
    'crossing.slope': { assetId: 'tile_cf_grass_1_ramp_bank_stone' },
    'crossing.stairs': { assetId: 'tile_cf_grass_1_ramp_bank_stone' },
  },
};

export function mapCellKey(tileX: number, tileY: number): string {
  return `${tileX},${tileY}`;
}

export function mapCoordinateInBounds(document: MapDocumentV2, tileX: number, tileY: number): boolean {
  return Number.isInteger(tileX) && Number.isInteger(tileY)
    && tileX >= 0 && tileY >= 0 && tileX < document.width && tileY < document.height;
}

export function resolvedMapCellAt(document: MapDocumentV2, tileX: number, tileY: number): ResolvedMapCell {
  const cell = document.cells[mapCellKey(tileX, tileY)];
  const generated = generatedBaseCellAt(document, tileX, tileY);
  return {
    elevation: cell?.elevation ?? generated?.elevation ?? document.baseElevation,
    surface: cell?.surface ?? generated?.surface ?? document.baseSurface,
    feature: cell?.feature ?? 'none',
    collision: cell?.collision ?? (cell?.surface === undefined ? generated?.collision : undefined) ?? 'inherit',
    collisionReason: cell?.collisionReason
      ?? (cell?.surface === undefined ? generated?.collisionReason : null)
      ?? null,
    cliffFamily: cell?.cliffFamily ?? document.defaultCliffFamily ?? 'stone_1',
    surfaceFamily: cell?.surfaceFamily ?? document.defaultSurfaceFamily ?? 'grass_1',
    terrainOverride: cell?.terrainOverride ?? null,
    ledge: cell?.ledge ?? false,
  };
}

export const SURVIVAL_ISLAND_MAP_GENERATOR = 'survival-island' as const;

export function mapDocumentUsesSurvivalIslandBase(
  document: Pick<MapDocumentV2, 'provenance'>,
): boolean {
  return document.provenance.kind === 'generated'
    && document.provenance.generator === SURVIVAL_ISLAND_MAP_GENERATOR;
}

function survivalSurfaceForBiome(biome: SurvivalBiome): MapSurfaceKind {
  if (biome === 'water' || biome === 'freshwater' || biome === 'waterfall'
    || biome === 'oasis_water') return 'water';
  if (biome === 'beach' || biome === 'desert_shore') return 'sand';
  if (biome === 'highland' || biome === 'ridge' || biome === 'desert_ridge'
    || biome === 'coastal_cliff') return 'stone';
  if (biome === 'dirt_terrace' || biome === 'dirt_ridge') return 'dirt';
  return 'grass';
}

function generatedBaseCellAt(
  document: MapDocumentV2,
  tileX: number,
  tileY: number,
): Pick<ResolvedMapCell, 'elevation' | 'surface' | 'collision' | 'collisionReason'> | null {
  if (!mapDocumentUsesSurvivalIslandBase(document)) return null;
  const seed = document.provenance.generatorSeed ?? SURVIVAL_WORLD_SEED;
  const biome = survivalBiomeAt(seed, tileX, tileY);
  const blocked = survivalTerrainBlocksTraversalAt(seed, tileX, tileY, 'ground');
  return {
    elevation: survivalTerrainHeightAt(seed, tileX, tileY),
    surface: survivalSurfaceForBiome(biome),
    collision: blocked ? 'force_block' : 'inherit',
    collisionReason: blocked ? `generated ${biome} terrain` : null,
  };
}

function canonicalCell(cell: MapCellOverride): MapCellOverride {
  return {
    ...(cell.elevation === undefined ? {} : { elevation: cell.elevation }),
    ...(cell.surface === undefined ? {} : { surface: cell.surface }),
    ...(cell.feature === undefined || cell.feature === 'none' ? {} : { feature: cell.feature }),
    ...(cell.collision === undefined || cell.collision === 'inherit' ? {} : { collision: cell.collision }),
    ...(cell.collisionReason === undefined || cell.collisionReason.length === 0
      ? {} : { collisionReason: cell.collisionReason }),
    ...(cell.cliffFamily === undefined ? {} : { cliffFamily: cell.cliffFamily }),
    ...(cell.surfaceFamily === undefined ? {} : { surfaceFamily: cell.surfaceFamily }),
    ...(cell.terrainOverride === undefined ? {} : { terrainOverride: cell.terrainOverride }),
    ...(cell.ledge === true ? { ledge: true } : {}),
  };
}

function cellIsEmpty(cell: MapCellOverride): boolean {
  return Object.keys(cell).length === 0;
}

export function normalizeMapDocument(document: MapDocumentV2): MapDocumentV2 {
  const cells = Object.fromEntries(Object.entries(document.cells)
    .map(([key, cell]) => [key, canonicalCell(cell)] as const)
    .filter(([, cell]) => !cellIsEmpty(cell))
    .sort(([left], [right]) => left.localeCompare(right)));
  const transitionKey = (transition: TerrainTransition): string => [
    transition.contourLevel, transition.kind, transition.direction,
    transition.lowerTileY, transition.lowerTileX, transition.upperTileY, transition.upperTileX,
  ].join(':');
  return {
    ...document,
    defaultCliffFamily: document.defaultCliffFamily ?? 'stone_1',
    defaultSurfaceFamily: document.defaultSurfaceFamily ?? 'grass_1',
    cells,
    transitions: [...document.transitions].sort((left, right) => transitionKey(left).localeCompare(transitionKey(right))),
    stairRuns: [...(document.stairRuns ?? [])].sort((left, right) => (
      `${left.fromLevel}:${left.toLevel}:${left.direction}:${left.y}:${left.x}`
        .localeCompare(`${right.fromLevel}:${right.toLevel}:${right.direction}:${right.y}:${right.x}`)
    )),
    scenery: [...document.scenery].sort((left, right) => left.id.localeCompare(right.id)),
    anchors: [...document.anchors].sort((left, right) => left.id.localeCompare(right.id)),
  };
}

export function serializeMapDocument(document: MapDocumentV2): string {
  return `${JSON.stringify(normalizeMapDocument(document), null, 2)}\n`;
}

export function parseMapDocument(source: string): MapDocumentV2 {
  const value: unknown = JSON.parse(source);
  if (typeof value !== 'object' || value === null) throw new Error('Map document must be an object');
  const candidate = value as Partial<MapDocumentV2>;
  if (candidate.schemaVersion !== MAP_DOCUMENT_SCHEMA_VERSION) throw new Error('Unsupported map schema version');
  if (typeof candidate.id !== 'string' || typeof candidate.title !== 'string') throw new Error('Map id and title are required');
  if (!Number.isInteger(candidate.width) || !Number.isInteger(candidate.height)
    || (candidate.width ?? 0) <= 0 || (candidate.height ?? 0) <= 0) throw new Error('Map dimensions must be positive integers');
  if (candidate.tileSize !== 16 || typeof candidate.themeId !== 'string') throw new Error('Map tile size/theme is invalid');
  if (!Number.isInteger(candidate.baseElevation) || !MAP_SURFACE_KINDS.includes(candidate.baseSurface as MapSurfaceKind)) {
    throw new Error('Map base terrain is invalid');
  }
  if (candidate.defaultCliffFamily !== undefined
    && (typeof candidate.defaultCliffFamily !== 'string'
      || !/^[a-z0-9]+(?:_[a-z0-9]+)*$/u.test(candidate.defaultCliffFamily))) {
    throw new Error('Map cliff family is invalid');
  }
  if (candidate.defaultSurfaceFamily !== undefined
    && !TERRAIN_SURFACE_FAMILY_IDS.includes(candidate.defaultSurfaceFamily)) {
    throw new Error('Map surface family is invalid');
  }
  if (typeof candidate.cells !== 'object' || candidate.cells === null
    || !Array.isArray(candidate.transitions) || !Array.isArray(candidate.scenery)
    || !Array.isArray(candidate.anchors) || typeof candidate.provenance !== 'object'
    || candidate.provenance === null) throw new Error('Map layers are incomplete');
  if (candidate.stairRuns !== undefined && !Array.isArray(candidate.stairRuns)) {
    throw new Error('Map stair runs must be an array');
  }
  if (candidate.transitions.some((transition) => (
    typeof transition !== 'object' || transition === null
    || !TERRAIN_TRANSITION_KINDS.includes((transition as TerrainTransition).kind)
    || !terrainTransitionValid(transition as TerrainTransition)
  ))) throw new Error('Map transition is invalid');
  if ((candidate.stairRuns ?? []).some((run) => (
    typeof run !== 'object' || run === null || !stairRunValid(run as StairRun)
  ))) throw new Error('Map stair run is invalid');
  const anchors = candidate.anchors.map((anchor) => parseMapGameplayAnchor(
    anchor,
    candidate.width as number,
    candidate.height as number,
  ));
  if (anchors.some((anchor) => anchor === null)
    || new Set(anchors.map((anchor) => anchor!.id)).size !== anchors.length) {
    throw new Error('Map gameplay anchor is invalid');
  }
  const reconstructed = normalizeMapDocument({
    ...(candidate as MapDocumentV2),
    anchors: anchors as MapGameplayAnchor[],
  });
  if (reconstructed.anchors.some((anchor) => (
    resolvedMapCellAt(reconstructed, anchor.tileX, anchor.tileY).elevation !== anchor.elevation
  ))) throw new Error('Map gameplay anchor elevation does not match terrain');
  return reconstructed;
}

/** Stable non-cryptographic content fingerprint for CLI/UI parity and diffs. */
export function mapDocumentHash(document: MapDocumentV2): string {
  let hash = 2_166_136_261;
  for (const character of serializeMapDocument(document)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16_777_619) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}
