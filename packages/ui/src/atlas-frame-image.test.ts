import { afterEach, describe, expect, it, vi } from 'vitest';
import { isolatedAtlasFrameImage } from './atlas-frame-image.js';

// These doubles verify cache/copy contracts only. Actual sampling and visual
// isolation are covered by the browser regression at fractional render scales.
function canvasEnvironment() {
  const contexts: { imageSmoothingEnabled: boolean; drawImage: ReturnType<typeof vi.fn> }[] = [];
  const createElement = vi.fn(() => {
    const context = { imageSmoothingEnabled: true, drawImage: vi.fn() };
    contexts.push(context);
    return { width: 0, height: 0, getContext: vi.fn(() => context) };
  });
  vi.stubGlobal('document', { createElement });
  return { createElement, contexts };
}

afterEach(() => vi.unstubAllGlobals());

describe('isolated atlas frame images', () => {
  it('copies exactly one native frame without smoothing and reuses it across repeated draws', () => {
    const { createElement, contexts } = canvasEnvironment();
    const image = {} as HTMLImageElement;
    const source = { x: 272, y: 48, width: 16, height: 16 };
    const isolated = isolatedAtlasFrameImage(image, source);
    expect(isolated).toMatchObject({ width: 16, height: 16 });
    expect(contexts[0]?.imageSmoothingEnabled).toBe(false);
    expect(contexts[0]?.drawImage).toHaveBeenCalledExactlyOnceWith(image, 272, 48, 16, 16, 0, 0, 16, 16);
    for (let draw = 0; draw < 100; draw += 1) expect(isolatedAtlasFrameImage(image, { ...source })).toBe(isolated);
    expect(createElement).toHaveBeenCalledExactlyOnceWith('canvas');
    expect(contexts[0]?.drawImage).toHaveBeenCalledTimes(1);
  });

  it('isolates different rectangles and replacement atlas image identities', () => {
    const { createElement, contexts } = canvasEnvironment();
    const image = {} as HTMLImageElement;
    const replacement = {} as HTMLImageElement;
    const source = { x: 16, y: 32, width: 16, height: 32 };
    const first = isolatedAtlasFrameImage(image, source);
    const results = [
      isolatedAtlasFrameImage(image, { ...source, x: 32 }),
      isolatedAtlasFrameImage(image, { ...source, y: 48 }),
      isolatedAtlasFrameImage(image, { ...source, width: 32 }),
      isolatedAtlasFrameImage(image, { ...source, height: 16 }),
      isolatedAtlasFrameImage(replacement, source),
    ];
    expect(new Set([first, ...results]).size).toBe(6);
    expect(createElement).toHaveBeenCalledTimes(6);
    expect(contexts.every(({ drawImage }) => drawImage.mock.calls.length === 1)).toBe(true);
    expect(isolatedAtlasFrameImage(replacement, { ...source })).toBe(results[4]);
    expect(createElement).toHaveBeenCalledTimes(6);
  });

  it('returns null without a DOM or a 2D context and never caches an unusable canvas', () => {
    const image = {} as HTMLImageElement;
    const source = { x: 0, y: 0, width: 16, height: 16 };
    vi.stubGlobal('document', undefined);
    expect(isolatedAtlasFrameImage(image, source)).toBeNull();
    const createElement = vi.fn(() => ({ width: 0, height: 0, getContext: () => null }));
    vi.stubGlobal('document', { createElement });
    expect(isolatedAtlasFrameImage(image, source)).toBeNull();
    expect(isolatedAtlasFrameImage(image, source)).toBeNull();
    expect(createElement).toHaveBeenCalledTimes(2);
    const working = canvasEnvironment();
    expect(isolatedAtlasFrameImage(image, source)).not.toBeNull();
    expect(working.createElement).toHaveBeenCalledTimes(1);
  });
});
