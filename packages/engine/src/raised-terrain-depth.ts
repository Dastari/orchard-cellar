import { snapRectForContext } from '@orchard/ui';
import { worldAssetFrameSource } from './world-asset-presentation.js';
import { groundSpriteSource } from './ground-light-source.js';
import {
  SURVIVAL_CHUNK_TILES,
  TILE_SIZE_PIXELS,
  TERRAIN_SURFACE_FAMILIES,
  caveWallSupportAnchorAt,
  raisedTerrainEdgeRoleAt,
  raisedTerrainInsetRolesAt,
  surfaceFamilyAtIndex,
  terrainTransitionLaneAt,
  terrainProjectedDepthOffset,
  type RaisedTerrainRampBankCourse,
  type RaisedTerrainGrid,
  type TerrainTransition,
} from '@orchard/sim';
import type { OverworldArt } from './overworld-art.js';
import type { GroundChunkCache } from './ground-cache.js';
import { selectAtlasFrame } from '@orchard/ui';
import {
  plateauLayerPlansAt,
  raisedCliffTileSetFor,
  terrainBaseDatum,
  terrainBiomeAt,
  terrainElevationAt,
  terrainMaximumElevation,
  terrainMinimumElevation,
  terrainProjectedRowsPerLevel,
  terrainProjectedSortOffset,
  terrainVisualProjectionRowsPerLevel,
  type TerrainArray,
} from './terrain.js';
import type { WorldDepthItem } from './renderer.js';
import type { LoadedAsset } from '@orchard/ui';
import {
  createTerrainCutawayMask,
  drawWithTerrainCutaway,
  terrainCutawayOverlapsRect,
  terrainCutawayOverlapsTile,
  terrainCutawayReceiverOccludes,
  type TerrainCutawayFocus,
  type TerrainCutawayMask,
} from './terrain-cutaway.js';

export interface RaisedTerrainDepthEntry {
  readonly tileX: number;
  readonly tileY: number;
  readonly contourLevel: number;
  /** Height-bearing rows in the active wall profile. */
  readonly projectionRows: number;
  /** Rows by which the logical source plane is displaced on screen. */
  readonly visualProjectionRows: number;
  readonly baseDatum: number;
  readonly footY: number;
  readonly depthOffset: number;
  readonly plan: ReturnType<typeof plateauLayerPlansAt>[number]['plan'];
}

export interface RaisedTerrainSurfaceRun {
  readonly firstTileX: number;
  readonly lastTileX: number;
  readonly tileY: number;
  readonly elevation: number;
  readonly footY: number;
  readonly visualOffset: number;
}

export interface TerrainLedgePlan {
  readonly assetId: string;
  readonly edgeRole: ReturnType<typeof raisedTerrainEdgeRoleAt>;
  readonly edgeFrame: number | null;
  readonly insetRoles: ReturnType<typeof raisedTerrainInsetRolesAt>;
  readonly insetFrames: readonly number[];
}

export function terrainLedgePlanAt(
  terrain: TerrainArray,
  tileX: number,
  tileY: number,
): TerrainLedgePlan | null {
  const index = tileY * terrain.width + tileX;
  if (tileX < 0 || tileY < 0 || tileX >= terrain.width || tileY >= terrain.height
    || terrain.ledges?.[index] !== 1) return null;
  const ledgeAt = (x: number, y: number): boolean => x >= 0 && y >= 0
    && x < terrain.width && y < terrain.height
    && terrain.ledges?.[y * terrain.width + x] === 1;
  const grid: RaisedTerrainGrid = { raisedAt: ledgeAt };
  const familyId = surfaceFamilyAtIndex(terrain.surfaceFamilies?.[index] ?? 0)
    ?? terrain.defaultSurfaceFamily ?? 'grass_1';
  const bank = raisedCliffTileSetFor(terrain, tileX, tileY).ledgeBank
    ?? TERRAIN_SURFACE_FAMILIES[familyId].ledgeBank;
  const edgeRole = raisedTerrainEdgeRoleAt(grid, tileX, tileY);
  const insetRoles = raisedTerrainInsetRolesAt(grid, tileX, tileY);
  return {
    assetId: bank.assetId,
    edgeRole,
    edgeFrame: edgeRole === null ? null : bank.edgeFrames[edgeRole],
    insetRoles,
    insetFrames: insetRoles.map((role) => bank.insetFrames[role]),
  };
}

