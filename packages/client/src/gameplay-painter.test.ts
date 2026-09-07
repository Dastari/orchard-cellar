import { describe, expect, it, vi } from 'vitest';
import type { TerrainArray } from '@orchard/engine/terrain';
import { WorldItemKind } from '@orchard/engine/painter-depth';
import { createGameplayPainter, sortGameplayWorldDepthItems } from './gameplay-painter.js';

function terrainFixture(): TerrainArray {
  return { spaceId: 0, seed: 1, version: 1, width: 4, height: 4,
    biomes: new Uint8Array(16).fill(4), blocked: Array<boolean>(16).fill(false),
    horseJumpableTerrain: Array<boolean>(16).fill(false), elevations: new Int16Array(16),
    dirtCliffRoles: new Uint8Array(16), dirtTerraces: new Uint8Array(16) };
}
describe('retained gameplay painter', () => {
  it('reuses queues for 600 moving frames without accumulating items or casters', () => {
    const context = { save: vi.fn(), restore: vi.fn(), translate: vi.fn() };
    const input = { terrain: terrainFixture(), context: context as unknown as CanvasRenderingContext2D,
      scale: 1, seasonalDynamic: true, projectionAt: () => 0,
      drawWorldReceiver: (_x: number, _y: number, draw: () => void) => draw() };
    const initial = createGameplayPainter(input);
    const draw = vi.fn();
    for (let frame = 0; frame < 600; frame++) {
      const painter = createGameplayPainter(input);
      expect(painter.worldDepthItems).toBe(initial.worldDepthItems);
      expect(painter.movingCelestialCasters).toBe(initial.movingCelestialCasters);
      expect(painter.worldDepthItems).toHaveLength(0);
      painter.enqueueWorldDepth(24, 32, { footY: 32, tie: 'tree:1', draw });
      painter.enqueueWorldDepth(24, 32, { footY: 32, tie: 'player:1', draw });
      const items = sortGameplayWorldDepthItems(painter.worldDepthItems);
      expect(items).toBe(initial.worldDepthItems);
      expect(items).toHaveLength(2);
      expect(items.map(item => item.kind)).toEqual([WorldItemKind.Player, WorldItemKind.Static]);
      expect(painter.movingCelestialCasters).toHaveLength(1);
      for (const item of items) item.draw();
    }
    expect(draw).toHaveBeenCalledTimes(1200);
    expect(context.save).toHaveBeenCalledTimes(1200);
    expect(context.restore).toHaveBeenCalledTimes(1200);
    const basic = createGameplayPainter({ ...input, seasonalDynamic: false });
    basic.enqueueWorldDepth(24, 32, { footY: 32, tie: 'player:1', draw });
    expect(basic.movingCelestialCasters).toHaveLength(0);
  });
  it('retains wrappers, updates fractional projection and receiver input, and preserves duplicate submissions', () => {
    const context = { save: vi.fn(), restore: vi.fn(), translate: vi.fn() };
    const receiver = vi.fn((_x: number, _y: number, draw: () => void) => draw());
    const input = { terrain: terrainFixture(), context: context as unknown as CanvasRenderingContext2D,
      scale: 1, seasonalDynamic: false, projectionAt: () => 0, drawWorldReceiver: receiver };
    const source = { footY: 32, tie: 'tree:1', draw: vi.fn() };
    const first = createGameplayPainter(input);
    first.enqueueWorldDepth(24, 32, source);
    const retained = first.worldDepthItems[0]!;
    sortGameplayWorldDepthItems(first.worldDepthItems);
    const next = createGameplayPainter({ ...input, scale: 2, projectionAt: () => 0.25 });
    next.enqueueWorldDepth(28, 32, source, 31, 'flat');
    next.enqueueWorldDepth(29, 32, source, 30, 'south');
    expect(next.worldDepthItems[0]).toBe(retained);
    expect(next.worldDepthItems[1]).not.toBe(retained);
    expect(next.worldDepthItems.map(item => item.footY)).toEqual([31.75, 31.75]);
    sortGameplayWorldDepthItems(next.worldDepthItems);
    for (const item of next.worldDepthItems) item.draw();
    expect(context.translate).toHaveBeenCalledWith(0, -0.5);
    expect(receiver).toHaveBeenNthCalledWith(1, 28, 31, source.draw, 'flat');
    expect(receiver).toHaveBeenNthCalledWith(2, 29, 30, source.draw, 'south');
    expect(source.draw).toHaveBeenCalledTimes(2);
    const changed = createGameplayPainter({ ...input, terrain: terrainFixture() });
    changed.enqueueWorldDepth(24, 32, source);
    expect(changed.worldDepthItems[0]).not.toBe(retained);
  });

});
