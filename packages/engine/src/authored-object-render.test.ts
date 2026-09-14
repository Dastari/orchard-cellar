import { describe, expect, it, vi } from 'vitest';
import type { LoadedAsset } from '@orchard/ui';
import { drawAuthoredOverworldObject } from './overworld-art.js';

const asset = {
  image: {}, anchor: [8, 15],
  metadata: {
    image: 'objects.png',
    animations: { burn: [{ x: 32, y: 16, width: 16, height: 24, durationTicks: 1 }] },
  },
} as unknown as LoadedAsset;

describe('authored object rendering', () => {
  it('draws the selected authored animation with world anchoring and scale', () => {
    const drawImage = vi.fn();
    const context = { drawImage } as unknown as CanvasRenderingContext2D;
    expect(drawAuthoredOverworldObject(
      context, asset, 'burn', 0, 40, 64, 8, 16, 2, 0.5,
    )).toBe(true);
    expect(drawImage).toHaveBeenCalledWith(
      asset.image, 32, 16, 16, 24,
      56, 81, 16, 24,
    );
  });

  it('returns false so callers can retain compiled art when a state is missing', () => {
    const drawImage = vi.fn();
    expect(drawAuthoredOverworldObject(
      { drawImage } as unknown as CanvasRenderingContext2D,
      asset, 'missing', 0, 0, 0, 0, 0, 1,
    )).toBe(false);
    expect(drawImage).not.toHaveBeenCalled();
  });

  it('draws the press body once with only a matching contents layer at the same anchor', () => {
    const press = {
      ...asset,
      name: 'prop_basket_press',
      anchor: [16, 31],
      metadata: {
        image: 'props.png', animations: {},
        states: {
          base: { x: 0, y: 0, width: 32, height: 32, durationTicks: 1 },
          contents_pear: { x: 32, y: 0, width: 32, height: 32, durationTicks: 1 },
        },
      },
    } as LoadedAsset;
    const drawImage = vi.fn();
    const context = { drawImage } as unknown as CanvasRenderingContext2D;
    expect(drawAuthoredOverworldObject(context, press, 'base', 0, 40, 64, 8, 16, 2, 1, 'contents_pear')).toBe(true);
    expect(drawImage.mock.calls).toEqual([
      [press.image, 0, 0, 32, 32, 32, 34, 64, 64],
      [press.image, 32, 0, 32, 32, 32, 34, 64, 64],
    ]);
    drawImage.mockClear();
    drawAuthoredOverworldObject(context, press, 'base', 0, 40, 64, 8, 16, 2);
    expect(drawImage).toHaveBeenCalledTimes(1);
    drawImage.mockClear();
    drawAuthoredOverworldObject(context, press, 'base', 0, 40, 64, 8, 16, 2, 1, 'contents_missing');
    expect(drawImage).toHaveBeenCalledTimes(1);
  });
});
