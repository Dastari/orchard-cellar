import {
  mapCellKey,
  mapCoordinateInBounds,
  normalizeMapDocument,
  resolvedMapCellAt,
  type MapCellOverride,
  type MapDocumentV2,
  type MapFeatureKind,
  type MapSurfaceKind,
} from './map-document.js';
import type { TerrainTransition } from './terrain-elevation.js';

export interface MapPoint {
  readonly tileX: number;
  readonly tileY: number;
}

export interface MapCellPatch {
  readonly elevation?: number;
  readonly surface?: MapSurfaceKind;
  readonly feature?: MapFeatureKind;
  readonly collision?: 'inherit' | 'force_block' | 'force_walk';
  readonly collisionReason?: string;
}

export const MAP_RESIZE_ANCHORS = [
  'north_west', 'north', 'north_east',
  'west', 'center', 'east',
  'south_west', 'south', 'south_east',
] as const;
export type MapResizeAnchor = typeof MAP_RESIZE_ANCHORS[number];

export type MapEditCommand =
  | { readonly kind: 'paint'; readonly points: readonly MapPoint[]; readonly patch: MapCellPatch }
  | { readonly kind: 'line'; readonly from: MapPoint; readonly to: MapPoint; readonly patch: MapCellPatch }
  | { readonly kind: 'fill_surface'; readonly start: MapPoint; readonly surface: MapSurfaceKind }
  | { readonly kind: 'change_elevation_polygon'; readonly polygon: readonly MapPoint[]; readonly delta: number }
  | { readonly kind: 'add_transition'; readonly transition: TerrainTransition }
  | { readonly kind: 'remove_transition'; readonly transition: TerrainTransition }
  | {
    readonly kind: 'resize';
    readonly width: number;
    readonly height: number;
    /** The part of the old document which remains pinned in the new bounds. */
    readonly anchor: MapResizeAnchor;
  };

export interface AppliedMapEdit {
  readonly document: MapDocumentV2;
  readonly changed: readonly MapPoint[];
  /** Dimension changes invalidate coordinate-derived output for the whole map. */
  readonly fullRebuild?: boolean;
}

export interface MapEditHistory {
  readonly present: MapDocumentV2;
  readonly past: readonly MapDocumentV2[];
  readonly future: readonly MapDocumentV2[];
}

function canonicalPatch(document: MapDocumentV2, patch: MapCellPatch): MapCellOverride {
  return {
    ...(patch.elevation === undefined || patch.elevation === document.baseElevation
      ? {} : { elevation: patch.elevation }),
    ...(patch.surface === undefined || patch.surface === document.baseSurface ? {} : { surface: patch.surface }),
    ...(patch.feature === undefined || patch.feature === 'none' ? {} : { feature: patch.feature }),
    ...(patch.collision === undefined || patch.collision === 'inherit' ? {} : { collision: patch.collision }),
    ...(patch.collisionReason === undefined || patch.collisionReason.length === 0
      ? {} : { collisionReason: patch.collisionReason }),
  };
}

function writeResolvedPatch(
  document: MapDocumentV2,
  cells: Record<string, MapCellOverride>,
  point: MapPoint,
  patch: MapCellPatch,
): boolean {
  if (!mapCoordinateInBounds(document, point.tileX, point.tileY)) return false;
  const key = mapCellKey(point.tileX, point.tileY);
  const before = resolvedMapCellAt({ ...document, cells }, point.tileX, point.tileY);
  const resolved: MapCellPatch = {
    elevation: patch.elevation ?? before.elevation,
    surface: patch.surface ?? before.surface,
    feature: patch.feature ?? before.feature,
    collision: patch.collision ?? before.collision,
    ...((patch.collisionReason ?? before.collisionReason) === null
      ? {} : { collisionReason: (patch.collisionReason ?? before.collisionReason)! }),
  };
  const next = canonicalPatch(document, resolved);
  if (next.collision === undefined) delete (next as { collisionReason?: string }).collisionReason;
  const previousJson = JSON.stringify(cells[key] ?? {});
  const nextJson = JSON.stringify(next);
  if (previousJson === nextJson) return false;
  if (Object.keys(next).length === 0) delete cells[key];
  else cells[key] = next;
  return true;
}

/** Integer Bresenham rasterization keeps pointer sampling and CLI strokes identical. */
export function rasterMapLine(from: MapPoint, to: MapPoint): readonly MapPoint[] {
  const points: MapPoint[] = [];
  let x = from.tileX;
  let y = from.tileY;
  const dx = Math.abs(to.tileX - x);
  const sx = x < to.tileX ? 1 : -1;
  const dy = -Math.abs(to.tileY - y);
  const sy = y < to.tileY ? 1 : -1;
  let error = dx + dy;
  for (;;) {
    points.push({ tileX: x, tileY: y });
    if (x === to.tileX && y === to.tileY) break;
    const twiceError = error * 2;
    if (twiceError >= dy) { error += dy; x += sx; }
    if (twiceError <= dx) { error += dx; y += sy; }
  }
  return points;
}

