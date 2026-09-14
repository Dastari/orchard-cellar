import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  TERRAIN_CLIFF_FAMILIES,
  TERRAIN_SURFACE_FAMILIES,
  compileMapDocument,
  createTerrainLabDocumentsByFamily,
  maximumTerrainElevation,
  minimumTerrainElevation,
  resolveRaisedTerrainContoursAt,
  raisedTerrainEdgeRoleAt,
  raisedTerrainInsetRolesAt,
  raisedTerrainProjectionRowsPerLevel,
  surfaceFamilyAtIndex,
  terrainTransitionLaneAt,
  type CliffFamilyId,
  type RaisedTerrainRampRole,
  type RaisedTerrainRampBankCourse,
  type RaisedTerrainTileSet,
  type TerrainTransition,
} from '@orchard/sim';
import { loadAssets, loadPalette, workspaceRoot } from './assets/load.js';
import { blendPixel, encodePng, hexToRgba, setPixel } from './assets/png.js';
import type { AssetSource, PaletteSource, PixelGrid } from './assets/types.js';

const TILE = 16;
const SCALE = 3;
const PATTERN_TILES = 8;
const PATTERN_COLUMNS = 4;
const PATTERN_ROWS = 3;
const MARGIN_TILES = 2;
const TRANSITION_PANEL_ROWS = 6;

function transitionRampRoleAt(
  transitions: readonly TerrainTransition[],
  contourLevel: number,
  tileX: number,
  tileY: number,
): RaisedTerrainRampRole | null {
  const lane = terrainTransitionLaneAt(transitions, contourLevel, tileX, tileY);
  return lane === null ? null
    : `ramp_${lane.endpoint === 'upper' ? 'top' : 'bottom'}_${lane.position}`;
}

function rampBankCourseFrame(
  course: RaisedTerrainRampBankCourse,
  laneIndex: number,
  width: number,
): number {
  if (laneIndex === 0) return course.left;
  if (laneIndex === width - 1) return course.right;
  return course.middle[(laneIndex - 1) % course.middle.length] ?? course.left;
}

function rampBankFrameAt(
  transitions: readonly TerrainTransition[],
  tileSet: RaisedTerrainTileSet,
  contourLevel: number,
  tileX: number,
  tileY: number,
  rampRole: RaisedTerrainRampRole | null,
): number | null | undefined {
  const lane = terrainTransitionLaneAt(transitions, contourLevel, tileX, tileY);
  if (lane === null) return undefined;
  if (tileSet.rampBank === null || rampRole === null) return null;
  const { transition } = lane;
  const upper = lane.endpoint === 'upper';
  const continued = transitions.some((candidate) => (
    candidate.kind === 'stairs' && candidate.direction === transition.direction
    && (upper
      ? candidate.contourLevel === contourLevel + 1
        && candidate.lowerTileX === tileX && candidate.lowerTileY === tileY
      : candidate.contourLevel === contourLevel - 1
        && candidate.upperTileX === tileX && candidate.upperTileY === tileY)
  ));
  if (!upper && continued) return null;
  const course = !upper ? tileSet.rampBank.base
    : continued
      ? tileSet.rampBank.treads[Math.abs(contourLevel) % tileSet.rampBank.treads.length]
        ?? tileSet.rampBank.treads[0]!
      : tileSet.rampBank.crest;
  return rampBankCourseFrame(course, lane.laneIndex, lane.width);
}

function resolveHex(character: string, asset: AssetSource, palette: PaletteSource): string | null {
  if (character === '.') return null;
  return asset.sourcePalette?.[character]
    ?? palette.colors[asset.markers?.[character] ?? palette.markerDefaults[character] ?? character]
    ?? null;
}

