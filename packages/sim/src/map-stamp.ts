export const MAP_STAMP_SCHEMA_VERSION = 1 as const;
export const MAP_STAMP_LAYERS = ['ground', 'object', 'canopy'] as const;
export type MapStampLayer = typeof MAP_STAMP_LAYERS[number];

export const MAP_STAMP_VISUAL_KINDS = ['state', 'variant', 'animation'] as const;
export type MapStampVisualKind = typeof MAP_STAMP_VISUAL_KINDS[number];

/** A semantic visual selection. Atlas coordinates are deliberately absent:
 * generated atlases may be repacked without invalidating authored stamps. */
export interface MapStampVisual {
  readonly kind: MapStampVisualKind;
  readonly name: string;
  readonly frameIndex: number;
}

export interface MapStampPlacement {
  readonly id: string;
  readonly assetId: number;
  readonly assetName: string;
  readonly visual: MapStampVisual;
  readonly tileX: number;
  readonly tileY: number;
  readonly elevation: number;
  readonly layer: MapStampLayer;
  readonly quarterTurns: 0 | 1 | 2 | 3;
  readonly flipX: boolean;
}

/** Offline authoring contract for reusable scenery/prefab layouts. Publication
 * into a live MapDocument remains a separate validated operation. */
export interface MapStampDocumentV1 {
  readonly schemaVersion: typeof MAP_STAMP_SCHEMA_VERSION;
  readonly kind: 'map_stamp';
  readonly id: string;
  readonly title: string;
  readonly width: number;
  readonly height: number;
  readonly tileSize: 16;
  readonly pivot: { readonly tileX: number; readonly tileY: number };
  readonly revision: number;
  readonly assetRegistryRevision: string;
  readonly placements: readonly MapStampPlacement[];
}

const DOCUMENT_ID = /^[a-z0-9][a-z0-9-]{0,63}$/u;
const PLACEMENT_ID = /^[a-z0-9][a-z0-9_-]{0,95}$/u;
const ASSET_NAME = /^[a-z0-9][a-z0-9_]{0,127}$/u;
const VISUAL_NAME = /^[a-z0-9][a-z0-9_.-]{0,95}$/u;
const MAX_STAMP_DIMENSION = 512;

function integerInRange(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === 'number' && Number.isInteger(value)
    && value >= minimum && value <= maximum;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null
    ? value as Record<string, unknown>
    : null;
}

function placementSortKey(placement: MapStampPlacement): string {
  const layer = String(MAP_STAMP_LAYERS.indexOf(placement.layer)).padStart(2, '0');
  return [layer, placement.elevation, placement.tileY, placement.tileX, placement.id].join(':');
}

export function normalizeMapStamp(document: MapStampDocumentV1): MapStampDocumentV1 {
  return {
    ...document,
    placements: [...document.placements].sort((left, right) =>
      placementSortKey(left).localeCompare(placementSortKey(right))),
  };
}

export function createMapStampDocument(options: {
  readonly id?: string;
  readonly title?: string;
  readonly width?: number;
  readonly height?: number;
  readonly assetRegistryRevision?: string;
} = {}): MapStampDocumentV1 {
  const width = options.width ?? 32;
  const height = options.height ?? 24;
  if (!integerInRange(width, 1, MAX_STAMP_DIMENSION)
    || !integerInRange(height, 1, MAX_STAMP_DIMENSION)) {
    throw new RangeError('Map stamp dimensions must be integers from 1 to 512');
  }
  return {
    schemaVersion: MAP_STAMP_SCHEMA_VERSION,
    kind: 'map_stamp',
    id: options.id ?? 'untitled-layout',
    title: options.title ?? 'Untitled Layout',
    width,
    height,
    tileSize: 16,
    pivot: { tileX: Math.floor(width / 2), tileY: Math.floor(height / 2) },
    revision: 0,
    assetRegistryRevision: options.assetRegistryRevision ?? '',
    placements: [],
  };
}

function parseVisual(value: unknown): MapStampVisual | null {
  const candidate = record(value);
  if (candidate === null
    || !MAP_STAMP_VISUAL_KINDS.includes(candidate['kind'] as MapStampVisualKind)
    || typeof candidate['name'] !== 'string'
    || !VISUAL_NAME.test(candidate['name'])
    || !integerInRange(candidate['frameIndex'], 0, 65_535)) return null;
  return {
    kind: candidate['kind'] as MapStampVisualKind,
    name: candidate['name'],
    frameIndex: candidate['frameIndex'],
  };
}

