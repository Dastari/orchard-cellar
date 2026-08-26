import { describe, expect, it } from 'vitest';
import type { LoadedAsset } from './assets.js';
import { drawFarmSoil, drawFarmTileReticle, drawInsetGround, farmSoilFrameIndex, farmSoilKey } from './farmland.js';

const frame = { x: 0, y: 0, width: 16, height: 16, durationTicks: 0 };

function soilAsset(image: CanvasImageSource): LoadedAsset {
  return {
    assetId: 1,
    name: 'soil',
    image,
    anchor: [0, 0],
    collision: [],
    tags: [],
    placement: { layer: 'ground', footprint: [1, 1], blocksMovement: false, builderAvailable: false },
    atlasRevision: 1,
    metadata: { image: 'soil.png', animations: {}, variants: { base: Array.from({ length: 47 }, () => frame) } },
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
    )).toBe(4);
    expect(drawnImages).toEqual([dryImage, wetImage, grassImage, grassImage]);
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
    )).toBe(3);
    expect(drawnImages).toEqual([pathImage, grassImage, grassImage]);
  });

  it('renders blocked tile targets with the red placement ramp', () => {
    let fillStyle = '';
    const fills: string[] = [];
    const context = {
      get fillStyle() { return fillStyle; },
      set fillStyle(value: string | CanvasGradient | CanvasPattern) { fillStyle = String(value); },
      fillRect: () => fills.push(fillStyle),
    } as unknown as CanvasRenderingContext2D;

    drawFarmTileReticle(context, 2, 3, 0, 0, 1, false);
    expect(fills).toContain('#e33f55');
    expect(fills).toContain('#ff93a0');
    expect(fills).not.toContain('#f7c94b');
  });
});
