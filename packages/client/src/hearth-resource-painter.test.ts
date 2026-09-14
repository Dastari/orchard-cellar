import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import { bootstrapContentRegistry, bootstrapContentRows, buildContentRegistry } from '@orchard/sim';
import type { LoadedAsset } from '@orchard/ui';
import type { WorldDepthItem } from '@orchard/engine/renderer';
import { enqueueGameplayResources } from './gameplay-painter-resources.js';

// Weather is unrelated to this contact regression. The actual resource producer,
// native asset anchors, frame selection and engine draw functions remain real.
vi.mock('@orchard/engine/weather-effects', async original => ({
  ...await original<typeof import('@orchard/engine/weather-effects')>(),
  treeSwayOffset: () => [0, 0],
}));
function nativeAsset(path: string, anchorOverride?: readonly [number, number]) {
  const source = JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as {
    size: [number, number]; anchor: [number, number]; sourcePath: string;
  };
  const asset = { image: { sourcePath: source.sourcePath }, anchor: anchorOverride ?? source.anchor,
    metadata: { animations: { base: [{ x: 0, y: 0, width: source.size[0], height: source.size[1], durationTicks: 1 }] } },
  } as unknown as LoadedAsset;
  return asset;
}
const tree = nativeAsset('../../assets/props/resource_cf_hearth_ashwood.sprite.json');
const stump = nativeAsset('../../assets/props/prop_cf_poi_stump.sprite.json', [8, 13]);
function render(depleted: boolean, growthStage = 3, registry = bootstrapContentRegistry()) {
  const resource = { id: 8_600_000_003n, kind: 'tree_ashwood', tileX: 10, tileY: 10,
    spaceId: 0, depleted, growthStage };
  const queued: WorldDepthItem[] = [], drawImage = vi.fn();
  const input = {
    debugEntitiesHidden: false, snapshot: {
      content: { registry }, crops: [], worldItems: [],
    },
    worldResourcesIncludingPersonalQuest: () => [resource], homesteadSurroundingResources: () => [],
    liveMapSuppressesGeneratedResource: () => false, seed: 1,
    visible: { left: 0, top: 0, right: 320, bottom: 320 }, windTrees: [], renderWeather: {}, weatherVisualTick: 0,
    enqueueWorldDepth: (_x: number, _y: number, item: WorldDepthItem) => queued.push(item),
    context: { drawImage, save: vi.fn(), restore: vi.fn() }, art: { hearthResources: { tree_ashwood: tree, tree_ashwood_stump: stump } },
    cameraX: 7, cameraY: 9, scale: 2, treeShakeRemaining: new Map(), effectPhase: 0,
    drawSouthFacingReceiver: (_x: number, _y: number, draw: () => void) => draw(),
  };
  enqueueGameplayResources(input as unknown as Parameters<typeof enqueueGameplayResources>[0]);
  if (queued.length === 0) return [];
  expect(queued).toHaveLength(1);
  expect(queued[0]).toMatchObject({ footY: 176, tie: 'resource:8600000003' });
  queued[0]!.draw();
  expect(drawImage).toHaveBeenCalledOnce();
  return drawImage.mock.calls[0]!;
}
it('keeps actual producer full ashwood and depleted stump opaque roots on the same world contact', () => {
  const full = render(false), cut = render(true);
  expect(full[0]).toBe(tree.image); expect(cut[0]).toBe(stump.image);
  expect(full.slice(1, 5)).toEqual([0, 0, 48, 64]);
  expect(cut.slice(1, 5)).toEqual([0, 0, 16, 16]);
  expect(full.slice(5, 7)).toEqual([(168 - 7 - 25) * 2, (176 - 9 - 52) * 2]);
  expect(cut.slice(5, 7)).toEqual([(168 - 7 - 8) * 2, (176 - 9 - 13) * 2]);
  // Measured native opaque root rows, not the lower translucent shadow pixels.
  expect(Number(full[6]) + 52 * 2).toBe((176 - 9) * 2);
  expect(Number(cut[6]) + 13 * 2).toBe((176 - 9) * 2);
});
it('keeps defensive immature ashwood rendering on that same cut-stump contact', () => {
  for (const stage of [1, 2]) {
    const draw = render(false, stage);
    expect(draw[0]).toBe(stump.image);
    expect(Number(draw[6]) + 13 * 2).toBe((176 - 9) * 2);
  }
});
it('renders through a renamed active definition and fails neutral when it is retired or missing', () => {
  const rows = bootstrapContentRows();
  const original = rows.find(({ id }) => id === 'resource:tree_ashwood')!;
  const payload = JSON.parse(original.json as string) as Record<string, unknown>;
  const remaining = rows.filter(({ id }) => id !== original.id);
  const renamed = { ...payload, id: 'resource:ember_tree_v2' };
  const active = buildContentRegistry([
    ...remaining,
    { id: 'resource:ember_tree_v2', kind: 'resource', slug: 'ember_tree_v2', json: renamed },
  ]).registry;
  expect(render(false, 3, active)[0]).toBe(tree.image);
  const retired = { ...renamed, retired: true };
  const inactive = buildContentRegistry([
    ...remaining,
    { id: 'resource:ember_tree_v2', kind: 'resource', slug: 'ember_tree_v2', json: retired },
  ]).registry;
  expect(render(false, 3, inactive)).toEqual([]);
  expect(render(false, 3, buildContentRegistry(remaining).registry)).toEqual([]);
});
