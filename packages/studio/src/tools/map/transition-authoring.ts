import {
  expandStairRun,
  resolvedMapCellAt,
  stairRunValid,
  terrainDocumentForMapV3,
  terrainTransitionValid,
  type MapDocumentV3,
  type MapEditCommand,
  type MapPoint,
  type StairRun,
  type TerrainTransition,
  type TerrainTransitionCapability,
  type TerrainTransitionDirection,
} from '@orchard/sim';
import type { TerrainArray } from '@orchard/engine/terrain';
import { authoredTransitionArtRefusal } from '@orchard/engine/editor-terrain';

export const MAP_EDITOR_TRANSITION_KINDS = ['slope', 'stairs', 'ladder'] as const;
export type MapEditorTransitionKind = typeof MAP_EDITOR_TRANSITION_KINDS[number];
export type MapEditorTransitionWidth = 2 | 3 | 4;

export type MapEditorTransitionError =
  | 'transition_same_elevation'
  | 'transition_not_cardinal'
  | 'transition_path_length_mismatch'
  | 'transition_width_exceeds_map'
  | 'transition_direction_art_unavailable'
  | 'transition_family_art_unavailable'
  | 'transition_bank_width_unavailable'
  | 'transition_stair_art_unavailable'
  | 'transition_ladder_runtime_unavailable'
  | 'transition_kind_runtime_unavailable'
  | 'transition_endpoint_height_mismatch';

export interface MapEditorTransitionPreviewPoint extends MapPoint {
  readonly elevation: number;
}

export interface MapEditorTransitionPlan {
  readonly kind: MapEditorTransitionKind;
  readonly width: MapEditorTransitionWidth;
  readonly direction: TerrainTransitionDirection | null;
  readonly from: MapEditorTransitionPreviewPoint;
  readonly to: MapEditorTransitionPreviewPoint;
  readonly transitions: readonly TerrainTransition[];
  readonly command: MapEditCommand | null;
  readonly error: MapEditorTransitionError | null;
}

const directionFor = (lower: MapPoint, upper: MapPoint): TerrainTransitionDirection | null => {
  const deltaX = Math.sign(upper.tileX - lower.tileX);
  const deltaY = Math.sign(upper.tileY - lower.tileY);
  if ((deltaX === 0) === (deltaY === 0)) return null;
  if (deltaY < 0) return 'up';
  if (deltaX > 0) return 'right';
  if (deltaY > 0) return 'down';
  return 'left';
};

const clampInteger = (value: number, maximum: number): number => Math.max(
  0,
  Math.min(Math.max(0, maximum), Math.round(Number.isFinite(value) ? value : 0)),
);

/** Clamp pointer-derived endpoints to a finite map before resolving their
 * semantic elevation. This keeps captured drags usable at the canvas edge. */
export function clampMapEditorTransitionPoint(
  document: Pick<MapDocumentV3, 'width' | 'height'>,
  point: MapPoint,
): MapPoint {
  return {
    tileX: clampInteger(point.tileX, document.width - 1),
    tileY: clampInteger(point.tileY, document.height - 1),
  };
}

function elevationAt(
  document: MapDocumentV3,
  terrain: TerrainArray | null,
  point: MapPoint,
): number {
  if (terrain !== null && terrain.width === document.width && terrain.height === document.height) {
    return terrain.elevations[point.tileY * terrain.width + point.tileX] ?? document.baseElevation;
  }
  return resolvedMapCellAt(terrainDocumentForMapV3(document), point.tileX, point.tileY).elevation;
}

function invalidPlan(
  kind: MapEditorTransitionKind,
  width: MapEditorTransitionWidth,
  from: MapEditorTransitionPreviewPoint,
  to: MapEditorTransitionPreviewPoint,
  error: MapEditorTransitionError,
  direction: TerrainTransitionDirection | null = null,
  transitions: readonly TerrainTransition[] = [],
): MapEditorTransitionPlan {
  return Object.freeze({ kind, width, direction, from, to,
    transitions: Object.freeze([...transitions]), command: null, error });
}

