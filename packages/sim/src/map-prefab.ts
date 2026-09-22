import {parseObjectPresentation,type ObjectPresentation} from './object-presentation.js';
import {
  MAP_STAMP_LAYERS,
  isMapStampPlacement,
  normalizeMapStamp,
  type MapStampDocumentV1,
  type MapStampPlacement,
} from './map-stamp.js';

export const MAP_PREFAB_SCHEMA_VERSION = 2 as const;
export const MAP_PREFAB_COLLISION_RESOLUTION = 4 as const;
export const MAP_PREFAB_COLLISION_MASK_EMPTY = 0x0000 as const;
export const MAP_PREFAB_COLLISION_MASK_FULL = 0xffff as const;

export const MAP_PREFAB_BEHAVIOR_KINDS = [
  'static', 'resource', 'gate', 'placeable', 'surface', 'farm_zone',
] as const;
export type MapPrefabBehaviorKind = typeof MAP_PREFAB_BEHAVIOR_KINDS[number];

export interface MapPrefabBehavior {
  readonly kind: MapPrefabBehaviorKind;
  /** Server-allowlisted gameplay definition. Static prefabs omit it. */
  readonly archetype?: string;
}

export interface MapPrefabCell {
  readonly id: string;
  readonly tileX: number;
  readonly tileY: number;
  readonly elevation: number;
  /** Row-major 4×4 sub-tile occupancy bits. */
  readonly collisionMask: number;
}

export interface MapPrefabCollection {
  readonly id: string;
  readonly label: string;
  readonly color: string;
}

/**
 * Reusable object contract shared by Object Studio, Map Editor, and live
 * publication. Unlike MapStampDocumentV1, this preserves authored collision,
 * elevation, collection metadata, tags, and the allowlisted behavior boundary.
 */
export interface MapPrefabDocumentV2 {
  readonly schemaVersion: typeof MAP_PREFAB_SCHEMA_VERSION;
  readonly kind: 'map_prefab';
  readonly id: string;
  readonly title: string;
  readonly width: number;
  readonly height: number;
  readonly tileSize: 16;
  readonly pivot: { readonly tileX: number; readonly tileY: number };
  readonly revision: number;
  readonly assetRegistryRevision: string;
  readonly tags: readonly string[];
  readonly collection: MapPrefabCollection | null;
  readonly behaviors: readonly MapPrefabBehavior[];
  readonly presentation?: ObjectPresentation;
  readonly placements: readonly MapStampPlacement[];
  readonly cells: readonly MapPrefabCell[];
}

const DOCUMENT_ID = /^[a-z0-9][a-z0-9-]{0,63}$/u;
const COMPONENT_ID = /^[a-z0-9][a-z0-9_.-]{0,95}$/u;
const CELL_ID = /^[a-z0-9][a-z0-9_-]{0,95}$/u;
const COLOR = /^#[0-9a-f]{6}$/u;
const MAX_PREFAB_DIMENSION = 512;

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : null;
}

function integerInRange(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === 'number' && Number.isInteger(value)
    && value >= minimum && value <= maximum;
}

function parseCell(value: unknown, width: number, height: number): MapPrefabCell | null {
  const candidate = record(value);
  if (candidate === null
    || typeof candidate['id'] !== 'string' || !CELL_ID.test(candidate['id'])
    || !integerInRange(candidate['tileX'], 0, width - 1)
    || !integerInRange(candidate['tileY'], 0, height - 1)
    || !integerInRange(candidate['elevation'], -32, 32)
    || !integerInRange(candidate['collisionMask'], 0, MAP_PREFAB_COLLISION_MASK_FULL)) return null;
  return {
    id: candidate['id'],
    tileX: candidate['tileX'],
    tileY: candidate['tileY'],
    elevation: candidate['elevation'],
    collisionMask: candidate['collisionMask'],
  };
}

function parseBehavior(value: unknown): MapPrefabBehavior | null {
  const candidate = record(value);
  if (candidate === null
    || !MAP_PREFAB_BEHAVIOR_KINDS.includes(candidate['kind'] as MapPrefabBehaviorKind)
    || !(candidate['archetype'] === undefined
      || (typeof candidate['archetype'] === 'string' && COMPONENT_ID.test(candidate['archetype'])))) {
    return null;
  }
  const kind = candidate['kind'] as MapPrefabBehaviorKind;
  if (kind !== 'static' && candidate['archetype'] === undefined) return null;
  return {
    kind,
    ...(candidate['archetype'] === undefined ? {} : { archetype: candidate['archetype'] as string }),
  };
}

