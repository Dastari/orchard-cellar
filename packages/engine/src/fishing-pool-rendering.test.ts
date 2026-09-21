import { readFileSync } from 'node:fs';
import { bootstrapContentRegistry } from '@orchard/sim';
import type { LoadedAsset } from '@orchard/ui';
import { expect, it, vi } from 'vitest';
import { drawAuthoredResourceVisual, type OverworldArt } from './overworld-art.js';

it('draws and animates fishing pools using the shipped fish sprite animation', () => {
  const sprite = JSON.parse(readFileSync(new URL('../../assets/props/nature_cf_fish_shadow_01.sprite.json', import.meta.url), 'utf8')) as {
    name: string; anchor: [number, number]; size: [number, number]; frames: Record<string, string[][]>;
  };
  const animations = Object.fromEntries(Object.entries(sprite.frames).map(([name, frames]) => [
    name, frames.map((_, index) => ({ x: index * 16, y: 0, width: 16, height: 16, durationTicks: 1 })),
  ]));
  const asset: LoadedAsset = {
    assetId: 1, atlasRevision: 1, collision: [], tags: [],
    placement: { layer: 'ground', footprint: [1, 1], blocksMovement: false, builderAvailable: false },
    name: sprite.name, image: {} as CanvasImageSource, anchor: sprite.anchor,
    metadata: { image: 'fish.png', animations, states: {} },
  };
  const art = {
    hearthResources: {}, fruitTrees: {}, poiDecorations: {},
    natureDecorations: { nature_fish_shadow: [asset] },
  } as unknown as OverworldArt;
  const context = { drawImage: vi.fn(), save: vi.fn(), restore: vi.fn() } as unknown as CanvasRenderingContext2D;
  const visual = bootstrapContentRegistry().resources.get('resource:fish_pool')!.visual;
  for (let index = 0; index < animations.sway!.length; index++) {
    drawAuthoredResourceVisual(context, art, visual, 'mature', 40, 48, 0, 0, 2, 'mixed', 1, index);
    expect(context.drawImage).toHaveBeenLastCalledWith(asset.image, index * 16, 0, 16, 16, 64, 66, 32, 32);
  }
  expect(context.drawImage).toHaveBeenCalledTimes(animations.sway!.length);
  vi.mocked(context.drawImage).mockClear();
  drawAuthoredResourceVisual(context, art, visual, 'depleted', 40, 48, 0, 0, 2);
  expect(context.drawImage).not.toHaveBeenCalled();
});
