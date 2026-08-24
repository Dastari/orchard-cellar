import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadAssets, loadPalette, readJson, workspaceRoot } from './assets/load.js';
import { encodePng, hexToRgba, setPixel } from './assets/png.js';
import type { AssetSource, BuiltFrame, PaletteSource, PixelGrid } from './assets/types.js';

interface SeasonSource {
  readonly required: readonly string[];
  readonly spring: Readonly<Record<string, string>>;
  readonly summer: Readonly<Record<string, string>>;
  readonly autumn: Readonly<Record<string, string>>;
  readonly winter: Readonly<Record<string, string>>;
}

type Season = 'spring' | 'summer' | 'autumn' | 'winter';
const seasons: readonly Season[] = ['spring', 'summer', 'autumn', 'winter'];
const outputRoot = new URL('packages/client/public/generated/', workspaceRoot);
const ATLAS_WIDTH = 512;

function rotateGrid(grid: PixelGrid, turns: number): string[] {
  let result = [...grid];
  for (let turn = 0; turn < turns; turn += 1) {
    const height = result.length;
    const width = result[0]?.length ?? 0;
    result = Array.from({ length: width }, (_, y) =>
      Array.from({ length: height }, (_, x) => result[height - 1 - x]?.[y] ?? '.').join(''),
    );
  }
  return result;
}

function copyQuadrant(target: string[][], source: PixelGrid, quadrant: number): void {
  const startX = quadrant % 2 === 0 ? 0 : 8;
  const startY = quadrant < 2 ? 0 : 8;
  for (let y = startY; y < startY + 8; y += 1) {
    for (let x = startX; x < startX + 8; x += 1) target[y]![x] = source[y]?.[x] ?? '.';
  }
}

export function expandBlob47(frames: readonly PixelGrid[]): PixelGrid[] {
  const [center, edge, outer, inner, isolated] = frames;
  if (!center || !edge || !outer || !inner || !isolated) throw new Error('blob47 requires five template frames');
  const results: PixelGrid[] = [];
  for (let cardinals = 0; cardinals < 16; cardinals += 1) {
    const north = (cardinals & 1) !== 0;
    const east = (cardinals & 2) !== 0;
    const south = (cardinals & 4) !== 0;
    const west = (cardinals & 8) !== 0;
    const eligible = [north && east, east && south, south && west, west && north];
    const combinations = 1 << eligible.filter(Boolean).length;
    for (let diagonalChoice = 0; diagonalChoice < combinations; diagonalChoice += 1) {
      if (cardinals === 0) {
        results.push(isolated);
        continue;
      }
      let choiceBit = 0;
      const diagonals = eligible.map((allowed) => allowed && (diagonalChoice & (1 << choiceBit++)) !== 0);
      const target = Array.from({ length: 16 }, () => Array.from({ length: 16 }, () => '.'));
      const corners = [
        { adjacent: [north, west] as const, diagonal: diagonals[3] ?? false, rotation: 0 },
        { adjacent: [north, east] as const, diagonal: diagonals[0] ?? false, rotation: 1 },
        { adjacent: [south, east] as const, diagonal: diagonals[1] ?? false, rotation: 2 },
        { adjacent: [south, west] as const, diagonal: diagonals[2] ?? false, rotation: 3 },
      ];
      for (let quadrant = 0; quadrant < corners.length; quadrant += 1) {
        const corner = corners[quadrant]!;
        const [first, second] = corner.adjacent;
        let template: PixelGrid = center;
        let rotation = corner.rotation;
        if (!first && !second) template = outer;
        else if (first && second && !corner.diagonal) template = inner;
        else if (!first || !second) {
          template = edge;
          if (quadrant === 0) rotation = !first ? 0 : 3;
          if (quadrant === 1) rotation = !first ? 0 : 1;
          if (quadrant === 2) rotation = !first ? 2 : 1;
          if (quadrant === 3) rotation = !first ? 2 : 3;
        }
        copyQuadrant(target, rotateGrid(template, rotation), quadrant);
      }
      results.push(target.map((row) => row.join('')));
    }
  }
  if (results.length !== 47) throw new Error(`blob47 generated ${results.length} variants`);
  return results;
}

function framesForAsset(asset: AssetSource): Readonly<Record<string, readonly PixelGrid[]>> {
  if (asset.autotile !== 'blob47') return asset.frames;
  const base = asset.frames['base'];
  if (!base) throw new Error(`${asset.name} is missing base frames`);
  return { ...asset.frames, base: expandBlob47(base) };
}