export function raisedTerrainSurfaceRuns(
  terrain: TerrainArray,
  minimumTileX: number,
  minimumTileY: number,
  maximumTileX: number,
  maximumTileY: number,
): readonly RaisedTerrainSurfaceRun[] {
  const projectsAsOpaqueSurface = (tileX: number, tileY: number, elevation: number): boolean => {
    const boundary = plateauLayerPlansAt(terrain, tileX, tileY)
      .find((entry) => entry.contourLevel === elevation)?.plan;
    // Boundary and ramp sheets already contain the correctly shaped cap.
    // Copying the rectangular ground tile underneath them fills their
    // transparent corners and produces the green occlusion blocks seen at
    // concave/side cliff edges.
    return boundary === undefined || (boundary.edgeFrame === null && boundary.rampRole === null);
  };
  const runs: RaisedTerrainSurfaceRun[] = [];
  const firstX = Math.max(0, minimumTileX);
  const lastX = Math.min(terrain.width - 1, maximumTileX);
  for (let tileY = Math.max(0, minimumTileY); tileY <= Math.min(terrain.height - 1, maximumTileY); tileY += 1) {
    let tileX = firstX;
    while (tileX <= lastX) {
      const elevation = terrainElevationAt(terrain, tileX, tileY);
      const baseDatum = terrainBaseDatum(terrain);
      const projectionRows = terrainProjectedRowsPerLevel(terrain);
      if (elevation === baseDatum || !projectsAsOpaqueSurface(tileX, tileY, elevation)) {
        tileX += 1;
        continue;
      }
      const runStart = tileX;
      const chunkX = Math.floor(tileX / SURVIVAL_CHUNK_TILES);
      while (tileX + 1 <= lastX
        && Math.floor((tileX + 1) / SURVIVAL_CHUNK_TILES) === chunkX
        && terrainElevationAt(terrain, tileX + 1, tileY) === elevation
        && projectsAsOpaqueSurface(tileX + 1, tileY, elevation)) tileX += 1;
      runs.push({
        firstTileX: runStart,
        lastTileX: tileX,
        tileY,
        elevation,
        footY: (tileY + 1) * TILE_SIZE_PIXELS - terrainProjectedDepthOffset(
          elevation,
          projectionRows,
          TILE_SIZE_PIXELS,
          baseDatum,
        ),
        visualOffset: terrainProjectedDepthOffset(
          elevation,
          projectionRows,
          TILE_SIZE_PIXELS,
          baseDatum,
        ),
      });
      tileX += 1;
    }
  }
  return runs;
}

export function raisedTerrainVisualOffset(
  entry: Pick<RaisedTerrainDepthEntry, 'contourLevel' | 'visualProjectionRows' | 'baseDatum'>,
): number {
  return terrainProjectedDepthOffset(
    entry.contourLevel,
    entry.visualProjectionRows,
    TILE_SIZE_PIXELS,
    entry.baseDatum,
  );
}

export function raisedTerrainDepthEntries(
  terrain: TerrainArray,
  minimumTileX: number,
  minimumTileY: number,
  maximumTileX: number,
  maximumTileY: number,
): readonly RaisedTerrainDepthEntry[] {
  const entries: RaisedTerrainDepthEntry[] = [];
  for (let tileY = Math.max(0, minimumTileY); tileY <= Math.min(terrain.height - 1, maximumTileY); tileY += 1) {
    for (let tileX = Math.max(0, minimumTileX); tileX <= Math.min(terrain.width - 1, maximumTileX); tileX += 1) {
      const projectionRows = terrainProjectedRowsPerLevel(terrain);
      const visualProjectionRows = terrainVisualProjectionRowsPerLevel(terrain);
      for (const { contourLevel, plan } of plateauLayerPlansAt(terrain, tileX, tileY)) {
        entries.push({
          tileX,
          tileY,
          contourLevel,
          projectionRows,
          visualProjectionRows,
          baseDatum: terrainBaseDatum(terrain),
          footY: (tileY + 1) * TILE_SIZE_PIXELS - raisedTerrainVisualOffset({
            contourLevel,
            visualProjectionRows,
            baseDatum: terrainBaseDatum(terrain),
          }),
          depthOffset: terrainProjectedSortOffset(contourLevel, true),
          plan,
        });
      }
    }
  }
  return entries;
}

