import {
  MAP_DOCUMENT_SCHEMA_VERSION,
  mapCellKey,
  normalizeMapDocument,
  type MapCellOverride,
  type MapDocumentV2,
  type MapSurfaceKind,
} from './map-document.js';
import {
  TERRAIN_CLIFF_FAMILIES,
  type CliffFamilyId,
  type TerrainSurfaceFamilyId,
} from './terrain-tilesets.js';
import type { StairRun, TerrainTransition } from './terrain-elevation.js';

export interface EmptyMapOptions {
  readonly id: string;
  readonly title: string;
  readonly width: number;
  readonly height: number;
  readonly baseElevation?: number;
  readonly baseSurface?: MapSurfaceKind;
  readonly themeId?: string;
  readonly cliffFamily?: CliffFamilyId;
  readonly surfaceFamily?: TerrainSurfaceFamilyId;
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
    defaultCliffFamily: options.cliffFamily ?? 'stone_1',
    defaultSurfaceFamily: options.surfaceFamily ?? 'grass_1',
    revision: 0,
    cells: {},
    transitions: [],
    stairRuns: [],
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

function paintLedge(
  cells: Record<string, MapCellOverride>,
  width: number,
  height: number,
  contains: (tileX: number, tileY: number) => boolean,
): void {
  for (let tileY = 0; tileY < height; tileY += 1) for (let tileX = 0; tileX < width; tileX += 1) {
    if (!contains(tileX, tileY)) continue;
    const key = mapCellKey(tileX, tileY);
    cells[key] = { ...cells[key], ledge: true };
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
export function createTerrainLabDocument(cliffFamily: CliffFamilyId = 'stone_1'): MapDocumentV2 {
  const width = 80;
  const height = 80;
  const cells: Record<string, MapCellOverride> = {};

  // Raised matrix: one contour, a second nested contour, then a five-high
  // peak which exercises repeatable contour composition.
  paintElevation(cells, width, height, 1, (x, y) => roundedRectangleContains(x, y, 3, 3, 36, 48, 5));
  paintElevation(cells, width, height, 2, (x, y) => roundedRectangleContains(x, y, 8, 8, 31, 41, 4));
  paintElevation(cells, width, height, 5, (x, y) => roundedRectangleContains(x, y, 13, 13, 26, 34, 3));

  // Lowered quarry uses exactly the same absolute-height field. The high
  // exterior is L0; nested excavations descend through signed contours.
  paintElevation(cells, width, height, -1, (x, y) => roundedRectangleContains(x, y, 43, 3, 76, 48, 5));
  paintElevation(cells, width, height, -2, (x, y) => roundedRectangleContains(x, y, 48, 8, 71, 41, 4));
  paintElevation(cells, width, height, -3, (x, y) => roundedRectangleContains(x, y, 53, 13, 66, 34, 3));

  // Deliberate topology fixtures between the two landmarks.
  paintElevation(cells, width, height, 1, (x, y) => x >= 37 && x <= 41 && y >= 7 && y <= 20);
  paintElevation(cells, width, height, 1, (x, y) => x >= 35 && x <= 39 && y >= 16 && y <= 24);
  paintElevation(cells, width, height, 1, (x, y) => (
    ((x === 38 || x === 39) || (y === 27 || y === 28))
    && x >= 35 && x <= 41 && y >= 24 && y <= 30
  ));

  // A contiguous three-course stair lane replaces a three-level wall delta.
  paintElevation(cells, width, height, 3, (x, y) => (x === 19 || x === 20) && y === 34);
  paintElevation(cells, width, height, 4, (x, y) => (x === 19 || x === 20) && y === 33);

  paintFeatureLine(cells, 0, width - 1, 52);
  for (let tileY = 0; tileY < height; tileY += 1) {
    if (tileY < 23 || tileY > 32) continue;
    for (let tileX = 38; tileX <= 40; tileX += 1) {
      const key = mapCellKey(tileX, tileY);
      cells[key] = { ...cells[key], surface: 'water', feature: 'river' };
    }
  }

  // §7.6 topology matrix. Every raised fixture obeys the engine's minimum
  // 2x2 semantic footprint; narrow spurs are represented by two-wide lanes.
  paintElevation(cells, width, height, 1, (x, y) => x >= 2 && x <= 3 && y >= 59 && y <= 60);
  paintElevation(cells, width, height, 1, (x, y) => x >= 7 && x <= 11 && y >= 58 && y <= 62);
  paintElevation(cells, width, height, 0, (x, y) => x >= 8 && x <= 10 && y >= 59 && y <= 61); // donut
  paintElevation(cells, width, height, 1, (x, y) => (
    (x >= 14 && x <= 18 && y >= 58 && y <= 62)
    || (x >= 18 && x <= 21 && (y === 60 || y === 61))
  )); // peninsula

  // Four rotations of the same concave corner.
  for (const [left, top, missingX, missingY] of [
    [25, 58, 25, 58], [30, 58, 32, 58], [25, 63, 25, 65], [30, 63, 32, 65],
  ] as const) {
    paintElevation(cells, width, height, 1, (x, y) => (
      x >= left && x <= left + 2 && y >= top && y <= top + 2
      && !(x === missingX && y === missingY)
    ));
  }

  paintElevation(cells, width, height, 2, (x, y) => x >= 39 && x <= 47 && y >= 58 && y <= 66);
  paintElevation(cells, width, height, 0, (x, y) => x >= 42 && x <= 44 && y >= 61 && y <= 63); // pit in plateau
  paintElevation(cells, width, height, -1, (x, y) => x >= 51 && x <= 59 && y >= 58 && y <= 66);
  paintElevation(cells, width, height, 1, (x, y) => x >= 54 && x <= 56 && y >= 61 && y <= 63); // peak in pit
  paintElevation(cells, width, height, 1, (x, y) => x >= 64 && x <= 76 && y >= 58 && y <= 66);
  paintElevation(cells, width, height, 4, (x, y) => x >= 64 && x <= 69 && y >= 58 && y <= 66); // direct 4→1

  // Flat ledge overlays: a closed donut and a notched raised-bed silhouette.
  // Neither fixture changes elevation or introduces projected face rows.
  paintLedge(cells, width, height, (x, y) => x >= 2 && x <= 10 && y >= 69 && y <= 77
    && !(x >= 5 && x <= 7 && y >= 72 && y <= 74));
  paintLedge(cells, width, height, (x, y) => x >= 13 && x <= 23 && y >= 69 && y <= 77
    && !(x >= 16 && x <= 20 && y >= 72 && y <= 77));

  // A four-lane one-level ramp-bank fixture. The existing x=19 stair run is
  // the 2-lane x 3-level fixture and the mountain entry is 2-lane x 1-level.
  paintElevation(cells, width, height, 1, (x, y) => x >= 27 && x <= 34 && y >= 69 && y <= 73);

  const transitions = [
    ...twoLaneUpTransition(1, 19, 49, 48),
    ...twoLaneUpTransition(2, 19, 42, 41),
    // From each quarry floor, climb north to the surrounding ring.
    ...twoLaneUpTransition(0, 59, 3, 2),
    ...twoLaneUpTransition(-1, 59, 8, 7),
    ...twoLaneUpTransition(-2, 59, 13, 12),
    ...[0, 1, 2, 3].map((lane): TerrainTransition => ({
      contourLevel: 1,
      kind: 'slope',
      direction: 'up',
      lowerTileX: 29 + lane,
      lowerTileY: 74,
      upperTileX: 29 + lane,
      upperTileY: 73,
    })),
  ];
  const stairRuns: readonly StairRun[] = [{
    x: 19, y: 35, direction: 'up', fromLevel: 2, toLevel: 5, width: 2,
  }];

  return normalizeMapDocument({
    ...createEmptyMapDocument({
      id: 'terrain-lab',
      title: 'Terrain Laboratory',
      width,
      height,
      baseElevation: 0,
      cliffFamily,
    }),
    cells,
    transitions,
    stairRuns,
    anchors: [
      { id: 'mountain-label', kind: 'label', tileX: 20, tileY: 27, elevation: 5, label: 'FIVE-HIGH MOUNTAIN' },
      { id: 'quarry-label', kind: 'label', tileX: 60, tileY: 27, elevation: -3, label: 'SIGNED QUARRY' },
      { id: 'editor-spawn', kind: 'spawn', tileX: 40, tileY: 74, elevation: 0 },
    ],
    provenance: { kind: 'generated', source: 'terrain-lab-v1', generator: 'terrain-lab', generatorVersion: 1 },
  });
}

export const TERRAIN_LAB_GOLDEN_SAMPLES = {
  minimum_raised: { tileX: 3, tileY: 60 },
  donut_outer: { tileX: 7, tileY: 60 },
  donut_hole: { tileX: 9, tileY: 60 },
  peninsula_tip: { tileX: 21, tileY: 60 },
  corner_nw: { tileX: 26, tileY: 59 },
  corner_ne: { tileX: 31, tileY: 59 },
  corner_sw: { tileX: 26, tileY: 64 },
  corner_se: { tileX: 31, tileY: 64 },
  pit_in_plateau: { tileX: 42, tileY: 61 },
  peak_in_pit: { tileX: 54, tileY: 61 },
  four_to_one: { tileX: 69, tileY: 62 },
} as const;

/** One identical semantic lab per available registry family, useful for CLI
 * plan snapshots and side-by-side visual review. */
export function createTerrainLabDocumentsByFamily(): Readonly<Record<string, MapDocumentV2>> {
  return Object.fromEntries(Object.entries(TERRAIN_CLIFF_FAMILIES).flatMap(([familyId, family]) => (
    family.available
      ? [[familyId, {
          ...createTerrainLabDocument(familyId as CliffFamilyId),
          id: `terrain-lab-${familyId}`,
          title: `Terrain Laboratory — ${familyId}`,
        }] as const]
      : []
  )));
}
