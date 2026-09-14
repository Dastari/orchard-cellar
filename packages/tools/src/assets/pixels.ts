import { hexToRgba } from './png.js';
import type { AssetSource, PaletteSource, PixelGrid } from './types.js';

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

export function framesForAsset(asset: AssetSource): Readonly<Record<string, readonly PixelGrid[]>> {
  if (asset.autotile !== 'blob47') return asset.frames;
  const base = asset.frames['base'];
  if (!base) throw new Error(`${asset.name} is missing base frames`);
  return { ...asset.frames, base: expandBlob47(base) };
}

export function resolveColor(
  character: string,
  palette: PaletteSource,
  remap: Readonly<Record<string, string>>,
  markers: Readonly<Record<string, string>>,
  sourcePalette: Readonly<Record<string, string>>,
): readonly [number, number, number, number] {
  if (character === '.') return [0, 0, 0, 0];
  const sourceHex = sourcePalette[character];
  if (sourceHex) return hexToRgba(sourceHex);
  const marker = markers[character] ?? palette.markerDefaults[character] ?? character;
  const remapped = remap[marker] ?? marker;
  const hex = palette.colors[remapped];
  if (!hex) throw new Error(`Unknown palette character ${character}`);
  return hexToRgba(hex);
}
