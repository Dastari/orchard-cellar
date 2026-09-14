import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  caveFloorDecorationFrameAt,
  caveWallSupportAnchorAt,
  generateRogueRoomExits,
  generateRogueRoomLayout,
  raisedTerrainProjectionRowsPerLevel,
  resolveRaisedTerrainContoursAt,
  terrainCliffTileSet,
  type RogueDirection,
  type RogueRoomKind,
  type RogueTheme,
} from '@orchard/sim';
import { loadAssets, loadPalette, workspaceRoot } from './assets/load.js';
import { blendPixel, encodePng, hexToRgba, setPixel, type DecodedPng } from './assets/png.js';
import type { AssetSource, PaletteSource, PixelGrid } from './assets/types.js';

const root = fileURLToPath(workspaceRoot);
const tileSize = 16;
const [assets, palette] = await Promise.all([loadAssets(), loadPalette()]);
const assetByName = new Map(assets.map((asset) => [asset.name, asset]));

function resolveHex(character: string, asset: AssetSource, fallback: PaletteSource): string | null {
  if (character === '.') return null;
  const sourceHex = asset.sourcePalette?.[character];
  if (sourceHex !== undefined) return sourceHex;
  const marker = asset.markers?.[character] ?? fallback.markerDefaults[character] ?? character;
  return fallback.colors[marker] ?? null;
}

function assetFrame(name: string, index = 0): DecodedPng {
  const asset = assetByName.get(name);
  if (asset === undefined) throw new Error(`Missing review asset ${name}`);
  const frames = asset.frames.base;
  const grid: PixelGrid | undefined = frames?.[index];
  if (grid === undefined) throw new Error(`Missing ${name} base frame ${index}`);
  const [width, height] = asset.size;
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const hex = resolveHex(grid[y]?.[x] ?? '.', asset, palette);
    if (hex !== null) setPixel(rgba, width, x, y, hexToRgba(hex));
  }
  return { width, height, rgba };
}

