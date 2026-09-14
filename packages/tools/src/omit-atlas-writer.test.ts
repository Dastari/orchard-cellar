import { writeFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import { buildAtlases } from './build-atlas.js';
import { decodePng } from './assets/png.js';

vi.mock('./build-backdrop-pages.js', () => ({ buildBackdropPages: vi.fn(async () => undefined) }));
vi.mock('node:fs/promises', async (original) => ({
  ...await original<typeof import('node:fs/promises')>(),
  mkdir: vi.fn(async () => undefined), readdir: vi.fn(async () => []), writeFile: vi.fn(async () => undefined),
}));
vi.mock('./assets/load.js', () => ({
  workspaceRoot: new URL('file:///tmp/omit-writer-contract/'),
  loadAssets: async () => [
    { name: 'declared', category: 'props', size: [1, 1], anchor: [0, 0], frames: { base: [['s']] }, bakedShadowColor: '#00000028' },
    { name: 'system_missing_asset', category: 'props', size: [1, 1], anchor: [0, 0], frames: { base: [['s']] } },
    { name: 'unaffected', category: 'fonts', size: [1, 1], anchor: [0, 0], frames: { base: [['a']] } },
  ],
  loadPalette: async () => ({ name: 'test', colors: { a: '#ff0000', s: '#00000028' }, markerDefaults: {} }),
  readJson: async () => ({ required: [], spring: {}, summer: {}, autumn: {}, winter: {} }),
}));

function output(filename: string): string | Uint8Array {
  const write = vi.mocked(writeFile).mock.calls.find(([path]) => String(path).endsWith(`/${filename}`));
  if (!write || !(typeof write[1] === 'string' || write[1] instanceof Uint8Array)) throw new Error(`Missing output ${filename}`);
  return write[1];
}

describe('omit page writer', () => {
  it('lists only affected seasonal pages and preserves undeclared pixels sharing their page', async () => {
    await buildAtlases();
    const index = JSON.parse(String(output('atlas.meta.json'))) as { schemaVersion: number; omitAtlases: Record<string, string> };
    expect(index.schemaVersion).toBe(4);
    expect(Object.keys(index.omitAtlases)).toEqual(['props:p000:spring', 'props:p000:summer', 'props:p000:autumn', 'props:p000:winter']);
    for (const season of ['spring', 'summer', 'autumn', 'winter']) {
      expect(index.omitAtlases[`props:p000:${season}`]).toBe(`atlas_props_p000_${season}.omit.png`);
      const before = decodePng(output(`atlas_props_p000_${season}.png`) as Buffer);
      const after = decodePng(output(`atlas_props_p000_${season}.omit.png`) as Buffer);
      expect([after.width, after.height]).toEqual([before.width, before.height]);
      expect([...before.rgba.subarray(0, 8)]).toEqual([0, 0, 0, 40, 0, 0, 0, 40]);
      expect([...after.rgba.subarray(0, 8)]).toEqual([0, 0, 0, 0, 0, 0, 0, 40]);
      expect(after.rgba.subarray(4)).toEqual(before.rgba.subarray(4));
    }
    expect(vi.mocked(writeFile).mock.calls.some(([path]) => String(path).includes('atlas_fonts_p000_summer.omit'))).toBe(false);
  });
});