function parseCollection(value: unknown): MapPrefabCollection | null {
  if (value === null) return null;
  const candidate = record(value);
  if (candidate === null
    || typeof candidate['id'] !== 'string' || !COMPONENT_ID.test(candidate['id'])
    || typeof candidate['label'] !== 'string'
    || candidate['label'].length < 1 || candidate['label'].length > 48
    || typeof candidate['color'] !== 'string' || !COLOR.test(candidate['color'])) return null;
  return { id: candidate['id'], label: candidate['label'], color: candidate['color'] };
}

function placementSortKey(placement: MapStampPlacement): string {
  const layer = String(MAP_STAMP_LAYERS.indexOf(placement.layer)).padStart(2, '0');
  return [layer, placement.elevation, placement.tileY, placement.tileX, placement.id].join(':');
}

export function normalizeMapPrefab(document: MapPrefabDocumentV2): MapPrefabDocumentV2 {
  return {
    ...document,
    ...(document.presentation?{presentation:parseObjectPresentation(document.presentation,document.placements.map(p=>p.id))}:{}),
    tags: [...new Set(document.tags)].sort(),
    behaviors: [...document.behaviors].sort((left, right) => (
      `${left.kind}:${left.archetype ?? ''}`.localeCompare(`${right.kind}:${right.archetype ?? ''}`)
    )),
    placements: [...document.placements].sort((left, right) => (
      placementSortKey(left).localeCompare(placementSortKey(right))
    )),
    cells: [...document.cells].sort((left, right) => (
      left.tileY - right.tileY || left.tileX - right.tileX || left.id.localeCompare(right.id)
    )),
  };
}

export function createMapPrefabDocument(options: {
  readonly id?: string;
  readonly title?: string;
  readonly width?: number;
  readonly height?: number;
  readonly assetRegistryRevision?: string;
  readonly tags?: readonly string[];
  readonly collection?: MapPrefabCollection | null;
} = {}): MapPrefabDocumentV2 {
  const width = options.width ?? 1;
  const height = options.height ?? 1;
  if (!integerInRange(width, 1, MAX_PREFAB_DIMENSION)
    || !integerInRange(height, 1, MAX_PREFAB_DIMENSION)) {
    throw new RangeError('Map prefab dimensions must be integers from 1 to 512');
  }
  return normalizeMapPrefab({
    schemaVersion: MAP_PREFAB_SCHEMA_VERSION,
    kind: 'map_prefab',
    id: options.id ?? 'untitled-object',
    title: options.title ?? 'Untitled Object',
    width,
    height,
    tileSize: 16,
    pivot: { tileX: Math.floor(width / 2), tileY: Math.floor(height / 2) },
    revision: 0,
    assetRegistryRevision: options.assetRegistryRevision ?? '',
    tags: options.tags ?? [],
    collection: options.collection ?? null,
    behaviors: [{ kind: 'static' }],
    placements: [],
    cells: [],
  });
}

