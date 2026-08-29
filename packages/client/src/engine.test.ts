import { describe, expect, it, vi } from 'vitest';
import { FixedStepAccumulator } from './loop.js';
import { Camera } from './render/camera.js';
import { parseAtlasMetadata, sortByY, SpriteAnimator, type YSortableSprite } from './render/sprite.js';

const metadata = parseAtlasMetadata({
  image: 'test.png',
  animations: {
    idle: [{ x: 0, y: 0, width: 16, height: 16, durationTicks: 2 }],
    walk: [
      { x: 0, y: 0, width: 16, height: 16, durationTicks: 2 },
      { x: 16, y: 0, width: 16, height: 16, durationTicks: 2 },
    ],
  },
});

describe('engine logic', () => {
  it('runs fixed updates and returns render interpolation', () => {
    const accumulator = new FixedStepAccumulator(1 / 60);
    const update = vi.fn();
    const alpha = accumulator.advance(2.5 / 60, update);
    expect(update).toHaveBeenCalledTimes(2);
    expect(alpha).toBeCloseTo(0.5);
  });

  it('clamps long frames to the catch-up ceiling', () => {
    const accumulator = new FixedStepAccumulator(1 / 60);
    const update = vi.fn();
    accumulator.advance(2, update);
    expect(update).toHaveBeenCalledTimes(15);
    expect(accumulator.lastUpdateSteps).toBe(15);
    expect(accumulator.lastDiscardedSeconds).toBe(1.75);
  });

  it('clamps a following camera to world bounds', () => {
    const camera = new Camera(100, 80, 300, 240);
    camera.follow(-20, -20);
    expect([camera.x, camera.y]).toEqual([0, 0]);
    camera.follow(500, 500);
    expect([camera.x, camera.y]).toEqual([200, 160]);
  });

  it('centers a world that is smaller than the zoomed-out viewport', () => {
    const camera = new Camera(400, 300, 320, 240);
    camera.follow(160, 120);
    expect([camera.x, camera.y]).toEqual([-40, -30]);
  });

  it('advances atlas frames at metadata cadence and resets animations', () => {
    const animator = new SpriteAnimator(metadata, 'walk');
    animator.update();
    expect(animator.getFrame()?.x).toBe(0);
    animator.update();
    expect(animator.getFrame()?.x).toBe(16);
    animator.setAnimation('idle');
    expect(animator.getFrame()?.x).toBe(0);
    animator.setAnimation('walk');
    animator.update();
    animator.update();
    animator.reset();
    expect(animator.getFrame()?.x).toBe(0);
  });

  it('sorts dynamic sprites by their feet', () => {
    const draw = (): void => undefined;
    const sprites: YSortableSprite[] = [{ y: 9, draw }, { y: 2, draw }, { y: 5, draw }];
    expect(sortByY(sprites).map((sprite) => sprite.y)).toEqual([2, 5, 9]);
  });

});
