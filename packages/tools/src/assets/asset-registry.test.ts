import { describe, expect, it, vi } from 'vitest';
import { writeFile } from 'node:fs/promises';
import { ASSET_REGISTRY_SCHEMA_VERSION, buildAtlases, compactRegistryAsset } from '../build-atlas.js';

vi.mock('../build-backdrop-pages.js', () => ({ buildBackdropPages: vi.fn(async () => undefined) }));
vi.mock('node:fs/promises', async (original) => ({
  ...await original<typeof import('node:fs/promises')>(),
  mkdir: vi.fn(async () => undefined),
  readdir: vi.fn(async () => []),
  writeFile: vi.fn(async () => undefined),
}));
vi.mock('./load.js', () => ({
  workspaceRoot: new URL('file:///tmp/atlas-writer-contract/'),
  loadAssets: async () => [
    { name: 'system_missing_asset', category: 'tiles', size: [1, 1], anchor: [0, 0], frames: { base: [['a']] } },
    { name: 'marker_asset', category: 'tiles', size: [1, 1], anchor: [0, 0], frames: { base: [['a']] }, markerRamps: { accent: ['a'] } },
  ],
  loadPalette: async () => ({ name: 'test', colors: { a: '#ff0000' }, markerDefaults: {} }),
  readJson: async () => ({ required: [], spring: {}, summer: {}, autumn: {}, winter: {} }),
}));

const frame = { x: 0, y: 0, width: 16, height: 16, durationTicks: 0 };

describe('compact asset registry v4', () => {
  it('indexes every asset in marker v2 while retaining sparse pixel records', async () => {
    vi.mocked(writeFile).mockClear();
    await buildAtlases();
    const write = vi.mocked(writeFile).mock.calls.find(([path]) => String(path).endsWith('/atlas.markers.json'));
    expect(write).toBeDefined();
    const markers = JSON.parse(String(write?.[1])) as { schemaVersion: number; assetPages: Record<string, string>; assets: Record<string, unknown> };
    expect(markers.schemaVersion).toBe(2);
    expect(markers.assetPages).toEqual({ marker_asset: 'tiles:p000', system_missing_asset: 'tiles:p000' });
    expect(Object.keys(markers.assets)).toEqual(['marker_asset']);
  });
  it('versions and separates animations, variants, and states', () => {
    expect(ASSET_REGISTRY_SCHEMA_VERSION).toBe(4);
    expect(compactRegistryAsset('tile_test', {
      assetId: 7,
      category: 'tiles',
      pageId: 'tiles:p000',
      tags: [],
      placement: { builderAvailable: false },
      animations: { shimmer: [{ ...frame, durationTicks: 10 }] },
      animationMeta: { shimmer: { fps: 6, loop: false } },
      variants: { base: [frame, frame] },
      variantMeta: { base: { topology: 'blob47' } },
      states: { depleted: frame },
    })).toMatchObject({
      pageId: 'tiles:p000',
      animations: { shimmer: { frameCount: 1, fps: 6, loop: false } },
      variants: { base: { frameCount: 2, topology: 'blob47' } },
      states: ['depleted'],
      placement: { builderAvailable: false },
    });
  });
});