function transitionEndpointsMatch(
  document: MapDocumentV3,
  terrain: TerrainArray | null,
  transitions: readonly TerrainTransition[],
): boolean {
  return transitions.every((transition) => (
    elevationAt(document, terrain, {
      tileX: transition.lowerTileX,
      tileY: transition.lowerTileY,
    }) === transition.contourLevel - 1
    && elevationAt(document, terrain, {
      tileX: transition.upperTileX,
      tileY: transition.upperTileY,
    }) === transition.contourLevel
  ));
}

function transitionArtRefusal(
  document: MapDocumentV3,
  terrain: TerrainArray | null,
  transitions: readonly TerrainTransition[],
  width: number,
): TerrainTransitionCapability | null {
  const terrainDocument = terrainDocumentForMapV3(document);
  for (const transition of transitions) {
    const families = new Set([
      resolvedMapCellAt(terrainDocument, transition.lowerTileX, transition.lowerTileY).cliffFamily,
      resolvedMapCellAt(terrainDocument, transition.upperTileX, transition.upperTileY).cliffFamily,
    ]);
    for (const familyId of families) {
      const refusal = authoredTransitionArtRefusal({
        kind: transition.kind,
        direction: transition.direction,
        familyId,
        width,
        ...(terrain?.tilesets === undefined ? {} : { tilesets: terrain.tilesets }),
      });
      if (refusal !== null) return refusal;
    }
  }
  return null;
}

/** Turn a lower/upper endpoint gesture into the exact semantic command used by
 * gameplay compilation. Slope banks are authored as complete parallel lanes,
 * stair runs retain their compact multi-course contract, and ladders remain a
 * single interaction lane. Invalid candidates are still returned for preview. */
