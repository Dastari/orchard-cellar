import { describe, expect, it, vi } from 'vitest';
import type { WorldDepthItem } from '@orchard/engine/renderer';
import { enqueueGameplayResources } from './gameplay-painter-resources.js';

const draws = vi.hoisted(() => ({ stump: vi.fn() }));
vi.mock('@orchard/engine/overworld-art', async importOriginal => ({
  ...await importOriginal<typeof import('@orchard/engine/overworld-art')>(), drawOverworldStump: draws.stump,
}));
vi.mock('@orchard/engine/weather-effects', () => ({ treeSwayOffset: () => [0, 0] }));
type Inputs = Parameters<typeof enqueueGameplayResources>[0];

describe('resource producer retained draw state', () => {
  it('updates replacement rows, fractional camera, art and depth, then retires hidden entities', () => {
    const queue: WorldDepthItem[] = [], context = {} as CanvasRenderingContext2D;
    let row = { id: 1n, kind: 'tree', tileX: 1, tileY: 2, depleted: true, growthStage: 3 };
    const input = { terrain: { version: 1 }, context, snapshot: { crops: [], worldItems: [] },
      worldResourcesIncludingPersonalQuest: () => [row], homesteadSurroundingResources: () => [],
      liveMapSuppressesGeneratedResource: () => false, visible: { left: -1000, right: 1000, top: -1000, bottom: 1000 },
      windTrees: [], art: { generation: 1 }, cameraX: 0.25, cameraY: 0.75, scale: 1,
      treeShakeRemaining: new Map(), enqueueWorldDepth: (_x: number, _y: number, item: WorldDepthItem) => queue.push(item),
    } as unknown as Inputs;
    enqueueGameplayResources(input);
    const first = queue[0]!; first.draw();
    for (let frame = 1; frame <= 600; frame++) {
      queue.length = 0; row = { ...row, tileX: frame % 10, tileY: frame % 7 };
      enqueueGameplayResources({ ...input, cameraX: frame + 0.25, cameraY: frame + 0.75, art: { generation: frame } as unknown as Inputs['art'] });
      expect(queue[0]).toBe(first); expect(queue[0]!.footY).toBe((row.tileY + 1) * 16); queue[0]!.draw();
    }
    expect(draws.stump).toHaveBeenLastCalledWith(context, { generation: 600 }, 8, 96, 600.25, 600.75, 1, 'tree', expect.any(String));
    for (let frame = 0; frame < 3; frame++) enqueueGameplayResources({ ...input, debugEntitiesHidden: true });
    queue.length = 0; enqueueGameplayResources(input); expect(queue[0]).not.toBe(first);
  });
});
