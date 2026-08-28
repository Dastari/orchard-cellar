import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CAVE_RAISED_CLIFF_TILE_SET,
  caveFloorAutotilePlan,
  caveFloorDecorationFrameAt,
  caveFloorPatchVariantAt,
  generateStarterCellarExcavation,
  resolveRaisedTerrainContoursAt,
} from '@orchard/sim';
import { workspaceRoot } from './assets/load.js';
import { blendPixel, decodePng, encodePng, setPixel } from './assets/png.js';

const root = fileURLToPath(workspaceRoot);
const floorMiddle = decodePng(await readFile(resolve(root, 'references/Cute_Fantasy/Tiles/Cave/Cave_Floor_Middle.png')));
const floor1 = decodePng(await readFile(resolve(root, 'references/Cute_Fantasy/Tiles/Cave/Cave_Floor_1.png')));
const floor2 = decodePng(await readFile(resolve(root, 'references/Cute_Fantasy/Tiles/Cave/Cave_Floor_2.png')));
const floorDecoration = decodePng(await readFile(resolve(root, 'references/Cute_Fantasy/Tiles/Cave/Cave_Floor_Decoration.png')));
const walls = decodePng(await readFile(resolve(root, 'references/Cute_Fantasy/Tiles/Cave/Cave_Walls.png')));
const supports = decodePng(await readFile(resolve(root, 'references/Cute_Fantasy/Tiles/Cave/Cave_Wall_Support.png')));
const excavation = generateStarterCellarExcavation();
const tileSize = 16;
// The real field is 1024×1024 tiles. The authored starter excavation fits in
// this central window, keeping corners large enough for pixel-level review.
const previewTiles = 36;
const originX = Math.floor((excavation.width - previewTiles) / 2);
const originY = Math.floor((excavation.height - previewTiles) / 2);
const width = previewTiles * tileSize;
const height = previewTiles * tileSize;
const rgba = new Uint8Array(width * height * 4);
for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
  setPixel(rgba, width, x, y, [63, 32, 35, 255]);
}

const copy = (source: typeof floorMiddle, sourceX: number, sourceY: number, tileX: number, tileY: number): void => {
  for (let y = 0; y < tileSize; y += 1) for (let x = 0; x < tileSize; x += 1) {
    const offset = ((sourceY + y) * source.width + sourceX + x) * 4;
    blendPixel(rgba, width, tileX * tileSize + x, tileY * tileSize + y, [
      source.rgba[offset] ?? 0, source.rgba[offset + 1] ?? 0,
      source.rgba[offset + 2] ?? 0, source.rgba[offset + 3] ?? 0,
    ]);
  }
};
const copyUndug = (tileX: number, tileY: number): void => {
  for (let y = 0; y < tileSize; y += 1) for (let x = 0; x < tileSize; x += 1) {
    setPixel(rgba, width, tileX * tileSize + x, tileY * tileSize + y, [57, 31, 33, 255]);
  }
};
const copyFrame = (frame: number, tileX: number, tileY: number): void => copy(
  walls, (frame % 7) * tileSize, Math.floor(frame / 7) * tileSize, tileX, tileY,
);
const dugAt = (tileX: number, tileY: number): boolean => tileX >= 0 && tileY >= 0
  && tileX < excavation.width && tileY < excavation.height
  && excavation.dug[tileY * excavation.width + tileX] === 1;
const patchAt = (tileX: number, tileY: number): 0 | 1 | null => {
  for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
    for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
      if (!dugAt(tileX + offsetX, tileY + offsetY)) return null;
    }
  }
  return caveFloorPatchVariantAt(42, 30_001, tileX, tileY);
};

for (let localY = 0; localY < previewTiles; localY += 1) {
  for (let localX = 0; localX < previewTiles; localX += 1) {
    const tileX = originX + localX;
    const tileY = originY + localY;
    if (dugAt(tileX, tileY)) {
      copy(floorMiddle, 0, 0, localX, localY);
    } else copyUndug(localX, localY);
  }
}

