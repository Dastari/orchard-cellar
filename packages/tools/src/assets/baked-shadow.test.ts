import { describe, expect, it } from 'vitest';
import { compileBakedShadow, type ShadowSeasonRemaps } from './baked-shadow.js';
import type { AssetSource, PaletteSource } from './types.js';

const palette: PaletteSource = { name: 'test', colors: { a: '#123456', s: '#00000028', t: '#00000029' }, markerDefaults: {} };
const seasons: ShadowSeasonRemaps = { spring: {}, summer: {}, autumn: {}, winter: {} };
const asset: AssetSource = {
  name: 'test_tree', category: 'trees', size: [5, 2], anchor: [2, 1], bakedShadowColor: '#00000028',
  sourcePalette: { s: '#00000028', t: '#00000029', u: '#00000128', b: '#000000ff' },
  frames: { base: [['ssasu', 'stb.s']] }, frameKinds: { base: 'state' },
};

describe('exact baked shadow compilation', () => {
  it('matches full RGBA, merges row spans, and preserves every source pixel', () => {
    const before = JSON.stringify(asset);
    expect(compileBakedShadow(asset, palette, seasons)).toEqual({ color: '#00000028', frames: {
      base: [{ width: 5, height: 2, pixelCount: 5, spans: [0, 0, 2, 0, 3, 1, 1, 0, 1, 1, 4, 1], bodyBounds: [2, 0, 3, 2] }],
    } });
    expect(JSON.stringify(asset)).toBe(before);
    const undeclared = { ...asset };
    delete undeclared.bakedShadowColor;
    expect(compileBakedShadow(undeclared, palette, seasons)).toBeUndefined();
  });

  it('normalizes hex case and includes states, animation frames, variants and empty selections', () => {
    const frames = { state: [['ssasu', 'stb.s']], animation: [['ssasu', 'stb.s'], ['aaaaa', 'aaaaa']], variant: [['aaaaa', 'aaaaa']] };
    const result = compileBakedShadow({ ...asset, bakedShadowColor: '#0000002A',
      sourcePalette: { ...asset.sourcePalette, s: '#0000002a' }, frames,
      frameKinds: { state: 'state', animation: 'animation', variant: 'variant' },
    }, palette, seasons)!;
    expect(result.color).toBe('#0000002a');
    expect(result.frames['animation']?.map((f) => f.pixelCount)).toEqual([5, 0]);
    expect(result.frames['variant']?.[0]?.spans).toEqual([]);
    expect(Object.keys(result.frames)).toEqual(['state', 'animation', 'variant']);
  });

  it('compiles all 47 expanded autotile frames', () => {
    const grid = Array.from({ length: 16 }, () => 's'.repeat(16));
    const result = compileBakedShadow({ ...asset, size: [16, 16], autotile: 'blob47',
      frames: { base: [grid, grid, grid, grid, grid] }, frameKinds: { base: 'variant' },
    }, palette, seasons)!;
    expect(result.frames['base']).toHaveLength(47);
    expect(result.frames['base']?.every((f) => f.pixelCount === 256 && f.spans.length === 48)).toBe(true);
  });

  it.each(['#000000', '#00000000', '#000000ff', '#000000gg', 'black', '#ffffff28'])('rejects invalid or absent selection %s', (color) => {
    expect(() => compileBakedShadow({ ...asset, bakedShadowColor: color }, palette, seasons)).toThrow('test_tree: bakedShadowColor');
  });

  it.each(['ui', 'fonts'])('rejects declarations on %s', (category) => {
    expect(() => compileBakedShadow({ ...asset, category }, palette, seasons)).toThrow('UI or fonts');
  });

  it('rejects both seasonal removal and seasonal introduction of reserved pixels', () => {
    const remapped = { ...asset, sourcePalette: { u: '#00000128', b: '#000000ff' } };
    expect(() => compileBakedShadow(remapped, palette, { ...seasons, winter: { s: 'a' } })).toThrow('winter remap');
    expect(() => compileBakedShadow(remapped, palette, { ...seasons, autumn: { a: 's' } })).toThrow('autumn remap');
    expect(compileBakedShadow(asset, palette, { ...seasons, winter: { s: 'a' } })?.frames['base']?.[0]?.pixelCount).toBe(5);
  });

  it('rejects runtime recolour markers', () => {
    expect(() => compileBakedShadow({ ...asset, markerRamps: { foliage: ['s'] } }, palette, seasons)).toThrow('recolour marker');
    expect(() => compileBakedShadow({ ...asset, markers: { s: 's' } }, palette, seasons)).toThrow('recolour marker');
  });

  it('rejects multi-frame states rather than compiling pixels the atlas will not export', () => {
    expect(() => compileBakedShadow({ ...asset, frames: { base: [asset.frames['base']![0]!, asset.frames['base']![0]!] } }, palette, seasons)).toThrow('exported kind');
  });
});
