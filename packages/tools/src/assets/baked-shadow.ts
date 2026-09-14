import { framesForAsset, resolveColor } from './pixels.js';
import { frameKind } from './frame-kind.js';
import { hexToRgba } from './png.js';
import type { AssetSource, PaletteSource } from './types.js';

export interface BuiltBakedShadowFrame {
  readonly width: number;
  readonly height: number;
  readonly pixelCount: number;
  readonly bodyBounds?: readonly [number, number, number, number] | null;
  /** Sorted disjoint triples: y, startX, length. Coordinates are frame-local. */
  readonly spans: readonly number[];
}

export interface BuiltBakedShadow {
  readonly color: string;
  readonly frames: Readonly<Record<string, readonly BuiltBakedShadowFrame[]>>;
}

const SEASONS = ['spring', 'summer', 'autumn', 'winter'] as const;
export type ShadowSeasonRemaps = Readonly<Record<typeof SEASONS[number], Readonly<Record<string, string>>>>;

/** Classify exact integer source RGBA before browser premultiplication. The
 * same resolver and expanded grids are used to paint the original atlas. */
export function compileBakedShadow(
  asset: AssetSource,
  palette: PaletteSource,
  seasons: ShadowSeasonRemaps,
): BuiltBakedShadow | undefined {
  const declared = asset.bakedShadowColor;
  if (declared === undefined) return undefined;
  const fail = (message: string): never => { throw new Error(`${asset.name}: bakedShadowColor ${message}`); };
  if (typeof declared !== 'string' || !/^#[0-9a-f]{8}$/i.test(declared)) fail('must be #RRGGBBAA');
  const color = declared.toLowerCase();
  const rgba = hexToRgba(color);
  if (rgba[3] === 0 || rgba[3] === 255) fail('must have translucent alpha (01..fe)');
  if (asset.category === 'ui' || asset.category === 'fonts') fail('is not supported for UI or fonts');
  const markers = new Set(Object.values(asset.markerRamps ?? {}).flat());
  const matches = (value: readonly number[]): boolean => value.every((channel, i) => channel === rgba[i]);
  // Resolve once per used character, not once per pixel per season.
  const selected = new Map<string, boolean>();
  const isShadow = (character: string): boolean => {
    const cached = selected.get(character);
    if (cached !== undefined) return cached;
    const original = matches(resolveColor(character, palette, {}, asset.markers ?? {}, asset.sourcePalette ?? {}));
    for (const season of SEASONS) {
      const seasonal = matches(resolveColor(character, palette, seasons[season], asset.markers ?? {}, asset.sourcePalette ?? {}));
      if (seasonal !== original) fail(`${season} remap changes the reserved selection for ${character}`);
    }
    if (original && (markers.has(character) || Object.hasOwn(asset.markers ?? {}, character)
      || Object.hasOwn(palette.markerDefaults, character))) fail(`shadow character ${character} is a recolour marker`);
    selected.set(character, original);
    return original;
  };
  const bodyCharacters = new Map<string, boolean>();
  const isBody = (character: string): boolean => {
    let body = bodyCharacters.get(character);
    if (body === undefined) {
      body = !isShadow(character) && resolveColor(character, palette, {}, asset.markers ?? {}, asset.sourcePalette ?? {})[3]! >= 128;
      bodyCharacters.set(character, body);
    }
    return body;
  };
  let total = 0;
  const frames = Object.fromEntries(Object.entries(framesForAsset(asset)).map(([group, grids]) => {
    if (grids.length === 0 || (frameKind(asset, group, grids) === 'state' && grids.length !== 1)) {
      fail(`${group} frame count does not match its exported kind`);
    }
    return [group, grids.map((grid, index): BuiltBakedShadowFrame => {
      const [width, height] = asset.size;
      if (grid.length !== height || grid.some((row) => row.length !== width)) fail(`${group}[${index}] has invalid dimensions`);
      const spans: number[] = [];
      let pixelCount = 0;
      for (let y = 0; y < height; y++) {
        let x = 0;
        while (x < width) {
          if (!isShadow(grid[y]![x]!)) { x++; continue; }
          const start = x++;
          while (x < width && isShadow(grid[y]![x]!)) x++;
          spans.push(y, start, x - start);
          pixelCount += x - start;
        }
      }
      let left = width, top = height, right = 0, bottom = 0;
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        if (!isBody(grid[y]![x]!)) continue;
        left = Math.min(left, x); top = Math.min(top, y);
        right = Math.max(right, x + 1); bottom = Math.max(bottom, y + 1);
      }
      total += pixelCount;
      return { width, height, pixelCount, spans, bodyBounds: right > left ? [left, top, right, bottom] : null };
    })];
  }));
  if (total === 0) fail('does not match any exported pixel');
  return { color, frames };
}
