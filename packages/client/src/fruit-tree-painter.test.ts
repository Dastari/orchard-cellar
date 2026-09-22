import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { bootstrapContentRegistry, runtimeResourceDefinition } from '@orchard/sim';
import type { LoadedAsset } from '@orchard/ui';
import type { WorldDepthItem } from '@orchard/engine/renderer';
import { authoredResourceVisual, type OverworldArt } from '@orchard/engine/overworld-art';
import { enqueueGameplayResources } from './gameplay-painter-resources.js';
import { resourceVisualState } from './resource-visual-state.js';

const weather = vi.hoisted(() => ({ sway: [0, 0] }));
vi.mock('@orchard/engine/weather-effects', async original => ({
  ...await original<typeof import('@orchard/engine/weather-effects')>(),
  treeSwayOffset: () => weather.sway,
}));
function nativeAsset(name: string): LoadedAsset {
  const source = JSON.parse(readFileSync(new URL(`../../assets/trees/${name}.sprite.json`, import.meta.url), 'utf8'));
  return { image: { name }, anchor: source.anchor,
    metadata: { animations: { base: [{ x: 0, y: 0, width: source.size[0], height: source.size[1], durationTicks: 1 }] } },
  } as unknown as LoadedAsset;
}
const fruits = ['apple', 'pear', 'peach', 'cherry'] as const;
const art = {
  fruitTrees: Object.fromEntries(fruits.map(fruit => [`tree_${fruit}`, nativeAsset(`tree_cf_${fruit}_fruiting`)])),
  treeMature: nativeAsset('tree_cf_fruit_mature'),
  treeSapling: nativeAsset('tree_cf_fruit_small'), treeYoung: nativeAsset('tree_cf_fruit_medium'),
  treeFruitStump: nativeAsset('tree_cf_fruit_stump'),
  treeFruitStumpSmall: nativeAsset('tree_cf_fruit_stump_small'),
  treeFruitStumpMedium: nativeAsset('tree_cf_fruit_stump_medium'),
  treeOak: nativeAsset('tree_cf_oak_mature'),
  hearthResources: {}, poiDecorations: {}, natureDecorations: {},
};
const registry = bootstrapContentRegistry();
const ripe = { id: 1n, kind: 'tree_apple', tileX: 10, tileY: 10, spaceId: 0,
  depleted: false, growthStage: 3, fruitReadyAtTick: 0n };
type TestResource = Omit<typeof ripe, 'fruitReadyAtTick'> & { readonly fruitReadyAtTick?: bigint };
function render(resource: TestResource = ripe, tick = 10n, sway = [0, 0]) {
  weather.sway = sway;
  const queued: WorldDepthItem[] = [];
  const context = { drawImage: vi.fn(), save: vi.fn(), restore: vi.fn(), translate: vi.fn(), transform: vi.fn() };
  enqueueGameplayResources({
    debugEntitiesHidden: false, snapshot: { content: { registry }, crops: [], worldItems: [] },
    worldResourcesIncludingPersonalQuest: () => [resource], homesteadSurroundingResources: () => [],
    liveMapSuppressesGeneratedResource: () => false, seed: 1,
    visible: { left: 0, top: 0, right: 320, bottom: 320 }, windTrees: [], renderWeather: {}, weatherVisualTick: 0,
    enqueueWorldDepth: (_x: number, _y: number, item: WorldDepthItem) => queued.push(item),
    context, art, cameraX: 7, cameraY: 9, scale: 2, treeShakeRemaining: new Map(), effectPhase: 0,
    renderAuthorityTick: tick,
  } as unknown as Parameters<typeof enqueueGameplayResources>[0]);
  expect(queued).toHaveLength(1);
  expect(queued[0]).toMatchObject({ footY: 176, tie: 'resource:1' });
  queued[0]!.draw();
  expect(context.drawImage).toHaveBeenCalledOnce();
  return context;
}
describe('authoritative fruit tree rendering', () => {
  it.each(fruits)('removes %s after picking, including reconnect snapshots, and restores at expiry', fruit => {
    const resource = { ...ripe, kind: `tree_${fruit}` };
    const picked = { ...resource, fruitReadyAtTick: 20n };
    expect(render(resource).drawImage.mock.calls[0]![0]).toBe(art.fruitTrees[resource.kind]!.image);
    for (const tick of [10n, 19n]) {
      const draw = render(picked, tick).drawImage.mock.calls[0]!;
      expect(draw[0]).toBe(art.treeMature.image);
      expect(draw.slice(1, 5)).toEqual([0, 0, 48, 64]);
      expect(draw.slice(5)).toEqual([(168 - 7 - 24) * 2, (176 - 9 - 53) * 2, 96, 128]);
    }
    for (const tick of [20n, 21n]) expect(render(picked, tick).drawImage.mock.calls[0]![0])
      .toBe(art.fruitTrees[resource.kind]!.image);
    const definition = runtimeResourceDefinition(registry, picked)!;
    const visual = authoredResourceVisual(art as unknown as OverworldArt, definition.visual, resourceVisualState(picked, definition, 19n));
    expect(visual?.asset).toBe(art.treeMature);
  });
  it('preserves legacy ripe snapshots and non-fruit trees', () => {
    const legacy: Omit<typeof ripe, 'fruitReadyAtTick'> & { fruitReadyAtTick?: bigint } = { ...ripe };
    delete legacy.fruitReadyAtTick;
    expect(render(legacy).drawImage.mock.calls[0]![0]).toBe(art.fruitTrees.tree_apple!.image);
    expect(render({ ...ripe, kind: 'tree_oak', fruitReadyAtTick: 20n }).drawImage.mock.calls[0]![0]).toBe(art.treeOak.image);
  });
  it('preserves immature trees and chopped stumps during the fruit cooldown', () => {
    const stages = [art.treeSapling, art.treeYoung, art.treeMature];
    const stumps = [art.treeFruitStumpSmall, art.treeFruitStumpMedium, art.treeFruitStump];
    for (let growthStage = 1; growthStage <= 3; growthStage++) {
      const resource = { ...ripe, fruitReadyAtTick: 20n, growthStage };
      expect(render(resource).drawImage.mock.calls[0]![0]).toBe(stages[growthStage - 1]!.image);
      expect(render({ ...resource, depleted: true }).drawImage.mock.calls[0]![0]).toBe(stumps[growthStage - 1]!.image);
    }
  });
  it('keeps the foot anchored and the same single-draw sway when fruit is absent', () => {
    const full = render(ripe, 10n, [2, 1]);
    const empty = render({ ...ripe, fruitReadyAtTick: 20n }, 10n, [2, 1]);
    expect(empty.transform.mock.calls).toEqual(full.transform.mock.calls);
    expect(empty.translate.mock.calls).toEqual(full.translate.mock.calls);
    expect(empty.transform).toHaveBeenCalledOnce();
    const a = full.drawImage.mock.calls[0]!, b = empty.drawImage.mock.calls[0]!;
    expect(Number(a[5]) + 16 * 2).toBe(Number(b[5]) + 24 * 2);
    expect(a[6]).toBe(b[6]);
  });
  it('retains unrelated authored mature art when no matching fruitless sprite exists', () => {
    expect(authoredResourceVisual(art as unknown as OverworldArt, registry.resources.get('resource:tree_oak')!.visual, 'fruitless')?.asset)
      .toBe(art.treeOak);
  });
});
