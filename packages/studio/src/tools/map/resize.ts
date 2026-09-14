import {
  applyMapEdit,
  mapCellKey,
  mapDocumentV3Hash,
  mapResizeOffset,
  normalizeMapDocumentV3,
  terrainDocumentForMapV3,
  type MapDocumentV3,
  type MapEditCommand,
  type MapPoint,
} from '@orchard/sim';
import { mapEditorAuthoredObjectFootprint } from './selection-footprint.js';

export type MapResizeEdge = 'west' | 'east' | 'north' | 'south';
export type MapResizeCommand = Extract<MapEditCommand, { readonly kind: 'resize' }>;

export interface MapResizeCropBounds {
  readonly minimumTileX: number;
  readonly minimumTileY: number;
  readonly maximumTileX: number;
  readonly maximumTileY: number;
}

export interface MapResizeImpact {
  readonly sourceHash: string;
  readonly command: MapResizeCommand;
  readonly edge: MapResizeEdge;
  readonly grow: boolean;
  readonly step: number;
  readonly offset: MapPoint;
  readonly cropBounds: MapResizeCropBounds | null;
  readonly croppedTileCount: number;
  readonly removedCellOverrideKeys: readonly string[];
  readonly removedObjectIds: readonly string[];
  readonly removedLandmarkIds: readonly string[];
  readonly removedTransitionCount: number;
  readonly removedStairRunCount: number;
  readonly removedSceneryIds: readonly string[];
  readonly removedAnchorIds: readonly string[];
}

function pointInDimensions(point: MapPoint, width: number, height: number): boolean {
  return point.tileX >= 0 && point.tileY >= 0 && point.tileX < width && point.tileY < height;
}

function translated(point: MapPoint, offset: MapPoint): MapPoint {
  return { tileX: point.tileX + offset.tileX, tileY: point.tileY + offset.tileY };
}

function resizeCommand(
  document: MapDocumentV3,
  edge: MapResizeEdge,
  grow: boolean,
  step: number,
): MapResizeCommand {
  if (!Number.isInteger(step) || step <= 0) throw new RangeError('map_resize_step_invalid');
  const delta = grow ? step : -step;
  const width = document.width + (edge === 'west' || edge === 'east' ? delta : 0);
  const height = document.height + (edge === 'north' || edge === 'south' ? delta : 0);
  if (width <= 0 || height <= 0) throw new RangeError('map_resize_dimensions_invalid');
  return {
    kind: 'resize',
    width,
    height,
    // Pin the opposite edge so retained coordinates follow the established V2
    // resize contract. West/north edits therefore translate surviving content.
    anchor: edge === 'west' ? 'east'
      : edge === 'east' ? 'west'
        : edge === 'north' ? 'south'
          : 'north',
  };
}

function sourceCropBounds(
  document: MapDocumentV3,
  edge: MapResizeEdge,
  grow: boolean,
  step: number,
): MapResizeCropBounds | null {
  if (grow) return null;
  if (edge === 'west') return {
    minimumTileX: 0, minimumTileY: 0,
    maximumTileX: step - 1, maximumTileY: document.height - 1,
  };
  if (edge === 'east') return {
    minimumTileX: document.width - step, minimumTileY: 0,
    maximumTileX: document.width - 1, maximumTileY: document.height - 1,
  };
  if (edge === 'north') return {
    minimumTileX: 0, minimumTileY: 0,
    maximumTileX: document.width - 1, maximumTileY: step - 1,
  };
  return {
    minimumTileX: 0, minimumTileY: document.height - step,
    maximumTileX: document.width - 1, maximumTileY: document.height - 1,
  };
}

function translatedCells(
  document: MapDocumentV3,
  command: MapResizeCommand,
  offset: MapPoint,
): Readonly<Record<string, MapDocumentV3['cells'][string]>> {
  const cells: Record<string, MapDocumentV3['cells'][string]> = {};
  for (const [key, cell] of Object.entries(document.cells)) {
    const [tileX, tileY] = key.split(',').map(Number);
    if (!Number.isInteger(tileX) || !Number.isInteger(tileY)) continue;
    const destination = translated({ tileX: tileX!, tileY: tileY! }, offset);
    if (pointInDimensions(destination, command.width, command.height)) {
      cells[mapCellKey(destination.tileX, destination.tileY)] = cell;
    }
  }
  return cells;
}

