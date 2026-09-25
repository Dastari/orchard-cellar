import { describe, expect, it, vi } from 'vitest';
import type { TerrainArray } from '@orchard/engine';
import {
  MAP_EDITOR_OVERLAY_BUILD_CHUNK_TILES,
  MapEditorOverlayCache,
  drawActiveMapEditorOverlays,
  mapEditorCollisionOverlayPixels,
  mapEditorHeightOverlayPixels,
  mapEditorOverlayVisibleTileCount,
  type MapEditorOverlayImageTarget,
  type MapEditorOverlayScheduler,
} from './active-overlays.js';
import { cellFlags } from '@orchard/sim/cell-flags';

function terrainFixture(width = 20, height = 20): TerrainArray {
  const length = width * height;
  const elevations = new Int16Array(length);
  elevations[6 * width + 6] = 2;
  return {
    spaceId: 1,
    seed: 2,
    version: 3,
    width,
    height,
    generator: 'debug_flat',
    biomes: new Uint8Array(length),
    blocked: cellFlags(Array.from({ length }, (_value, index) => index % 7 === 0)),
    horseJumpableTerrain: new Uint8Array(length),
    elevations,
    terrainTransitions: [],
    raisedTerrainCollisionClassified: true,
    dirtCliffRoles: new Uint8Array(length),
    dirtTerraces: new Uint8Array(length),
  };
}

function drawingContext() {
  return {
    save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), rect: vi.fn(), clip: vi.fn(),
    drawImage: vi.fn(), fillRect: vi.fn(), imageSmoothingEnabled: true, fillStyle: '',
  } as unknown as CanvasRenderingContext2D;
}

interface ScheduledTask { readonly callback: () => void; cancelled: boolean }

class TestScheduler implements MapEditorOverlayScheduler {
  readonly tasks: ScheduledTask[] = [];

  schedule(callback: () => void): ScheduledTask {
    const task = { callback, cancelled: false };
    this.tasks.push(task);
    return task;
  }

  cancel(handle: unknown): void {
    (handle as ScheduledTask).cancelled = true;
  }

  flushOne(): boolean {
    const task = this.tasks.shift();
    if (task === undefined) return false;
    if (!task.cancelled) task.callback();
    return true;
  }

  flushAll(): void {
    while (this.flushOne()) { /* deterministic task drain */ }
  }
}

interface TestTarget extends MapEditorOverlayImageTarget {
  readonly pixels: Uint8ClampedArray;
  readonly writes: Array<{ readonly startY: number; readonly height: number }>;
  disposed: boolean;
}

function imageFactory(targets: TestTarget[] = []) {
  return vi.fn((width: number, height: number): MapEditorOverlayImageTarget => {
    const target: TestTarget = {
      image: {} as CanvasImageSource,
      pixels: new Uint8ClampedArray(width * height * 4),
      writes: [],
      disposed: false,
      writeRows(startY, rowWidth, rowCount, pixels) {
        this.writes.push({ startY, height: rowCount });
        this.pixels.set(pixels, startY * rowWidth * 4);
      },
      dispose() { this.disposed = true; },
    };
    targets.push(target);
    return target;
  });
}

