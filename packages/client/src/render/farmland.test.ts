import { describe, expect, it } from 'vitest';
import type { LoadedAsset } from './assets.js';
import { drawFarmSoil, drawInteractionTileReticle, drawInsetGround, farmSoilFrameIndex, farmSoilKey } from './farmland.js';

const frame = { x: 0, y: 0, width: 16, height: 16, durationTicks: 0 };

function soilAsset(image: CanvasImageSource, distinctFrames = false): LoadedAsset {
  return {
    assetId: 1,
    name: 'soil',
    image,
    anchor: [0, 0],
    collision: [],
    tags: [],
    placement: { layer: 'ground', footprint: [1, 1], blocksMovement: false, builderAvailable: false },
    atlasRevision: 1,
    metadata: { image: 'soil.png', animations: {}, variants: { base: Array.from(
      { length: 47 },
      (_, index) => distinctFrames ? { ...frame, x: index * 16 } : frame,
    ) } },
  };
}

function occupied(points: readonly (readonly [number, number])[]): Set<string> {
  return new Set(points.map(([x, y]) => farmSoilKey(x, y)));
}

describe('dynamic farmland autotiling', () => {
  it('joins isolated, horizontal, and vertical rows deterministically', () => {
    expect(farmSoilFrameIndex({ tileX: 5, tileY: 5 }, occupied([[5, 5]]))).toBe(0);
    const horizontal = occupied([[4, 5], [5, 5], [6, 5]]);
    expect(farmSoilFrameIndex({ tileX: 4, tileY: 5 }, horizontal)).toBe(2);
    expect(farmSoilFrameIndex({ tileX: 5, tileY: 5 }, horizontal)).toBe(16);
    expect(farmSoilFrameIndex({ tileX: 6, tileY: 5 }, horizontal)).toBe(13);
    const vertical = occupied([[5, 4], [5, 5], [5, 6]]);
    expect(farmSoilFrameIndex({ tileX: 5, tileY: 4 }, vertical)).toBe(5);
    expect(farmSoilFrameIndex({ tileX: 5, tileY: 5 }, vertical)).toBe(6);
    expect(farmSoilFrameIndex({ tileX: 5, tileY: 6 }, vertical)).toBe(1);
  });

  it('selects the fully joined centre for a 3x3 plot regardless of moisture', () => {
    const plot = occupied(Array.from({ length: 9 }, (_, index) => [index % 3, Math.floor(index / 3)] as const));
    expect(farmSoilFrameIndex({ tileX: 1, tileY: 1 }, plot)).toBe(46);
  });

  it('recomputes adjoining frames after a soil row is removed', () => {
    const row = occupied([[4, 5], [5, 5], [6, 5]]);
    expect(farmSoilFrameIndex({ tileX: 5, tileY: 5 }, row)).toBe(16);
    row.delete(farmSoilKey(6, 5));
    expect(farmSoilFrameIndex({ tileX: 5, tileY: 5 }, row)).toBe(13);
  });

  it('composes the transparent wet centre over the dry tile border', () => {
    const dryImage = {} as CanvasImageSource;
    const wetImage = {} as CanvasImageSource;
    const grassImage = {} as CanvasImageSource;
    const drawnImages: CanvasImageSource[] = [];
    const context = {
      imageSmoothingEnabled: true,
      drawImage: (image: CanvasImageSource) => drawnImages.push(image),
    } as unknown as CanvasRenderingContext2D;

    expect(drawFarmSoil(
      context,
      soilAsset(dryImage),
      soilAsset(wetImage),
      soilAsset(grassImage),
      [{ tileX: 0, tileY: 0, watered: true }],
      0,
      0,
      1,
      32,
      32,
    )).toBe(2);
    expect(drawnImages).toEqual([dryImage, wetImage]);
  });

  it('autotiles moisture against watered neighbours rather than every tilled tile', () => {
    const dryImage = {} as CanvasImageSource;
    const wetImage = {} as CanvasImageSource;
    const grassImage = {} as CanvasImageSource;
    const draws: unknown[][] = [];
    const context = {
      imageSmoothingEnabled: true,
      drawImage: (...args: unknown[]) => draws.push(args),
    } as unknown as CanvasRenderingContext2D;
    const tiles = Array.from({ length: 9 }, (_, index) => ({
      tileX: index % 3,
      tileY: Math.floor(index / 3),
      watered: index === 4,
    }));

    drawFarmSoil(
      context,
      soilAsset(dryImage, true),
      soilAsset(wetImage, true),
      soilAsset(grassImage, true),
      tiles,
      0,
      0,
      1,
      48,
      48,
    );

    const dryCentre = draws.find((call) => call[0] === dryImage && call[5] === 16 && call[6] === 16);
    const wetCentre = draws.find((call) => call[0] === wetImage);
    expect(dryCentre?.[1]).toBe(46 * 16);
    expect(wetCentre?.[1]).toBe(0);
  });

  it('uses the same inset topology for authored paths without a wet layer', () => {
    const pathImage = {} as CanvasImageSource;
    const grassImage = {} as CanvasImageSource;
    const drawnImages: CanvasImageSource[] = [];
    const context = {
      imageSmoothingEnabled: true,
      drawImage: (image: CanvasImageSource) => drawnImages.push(image),
    } as unknown as CanvasRenderingContext2D;

    expect(drawInsetGround(
      context,
      soilAsset(pathImage),
      soilAsset(grassImage),
      [{ tileX: 0, tileY: 0 }],
      0,
      0,
      1,
      32,
      32,
    )).toBe(1);
    expect(drawnImages).toEqual([pathImage]);
  });

  it('fits the authored selector around the shared tool and placement tile', () => {
    const selectorImage = {} as CanvasImageSource;
    const draws: unknown[][] = [];
    const context = {
      drawImage: (...args: unknown[]) => draws.push(args),
    } as unknown as CanvasRenderingContext2D;
    const selector = {
      ...soilAsset(selectorImage),
      metadata: { image: 'selector.png', animations: {}, variants: { idle: [{ x: 0, y: 0, width: 48, height: 48, durationTicks: 0 }] } },
    } satisfies LoadedAsset;

    drawInteractionTileReticle(context, selector, 2, 3, 0, 0, 1);
    expect(draws).toEqual([[selectorImage, 0, 0, 48, 48, 26, 42, 28, 28]]);
  });
});