function drawFrame(
  rgba: Uint8Array,
  width: number,
  asset: AssetSource,
  palette: PaletteSource,
  frameIndex: number,
  tileX: number,
  tileY: number,
): void {
  const grid: PixelGrid | undefined = asset.frames['base']?.[frameIndex];
  if (grid === undefined) return;
  for (let y = 0; y < TILE; y += 1) for (let x = 0; x < TILE; x += 1) {
    const hex = resolveHex(grid[y]?.[x] ?? '.', asset, palette);
    if (hex === null) continue;
    const color = hexToRgba(hex);
    for (let sy = 0; sy < SCALE; sy += 1) for (let sx = 0; sx < SCALE; sx += 1) {
      blendPixel(
        rgba,
        width,
        (tileX * TILE + x) * SCALE + sx,
        (tileY * TILE + y) * SCALE + sy,
        color,
      );
    }
  }
}

function patternElevation(pattern: number, x: number, y: number): number {
  const center = 3;
  if (pattern === 0) return x === center && y === center ? 1 : 0;
  if (pattern === 1) return y === center && x >= 1 && x <= 6 ? 1 : 0;
  if (pattern === 2) return x === center && y >= 1 && y <= 6 ? 1 : 0;
  if (pattern === 3) return x >= 2 && x <= 5 && y >= 2 && y <= 5 && !(x >= 4 && y >= 4) ? 1 : 0;
  if (pattern === 4) return x >= 1 && x <= 6 && y >= 1 && y <= 6 && !(x === 3 && y === 1) ? 1 : 0;
  if (pattern === 5) return (y === 2 && x >= 1 && x <= 6) || (x >= 3 && x <= 4 && y >= 2 && y <= 6) ? 1 : 0;
  if (pattern === 6) return x >= 1 && x <= 6 && y >= 1 && y <= 6 && !(x >= 3 && x <= 4 && y >= 3 && y <= 4) ? 1 : 0;
  if (pattern === 7) return x >= 2 && x <= 5 && y >= 1 && y <= 6 && !(y === 6 && (x === 2 || x === 5)) ? 1 : 0;
  if (pattern === 8) {
    if (x >= 1 && x <= 6 && y >= 1 && y <= 6) return x >= 3 && x <= 4 && y >= 3 && y <= 4 ? 2 : 1;
    return 0;
  }
  if (pattern === 9) return x >= 1 && x <= 6 && y >= 1 && y <= 6 && x >= 3 && x <= 4 && y >= 3 && y <= 4 ? -2 : 0;
  if (pattern === 10) return x >= 2 && x <= 5 && y >= 2 && y <= 5 ? 5 : 0;
  return x >= 1 && x <= 6 && y >= 1 && y <= 6 ? 1 : 0;
}

