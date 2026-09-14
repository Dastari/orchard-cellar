import { afterEach, describe, expect, it, vi } from 'vitest';

const loadGeneratedAsset = vi.hoisted(() => vi.fn(async (name: string) => ({ name })));
vi.mock('./assets.js', () => ({ loadGeneratedAsset }));

import { loadGameplayUiSkin, loadUiIconSet } from './skin.js';

class ControlledImage {
  static readonly instances: ControlledImage[] = [];
  onload: ((event: Event) => void) | null = null;
  onerror: ((event: Event | string) => void) | null = null;
  complete = false;
  naturalWidth = 0;
  src = '';

  constructor() { ControlledImage.instances.push(this); }
}

describe('UI skin loading boundaries', () => {
  afterEach(() => {
    ControlledImage.instances.length = 0;
    loadGeneratedAsset.mockClear();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('builds the gameplay skin without constructing any Lucide image', async () => {
    class ForbiddenImage { constructor() { throw new Error('lucide_not_allowed'); } }
    vi.stubGlobal('Image', ForbiddenImage);

    const skin = await loadGameplayUiSkin();

    expect(skin.icons).toBeUndefined();
    expect(loadGeneratedAsset).toHaveBeenCalled();
  });

  it('evicts a timed-out scoped icon promise so Studio can retry it', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('Image', ControlledImage);
    const first = loadUiIconSet(['undo'] as const, 10);
    const rejection = expect(first).rejects.toThrow('UI icon undo timed out after 10ms');
    await vi.advanceTimersByTimeAsync(10);
    await rejection;

    const retry = loadUiIconSet(['undo'] as const, 10);
    await vi.advanceTimersByTimeAsync(30);
    const retryImage = ControlledImage.instances[1]!;
    retryImage.naturalWidth = 24;
    retryImage.onload?.(new Event('load'));

    await expect(retry).resolves.toMatchObject({ undo: { image: retryImage, width: 24, height: 24 } });
  });
});