function parsePlacement(value: unknown, width: number, height: number): MapStampPlacement | null {
  const candidate = record(value);
  if (candidate === null
    || typeof candidate['id'] !== 'string' || !PLACEMENT_ID.test(candidate['id'])
    || !integerInRange(candidate['assetId'], 0, 0xffff_ffff)
    || typeof candidate['assetName'] !== 'string' || !ASSET_NAME.test(candidate['assetName'])
    || !integerInRange(candidate['tileX'], 0, width - 1)
    || !integerInRange(candidate['tileY'], 0, height - 1)
    || !integerInRange(candidate['elevation'], -32, 32)
    || !MAP_STAMP_LAYERS.includes(candidate['layer'] as MapStampLayer)
    || !integerInRange(candidate['quarterTurns'], 0, 3)
    || typeof candidate['flipX'] !== 'boolean') return null;
  const visual = parseVisual(candidate['visual']);
  if (visual === null) return null;
  return {
    id: candidate['id'],
    assetId: candidate['assetId'],
    assetName: candidate['assetName'],
    visual,
    tileX: candidate['tileX'],
    tileY: candidate['tileY'],
    elevation: candidate['elevation'],
    layer: candidate['layer'] as MapStampLayer,
    quarterTurns: candidate['quarterTurns'] as 0 | 1 | 2 | 3,
    flipX: candidate['flipX'],
  };
}

/** Shared validator for editors that compose reusable map stamps inside a
 * larger offline workspace. It deliberately validates semantic placement
 * identity rather than generated atlas coordinates. */
export function isMapStampPlacement(
  value: unknown,
  width: number,
  height: number,
): value is MapStampPlacement {
  return parsePlacement(value, width, height) !== null;
}

export function parseMapStampDocument(source: string): MapStampDocumentV1 {
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    throw new SyntaxError('Map stamp is not valid JSON');
  }
  const candidate = record(value);
  if (candidate === null
    || candidate['schemaVersion'] !== MAP_STAMP_SCHEMA_VERSION
    || candidate['kind'] !== 'map_stamp'
    || typeof candidate['id'] !== 'string' || !DOCUMENT_ID.test(candidate['id'])
    || typeof candidate['title'] !== 'string' || candidate['title'].length < 1 || candidate['title'].length > 96
    || !integerInRange(candidate['width'], 1, MAX_STAMP_DIMENSION)
    || !integerInRange(candidate['height'], 1, MAX_STAMP_DIMENSION)
    || candidate['tileSize'] !== 16
    || !integerInRange(candidate['revision'], 0, 0x7fff_ffff)
    || typeof candidate['assetRegistryRevision'] !== 'string'
    || candidate['assetRegistryRevision'].length > 128
    || !Array.isArray(candidate['placements'])) {
    throw new TypeError('Map stamp document is invalid');
  }
  const pivot = record(candidate['pivot']);
  if (pivot === null
    || !integerInRange(pivot['tileX'], 0, candidate['width'] - 1)
    || !integerInRange(pivot['tileY'], 0, candidate['height'] - 1)) {
    throw new TypeError('Map stamp pivot is invalid');
  }
  const placements = candidate['placements'].map((entry) =>
    parsePlacement(entry, candidate['width'] as number, candidate['height'] as number));
  if (placements.some((entry) => entry === null)) {
    throw new TypeError('Map stamp placement is invalid');
  }
  const ids = new Set(placements.map((entry) => entry!.id));
  if (ids.size !== placements.length) throw new TypeError('Map stamp placement ids must be unique');
  return normalizeMapStamp({
    schemaVersion: MAP_STAMP_SCHEMA_VERSION,
    kind: 'map_stamp',
    id: candidate['id'],
    title: candidate['title'],
    width: candidate['width'],
    height: candidate['height'],
    tileSize: 16,
    pivot: { tileX: pivot['tileX'], tileY: pivot['tileY'] },
    revision: candidate['revision'],
    assetRegistryRevision: candidate['assetRegistryRevision'],
    placements: placements as MapStampPlacement[],
  });
}

export function serializeMapStampDocument(document: MapStampDocumentV1): string {
  return `${JSON.stringify(normalizeMapStamp(document), null, 2)}\n`;
}

export function upsertMapStampPlacement(
  document: MapStampDocumentV1,
  placement: MapStampPlacement,
): MapStampDocumentV1 {
  const parsed = parsePlacement(placement, document.width, document.height);
  if (parsed === null) throw new TypeError('Map stamp placement is invalid');
  const previous = document.placements.find((entry) => entry.id === parsed.id);
  if (previous !== undefined && JSON.stringify(previous) === JSON.stringify(parsed)) return document;
  return normalizeMapStamp({
    ...document,
    revision: document.revision + 1,
    placements: [...document.placements.filter((entry) => entry.id !== parsed.id), parsed],
  });
}

export function removeMapStampPlacement(
  document: MapStampDocumentV1,
  placementId: string,
): MapStampDocumentV1 {
  if (!document.placements.some((entry) => entry.id === placementId)) return document;
  return {
    ...document,
    revision: document.revision + 1,
    placements: document.placements.filter((entry) => entry.id !== placementId),
  };
}
