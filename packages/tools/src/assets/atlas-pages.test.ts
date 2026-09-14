import { describe, expect, it } from 'vitest';
import { ATLAS_PAGE_MAX_BYTES, packAtlasPages } from './atlas-pages.js';
import { loadAssets } from './load.js';
import { framesForAsset } from './pixels.js';

describe('whole-asset atlas pages', () => {
  it('keeps a complete asset together when the previous shelf has insufficient space', () => {
    const pages = packAtlasPages('characters', [
      { name: 'first', width: 256, height: 1024, frameCount: 3 },
      { name: 'second', width: 256, height: 1024, frameCount: 2 },
      { name: 'third', width: 256, height: 1024, frameCount: 2 },
    ]);
    expect(pages.map((page) => page.pageId)).toEqual(['characters:p000', 'characters:p001']);
    expect(pages.map((page) => page.assets.map((asset) => asset.name))).toEqual([['first'], ['second', 'third']]);
    expect(pages[1]?.assets[0]?.frames).toEqual([{ x: 0, y: 0 }, { x: 256, y: 0 }]);
    expect(pages.every((page) => page.width * page.height * 4 <= ATLAS_PAGE_MAX_BYTES)).toBe(true);
  });

  it('rejects a frame or complete asset that cannot fit a fresh page', () => {
    expect(() => packAtlasPages('x', [{ name: 'wide', width: 513, height: 1, frameCount: 1 }])).toThrow(/wide.*exceeds/);
    expect(() => packAtlasPages('x', [{ name: 'tall', width: 1, height: 2049, frameCount: 1 }])).toThrow(/tall.*exceeds/);
    expect(() => packAtlasPages('x', [{ name: 'many', width: 256, height: 1024, frameCount: 5 }])).toThrow(/many.*all 5 frames.*split/);
    expect(() => packAtlasPages('x', [{ name: 'empty', width: 1, height: 1, frameCount: 0 }])).toThrow(/positive integers/);
    expect(() => packAtlasPages('x', [{ name: 'fraction', width: 1.5, height: 1, frameCount: 1 }])).toThrow(/positive integers/);
    const duplicate = { name: 'same', width: 1, height: 1, frameCount: 1 };
    expect(() => packAtlasPages('x', [duplicate, duplicate])).toThrow(/Duplicate/);
    expect(packAtlasPages('x', [])).toEqual([]);
  });

  it('packs the complete source catalog within bounds without overlaps or split assets', async () => {
    const assets = await loadAssets();
    let packedCount = 0;
    for (const category of new Set(assets.map((asset) => asset.category))) {
      const input = assets.filter((asset) => asset.category === category)
        .sort((left, right) => left.name.localeCompare(right.name))
        .map((asset) => ({ name: asset.name, width: asset.size[0], height: asset.size[1],
          frameCount: Object.values(framesForAsset(asset)).reduce((sum, frames) => sum + frames.length, 0) }));
      const pages = packAtlasPages(category, input);
      expect(packAtlasPages(category, input)).toEqual(pages);
      const names = new Set<string>();
      for (const page of pages) {
        expect(page.width).toBeLessThanOrEqual(512);
        expect(page.height).toBeLessThanOrEqual(2048);
        expect(page.width * page.height * 4).toBeLessThanOrEqual(ATLAS_PAGE_MAX_BYTES);
        const occupied = new Uint8Array(page.width * page.height);
        for (const asset of page.assets) {
          expect(names.has(asset.name)).toBe(false);
          names.add(asset.name);
          expect(asset.frames.length).toBe(input.find((entry) => entry.name === asset.name)?.frameCount);
          for (const frame of asset.frames) {
            expect(frame.x + asset.width).toBeLessThanOrEqual(page.width);
            expect(frame.y + asset.height).toBeLessThanOrEqual(page.height);
            for (let y = frame.y; y < frame.y + asset.height; y += 1) {
              const start = y * page.width + frame.x;
              expect(occupied.subarray(start, start + asset.width).some(Boolean)).toBe(false);
              occupied.fill(1, start, start + asset.width);
            }
          }
        }
      }
      expect(names.size).toBe(input.length);
      packedCount += names.size;
    }
    expect(packedCount).toBe(assets.length);
  });
});
