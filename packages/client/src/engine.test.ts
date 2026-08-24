import { describe, expect, it, vi } from 'vitest';
import { FixedStepAccumulator } from './loop.js';
import { Camera } from './render/camera.js';
import { parseAtlasMetadata, sortByY, SpriteAnimator, type YSortableSprite } from './render/sprite.js';
import { SceneStack, type Scene } from './scenes/scene.js';
import { createPlaceholderTileMap } from './render/tilemap.js';
import { createPlaceholderCollisionMap } from '@orchard/sim';

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
  });

  it('clamps a following camera to world bounds', () => {
    const camera = new Camera(100, 80, 300, 240);
    camera.follow(-20, -20);
    expect([camera.x, camera.y]).toEqual([0, 0]);
    camera.follow(500, 500);
    expect([camera.x, camera.y]).toEqual([200, 160]);
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

  it('updates only the focused scene and renders the full stack', () => {
    const calls: string[] = [];
    const makeScene = (name: string): Scene => ({
      update: () => calls.push(`update:${name}`),
      render: () => calls.push(`render:${name}`),
    });
    const stack = new SceneStack();
    stack.push(makeScene('base'));
    stack.push(makeScene('modal'));
    stack.update();
    stack.render({} as CanvasRenderingContext2D, 0);
    expect(calls).toEqual(['update:modal', 'render:base', 'render:modal']);
  });

  it('builds independent data-driven ground, detail, and canopy layers', () => {
    const map = createPlaceholderTileMap(createPlaceholderCollisionMap(48, 32));
    expect(map.layers.map((layer) => layer.name)).toEqual(['ground', 'detail', 'canopy']);
    expect(map.layers.every((layer) => layer.tiles.length === 48 * 32)).toBe(true);
    expect(map.layers[1]?.tiles.some((tile) => tile !== 0)).toBe(true);
    expect(map.layers[2]?.tiles.every((tile) => tile === 0)).toBe(true);
  });
});