function drawTerrainAsset(
  context: CanvasRenderingContext2D,
  asset: LoadedAsset,
  frameIndex: number,
  tileX: number,
  tileY: number,
  cameraX: number,
  cameraY: number,
  scale: number,
): void {
  const selected = selectAtlasFrame(asset.metadata, 'base', frameIndex);
  if (selected === null) return;
  const original = worldAssetFrameSource(context, asset, selected)!;
  const worldX = tileX * TILE_SIZE_PIXELS + 8 - asset.anchor[0];
  const worldY = tileY * TILE_SIZE_PIXELS + 15 - asset.anchor[1];
  const source = groundSpriteSource(context, original, worldX, worldY);
  const destination = snapRectForContext(context, {
    x: (worldX - cameraX) * scale, y: (worldY - cameraY) * scale,
    width: source.width * scale, height: source.height * scale,
  });
  context.drawImage(
    source.image,
    source.x,
    source.y,
    source.width,
    source.height,
    destination.x, destination.y, destination.width, destination.height,
  );
}

export type RaisedTerrainDepthStratum = 'face' | 'face_foot' | 'cap';

export interface RaisedTerrainDepthLayer {
  readonly stratum: RaisedTerrainDepthStratum;
  readonly elevationLayer: number;
  readonly depthPhase: NonNullable<WorldDepthItem['depthPhase']>;
}

function raisedWaterfallColumnAt(
  terrain: TerrainArray,
  tileX: number,
  tileY: number,
): number {
  const waterfall = (offsetX: number): boolean =>
    terrainBiomeAt(terrain, tileX + offsetX, tileY) === 'waterfall';
  return !waterfall(-1) ? 0 : !waterfall(1) ? 2 : 1;
}

/** Selects the static waterfall atlas row that replaces a projected cliff
 * stratum. One elevation level contributes one structural course: a terminal
 * drop uses the authored lower flow row, while stacked upper levels use the
 * authored upper row. */
export function raisedTerrainWaterfallFrameIndex(
  terrain: TerrainArray,
  entry: Pick<RaisedTerrainDepthEntry, 'tileX' | 'tileY' | 'contourLevel' | 'plan'>,
  stratum: RaisedTerrainDepthStratum,
): number | null {
  const tileSet = raisedCliffTileSetFor(terrain, entry.tileX, entry.tileY);
  if (tileSet.waterfallAssetId === undefined
    || terrainBiomeAt(terrain, entry.tileX, entry.tileY) !== 'waterfall') return null;
  const column = raisedWaterfallColumnAt(terrain, entry.tileX, entry.tileY);
  if (stratum === 'cap') {
    const southFace = plateauLayerPlansAt(terrain, entry.tileX, entry.tileY + 1)
      .find(({ contourLevel }) => contourLevel === entry.contourLevel)?.plan.faceLayers
      .some((face) => face.direct && face.rowId !== 'foot');
    return southFace ? column : null;
  }
  const direct = entry.plan.faceLayers.find((face) => face.direct);
  const structuralContours = plateauLayerPlansAt(terrain, entry.tileX, entry.tileY)
    .filter(({ plan }) => plan.faceLayers.some(
      (face) => face.direct && face.rowId !== 'foot',
    ));
  const highestStructuralContour = structuralContours.at(-1)?.contourLevel;
  const row = direct?.rowId === 'wall'
    ? entry.contourLevel === highestStructuralContour ? 1 : 2
    : direct?.rowId === 'lower_wall'
      ? structuralContours.length <= 1 ? 1 : 3
      : direct?.rowId === 'foot'
        ? 4
        : null;
  return row === null ? null : row * 3 + column;
}

function rampTransitionAtEntry(
  terrain: TerrainArray,
  entry: Pick<RaisedTerrainDepthEntry, 'tileX' | 'tileY' | 'contourLevel'>,
): ReturnType<typeof terrainTransitionLaneAt> & { readonly continued: boolean } | null {
  const lane = terrainTransitionLaneAt(
    terrain.terrainTransitions ?? [], entry.contourLevel, entry.tileX, entry.tileY,
  );
  if (lane === null) return null;
  const { transition, endpoint } = lane;
  const continued = (terrain.terrainTransitions ?? []).some((candidate) => (
    candidate.kind === transition.kind && candidate.direction === transition.direction
    && (endpoint === 'upper'
      ? candidate.contourLevel === entry.contourLevel + 1
        && candidate.lowerTileX === entry.tileX && candidate.lowerTileY === entry.tileY
      : candidate.contourLevel === entry.contourLevel - 1
        && candidate.upperTileX === entry.tileX && candidate.upperTileY === entry.tileY)
  ));
  return { ...lane, continued };
}

