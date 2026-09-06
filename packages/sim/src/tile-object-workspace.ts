import {
  createMapStampDocument,
  isMapStampPlacement,
  normalizeMapStamp,
  type MapStampDocumentV1,
  type MapStampPlacement,
} from './map-stamp.js';
import {
  createMapPrefabDocument,
  normalizeMapPrefab,
  transformMapPrefabCollisionMask,
  type MapPrefabDocumentV2,
} from './map-prefab.js';

export const TILE_OBJECT_WORKSPACE_SCHEMA_VERSION = 1 as const;
export const TILE_OBJECT_COLLISION_RESOLUTION = 4 as const;
export const TILE_OBJECT_COLLISION_MASK_EMPTY = 0x0000 as const;
export const TILE_OBJECT_COLLISION_MASK_FULL = 0xffff as const;

export interface TileObjectCellMetadata {
  readonly id: string;
  readonly tileX: number;
  readonly tileY: number;
  /** Signed logical height plane used by rendering, interaction, and later
   * publication validation. */
  readonly elevation: number;
  /** Row-major 4×4 sub-tile occupancy bits. This exactly represents whole,
   * half, quarter, and authored fractional collision without pixel inference. */
  readonly collisionMask: number;
}

export interface TileObjectDefinition {
  readonly id: string;
  readonly label: string;
  readonly placementIds: readonly string[];
  readonly cellIds: readonly string[];
  readonly collectionId: string | null;
  readonly pivotTileX?: number;
  readonly pivotTileY?: number;
}

export interface TileObjectCollectionFrame {
  readonly id: string;
  readonly label: string;
  readonly color: string;
  readonly tileX: number;
  readonly tileY: number;
  readonly width: number;
  readonly height: number;
}

/** Authentication-free visual workbench state. This is intentionally not a
 * world map: selected object definitions export to MapPrefabDocumentV2 before
 * they can be validated and placed into a map. */
export interface TileObjectWorkspaceV1 {
  readonly schemaVersion: typeof TILE_OBJECT_WORKSPACE_SCHEMA_VERSION;
  readonly kind: 'tile_object_workspace';
  readonly id: string;
  readonly title: string;
  readonly width: number;
  readonly height: number;
  readonly tileSize: 16;
  readonly revision: number;
  readonly assetRegistryRevision: string;
  readonly placements: readonly MapStampPlacement[];
  readonly cells: readonly TileObjectCellMetadata[];
  readonly objects: readonly TileObjectDefinition[];
  readonly collections: readonly TileObjectCollectionFrame[];
}

const ID = /^[a-z0-9][a-z0-9_-]{0,95}$/u;
const DOCUMENT_ID = /^[a-z0-9][a-z0-9-]{0,63}$/u;
const COLOR = /^#[0-9a-f]{6}$/u;
const MAX_DIMENSION = 512;

function integerInRange(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === 'number' && Number.isInteger(value)
    && value >= minimum && value <= maximum;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null
    ? value as Record<string, unknown>
    : null;
}

function stringArray(value: unknown): readonly string[] | null {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string' || !ID.test(entry))) return null;
  return value as string[];
}

function parseCell(value: unknown, width: number, height: number): TileObjectCellMetadata | null {
  const candidate = record(value);
  if (candidate === null
    || typeof candidate['id'] !== 'string' || !ID.test(candidate['id'])
    || !integerInRange(candidate['tileX'], 0, width - 1)
    || !integerInRange(candidate['tileY'], 0, height - 1)
    || !integerInRange(candidate['elevation'], -32, 32)
    || !integerInRange(candidate['collisionMask'], 0, TILE_OBJECT_COLLISION_MASK_FULL)) return null;
  return {
    id: candidate['id'],
    tileX: candidate['tileX'],
    tileY: candidate['tileY'],
    elevation: candidate['elevation'],
    collisionMask: candidate['collisionMask'],
  };
}