export function planMapEditorTransition(
  document: MapDocumentV3,
  startSource: MapPoint,
  endSource: MapPoint,
  kind: MapEditorTransitionKind,
  width: MapEditorTransitionWidth,
  terrain: TerrainArray | null = null,
): MapEditorTransitionPlan {
  const start = clampMapEditorTransitionPoint(document, startSource);
  const end = clampMapEditorTransitionPoint(document, endSource);
  const vertical = start.tileX === end.tileX && start.tileY !== end.tileY;
  const horizontal = start.tileY === end.tileY && start.tileX !== end.tileX;
  const effectiveWidth = kind === 'ladder' ? 1 : width;
  const widthLimit = vertical ? document.width : horizontal ? document.height : Number.POSITIVE_INFINITY;
  const unclampedFrom = { ...start, elevation: elevationAt(document, terrain, start) };
  const unclampedTo = { ...end, elevation: elevationAt(document, terrain, end) };
  if (!vertical && !horizontal) {
    return invalidPlan(kind, width, unclampedFrom, unclampedTo,
      start.tileX === end.tileX && start.tileY === end.tileY
        ? 'transition_same_elevation' : 'transition_not_cardinal');
  }
  if (effectiveWidth > widthLimit) {
    return invalidPlan(kind, width, unclampedFrom, unclampedTo, 'transition_width_exceeds_map');
  }

  // Width grows along the positive lateral axis, matching expandStairRun().
  // Shift the gesture as one unit so every lane remains within the finite map.
  const maximumLateral = Math.max(0, widthLimit - effectiveWidth);
  const lateral = clampInteger(vertical ? start.tileX : start.tileY, maximumLateral);
  const fromPoint = vertical
    ? { tileX: lateral, tileY: start.tileY }
    : { tileX: start.tileX, tileY: lateral };
  const toPoint = vertical
    ? { tileX: lateral, tileY: end.tileY }
    : { tileX: end.tileX, tileY: lateral };
  const from = { ...fromPoint, elevation: elevationAt(document, terrain, fromPoint) };
  const to = { ...toPoint, elevation: elevationAt(document, terrain, toPoint) };
  if (from.elevation === to.elevation) {
    return invalidPlan(kind, width, from, to, 'transition_same_elevation');
  }
  const lower = from.elevation < to.elevation ? from : to;
  const upper = from.elevation < to.elevation ? to : from;
  const direction = directionFor(lower, upper);
  if (direction === null) return invalidPlan(kind, width, from, to, 'transition_not_cardinal');
  const rise = upper.elevation - lower.elevation;
  const distance = Math.abs(upper.tileX - lower.tileX) + Math.abs(upper.tileY - lower.tileY);
  if (distance !== rise || (kind !== 'stairs' && rise !== 1)) {
    return invalidPlan(kind, width, from, to, 'transition_path_length_mismatch', direction);
  }

  let transitions: readonly TerrainTransition[];
  let command: MapEditCommand;
  if (kind === 'stairs') {
    const run: StairRun = {
      x: lower.tileX,
      y: lower.tileY,
      direction,
      fromLevel: lower.elevation,
      toLevel: upper.elevation,
      width,
    };
    if (!stairRunValid(run)) {
      return invalidPlan(kind, width, from, to, 'transition_path_length_mismatch', direction);
    }
    transitions = expandStairRun(run);
    command = { kind: 'add_stair_run', run };
  } else {
    const [lateralX, lateralY] = direction === 'up' || direction === 'down' ? [1, 0] : [0, 1];
    transitions = Array.from({ length: effectiveWidth }, (_, lane): TerrainTransition => ({
      contourLevel: upper.elevation,
      kind,
      direction,
      lowerTileX: lower.tileX + lane * lateralX,
      lowerTileY: lower.tileY + lane * lateralY,
      upperTileX: upper.tileX + lane * lateralX,
      upperTileY: upper.tileY + lane * lateralY,
    }));
    if (transitions.some((transition) => !terrainTransitionValid(transition))) {
      return invalidPlan(kind, width, from, to, 'transition_path_length_mismatch', direction, transitions);
    }
    command = transitions.length === 1
      ? { kind: 'add_transition', transition: transitions[0]! }
      : { kind: 'add_transitions', transitions };
  }
  if (!transitionEndpointsMatch(document, terrain, transitions)) {
    return invalidPlan(kind, width, from, to,
      'transition_endpoint_height_mismatch', direction, transitions);
  }
  const artRefusal = transitionArtRefusal(document, terrain, transitions, effectiveWidth);
  if (artRefusal !== null && !artRefusal.supported) {
    return invalidPlan(kind, width, from, to, artRefusal.code, direction, transitions);
  }
  return Object.freeze({ kind, width, direction, from, to,
    transitions: Object.freeze([...transitions]), command, error: null });
}

export function mapEditorTransitionErrorLabel(error: MapEditorTransitionError | null): string {
  if (error === null) return 'RELEASE TO AUTHOR TRANSITION';
  if (error === 'transition_same_elevation') return 'DRAG BETWEEN DIFFERENT ELEVATIONS';
  if (error === 'transition_not_cardinal') return 'TRANSITION MUST FOLLOW ONE CARDINAL AXIS';
  if (error === 'transition_path_length_mismatch') return 'PATH LENGTH MUST MATCH HEIGHT CHANGE';
  if (error === 'transition_width_exceeds_map') return 'TRANSITION WIDTH EXCEEDS THIS MAP';
  if (error === 'transition_direction_art_unavailable') return 'AUTHORED TRANSITION ART FACES NORTH ONLY';
  if (error === 'transition_family_art_unavailable') return 'SELECTED CLIFF FAMILY HAS NO SLOPE BANK ART';
  if (error === 'transition_bank_width_unavailable') return 'SLOPE BANKS REQUIRE AT LEAST TWO LANES';
  if (error === 'transition_stair_art_unavailable') return 'DEDICATED STAIR ART IS NOT REGISTERED';
  if (error === 'transition_ladder_runtime_unavailable') return 'LADDER TRAVERSAL AND DIRECTIONAL ART ARE NOT AVAILABLE';
  if (error === 'transition_kind_runtime_unavailable') return 'TRANSITION KIND HAS NO RUNTIME ART CONTRACT';
  return 'EVERY LANE MUST JOIN MATCHING CONTOUR ENDPOINTS';
}
