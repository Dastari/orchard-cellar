import type { TerrainTransition } from './terrain-elevation.js';

export const MAP_DOCUMENT_SCHEMA_VERSION = 2 as const;
export const MAP_SURFACE_KINDS = [
  'grass', 'sand', 'stone', 'cave_floor', 'water', 'dirt',
] as const;
export type MapSurfaceKind = typeof MAP_SURFACE_KINDS[number];

export const MAP_FEATURE_KINDS = ['none', 'path', 'river', 'farmland'] as const;
export type MapFeatureKind = typeof MAP_FEATURE_KINDS[number];

export const MAP_COLLISION_OVERRIDES = ['inherit', 'force_block', 'force_walk'] as const;
export type MapCollisionOverride = typeof MAP_COLLISION_OVERRIDES[number];

export interface MapCellOverride {
  readonly elevation?: number;
  readonly surface?: MapSurfaceKind;
  readonly feature?: MapFeatureKind;
  readonly collision?: MapCollisionOverride;
  readonly collisionReason?: string;
}

export interface MapSceneryPlacement {
  readonly id: string;
  readonly assetId: string;
  readonly tileX: number;
  readonly tileY: number;
  readonly elevation: number;
  readonly state?: string;
}

export interface MapGameplayAnchor {
  readonly id: string;
  readonly kind: 'spawn' | 'portal' | 'poi' | 'npc' | 'resource' | 'label';
  readonly tileX: number;
  readonly tileY: number;
  readonly elevation: number;
  readonly label?: string;
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
  readonly revision: number;
  readonly cells: Readonly<Record<string, MapCellOverride>>;
  readonly transitions: readonly TerrainTransition[];
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
  | 'crossing.slope';

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
    'contour.edge': { assetId: 'tile_cf_grass_cliff_edge' },
    'contour.inset': { assetId: 'tile_cf_stone_cliff_inverse_overlay' },
    'contour.face': { assetId: 'tile_cf_stone_cliff_1' },
    'contour.face_foot': { assetId: 'tile_cf_stone_cliff_1' },
    'crossing.slope': { assetId: 'tile_cf_grass_cliff_ramp' },
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
  return {
    elevation: cell?.elevation ?? document.baseElevation,
    surface: cell?.surface ?? document.baseSurface,
    feature: cell?.feature ?? 'none',
    collision: cell?.collision ?? 'inherit',
    collisionReason: cell?.collisionReason ?? null,
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
    cells,
    transitions: [...document.transitions].sort((left, right) => transitionKey(left).localeCompare(transitionKey(right))),
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
  if (typeof candidate.cells !== 'object' || candidate.cells === null
    || !Array.isArray(candidate.transitions) || !Array.isArray(candidate.scenery)
    || !Array.isArray(candidate.anchors) || typeof candidate.provenance !== 'object'
    || candidate.provenance === null) throw new Error('Map layers are incomplete');
  return normalizeMapDocument(candidate as MapDocumentV2);
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
