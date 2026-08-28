import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  caveWallAtlasFrameFor,
  generateStarterCellarExcavation,
  resolveRaisedTerrainContoursAt,
  type RaisedTerrainTileSet,
} from '@orchard/sim';
import { workspaceRoot } from './assets/load.js';
import { blendPixel, decodePng, encodePng, setPixel } from './assets/png.js';

const root = fileURLToPath(workspaceRoot);
const floorMiddle = decodePng(await readFile(resolve(root, 'references/Cute_Fantasy/Tiles/Cave/Cave_Floor_Middle.png')));
const walls = decodePng(await readFile(resolve(root, 'references/Cute_Fantasy/Tiles/Cave/Cave_Walls.png')));
const supports = decodePng(await readFile(resolve(root, 'references/Cute_Fantasy/Tiles/Cave/Cave_Wall_Support.png')));
const excavation = generateStarterCellarExcavation();
const tileSize = 16;
// The real field is 1024×1024 tiles. Review only its central 64×64 window.
const previewTiles = 64;
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

for (let localY = 0; localY < previewTiles; localY += 1) {
  for (let localX = 0; localX < previewTiles; localX += 1) {
    const tileX = originX + localX;
    const tileY = originY + localY;
    if (dugAt(tileX, tileY)) {
      copy(floorMiddle, 0, 0, localX, localY);
    } else copyUndug(localX, localY);
  }
}

const caveTiles: RaisedTerrainTileSet = {
  edgeFrames: {},
  insetFrames: {},
  rampFrames: {},
  faceProfiles: { tall: { rows: [
    { id: 'wall', frames: [42, 43, 44], blocksMovement: true, blocksLight: true },
    { id: 'lower_wall', frames: [49, 50, 51], blocksMovement: true, blocksLight: true },
  ] } },
};
const elevationAt = (x: number, y: number): number => (
  x < 0 || y < 0 || x >= excavation.width || y >= excavation.height || !dugAt(x, y) ? 1 : 0
);
for (let localY = 0; localY < previewTiles; localY += 1) for (let localX = 0; localX < previewTiles; localX += 1) {
  const tileX = originX + localX;
  const tileY = originY + localY;
  if (!dugAt(tileX, tileY)) {
    const ringFrame = caveWallAtlasFrameFor((offsetX, offsetY) => dugAt(tileX + offsetX, tileY + offsetY));
    if (ringFrame !== null) copyFrame(ringFrame, localX, localY);
  }
  const plan = resolveRaisedTerrainContoursAt(elevationAt, 1, caveTiles, 'tall', tileX, tileY)[0]?.plan;
  if (!plan) continue;
  const projectedLocalY = localY - 2;
  for (const face of plan.faceLayers) copyFrame(face.frame, localX, projectedLocalY);
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
