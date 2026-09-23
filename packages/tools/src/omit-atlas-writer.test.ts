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
    { name: 'prop_cf_test_declared', category: 'props', size: [1, 1], anchor: [0, 0], frames: { base: [['s']] }, bakedShadowColor: '#00000028' },
    { name: 'system_missing_asset', category: 'ui', size: [1, 1], anchor: [0, 0], frames: { base: [['s']] } },
    { name: 'prop_cf_test_undeclared', category: 'props', size: [1, 1], anchor: [0, 0], frames: { base: [['s']] } },
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
    const index = JSON.parse(String(output('atlas.packs-review.json'))) as { schemaVersion: number; omitAtlases: Record<string, string>; atlases: Record<string, string> };
    expect(index.schemaVersion).toBe(5);
    expect(Object.keys(index.omitAtlases)).toEqual(['props:props-test:p000:spring', 'props:props-test:p000:summer', 'props:props-test:p000:autumn', 'props:props-test:p000:winter']);
    for (const season of ['spring', 'summer', 'autumn', 'winter']) {
      const key = `props:props-test:p000:${season}`;
      expect(index.omitAtlases[key]).toMatch(/^atlas-[a-f0-9]{64}\.png$/);
      const before = decodePng(output(index.atlases[key]!) as Buffer);
      const after = decodePng(output(index.omitAtlases[key]!) as Buffer);
      expect([after.width, after.height]).toEqual([before.width, before.height]);
      expect([...before.rgba.subarray(0, 8)]).toEqual([0, 0, 0, 40, 0, 0, 0, 40]);
      expect([...after.rgba.subarray(0, 8)]).toEqual([0, 0, 0, 0, 0, 0, 0, 40]);
      expect(after.rgba.subarray(4)).toEqual(before.rgba.subarray(4));
    }
    expect(vi.mocked(writeFile).mock.calls.some(([path]) => String(path).includes('atlas_fonts_p000_summer.omit'))).toBe(false);
  });
});