/**
 * Apply the established terrain resize to the complete V3 authoring document.
 * The shared sim command predates V3 objects, landmarks, and biome fields, so the
 * Studio seam deliberately translates those layers with the exact same offset.
 */
export function applyStudioMapResize(
  document: MapDocumentV3,
  command: MapResizeCommand,
): MapDocumentV3 {
  const offset = mapResizeOffset(document, command.width, command.height, command.anchor);
  const terrain = applyMapEdit(terrainDocumentForMapV3(document), command).document;
  const objects = document.objects.flatMap((object) => {
    const footprint = mapEditorAuthoredObjectFootprint(document, object)
      .map((cell) => translated(cell, offset));
    if (!footprint.every((cell) => pointInDimensions(cell, command.width, command.height))) return [];
    return [{ ...object, tileX: object.tileX + offset.tileX, tileY: object.tileY + offset.tileY }];
  });
  const landmarks = document.landmarks.flatMap((landmark) => {
    const point = translated(landmark, offset);
    return pointInDimensions(point, command.width, command.height)
      ? [{ ...landmark, tileX: point.tileX, tileY: point.tileY }]
      : [];
  });
  return normalizeMapDocumentV3({
    ...document,
    width: terrain.width,
    height: terrain.height,
    revision: terrain.revision,
    cells: translatedCells(document, command, offset),
    transitions: terrain.transitions,
    stairRuns: terrain.stairRuns,
    scenery: terrain.scenery,
    anchors: terrain.anchors,
    objects,
    landmarks,
  });
}

function removedIds(
  before: readonly { readonly id: string }[],
  after: readonly { readonly id: string }[],
): readonly string[] {
  const retained = new Set(after.map(({ id }) => id));
  return before.flatMap(({ id }) => retained.has(id) ? [] : [id]);
}

/** Pure, deterministic resize preview. Shrinks are never committed by this step. */
export function planStudioMapResize(
  document: MapDocumentV3,
  edge: MapResizeEdge,
  grow: boolean,
  step = 1,
): MapResizeImpact {
  const command = resizeCommand(document, edge, grow, step);
  const offset = mapResizeOffset(document, command.width, command.height, command.anchor);
  const result = applyStudioMapResize(document, command);
  const retainedCellKeys = new Set(Object.keys(result.cells));
  const removedCellOverrideKeys = Object.keys(document.cells).flatMap((key) => {
    const [tileX, tileY] = key.split(',').map(Number);
    if (!Number.isInteger(tileX) || !Number.isInteger(tileY)) return [key];
    const point = translated({ tileX: tileX!, tileY: tileY! }, offset);
    return pointInDimensions(point, command.width, command.height)
      && retainedCellKeys.has(mapCellKey(point.tileX, point.tileY)) ? [] : [key];
  });
  return {
    sourceHash: mapDocumentV3Hash(document),
    command,
    edge,
    grow,
    step,
    offset,
    cropBounds: sourceCropBounds(document, edge, grow, step),
    croppedTileCount: Math.max(0, document.width * document.height - command.width * command.height),
    removedCellOverrideKeys,
    removedObjectIds: removedIds(document.objects, result.objects),
    removedLandmarkIds: removedIds(document.landmarks, result.landmarks),
    removedTransitionCount: document.transitions.length - result.transitions.length,
    removedStairRunCount: (document.stairRuns ?? []).length - (result.stairRuns ?? []).length,
    removedSceneryIds: removedIds(document.scenery, result.scenery),
    removedAnchorIds: removedIds(document.anchors, result.anchors),
  };
}

export function mapResizeImpactLossCount(impact: MapResizeImpact): number {
  return impact.removedCellOverrideKeys.length
    + impact.removedObjectIds.length
    + impact.removedLandmarkIds.length
    + impact.removedTransitionCount
    + impact.removedStairRunCount
    + impact.removedSceneryIds.length
    + impact.removedAnchorIds.length;
}