export function raisedTerrainCrossingSuppressesCliffStrata(
  terrain: TerrainArray,
  entry: Pick<RaisedTerrainDepthEntry, 'tileX' | 'tileY' | 'contourLevel'>,
): boolean {
  return rampTransitionAtEntry(terrain, entry) !== null;
}

function frameForRampCourse(
  course: RaisedTerrainRampBankCourse,
  laneIndex: number,
  width: number,
): number {
  if (laneIndex === 0) return course.left;
  if (laneIndex === width - 1) return course.right;
  return course.middle[(laneIndex - 1) % course.middle.length] ?? course.left;
}

/** Selects top/repeatable-middle/bottom stair art for a compiled chain. A
 * shared intermediate tile is drawn once by the lower contour's upper
 * endpoint; the next contour's lower endpoint deliberately returns null. */
export function raisedTerrainStairFrameIndex(
  terrain: TerrainArray,
  entry: Pick<RaisedTerrainDepthEntry, 'tileX' | 'tileY' | 'contourLevel' | 'plan'>,
): number | null {
  const tileSet = raisedCliffTileSetFor(terrain, entry.tileX, entry.tileY);
  const bank = tileSet.rampBank;
  if (bank === null) return null;
  const crossing = rampTransitionAtEntry(terrain, entry);
  if (crossing === null || entry.plan.rampRole === null) return null;
  if (crossing.endpoint === 'lower' && crossing.continued) return null;
  const course = crossing.endpoint === 'lower'
    ? bank.base
    : crossing.continued
      ? bank.treads[Math.abs(entry.contourLevel) % Math.max(1, bank.treads.length)] ?? bank.crest
      : bank.crest;
  return frameForRampCourse(course, crossing.laneIndex, crossing.width);
}

/** One screen row of a stair flight: `screenTileY` is the tile row the frame is
 * painted on after height projection (map row minus the projected rows). */
export interface RaisedTerrainStairColumnCourse {
  readonly screenTileY: number;
  readonly frame: number;
  readonly course: 'crest' | 'tread' | 'base';
}

/** Full-height stair flight (owner rule, 2026-09-24): the top step of a flight
 * draws the whole flight, so it climbs the visible cliff from the ground to the
 * top. The crest sits on the rim row; treads (alternating courses) cover every
 * row down to the foot row of the cliff wall beside the stair; the base course
 * (the bank's contact shadow) lies on the ground row below. Only the top upper
 * endpoint returns a column; every other stair entry draws nothing. */