function parseCollection(value: unknown, width: number, height: number): TileObjectCollectionFrame | null {
  const candidate = record(value);
  if (candidate === null
    || typeof candidate['id'] !== 'string' || !ID.test(candidate['id'])
    || typeof candidate['label'] !== 'string' || candidate['label'].length < 1 || candidate['label'].length > 48
    || typeof candidate['color'] !== 'string' || !COLOR.test(candidate['color'])
    || !integerInRange(candidate['tileX'], 0, width - 1)
    || !integerInRange(candidate['tileY'], 0, height - 1)
    || !integerInRange(candidate['width'], 1, width - candidate['tileX'])
    || !integerInRange(candidate['height'], 1, height - candidate['tileY'])) return null;
  return {
    id: candidate['id'],
    label: candidate['label'],
    color: candidate['color'],
    tileX: candidate['tileX'],
    tileY: candidate['tileY'],
    width: candidate['width'],
    height: candidate['height'],
  };
}

function parseObject(value: unknown): TileObjectDefinition | null {
  const candidate = record(value);
  if (candidate === null
    || typeof candidate['id'] !== 'string' || !ID.test(candidate['id'])
    || typeof candidate['label'] !== 'string' || candidate['label'].length < 1 || candidate['label'].length > 64
    || !(candidate['collectionId'] === null
      || (typeof candidate['collectionId'] === 'string' && ID.test(candidate['collectionId'])))) return null;
  const hasPivotX = candidate['pivotTileX'] !== undefined;
  const hasPivotY = candidate['pivotTileY'] !== undefined;
  if (hasPivotX !== hasPivotY
    || (hasPivotX && (!integerInRange(candidate['pivotTileX'], 0, MAX_DIMENSION - 1)
      || !integerInRange(candidate['pivotTileY'], 0, MAX_DIMENSION - 1)))) return null;
  const placementIds = stringArray(candidate['placementIds']);
  const cellIds = stringArray(candidate['cellIds']);
  if (placementIds === null || cellIds === null || placementIds.length === 0) return null;
  return {
    id: candidate['id'],
    label: candidate['label'],
    placementIds: [...placementIds],
    cellIds: [...cellIds],
    collectionId: candidate['collectionId'],
    ...(hasPivotX ? {
      pivotTileX: candidate['pivotTileX'] as number,
      pivotTileY: candidate['pivotTileY'] as number,
    } : {}),
  };
}

