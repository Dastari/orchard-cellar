import { afterEach, describe, expect, it, vi } from 'vitest';
import { BoundedAssetRequestQueue } from './asset-request-queue.js';
import { loadHtmlImage } from './html-image.js';

class ControlledImage {
  static readonly instances: ControlledImage[] = [];
  onload: ((event: Event) => void) | null = null;
  onerror: ((event: Event | string) => void) | null = null;
  complete = false;
  naturalWidth = 0;
  #src = '';

  constructor() { ControlledImage.instances.push(this); }
  get src(): string { return this.#src; }
  set src(value: string) { this.#src = value; }
}

describe('deadline-aware HTML image loading', () => {
  afterEach(() => {
    ControlledImage.instances.length = 0;
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('times out, aborts event ownership, and releases its bounded queue slot', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('Image', ControlledImage);
    const queue = new BoundedAssetRequestQueue(1, 0);
    const stuck = queue.run(async () => await loadHtmlImage('/stuck.png', 'stuck image', 25));
    const lateLoad = ControlledImage.instances[0]?.onload;
    const next = queue.run(async () => 'next request ran');
    const rejection = expect(stuck).rejects.toThrow('stuck image timed out after 25ms');

    await vi.advanceTimersByTimeAsync(25);
    await rejection;
    await expect(next).resolves.toBe('next request ran');
    expect(queue.active).toBe(0);
    expect(ControlledImage.instances[0]).toMatchObject({ src: '', onload: null, onerror: null });
    expect(() => lateLoad?.(new Event('load'))).not.toThrow();
  });

  it('resolves a synchronously complete cached image without awaiting a load event', async () => {
    class CachedImage extends ControlledImage {
      override set src(value: string) {
        super.src = value;
        this.complete = true;
        this.naturalWidth = 32;
      }
      override get src(): string { return super.src; }
    }
    vi.stubGlobal('Image', CachedImage);

    await expect(loadHtmlImage('/cached.png', 'cached image', 25))
      .resolves.toMatchObject({ src: '/cached.png', naturalWidth: 32 });
  });

  it('rejects invalid deadlines before constructing an image', () => {
    vi.stubGlobal('Image', ControlledImage);
    expect(() => loadHtmlImage('/asset.png', 'asset', 0))
      .toThrow('html_image_timeout_must_be_positive');
    expect(ControlledImage.instances).toHaveLength(0);
  });
});