export function raisedTerrainStairColumn(
  terrain: TerrainArray,
  entry: Pick<RaisedTerrainDepthEntry, 'tileX' | 'tileY' | 'contourLevel' | 'plan' | 'visualProjectionRows' | 'baseDatum'>,
): readonly RaisedTerrainStairColumnCourse[] | null {
  const bank = raisedCliffTileSetFor(terrain, entry.tileX, entry.tileY).rampBank;
  if (bank === null || entry.plan.rampRole === null) return null;
  const crossing = rampTransitionAtEntry(terrain, entry);
  if (crossing === null || crossing.endpoint !== 'upper' || crossing.continued) return null;
  const transitions = terrain.terrainTransitions ?? [];
  const projected = (contourLevel: number) => raisedTerrainVisualOffset({
    contourLevel, visualProjectionRows: entry.visualProjectionRows, baseDatum: entry.baseDatum,
  }) / TILE_SIZE_PIXELS;
  // Walk down the flight to its bottom crossing.
  let contour = entry.contourLevel;
  let lowerX = crossing.transition.lowerTileX;
  let lowerY = crossing.transition.lowerTileY;
  for (;;) {
    const below = transitions.find((t) => t.contourLevel === contour - 1
      && t.kind === crossing.transition.kind && t.direction === crossing.transition.direction
      && t.upperTileX === lowerX && t.upperTileY === lowerY);
    if (below === undefined) break;
    contour -= 1;
    lowerX = below.lowerTileX;
    lowerY = below.lowerTileY;
  }
  const topRow = entry.tileY - projected(entry.contourLevel);
  // The foot row is where the cliff wall beside the stair ends (either flank).
  // Without wall rows (a flat rim such as basic) the flight covers its own map
  // rows, and the base course lands on the bottom lower endpoint.
  const firstLaneX = entry.tileX - crossing.laneIndex;
  let footRow = Math.max(topRow, lowerY - projected(contour) - 1);
  for (const flankX of [firstLaneX - 1, firstLaneX + crossing.width]) {
    for (let k = 0; k < 8; k += 1) {
      const plan = plateauLayerPlansAt(terrain, flankX, lowerY + k).find((layer) => layer.contourLevel === contour)?.plan;
      if (!plan?.faceLayers.some((face) => face.direct)) break;
      footRow = Math.max(footRow, lowerY + k - projected(contour));
    }
  }
  const frame = (course: RaisedTerrainRampBankCourse) => frameForRampCourse(course, crossing.laneIndex, crossing.width);
  const column: RaisedTerrainStairColumnCourse[] = [{ screenTileY: topRow, frame: frame(bank.crest), course: 'crest' }];
  for (let row = topRow + 1, i = 0; row <= footRow; row += 1, i += 1) {
    // Banks without tread art (basic's stair block) repeat the crest course.
    const tread = bank.treads.length > 0 ? bank.treads[i % bank.treads.length]! : bank.crest;
    column.push({ screenTileY: row, frame: frame(tread), course: 'tread' });
  }
  column.push({ screenTileY: footRow + 1, frame: frame(bank.base), course: 'base' });
  return column;
}

export function raisedTerrainLadderFrameIndex(
  terrain: TerrainArray,
  transition: TerrainTransition,
): number | null {
  if (transition.kind !== 'ladder') return null;
  const tileSet = raisedCliffTileSetFor(
    terrain,
    transition.lowerTileX,
    transition.lowerTileY,
  );
  return tileSet.ladderFrames?.[0] ?? null;
}

/** A cliff tile contains two different painter-depth owners. Its projected
 * vertical face belongs to the lower plane, so a lower actor can sort behind
 * or in front of it by foot Y. The rim/cap belongs to the raised plane and
 * must cover every lower-plane drawable in its projected walk-behind band. */
export function raisedTerrainDepthLayers(
  entry: Pick<RaisedTerrainDepthEntry, 'contourLevel' | 'plan'>,
): readonly RaisedTerrainDepthLayer[] {
  const layers: RaisedTerrainDepthLayer[] = [];
  const hasDirectWall = entry.plan.faceLayers.some((face) => face.direct && face.rowId !== 'foot');
  const hasDirectFoot = entry.plan.faceLayers.some((face) => face.direct && face.rowId === 'foot');
  // A projected destination can contain an authored rear row followed by a
  // direct row. Keep that stack in one painter item: the rear frame fills the
  // translucent side gutter of the direct frame, while the direct frame keeps
  // the correct exposed silhouette. Indirect-only destinations remain absent
  // so they cannot recreate the solid stone columns at stepped corners.
  if (hasDirectWall) {
    layers.push({
      stratum: 'face',
      elevationLayer: entry.contourLevel - 1,
      depthPhase: 'boundary',
    });
  } else if (hasDirectFoot) {
    layers.push({
      stratum: 'face_foot',
      elevationLayer: entry.contourLevel - 1,
      depthPhase: 'surface',
    });
  }
  // Indirect coverage is topology support for resolving corners, not another
  // visible wall. Drawing it exposes the stone column underneath the thin
  // left/right cap edge at stepped corners.
  if (entry.plan.edgeFrame !== null
    || entry.plan.insetFrames.length > 0
    || entry.plan.rampRole !== null) {
    layers.push({
      stratum: 'cap',
      elevationLayer: entry.contourLevel,
      depthPhase: 'surface',
    });
  }
  return layers;
}

