import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodePng, hexToRgba } from './assets/png.js';
import type { AssetSource } from './assets/types.js';
import { uiMetadataErrors } from './assets/ui-metadata.js';

const root = new URL('../../../', import.meta.url);
const recipes = JSON.parse(readFileSync(new URL('./kit-ui-extracts.json', import.meta.url), 'utf8')) as {
  name: string; sheet: string; size: [number, number]; names: string[]; grid: [number, number];
}[];
const hashes = JSON.parse(readFileSync(new URL('./kit-ui-art-hashes.json', import.meta.url), 'utf8')) as Record<string, string>;

describe('reviewed Phase 0 art', () => {
  for (const recipe of recipes) it(`preserves ${recipe.name} pixels and metadata`, () => {
    const source = JSON.parse(readFileSync(new URL(`packages/assets/ui/${recipe.name}.sprite.json`, root), 'utf8')) as AssetSource;
    expect(source.size).toEqual(recipe.size);
    expect(source.approved).toBe(true);
    expect(uiMetadataErrors(source)).toEqual([]);
    expect(Object.keys(source.frames)).toEqual(recipe.names);
    expect(Object.values(source.frames).flat()).toHaveLength(recipe.grid[0] * recipe.grid[1]);
    const sourcePath = new URL(source.sourcePath!, root);
    const original = existsSync(sourcePath) ? decodePng(readFileSync(sourcePath)) : null;
    const hash = createHash('sha256');
    for (const [group, frames] of Object.entries(source.frames)) for (const [index, grid] of frames.entries()) {
      const [ox, oy, width, height] = source.sourceRegions![group]![index]!;
      if (original) {
        expect(ox + width).toBeLessThanOrEqual(original.width);
        expect(oy + height).toBeLessThanOrEqual(original.height);
      }
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const key = grid[y]![x]!;
        const rgba = key === '.' ? [0, 0, 0, 0] : hexToRgba(source.sourcePalette![key]!);
        hash.update(Uint8Array.from(rgba));
        if (original) {
          const offset = ((oy + y) * original.width + ox + x) * 4;
          const expected = original.rgba[offset + 3] === 0 ? [0, 0, 0, 0] : Array.from(original.rgba.slice(offset, offset + 4));
          expect(rgba, `${group}/${index}/${x},${y}`).toEqual(expected);
        }
      }
    }
    expect(hash.digest('hex')).toBe(hashes[recipe.name]);
  });
  it('covers the seven authored frame families with identical state sets', () => {
    const frames = recipes.filter(({ name }) => name.includes('kit_frame_'));
    expect(frames).toHaveLength(7);
    for (const frame of frames) expect(frame.names).toEqual(frames[0]!.names);
  });
});
