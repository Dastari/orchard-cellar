import { describe, expect, it, vi } from 'vitest';
import { createCanvas } from '@napi-rs/canvas';
import { bootstrapContentRegistry, runtimeCreaturePresentation } from '@orchard/sim';
import { drawAuthoredOverworldWildlife, type OverworldArt } from '@orchard/engine/overworld-art';
import { cameraAxisOffset } from '@orchard/engine/camera';
import { worldPassLayout } from '@orchard/engine/renderer';
import { snapRectForContext, type LoadedAsset } from '@orchard/ui';
import { snapGameplayCamera } from './gameplay-camera.js';

const frame = { x: 0, y: 0, width: 32, height: 32, durationTicks: 1 };
const cow = {
  image: {}, anchor: [16, 31],
  metadata: { animations: { sleep_side: [frame], rest_side: [frame], idle_side: [frame] } },
} as unknown as LoadedAsset;
const art = { wildlife: { cow: [cow] }, missingItem: cow } as unknown as OverworldArt;
const presentation = runtimeCreaturePresentation(bootstrapContentRegistry(), 'cow')!;

describe('gameplay camera raster alignment', () => {
  it.each([1, 2, 3, 4, 6])('keeps resting and sleeping animals fixed to terrain at pass scale %s', scale => {
    // Real authority coordinates have sixteenth-pixel precision. At 1x/zoom 2
    // independent rounding makes this stationary cow slip two screen pixels.
    const x = 100532 / 16, y = 118436 / 16;
    const context = createCanvas(1, 1).getContext('2d') as unknown as CanvasRenderingContext2D;
    let drawnX = 0, drawnY = 0;
    vi.spyOn(context, 'drawImage').mockImplementation((...args: unknown[]) => {
      const transform = context.getTransform();
      drawnX = transform.a * Number(args[5]) + transform.e;
      drawnY = transform.d * Number(args[6]) + transform.f;
    });
    for (const activity of ['rest', 'sleep']) for (const facing of ['left', 'right'] as const) {
      const relativeX = new Set<number>(), relativeY = new Set<number>();
      for (let step = 0; step < 64; step++) {
        // Fractional diagonal camera travel, including reversals and ties.
        const offset = Math.sin(step / 8) * 2;
        const cameraX = snapGameplayCamera(6000 + offset, scale);
        const cameraY = snapGameplayCamera(7200 - offset, scale);
        const ground = snapRectForContext(context, {
          x: (6000 - cameraX) * scale, y: (7200 - cameraY) * scale,
          width: 256 * scale, height: 256 * scale,
        });
        drawAuthoredOverworldWildlife(context, art, presentation, 0, activity,
          x, y, facing, false, 0, cameraX, cameraY, scale);
        relativeX.add(drawnX - ground.x);
        relativeY.add(drawnY - ground.y);
      }
      expect(relativeX.size).toBe(1);
      expect(relativeY.size).toBe(1);
    }
  });

  it.each([
    [1, 2, '1x'], [1.25, 2.3, '2x'], [2, 1.5, 'native'], [1.25, 2.3, 'native'],
  ] as const)('uses world-pass pixels at DPR %s, zoom %s, policy %s', (dpr, zoom, policy) => {
    const { integerScale } = worldPassLayout(1280, 800, dpr, zoom, policy);
    const offset = cameraAxisOffset(100.37, 100, 1000);
    const snapped = snapGameplayCamera(offset, integerScale);
    expect(snapped * integerScale).toBeCloseTo(Math.round(offset * integerScale), 10);
    expect(Math.abs(snapped - offset)).toBeLessThanOrEqual(0.5 / integerScale);
  });

  it('retains sub-world-pixel camera motion at higher pass resolutions', () => {
    expect(snapGameplayCamera(50.25, 4)).toBe(50.25);
  });

  it('keeps clamped map edges and negative centred-map offsets aligned', () => {
    for (const target of [-50, 0, 2000]) {
      const offset = cameraAxisOffset(target, 100, 1000);
      expect(snapGameplayCamera(offset, 3)).toBe(offset);
    }
    expect(snapGameplayCamera(cameraAxisOffset(256, 801, 512), 2)).toBe(-144.5);
  });
});
