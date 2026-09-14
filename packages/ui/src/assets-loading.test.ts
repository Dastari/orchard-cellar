import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadGeneratedAsset } from './assets.js';

class ControlledImage {
  static readonly instances: ControlledImage[] = [];
  onload: ((event: Event) => void) | null = null;
  onerror: ((event: Event | string) => void) | null = null;
  complete = false;
  naturalWidth = 0;
  src = '';

  constructor() { ControlledImage.instances.push(this); }
}

describe('generated atlas image recovery', () => {
  afterEach(() => {
    ControlledImage.instances.length = 0;
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('evicts a timed-out atlas image promise and permits a clean retry', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    vi.stubGlobal('Image', ControlledImage);
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        schemaVersion: 1,
        revision: 'test-revision',
        revisionId: 1,
        placeholderAssetId: 1,
        atlases: { 'props:summer': 'atlas_props_summer.png' },
        assetsById: { '1': 'test_asset' },
        assets: {
          test_asset: {
            assetId: 1,
            category: 'props',
            anchor: [0, 0],
            collision: [],
            animations: {},
            animationMeta: {},
            variants: {},
            variantMeta: {},
            states: { base: { x: 0, y: 0, width: 1, height: 1 } },
            tags: [],
            placement: {
              layer: 'object', footprint: [1, 1], blocksMovement: false, builderAvailable: false,
            },
          },
        },
      }),
    })));

    const first = loadGeneratedAsset('test_asset');
    const rejection = expect(first).rejects.toThrow(
      'atlas image atlas_props_summer.png timed out after 15000ms',
    );
    await vi.advanceTimersByTimeAsync(15_040);
    await rejection;
    expect(ControlledImage.instances).toHaveLength(1);
    expect(ControlledImage.instances[0]?.src).toBe('');

    const retry = loadGeneratedAsset('test_asset');
    await vi.advanceTimersByTimeAsync(0);
    const retryImage = ControlledImage.instances[1]!;
    retryImage.naturalWidth = 1;
    retryImage.onload?.(new Event('load'));

    await expect(retry).resolves.toMatchObject({ name: 'test_asset', image: retryImage });
  });
});
