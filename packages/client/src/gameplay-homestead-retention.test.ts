import { describe, expect, it, vi } from 'vitest';
import type { WorldDepthItem } from '@orchard/engine/renderer';
import { enqueueGameplayDecorations, type GameplayDecorationInputs } from './gameplay-painter-decorations.js';

const draw = vi.hoisted(() => vi.fn());
vi.mock('@orchard/engine/overworld-art', async original => ({
  ...await original<typeof import('@orchard/engine/overworld-art')>(), drawOverworldPoiDecoration: draw,
}));

describe('committed homestead terrain contact', () => {
  it('retains the command while preserving the ground anchor, tent entrance sort line and updated rows', () => {
    const queue: Array<{ x: number; y: number; item: WorldDepthItem }> = [];
    const context = {} as CanvasRenderingContext2D;
    const snapshot = { liveMapDocument: null, homesteads: [{ spaceId: 7, overworldTileX: 1, overworldTileY: 2 }] };
    const input = { terrain: { version: 1 }, context, snapshot,
      activeSpaceDefinition: { spaceId: 0, generator: 'survival' },
      topsideDecorations: () => [], visible: { left: -1000, right: 1000, top: -1000, bottom: 1000 },
      art: {}, cameraX: 0.25, cameraY: 0.75, scale: 2,
      enqueueWorldDepth: (x: number, y: number, item: WorldDepthItem) => queue.push({ x, y, item }),
    } as unknown as GameplayDecorationInputs;
    enqueueGameplayDecorations(input);
    const first = queue[0]!;
    expect([first.x, first.y, first.item.footY, first.item.tie]).toEqual([24, 48, 32, 'homestead:7']);
    first.item.draw();
    expect(draw).toHaveBeenLastCalledWith(context, {}, 'homestead_tent_marker', 24, 48, 0.25, 0.75, 2);
    snapshot.homesteads = [{ spaceId: 7, overworldTileX: 3, overworldTileY: 4 }];
    queue.length = 0; enqueueGameplayDecorations(input);
    const next = queue[0]!;
    expect(next.item).toBe(first.item);
    expect([next.x, next.y, next.item.footY]).toEqual([56, 80, 64]);
    next.item.draw();
    expect(draw).toHaveBeenLastCalledWith(context, {}, 'homestead_tent_marker', 56, 80, 0.25, 0.75, 2);
  });
});