function unique(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

function validateRelationships(workspace: TileObjectWorkspaceV1): void {
  const placementIds = new Set(workspace.placements.map((entry) => entry.id));
  const cellIds = new Set(workspace.cells.map((entry) => entry.id));
  const collectionIds = new Set(workspace.collections.map((entry) => entry.id));
  if (placementIds.size !== workspace.placements.length
    || cellIds.size !== workspace.cells.length
    || collectionIds.size !== workspace.collections.length
    || new Set(workspace.objects.map((entry) => entry.id)).size !== workspace.objects.length) {
    throw new TypeError('Tile object workspace ids must be unique');
  }
  const groupedPlacements: string[] = [];
  const groupedCells: string[] = [];
  for (const object of workspace.objects) {
    if (!unique(object.placementIds) || !unique(object.cellIds)
      || object.placementIds.some((id) => !placementIds.has(id))
      || object.cellIds.some((id) => !cellIds.has(id))
      || (object.collectionId !== null && !collectionIds.has(object.collectionId))) {
      throw new TypeError('Tile object workspace relationship is invalid');
    }
    groupedPlacements.push(...object.placementIds);
    groupedCells.push(...object.cellIds);
  }
  if (!unique(groupedPlacements) || !unique(groupedCells)) {
    throw new TypeError('A tile or metadata cell may belong to only one grouped object');
  }
}

export function normalizeTileObjectWorkspace(workspace: TileObjectWorkspaceV1): TileObjectWorkspaceV1 {
  return {
    ...workspace,
    placements: [...workspace.placements].sort((left, right) =>
      left.elevation - right.elevation || left.tileY - right.tileY
      || left.tileX - right.tileX || left.id.localeCompare(right.id)),
    cells: [...workspace.cells].sort((left, right) =>
      left.tileY - right.tileY || left.tileX - right.tileX || left.id.localeCompare(right.id)),
    objects: [...workspace.objects].map((entry) => ({
      ...entry,
      placementIds: [...entry.placementIds].sort(),
      cellIds: [...entry.cellIds].sort(),
    })).sort((left, right) => left.id.localeCompare(right.id)),
    collections: [...workspace.collections].sort((left, right) => left.id.localeCompare(right.id)),
  };
}

export function createTileObjectWorkspace(options: {
  readonly id?: string;
  readonly title?: string;
  readonly width?: number;
  readonly height?: number;
  readonly assetRegistryRevision?: string;
} = {}): TileObjectWorkspaceV1 {
  const width = options.width ?? 128;
  const height = options.height ?? 96;
  if (!integerInRange(width, 1, MAX_DIMENSION) || !integerInRange(height, 1, MAX_DIMENSION)) {
    throw new RangeError('Tile object workspace dimensions must be integers from 1 to 512');
  }
  return {
    schemaVersion: TILE_OBJECT_WORKSPACE_SCHEMA_VERSION,
    kind: 'tile_object_workspace',
    id: options.id ?? 'untitled-layout',
    title: options.title ?? 'Untitled Layout',
    width,
    height,
    tileSize: 16,
    revision: 0,
    assetRegistryRevision: options.assetRegistryRevision ?? '',
    placements: [],
    cells: [],
    objects: [],
    collections: [],
  };
}

export function tileObjectWorkspaceFromMapStamp(stamp: MapStampDocumentV1): TileObjectWorkspaceV1 {
  return {
    ...createTileObjectWorkspace({
      id: stamp.id,
      title: stamp.title,
      width: stamp.width,
      height: stamp.height,
      assetRegistryRevision: stamp.assetRegistryRevision,
    }),
    revision: stamp.revision,
    placements: [...stamp.placements],
  };
}

export function tileObjectWorkspaceFromMapPrefab(prefab: MapPrefabDocumentV2): TileObjectWorkspaceV1 {
  const collection = prefab.collection === null ? null : {
    ...prefab.collection,
    tileX: 0,
    tileY: 0,
    width: prefab.width,
    height: prefab.height,
  };
  return normalizeTileObjectWorkspace({
    ...createTileObjectWorkspace({
      id: prefab.id,
      title: prefab.title,
      width: prefab.width,
      height: prefab.height,
      assetRegistryRevision: prefab.assetRegistryRevision,
    }),
    revision: prefab.revision,
    placements: [...prefab.placements],
    cells: [...prefab.cells],
    objects: prefab.placements.length === 0 ? [] : [{
      id: prefab.id.replaceAll('-', '_'),
      label: prefab.title,
      placementIds: prefab.placements.map((placement) => placement.id),
      cellIds: prefab.cells.map((cell) => cell.id),
      collectionId: collection?.id ?? null,
    }],
    collections: collection === null ? [] : [collection],
  });
}

export function parseTileObjectWorkspace(source: string): TileObjectWorkspaceV1 {
  let value: unknown;
  try { value = JSON.parse(source); } catch { throw new SyntaxError('Tile object workspace is not valid JSON'); }
  const candidate = record(value);
  if (candidate === null
    || candidate['schemaVersion'] !== TILE_OBJECT_WORKSPACE_SCHEMA_VERSION
    || candidate['kind'] !== 'tile_object_workspace'
    || typeof candidate['id'] !== 'string' || !DOCUMENT_ID.test(candidate['id'])
    || typeof candidate['title'] !== 'string' || candidate['title'].length < 1 || candidate['title'].length > 96
    || !integerInRange(candidate['width'], 1, MAX_DIMENSION)
    || !integerInRange(candidate['height'], 1, MAX_DIMENSION)
    || candidate['tileSize'] !== 16
    || !integerInRange(candidate['revision'], 0, 0x7fff_ffff)
    || typeof candidate['assetRegistryRevision'] !== 'string' || candidate['assetRegistryRevision'].length > 128
    || !Array.isArray(candidate['placements']) || !Array.isArray(candidate['cells'])
    || !Array.isArray(candidate['objects']) || !Array.isArray(candidate['collections'])) {
    throw new TypeError('Tile object workspace is invalid');
  }
  const width = candidate['width'];
  const height = candidate['height'];
  if (candidate['placements'].some((entry) => !isMapStampPlacement(entry, width, height))) {
    throw new TypeError('Tile object workspace placement is invalid');
  }
  const cells = candidate['cells'].map((entry) => parseCell(entry, width, height));
  const objects = candidate['objects'].map(parseObject);
  const collections = candidate['collections'].map((entry) => parseCollection(entry, width, height));
  if (cells.some((entry) => entry === null)
    || objects.some((entry) => entry === null)
    || collections.some((entry) => entry === null)) {
    throw new TypeError('Tile object workspace content is invalid');
  }
  const workspace = normalizeTileObjectWorkspace({
    schemaVersion: TILE_OBJECT_WORKSPACE_SCHEMA_VERSION,
    kind: 'tile_object_workspace',
    id: candidate['id'],
    title: candidate['title'],
    width,
    height,
    tileSize: 16,
    revision: candidate['revision'],
    assetRegistryRevision: candidate['assetRegistryRevision'],
    placements: candidate['placements'] as MapStampPlacement[],
    cells: cells as TileObjectCellMetadata[],
    objects: objects as TileObjectDefinition[],
    collections: collections as TileObjectCollectionFrame[],
  });
  validateRelationships(workspace);
  return workspace;
}

export function serializeTileObjectWorkspace(workspace: TileObjectWorkspaceV1): string {
  validateRelationships(workspace);
  return `${JSON.stringify(normalizeTileObjectWorkspace(workspace), null, 2)}\n`;
}

function changed(workspace: TileObjectWorkspaceV1, patch: Partial<TileObjectWorkspaceV1>): TileObjectWorkspaceV1 {
  return normalizeTileObjectWorkspace({ ...workspace, ...patch, revision: workspace.revision + 1 });
}

export function upsertTileObjectPlacement(
  workspace: TileObjectWorkspaceV1,
  placement: MapStampPlacement,
): TileObjectWorkspaceV1 {
  if (!isMapStampPlacement(placement, workspace.width, workspace.height)) {
    throw new TypeError('Tile object workspace placement is invalid');
  }
  const previous = workspace.placements.find((entry) => entry.id === placement.id);
  if (previous !== undefined && JSON.stringify(previous) === JSON.stringify(placement)) return workspace;
  return changed(workspace, {
    placements: [...workspace.placements.filter((entry) => entry.id !== placement.id), placement],
  });
}

export function removeTileObjectPlacement(
  workspace: TileObjectWorkspaceV1,
  placementId: string,
): TileObjectWorkspaceV1 {
  if (!workspace.placements.some((entry) => entry.id === placementId)) return workspace;
  return changed(workspace, {
    placements: workspace.placements.filter((entry) => entry.id !== placementId),
    objects: workspace.objects.flatMap((object) => {
      const placementIds = object.placementIds.filter((id) => id !== placementId);
      return placementIds.length === 0 ? [] : [{ ...object, placementIds }];
    }),
  });
}

export function upsertTileObjectCell(
  workspace: TileObjectWorkspaceV1,
  cell: TileObjectCellMetadata,
): TileObjectWorkspaceV1 {
  const parsed = parseCell(cell, workspace.width, workspace.height);
  if (parsed === null) throw new TypeError('Tile object metadata cell is invalid');
  const previous = workspace.cells.find((entry) => entry.id === cell.id);
  if (previous !== undefined && JSON.stringify(previous) === JSON.stringify(parsed)) return workspace;
  return changed(workspace, { cells: [...workspace.cells.filter((entry) => entry.id !== cell.id), parsed] });
}

export function upsertTileObjectCollection(
  workspace: TileObjectWorkspaceV1,
  collection: TileObjectCollectionFrame,
): TileObjectWorkspaceV1 {
  const parsed = parseCollection(collection, workspace.width, workspace.height);
  if (parsed === null) throw new TypeError('Tile object collection frame is invalid');
  const previous = workspace.collections.find((entry) => entry.id === parsed.id);
  if (previous !== undefined && JSON.stringify(previous) === JSON.stringify(parsed)) return workspace;
  return changed(workspace, {
    collections: [...workspace.collections.filter((entry) => entry.id !== parsed.id), parsed],
  });
}

export function removeTileObjectCollection(
  workspace: TileObjectWorkspaceV1,
  collectionId: string,
): TileObjectWorkspaceV1 {
  if (!workspace.collections.some((collection) => collection.id === collectionId)) return workspace;
  return changed(workspace, {
    collections: workspace.collections.filter((collection) => collection.id !== collectionId),
    objects: workspace.objects.map((object) => object.collectionId === collectionId
      ? { ...object, collectionId: null }
      : object),
  });
}

export function assignTileObjectCollection(
  workspace: TileObjectWorkspaceV1,
  objectId: string,
  collectionId: string | null,
): TileObjectWorkspaceV1 {
  const object = workspace.objects.find((entry) => entry.id === objectId);
  if (object === undefined) return workspace;
  if (collectionId !== null && !workspace.collections.some((entry) => entry.id === collectionId)) {
    throw new TypeError('Tile object collection does not exist');
  }
  if (object.collectionId === collectionId) return workspace;
  return changed(workspace, {
    objects: workspace.objects.map((entry) => entry.id === objectId
      ? { ...entry, collectionId }
      : entry),
  });
}

export function moveTileObjectCollection(
  workspace: TileObjectWorkspaceV1,
  collectionId: string,
  deltaX: number,
  deltaY: number,
  moveContents = true,
): TileObjectWorkspaceV1 {
  if (!Number.isInteger(deltaX) || !Number.isInteger(deltaY)) {
    throw new TypeError('Collection movement must use whole tiles');
  }
  const collection = workspace.collections.find((entry) => entry.id === collectionId);
  if (collection === undefined || (deltaX === 0 && deltaY === 0)) return workspace;
  const movedCollection = parseCollection({
    ...collection,
    tileX: collection.tileX + deltaX,
    tileY: collection.tileY + deltaY,
  }, workspace.width, workspace.height);
  if (movedCollection === null) throw new RangeError('Collection movement leaves the workspace');
  const memberObjects = new Set(workspace.objects
    .filter((object) => moveContents && object.collectionId === collectionId)
    .map((object) => object.id));
  const placementIds = new Set(workspace.objects
    .filter((object) => memberObjects.has(object.id))
    .flatMap((object) => object.placementIds));
  const cellIds = new Set(workspace.objects
    .filter((object) => memberObjects.has(object.id))
    .flatMap((object) => object.cellIds));
  const placements = workspace.placements.map((entry) => placementIds.has(entry.id)
    ? { ...entry, tileX: entry.tileX + deltaX, tileY: entry.tileY + deltaY }
    : entry);
  const cells = workspace.cells.map((entry) => cellIds.has(entry.id)
    ? { ...entry, tileX: entry.tileX + deltaX, tileY: entry.tileY + deltaY }
    : entry);
  if (placements.some((entry) => !isMapStampPlacement(entry, workspace.width, workspace.height))
    || cells.some((entry) => parseCell(entry, workspace.width, workspace.height) === null)) {
    throw new RangeError('Collection contents leave the workspace');
  }
  return changed(workspace, {
    placements,
    cells,
    collections: workspace.collections.map((entry) => entry.id === collectionId ? movedCollection : entry),
  });
}

export function setTileObjectPivot(
  workspace: TileObjectWorkspaceV1,
  objectId: string,
  tileX: number,
  tileY: number,
): TileObjectWorkspaceV1 {
  if (!integerInRange(tileX, 0, workspace.width - 1)
    || !integerInRange(tileY, 0, workspace.height - 1)) {
    throw new RangeError('Tile object pivot leaves the workspace');
  }
  const object = workspace.objects.find((entry) => entry.id === objectId);
  if (object === undefined) return workspace;
  if (object.pivotTileX === tileX && object.pivotTileY === tileY) return workspace;
  return changed(workspace, {
    objects: workspace.objects.map((entry) => entry.id === objectId
      ? { ...entry, pivotTileX: tileX, pivotTileY: tileY }
      : entry),
  });
}

export type TileObjectTransform = 'rotate_clockwise' | 'rotate_counterclockwise' | 'flip_horizontal';

export function transformTileObject(
  workspace: TileObjectWorkspaceV1,
  objectId: string,
  transform: TileObjectTransform,
): TileObjectWorkspaceV1 {
  const object = workspace.objects.find((entry) => entry.id === objectId);
  if (object === undefined) return workspace;
  const placementIds = new Set(object.placementIds);
  const cellIds = new Set(object.cellIds);
  const memberCoordinates = [
    ...workspace.placements.filter((entry) => placementIds.has(entry.id)),
    ...workspace.cells.filter((entry) => cellIds.has(entry.id)),
  ];
  const pivotX = object.pivotTileX
    ?? Math.floor((Math.min(...memberCoordinates.map((entry) => entry.tileX))
      + Math.max(...memberCoordinates.map((entry) => entry.tileX))) / 2);
  const pivotY = object.pivotTileY
    ?? Math.floor((Math.min(...memberCoordinates.map((entry) => entry.tileY))
      + Math.max(...memberCoordinates.map((entry) => entry.tileY))) / 2);
  const transformPoint = (tileX: number, tileY: number): { readonly tileX: number; readonly tileY: number } => {
    const deltaX = tileX - pivotX;
    const deltaY = tileY - pivotY;
    if (transform === 'rotate_clockwise') return { tileX: pivotX - deltaY, tileY: pivotY + deltaX };
    if (transform === 'rotate_counterclockwise') return { tileX: pivotX + deltaY, tileY: pivotY - deltaX };
    return { tileX: pivotX - deltaX, tileY };
  };
  const placements = workspace.placements.map((entry) => {
    if (!placementIds.has(entry.id)) return entry;
    const point = transformPoint(entry.tileX, entry.tileY);
    return {
      ...entry,
      ...point,
      quarterTurns: transform === 'rotate_clockwise'
        ? (entry.quarterTurns + 1) % 4 as 0 | 1 | 2 | 3
        : transform === 'rotate_counterclockwise'
          ? (entry.quarterTurns + 3) % 4 as 0 | 1 | 2 | 3
          : entry.quarterTurns,
      flipX: transform === 'flip_horizontal' ? !entry.flipX : entry.flipX,
    };
  });
  const cells = workspace.cells.map((entry) => {
    if (!cellIds.has(entry.id)) return entry;
    const point = transformPoint(entry.tileX, entry.tileY);
    return {
      ...entry,
      ...point,
      collisionMask: transformMapPrefabCollisionMask(
        entry.collisionMask,
        transform === 'rotate_clockwise' ? 1 : transform === 'rotate_counterclockwise' ? 3 : 0,
        transform === 'flip_horizontal',
      ),
    };
  });
  if (placements.some((entry) => !isMapStampPlacement(entry, workspace.width, workspace.height))
    || cells.some((entry) => parseCell(entry, workspace.width, workspace.height) === null)) {
    throw new RangeError('Tile object transform leaves the workspace');
  }
  return changed(workspace, { placements, cells });
}

export function groupTileObject(
  workspace: TileObjectWorkspaceV1,
  object: TileObjectDefinition,
): TileObjectWorkspaceV1 {
  const parsed = parseObject(object);
  if (parsed === null) throw new TypeError('Tile object definition is invalid');
  const next = changed(workspace, {
    objects: [...workspace.objects.filter((entry) => entry.id !== parsed.id), parsed],
  });
  validateRelationships(next);
  return next;
}

export function explodeTileObject(
  workspace: TileObjectWorkspaceV1,
  objectId: string,
): TileObjectWorkspaceV1 {
  if (!workspace.objects.some((entry) => entry.id === objectId)) return workspace;
  return changed(workspace, { objects: workspace.objects.filter((entry) => entry.id !== objectId) });
}

export function moveTileObject(
  workspace: TileObjectWorkspaceV1,
  objectId: string,
  deltaX: number,
  deltaY: number,
  collectionId?: string | null,
): TileObjectWorkspaceV1 {
  if (!Number.isInteger(deltaX) || !Number.isInteger(deltaY)) throw new TypeError('Tile object movement must use whole tiles');
  const object = workspace.objects.find((entry) => entry.id === objectId);
  if (object === undefined) return workspace;
  const placementIds = new Set(object.placementIds);
  const cellIds = new Set(object.cellIds);
  const placements = workspace.placements.map((entry) => placementIds.has(entry.id)
    ? { ...entry, tileX: entry.tileX + deltaX, tileY: entry.tileY + deltaY }
    : entry);
  const cells = workspace.cells.map((entry) => cellIds.has(entry.id)
    ? { ...entry, tileX: entry.tileX + deltaX, tileY: entry.tileY + deltaY }
    : entry);
  if (placements.some((entry) => !isMapStampPlacement(entry, workspace.width, workspace.height))
    || cells.some((entry) => parseCell(entry, workspace.width, workspace.height) === null)) {
    throw new RangeError('Tile object movement leaves the workspace');
  }
  const nextCollectionId = collectionId === undefined ? object.collectionId : collectionId;
  if (nextCollectionId !== null && !workspace.collections.some((entry) => entry.id === nextCollectionId)) {
    throw new TypeError('Tile object collection does not exist');
  }
  if (deltaX === 0 && deltaY === 0 && nextCollectionId === object.collectionId) return workspace;
  return changed(workspace, {
    placements,
    cells,
    objects: workspace.objects.map((entry) => entry.id === objectId
      ? { ...entry, collectionId: nextCollectionId }
      : entry),
  });
}

export function tileObjectToMapStamp(
  workspace: TileObjectWorkspaceV1,
  objectId: string,
): MapStampDocumentV1 {
  const object = workspace.objects.find((entry) => entry.id === objectId);
  if (object === undefined) throw new TypeError('Tile object does not exist');
  const ids = new Set(object.placementIds);
  const placements = workspace.placements.filter((entry) => ids.has(entry.id));
  const minimumX = Math.min(...placements.map((entry) => entry.tileX));
  const minimumY = Math.min(...placements.map((entry) => entry.tileY));
  const maximumX = Math.max(...placements.map((entry) => entry.tileX));
  const maximumY = Math.max(...placements.map((entry) => entry.tileY));
  const stamp = createMapStampDocument({
    id: object.id.replaceAll('_', '-'),
    title: object.label,
    width: maximumX - minimumX + 1,
    height: maximumY - minimumY + 1,
    assetRegistryRevision: workspace.assetRegistryRevision,
  });
  return normalizeMapStamp({
    ...stamp,
    placements: placements.map((entry) => ({
      ...entry,
      tileX: entry.tileX - minimumX,
      tileY: entry.tileY - minimumY,
    })),
  });
}

export function tileObjectToMapPrefab(
  workspace: TileObjectWorkspaceV1,
  objectId: string,
): MapPrefabDocumentV2 {
  const object = workspace.objects.find((entry) => entry.id === objectId);
  if (object === undefined) throw new TypeError('Tile object does not exist');
  const placementIds = new Set(object.placementIds);
  const cellIds = new Set(object.cellIds);
  const placements = workspace.placements.filter((entry) => placementIds.has(entry.id));
  const cells = workspace.cells.filter((entry) => cellIds.has(entry.id));
  const coordinates = [
    ...placements.map((entry) => ({ tileX: entry.tileX, tileY: entry.tileY })),
    ...cells.map((entry) => ({ tileX: entry.tileX, tileY: entry.tileY })),
  ];
  const minimumX = Math.min(...coordinates.map((entry) => entry.tileX));
  const minimumY = Math.min(...coordinates.map((entry) => entry.tileY));
  const maximumX = Math.max(...coordinates.map((entry) => entry.tileX));
  const maximumY = Math.max(...coordinates.map((entry) => entry.tileY));
  const collection = object.collectionId === null
    ? null
    : workspace.collections.find((entry) => entry.id === object.collectionId) ?? null;
  const prefab = createMapPrefabDocument({
    id: object.id.replaceAll('_', '-'),
    title: object.label,
    width: maximumX - minimumX + 1,
    height: maximumY - minimumY + 1,
    assetRegistryRevision: workspace.assetRegistryRevision,
    tags: collection === null ? [] : [collection.id],
    collection: collection === null ? null : {
      id: collection.id,
      label: collection.label,
      color: collection.color,
    },
  });
  return normalizeMapPrefab({
    ...prefab,
    pivot: {
      tileX: (object.pivotTileX ?? Math.floor((minimumX + maximumX) / 2)) - minimumX,
      tileY: (object.pivotTileY ?? Math.floor((minimumY + maximumY) / 2)) - minimumY,
    },
    placements: placements.map((entry) => ({
      ...entry,
      tileX: entry.tileX - minimumX,
      tileY: entry.tileY - minimumY,
    })),
    cells: cells.map((entry) => ({
      ...entry,
      tileX: entry.tileX - minimumX,
      tileY: entry.tileY - minimumY,
    })),
  });
}