for (let localY = 0; localY < previewTiles; localY += 1) {
  for (let localX = 0; localX < previewTiles; localX += 1) {
    const tileX = originX + localX;
    const tileY = originY + localY;
    if (!dugAt(tileX, tileY)) continue;
    let clear = true;
    for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
      for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
        if (!dugAt(tileX + offsetX, tileY + offsetY)) clear = false;
      }
    }
    if (!clear) continue;
    const localPatchAt = (offsetX: number, offsetY: number): 0 | 1 | null =>
      patchAt(tileX + offsetX, tileY + offsetY);
    const plan = caveFloorAutotilePlan((x, y) => localPatchAt(x, y) !== null);
    const variant = localPatchAt(0, 0)
      ?? localPatchAt(0, -1) ?? localPatchAt(1, 0)
      ?? localPatchAt(0, 1) ?? localPatchAt(-1, 0)
      ?? localPatchAt(-1, -1) ?? localPatchAt(1, -1)
      ?? localPatchAt(-1, 1) ?? localPatchAt(1, 1);
    if (variant !== null) {
      const floor = variant === 0 ? floor1 : floor2;
      if (plan.transitionFrame !== null) copy(
        floor,
        (plan.transitionFrame % 3) * tileSize,
        Math.floor(plan.transitionFrame / 3) * tileSize,
        localX,
        localY,
      );
      for (const frame of plan.insetFrames) copy(
        floor,
        (frame % 3) * tileSize,
        Math.floor(frame / 3) * tileSize,
        localX,
        localY,
      );
      continue;
    }
    const decoration = caveFloorDecorationFrameAt(42, 30_001, tileX, tileY);
    if (decoration !== null) copy(floorDecoration, decoration * tileSize, 0, localX, localY);
  }
}

const elevationAt = (x: number, y: number): number => (
  x < 0 || y < 0 || x >= excavation.width || y >= excavation.height || !dugAt(x, y) ? 1 : 0
);
for (let localY = 0; localY < previewTiles; localY += 1) for (let localX = 0; localX < previewTiles; localX += 1) {
  const tileX = originX + localX;
  const tileY = originY + localY;
  const plan = resolveRaisedTerrainContoursAt(
    elevationAt, 1, CAVE_RAISED_CLIFF_TILE_SET, 'tall', tileX, tileY,
  )[0]?.plan;
  if (!plan) continue;
  // Cave walls extend into the excavation from their logical solid source;
  // unlike a mountain, there is no walkable raised top plane to shift north.
  const projectedLocalY = localY;
  for (const face of plan.faceLayers) copyFrame(face.frame, localX, projectedLocalY);
  if (plan.edgeSeamUnderlayFrame !== undefined && plan.insetFrames.length === 0) {
    copyFrame(plan.edgeSeamUnderlayFrame, localX, projectedLocalY);
  }
  if (plan.edgeFrame !== null) copyFrame(plan.edgeFrame, localX, projectedLocalY);
  for (const frame of plan.insetFrames) copyFrame(frame, localX, projectedLocalY);
  const directWall = plan.faceLayers.find((face) => face.direct && face.rowId === 'wall');
  if (directWall?.join === 'middle' && ((tileX + 42) % 9 + 9) % 9 === 4) {
    for (let y = 0; y < supports.height; y += 1) for (let x = 0; x < supports.width; x += 1) {
      const offset = (y * supports.width + x) * 4;
      blendPixel(rgba, width, localX * tileSize - 32 + x, projectedLocalY * tileSize - 16 + y, [
        supports.rgba[offset] ?? 0, supports.rgba[offset + 1] ?? 0,
        supports.rgba[offset + 2] ?? 0, supports.rgba[offset + 3] ?? 0,
      ]);
    }
  }
}

const output = resolve(root, 'build/review/starter-cellar-autotile.png');
await mkdir(resolve(root, 'build/review'), { recursive: true });
await writeFile(output, encodePng(width, height, rgba));
console.log(output);