export function parseMapPrefabDocument(source: string): MapPrefabDocumentV2 {
  let value: unknown;
  try { value = JSON.parse(source); } catch { throw new SyntaxError('Map prefab is not valid JSON'); }
  const candidate = record(value);
  if (candidate === null
    || candidate['schemaVersion'] !== MAP_PREFAB_SCHEMA_VERSION
    || candidate['kind'] !== 'map_prefab'
    || typeof candidate['id'] !== 'string' || !DOCUMENT_ID.test(candidate['id'])
    || typeof candidate['title'] !== 'string'
    || candidate['title'].length < 1 || candidate['title'].length > 96
    || !integerInRange(candidate['width'], 1, MAX_PREFAB_DIMENSION)
    || !integerInRange(candidate['height'], 1, MAX_PREFAB_DIMENSION)
    || candidate['tileSize'] !== 16
    || !integerInRange(candidate['revision'], 0, 0x7fff_ffff)
    || typeof candidate['assetRegistryRevision'] !== 'string'
    || candidate['assetRegistryRevision'].length > 128
    || !Array.isArray(candidate['tags'])
    || candidate['tags'].some((tag) => typeof tag !== 'string' || !COMPONENT_ID.test(tag))
    || !Array.isArray(candidate['behaviors'])
    || !Array.isArray(candidate['placements'])
    || !Array.isArray(candidate['cells'])) {
    throw new TypeError('Map prefab document is invalid');
  }
  const width = candidate['width'];
  const height = candidate['height'];
  const pivot = record(candidate['pivot']);
  if (pivot === null
    || !integerInRange(pivot['tileX'], 0, width - 1)
    || !integerInRange(pivot['tileY'], 0, height - 1)) {
    throw new TypeError('Map prefab pivot is invalid');
  }
  if (candidate['placements'].some((placement) => !isMapStampPlacement(placement, width, height))) {
    throw new TypeError('Map prefab placement is invalid');
  }
  const cells = candidate['cells'].map((cell) => parseCell(cell, width, height));
  const behaviors = candidate['behaviors'].map(parseBehavior);
  const collection = parseCollection(candidate['collection']);
  if (cells.some((cell) => cell === null)
    || behaviors.some((behavior) => behavior === null)
    || candidate['behaviors'].length === 0
    || (candidate['collection'] !== null && collection === null)) {
    throw new TypeError('Map prefab metadata is invalid');
  }
  const placementIds = candidate['placements'].map((placement) => (placement as MapStampPlacement).id);
  const cellIds = cells.map((cell) => cell!.id);
  const behaviorKeys = behaviors.map((behavior) => `${behavior!.kind}:${behavior!.archetype ?? ''}`);
  if (new Set(placementIds).size !== placementIds.length
    || new Set(cellIds).size !== cellIds.length
    || new Set(behaviorKeys).size !== behaviorKeys.length) {
    throw new TypeError('Map prefab ids and behaviors must be unique');
  }
  return normalizeMapPrefab({
    schemaVersion: MAP_PREFAB_SCHEMA_VERSION,
    kind: 'map_prefab',
    id: candidate['id'],
    title: candidate['title'],
    width,
    height,
    tileSize: 16,
    pivot: { tileX: pivot['tileX'], tileY: pivot['tileY'] },
    revision: candidate['revision'],
    assetRegistryRevision: candidate['assetRegistryRevision'],
    tags: candidate['tags'] as string[],
    collection,
    behaviors: behaviors as MapPrefabBehavior[],
    placements: candidate['placements'] as MapStampPlacement[],
    cells: cells as MapPrefabCell[],
    ...(candidate['presentation']===undefined?{}:{presentation:parseObjectPresentation(candidate['presentation'],placementIds)}),
  });
}

export function serializeMapPrefabDocument(document: MapPrefabDocumentV2): string {
  return `${JSON.stringify(normalizeMapPrefab(document), null, 2)}\n`;
}

export function mapStampToPrefab(stamp: MapStampDocumentV1): MapPrefabDocumentV2 {
  return normalizeMapPrefab({
    ...createMapPrefabDocument({
      id: stamp.id,
      title: stamp.title,
      width: stamp.width,
      height: stamp.height,
      assetRegistryRevision: stamp.assetRegistryRevision,
    }),
    pivot: stamp.pivot,
    revision: stamp.revision,
    placements: [...stamp.placements],
  });
}

/** Compatibility export for tools which still consume MapStampDocumentV1. */
export function mapPrefabToStamp(prefab: MapPrefabDocumentV2): MapStampDocumentV1 {
  return normalizeMapStamp({
    schemaVersion: 1,
    kind: 'map_stamp',
    id: prefab.id,
    title: prefab.title,
    width: prefab.width,
    height: prefab.height,
    tileSize: 16,
    pivot: prefab.pivot,
    revision: prefab.revision,
    assetRegistryRevision: prefab.assetRegistryRevision,
    placements: prefab.placements,
  });
}

/** Transforms a row-major 4×4 collision mask using the same flip-then-rotate
 * order as prefab placements. Keeping this with the prefab contract lets the
 * Object Studio and Map Editor share one exact collision representation. */
export function transformMapPrefabCollisionMask(
  collisionMask: number,
  quarterTurns: 0 | 1 | 2 | 3,
  flipX: boolean,
): number {
  let result = 0;
  for (let sourceY = 0; sourceY < 4; sourceY += 1) {
    for (let sourceX = 0; sourceX < 4; sourceX += 1) {
      if ((collisionMask & (1 << (sourceY * 4 + sourceX))) === 0) continue;
      let x = flipX ? 3 - sourceX : sourceX;
      let y = sourceY;
      for (let turn = 0; turn < quarterTurns; turn += 1) {
        [x, y] = [3 - y, x];
      }
      result |= 1 << (y * 4 + x);
    }
  }
  return result;
}
