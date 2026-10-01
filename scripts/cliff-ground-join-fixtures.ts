// Investigation fixtures, not a proposed replacement movement implementation.
import {
  createEmptyMapDocument, mapCellKey, compileMapDocument,
  collisionMapForCompiledMapDocument, migrateMapDocumentV2,
  movementPositionAllowed, terrainWalkingStepAllowed,
  PLAYER_HITBOX_FOOT_OFFSET, TILE_SIZE_FIXED, FIXED_UNITS_PER_PIXEL,
  type MapDocumentV2, type TerrainTransition,
} from '../packages/sim/src/index.js';
import { planMapEditorTransition } from '../packages/studio/src/tools/map/transition-authoring.js';
import type { TerrainPlanInput } from './terrain-plan.js';

export interface CliffFixture {
  id: string;
  title: string;
  document: MapDocumentV2;
  lower: [number, number];
  upper: [number, number];
}

const lane = (x: number, y: number): TerrainTransition => ({
  kind: 'slope', direction: 'up', contourLevel: 1,
  lowerTileX: x, lowerTileY: y, upperTileX: x, upperTileY: y - 1,
});

function plateau(id: string, lowerX = 6, transitions: TerrainTransition[] = []): CliffFixture {
  const empty = createEmptyMapDocument({ id, title: id, width: 14, height: 14 });
  const cells: Record<string, { elevation: number }> = {};
  for (let y = 2; y <= 7; y++) for (let x = 2; x <= 11; x++) cells[mapCellKey(x, y)] = { elevation: 1 };
  return { id, title: id, document: { ...empty, cells, transitions }, lower: [lowerX, 8], upper: [lowerX, 7] };
}

export function cliffFixtures(): CliffFixture[] {
  const closed = plateau('closed-plateau');
  const ordinary = plateau('straight-north-bank', 6, [lane(6, 8), lane(7, 8)]);
  const end = plateau('bank-at-cliff-end', 2, [lane(2, 8), lane(3, 8)]);
  const long = plateau('four-tile-natural-ascent');
  long.lower = [6, 11];
  const east = plateau('east-facing-bank');
  east.lower = [1, 5]; east.upper = [2, 5];
  east.document = { ...east.document, transitions: [5, 6].map((y) => ({
    kind: 'slope', direction: 'right', contourLevel: 1,
    lowerTileX: 1, lowerTileY: y, upperTileX: 2, upperTileY: y,
  })) };
  const south = plateau('south-facing-bank');
  south.lower = [6, 1]; south.upper = [6, 2];
  south.document = { ...south.document, transitions: [6, 7].map((x) => ({
    kind: 'slope', direction: 'down', contourLevel: 1,
    lowerTileX: x, lowerTileY: 1, upperTileX: x, upperTileY: 2,
  })) };
  const west = plateau('west-facing-bank');
  west.lower = [12, 5]; west.upper = [11, 5];
  west.document = { ...west.document, transitions: [5, 6].map((y) => ({
    kind: 'slope', direction: 'left', contourLevel: 1,
    lowerTileX: 12, lowerTileY: y, upperTileX: 11, upperTileY: y,
  })) };
  return [closed, ordinary, end, long, east, south, west];
}

export function fixturePlan(fixture: CliffFixture, atlas: TerrainPlanInput['atlas']): TerrainPlanInput {
  const { document } = fixture;
  const heights = Array.from({ length: document.height }, (_, y) => Array.from({ length: document.width }, (_, x) => document.cells[mapCellKey(x, y)]?.elevation ?? document.baseElevation));
  return { width: document.width, height: document.height, heights,
    cliffFamily: document.defaultCliffFamily, surfaceFamily: document.defaultSurfaceFamily,
    transitions: [...document.transitions], atlas };
}

/** Walk in one-pixel increments using the real hitbox and compiled plane collision. */
export function walkFixture(fixture: CliffFixture, from = fixture.lower, to = fixture.upper): boolean {
  const compiled = compileMapDocument(fixture.document);
  const map = collisionMapForCompiledMapDocument(compiled);
  const point = ([x, y]: [number, number]) => ({
    x: x * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2,
    y: y * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2 + PLAYER_HITBOX_FOOT_OFFSET + 1,
  });
  let current = point(from);
  const target = point(to);
  if (!movementPositionAllowed(current, current, map)) return false;
  while (current.x !== target.x || current.y !== target.y) {
    const candidate = {
      x: current.x + Math.sign(target.x - current.x) * Math.min(FIXED_UNITS_PER_PIXEL, Math.abs(target.x - current.x)),
      y: current.y + Math.sign(target.y - current.y) * Math.min(FIXED_UNITS_PER_PIXEL, Math.abs(target.y - current.y)),
    };
    if (!movementPositionAllowed(current, candidate, map)) return false;
    current = candidate;
  }
  return true;
}

export function probeFixture(fixture: CliffFixture) {
  const [lx, ly] = fixture.lower, [ux, uy] = fixture.upper;
  const document = migrateMapDocumentV2(fixture.document);
  const plan = planMapEditorTransition(document, { tileX: lx, tileY: ly }, { tileX: ux, tileY: uy }, 'slope', 2);
  const compiled = compileMapDocument(fixture.document);
  return { id: fixture.id, authoringError: plan.error, authoredTransitions: compiled.transitions.length,
    semanticEndpointStep: terrainWalkingStepAllowed(compiled.elevations, compiled.width, compiled.height, compiled.transitions, lx, ly, ux, uy),
    hitboxAscent: walkFixture(fixture), hitboxDescent: walkFixture(fixture, fixture.upper, fixture.lower) };
}

/** Six separated terraces: demonstrates native height projection, not a playable island. */
export function sixLevelVolcano(atlas: TerrainPlanInput['atlas']): TerrainPlanInput {
  const width = 64, height = 74;
  const heights = Array.from({ length: height }, (_, y) => Array.from({ length: width }, (_, x) => {
    let level = 0;
    for (let k = 1; k <= 6; k++) {
      const rx = 30 - (k - 1) * 4, ry = 34 - (k - 1) * 5;
      if ((x - 31) ** 2 / rx ** 2 + (y - 39) ** 2 / ry ** 2 < 1) level = k;
    }
    return level;
  }));
  // A cliff family supplies wall art; the separate biome channel supplies ground.
  const cells = heights.flatMap((row, y) => row.flatMap((level, x) => level > 0
    ? [{ x, y, cliffFamily: 'volcanic', biome: 'volcanic_ash' as const }] : []));
  return { width, height, heights, cells, cliffFamily: 'volcanic', baseBiome: 'volcanic_ash', atlas };
}