function resolveColor(
  character: string,
  palette: PaletteSource,
  remap: Readonly<Record<string, string>>,
  markers: Readonly<Record<string, string>>,
): readonly [number, number, number, number] {
  if (character === '.') return [0, 0, 0, 0];
  const marker = markers[character] ?? palette.markerDefaults[character] ?? character;
  const remapped = remap[marker] ?? marker;
  const hex = palette.colors[remapped];
  if (!hex) throw new Error(`Unknown palette character ${character}`);
  return hexToRgba(hex);
}

export async function buildAtlases(): Promise<void> {
  const [assets, palette, seasonSource] = await Promise.all([
    loadAssets(),
    loadPalette(),
    readJson(new URL('packages/assets/seasons.json', workspaceRoot)) as Promise<SeasonSource>,
  ]);
  await mkdir(outputRoot, { recursive: true });

  const categories = [...new Set(assets.map((asset) => asset.category))].sort();
  const metadata: Record<string, unknown> = { atlases: {}, assets: {} };
  const atlasRecords = metadata['atlases'] as Record<string, string>;
  const assetRecords = metadata['assets'] as Record<string, unknown>;

  for (const category of categories) {
    const categoryAssets = assets.filter((asset) => asset.category === category).sort((a, b) => a.name.localeCompare(b.name));
    const placements: { asset: AssetSource; animation: string; grid: PixelGrid; frame: BuiltFrame }[] = [];
    let x = 0;
    let y = 0;
    let rowHeight = 0;
    for (const asset of categoryAssets) {
      const animations: Record<string, BuiltFrame[]> = {};
      const markerLayers: Record<string, { x: number; y: number; marker: string; shade: number }[][]> = {};
      for (const [animation, grids] of Object.entries(framesForAsset(asset))) {
        animations[animation] = [];
        markerLayers[animation] = [];
        for (const grid of grids) {
          if (x + asset.size[0] > ATLAS_WIDTH) { x = 0; y += rowHeight; rowHeight = 0; }
          const frame = {
            x,
            y,
            width: asset.size[0],
            height: asset.size[1],
            durationTicks: Math.max(1, Math.round(60 / (asset.animationFps?.[animation] ?? asset.fps ?? 1))),
          };
          placements.push({ asset, animation, grid, frame });
          animations[animation].push(frame);
          const markerPixels: { x: number; y: number; marker: string; shade: number }[] = [];
          for (const [marker, ramp] of Object.entries(asset.markerRamps ?? {})) {
            ramp.forEach((character, shade) => {
              grid.forEach((row, pixelY) => {
                for (let pixelX = 0; pixelX < row.length; pixelX += 1) {
                  if (row[pixelX] === character) markerPixels.push({ x: frame.x + pixelX, y: frame.y + pixelY, marker, shade });
                }
              });
            });
          }
          markerLayers[animation].push(markerPixels);
          x += asset.size[0];
          rowHeight = Math.max(rowHeight, asset.size[1]);
        }
      }
      assetRecords[asset.name] = {
        category,
        anchor: asset.anchor,
        collision: asset.collision ?? [],
        animations,
        markerLayers,
      };
    }
    const height = Math.max(1, y + rowHeight);
    for (const season of seasons) {
      const rgba = new Uint8Array(ATLAS_WIDTH * height * 4);
      for (const placement of placements) {
        for (let pixelY = 0; pixelY < placement.asset.size[1]; pixelY += 1) {
          for (let pixelX = 0; pixelX < placement.asset.size[0]; pixelX += 1) {
            const character = placement.grid[pixelY]?.[pixelX] ?? '.';
            const color = resolveColor(character, palette, seasonSource[season], placement.asset.markers ?? {});
            setPixel(rgba, ATLAS_WIDTH, placement.frame.x + pixelX, placement.frame.y + pixelY, color);
          }
        }
      }
      const filename = `atlas_${category}_${season}.png`;
      await writeFile(new URL(filename, outputRoot), encodePng(ATLAS_WIDTH, height, rgba));
      atlasRecords[`${category}:${season}`] = filename;
    }
  }
  await writeFile(new URL('atlas.meta.json', outputRoot), `${JSON.stringify(metadata, null, 2)}\n`);
  console.log(`Built ${assets.length} assets across ${categories.length} atlas categories.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await buildAtlases();