function drawEntryStratum(
  context: CanvasRenderingContext2D,
  art: OverworldArt,
  terrain: TerrainArray,
  entry: RaisedTerrainDepthEntry,
  stratum: RaisedTerrainDepthStratum,
  cameraX: number,
  cameraY: number,
  scale: number,
): void {
  const tileSet = raisedCliffTileSetFor(terrain, entry.tileX, entry.tileY);
  const cliffAsset = art.terrainAssets[tileSet.assetId] ?? art.cliff;
  const waterfallFrame = raisedTerrainWaterfallFrameIndex(terrain, entry, stratum);
  const stairCrossing = tileSet.rampBank === null ? null : rampTransitionAtEntry(terrain, entry);
  const stairColumn = stratum === 'cap' && stairCrossing !== null ? raisedTerrainStairColumn(terrain, entry) : null;
  context.save();
  context.translate(0, -raisedTerrainVisualOffset(entry) * scale);
  if (waterfallFrame !== null) {
    drawTerrainAsset(
      context,
      art.terrainAssets[tileSet.waterfallAssetId ?? ''] ?? art.waterfall,
      waterfallFrame,
      entry.tileX,
      entry.tileY,
      cameraX,
      cameraY,
      scale,
    );
    context.restore();
    return;
  }
  if (stairCrossing !== null) {
    // The flight's top step paints the whole full-height column; the context
    // is translated by this entry's projection, so add it back per row.
    const projectedRows = raisedTerrainVisualOffset(entry) / TILE_SIZE_PIXELS;
    const stairAsset = art.terrainAssets[tileSet.rampBank?.assetId ?? tileSet.assetId] ?? cliffAsset;
    for (const course of stairColumn ?? []) {
      drawTerrainAsset(context, stairAsset, course.frame, entry.tileX, course.screenTileY + projectedRows, cameraX, cameraY, scale);
    }
    context.restore();
    return;
  }
  if (stratum === 'face' || stratum === 'face_foot') {
    // The resolver returns these deepest-to-nearest. Drawing the complete
    // mixed stack restores the source tileset's intended edge compositing;
    // raisedTerrainDepthLayers has already rejected indirect-only stacks.
    for (const face of entry.plan.faceLayers) {
      if (face.seamUnderlayFrame !== undefined) {
        drawTerrainAsset(
          context,
          cliffAsset,
          face.seamUnderlayFrame,
          entry.tileX,
          entry.tileY,
          cameraX,
          cameraY,
          scale,
        );
      }
      drawTerrainAsset(context, cliffAsset, face.frame, entry.tileX, entry.tileY, cameraX, cameraY, scale);
    }
    // The support hangs from the lower course so its posts stand on the
    // floor; drawing it with that course also keeps the course from painting
    // over the posts.
    const directLowerWall = entry.plan.faceLayers.find((face) => face.direct && face.rowId === 'lower_wall');
    if (tileSet.assetId === 'tile_cf_cave_wall'
      && stratum === 'face'
      && directLowerWall !== undefined
      && caveWallSupportAnchorAt(
        (tileX, tileY) => tileX >= 0 && tileY >= 0
          && tileX < terrain.width && tileY < terrain.height
          && plateauLayerPlansAt(terrain, tileX, tileY).some(({ contourLevel, plan }) => (
            contourLevel === entry.contourLevel
              && plan.faceLayers.some((face) => face.direct && face.rowId === 'lower_wall')
          )),
        entry.tileX,
        entry.tileY,
      )) {
      drawTerrainAsset(context, art.caveSupport, 0, entry.tileX, entry.tileY, cameraX, cameraY, scale);
    }
  }
  if (stratum === 'cap'
    && entry.plan.edgeSeamUnderlayFrame !== undefined
    && entry.plan.insetFrames.length === 0) {
    drawTerrainAsset(
      context,
      cliffAsset,
      entry.plan.edgeSeamUnderlayFrame,
      entry.tileX,
      entry.tileY,
      cameraX,
      cameraY,
      scale,
    );
  }
  if (stratum === 'cap' && entry.plan.edgeFrame !== null) {
    drawTerrainAsset(context, cliffAsset, entry.plan.edgeFrame, entry.tileX, entry.tileY, cameraX, cameraY, scale);
  }
  for (const insetFrame of stratum === 'cap' ? entry.plan.insetFrames : []) {
    drawTerrainAsset(
      context,
      art.terrainAssets[tileSet.insetAssetId ?? tileSet.assetId] ?? cliffAsset,
      insetFrame,
      entry.tileX,
      entry.tileY,
      cameraX,
      cameraY,
      scale,
    );
  }
  if (stratum === 'cap' && entry.plan.rampFrame !== null) {
    drawTerrainAsset(
      context,
      art.terrainAssets[tileSet.rampAssetId ?? tileSet.assetId] ?? cliffAsset,
      entry.plan.rampFrame,
      entry.tileX,
      entry.tileY,
      cameraX,
      cameraY,
      scale,
    );
  }
  context.restore();
}