describe('active Map Editor world overlays', () => {
  it('bounds detailed work to the clamped visible tile range', () => {
    const terrain = terrainFixture();
    const range = { minimumX: 4, minimumY: 5, maximumX: 9, maximumY: 11 };
    const context = drawingContext();
    const cache = new MapEditorOverlayCache(imageFactory());
    const visited = drawActiveMapEditorOverlays(
      context, terrain, terrain, range,
      { x: 0, y: 0, width: 200, height: 160 }, { x: 64, y: 80, zoom: 1 },
      0, { height: true, collision: true }, cache,
    );

    expect(visited).toBe(30);
    expect(mapEditorOverlayVisibleTileCount(terrain, range)).toBe(30);
    expect(vi.mocked(context.fillRect).mock.calls.length).toBeLessThanOrEqual(60);
    expect(context.drawImage).not.toHaveBeenCalled();
  });

  it('does no tile or cache work while overlays or terrain layers are hidden', () => {
    const terrain = terrainFixture();
    const context = drawingContext();
    const image = imageFactory();
    const cache = new MapEditorOverlayCache(image);
    const args = [
      context, terrain, terrain,
      { minimumX: 0, minimumY: 0, maximumX: 20, maximumY: 20 },
      { x: 0, y: 0, width: 200, height: 160 }, { x: 0, y: 0, zoom: 1 }, 0,
    ] as const;

    expect(drawActiveMapEditorOverlays(...args, { height: false, collision: false }, cache)).toBe(0);
    expect(drawActiveMapEditorOverlays(...args, { height: true, collision: true }, cache, false)).toBe(0);
    expect(context.save).not.toHaveBeenCalled();
    expect(image).not.toHaveBeenCalled();
  });

  it('uses retained semantic masks and visible-source blits below readable tile scale', () => {
    const terrain = terrainFixture(100, 80);
    const context = drawingContext();
    const image = imageFactory();
    const scheduler = new TestScheduler();
    const invalidate = vi.fn();
    const cache = new MapEditorOverlayCache(image, invalidate, scheduler);
    const visited = drawActiveMapEditorOverlays(
      context, terrain, terrain,
      { minimumX: 10, minimumY: 12, maximumX: 30, maximumY: 32 },
      { x: 0, y: 0, width: 100, height: 100 }, { x: 160, y: 192, zoom: 0.25 },
      0, { height: true, collision: true }, cache,
    );

    expect(visited).toBe(400);
    expect(context.fillRect).not.toHaveBeenCalled();
    expect(context.drawImage).not.toHaveBeenCalled();
    expect(image).toHaveBeenCalledTimes(2);

    scheduler.flushAll();
    drawActiveMapEditorOverlays(
      context, terrain, terrain,
      { minimumX: 10, minimumY: 12, maximumX: 30, maximumY: 32 },
      { x: 0, y: 0, width: 100, height: 100 }, { x: 160, y: 192, zoom: 0.25 },
      0, { height: true, collision: true }, cache,
    );
    expect(context.drawImage).toHaveBeenCalledTimes(2);
    expect(vi.mocked(context.drawImage).mock.calls[0]?.slice(1, 5)).toEqual([10, 12, 20, 20]);
    expect(invalidate).toHaveBeenCalledTimes(2);
  });

  it('caches exact masks per terrain/plane and releases retained targets on disposal', () => {
    const terrain = terrainFixture(4, 4);
    const targets: TestTarget[] = [];
    const image = imageFactory(targets);
    const scheduler = new TestScheduler();
    const cache = new MapEditorOverlayCache(image, undefined, scheduler);
    expect(cache.height(terrain, 0)).toBeNull();
    expect(cache.height(terrain, 0)).toBeNull();
    expect(cache.collision(terrain, 0)).toBeNull();
    expect(cache.collision(terrain, 0)).toBeNull();
    expect(image).toHaveBeenCalledTimes(2);
    scheduler.flushAll();
    expect(cache.height(terrain, 0)).toBe(cache.height(terrain, 0));
    expect(cache.collision(terrain, 0)).toBe(cache.collision(terrain, 0));
    expect(targets[0]?.pixels).toEqual(mapEditorHeightOverlayPixels(terrain, 0));
    expect(targets[1]?.pixels).toEqual(mapEditorCollisionOverlayPixels(terrain, 0));

    cache.dispose();
    expect(targets.slice(0, 2).every(({ disposed }) => disposed)).toBe(true);
    cache.height(terrain, 0);
    cache.collision(terrain, 1);
    expect(image).toHaveBeenCalledTimes(4);
  });

  it('bounds first 832x832 activation to scheduled chunks and cancels hidden work independently', () => {
    const terrain = terrainFixture(832, 832);
    const targets: TestTarget[] = [];
    const scheduler = new TestScheduler();
    const invalidate = vi.fn();
    const cache = new MapEditorOverlayCache(imageFactory(targets), invalidate, scheduler);
    const context = drawingContext();
    const draw = (height: boolean, collision: boolean) => drawActiveMapEditorOverlays(
      context, terrain, terrain,
      { minimumX: 0, minimumY: 0, maximumX: 832, maximumY: 832 },
      { x: 0, y: 0, width: 832, height: 832 }, { x: 0, y: 0, zoom: 0.04 },
      0, { height, collision }, cache,
    );

    draw(true, true);
    expect(targets).toHaveLength(2);
    expect(targets.every(({ writes }) => writes.length === 0)).toBe(true);
    expect(context.drawImage).not.toHaveBeenCalled();

    scheduler.flushOne();
    const writtenTiles = targets[0]!.writes.reduce(
      (total, write) => total + write.height * terrain.width, 0,
    );
    expect(writtenTiles).toBeLessThanOrEqual(MAP_EDITOR_OVERLAY_BUILD_CHUNK_TILES);
    expect(invalidate).not.toHaveBeenCalled();

    draw(false, true);
    expect(targets[0]?.disposed).toBe(true);
    expect(targets[1]?.disposed).toBe(false);
    scheduler.flushAll();
    expect(invalidate).toHaveBeenCalledTimes(1);
    draw(false, true);
    expect(context.drawImage).toHaveBeenCalledTimes(1);
  });
});