function renderRoom(
  theme: RogueTheme,
  roomNumber: number,
  seed: number,
  kind: RogueRoomKind,
): Uint8Array {
  const layout = generateRogueRoomLayout(seed, roomNumber, kind);
  const width = layout.width * tileSize;
  const height = layout.height * tileSize;
  const rgba = new Uint8Array(width * height * 4);
  const background = theme === 'volcanic' ? hexToRgba('#211519')
    : theme === 'dungeon' ? hexToRgba('#0e071b') : hexToRgba('#391f21');
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    setPixel(rgba, width, x, y, background);
  }

  const caveFloor = assetFrame('tile_cf_cave_floor_middle');
  const caveDecoration = [0, 1, 2].map((index) => assetFrame('tile_cf_cave_floor_decoration', index));
  const floor = theme === 'cave' ? [caveFloor] : Array.from(
    { length: 9 },
    (_, index) => assetFrame(
      theme === 'volcanic' ? 'tile_cf_rogue_volcanic_floor' : 'tile_cf_rogue_dungeon_floor',
      index,
    ),
  );
  const substrate = theme === 'cave' ? null : Array.from(
    { length: 9 },
    (_, index) => assetFrame(
      theme === 'volcanic' ? 'tile_cf_rogue_volcanic_wall' : 'tile_cf_rogue_dungeon_wall',
      index,
    ),
  );
  const lava = Array.from({ length: 4 }, (_, index) => assetFrame('tile_cf_rogue_volcanic_lava', index));
  const cliffFamily = theme === 'volcanic' ? 'volcanic_interior'
    : theme === 'dungeon' ? 'dungeon_1' : 'cave';
  const tileSet = terrainCliffTileSet(cliffFamily);
  if (tileSet === null) throw new Error(`Missing review terrain family ${cliffFamily}`);
  const wallAsset = assetByName.get(tileSet.assetId);
  if (wallAsset === undefined) throw new Error(`Missing review asset ${tileSet.assetId}`);
  const wallFrames = Array.from(
    { length: wallAsset.frames.base?.length ?? 0 },
    (_, index) => assetFrame(tileSet.assetId, index),
  );
  const support = assetFrame('prop_cf_cave_support');

  const blit = (source: DecodedPng, originX: number, originY: number): void => {
    for (let y = 0; y < source.height; y += 1) for (let x = 0; x < source.width; x += 1) {
      const sourceOffset = (y * source.width + x) * 4;
      blendPixel(rgba, width, originX + x, originY + y, [
        source.rgba[sourceOffset] ?? 0,
        source.rgba[sourceOffset + 1] ?? 0,
        source.rgba[sourceOffset + 2] ?? 0,
        source.rgba[sourceOffset + 3] ?? 0,
      ]);
    }
  };
  const blitTile = (source: DecodedPng, tileX: number, tileY: number): void => {
    blit(source, tileX * tileSize, tileY * tileSize);
  };

  const hazardIndices = new Set(layout.hazards.map(({ tileX, tileY }) => tileY * layout.width + tileX));
  for (let tileY = 0; tileY < layout.height; tileY += 1) for (let tileX = 0; tileX < layout.width; tileX += 1) {
    const index = tileY * layout.width + tileX;
    const fieldFrame = (tileY % 3) * 3 + tileX % 3;
    if (hazardIndices.has(index) && theme === 'volcanic') {
      blitTile(lava[(tileX * 3 + tileY + seed) % lava.length]!, tileX, tileY);
    }
    else if (layout.blocked[index]) {
      if (substrate !== null) blitTile(substrate[fieldFrame]!, tileX, tileY);
    } else {
      blitTile(floor[theme === 'cave' ? 0 : fieldFrame]!, tileX, tileY);
      if (theme === 'cave') {
        const decoration = caveFloorDecorationFrameAt(seed, roomNumber + 50_000, tileX, tileY);
        if (decoration !== null) blitTile(caveDecoration[decoration]!, tileX, tileY);
      }
    }
  }

  const elevationAt = (tileX: number, tileY: number): number => {
    if (tileX < 0 || tileY < 0 || tileX >= layout.width || tileY >= layout.height) return 1;
    const index = tileY * layout.width + tileX;
    return layout.elevations[index] ?? 0;
  };
  const planAt = (tileX: number, tileY: number) => resolveRaisedTerrainContoursAt(
    elevationAt, 1, tileSet, 'tall', tileX, tileY,
  )[0]?.plan;
  const projectionRows = raisedTerrainProjectionRowsPerLevel(tileSet);
  // Solid mass is raised terrain: its surface, rims and face courses are
  // displaced north by the wall height, as the client draws them.
  for (let tileY = 0; tileY < layout.height + projectionRows; tileY += 1) {
    for (let tileX = 0; tileX < layout.width; tileX += 1) {
      const index = tileY * layout.width + tileX;
      const projectedY = tileY - projectionRows;
      const plan = planAt(tileX, tileY);
      const raised = elevationAt(tileX, tileY) >= 1 && !hazardIndices.has(index);
      if (raised && (plan === undefined || plan.edgeFrame === null)) {
        if (substrate !== null && tileY < layout.height) {
          blitTile(substrate[(tileY % 3) * 3 + tileX % 3]!, tileX, projectedY);
        } else {
          for (let y = 0; y < tileSize; y += 1) for (let x = 0; x < tileSize; x += 1) {
            setPixel(rgba, width, tileX * tileSize + x, projectedY * tileSize + y, background);
          }
        }
      }
      if (plan === undefined) continue;
      for (const face of plan.faceLayers) blitTile(wallFrames[face.frame]!, tileX, projectedY);
      if (plan.edgeSeamUnderlayFrame !== undefined && plan.insetFrames.length === 0) {
        blitTile(wallFrames[plan.edgeSeamUnderlayFrame]!, tileX, projectedY);
      }
      if (plan.edgeFrame !== null) blitTile(wallFrames[plan.edgeFrame]!, tileX, projectedY);
      for (const frameIndex of plan.insetFrames) blitTile(wallFrames[frameIndex]!, tileX, projectedY);
      const directLowerWall = plan.faceLayers.find((face) => face.direct && face.rowId === 'lower_wall');
      if (theme === 'cave' && directLowerWall !== undefined
        && caveWallSupportAnchorAt((x, y) => (
          planAt(x, y)?.faceLayers.some((face) => face.direct && face.rowId === 'lower_wall') === true
        ), tileX, tileY)) {
        blit(support, tileX * tileSize - 32, projectedY * tileSize - 16);
      }
    }
  }

  const doorway = theme === 'dungeon'
    ? assetFrame('prop_cf_dungeon_doorway')
    : assetFrame('prop_cf_cave_doorway', 2);
  const blitDoor = (direction: RogueDirection, tileX: number, tileY: number): void => {
    const anchorX = 16;
    const anchorY = 31;
    const footX = tileX * tileSize + 8;
    const footY = (tileY + 1) * tileSize;
    for (let sourceY = 0; sourceY < doorway.height; sourceY += 1) {
      for (let sourceX = 0; sourceX < doorway.width; sourceX += 1) {
        const offset = (sourceY * doorway.width + sourceX) * 4;
        const localX = sourceX - anchorX;
        const localY = sourceY - anchorY;
        const [rotatedX, rotatedY] = direction === 'east' ? [-localY, localX]
          : direction === 'west' ? [localY, -localX]
            : direction === 'south' ? [-localX, -localY] : [localX, localY];
        blendPixel(rgba, width, footX + rotatedX, footY + rotatedY, [
          doorway.rgba[offset] ?? 0,
          doorway.rgba[offset + 1] ?? 0,
          doorway.rgba[offset + 2] ?? 0,
          doorway.rgba[offset + 3] ?? 0,
        ]);
      }
    }
  };
  for (const exit of generateRogueRoomExits(seed, roomNumber)) {
    blitDoor(exit.direction, exit.tileX, exit.tileY);
  }
  return rgba;
}

