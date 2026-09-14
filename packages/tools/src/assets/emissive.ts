import { framesForAsset, resolveColor } from './pixels.js';
import { hexToRgba } from './png.js';
import type { AssetSource, PaletteSource } from './types.js';

/** Exact authored flame colours, compiled once; off frames naturally stay dark. */
export function compileEmissiveFrames(asset: AssetSource, palette: PaletteSource): Record<string, number[][]> | undefined {
  if (asset.emissiveColors === undefined) return undefined;
  if (!Array.isArray(asset.emissiveColors) || asset.emissiveColors.length > 64
    || !asset.emissiveColors.every((color) => /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(color))) throw new Error(`${asset.name}: invalid emissiveColors`);
  const colors = asset.emissiveColors.map(hexToRgba);
  const selected = new Map<string, boolean>();
  const emits = (character: string): boolean => {
    let value = selected.get(character);
    if (value === undefined) {
      const rgba = resolveColor(character, palette, {}, asset.markers ?? {}, asset.sourcePalette ?? {});
      value = colors.some((color) => color.every((channel, i) => channel === rgba[i])); selected.set(character, value);
    }
    return value;
  };
  return Object.fromEntries(Object.entries(framesForAsset(asset)).map(([name, grids]) => [name, grids.map((grid) => {
    const spans: number[] = [];
    for (let y = 0; y < grid.length; y++) for (let x = 0; x < grid[y]!.length;) {
      if (!emits(grid[y]![x]!)) { x++; continue; }
      const start = x++;
      while (x < grid[y]!.length && emits(grid[y]![x]!)) x++;
      spans.push(y, start, x - start);
    }
    return spans;
  })]));
}