export async function renderCliffFamilyReview(familyId: CliffFamilyId): Promise<string> {
  const family = TERRAIN_CLIFF_FAMILIES[familyId];
  if (!family.available) throw new Error(`${familyId} is unavailable: ${family.reason}`);
  const tileSet = family.tileSet;
  const [assets, palette] = await Promise.all([loadAssets(), loadPalette()]);
  const byName = new Map(assets.map((asset) => [asset.name, asset]));
  const assetFor = (assetId: string): AssetSource => {
    const asset = byName.get(assetId);
    if (asset === undefined) throw new Error(`Missing terrain review asset ${assetId}`);
    return asset;
  };
  const widthTiles = PATTERN_COLUMNS * PATTERN_TILES + MARGIN_TILES * 2;
  const heightTiles = PATTERN_ROWS * PATTERN_TILES + MARGIN_TILES * 2
    + TRANSITION_PANEL_ROWS;
  const width = widthTiles * TILE * SCALE;
  const height = heightTiles * TILE * SCALE;
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const checker = (Math.floor(x / (TILE * SCALE)) + Math.floor(y / (TILE * SCALE))) % 2;
    setPixel(rgba, width, x, y, checker ? [45, 48, 55, 255] : [57, 61, 69, 255]);
  }

  const rows = raisedTerrainProjectionRowsPerLevel(tileSet);
  const visualRows = tileSet.projectionStyle === 'raised' ? rows : 0;
  for (let pattern = 0; pattern < PATTERN_COLUMNS * PATTERN_ROWS; pattern += 1) {
    const patternX = MARGIN_TILES + (pattern % PATTERN_COLUMNS) * PATTERN_TILES;
    const patternY = MARGIN_TILES + Math.floor(pattern / PATTERN_COLUMNS) * PATTERN_TILES;
    const elevationAt = (x: number, y: number): number => (
      x < 0 || y < 0 || x >= PATTERN_TILES || y >= PATTERN_TILES
        // Interior families describe a dug opening in continuous material.
        // A lower/open apron makes every edge legible instead of projecting a
        // solid datum through the entire review canvas.
        ? tileSet.projectionStyle === 'interior'
          ? (tileSet.baseDatum ?? 1) - 1
          : (tileSet.baseDatum ?? 0)
        : patternElevation(pattern, x, y)
    );
    let minimum = tileSet.baseDatum ?? 0;
    let maximum = minimum;
    for (let y = 0; y < PATTERN_TILES; y += 1) for (let x = 0; x < PATTERN_TILES; x += 1) {
      minimum = Math.min(minimum, elevationAt(x, y));
      maximum = Math.max(maximum, elevationAt(x, y));
    }
    for (let y = 0; y < PATTERN_TILES; y += 1) for (let x = 0; x < PATTERN_TILES; x += 1) {
      const plans = resolveRaisedTerrainContoursAt(
        elevationAt,
        maximum,
        tileSet,
        'tall',
        x,
        y,
        undefined,
        minimum + 1,
      );
      for (const { contourLevel, plan } of plans) {
        const drawX = patternX + x;
        const drawY = patternY + y - (contourLevel - (tileSet.baseDatum ?? 0)) * visualRows;
        const primary = assetFor(tileSet.assetId);
        for (const face of plan.faceLayers) drawFrame(rgba, width, primary, palette, face.frame, drawX, drawY);
        if (plan.edgeSeamUnderlayFrame !== undefined && plan.insetFrames.length === 0) {
          drawFrame(rgba, width, primary, palette, plan.edgeSeamUnderlayFrame, drawX, drawY);
        }
        if (plan.edgeFrame !== null) drawFrame(rgba, width, primary, palette, plan.edgeFrame, drawX, drawY);
        const inset = assetFor(tileSet.insetAssetId ?? tileSet.assetId);
        for (const frame of plan.insetFrames) drawFrame(rgba, width, inset, palette, frame, drawX, drawY);
        if (plan.rampFrame !== null) drawFrame(
          rgba,
          width,
          assetFor(tileSet.rampAssetId ?? tileSet.assetId),
          palette,
          plan.rampFrame,
          drawX,
          drawY,
        );
      }
    }
  }

  // Transition/contact-sheet panel. These roles used to be absent from the
  // review, allowing ground-fill frames to masquerade as ramps and stairs.
  const panelY = MARGIN_TILES + PATTERN_ROWS * PATTERN_TILES + 1;
  if (tileSet.rampBank !== null) {
    const bank = assetFor(tileSet.rampBank.assetId);
    const drawCourse = (course: RaisedTerrainRampBankCourse, firstX: number, y: number, lanes: number): void => {
      for (let lane = 0; lane < lanes; lane += 1) drawFrame(
        rgba, width, bank, palette, rampBankCourseFrame(course, lane, lanes),
        MARGIN_TILES + firstX + lane, panelY + y,
      );
    };
    // Acceptance matrix: 2 lanes x 1 level; 2 lanes x 3 levels; 4 lanes.
    drawCourse(tileSet.rampBank.crest, 0, 0, 2);
    drawCourse(tileSet.rampBank.base, 0, 1, 2);
    drawCourse(tileSet.rampBank.crest, 3, 0, 2);
    drawCourse(tileSet.rampBank.treads[0]!, 3, 1, 2);
    drawCourse(tileSet.rampBank.treads[0]!, 3, 2, 2);
    drawCourse(tileSet.rampBank.base, 3, 3, 2);
    drawCourse(tileSet.rampBank.crest, 6, 0, 4);
    drawCourse(tileSet.rampBank.base, 6, 1, 4);
  }
  if (tileSet.ladderFrames !== null) {
    const ladder = assetFor(tileSet.ladderAssetId ?? tileSet.assetId);
    for (let index = 0; index < tileSet.ladderFrames.length; index += 1) {
      drawFrame(rgba, width, ladder, palette, tileSet.ladderFrames[index]!, MARGIN_TILES + 11 + index, panelY);
    }
  }
  if (tileSet.waterfallAssetId !== undefined) {
    const waterfall = assetFor(tileSet.waterfallAssetId);
    const waterfallFrames = waterfall.frames['base'] ?? [];
    for (let index = 0; index < Math.min(15, waterfallFrames.length); index += 1) {
      drawFrame(
        rgba, width, waterfall, palette, index,
        MARGIN_TILES + 14 + index % 3, panelY + Math.floor(index / 3),
      );
    }
  }

  const root = fileURLToPath(workspaceRoot);
  const outputRoot = resolve(root, 'build/review');
  const output = resolve(outputRoot, `cliff-family-${familyId}.png`);
  await mkdir(outputRoot, { recursive: true });
  await writeFile(output, encodePng(width, height, rgba));
  console.log(output);

  const labDocument = createTerrainLabDocumentsByFamily()[familyId];
  if (labDocument !== undefined) {
    const compiled = compileMapDocument(labDocument);
    const labScale = 2;
    const minimum = minimumTerrainElevation(compiled.elevations);
    const maximum = maximumTerrainElevation(compiled.elevations);
    const topApron = tileSet.projectionStyle === 'raised'
      ? Math.max(0, maximum - (tileSet.baseDatum ?? 0)) * rows
      : 0;
    const bottomApron = tileSet.projectionStyle === 'raised'
      ? Math.max(0, (tileSet.baseDatum ?? 0) - minimum) * rows
      : 0;
    const labWidthTiles = compiled.width + MARGIN_TILES * 2;
    const labHeightTiles = compiled.height + MARGIN_TILES * 2 + topApron + bottomApron;
    const labWidth = labWidthTiles * TILE * labScale;
    const labHeight = labHeightTiles * TILE * labScale;
    const labRgba = new Uint8Array(labWidth * labHeight * 4);
    for (let y = 0; y < labHeight; y += 1) for (let x = 0; x < labWidth; x += 1) {
      const checker = (Math.floor(x / (TILE * labScale)) + Math.floor(y / (TILE * labScale))) % 2;
      setPixel(labRgba, labWidth, x, y, checker ? [45, 48, 55, 255] : [57, 61, 69, 255]);
    }
    const labElevationAt = (x: number, y: number): number => {
      if (x < 0 || y < 0 || x >= compiled.width || y >= compiled.height) {
        return tileSet.projectionStyle === 'interior'
          ? (tileSet.baseDatum ?? 1) - 1
          : compiled.baseElevation;
      }
      return compiled.elevations[y * compiled.width + x] ?? compiled.baseElevation;
    };
    const drawLabFrame = (asset: AssetSource, frame: number, x: number, y: number): void => {
      const grid = asset.frames['base']?.[frame];
      if (grid === undefined) return;
      for (let py = 0; py < TILE; py += 1) for (let px = 0; px < TILE; px += 1) {
        const hex = resolveHex(grid[py]?.[px] ?? '.', asset, palette);
        if (hex === null) continue;
        const color = hexToRgba(hex);
        for (let sy = 0; sy < labScale; sy += 1) for (let sx = 0; sx < labScale; sx += 1) {
          blendPixel(labRgba, labWidth, (x * TILE + px) * labScale + sx,
            (y * TILE + py) * labScale + sy, color);
        }
      }
    };
    for (let y = 0; y < compiled.height; y += 1) for (let x = 0; x < compiled.width; x += 1) {
      const plans = resolveRaisedTerrainContoursAt(
        labElevationAt, maximum, tileSet, 'tall', x, y,
        (level, tileX, tileY) => transitionRampRoleAt(compiled.transitions, level, tileX, tileY),
        Math.min(minimum, tileSet.baseDatum ?? 0) + 1,
      );
      for (const { contourLevel, plan } of plans) {
        const drawX = MARGIN_TILES + x;
        const drawY = MARGIN_TILES + topApron + y
          - (contourLevel - (tileSet.baseDatum ?? 0)) * visualRows;
        const primary = assetFor(tileSet.assetId);
        const stairFrame = rampBankFrameAt(
          compiled.transitions,
          tileSet,
          contourLevel,
          x,
          y,
          plan.rampRole,
        );
        if (stairFrame !== undefined) {
          if (stairFrame !== null) drawLabFrame(
            assetFor(tileSet.rampBank?.assetId ?? tileSet.assetId), stairFrame, drawX, drawY,
          );
          continue;
        }
        for (const face of plan.faceLayers) drawLabFrame(primary, face.frame, drawX, drawY);
        if (plan.edgeFrame !== null) drawLabFrame(primary, plan.edgeFrame, drawX, drawY);
        const inset = assetFor(tileSet.insetAssetId ?? tileSet.assetId);
        for (const frame of plan.insetFrames) drawLabFrame(inset, frame, drawX, drawY);
        if (plan.rampFrame !== null) drawLabFrame(
          assetFor(tileSet.rampAssetId ?? tileSet.assetId), plan.rampFrame, drawX, drawY,
        );
      }
    }
    const ledgeAt = (x: number, y: number): boolean => x >= 0 && y >= 0
      && x < compiled.width && y < compiled.height
      && compiled.ledges[y * compiled.width + x] === 1;
    for (let y = 0; y < compiled.height; y += 1) for (let x = 0; x < compiled.width; x += 1) {
      if (!ledgeAt(x, y)) continue;
      const surfaceFamily = surfaceFamilyAtIndex(compiled.surfaceFamilies[y * compiled.width + x] ?? 0)
        ?? labDocument.defaultSurfaceFamily ?? 'grass_1';
      const bank = tileSet.ledgeBank ?? TERRAIN_SURFACE_FAMILIES[surfaceFamily].ledgeBank;
      const asset = assetFor(bank.assetId);
      const surface = assetFor(TERRAIN_SURFACE_FAMILIES[surfaceFamily].assetId);
      const grid = { raisedAt: ledgeAt };
      const role = raisedTerrainEdgeRoleAt(grid, x, y);
      const drawX = MARGIN_TILES + x;
      const drawY = MARGIN_TILES + topApron + y;
      // The runtime ground cache already owns this flat surface. Paint it in
      // the transparent review harness so the fixture reads as the author's
      // raised bed (flat fill + lip), not as a hollow checkerboard outline.
      drawLabFrame(surface, 0, drawX, drawY);
      if (role !== null) drawLabFrame(asset, bank.edgeFrames[role], drawX, drawY);
      for (const insetRole of raisedTerrainInsetRolesAt(grid, x, y)) {
        drawLabFrame(asset, bank.insetFrames[insetRole], drawX, drawY);
      }
    }
    const labOutput = resolve(outputRoot, `terrain-lab-${familyId}.png`);
    await writeFile(labOutput, encodePng(labWidth, labHeight, labRgba));
    console.log(labOutput);
  }
  return output;
}

const familyId = process.argv[2] as CliffFamilyId | undefined;
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (familyId === undefined || !(familyId in TERRAIN_CLIFF_FAMILIES)) {
    throw new Error(`Usage: npm run render:cliff-family -w @orchard/tools -- <${Object.keys(TERRAIN_CLIFF_FAMILIES).join('|')}>`);
  }
  await renderCliffFamilyReview(familyId);
}