function seedForLayout(roomNumber: number, layoutIndex: number): number {
  for (let seed = 0; seed < 10_000; seed += 1) {
    if (generateRogueRoomLayout(seed, roomNumber, 'combat').id.endsWith(`_${layoutIndex}`)) return seed;
  }
  throw new Error(`No deterministic seed found for room ${roomNumber} layout ${layoutIndex}`);
}

function composeLayoutSheet(frames: readonly Uint8Array[]): Uint8Array {
  const roomPixels = 32 * tileSize;
  const sheetWidth = roomPixels * 2;
  const sheet = new Uint8Array(sheetWidth * sheetWidth * 4);
  frames.forEach((frame, index) => {
    const originX = index % 2 * roomPixels;
    const originY = Math.floor(index / 2) * roomPixels;
    for (let y = 0; y < roomPixels; y += 1) for (let x = 0; x < roomPixels; x += 1) {
      const sourceOffset = (y * roomPixels + x) * 4;
      const destinationOffset = ((originY + y) * sheetWidth + originX + x) * 4;
      sheet.set(frame.subarray(sourceOffset, sourceOffset + 4), destinationOffset);
    }
  });
  return sheet;
}

await mkdir(resolve(root, 'build/review'), { recursive: true });
for (const [theme, roomNumber] of [['cave', 0], ['volcanic', 4], ['dungeon', 8]] as const) {
  const variants = Array.from({ length: 4 }, (_, layoutIndex) => renderRoom(
    theme,
    roomNumber,
    seedForLayout(roomNumber, layoutIndex),
    'combat',
  ));
  const roomPixels = 32 * tileSize;
  const legacyOutput = resolve(root, `build/review/rogue-${theme}-room.png`);
  const layoutsOutput = resolve(root, `build/review/rogue-${theme}-layouts.png`);
  const bossOutput = resolve(root, `build/review/rogue-${theme}-boss.png`);
  await Promise.all([
    writeFile(legacyOutput, encodePng(roomPixels, roomPixels, variants[0]!)),
    writeFile(layoutsOutput, encodePng(roomPixels * 2, roomPixels * 2, composeLayoutSheet(variants))),
    writeFile(bossOutput, encodePng(
      roomPixels,
      roomPixels,
      renderRoom(theme, roomNumber + 3, 0, 'boss'),
    )),
  ]);
  console.log(layoutsOutput);
  console.log(bossOutput);
}
