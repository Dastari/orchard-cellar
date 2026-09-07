import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorldDepthItem } from '@orchard/engine/renderer';
import { enqueueGameplayResources } from './gameplay-painter-resources.js';
const draws = vi.hoisted(() => ({ rock: vi.fn(), ore: vi.fn() }));
vi.mock('@orchard/engine/overworld-art', async original => ({
  ...await original<typeof import('@orchard/engine/overworld-art')>(), drawOverworldPoiDecoration: draws.rock, drawOverworldOreNode: draws.ore,
}));
vi.mock('@orchard/engine/weather-effects', () => ({ treeSwayOffset: () => [0, 0] }));
vi.mock('@orchard/sim', async original => ({
  ...await original<typeof import('@orchard/sim')>(), isBreakableRockKind: (kind: string) => kind === 'rock', isMineableOreKind: (kind: string) => kind === 'ore',
}));
afterEach(() => vi.clearAllMocks());

describe('retained rock/ore receiver callbacks', () => {
  it('retains each callback and samples shake before receiver entry across 600 row replacements', () => {
    const queue: WorldDepthItem[] = [], callbacks: Array<() => void> = [];
    let row = { id: 1n, kind: 'rock', tileX: 2, tileY: 3, depleted: false, miningClass: 'a', spaceId: 1, richness: 2 };
    const input = { terrain: { version: 1 }, context: {} as CanvasRenderingContext2D, snapshot: { crops: [], worldItems: [] },
      worldResourcesIncludingPersonalQuest: () => [row], homesteadSurroundingResources: () => [],
      liveMapSuppressesGeneratedResource: () => false, visible: { left: -1000, right: 100000, top: -1000, bottom: 100000 },
      windTrees: [], art: { generation: 0 }, cameraX: 0, cameraY: .5, scale: 1, effectPhase: 0,
      treeShakeRemaining: new Map([[1n, 1]]), miningClassFromWire: (value: string, space: number) => value + space,
      enqueueWorldDepth: (_x: number, _y: number, item: WorldDepthItem) => queue.push(item),
      drawSouthFacingReceiver: (_x: number, _y: number, draw: () => void) => { callbacks.push(draw); input.treeShakeRemaining.clear(); draw(); draw(); },
    };
    let first: WorldDepthItem | undefined; const kindCallbacks = new Map<string, () => void>();
    for (let frame = 0; frame <= 600; frame++) {
      row = { ...row, kind: frame % 2 ? 'ore' : 'rock', tileX: frame, richness: frame };
      input.art = { generation: frame }; input.cameraX = frame; input.effectPhase = frame % 4;
      input.treeShakeRemaining.set(1n, 1); queue.length = callbacks.length = 0;
      enqueueGameplayResources(input as unknown as Parameters<typeof enqueueGameplayResources>[0]);
      first ??= queue[0]; expect(queue[0]).toBe(first); first!.draw();
      const prior = kindCallbacks.get(row.kind); if (prior) expect(callbacks[0]).toBe(prior); else kindCallbacks.set(row.kind, callbacks[0]!);
      const x = frame * 16 + 8 + (frame % 4 < 2 ? -1 : 1);
      if (row.kind === 'rock') expect(draws.rock).toHaveBeenLastCalledWith(input.context, input.art, 'poi_rock_small', x, 64, frame, .5, 1);
      else expect(draws.ore).toHaveBeenLastCalledWith(input.context, input.art, 'ore', x, 64, frame, .5, 1, 'a1', frame);
    }
    expect(new Set(kindCallbacks.values()).size).toBe(2);
    row = { ...row, depleted: true }; queue.length = callbacks.length = 0;
    enqueueGameplayResources(input as unknown as Parameters<typeof enqueueGameplayResources>[0]); queue[0]!.draw(); expect(callbacks).toHaveLength(0);
  });
});