function pointInsidePolygon(point: MapPoint, polygon: readonly MapPoint[]): boolean {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const currentPoint = polygon[index]!;
    const previousPoint = polygon[previous]!;
    const intersects = (currentPoint.tileY > point.tileY) !== (previousPoint.tileY > point.tileY)
      && point.tileX < (previousPoint.tileX - currentPoint.tileX)
        * (point.tileY - currentPoint.tileY)
        / (previousPoint.tileY - currentPoint.tileY) + currentPoint.tileX;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function rasterMapPolygon(polygon: readonly MapPoint[]): readonly MapPoint[] {
  if (polygon.length < 3) return [];
  const minimumX = Math.floor(Math.min(...polygon.map((point) => point.tileX)));
  const maximumX = Math.ceil(Math.max(...polygon.map((point) => point.tileX)));
  const minimumY = Math.floor(Math.min(...polygon.map((point) => point.tileY)));
  const maximumY = Math.ceil(Math.max(...polygon.map((point) => point.tileY)));
  const points: MapPoint[] = [];
  for (let tileY = minimumY; tileY <= maximumY; tileY += 1) {
    for (let tileX = minimumX; tileX <= maximumX; tileX += 1) {
      if (pointInsidePolygon({ tileX: tileX + 0.5, tileY: tileY + 0.5 }, polygon)) {
        points.push({ tileX, tileY });
      }
    }
  }
  return points;
}

function floodSurfacePoints(document: MapDocumentV2, start: MapPoint): readonly MapPoint[] {
  if (!mapCoordinateInBounds(document, start.tileX, start.tileY)) return [];
  const target = resolvedMapCellAt(document, start.tileX, start.tileY).surface;
  const visited = new Set<string>();
  const queue: MapPoint[] = [start];
  const result: MapPoint[] = [];
  for (let index = 0; index < queue.length; index += 1) {
    const point = queue[index]!;
    const key = mapCellKey(point.tileX, point.tileY);
    if (visited.has(key) || !mapCoordinateInBounds(document, point.tileX, point.tileY)) continue;
    visited.add(key);
    if (resolvedMapCellAt(document, point.tileX, point.tileY).surface !== target) continue;
    result.push(point);
    queue.push(
      { tileX: point.tileX, tileY: point.tileY - 1 },
      { tileX: point.tileX + 1, tileY: point.tileY },
      { tileX: point.tileX, tileY: point.tileY + 1 },
      { tileX: point.tileX - 1, tileY: point.tileY },
    );
  }
  return result;
}

function sameTransition(left: TerrainTransition, right: TerrainTransition): boolean {
  return left.contourLevel === right.contourLevel && left.kind === right.kind
    && left.direction === right.direction && left.lowerTileX === right.lowerTileX
    && left.lowerTileY === right.lowerTileY && left.upperTileX === right.upperTileX
    && left.upperTileY === right.upperTileY;
}

function horizontalResizeOffset(delta: number, anchor: MapResizeAnchor): number {
  if (anchor.endsWith('east') || anchor === 'east') return delta;
  if (anchor.endsWith('west') || anchor === 'west') return 0;
  return Math.floor(delta / 2);
}

function verticalResizeOffset(delta: number, anchor: MapResizeAnchor): number {
  if (anchor.startsWith('south') || anchor === 'south') return delta;
  if (anchor.startsWith('north') || anchor === 'north') return 0;
  return Math.floor(delta / 2);
}

/** Uniform coordinate translation used by every layer during a canvas resize.
 * With odd centre growth, the extra column/row is placed east/south. */
export function mapResizeOffset(
  document: Pick<MapDocumentV2, 'width' | 'height'>,
  width: number,
  height: number,
  anchor: MapResizeAnchor,
): MapPoint {
  return {
    tileX: horizontalResizeOffset(width - document.width, anchor),
    tileY: verticalResizeOffset(height - document.height, anchor),
  };
}

function pointInDimensions(point: MapPoint, width: number, height: number): boolean {
  return point.tileX >= 0 && point.tileY >= 0 && point.tileX < width && point.tileY < height;
}

function resizeMapDocument(
  document: MapDocumentV2,
  width: number,
  height: number,
  anchor: MapResizeAnchor,
): MapDocumentV2 {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new RangeError('Map dimensions must be positive integers');
  }
  if (!MAP_RESIZE_ANCHORS.includes(anchor)) throw new RangeError(`Unknown map resize anchor: ${anchor}`);
  if (width === document.width && height === document.height) return document;
  const offset = mapResizeOffset(document, width, height, anchor);
  const translate = (tileX: number, tileY: number): MapPoint => ({
    tileX: tileX + offset.tileX,
    tileY: tileY + offset.tileY,
  });
  const cells: Record<string, MapCellOverride> = {};
  for (const [key, cell] of Object.entries(document.cells)) {
    const [sourceX, sourceY] = key.split(',').map(Number);
    if (!Number.isInteger(sourceX) || !Number.isInteger(sourceY)) continue;
    const point = translate(sourceX!, sourceY!);
    if (pointInDimensions(point, width, height)) cells[mapCellKey(point.tileX, point.tileY)] = cell;
  }
  const transitions = document.transitions.flatMap((transition) => {
    const lower = translate(transition.lowerTileX, transition.lowerTileY);
    const upper = translate(transition.upperTileX, transition.upperTileY);
    if (!pointInDimensions(lower, width, height) || !pointInDimensions(upper, width, height)) return [];
    return [{
      ...transition,
      lowerTileX: lower.tileX,
      lowerTileY: lower.tileY,
      upperTileX: upper.tileX,
      upperTileY: upper.tileY,
    }];
  });
  const scenery = document.scenery.flatMap((placement) => {
    const point = translate(placement.tileX, placement.tileY);
    return pointInDimensions(point, width, height) ? [{ ...placement, ...point }] : [];
  });
  const anchors = document.anchors.flatMap((gameplayAnchor) => {
    const point = translate(gameplayAnchor.tileX, gameplayAnchor.tileY);
    return pointInDimensions(point, width, height) ? [{ ...gameplayAnchor, ...point }] : [];
  });
  return normalizeMapDocument({
    ...document,
    width,
    height,
    revision: document.revision + 1,
    cells,
    transitions,
    scenery,
    anchors,
  });
}

