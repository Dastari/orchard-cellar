import { afterEach, describe, expect, it, vi } from 'vitest';
import { type LoadedAsset } from '@orchard/ui';
import { drawAuthoredOverworldObject, drawUiAsset } from './overworld-art.js';
import { inheritWorldAssetPresentation, setWorldAssetPresentation, worldAssetFrameSource, worldAssetPresentationKey } from './world-asset-presentation.js';
import { createSpriteLightOccluder, resetSpriteLightMasks } from './light-occlusion.js';

const frame = { x: 4, y: 8, width: 2, height: 1, durationTicks: 0 };
const asset: LoadedAsset = { assetId: 58, atlasRevision: 1, name: 'test_shadow', image: {} as CanvasImageSource,
  anchor: [1, 1], collision: [], tags: [], placement: { layer: 'canopy', footprint: [1, 1], blocksMovement: false, builderAvailable: false },
  metadata: { image: 'test.png', animations: {}, states: { base: frame } },
  bakedShadow: { color: '#000000c8', frames: { base: [{ width: 2, height: 1, pixelCount: 1, spans: [0, 1, 1] }] } } };

afterEach(() => { vi.unstubAllGlobals(); resetSpriteLightMasks(); });

describe('world-only shadow presentation', () => {
  it('shares committed page intent with chunks and resolves reset without retaining an omit bitmap', () => {
    const original = asset.image, omit = {} as CanvasImageSource;
    let selected = omit;
    const pages = { revision: 1, source: () => selected };
    const world = {} as CanvasRenderingContext2D, chunk = {} as CanvasRenderingContext2D;
    setWorldAssetPresentation(world, pages, 'omit-baked-shadow');
    inheritWorldAssetPresentation(world, chunk);
    const key = worldAssetPresentationKey(chunk);
    const descriptor = worldAssetFrameSource(chunk, asset, frame)!;
    expect(descriptor.image).toBe(omit);
    expect(worldAssetFrameSource(chunk, asset, frame)).toBe(descriptor);
    // The retired chunk descriptor only calls the cohort; it owns no image.
    selected = original; pages.revision++;
    expect(descriptor.image).toBe(original);
    expect(worldAssetPresentationKey(chunk)).not.toBe(key);
    setWorldAssetPresentation(world);
    inheritWorldAssetPresentation(world, chunk);
    expect(worldAssetPresentationKey(chunk)).toBe('original');
    expect(worldAssetFrameSource(chunk, asset, frame)?.image).toBe(original);
  });

  it('draws whole-page coordinates at the same anchor while UI keeps original art without allocating surfaces', () => {
    const create = vi.fn(() => { throw new Error('Unexpected runtime frame surface'); });
    vi.stubGlobal('document', { createElement: create });
    const omit = {} as CanvasImageSource;
    const pages = { revision: 1, source: () => omit };
    const context = { drawImage: vi.fn() } as unknown as CanvasRenderingContext2D;
    setWorldAssetPresentation(context, pages, 'omit-baked-shadow');
    for (let i = 0; i < 600; i++) drawAuthoredOverworldObject(context, asset, 'base', 0, 20, 30, 0, 0, 2);
    expect(context.drawImage).toHaveBeenLastCalledWith(omit, 4, 8, 2, 1, 38, 58, 4, 2);
    drawUiAsset(context, asset, 0, 0, 2);
    expect(context.drawImage).toHaveBeenLastCalledWith(asset.image, 4, 8, 2, 1, 0, 0, 4, 2);
    setWorldAssetPresentation(context);
    drawAuthoredOverworldObject(context, asset, 'base', 0, 20, 30, 0, 0, 2);
    expect(context.drawImage).toHaveBeenLastCalledWith(asset.image, 4, 8, 2, 1, 38, 58, 4, 2);
    expect(create).not.toHaveBeenCalled();
  });

  it('excludes declared shadows above the old alpha threshold and keys masks by actual image', () => {
    const readback = vi.fn(() => ({ data: new Uint8ClampedArray([10, 20, 30, 255, 0, 0, 0, 200]) }));
    vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => ({ drawImage: vi.fn(), getImageData: readback }) }) });
    expect(createSpriteLightOccluder(asset, 'base', 0, 20, 30)?.opaque).toEqual(new Uint8Array([1, 0]));
    createSpriteLightOccluder(asset, 'base', 0, 25, 30);
    expect(readback).toHaveBeenCalledOnce();
    expect(createSpriteLightOccluder(asset, 'base', 0, 20, 30, 'original')?.opaque).toEqual(new Uint8Array([1, 1]));
    createSpriteLightOccluder({ ...asset, image: {} as CanvasImageSource }, 'base', 0, 20, 30);
    expect(readback).toHaveBeenCalledTimes(3);
  });
});
