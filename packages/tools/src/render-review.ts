import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadAssets, loadPalette, workspaceRoot } from './assets/load.js';
import { encodePng, hexToRgba, setPixel } from './assets/png.js';
import type { AssetSource, PaletteSource, PixelGrid } from './assets/types.js';
import { expandBlob47 } from './build-atlas.js';

const reviewRoot = new URL('build/review/', workspaceRoot);
const checkerLight = hexToRgba('#d9c49a');
const checkerDark = hexToRgba('#969099');
const divider = hexToRgba('#1a1210');

function resolveHex(character: string, asset: AssetSource, palette: PaletteSource): string | null {
  if (character === '.') return null;
  const marker = asset.markers?.[character] ?? palette.markerDefaults[character] ?? character;
  return palette.colors[marker] ?? null;
}

function fillChecker(rgba: Uint8Array, width: number, height: number): void {
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) setPixel(rgba, width, x, y, (Math.floor(x / 8) + Math.floor(y / 8)) % 2 ? checkerDark : checkerLight);
  }
}

function drawGrid(
  rgba: Uint8Array,
  canvasWidth: number,
  grid: PixelGrid,
  asset: AssetSource,
  palette: PaletteSource,
  originX: number,
  originY: number,
  scale: number,
): void {
  for (let y = 0; y < asset.size[1]; y += 1) {
    for (let x = 0; x < asset.size[0]; x += 1) {
      const hex = resolveHex(grid[y]?.[x] ?? '.', asset, palette);
      if (!hex) continue;
      const color = hexToRgba(hex);
      for (let sy = 0; sy < scale; sy += 1) {
        for (let sx = 0; sx < scale; sx += 1) setPixel(rgba, canvasWidth, originX + x * scale + sx, originY + y * scale + sy, color);
      }
    }
  }
}

function allFrames(asset: AssetSource): PixelGrid[] {
  if (asset.autotile === 'blob47') return expandBlob47(asset.frames['base'] ?? []);
  return Object.values(asset.frames).flatMap((frames) => [...frames]);
}

export async function renderReview(name: string): Promise<URL> {
  const [assets, palette] = await Promise.all([loadAssets(), loadPalette()]);
  const asset = assets.find((candidate) => candidate.name === name);
  if (!asset) throw new Error(`Unknown asset ${name}`);
  const frames = allFrames(asset);
  const neighbors = assets.filter((candidate) => candidate.category === asset.category && candidate.approved && candidate.name !== name).slice(0, 3);
  const mainWidth = asset.size[0] * 8;
  const mainHeight = asset.size[1] * 8;
  const neighborWidth = Math.max(128, ...neighbors.map((neighbor) => neighbor.size[0] * 4 + 16));
  const filmstripWidth = frames.length * (asset.size[0] * 4 + 4);
  const width = Math.max(mainWidth + neighborWidth + 40, filmstripWidth + 32, 320);
  const neighborHeight = neighbors.reduce((sum, neighbor) => sum + neighbor.size[1] * 4 + 12, 0);
  const height = Math.max(mainHeight, neighborHeight) + asset.size[1] * 4 + 48;
  const rgba = new Uint8Array(width * height * 4);
  fillChecker(rgba, width, height);

  drawGrid(rgba, width, frames[0] ?? [], asset, palette, 16, 16, 8);
  drawGrid(rgba, width, frames[0] ?? [], asset, palette, 18, 18, 1);
  for (let y = 0; y < height; y += 1) setPixel(rgba, width, mainWidth + 28, y, divider);

  let neighborY = 16;
  for (const neighbor of neighbors) {
    drawGrid(rgba, width, allFrames(neighbor)[0] ?? [], neighbor, palette, mainWidth + 44, neighborY, 4);
    neighborY += neighbor.size[1] * 4 + 12;
  }
  const stripY = Math.max(mainHeight, neighborHeight) + 32;
  frames.forEach((frame, index) => {
    drawGrid(rgba, width, frame, asset, palette, 16 + index * (asset.size[0] * 4 + 4), stripY, 4);
  });

  await mkdir(reviewRoot, { recursive: true });
  const output = new URL(`${asset.name}.png`, reviewRoot);
  await writeFile(output, encodePng(width, height, rgba));
  console.log(`Rendered ${asset.name} review with ${neighbors.length} approved neighbors: ${fileURLToPath(output)}`);
  return output;
}

const name = process.argv[2];
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (!name) throw new Error('Usage: npm run assets:render <asset-name>');
  await renderReview(name);
}
