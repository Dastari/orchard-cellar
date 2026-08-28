import {
  MAP_DOCUMENT_SCHEMA_VERSION,
  mapCellKey,
  normalizeMapDocument,
  type MapCellOverride,
  type MapDocumentV2,
  type MapSurfaceKind,
} from './map-document.js';
import type { TerrainTransition } from './terrain-elevation.js';

export interface EmptyMapOptions {
  readonly id: string;
  readonly title: string;
  readonly width: number;
  readonly height: number;
  readonly baseElevation?: number;
  readonly baseSurface?: MapSurfaceKind;
  readonly themeId?: string;
}

export function createEmptyMapDocument(options: EmptyMapOptions): MapDocumentV2 {
  return {
    schemaVersion: MAP_DOCUMENT_SCHEMA_VERSION,
    id: options.id,
    title: options.title,
    width: options.width,
    height: options.height,
    tileSize: 16,
    themeId: options.themeId ?? 'orchard_stone',
    baseElevation: options.baseElevation ?? 0,
    baseSurface: options.baseSurface ?? 'grass',
    revision: 0,
    cells: {},
    transitions: [],
    scenery: [],
    anchors: [],
    provenance: { kind: 'authored', source: 'offline-editor' },
  };
}

function roundedRectangleContains(
  tileX: number,
  tileY: number,
  left: number,
  top: number,
  right: number,
  bottom: number,
  cornerRadius: number,
): boolean {
  if (tileX < left || tileY < top || tileX > right || tileY > bottom) return false;
  const nearestX = Math.max(left + cornerRadius, Math.min(right - cornerRadius, tileX));
  const nearestY = Math.max(top + cornerRadius, Math.min(bottom - cornerRadius, tileY));
  const deltaX = tileX - nearestX;
  const deltaY = tileY - nearestY;
  return deltaX * deltaX + deltaY * deltaY <= cornerRadius * cornerRadius;
}

function paintElevation(
  cells: Record<string, MapCellOverride>,
  width: number,
  height: number,
  elevation: number,
  contains: (tileX: number, tileY: number) => boolean,
): void {
  for (let tileY = 0; tileY < height; tileY += 1) {
    for (let tileX = 0; tileX < width; tileX += 1) {
      if (!contains(tileX, tileY)) continue;
      const key = mapCellKey(tileX, tileY);
      cells[key] = { ...cells[key], elevation };
    }
  }
}

function paintFeatureLine(
  cells: Record<string, MapCellOverride>,
  fromX: number,
  toX: number,
  tileY: number,
): void {
  for (let tileX = fromX; tileX <= toX; tileX += 1) {
    const key = mapCellKey(tileX, tileY);
    cells[key] = { ...cells[key], feature: 'path' };
  }
}

function twoLaneUpTransition(
  contourLevel: number,
  firstTileX: number,
  lowerTileY: number,
  upperTileY: number,
): readonly TerrainTransition[] {
  return [0, 1].map((lane): TerrainTransition => ({
    contourLevel,
    kind: 'slope',
    direction: 'up',
    lowerTileX: firstTileX + lane,
    lowerTileY,
    upperTileX: firstTileX + lane,
    upperTileY,
  }));
}

/** Repeatable regression space: a three-step mountain, a three-step quarry,
 * narrow/concave/pinched contours, and explicit two-lane crossings. */
export function createTerrainLabDocument(): MapDocumentV2 {
  const width = 80;
  const height = 56;
  const cells: Record<string, MapCellOverride> = {};

  // Raised mountain over a sea-level-equivalent base plane of L3.
  paintElevation(cells, width, height, 4, (x, y) => roundedRectangleContains(x, y, 3, 3, 36, 48, 5));
  paintElevation(cells, width, height, 5, (x, y) => roundedRectangleContains(x, y, 8, 8, 31, 41, 4));
  paintElevation(cells, width, height, 6, (x, y) => roundedRectangleContains(x, y, 13, 13, 26, 34, 3));

  // Lowered quarry uses exactly the same absolute-height field. The high
  // exterior is L3; nested excavations descend to L0 without traversal state.
  paintElevation(cells, width, height, 2, (x, y) => roundedRectangleContains(x, y, 43, 3, 76, 48, 5));
  paintElevation(cells, width, height, 1, (x, y) => roundedRectangleContains(x, y, 48, 8, 71, 41, 4));
  paintElevation(cells, width, height, 0, (x, y) => roundedRectangleContains(x, y, 53, 13, 66, 34, 3));

  // Deliberate topology fixtures between the two landmarks.
  paintElevation(cells, width, height, 4, (x, y) => x >= 37 && x <= 41 && y >= 7 && y <= 20);
  paintElevation(cells, width, height, 4, (x, y) => x >= 35 && x <= 39 && y >= 16 && y <= 24);
  paintElevation(cells, width, height, 4, (x, y) => (x === 38 || y === 27) && x >= 35 && x <= 41 && y >= 24 && y <= 30);

  paintFeatureLine(cells, 0, width - 1, 52);
  for (let tileY = 0; tileY < height; tileY += 1) {
    if (tileY < 23 || tileY > 32) continue;
    for (let tileX = 38; tileX <= 40; tileX += 1) {
      const key = mapCellKey(tileX, tileY);
      cells[key] = { ...cells[key], surface: 'water', feature: 'river' };
    }
  }

  const transitions = [
    ...twoLaneUpTransition(4, 19, 49, 48),
    ...twoLaneUpTransition(5, 19, 42, 41),
    ...twoLaneUpTransition(6, 19, 35, 34),
    // From each quarry floor, climb north to the surrounding ring.
    ...twoLaneUpTransition(3, 59, 3, 2),
    ...twoLaneUpTransition(2, 59, 8, 7),
    ...twoLaneUpTransition(1, 59, 13, 12),
  ];

  return normalizeMapDocument({
    ...createEmptyMapDocument({
      id: 'terrain-lab',
      title: 'Terrain Laboratory',
      width,
      height,
      baseElevation: 3,
    }),
    cells,
    transitions,
    anchors: [
      { id: 'mountain-label', kind: 'label', tileX: 20, tileY: 27, elevation: 6, label: 'THREE-TIER MOUNTAIN' },
      { id: 'quarry-label', kind: 'label', tileX: 60, tileY: 27, elevation: 0, label: 'THREE-TIER QUARRY' },
      { id: 'editor-spawn', kind: 'spawn', tileX: 40, tileY: 52, elevation: 3 },
    ],
    provenance: { kind: 'generated', source: 'terrain-lab-v1', generator: 'terrain-lab', generatorVersion: 1 },
  });
}