export function applyMapEdit(document: MapDocumentV2, command: MapEditCommand): AppliedMapEdit {
  if (command.kind === 'resize') {
    const resized = resizeMapDocument(document, command.width, command.height, command.anchor);
    return resized === document
      ? { document, changed: [] }
      : { document: resized, changed: [], fullRebuild: true };
  }
  if (command.kind === 'add_transition') {
    if (document.transitions.some((candidate) => sameTransition(candidate, command.transition))) {
      return { document, changed: [] };
    }
    return {
      document: normalizeMapDocument({
        ...document, revision: document.revision + 1,
        transitions: [...document.transitions, command.transition],
      }),
      changed: [
        { tileX: command.transition.lowerTileX, tileY: command.transition.lowerTileY },
        { tileX: command.transition.upperTileX, tileY: command.transition.upperTileY },
      ],
    };
  }
  if (command.kind === 'remove_transition') {
    const transitions = document.transitions.filter((candidate) => !sameTransition(candidate, command.transition));
    if (transitions.length === document.transitions.length) return { document, changed: [] };
    return {
      document: normalizeMapDocument({ ...document, revision: document.revision + 1, transitions }),
      changed: [
        { tileX: command.transition.lowerTileX, tileY: command.transition.lowerTileY },
        { tileX: command.transition.upperTileX, tileY: command.transition.upperTileY },
      ],
    };
  }

  const cells = { ...document.cells };
  const changed: MapPoint[] = [];
  let points: readonly MapPoint[];
  let patch: MapCellPatch;
  if (command.kind === 'paint') { points = command.points; patch = command.patch; }
  else if (command.kind === 'line') { points = rasterMapLine(command.from, command.to); patch = command.patch; }
  else if (command.kind === 'fill_surface') {
    points = floodSurfacePoints(document, command.start);
    patch = { surface: command.surface };
  } else {
    points = rasterMapPolygon(command.polygon);
    patch = {};
  }
  for (const point of points) {
    const pointPatch = command.kind === 'change_elevation_polygon'
      ? { elevation: Math.max(0, resolvedMapCellAt(document, point.tileX, point.tileY).elevation + command.delta) }
      : patch;
    if (writeResolvedPatch(document, cells, point, pointPatch)) changed.push(point);
  }
  if (changed.length === 0) return { document, changed };
  return {
    document: normalizeMapDocument({ ...document, revision: document.revision + 1, cells }),
    changed,
  };
}

export function createMapEditHistory(document: MapDocumentV2): MapEditHistory {
  return { present: document, past: [], future: [] };
}

export function commitMapEdit(history: MapEditHistory, command: MapEditCommand): MapEditHistory {
  const result = applyMapEdit(history.present, command);
  if (result.document === history.present) return history;
  return { present: result.document, past: [...history.past, history.present], future: [] };
}

export function undoMapEdit(history: MapEditHistory): MapEditHistory {
  const previous = history.past[history.past.length - 1];
  if (previous === undefined) return history;
  return { present: previous, past: history.past.slice(0, -1), future: [history.present, ...history.future] };
}

export function redoMapEdit(history: MapEditHistory): MapEditHistory {
  const next = history.future[0];
  if (next === undefined) return history;
  return { present: next, past: [...history.past, history.present], future: history.future.slice(1) };
}