export function enqueueRaisedTerrainDepth(
  target: WorldDepthItem[],
  context: CanvasRenderingContext2D,
  art: OverworldArt,
  terrain: TerrainArray,
  groundCache: GroundChunkCache,
  cameraX: number,
  cameraY: number,
  scale: number,
  viewportWidth: number,
  viewportHeight: number,
  cutawayFocus?: TerrainCutawayFocus,
  lightReceiver: (x: number, y: number, level: number, face: 'flat' | 'south', draw: () => void) => void = (_x, _y, _level, _face, draw) => draw(),
): number {
  const marginTiles = Math.max(
    4,
    Math.max(Math.abs(terrainMaximumElevation(terrain)), Math.abs(terrainMinimumElevation(terrain)))
      * terrainProjectedRowsPerLevel(terrain) + 1,
  );
  const minimumTileX = Math.floor(cameraX / TILE_SIZE_PIXELS) - marginTiles;
  const minimumTileY = Math.floor(cameraY / TILE_SIZE_PIXELS) - marginTiles;
  const maximumTileX = Math.ceil((cameraX + viewportWidth) / TILE_SIZE_PIXELS) + marginTiles;
  const maximumTileY = Math.ceil((cameraY + viewportHeight) / TILE_SIZE_PIXELS) + marginTiles;
  const entries = raisedTerrainDepthEntries(
    terrain,
    minimumTileX, minimumTileY, maximumTileX, maximumTileY,
  );
  const surfaceRuns = raisedTerrainSurfaceRuns(
    terrain,
    minimumTileX, minimumTileY, maximumTileX, maximumTileY,
  );
  let cutawayMask: TerrainCutawayMask | null = null;
  const drawTerrainReceiver = (
    receiver: Pick<
      WorldDepthItem,
      'footY' | 'tie' | 'depthOffset' | 'elevationLayer' | 'depthPhase'
    >,
    overlapsCutaway: boolean,
    draw: () => void,
  ): void => {
    if (cutawayFocus === undefined || !overlapsCutaway
      || !terrainCutawayReceiverOccludes(receiver, cutawayFocus)) {
      draw();
      return;
    }
    cutawayMask ??= createTerrainCutawayMask(
      context,
      cutawayFocus,
      cameraX,
      cameraY,
      scale,
    );
    drawWithTerrainCutaway(context, cutawayMask, draw);
  };
  for (const run of surfaceRuns) {
    const receiver = {
      footY: run.footY,
      elevationLayer: run.elevation,
      depthPhase: 'surface' as const,
      tie: `0-surface:${run.elevation}:${run.tileY}:${run.firstTileX}`,
    };
    target.push({
      ...receiver,
      draw: () => drawTerrainReceiver(
        receiver,
        cutawayFocus !== undefined && terrainCutawayOverlapsRect(cutawayFocus, {
          left: run.firstTileX * TILE_SIZE_PIXELS,
          top: run.tileY * TILE_SIZE_PIXELS - run.visualOffset,
          right: (run.lastTileX + 1) * TILE_SIZE_PIXELS,
          bottom: (run.tileY + 1) * TILE_SIZE_PIXELS - run.visualOffset,
        }),
        () => groundCache.drawProjectedRun(
          context,
          art,
          terrain,
          run.firstTileX,
          run.lastTileX,
          run.tileY,
          run.visualOffset,
          cameraX,
          cameraY,
          scale,
        ),
      ),
    });
  }
  let ledgeCount = 0;
  for (let tileY = Math.max(0, minimumTileY); tileY <= Math.min(terrain.height - 1, maximumTileY); tileY += 1) {
    for (let tileX = Math.max(0, minimumTileX); tileX <= Math.min(terrain.width - 1, maximumTileX); tileX += 1) {
      const plan = terrainLedgePlanAt(terrain, tileX, tileY);
      if (plan === null || (plan.edgeFrame === null && plan.insetFrames.length === 0)) continue;
      const elevation = terrainElevationAt(terrain, tileX, tileY);
      const visualOffset = terrainProjectedDepthOffset(
        elevation,
        terrainVisualProjectionRowsPerLevel(terrain),
        TILE_SIZE_PIXELS,
        terrainBaseDatum(terrain),
      );
      const receiver = {
        footY: (tileY + 1) * TILE_SIZE_PIXELS - visualOffset,
        depthOffset: terrainProjectedSortOffset(elevation),
        elevationLayer: elevation,
        depthPhase: 'boundary' as const,
        tie: `0-ledge:${elevation}:${tileY}:${tileX}`,
      };
      target.push({
        ...receiver,
        draw: () => drawTerrainReceiver(
          receiver,
          cutawayFocus !== undefined && terrainCutawayOverlapsTile(
            cutawayFocus, tileX, tileY, visualOffset,
          ),
          () => lightReceiver(tileX * 16 + 8, tileY * 16 + 8, elevation, 'flat', () => {
            const asset = art.terrainAssets[plan.assetId] ?? art.grass;
            context.save();
            context.translate(0, -visualOffset * scale);
            if (plan.edgeFrame !== null) drawTerrainAsset(
              context, asset, plan.edgeFrame, tileX, tileY, cameraX, cameraY, scale,
            );
            for (const frame of plan.insetFrames) drawTerrainAsset(
              context, asset, frame, tileX, tileY, cameraX, cameraY, scale,
            );
            context.restore();
          }),
        ),
      });
      ledgeCount += 1;
    }
  }
  for (const entry of entries) {
    for (const layer of raisedTerrainDepthLayers(entry)) {
      const receiver = {
        footY: entry.footY,
        depthOffset: entry.depthOffset,
        elevationLayer: layer.elevationLayer,
        depthPhase: layer.depthPhase,
        tie: `0-terrain:${entry.contourLevel}:${layer.stratum}:${entry.tileY}:${entry.tileX}`,
      };
      target.push({
        ...receiver,
        draw: () => drawTerrainReceiver(
          receiver,
          cutawayFocus !== undefined && terrainCutawayOverlapsTile(
            cutawayFocus,
            entry.tileX,
            entry.tileY,
            raisedTerrainVisualOffset(entry),
          ),
          () => lightReceiver(entry.tileX * 16 + 8, entry.tileY * 16 + 8, layer.elevationLayer,
            layer.stratum === 'cap' ? 'flat' : 'south', () => drawEntryStratum(
            context,
            art,
            terrain,
            entry,
            layer.stratum,
            cameraX,
            cameraY,
            scale,
          )),
        ),
      });
    }
  }
  let ladderCount = 0;
  for (const transition of terrain.terrainTransitions ?? []) {
    const ladderFrame = raisedTerrainLadderFrameIndex(terrain, transition);
    if (ladderFrame === null) continue;
    const tileSet = raisedCliffTileSetFor(
      terrain,
      transition.lowerTileX,
      transition.lowerTileY,
    );
    const projectionRows = terrainVisualProjectionRowsPerLevel(terrain);
    const elevation = transition.contourLevel - 1;
    const visualOffset = terrainProjectedDepthOffset(
      elevation,
      projectionRows,
      TILE_SIZE_PIXELS,
      terrainBaseDatum(terrain),
    );
    target.push({
      footY: (transition.lowerTileY + 1) * TILE_SIZE_PIXELS - visualOffset,
      depthOffset: terrainProjectedSortOffset(elevation),
      elevationLayer: elevation,
      depthPhase: 'surface',
      tie: `0-ladder:${elevation}:${transition.lowerTileY}:${transition.lowerTileX}`,
      draw: () => lightReceiver(transition.lowerTileX * 16 + 8, transition.lowerTileY * 16 + 8, elevation, 'south', () => {
        context.save();
        context.translate(0, -visualOffset * scale);
        drawTerrainAsset(
          context,
          art.terrainAssets[tileSet.ladderAssetId ?? '']
            ?? art.terrainAssets[tileSet.assetId]
            ?? art.cliff,
          ladderFrame,
          transition.lowerTileX,
          transition.lowerTileY,
          cameraX,
          cameraY,
          scale,
        );
        context.restore();
      }),
    });
    ladderCount += 1;
  }
  return entries.reduce(
    (count, entry) => count + raisedTerrainDepthLayers(entry).length,
    surfaceRuns.length + ladderCount + ledgeCount,
  );
}
